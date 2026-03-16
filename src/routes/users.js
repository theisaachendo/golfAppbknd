import { Router } from 'express';
import { getUserById, getGamesForUser, updateUserBalance } from '../data/store.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.use(requireAuth);

// GET /users/me — current user (optional, for profile display)
router.get('/me', (req, res) => {
  const u = req.user;
  res.json({
    id: u.id,
    displayName: u.displayName,
    email: u.email,
    balance: u.balance ?? 0,
    isGuest: u.isGuest,
  });
});

// GET /users/me/balance
router.get('/me/balance', (req, res) => {
  res.json({ balance: req.user.balance ?? 0 });
});

// POST /users/me/withdraw — body: { amount }
router.post('/me/withdraw', (req, res) => {
  const amount = Number(req.body?.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ error: 'Bad request', message: 'Valid amount required' });
  }
  const balance = req.user.balance ?? 0;
  if (amount > balance) {
    return res.status(400).json({ error: 'Bad request', message: 'Insufficient balance' });
  }
  updateUserBalance(req.user.id, -amount);
  res.json({ success: true, balance: req.user.balance });
});

// GET /users/me/games — match history (past completed games)
router.get('/me/games', (req, res) => {
  const list = getGamesForUser(req.user.id);
  res.json(
    list.map((g) => ({
      id: g.id,
      code: g.code,
      name: g.name,
      date: g.completedAt,
      completedAt: g.completedAt,
      result: g.result,
      payout: g.payout,
      playerCount: g.playerCount,
    }))
  );
});

export default router;
