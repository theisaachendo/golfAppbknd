import { Router } from 'express';
import { createUser, findUserByEmail, getUserById } from '../data/store.js';
import { signToken } from '../middleware/auth.js';

const router = Router();

// POST /auth/login — body: { email, password }
router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Bad request', message: 'email and password required' });
  }
  const user = findUserByEmail(email);
  if (!user || user.password !== password) {
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
