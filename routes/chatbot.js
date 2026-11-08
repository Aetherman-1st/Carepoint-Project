const express = require('express');
const pool = require('../db');

const router = express.Router();

const CHATBOT_API_URL = (process.env.CHATBOT_API_URL || '').trim();
const CHATBOT_API_KEY = (process.env.CHATBOT_API_KEY || '').trim();
const CHATBOT_MODEL = (process.env.CHATBOT_MODEL || '').trim();
const TIDIO_PUBLIC_KEY = (process.env.TIDIO_PUBLIC_KEY || '').trim();
const LUNA_EMBED_URL = (process.env.LUNA_EMBED_URL || '').trim();

const DEFAULT_SUGGESTIONS = [
  'How do I book an appointment?',
  'Show me the clinics',
  'How do online Zoom visits work?',
  'I need to cancel my appointment'
];

function normalize(text) {
  return String(text || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function firstName(user) {
  return (user && user.first_name) ? user.first_name : 'there';
}

async function loadContext(req) {
  const context = {
    clinics: [],
    upcoming: [],
    user: req.user || null
  };

  try {
    const clinics = await pool.query(
      'SELECT id, name, specialty, city FROM clinics ORDER BY name'
    );
    context.clinics = clinics.rows;
  } catch (err) {
    context.clinics = [];
  }

  if (req.user) {
    try {
      const upcoming = await pool.query(
        `SELECT
           a.id,
           to_char(a.appointment_date, 'YYYY-MM-DD') AS appointment_date,
           a.appointment_time,
           a.status,
           a.visit_type,
           a.zoom_join_url,
           c.name AS clinic_name,
           COALESCE(d.name, 'Clinic visit') AS doctor_name
         FROM appointments a
         JOIN clinics c ON c.id = a.clinic_id
         LEFT JOIN doctors d ON d.id = a.doctor_id
         WHERE a.user_id = $1
           AND a.status IN ('Pending', 'Confirmed')
           AND a.appointment_date >= CURRENT_DATE
         ORDER BY a.appointment_date, a.appointment_time
         LIMIT 3`,
        [req.user.id]
      );
      context.upcoming = upcoming.rows;
    } catch (err) {
      context.upcoming = [];
    }
  }

  return context;
}

function clinicLine(clinics) {
  return clinics.map((clinic) => clinic.name).join(', ');
}

function formatDate(iso) {
  if (!iso) return '';
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  });
}

function formatTime(value) {
  if (!value) return '';
  const [hour, minute] = value.split(':').map(Number);
  return new Date(2000, 0, 1, hour, minute).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit'
  });
}

function localReply(message, context) {
  const text = normalize(message);
  const user = context.user;
  const name = firstName(user);

  const has = (...words) => words.some((word) => text.includes(word));

  if (!text) {
    return {
      reply: `Hi ${name}! Ask me about booking, clinics, online visits, or your appointments.`,
      suggestions: DEFAULT_SUGGESTIONS
    };
  }

  if (has('hello', 'hi ', 'hey', 'good morning', 'good evening') && text.length < 24) {
    return {
      reply: `Hi ${name}! I can help you book an appointment, find a clinic, join an online visit, or check your upcoming appointments.`,
      suggestions: DEFAULT_SUGGESTIONS
    };
  }

  if (has('thank', 'thanks', 'appreciate')) {
    return {
      reply: 'Happy to help. Is there anything else you would like to do?',
      suggestions: DEFAULT_SUGGESTIONS
    };
  }

  if (has('cancel')) {
    return {
      reply:
        'You can cancel an upcoming appointment from your portal. Open “My appointments”, find the visit, and choose “Cancel appointment”. Cancelling an online visit also removes its Zoom meeting.',
      action: { label: 'Open my appointments', href: '/patient#appointments' },
      suggestions: ['Show my upcoming appointments', 'How do online Zoom visits work?']
    };
  }

  if (has('zoom', 'online', 'video', 'meeting', 'virtual', 'remote')) {
    return {
      reply:
        'When you book, choose “Online (Zoom)” as the visit type. CarePoint creates a Zoom meeting automatically and the join link appears on your Meetings page. If Zoom is not connected yet, the meeting is saved and the link appears as soon as it is configured.',
      action: { label: 'View meetings', href: '/meetings' },
      suggestions: ['How do I book an appointment?', 'Show my upcoming appointments']
    };
  }

  if (has('book', 'appointment', 'schedule', 'visit', 'reserve')) {
    if (has('upcoming', 'my appointment', 'status', 'when is')) {
      if (!user) {
        return {
          reply: 'Please log in to see your appointments. After logging in I can show your upcoming visits.',
          action: { label: 'Log in', href: '/login?next=%2Fpatient' },
          suggestions: ['How do I book an appointment?', 'Show me the clinics']
        };
      }

      if (context.upcoming.length === 0) {
        return {
          reply: 'You do not have any upcoming appointments right now. Would you like to book one?',
          action: { label: 'Book an appointment', href: '/patient#booking' },
          suggestions: ['Show me the clinics', 'How do online Zoom visits work?']
        };
      }

      const list = context.upcoming
        .map(
          (appointment) =>
            `• ${appointment.clinic_name} — ${formatDate(appointment.appointment_date)} at ${formatTime(
              appointment.appointment_time
            )} (${appointment.status}${appointment.visit_type === 'online' ? ', online' : ''})`
        )
        .join('\n');

      return {
        reply: `Here are your upcoming appointments:\n${list}`,
        action: { label: 'Open my appointments', href: '/patient#appointments' },
        suggestions: ['How do online Zoom visits work?', 'I need to cancel my appointment']
      };
    }

    return {
      reply:
        'To book a visit, choose a clinic, a specialist if listed, then a date and time. You can pick “In person” or “Online (Zoom)” before submitting. Your request starts as Pending until the clinic confirms it.',
      action: { label: 'Book an appointment', href: '/patient#booking' },
      suggestions: ['Show me the clinics', 'How do online Zoom visits work?']
    };
  }

  if (has('upcoming', 'my appointment', 'my visit', 'status')) {
    if (!user) {
      return {
        reply: 'Please log in and I can tell you about your upcoming appointments.',
        action: { label: 'Log in', href: '/login?next=%2Fpatient' },
        suggestions: DEFAULT_SUGGESTIONS
      };
    }

    if (context.upcoming.length === 0) {
      return {
        reply: 'You have no upcoming appointments at the moment.',
        action: { label: 'Book an appointment', href: '/patient#booking' },
        suggestions: ['Show me the clinics', 'How do online Zoom visits work?']
      };
    }

    const next = context.upcoming[0];
    return {
      reply: `Your next visit is at ${next.clinic_name} on ${formatDate(next.appointment_date)} at ${formatTime(
        next.appointment_time
      )}. Current status: ${next.status}.`,
      action: { label: 'Open my appointments', href: '/patient#appointments' },
      suggestions: ['Show all my upcoming appointments', 'I need to cancel my appointment']
    };
  }

  if (has('clinic', 'doctor', 'specialist', 'where', 'location', 'branch')) {
    if (context.clinics.length === 0) {
      return {
        reply: 'Clinic information is unavailable right now. Please try again in a moment.',
        action: { label: 'See clinics', href: '/clinics' },
        suggestions: DEFAULT_SUGGESTIONS
      };
    }

    return {
      reply: `CarePoint currently has these clinics: ${clinicLine(context.clinics)}. You can browse details and book from the clinics page.`,
      action: { label: 'See clinics', href: '/clinics' },
      suggestions: ['How do I book an appointment?', 'How do online Zoom visits work?']
    };
  }

  if (has('hour', 'open', 'close', 'time', 'when')) {
    return {
      reply:
        'Clinic hours vary by location. The clinics page lists each clinic, and the contact page can connect you with the CarePoint team for exact opening times.',
      action: { label: 'Contact CarePoint', href: '/contact' },
      suggestions: ['Show me the clinics', 'How do I book an appointment?']
    };
  }

  if (has('contact', 'support', 'help', 'human', 'agent', 'email', 'phone', 'talk')) {
    return {
      reply:
        'You can reach the CarePoint team through the contact form. Messages go to the care team and you can receive a reply by email.',
      action: { label: 'Open contact form', href: '/contact' },
      suggestions: ['Show me the clinics', 'How do I book an appointment?']
    };
  }

  if (has('profile', 'medication', 'condition', 'age', 'health')) {
    return {
      reply:
        'You can update your care profile from the profile page. Keeping your age, conditions and medications current helps clinics prepare for your visit.',
      action: { label: 'Open my profile', href: '/profile' },
      suggestions: ['How do I book an appointment?', 'Show my upcoming appointments']
    };
  }

  if (has('meeting', 'link', 'join')) {
    return {
      reply:
        'Your online visit links live on the Meetings page. Open it to see each scheduled Zoom meeting, its time, and a Join button.',
      action: { label: 'View meetings', href: '/meetings' },
      suggestions: ['How do online Zoom visits work?', 'Show my upcoming appointments']
    };
  }

  return {
    reply:
      'I can help with booking appointments, finding a clinic, online Zoom visits, your upcoming appointments, or contacting the care team. What would you like to do?',
    suggestions: DEFAULT_SUGGESTIONS
  };
}

function buildSystemPrompt(context) {
  const clinics = context.clinics
    .map((clinic) => `- ${clinic.name}${clinic.specialty ? ` (${clinic.specialty})` : ''}${clinic.city ? `, ${clinic.city}` : ''}`)
    .join('\n');

  const upcoming = context.upcoming.length
    ? context.upcoming
        .map(
          (appointment) =>
            `- ${appointment.clinic_name} on ${appointment.appointment_date} at ${appointment.appointment_time} (${appointment.status}${appointment.visit_type === 'online' ? ', online' : ''})`
        )
        .join('\n')
    : '- None';

  return [
    'You are the CarePoint patient assistant. Be concise, friendly and helpful.',
    'Only discuss CarePoint features: booking appointments, clinics, online Zoom visits, meetings, profile and contact.',
    'Never invent medical advice. For medical emergencies, tell the patient to contact emergency services.',
    'Patient: ' + (context.user ? `${context.user.first_name || ''} ${context.user.last_name || ''}`.trim() || context.user.email : 'Guest (not logged in)'),
    'Clinics:',
    clinics || '- Unavailable',
    'Upcoming appointments:',
    upcoming,
    'Useful links: /patient#booking, /patient#appointments, /meetings, /clinics, /contact, /profile.'
  ].join('\n');
}

async function askExternalModel(message, history, context) {
  if (!CHATBOT_API_URL) return null;

  const messages = [
    { role: 'system', content: buildSystemPrompt(context) },
    ...history
      .filter((entry) => entry && (entry.role === 'user' || entry.role === 'assistant') && entry.content)
      .slice(-10)
      .map((entry) => ({ role: entry.role, content: String(entry.content).slice(0, 2000) })),
    { role: 'user', content: String(message).slice(0, 2000) }
  ];

  const isOpenAI = /api\.openai\.com/i.test(CHATBOT_API_URL);
  const requestBody = {
    model: CHATBOT_MODEL || undefined,
    messages
  };

  if (isOpenAI) {
    requestBody.max_completion_tokens = 400;
    if (/^gpt-6/i.test(CHATBOT_MODEL)) {
      requestBody.reasoning_effort = 'none';
    } else {
      requestBody.temperature = 0.4;
    }
  } else {
    requestBody.max_tokens = 400;
    requestBody.temperature = 0.4;
  }

  const response = await fetch(CHATBOT_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(CHATBOT_API_KEY ? { Authorization: `Bearer ${CHATBOT_API_KEY}` } : {})
    },
    body: JSON.stringify(requestBody)
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error?.message || payload.message || `Chatbot provider error (${response.status})`);
  }

  const content =
    payload.choices?.[0]?.message?.content ||
    payload.reply ||
    payload.output_text ||
    (typeof payload === 'string' ? payload : null);

  return content ? String(content).trim() : null;
}

router.get('/config', (req, res) => {
  const provider = TIDIO_PUBLIC_KEY
    ? 'tidio'
    : LUNA_EMBED_URL
      ? 'luna'
      : CHATBOT_API_URL
        ? 'external'
        : 'local';

  res.json({
    provider,
    tidioPublicKey: TIDIO_PUBLIC_KEY || null,
    lunaEmbedUrl: LUNA_EMBED_URL || null,
    externalConfigured: Boolean(CHATBOT_API_URL),
    externalModel: CHATBOT_MODEL || null
  });
});

router.post('/message', async (req, res) => {
  const message = String((req.body || {}).message || '').trim().slice(0, 1000);
  const history = Array.isArray((req.body || {}).history) ? req.body.history : [];

  if (!message) {
    return res.status(400).json({ message: 'Type a message first.' });
  }

  const context = await loadContext(req);
  const local = localReply(message, context);

  if (CHATBOT_API_URL) {
    try {
      const answer = await askExternalModel(message, history, context);
      if (answer) {
        return res.json({
          reply: answer,
          suggestions: local.suggestions,
          action: local.action || null,
          source: 'ai'
        });
      }
    } catch (err) {
      return res.json({
        reply: local.reply,
        suggestions: local.suggestions,
        action: local.action || null,
        source: 'local',
        fallback: true
      });
    }
  }

  res.json({
    reply: local.reply,
    suggestions: local.suggestions,
    action: local.action || null,
    source: 'local'
  });
});

module.exports = router;
