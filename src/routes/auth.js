import { Router } from 'express';
import {
  createUser,
  findUserByEmail,
  createPasswordResetToken,
  getAndConsumePasswordResetToken,
  updateUserPassword,
} from '../data/store.js';
import { signToken } from '../middleware/auth.js';
import { hashPassword, comparePassword } from '../lib/password.js';
import { sendPasswordResetEmail } from '../lib/email.js';

const router = Router();

// POST /auth/register — body: { email, password, displayName? }
router.post('/register', async (req, res) => {
  const { email, password, displayName } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Bad request', message: 'email and password required' });
  }
  const trimmedEmail = String(email).trim().toLowerCase();
  if (!trimmedEmail) {
    return res.status(400).json({ error: 'Bad request', message: 'email required' });
  }
  if (String(password).length < 8) {
    return res.status(400).json({ error: 'Bad request', message: 'password must be at least 8 characters' });
  }
  if (findUserByEmail(trimmedEmail)) {
    return res.status(409).json({ error: 'Conflict', message: 'An account with this email already exists' });
  }
  try {
    const passwordHash = await hashPassword(password);
    const user = createUser({
      email: trimmedEmail,
      displayName: displayName ? String(displayName).trim() || undefined : undefined,
      passwordHash,
      isGuest: false,
    });
    const token = signToken({ userId: user.id });
    res.status(201).json({
      token,
      user: {
        id: user.id,
        displayName: user.displayName,
        email: user.email,
      },
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Internal error', message: 'Registration failed' });
  }
});

// POST /auth/login — body: { email, password }
router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Bad request', message: 'email and password required' });
  }
  const user = findUserByEmail(String(email).trim().toLowerCase());
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized', message: 'Invalid email or password' });
  }
  const match = await comparePassword(password, user.password);
  if (!match) {
    return res.status(401).json({ error: 'Unauthorized', message: 'Invalid email or password' });
  }
  const token = signToken({ userId: user.id });
  res.json({
    token,
    user: {
      id: user.id,
      displayName: user.displayName,
      email: user.email,
    },
  });
});

// POST /auth/forgot-password — body: { email }
// Always returns same message (don't leak whether email exists). Sends email via nodemailer when SMTP configured.
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body || {};
  const trimmedEmail = String(email || '').trim().toLowerCase();
  const message = "If an account exists with this email, we've sent a password reset link.";
  if (!trimmedEmail) {
    return res.json({ message });
  }
  const user = findUserByEmail(trimmedEmail);
  if (user && !user.isGuest) {
    const { token } = createPasswordResetToken(user.id);
    const baseUrl = process.env.RESET_PASSWORD_BASE_URL || 'https://yourapp.com';
    const resetLink = `${baseUrl.replace(/\/$/, '')}/reset-password?token=${token}`;
    const sent = await sendPasswordResetEmail(trimmedEmail, resetLink);
    if (!sent && process.env.NODE_ENV !== 'production') {
      console.log('[Dev] SMTP not configured. Password reset link:', resetLink);
    }
  }
  res.json({ message });
});

// POST /auth/reset-password — body: { token, newPassword }
router.post('/reset-password', async (req, res) => {
  const { token, newPassword } = req.body || {};
  if (!token || !newPassword) {
    return res.status(400).json({ error: 'Bad request', message: 'token and newPassword required' });
  }
  if (String(newPassword).length < 8) {
    return res.status(400).json({ error: 'Bad request', message: 'password must be at least 8 characters' });
  }
  const userId = getAndConsumePasswordResetToken(token);
  if (!userId) {
    return res.status(400).json({ error: 'Bad request', message: 'Invalid or expired reset link. Request a new one.' });
  }
  try {
    const passwordHash = await hashPassword(newPassword);
    updateUserPassword(userId, passwordHash);
    res.json({ message: 'Password updated. You can now sign in.' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ error: 'Internal error', message: 'Failed to update password' });
  }
});

// POST /auth/guest — optional body: { displayName }; returns token + user for guest
router.post('/guest', (req, res) => {
  const { displayName } = req.body || {};
  const user = createUser({ isGuest: true, displayName: displayName || undefined });
  const token = signToken({ userId: user.id });
  res.json({
    token,
    user: {
      id: user.id,
      displayName: user.displayName,
    },
  });
});

export default router;
