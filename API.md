# Golf Skins API — Backend reference for frontend

**Base URL:** Set in the frontend as `EXPO_PUBLIC_API_URL` (e.g. `https://golf-app-api-gv91.onrender.com` for production, `http://localhost:3000` for dev).

- **Auth** routes: no token. Use `POST /auth/login` and `POST /auth/guest`.
- **All other** routes under `/api/*` require header: `Authorization: Bearer <token>`.

---

## Endpoints (aligned with Golf Skins frontend)

### 1. Sign up, login, guest, forgot password

| Method | Path | Body | Response |
|--------|------|------|----------|
| POST | `/auth/register` | `{ email, password, displayName? }` | `201` `{ token, user: { id, displayName, email } }` — password min 8 chars; 409 if email exists. |
| POST | `/auth/login` | `{ email, password }` | `{ token, user: { id, displayName, email } }` |
| POST | `/auth/guest` | `{ displayName? }` | `{ token, user: { id, displayName } }` |
| POST | `/auth/forgot-password` | `{ email }` | `{ message }` — Same message always (no email enumeration). Backend creates reset token; in production send link via email (see AUTH.md). |
| POST | `/auth/reset-password` | `{ token, newPassword }` | `{ message }` — Token from forgot-password flow (link or dev log). Single-use, expires in 1 hour. |

Store `token` (e.g. secure store) and send `Authorization: Bearer <token>` on every `/api` request.

---

### 2. Create game

| Method | Path | Body | Response |
|--------|------|------|----------|
| POST | `/api/games` | `{ name: string, stakePerHole: number }` | `{ id, code, name, stakePerHole, status }` |

After create → navigate to `/lobby?gameId={id}` and show `code` in the lobby.

---

### 3. Join game

| Method | Path | Body | Response |
|--------|------|------|----------|
| POST | `/api/games/join` | `{ code: string }` | `{ gameId, id, code, name, stakePerHole }` |

After join → navigate to `/lobby?gameId={gameId}`.

---

### 4. Lobby (get game + start)

| Method | Path | Body | Response |
|--------|------|------|----------|
| GET | `/api/games/:gameId` | — | `{ id, code, name, stakePerHole, status, players: [{ id?, displayName }], currentHole?, holes? }` |
| POST | `/api/games/:gameId/start` | — | `{ id, status, currentHole, holes }` |

Use GET for lobby (code + players). Use POST start → then navigate to `/match/:gameId`.

---

### 5. Active match (state, hole winner, end)

| Method | Path | Body | Response |
|--------|------|------|----------|
| GET | `/api/games/:gameId` | — | Same as lobby; when started also includes `leaderboard: [{ playerId, name, skinsWon, totalEarnings }]`, `currentHole`, `holes: [{ holeNumber, par?, winnerId? }]`. |
| PATCH | `/api/games/:gameId/holes/:holeNumber` | `{ winnerId }` | `{ holes, currentHole, leaderboard }` |
| POST | `/api/games/:gameId/holes` | `{ holeNumber, winnerId }` | Same as PATCH. |
| POST | `/api/games/:gameId/end` | — | `{ id, status, completedAt }` (payouts applied to balances). Then go to `/result/:gameId`. |

---

### 6. Post match / Result

| Method | Path | Body | Response |
|--------|------|------|----------|
| GET | `/api/games/:gameId/results` | — | `[{ playerId, name, skinsWon, payout }]` — `payout` is signed (+ won, − lost). |

---

### 7. Match history

| Method | Path | Body | Response |
|--------|------|------|----------|
| GET | `/api/users/me/games` | — | `[{ id, code, name, date, completedAt, result, payout, playerCount }]` — `result`: `'Won'` \| `'Lost'`, `payout`: number. Tap row → `/result/:id`. |

---

### 8. Profile (balance, deposit & withdrawal)

| Method | Path | Body | Response |
|--------|------|------|----------|
| GET | `/api/users/me` | — | `{ id, displayName, email, balance, isGuest }` |
| GET | `/api/users/me/balance` | — | `{ balance: number }` |
| GET | `/api/users/me/active-game` | — | `{ game: <same as GET /api/games/:gameId> \| null }` — User's in-progress game if any; use to restore match screen after app restart. |
| POST | `/api/users/me/deposit` | `{ amount: number }` | `{ success: true, balance }` — **Testing/dev only**; in production use Stripe (or similar) and credit via webhook. |
| POST | `/api/users/me/withdraw` | `{ amount: number }` | `{ success: true, balance }` or 400 (e.g. insufficient balance). Real payout requires Stripe/manual process (see PAYMENTS.md). |

---

## Other

| Method | Path | Response |
|--------|------|----------|
| GET | `/` | `{ service: 'golf-app-api', docs: 'See API.md', health: '/health' }` |
| GET | `/health` | `{ status: 'ok', service: 'golf-app-api' }` |

---

## Frontend integration checklist

- [x] **Auth:** POST `/auth/register` (sign up) or POST `/auth/login` or POST `/auth/guest` → store token; send `Authorization: Bearer <token>` on `/api` requests.
- [x] **Forgot password:** POST `/auth/forgot-password` with `{ email }`; show “check your email” (or in dev use reset link from server log). Reset page: POST `/auth/reset-password` with `{ token, newPassword }`.
- [x] **Create game:** POST `/api/games` → get `id` + `code` → navigate to `/lobby?gameId={id}`, show `code`.
- [x] **Join game:** POST `/api/games/join` with `{ code }` → get `gameId` → navigate to `/lobby?gameId={gameId}`.
- [x] **Lobby:** GET `/api/games/:gameId` → show code + players; POST `/api/games/:gameId/start` → navigate to `/match/:id`.
- [x] **Active match:** GET `/api/games/:gameId` for state (holes, leaderboard); PATCH/POST hole winner; POST `/api/games/:gameId/end` → navigate to `/result/:id`.
- [x] **Result:** GET `/api/games/:gameId/results` → show winner and standings.
- [x] **Match history:** GET `/api/users/me/games` → list; tap → `/result/:id`.
- [x] **Profile:** GET `/api/users/me/balance`; POST `/api/users/me/withdraw` with `{ amount }`.

---

## Demo user (dev only)

**Email:** `demo@example.com`  
**Password:** `password`  
(Seeded with balance 100. In-memory store; restart clears data.)
