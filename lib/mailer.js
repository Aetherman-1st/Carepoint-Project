require('dotenv').config();
const nodemailer = require('nodemailer');

const transportMode = (process.env.EMAIL_TRANSPORT || 'console').toLowerCase();
const smtpConfigured = Boolean(
  process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS
);
const useSmtp = transportMode === 'smtp' && smtpConfigured;
const from = process.env.MAIL_FROM || 'CarePoint <no-reply@carepoint.clinic>';

let transporter = null;
if (useSmtp) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: String(process.env.SMTP_SECURE).toLowerCase() === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000
  });
}

if (useSmtp) {
  console.log(`Email transport: SMTP via ${process.env.SMTP_HOST}`);
  if (/resend\.dev/i.test(from)) {
    console.warn(
      'Resend test sender detected. Verify a domain at https://resend.com/domains and update MAIL_FROM to send to recipients other than the account owner.'
    );
  }
} else {
  console.log('Email transport: console (verification codes are printed to the server log)');
}

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function deliver({ to, subject, text, html }) {
  if (useSmtp) {
    await transporter.sendMail({ from, to, subject, text, html });
    return { delivered: true, mode: 'smtp' };
  }

  console.log('\n===== CarePoint email (development mode) =====');
  console.log(`To: ${to}`);
  console.log(`Subject: ${subject}`);
  console.log('');
  console.log(text);
  console.log('==============================================\n');

  return { delivered: false, mode: 'console' };
}

async function sendCodeEmail({ to, name, code, minutes, kind }) {
  const signup = kind === 'signup';
  const subject = signup ? 'Verify your CarePoint email' : 'Your CarePoint verification code';
  const action = signup ? 'finish creating your account' : 'finish logging in';
  const ignore = signup
    ? 'If you did not create a CarePoint account, you can ignore this email.'
    : 'If you did not try to log in, you can ignore this email.';

  const text = [
    `Hi ${name || 'there'},`,
    '',
    `Your CarePoint verification code is: ${code}`,
    '',
    `Use this code to ${action}. It expires in ${minutes} minutes.`,
    '',
    ignore,
    '',
    'CarePoint'
  ].join('\n');

  const html = `
    <div style="font-family:Segoe UI,Arial,sans-serif;background:#f7f7f8;padding:32px">
      <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;padding:32px">
        <div style="display:flex;align-items:center;gap:9px;font-size:18px;font-weight:700;color:#1f2328;margin-bottom:24px">
          <span style="display:inline-block;width:18px;height:18px;background:#d62828;clip-path:polygon(35% 0,65% 0,65% 35%,100% 35%,100% 65%,65% 65%,65% 100%,35% 100%,35% 65%,0 65%,0 35%,35% 35%)"></span>
          CarePoint
        </div>
        <h1 style="font-size:22px;color:#1f2328;margin:0 0 12px">${signup ? 'Verify your email' : 'Your verification code'}</h1>
        <p style="color:#6b7280;line-height:1.6;margin:0 0 22px">Hi ${escapeHtml(name || 'there')}, use the code below to ${action}.</p>
        <div style="font-size:34px;font-weight:800;letter-spacing:10px;color:#1f2328;background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:18px;text-align:center">${escapeHtml(code)}</div>
        <p style="color:#6b7280;font-size:13px;line-height:1.6;margin:20px 0 0">This code expires in ${minutes} minutes. ${ignore}</p>
      </div>
    </div>
  `;

  return deliver({ to, subject, text, html });
}

async function sendLoginCode({ to, name, code, minutes }) {
  return sendCodeEmail({ to, name, code, minutes, kind: 'login' });
}

async function sendSignupCode({ to, name, code, minutes }) {
  return sendCodeEmail({ to, name, code, minutes, kind: 'signup' });
}

async function sendContactReply({ to, name, subject, reply, original }) {
  const cleanSubject = subject || 'your message to CarePoint';
  const mailSubject = `Re: ${cleanSubject}`;
  const text = [
    `Hi ${name || 'there'},`,
    '',
    reply,
    '',
    '---',
    'Your original message:',
    original,
    '',
    'CarePoint'
  ].join('\n');

  const html = `
    <div style="font-family:Segoe UI,Arial,sans-serif;background:#f1f5f9;padding:32px">
      <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:18px;padding:32px">
        <div style="font-size:18px;font-weight:800;color:#0f766e;margin-bottom:20px">+ CarePoint</div>
        <h1 style="font-size:22px;color:#0f172a;margin:0 0 12px">Reply from our care team</h1>
        <p style="color:#475569;line-height:1.6;margin:0 0 18px">Hi ${escapeHtml(name || 'there')},</p>
        <div style="color:#0f172a;line-height:1.7;white-space:pre-wrap;margin-bottom:24px">${escapeHtml(reply)}</div>
        <div style="border-top:1px solid #e2e8f0;padding-top:16px;color:#64748b;font-size:13px;line-height:1.6;white-space:pre-wrap">${escapeHtml(original)}</div>
      </div>
    </div>
  `;

  return deliver({ to, subject: mailSubject, text, html });
}

module.exports = {
  sendLoginCode,
  sendSignupCode,
  sendContactReply,
  isEmailConfigured: useSmtp,
  transportMode: useSmtp ? 'smtp' : 'console'
};
