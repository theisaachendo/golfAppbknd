/**
 * Data layer (PostgreSQL via Prisma).
 *
 * Replaces the old in-memory store. Function names/return shapes are kept
 * compatible with the routes, but functions are now async.
 *
 * Money model: OFF. Amounts are stored in integer cents. Game results write
 * LedgerEntry rows (informational "who won/lost") and Settlement rows
 * ("who owes whom") so friends can settle off-app. Real payments slot in
 * later via the same tables (DEPOSIT/PAYOUT/RAKE ledger types).
 */

import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../lib/prisma.js';
import { hashPassword } from '../lib/password.js';

const DEFAULT_HOLES = 9;
const DEFAULT_PAR = 3;

// ----- Helpers -----
function generateGameCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 3; i++) code += chars[Math.floor(Math.random() * chars.length)];
  code += '-';
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

const gameInclude = {
  players: { include: { user: true }, orderBy: { joinedAt: 'asc' } },
  holes: { orderBy: { holeNumber: 'asc' } },
};

// Normalize a Prisma game (with players + holes) into the shape routes expect.
function toGameShape(g) {
  if (!g) return null;
  const players = (g.players || []).map((p) => ({
    id: p.userId,
    displayName: p.user?.displayName || p.user?.email || 'Player',
  }));
  const playerIds = (g.players || []).map((p) => p.userId);
  const holes = (g.holes || []).map((h) => ({
    holeNumber: h.holeNumber,
    par: h.par,
    winnerId: h.winnerId,
    proposedWinnerId: h.proposedWinnerId,
  }));
  return {
    id: g.id,
    code: g.code,
    name: g.name,
    stakePerHoleCents: g.stakePerHoleCents,
    stakePerHole: g.stakePerHoleCents / 100,
    feeBps: g.feeBps,
    numHoles: g.numHoles,
    status: String(g.status).toLowerCase(), // LOBBY -> 'lobby'
    currentHole: g.currentHole,
    players,
    playerIds,
    holes,
    createdAt: g.createdAt,
    startedAt: g.startedAt,
    completedAt: g.completedAt,
  };
}

// ----- Startup: idempotent demo user seed -----
export async function initStore() {
  // Verify connectivity early so a bad DATABASE_URL fails loudly at boot.
  await prisma.$queryRaw`SELECT 1`;
  const existing = await prisma.user.findUnique({ where: { email: 'demo@example.com' } });
  if (!existing) {
    const passwordHash = await hashPassword('password');
    await prisma.user.create({
      data: {
        email: 'demo@example.com',
        displayName: 'Demo User',
        passwordHash,
        isGuest: false,
      },
    });
    console.log('[store] Seeded demo user (demo@example.com / password)');
  }
}

// ----- User -----
export async function createUser({ email, displayName, passwordHash, isGuest = false }) {
  const user = await prisma.user.create({
    data: {
      email: isGuest ? null : email,
      displayName: displayName || (isGuest ? `Guest ${uuidv4().slice(0, 8)}` : null),
      passwordHash: isGuest ? null : passwordHash,
      isGuest,
    },
  });
  return user;
}

export async function findUserByEmail(email) {
  if (!email) return null;
  return prisma.user.findUnique({ where: { email } });
}

export async function getUserById(id) {
  if (!id) return null;
  return prisma.user.findUnique({ where: { id } });
}

export async function updateUserPassword(userId, passwordHash) {
  return prisma.user.update({ where: { id: userId }, data: { passwordHash } });
}

export async function updateUserDisplayName(userId, displayName) {
  return prisma.user.update({ where: { id: userId }, data: { displayName } });
}

// ----- Password reset tokens -----
export async function createPasswordResetToken(userId, ttlMs = 1000 * 60 * 60) {
  const token = uuidv4();
  const expiresAt = new Date(Date.now() + ttlMs);
  await prisma.passwordResetToken.create({ data: { token, userId, expiresAt } });
  return { token, expiresAt };
}

export async function getAndConsumePasswordResetToken(token) {
  if (!token) return null;
  const row = await prisma.passwordResetToken.findUnique({ where: { token } });
  if (!row) return null;
  await prisma.passwordResetToken.delete({ where: { token } }).catch(() => {});
  if (row.expiresAt.getTime() < Date.now()) return null;
  return row.userId;
}

// ----- Game lifecycle -----
export async function createGame({ name, stakePerHole, createdByUserId, numHoles = DEFAULT_HOLES }) {
  let code = generateGameCode();
  // Avoid (extremely unlikely) code collision.
  while (await prisma.game.findUnique({ where: { code } })) code = generateGameCode();

  const stakePerHoleCents = Math.max(0, Math.round((Number(stakePerHole) || 1) * 100));

  const game = await prisma.game.create({
    data: {
      code,
      name: name || 'Skins Game',
      stakePerHoleCents,
      numHoles,
      currentHole: 1,
      createdByUserId,
      players: { create: [{ userId: createdByUserId }] },
      holes: {
        create: Array.from({ length: numHoles }, (_, i) => ({
          holeNumber: i + 1,
          par: DEFAULT_PAR,
        })),
      },
    },
    include: gameInclude,
  });
  return toGameShape(game);
}

export async function findGameByCode(code) {
  const normalized = (code || '').trim().toUpperCase();
  if (!normalized) return null;
  const game = await prisma.game.findUnique({ where: { code: normalized }, include: gameInclude });
  return toGameShape(game);
}

export async function getGameById(id) {
  if (!id) return null;
  const game = await prisma.game.findUnique({ where: { id }, include: gameInclude });
  return toGameShape(game);
}

export async function addPlayerToGame(gameId, userId) {
  const game = await prisma.game.findUnique({ where: { id: gameId }, include: gameInclude });
  if (!game || game.status !== 'LOBBY') return null;
  if (game.players.some((p) => p.userId === userId)) return toGameShape(game);
  await prisma.gamePlayer.create({ data: { gameId, userId } });
  const updated = await prisma.game.findUnique({ where: { id: gameId }, include: gameInclude });
  return toGameShape(updated);
}

export async function startGame(gameId) {
  const game = await prisma.game.findUnique({ where: { id: gameId } });
  if (!game || game.status !== 'LOBBY') return null;
  const updated = await prisma.game.update({
    where: { id: gameId },
    data: { status: 'IN_PROGRESS', startedAt: new Date(), currentHole: 1 },
    include: gameInclude,
  });
  return toGameShape(updated);
}

// Direct (trust-based) winner set: records and confirms in one step.
export async function setHoleWinner(gameId, holeNumber, winnerId) {
  const game = await prisma.game.findUnique({ where: { id: gameId }, include: gameInclude });
  if (!game || game.status !== 'IN_PROGRESS') return null;
  const hole = game.holes.find((h) => h.holeNumber === holeNumber);
  if (!hole) return null;

  await prisma.hole.update({
    where: { gameId_holeNumber: { gameId, holeNumber } },
    data: { winnerId, proposedWinnerId: winnerId },
  });
  if (holeNumber < game.holes.length) {
    await prisma.game.update({ where: { id: gameId }, data: { currentHole: holeNumber + 1 } });
  }
  const updated = await prisma.game.findUnique({ where: { id: gameId }, include: gameInclude });
  return toGameShape(updated);
}

// Two-step confirmation (optional, for less trusting groups).
export async function proposeHoleWinner(gameId, holeNumber, winnerId) {
  const game = await prisma.game.findUnique({ where: { id: gameId } });
  if (!game || game.status !== 'IN_PROGRESS') return null;
  await prisma.hole.update({
    where: { gameId_holeNumber: { gameId, holeNumber } },
    data: { proposedWinnerId: winnerId, winnerId: null },
  });
  const updated = await prisma.game.findUnique({ where: { id: gameId }, include: gameInclude });
  return toGameShape(updated);
}

export async function confirmHoleWinner(gameId, holeNumber, confirmedById) {
  const game = await prisma.game.findUnique({ where: { id: gameId }, include: gameInclude });
  if (!game || game.status !== 'IN_PROGRESS') return null;
  const hole = game.holes.find((h) => h.holeNumber === holeNumber);
  if (!hole || !hole.proposedWinnerId) return null;
  await prisma.hole.update({
    where: { gameId_holeNumber: { gameId, holeNumber } },
    data: { winnerId: hole.proposedWinnerId, confirmedById },
  });
  if (holeNumber < game.holes.length) {
    await prisma.game.update({ where: { id: gameId }, data: { currentHole: holeNumber + 1 } });
  }
  const updated = await prisma.game.findUnique({ where: { id: gameId }, include: gameInclude });
  return toGameShape(updated);
}

// End the game: write GAME_RESULT ledger entries + Settlement rows in one transaction.
export async function endGame(gameId) {
  const existing = await getGameById(gameId);
  if (!existing || existing.status !== 'in_progress') return null;

  const leaderboard = getLeaderboard(existing); // includes netCents
  const settlements = computeSettlements(leaderboard);
  const completedAt = new Date();

  await prisma.$transaction([
    prisma.game.update({
      where: { id: gameId },
      data: { status: 'COMPLETED', completedAt },
    }),
    // Ledger: one signed GAME_RESULT per player (skip exact zero).
    ...leaderboard
      .filter((p) => p.netCents !== 0)
      .map((p) =>
        prisma.ledgerEntry.create({
          data: {
            userId: p.playerId,
            gameId,
            amountCents: p.netCents,
            type: 'GAME_RESULT',
            note: `Skins result: ${p.skinsWon} skin(s)`,
          },
        })
      ),
    // Settlements: who owes whom.
    ...settlements.map((s) =>
      prisma.settlement.create({
        data: {
          gameId,
          fromUserId: s.fromUserId,
          toUserId: s.toUserId,
          amountCents: s.amountCents,
        },
      })
    ),
  ]);

  return getGameById(gameId);
}

// ----- Leaderboard / results (pure, derived from a normalized game) -----
// Skins: each hole winner wins stakePerHole from each other player.
export function getLeaderboard(game) {
  const { holes, players, stakePerHoleCents } = game;
  const ids = players.map((p) => p.id);
  const skins = {};
  const cents = {};
  ids.forEach((id) => {
    skins[id] = 0;
    cents[id] = 0;
  });
  holes.forEach((h) => {
    if (h.winnerId && cents[h.winnerId] !== undefined) {
      skins[h.winnerId] += 1;
      const n = ids.length;
      cents[h.winnerId] += stakePerHoleCents * (n - 1);
      ids.filter((i) => i !== h.winnerId).forEach((i) => {
        cents[i] -= stakePerHoleCents;
      });
    }
  });
  return players.map((p) => ({
    playerId: p.id,
    name: p.displayName,
    skinsWon: skins[p.id] || 0,
    netCents: cents[p.id] || 0,
    totalEarnings: (cents[p.id] || 0) / 100,
  }));
}

export function getResults(game) {
  return getLeaderboard(game).map(({ name, playerId, skinsWon, totalEarnings, netCents }) => ({
    playerId,
    name,
    skinsWon,
    payout: totalEarnings,
    netCents,
  }));
}

// Minimal "who owes whom": greedy match debtors to creditors.
function computeSettlements(leaderboard) {
  const creditors = leaderboard
    .filter((p) => p.netCents > 0)
    .map((p) => ({ id: p.playerId, amt: p.netCents }))
    .sort((a, b) => b.amt - a.amt);
  const debtors = leaderboard
    .filter((p) => p.netCents < 0)
    .map((p) => ({ id: p.playerId, amt: -p.netCents }))
    .sort((a, b) => b.amt - a.amt);

  const out = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const pay = Math.min(debtors[i].amt, creditors[j].amt);
    if (pay > 0) {
      out.push({ fromUserId: debtors[i].id, toUserId: creditors[j].id, amountCents: pay });
    }
    debtors[i].amt -= pay;
    creditors[j].amt -= pay;
    if (debtors[i].amt === 0) i += 1;
    if (creditors[j].amt === 0) j += 1;
  }
  return out;
}

// ----- Settlements (who owes whom) -----
export async function getSettlementsForGame(gameId, viewerId) {
  const rows = await prisma.settlement.findMany({
    where: { gameId },
    include: { from: true, to: true },
    orderBy: { amountCents: 'desc' },
  });
  return rows.map((s) => ({
    id: s.id,
    fromUserId: s.fromUserId,
    fromName: s.from?.displayName || s.from?.email || 'Player',
    toUserId: s.toUserId,
    toName: s.to?.displayName || s.to?.email || 'Player',
    amount: s.amountCents / 100,
    amountCents: s.amountCents,
    settled: s.settled,
    settledAt: s.settledAt,
    // convenience for the viewer's UI
    involvesViewer: viewerId ? s.fromUserId === viewerId || s.toUserId === viewerId : false,
    viewerOwes: viewerId ? s.fromUserId === viewerId : false,
  }));
}

export async function markSettlementSettled(settlementId, viewerId, settled = true) {
  const s = await prisma.settlement.findUnique({ where: { id: settlementId } });
  if (!s) return null;
  // Only a party to the settlement can change its status.
  if (viewerId && s.fromUserId !== viewerId && s.toUserId !== viewerId) return null;
  const updated = await prisma.settlement.update({
    where: { id: settlementId },
    data: { settled, settledAt: settled ? new Date() : null },
  });
  return updated;
}

// ----- Balance / standings (lifetime net from the ledger) -----
export async function getBalance(userId) {
  const agg = await prisma.ledgerEntry.aggregate({
    where: { userId },
    _sum: { amountCents: true },
  });
  return (agg._sum.amountCents || 0) / 100;
}

// Used by the (future, flag-gated) Stripe webhook to credit a deposit.
export async function updateUserBalance(userId, amountDollars, type = 'ADJUSTMENT', gameId = null) {
  const amountCents = Math.round(Number(amountDollars) * 100);
  if (!Number.isFinite(amountCents) || amountCents === 0) return;
  await prisma.ledgerEntry.create({ data: { userId, gameId, amountCents, type } });
}

// ----- Queries for the current user -----
export async function getActiveGameForUser(userId) {
  const membership = await prisma.gamePlayer.findFirst({
    where: { userId, game: { status: 'IN_PROGRESS' } },
    include: { game: { include: gameInclude } },
    orderBy: { joinedAt: 'desc' },
  });
  return membership ? toGameShape(membership.game) : null;
}

export async function getGamesForUser(userId) {
  const memberships = await prisma.gamePlayer.findMany({
    where: { userId, game: { status: 'COMPLETED' } },
    include: { game: { include: gameInclude } },
  });
  const games = memberships
    .map((m) => toGameShape(m.game))
    .sort((a, b) => String(b.completedAt || '').localeCompare(String(a.completedAt || '')));

  return games.map((g) => {
    const results = getResults(g);
    const mine = results.find((r) => r.playerId === userId);
    return {
      id: g.id,
      code: g.code,
      name: g.name,
      completedAt: g.completedAt,
      playerCount: g.playerIds.length,
      result: (mine?.payout ?? 0) >= 0 ? 'Won' : 'Lost',
      payout: mine?.payout ?? 0,
    };
  });
}

// ----- Stripe webhook idempotency (kept for the money phase) -----
export async function hasProcessedStripeEvent(eventId) {
  const row = await prisma.processedStripeEvent.findUnique({ where: { id: eventId } });
  return !!row;
}

export async function markStripeEventProcessed(eventId) {
  await prisma.processedStripeEvent.create({ data: { id: eventId } }).catch(() => {});
}
