(function () {
  if (document.getElementById('cpChatWidget')) return;

  const history = [];
  let sending = false;
  let opened = false;

  const root = document.createElement('div');
  root.id = 'cpChatWidget';
  root.className = 'cp-chat-widget';
  root.innerHTML = `
    <section class="cp-chat-panel hidden" id="cpChatPanel" role="dialog" aria-modal="false" aria-label="CarePoint assistant">
      <header class="cp-chat-head">
        <div class="cp-chat-identity">
          <span class="cp-chat-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H7l-4 3v-6.2A8.5 8.5 0 0 1 12.5 3 8.5 8.5 0 0 1 21 11.5Z"></path>
              <path d="M8.5 10h7M8.5 13.5h4.5"></path>
            </svg>
          </span>
          <div>
            <strong>CarePoint assistant</strong>
            <span>Ask about visits, clinics or Zoom meetings</span>
          </div>
        </div>
        <button type="button" class="cp-chat-close" id="cpChatClose" aria-label="Close assistant">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
            <path d="m6 6 12 12M18 6 6 18"></path>
          </svg>
        </button>
      </header>
      <div class="cp-chat-messages" id="cpChatMessages" aria-live="polite"></div>
      <div class="cp-chat-suggestions" id="cpChatSuggestions"></div>
      <form class="cp-chat-form" id="cpChatForm">
        <input type="text" id="cpChatInput" placeholder="Type your question..." autocomplete="off" maxlength="1000" aria-label="Message">
        <button type="submit" id="cpChatSend" aria-label="Send message">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="m22 2-7 20-4-9-9-4Z"></path>
            <path d="M22 2 11 13"></path>
          </svg>
        </button>
      </form>
      <p class="cp-chat-note">Not for emergencies. Call emergency services if you need urgent help.</p>
    </section>
    <button type="button" class="cp-chat-toggle" id="cpChatToggle" aria-label="Open CarePoint assistant" aria-expanded="false">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H7l-4 3v-6.2A8.5 8.5 0 0 1 12.5 3 8.5 8.5 0 0 1 21 11.5Z"></path>
        <path d="M8.5 10h7M8.5 13.5h4.5"></path>
      </svg>
      <span class="cp-chat-toggle-label">Ask CarePoint</span>
    </button>
  `;

  document.body.appendChild(root);

  const panel = document.getElementById('cpChatPanel');
  const toggle = document.getElementById('cpChatToggle');
  const close = document.getElementById('cpChatClose');
  const messages = document.getElementById('cpChatMessages');
  const suggestions = document.getElementById('cpChatSuggestions');
  const form = document.getElementById('cpChatForm');
  const input = document.getElementById('cpChatInput');
  const send = document.getElementById('cpChatSend');

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function scrollToEnd() {
    messages.scrollTop = messages.scrollHeight;
  }

  function addMessage(role, content, options) {
    const settings = options || {};
    const bubble = document.createElement('div');
    bubble.className = `cp-chat-bubble ${role}`;
    bubble.innerHTML = `<div class="cp-chat-text">${esc(content).replace(/\n/g, '<br>')}</div>`;

    if (settings.action && settings.action.href) {
      const link = document.createElement('a');
      link.className = 'cp-chat-action';
      link.href = settings.action.href;
      link.textContent = settings.action.label || 'Open';
      bubble.appendChild(link);
    }

    messages.appendChild(bubble);
    scrollToEnd();
    return bubble;
  }

  function showTyping() {
    const bubble = document.createElement('div');
    bubble.className = 'cp-chat-bubble assistant cp-chat-typing';
    bubble.innerHTML = '<span></span><span></span><span></span>';
    messages.appendChild(bubble);
    scrollToEnd();
    return bubble;
  }

  function renderSuggestions(list) {
    suggestions.innerHTML = '';
    (Array.isArray(list) ? list : []).slice(0, 4).forEach(function (label) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'cp-chat-chip';
      chip.textContent = label;
      chip.addEventListener('click', function () {
        sendMessage(label);
      });
      suggestions.appendChild(chip);
    });
  }

  function openPanel() {
    panel.classList.remove('hidden');
    toggle.setAttribute('aria-expanded', 'true');
    root.classList.add('is-open');
    opened = true;
    if (!messages.dataset.greeted) {
      messages.dataset.greeted = 'true';
      addMessage(
        'assistant',
        'Hi! I am the CarePoint assistant. I can help you book a visit, find a clinic, join an online Zoom meeting, or check your appointments.'
      );
      renderSuggestions([
        'How do I book an appointment?',
        'Show me the clinics',
        'How do online Zoom visits work?',
        'Show my upcoming appointments'
      ]);
    }
    window.setTimeout(function () { input.focus(); }, 60);
  }

  function closePanel() {
    panel.classList.add('hidden');
    toggle.setAttribute('aria-expanded', 'false');
    root.classList.remove('is-open');
    toggle.focus();
  }

  async function sendMessage(raw) {
    const message = String(raw || '').trim();
    if (!message || sending) return;

    if (!opened) openPanel();

    sending = true;
    send.disabled = true;
    suggestions.innerHTML = '';
    addMessage('user', message);
    input.value = '';
    const typing = showTyping();

    try {
      const response = await fetch('/api/chatbot/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: message, history: history.slice(-10) })
      });
      const data = await response.json();

      history.push({ role: 'user', content: message });
      history.push({ role: 'assistant', content: data.reply || '' });

      typing.remove();
      addMessage('assistant', data.reply || 'Sorry, I could not answer that right now.', {
        action: data.action
      });
      renderSuggestions(data.suggestions);
    } catch (err) {
      typing.remove();
      addMessage(
        'assistant',
        'I could not reach the assistant just now. Please try again, or use the contact page to reach the care team.',
        { action: { label: 'Contact CarePoint', href: '/contact' } }
      );
    } finally {
      sending = false;
      send.disabled = false;
      input.focus();
    }
  }

  toggle.addEventListener('click', function () {
    if (panel.classList.contains('hidden')) {
      openPanel();
    } else {
      closePanel();
    }
  });

  close.addEventListener('click', closePanel);

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    sendMessage(input.value);
  });

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && !panel.classList.contains('hidden')) {
      closePanel();
    }
  });
})();
