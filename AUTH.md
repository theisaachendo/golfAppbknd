# Auth: Sign up, login, forgot password

This backend supports full auth: **sign up**, **login**, **forgot password**, and **reset password**. Passwords are hashed with bcrypt.

---

## Endpoints

| Action | Method | Path | Body |
|--------|--------|------|------|
| Sign up | POST | `/auth/register` | `{ email, password, displayName? }` |
| Login | POST | `/auth/login` | `{ email, password }` |
| Guest | POST | `/auth/guest` | `{ displayName? }` |
| Forgot password | POST | `/auth/forgot-password` | `{ email }` |
| Reset password | POST | `/auth/reset-password` | `{ token, newPassword }` |

- **Register:** Password must be at least 8 characters. Returns 409 if email already exists.
- **Login:** Returns same error for invalid email or wrong password (no enumeration).
- **Forgot password:** Always returns the same JSON message. If the email exists, a reset token is created (1-hour expiry, single-use). In **development** the reset link is logged to the server console so you can copy it and open in the app or Postman.
- **Reset password:** Use the `token` from the forgot-password flow (e.g. from the reset link query param). Token is consumed after use.

---

## Forgot password: sending the email (production)

The server uses **Nodemailer** (widely used Node.js email library). When SMTP is configured, it sends the reset link automatically. When SMTP is not set (e.g. local dev), it only logs the link to the console.

1. **Set `RESET_PASSWORD_BASE_URL`** to your app’s URL (e.g. `https://mygolfapp.com`). The reset link in the email will be `{RESET_PASSWORD_BASE_URL}/reset-password?token=...`.

2. **Configure SMTP** with one of these options:

   **Option A – Single URL (e.g. SendGrid, Mailgun):**
   ```bash
   SMTP_URL=smtps://apikey:YOUR_KEY@smtp.sendgrid.net:465
   ```
   Or for Mailgun: `smtps://postmaster@your-domain.mailgun.org:password@smtp.mailgun.org:465`

   **Option B – Separate vars (e.g. Gmail, any SMTP):**
   ```bash
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USER=your@gmail.com
   SMTP_PASS=your-app-password
   SMTP_FROM=noreply@mygolfapp.com   # optional; defaults to SMTP_USER
   ```

3. **Frontend:** Build a “Reset password” screen that reads `token` from the URL (e.g. `?token=...`), lets the user enter a new password, and calls `POST /auth/reset-password` with `{ token, newPassword }`.

---

## Environment variables

| Variable | Purpose |
|----------|---------|
| `JWT_SECRET` | Signing key for JWT (required in production). |
| `RESET_PASSWORD_BASE_URL` | Base URL for reset links (e.g. `https://mygolfapp.com`). |
| `SMTP_URL` | Full SMTP connection string (overrides SMTP_HOST etc. if set). |
| `SMTP_HOST` | SMTP server hostname (e.g. `smtp.gmail.com`, `smtp.sendgrid.net`). |
| `SMTP_PORT` | SMTP port (default `587`). |
| `SMTP_SECURE` | Set to `true` for port 465. |
| `SMTP_USER` | SMTP username / email. |
| `SMTP_PASS` | SMTP password or app password. |
| `SMTP_FROM` | From address in emails (defaults to `SMTP_USER`). |
