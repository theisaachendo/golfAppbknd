import { Router } from 'express';
import {
  createGame,
  findGameByCode,
  getGameById,
  addPlayerToGame,
  startGame,
  setHoleWinner,
  endGame,
  getLeaderboard,
  getResults,
  getUserById,
  updateUserBalance,
} from '../data/store.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// All game routes require auth
router.use(requireAuth);

// POST /games — body: { name, stakePerHole }
router.post('/', (req, res) => {
  const { name, stakePerHole } = req.body || {};
  const game = createGame({
    name: name || 'Skins Game',
    stakePerHole: stakePerHole ?? 1,
    createdByUserId: req.user.id,
  });
  res.status(201).json({
    id: game.id,
    code: game.code,
    name: game.name,
    stakePerHole: game.stakePerHole,
    status: game.status,
  });
});

// POST /games/join — body: { code }
router.post('/join', (req, res) => {
  const { code } = req.body || {};
  if (!code) {
    return res.status(400).json({ error: 'Bad request', message: 'code required' });
  }
  const game = findGameByCode(code);
  if (!game) {
    return res.status(404).json({ error: 'Not found', message: 'Invalid game code' });
  }
  const updated = addPlayerToGame(game.id, req.user.id);
  if (!updated) {
    return res.status(400).json({ error: 'Bad request', message: 'Cannot join this game' });
  }
  res.json({
    gameId: game.id,
    id: game.id,
    code: game.code,
    name: game.name,
    stakePerHole: game.stakePerHole,
  });
});

// GET /games/:gameId — lobby or match state
router.get('/:gameId', (req, res) => {
  const { gameId } = req.params;
  const game = getGameById(gameId);
  if (!game) {
    return res.status(404).json({ error: 'Not found', message: 'Game not found' });
  }
  if (!game.playerIds.includes(req.user.id)) {
    return res.status(403).json({ error: 'Forbidden', message: 'Not a player in this game' });
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
  };
  if (game.status === 'in_progress' || game.status === 'completed') {
    response.leaderboard = getLeaderboard(game);
  }
  res.json(response);
});

// POST /games/:gameId/start
router.post('/:gameId/start', (req, res) => {
  const { gameId } = req.params;
  const game = getGameById(gameId);
  if (!game) {
    return res.status(404).json({ error: 'Not found', message: 'Game not found' });
  }
  if (!game.playerIds.includes(req.user.id)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const updated = startGame(gameId);
  if (!updated) {
    return res.status(400).json({ error: 'Bad request', message: 'Game cannot be started' });
  }
  res.json({
    id: updated.id,
    status: updated.status,
    currentHole: updated.currentHole,
    holes: updated.holes,
  });
});

// PATCH /games/:gameId/holes/:holeNumber — body: { winnerId }
// POST /games/:gameId/holes — body: { holeNumber, winnerId } (alternative)
router.patch('/:gameId/holes/:holeNumber', (req, res) => {
  const { gameId, holeNumber } = req.params;
  const holeNum = parseInt(holeNumber, 10);
  const { winnerId } = req.body || {};
  if (!winnerId || isNaN(holeNum)) {
    return res.status(400).json({ error: 'Bad request', message: 'winnerId and holeNumber required' });
  }
  const game = getGameById(gameId);
  if (!game || !game.playerIds.includes(req.user.id)) {
    return res.status(404).json({ error: 'Not found' });
  }
  if (!game.playerIds.includes(winnerId)) {
    return res.status(400).json({ error: 'Bad request', message: 'winnerId must be a player' });
  }
  const updated = setHoleWinner(gameId, holeNum, winnerId);
  if (!updated) {
    return res.status(400).json({ error: 'Bad request', message: 'Cannot set hole winner' });
  }
  res.json({
    holes: updated.holes,
    currentHole: updated.currentHole,
    leaderboard: getLeaderboard(updated),
  });
});

router.post('/:gameId/holes', (req, res) => {
  const { gameId } = req.params;
  const { holeNumber, winnerId } = req.body || {};
  const holeNum = parseInt(holeNumber, 10);
  if (!winnerId || isNaN(holeNum)) {
    return res.status(400).json({ error: 'Bad request', message: 'holeNumber and winnerId required' });
  }
  const game = getGameById(gameId);
  if (!game || !game.playerIds.includes(req.user.id)) {
    return res.status(404).json({ error: 'Not found' });
  }
  if (!game.playerIds.includes(winnerId)) {
    return res.status(400).json({ error: 'Bad request', message: 'winnerId must be a player' });
  }
  const updated = setHoleWinner(gameId, holeNum, winnerId);
  if (!updated) {
    return res.status(400).json({ error: 'Bad request', message: 'Cannot set hole winner' });
  }
  res.json({
    holes: updated.holes,
    currentHole: updated.currentHole,
    leaderboard: getLeaderboard(updated),
  });
});

// POST /games/:gameId/end
router.post('/:gameId/end', (req, res) => {
  const { gameId } = req.params;
  const game = getGameById(gameId);
  if (!game || !game.playerIds.includes(req.user.id)) {
    return res.status(404).json({ error: 'Not found' });
  }
  const updated = endGame(gameId);
  if (!updated) {
    return res.status(400).json({ error: 'Bad request', message: 'Game cannot be ended' });
  }
  // Apply payouts to user balances
  const results = getResults(updated);
  results.forEach((r) => {
    if (r.payout !== 0) updateUserBalance(r.playerId, r.payout);
  });
  res.json({
    id: updated.id,
    status: updated.status,
    completedAt: updated.completedAt,
  });
});

// GET /games/:gameId/results
router.get('/:gameId/results', (req, res) => {
  const { gameId } = req.params;
  const game = getGameById(gameId);
  if (!game) {
    return res.status(404).json({ error: 'Not found', message: 'Game not found' });
  }
  if (!game.playerIds.includes(req.user.id)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const results = getResults(game);
  res.json(results);
});

export default router;
