import { Router } from 'express';
import {
  createGame,
  findGameByCode,
  getGameById,
  addPlayerToGame,
  startGame,
  setHoleResult,
  acceptHoleChange,
  rejectHoleChange,
  endGame,
  getLeaderboard,
  getResults,
  getSettlementsForGame,
} from '../data/store.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// All game routes require auth
router.use(requireAuth);

// POST /games — body: { name, stakePerHole, numHoles? (9|18) }
router.post('/', async (req, res) => {
  const { name, stakePerHole, numHoles } = req.body || {};
  const stake = stakePerHole == null ? 1 : Number(stakePerHole);
  if (!Number.isFinite(stake) || stake < 0) {
    return res.status(400).json({ error: 'Bad request', message: 'stakePerHole must be a non-negative number' });
  }
  const game = await createGame({
    name: typeof name === 'string' && name.trim() ? name.trim() : 'Skins Game',
    stakePerHole: stake,
    numHoles: Number(numHoles) === 9 ? 9 : 18,
    createdByUserId: req.user.id,
  });
  res.status(201).json({
    id: game.id,
    code: game.code,
    name: game.name,
    stakePerHole: game.stakePerHole,
    numHoles: game.numHoles,
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
    numHoles: game.numHoles,
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

const ERROR_STATUS = {
  not_in_progress: [400, 'Game is not in progress'],
  no_hole: [404, 'Hole not found'],
  bad_winner: [400, 'winnerId must be a player in this game'],
  no_result: [400, 'Provide a winnerId or set tied=true'],
  no_pending: [400, 'No pending change for this hole'],
  cannot_accept_own: [403, 'Another player must accept your change'],
  no_game: [404, 'Game not found'],
};

function sendResult(res, result) {
  if (result.error) {
    const [code, message] = ERROR_STATUS[result.error] || [400, 'Bad request'];
    return res.status(code).json({ error: 'Bad request', message });
  }
  const g = result.game;
  res.json({
    status: result.status, // 'applied' | 'pending' | 'noop'
    holes: g.holes,
    currentHole: g.currentHole,
    leaderboard: getLeaderboard(g),
  });
}

// Shared: set a hole result — winner outright or a tie (carryover).
async function handleSetResult(req, res, gameId, holeNum, body) {
  if (isNaN(holeNum)) {
    return res.status(400).json({ error: 'Bad request', message: 'holeNumber required' });
  }
  const game = await getGameById(gameId);
  if (!game || !game.playerIds.includes(req.user.id)) {
    return res.status(404).json({ error: 'Not found' });
  }
  const tied = body?.tied === true;
  const winnerId = tied ? null : body?.winnerId;
  const result = await setHoleResult(gameId, holeNum, { winnerId, tied }, req.user.id);
  sendResult(res, result);
}

// PATCH /games/:gameId/holes/:holeNumber — body: { winnerId } | { tied: true }
router.patch('/:gameId/holes/:holeNumber', async (req, res) => {
  const { gameId, holeNumber } = req.params;
  await handleSetResult(req, res, gameId, parseInt(holeNumber, 10), req.body || {});
});

// POST /games/:gameId/holes — body: { holeNumber, winnerId } | { holeNumber, tied: true }
router.post('/:gameId/holes', async (req, res) => {
  const { gameId } = req.params;
  await handleSetResult(req, res, gameId, parseInt((req.body || {}).holeNumber, 10), req.body || {});
});

// POST /games/:gameId/holes/:holeNumber/accept — approve a pending change (other player)
router.post('/:gameId/holes/:holeNumber/accept', async (req, res) => {
  const { gameId, holeNumber } = req.params;
  const game = await getGameById(gameId);
  if (!game || !game.playerIds.includes(req.user.id)) {
    return res.status(404).json({ error: 'Not found' });
  }
  const result = await acceptHoleChange(gameId, parseInt(holeNumber, 10), req.user.id);
  sendResult(res, result);
});

// POST /games/:gameId/holes/:holeNumber/reject — reject/cancel a pending change
router.post('/:gameId/holes/:holeNumber/reject', async (req, res) => {
  const { gameId, holeNumber } = req.params;
  const game = await getGameById(gameId);
  if (!game || !game.playerIds.includes(req.user.id)) {
    return res.status(404).json({ error: 'Not found' });
  }
  const result = await rejectHoleChange(gameId, parseInt(holeNumber, 10));
  sendResult(res, result);
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
