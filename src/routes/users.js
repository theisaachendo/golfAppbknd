import { Router } from 'express';
import {
  getUserById,
  getGamesForUser,
  getActiveGameForUser,
  getLeaderboard,
  updateUserBalance,
} from '../data/store.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.use(requireAuth);

// GET /users/me/active-game — current user's in-progress game (if any). For "return to game" after app restart.
router.get('/me/active-game', (req, res) => {
  const game = getActiveGameForUser(req.user.id);
  if (!game) {
    return res.json({ game: null });
  }
  const players = game.playerIds.map((id) => {
    const u = getUserById(id);
    return { id: u?.id, displayName: u?.displayName || u?.email || 'Player' };
  });
  const response = {
    id: game.id,
    code: game.code,
    name: game.name,
    stakePerHole: game.stakePerHole,
    status: game.status,
    players,
    currentHole: game.currentHole,
    holes: game.holes,
    leaderboard: getLeaderboard(game),
  };
  res.json({ game: response });
});

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

// POST /users/me/deposit — body: { amount }
// For testing / dev only. In production, credit balance only via Stripe (or other) webhook after real payment.
router.post('/me/deposit', (req, res) => {
  const amount = Number(req.body?.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ error: 'Bad request', message: 'Valid amount required' });
  }
  updateUserBalance(req.user.id, amount);
  res.json({ success: true, balance: req.user.balance ?? 0 });
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
