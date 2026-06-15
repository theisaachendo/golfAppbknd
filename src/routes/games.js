import { Router } from 'express';
import {
  createGame,
  findGameByCode,
  getGameById,
  addPlayerToGame,
  startGame,
  setHoleWinner,
  proposeHoleWinner,
  confirmHoleWinner,
  endGame,
  getLeaderboard,
  getResults,
  getSettlementsForGame,
} from '../data/store.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// All game routes require auth
router.use(requireAuth);

// POST /games — body: { name, stakePerHole }
router.post('/', async (req, res) => {
  const { name, stakePerHole } = req.body || {};
  const stake = stakePerHole == null ? 1 : Number(stakePerHole);
  if (!Number.isFinite(stake) || stake < 0) {
    return res.status(400).json({ error: 'Bad request', message: 'stakePerHole must be a non-negative number' });
  }
  const game = await createGame({
    name: typeof name === 'string' && name.trim() ? name.trim() : 'Skins Game',
    stakePerHole: stake,
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
router.post('/join', async (req, res) => {
  const { code } = req.body || {};
  if (!code) {
    return res.status(400).json({ error: 'Bad request', message: 'code required' });
  }
  const game = await findGameByCode(code);
  if (!game) {
    return res.status(404).json({ error: 'Not found', message: 'Invalid game code' });
  }
  if (game.status !== 'lobby') {
    return res.status(400).json({ error: 'Bad request', message: 'This game has already started' });
  }
  const updated = await addPlayerToGame(game.id, req.user.id);
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
router.get('/:gameId', async (req, res) => {
  const { gameId } = req.params;
  const game = await getGameById(gameId);
  if (!game) {
    return res.status(404).json({ error: 'Not found', message: 'Game not found' });
  }
  if (!game.playerIds.includes(req.user.id)) {
    return res.status(403).json({ error: 'Forbidden', message: 'Not a player in this game' });
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
  };
  if (game.status === 'in_progress' || game.status === 'completed') {
    response.leaderboard = getLeaderboard(game);
  }
  res.json(response);
});

// POST /games/:gameId/start
router.post('/:gameId/start', async (req, res) => {
  const { gameId } = req.params;
  const game = await getGameById(gameId);
  if (!game) {
    return res.status(404).json({ error: 'Not found', message: 'Game not found' });
  }
  if (!game.playerIds.includes(req.user.id)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const updated = await startGame(gameId);
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

// Shared handler for recording a hole winner (direct, trust-based).
async function handleSetWinner(req, res, gameId, holeNum, winnerId) {
  if (!winnerId || isNaN(holeNum)) {
    return res.status(400).json({ error: 'Bad request', message: 'winnerId and holeNumber required' });
  }
  const game = await getGameById(gameId);
  if (!game || !game.playerIds.includes(req.user.id)) {
    return res.status(404).json({ error: 'Not found' });
  }
  if (!game.playerIds.includes(winnerId)) {
    return res.status(400).json({ error: 'Bad request', message: 'winnerId must be a player' });
  }
  const updated = await setHoleWinner(gameId, holeNum, winnerId);
  if (!updated) {
    return res.status(400).json({ error: 'Bad request', message: 'Cannot set hole winner' });
  }
  res.json({
    holes: updated.holes,
    currentHole: updated.currentHole,
    leaderboard: getLeaderboard(updated),
  });
}

// PATCH /games/:gameId/holes/:holeNumber — body: { winnerId }
router.patch('/:gameId/holes/:holeNumber', async (req, res) => {
  const { gameId, holeNumber } = req.params;
  await handleSetWinner(req, res, gameId, parseInt(holeNumber, 10), (req.body || {}).winnerId);
});

// POST /games/:gameId/holes — body: { holeNumber, winnerId } (alternative)
router.post('/:gameId/holes', async (req, res) => {
  const { gameId } = req.params;
  const { holeNumber, winnerId } = req.body || {};
  await handleSetWinner(req, res, gameId, parseInt(holeNumber, 10), winnerId);
});

// --- Optional two-step winner confirmation (for less trusting groups) ---

// POST /games/:gameId/holes/:holeNumber/propose — body: { winnerId }
router.post('/:gameId/holes/:holeNumber/propose', async (req, res) => {
  const { gameId, holeNumber } = req.params;
  const holeNum = parseInt(holeNumber, 10);
  const { winnerId } = req.body || {};
  if (!winnerId || isNaN(holeNum)) {
    return res.status(400).json({ error: 'Bad request', message: 'winnerId and holeNumber required' });
  }
  const game = await getGameById(gameId);
  if (!game || !game.playerIds.includes(req.user.id)) {
    return res.status(404).json({ error: 'Not found' });
  }
  if (!game.playerIds.includes(winnerId)) {
    return res.status(400).json({ error: 'Bad request', message: 'winnerId must be a player' });
  }
  const updated = await proposeHoleWinner(gameId, holeNum, winnerId);
  if (!updated) {
    return res.status(400).json({ error: 'Bad request', message: 'Cannot propose hole winner' });
  }
  res.json({ holes: updated.holes, currentHole: updated.currentHole });
});

// POST /games/:gameId/holes/:holeNumber/confirm
router.post('/:gameId/holes/:holeNumber/confirm', async (req, res) => {
  const { gameId, holeNumber } = req.params;
  const holeNum = parseInt(holeNumber, 10);
  if (isNaN(holeNum)) {
    return res.status(400).json({ error: 'Bad request', message: 'holeNumber required' });
  }
  const game = await getGameById(gameId);
  if (!game || !game.playerIds.includes(req.user.id)) {
    return res.status(404).json({ error: 'Not found' });
  }
  const updated = await confirmHoleWinner(gameId, holeNum, req.user.id);
  if (!updated) {
    return res.status(400).json({ error: 'Bad request', message: 'Nothing to confirm for this hole' });
  }
  res.json({
    holes: updated.holes,
    currentHole: updated.currentHole,
    leaderboard: getLeaderboard(updated),
  });
});

// POST /games/:gameId/end
router.post('/:gameId/end', async (req, res) => {
  const { gameId } = req.params;
  const game = await getGameById(gameId);
  if (!game || !game.playerIds.includes(req.user.id)) {
    return res.status(404).json({ error: 'Not found' });
  }
  const updated = await endGame(gameId);
  if (!updated) {
    return res.status(400).json({ error: 'Bad request', message: 'Game cannot be ended' });
  }
  res.json({
    id: updated.id,
    status: updated.status,
    completedAt: updated.completedAt,
  });
});

// GET /games/:gameId/results
router.get('/:gameId/results', async (req, res) => {
  const { gameId } = req.params;
  const game = await getGameById(gameId);
  if (!game) {
    return res.status(404).json({ error: 'Not found', message: 'Game not found' });
  }
  if (!game.playerIds.includes(req.user.id)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  res.json(getResults(game));
});

// GET /games/:gameId/settlements — "who owes whom" for a completed game
router.get('/:gameId/settlements', async (req, res) => {
  const { gameId } = req.params;
  const game = await getGameById(gameId);
  if (!game) {
    return res.status(404).json({ error: 'Not found', message: 'Game not found' });
  }
  if (!game.playerIds.includes(req.user.id)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  res.json(await getSettlementsForGame(gameId, req.user.id));
});

export default router;
