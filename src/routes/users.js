import { Router } from 'express';
import {
  getGamesForUser,
  getActiveGameForUser,
  getLeaderboard,
  getBalance,
  markSettlementSettled,
  updateUserDisplayName,
  deleteUser,
} from '../data/store.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

const MONEY_ENABLED = process.env.MONEY_ENABLED === 'true';

router.use(requireAuth);

// GET /users/me/active-game — current user's in-progress game (if any). For "return to game" after app restart.
router.get('/me/active-game', async (req, res) => {
  const game = await getActiveGameForUser(req.user.id);
  if (!game) {
    return res.json({ game: null });
  }
  const response = {
    id: game.id,
    code: game.code,
    name: game.name,
    stakePerHole: game.stakePerHole,
    status: game.status,
    players: game.players,
    currentHole: game.currentHole,
    holes: game.holes,
    leaderboard: getLeaderboard(game),
  };
  res.json({ game: response });
});

// GET /users/me — current user (profile display)
router.get('/me', async (req, res) => {
  const u = req.user;
  const balance = await getBalance(u.id); // lifetime net standings (in dollars)
  res.json({
    id: u.id,
    displayName: u.displayName,
    email: u.email,
    balance, // "net standings" while money is off; real balance once money is on
    isGuest: u.isGuest,
  });
});

// PATCH /users/me — update profile (currently just displayName; works for guests too)
router.patch('/me', async (req, res) => {
  const raw = req.body?.displayName;
  if (typeof raw !== 'string' || !raw.trim()) {
    return res.status(400).json({ error: 'Bad request', message: 'displayName required' });
  }
  const displayName = raw.trim().slice(0, 40);
  const updated = await updateUserDisplayName(req.user.id, displayName);
  res.json({
    id: updated.id,
    displayName: updated.displayName,
    email: updated.email,
    isGuest: updated.isGuest,
  });
});

// DELETE /users/me — permanently delete the account and personal data (App Store requirement)
router.delete('/me', async (req, res) => {
  try {
    await deleteUser(req.user.id);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete account error:', err);
    res.status(500).json({ error: 'Internal error', message: 'Could not delete account' });
  }
});

// GET /users/me/balance — lifetime net standings (sum of ledger entries)
router.get('/me/balance', async (req, res) => {
  res.json({ balance: await getBalance(req.user.id) });
});

// POST /users/me/settlements/:id/settle — mark a "who owes whom" line settled (off-app)
// body: { settled?: boolean } (defaults to true)
router.post('/me/settlements/:id/settle', async (req, res) => {
  const { id } = req.params;
  const settled = req.body?.settled === undefined ? true : !!req.body.settled;
  const updated = await markSettlementSettled(id, req.user.id, settled);
  if (!updated) {
    return res.status(404).json({ error: 'Not found', message: 'Settlement not found or not yours' });
  }
  res.json({ id: updated.id, settled: updated.settled, settledAt: updated.settledAt });
});

// GET /users/me/games — match history (past completed games).
// Match history is a signed-up feature; guests don't get persistent history.
router.get('/me/games', async (req, res) => {
  if (req.user.isGuest) {
    return res.json([]);
  }
  const list = await getGamesForUser(req.user.id);
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

// --- Money features (disabled while MONEY_ENABLED=false) ---
// Kept so the real-money phase is a flag flip + processor integration, not a rewrite.

// POST /users/me/deposit — dev-only top-up (disabled when money is off)
router.post('/me/deposit', (req, res) => {
  if (!MONEY_ENABLED) {
    return res.status(403).json({ error: 'Disabled', message: 'Money features are not enabled' });
  }
  return res.status(501).json({ error: 'Not implemented', message: 'Deposits go through the payment processor' });
});

// POST /users/me/withdraw — disabled when money is off
router.post('/me/withdraw', (req, res) => {
  if (!MONEY_ENABLED) {
    return res.status(403).json({ error: 'Disabled', message: 'Money features are not enabled' });
  }
  return res.status(501).json({ error: 'Not implemented', message: 'Withdrawals go through the payment processor' });
});

export default router;
