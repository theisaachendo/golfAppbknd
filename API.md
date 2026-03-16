# Golf Skins API

Base URL: set `EXPO_PUBLIC_API_URL` in the frontend (e.g. `http://localhost:3000` for dev). All `/api/*` routes require `Authorization: Bearer <token>` except auth.

---

## Auth

| Method | Path | Body | Response |
|--------|------|------|----------|
| POST | `/auth/login` | `{ email, password }` | `{ token, user: { id, displayName, email } }` |
| POST | `/auth/guest` | `{ displayName? }` | `{ token, user: { id, displayName } }` |

Store `token` and send header: `Authorization: Bearer <token>` on all `/api` requests.

---

## Games

| Method | Path | Body | Response |
|--------|------|------|----------|
| POST | `/api/games` | `{ name, stakePerHole }` | `{ id, code, name, stakePerHole, status }` |
| POST | `/api/games/join` | `{ code }` | `{ gameId, id, code, name, stakePerHole }` |
| GET | `/api/games/:gameId` | — | Game + `players`, `currentHole`, `holes`, `leaderboard` (if in progress/completed) |
| POST | `/api/games/:gameId/start` | — | `{ id, status, currentHole, holes }` |
| PATCH | `/api/games/:gameId/holes/:holeNumber` | `{ winnerId }` | `{ holes, currentHole, leaderboard }` |
| POST | `/api/games/:gameId/holes` | `{ holeNumber, winnerId }` | same as PATCH |
| POST | `/api/games/:gameId/end` | — | `{ id, status, completedAt }` (payouts applied to balances) |
| GET | `/api/games/:gameId/results` | — | `[{ name, playerId, skinsWon, payout }]` |

**Game response (GET)**  
`id`, `code`, `name`, `stakePerHole`, `status` (`lobby` \| `in_progress` \| `completed`), `players: [{ id, displayName }]`, `currentHole`, `holes: [{ holeNumber, par?, winnerId? }]`, and when started: `leaderboard: [{ playerId, name, skinsWon, totalEarnings }]`.

---

## Users / Profile

| Method | Path | Body | Response |
|--------|------|------|----------|
| GET | `/api/users/me` | — | `{ id, displayName, email, balance, isGuest }` |
| GET | `/api/users/me/balance` | — | `{ balance }` |
| POST | `/api/users/me/withdraw` | `{ amount }` | `{ success, balance }` |
| GET | `/api/users/me/games` | — | `[{ id, code, name, date/completedAt, result, payout, playerCount }]` |

---

## Demo user

For development, a seeded user exists: **email** `demo@example.com`, **password** `password` (balance 100). Data is in-memory; restart clears it.
