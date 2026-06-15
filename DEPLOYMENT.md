# Deployment & Setup

This API is **Postgres-backed** (Prisma). The old in-memory store is gone —
data now persists across restarts/redeploys.

Money is **OFF** (`MONEY_ENABLED=false`). The app tracks skins games and
computes "who owes whom"; friends settle off-app. The schema and code are
"money-ready": amounts are stored in integer cents and there's a ledger, so
adding a real payment processor later is additive, not a rewrite.

---

## 1. Local development

```bash
# Postgres (already installed via Homebrew on this machine):
brew services start postgresql@16
createdb golfapp_dev    # one-time

# Backend:
cp .env.example .env     # then set DATABASE_URL to your local Postgres
npm install
npx prisma migrate dev   # apply schema (creates tables)
npm run dev              # http://localhost:3000  (seeds demo@example.com / password)
```

`DATABASE_URL` for local Homebrew Postgres:
```
postgresql://<your-mac-username>@localhost:5432/golfapp_dev
```

Useful:
- `npm run db:studio` — open Prisma Studio (browse/edit data in the browser)
- `npm run db:migrate` — create a new migration after editing `prisma/schema.prisma`

---

## 2. Production database (Neon — recommended free tier)

1. Create a project at https://neon.tech (free; doesn't expire like Render's free Postgres).
2. Copy the connection string (looks like
   `postgresql://user:pass@ep-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require`).
3. That string is your production `DATABASE_URL`.

(Supabase works too — use the "Connection string" → "URI" from project settings.)

---

## 3. Render (API host)

The API stays on Render. Settings:

- **Build command:** `npm install && npm run build`
  - `build` runs `prisma generate && prisma migrate deploy` (applies migrations on every deploy).
- **Start command:** `npm start`
- **Environment variables:**
  | Key | Value |
  |-----|-------|
  | `DATABASE_URL` | your Neon/Supabase URL (with `?sslmode=require`) |
  | `JWT_SECRET` | a long random string (`openssl rand -hex 32`) |
  | `MONEY_ENABLED` | `false` |
  | `RESET_PASSWORD_BASE_URL` | your app URL (for password-reset links) |
  | `SMTP_*` | optional, for password-reset emails |

> Free Render instances spin down when idle (first request after idle is slow).
> Upgrade the instance or add an uptime ping to remove cold starts.

---

## 4. Frontend (Expo)

In `golfApp/frontend/.env`:
```
EXPO_PUBLIC_API_URL=https://your-render-api.onrender.com
# EXPO_PUBLIC_MONEY_ENABLED stays unset/false — hides deposit/withdraw UI
```

---

## 5. Turning on real money later (high-level)

This is a legal/compliance project, not just code. Before flipping the flag:

1. Talk to a gaming/gambling attorney (skill-game classification, state geofencing, ToS, age gate).
2. Sign up with a **gambling-capable** payment processor — standard Stripe ToS prohibits
   betting. Have *them* custody balances (keeps you out of money-transmitter licensing).
3. Then, in code (already scaffolded):
   - Set `MONEY_ENABLED=true` (backend + `EXPO_PUBLIC_MONEY_ENABLED=true` frontend).
   - Implement deposit holds/escrow + payouts via the processor in `src/routes/payments.js`.
   - Set each game's `feeBps` to your house cut (rake) — the settlement math already
     reserves for it.
   - Add KYC/AML (processor-provided or Persona/Veriff).

---

## Data model (Prisma)

`prisma/schema.prisma`. Key tables:
- **User**, **Game**, **GamePlayer** (join), **Hole**
- **LedgerEntry** — every value movement in cents (today: `GAME_RESULT` only)
- **Settlement** — "X owes Y $Z" per game; `settled` flag for off-app payment
- **PasswordResetToken**, **ProcessedStripeEvent** (webhook idempotency, future)
