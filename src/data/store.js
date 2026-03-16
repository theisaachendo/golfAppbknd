/**
 * In-memory store for development/MVP. Replace with DB (e.g. Postgres) for production.
 * Aligned with Golf Skins frontend data shapes.
 */

import { v4 as uuidv4 } from 'uuid';

// ----- Helpers -----
function generateGameCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 3; i++) code += chars[Math.floor(Math.random() * chars.length)];
  code += '-';
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

// ----- Stores -----
const users = new Map();       // id -> { id, email?, displayName?, password?, balance, isGuest, createdAt }
const games = new Map();       // id -> game
const gameByCode = new Map();  // code -> gameId (for join by code)

// Seed a default user for testing (password: password)
const seedUserId = uuidv4();
users.set(seedUserId, {
  id: seedUserId,
  email: 'demo@example.com',
  displayName: 'Demo User',
  password: 'password', // In production use bcrypt
  balance: 100,
  isGuest: false,
  createdAt: new Date().toISOString(),
});

// ----- User -----
export function createUser({ email, displayName, password, isGuest = false }) {
  const id = uuidv4();
  const user = {
    id,
    email: isGuest ? undefined : email,
    displayName: displayName || (isGuest ? `Guest ${id.slice(0, 8)}` : undefined),
    password: isGuest ? undefined : password,
    balance: 0,
    isGuest,
    createdAt: new Date().toISOString(),
  };
  users.set(id, user);
  return user;
}

export function findUserByEmail(email) {
  for (const u of users.values()) if (u.email === email) return u;
  return null;
}

export function getUserById(id) {
  return users.get(id) || null;
}

export function updateUserBalance(userId, delta) {
  const u = users.get(userId);
  if (!u) return null;
  u.balance = (u.balance || 0) + delta;
  return u;
}

export function setUserBalance(userId, amount) {
  const u = users.get(userId);
  if (!u) return null;
  u.balance = amount;
  return u;
}

// ----- Games -----
const DEFAULT_HOLES = 9;

export function createGame({ name, stakePerHole, createdByUserId }) {
  const id = uuidv4();
  let code = generateGameCode();
  while (gameByCode.has(code)) code = generateGameCode();

  const creator = users.get(createdByUserId);
  const game = {
    id,
    code,
    name: name || 'Skins Game',
    stakePerHole: Number(stakePerHole) || 1,
    status: 'lobby', // lobby | in_progress | completed
    playerIds: [createdByUserId],
    holes: Array.from({ length: DEFAULT_HOLES }, (_, i) => ({
      holeNumber: i + 1,
      par: 3,
      winnerId: null,
    })),
    currentHole: 1,
    createdAt: new Date().toISOString(),
    startedAt: null,
    completedAt: null,
  };
  games.set(id, game);
  gameByCode.set(code, id);
  return game;
}

export function findGameByCode(code) {
  const id = gameByCode.get((code || '').trim().toUpperCase());
  return id ? games.get(id) : null;
}

export function getGameById(id) {
  return games.get(id) || null;
}

export function addPlayerToGame(gameId, userId) {
  const game = games.get(gameId);
  if (!game || game.status !== 'lobby') return null;
  if (game.playerIds.includes(userId)) return game;
  game.playerIds.push(userId);
  return game;
}

export function startGame(gameId) {
  const game = games.get(gameId);
  if (!game || game.status !== 'lobby') return null;
  game.status = 'in_progress';
  game.startedAt = new Date().toISOString();
  game.currentHole = 1;
  return game;
}

export function setHoleWinner(gameId, holeNumber, winnerId) {
  const game = games.get(gameId);
  if (!game || game.status !== 'in_progress') return null;
  const hole = game.holes.find((h) => h.holeNumber === holeNumber);
  if (!hole) return null;
  hole.winnerId = winnerId;
  if (holeNumber < game.holes.length) game.currentHole = holeNumber + 1;
  return game;
}

export function endGame(gameId) {
  const game = games.get(gameId);
  if (!game || game.status !== 'in_progress') return null;
  game.status = 'completed';
  game.completedAt = new Date().toISOString();
  return game;
}

// ----- Leaderboard / results (derived) -----
// Skins: each hole winner wins stakePerHole from each other player (winner +stake*(n-1), others -stake).
export function getLeaderboard(game) {
  const { holes, playerIds, stakePerHole } = game;
  const skins = new Map();
  const earnings = new Map();
  playerIds.forEach((pid) => {
    skins.set(pid, 0);
    earnings.set(pid, 0);
  });
  holes.forEach((h) => {
    if (h.winnerId) {
      skins.set(h.winnerId, (skins.get(h.winnerId) || 0) + 1);
      const n = playerIds.length;
      earnings.set(h.winnerId, (earnings.get(h.winnerId) || 0) + stakePerHole * (n - 1));
      playerIds.filter((p) => p !== h.winnerId).forEach((pid) => {
        earnings.set(pid, (earnings.get(pid) || 0) - stakePerHole);
      });
    }
  });
  return playerIds.map((playerId) => {
    const u = users.get(playerId);
    return {
      playerId,
      name: u ? (u.displayName || u.email || 'Player') : 'Unknown',
      skinsWon: skins.get(playerId) || 0,
      totalEarnings: Math.round((earnings.get(playerId) || 0) * 100) / 100,
    };
  });
}

// Payout: same as totalEarnings (positive = won, negative = lost)
export function getResults(game) {
  const leaderboard = getLeaderboard(game);
  return leaderboard.map(({ name, playerId, skinsWon, totalEarnings }) => ({
    playerId,
    name,
    skinsWon,
    payout: totalEarnings,
  }));
}

// User's current in-progress game (if any). For "return to game" when app reopens.
export function getActiveGameForUser(userId) {
  for (const game of games.values()) {
    if (game.status === 'in_progress' && game.playerIds.includes(userId)) {
      return game;
    }
  }
  return null;
}

// Match history for a user: games they participated in that are completed
export function getGamesForUser(userId) {
  const list = [];
  for (const game of games.values()) {
    if (game.status !== 'completed' || !game.playerIds.includes(userId)) continue;
    const results = getResults(game);
    const myResult = results.find((r) => r.playerId === userId);
    list.push({
      id: game.id,
      code: game.code,
      name: game.name,
      completedAt: game.completedAt,
      playerCount: game.playerIds.length,
      result: myResult?.payout >= 0 ? 'Won' : 'Lost',
      payout: myResult?.payout ?? 0,
    });
  }
  list.sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || ''));
  return list;
}
