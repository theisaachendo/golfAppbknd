import nodemailer from 'nodemailer';

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  const url = process.env.SMTP_URL;
  if (url) {
    transporter = nodemailer.createTransport(url);
    return transporter;
  }
  const host = process.env.SMTP_HOST;
  if (!host) return null;
  transporter = nodemailer.createTransport({
    host,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || '' }
      : undefined,
  });
  return transporter;
}

/**
 * Send password reset email. Returns true if sent, false if email not configured (e.g. dev).
 * In dev with no SMTP, the caller should log the link instead.
 */
export async function sendPasswordResetEmail(toEmail, resetLink) {
  const transport = getTransporter();
  if (!transport) return false;
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@example.com';
  await transport.sendMail({
    from,
    to: toEmail,
    subject: 'Reset your password',
    text: `You requested a password reset. Open this link to set a new password (valid for 1 hour):\n\n${resetLink}\n\nIf you didn't request this, ignore this email.`,
    html: `<p>You requested a password reset.</p><p><a href="${resetLink}">Set a new password</a></p><p>Link valid for 1 hour. If you didn't request this, ignore this email.</p>`,
  });
  return true;
}
