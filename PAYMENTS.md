# Payments: Deposits, In‑App Transfers, Withdrawals & Edge Cases

This doc describes how money flows in the app and what you need to set up on the backend for real cash.

---

## 1. How it works today (ledger only)

- **Balance** — Each user has a `balance` (in-memory; will be in DB when you add one). This is your **ledger**: the app’s record of what each user has.
- **No real money yet** — The backend only moves numbers. Real money enters when users **deposit** (via a payment processor) and leaves when they **withdraw** (payout to bank).

| Flow | Current backend behavior |
|------|---------------------------|
| **Deposit** | Not implemented. You need a payment processor (e.g. Stripe) and a way to credit balance when payment succeeds. |
| **Wagering** | No “hold” at game start. We **settle at game end**: winners get +payout, losers get −payout (see below). |
| **Transfer between users** | Done when the match ends: `POST /api/games/:gameId/end` computes skins/payouts and calls `updateUserBalance(playerId, payout)` for each player. So in‑app “transfer” is already implemented as balance updates. |
| **Withdrawal** | `POST /api/users/me/withdraw` deducts from the user’s balance only. It does **not** send money to a bank yet; you need a processor for that. |

So: **deposits** and **withdrawals** need a payment provider. **Transfers between users** after a match are already implemented on the ledger side.

---

## 2. What you need to set up

### A. Deposits (user adds cash to their balance)

**Goal:** User pays real money → their `balance` increases.

**Options:**

1. **Stripe (recommended)**  
   - User goes through **Stripe Checkout** or **Payment Element** (card, etc.).  
   - You create a **PaymentIntent** or **Checkout Session** on the server (amount in cents, `metadata.userId`).  
   - On success, Stripe sends a **webhook** to your backend (e.g. `payment_intent.succeeded`).  
   - Your webhook handler verifies the event (Stripe signature), then **credits the user’s balance** (e.g. call your existing `updateUserBalance(userId, amount)` or a small “deposit” service that does the same).  
   - **Do not** trust the client to “add” money; only credit balance in the webhook after verified payment.

2. **Other processors** (e.g. Braintree, Adyen) — Same idea: payment → webhook → credit balance.

**Backend pieces:**

- Endpoint to create a Checkout Session or PaymentIntent (amount from client or fixed tiers).
- **Webhook route** (e.g. `POST /webhooks/stripe`) that:
  - Reads raw body (for signature verification).
  - Verifies `Stripe-Signature`.
  - On `payment_intent.succeeded` (or equivalent), reads `userId` from metadata and credits balance.
- For **testing without Stripe**, you can use `POST /api/users/me/deposit` (see API.md) to credit balance; in production this must be disabled or replaced so only the webhook can credit.

---

### B. Holding / transfer between users (after match)

**Already implemented:**

- When the game ends (`POST /api/games/:gameId/end`), the server:
  - Computes each player’s payout (skins × stake, positive for winners, negative for losers).
  - Calls `updateUserBalance(playerId, payout)` for each player.
- So the app **does** “hold” and transfer in the sense of the **ledger**: all movement happens at settlement time; no separate escrow per game in the current design.

**Optional hardening:**

- **Minimum balance to join/start:** If you want to avoid negative balances, you could require that before a user joins (or before starting), their balance is at least the maximum they could lose (e.g. `(numberOfHoles - 1) * stakePerHole * (playerCount - 1)`). Right now we allow negative balance.
- **Idempotency on end-game:** To avoid double-settlement if the client retries, you could store “game already settled” and skip balance updates on duplicate `POST .../end`, or use an idempotency key.

---

### C. Withdrawals (user cashes out)

**Goal:** User requests a payout → money leaves your ledger and goes to their bank (or PayPal, etc.).

**Current:** `POST /api/users/me/withdraw` only deducts from `balance`. No actual bank payout.

**What to add:**

1. **Stripe (e.g. Connect or Payouts)**  
   - **Stripe Connect:** Users are “Connected accounts”; you transfer funds to them (they onboard with Stripe).  
   - Or you hold funds in your Stripe account and use **Transfers** or **Payouts** to send to a linked bank (you need to collect and store bank details or use Connect).  
   - Backend: when user calls `POST /api/users/me/withdraw` with `{ amount }`, after validating balance you create a **Transfer** or **Payout** via Stripe API, then deduct from your ledger. If Stripe fails, you may want a **pending withdrawal** state and retry or manual resolution.

2. **Manual process (MVP)**  
   - `POST /api/users/me/withdraw` creates a “withdrawal request” (e.g. in a `withdrawals` table: userId, amount, status, createdAt).  
   - You deduct from balance (or mark as “pending”) and process payouts manually (bank transfer, Venmo, etc.).  
   - Later replace with Stripe (or another processor) when you’re ready.

**Backend pieces:**

- Keep balance check and deduction (or move to “pending”).
- Either: (a) call Stripe to send money and then deduct, or (b) record withdrawal request for manual processing.
- Consider **idempotency** (e.g. withdrawal request id or idempotency key) so double-clicks don’t double-payout.

---

## 3. Off‑chance scenarios

| Scenario | Suggestion |
|---------|------------|
| **Game cancelled before start** | No money has moved (we settle only on “end game”). You can add `POST /api/games/:gameId/cancel` to set status to `cancelled` and remove from active lists; no balance changes. |
| **Game abandoned mid‑way** | Policy decision. Options: (1) “End game” with current holes (some holes may have no winner); (2) “Cancel game” that doesn’t pay out; (3) Refund logic if you ever move to “collect stakes at start.” Document the rule and implement the chosen path. |
| **User disputes a result** | Support/admin tool: e.g. “Adjust balance” for a user (with audit log). Or manual process outside the app. |
| **Insufficient balance to cover loss** | Right now we allow negative balance. For real money you may want: (1) block starting/joining if balance can’t cover max loss, or (2) allow negative and handle “collections” (terms of service, follow-up). |
| **Double withdrawal / double end-game** | Use idempotency: e.g. “withdrawal request” with a unique key, or “game already settled” flag so a second `POST .../end` doesn’t apply payouts again. |
| **Stripe webhook fails / payout fails** | Webhook: make handler idempotent (e.g. store `payment_intent.id` and skip if already processed). For withdrawals, keep a “pending” state and retry or alert; don’t deduct until payout succeeds if you want to avoid double-spend. |
| **Refund (user deposited by mistake)** | Support flow: manual balance adjustment or Stripe refund + webhook that debits balance (if you track deposits by payment intent). |

---

## 4. Summary checklist (backend)

| Item | Status | Notes |
|------|--------|--------|
| Ledger (balance per user) | Done | In-memory; move to DB when you add persistence. |
| Transfer between users on game end | Done | `POST /api/games/:gameId/end` updates all player balances. |
| Withdraw endpoint | Done | Deducts from balance only; add Stripe or manual payout. |
| Deposit (testing) | Done | `POST /api/users/me/deposit` for dev; disable or replace in prod. |
| Deposit (production) | To do | Stripe Checkout/PaymentIntent + webhook → credit balance. |
| Withdrawal (production) | To do | Stripe Connect/Transfer or manual withdrawal requests. |
| Game cancel / abandon policy | Optional | Add cancel endpoint and document abandon policy. |
| Idempotency (withdraw / end-game) | Optional | Reduces double-payout / double-settlement risk. |
| Min balance to join/start | Optional | Prevents negative balance if you don’t allow it. |

Once you add a database, store balances (and optionally withdrawal requests, audit logs) there and keep the same flows; the payment processor (Stripe) stays the same.
