# What You Need to Do: Deploy API & Run in Production

This checklist is what **you** need to do so the API runs in production and people can use the app.

---

## 1. Deploy the API (backend)

### Option A: Render (free tier, good for MVP)

1. **Push this backend to GitHub** (as its own repo, or as the `backend` folder in a monorepo).
2. **Sign up at [render.com](https://render.com)** (log in with GitHub).
3. **New → Web Service** → connect the repo that contains this backend.
4. **Settings:**
   - **Root Directory:** Leave blank if the repo root is the backend (has `package.json`). If the repo has a `backend` folder, set **Root Directory:** `backend`.
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Free
5. **Environment variables** (in Render dashboard → your service → Environment):
   - `JWT_SECRET` = a long random string (e.g. from `openssl rand -hex 32`). **Required** so tokens are secure.
   - `NODE_VERSION` = `20` (optional; Render often uses this from `render.yaml`).
6. **Create Web Service.** Render will build and deploy.
7. **Copy your API URL:** `https://golf-app-api.onrender.com` (or whatever name you chose). You’ll use this in the app.

**Note:** On the free tier, the service sleeps after ~15 minutes of no traffic. The first request after that can take 30–60 seconds (cold start).

### Option B: Railway

1. Sign up at [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub** → select the repo.
2. Set **Root Directory** to the folder that has `package.json` (e.g. `backend` if in a monorepo).
3. Add env var: `JWT_SECRET` = long random string.
4. Deploy; copy the generated URL (e.g. `https://golf-app-api.up.railway.app`).

---

## 2. Point the app at the production API

In your **Expo/frontend** project:

1. **Create or edit `.env`:**
   ```bash
   EXPO_PUBLIC_API_URL=https://golf-app-api.onrender.com
   ```
   Use your real URL from step 1 (no trailing slash).

2. **Use this URL everywhere** you call the API (login, games, balance, etc.). If you have a single `api` client that reads `process.env.EXPO_PUBLIC_API_URL`, that’s enough.

3. **Rebuild the app** after changing `.env` (Expo bakes `EXPO_PUBLIC_*` in at build time).

---

## 3. Build the app for users to download

People can’t “download” a dev server. You need to build installable apps and (optionally) publish to stores.

### Development / internal testing (no store)

- **Expo Go:** Share the project; others open it in Expo Go and point to your production API. Easiest for a few testers.
- **Dev builds:** `eas build --profile development` (or preview) and share the `.ipa` / `.apk` / link. Testers install and use the same `EXPO_PUBLIC_API_URL` (production) in the build.

### Production: App Store & Play Store

1. **Expo EAS (recommended):**
   - Install EAS CLI: `npm i -g eas-cli`
   - Log in: `eas login`
   - In the **frontend** repo: `eas build:configure`, then:
     - **iOS:** `eas build --platform ios --profile production`
     - **Android:** `eas build --platform android --profile production`
   - After the build, **submit** to the stores: `eas submit` (or upload the built binary manually).

2. **Apple App Store:**
   - You need an **Apple Developer account** ($99/year).
   - In App Store Connect, create an app, set metadata, then upload the build (via EAS Submit or Xcode).

3. **Google Play Store:**
   - You need a **Google Play Developer account** (one-time fee).
   - Create an app in Play Console, set store listing, then upload the AAB from EAS (or build locally).

4. **Important:** Your production build must use `EXPO_PUBLIC_API_URL=https://your-production-api.com` so the installed app talks to your deployed API, not localhost.

---

## 4. Data persistence (when you’re ready)

Right now the backend uses **in-memory** storage:

- Data is lost when the server restarts.
- On Render free tier, the service sleeps; when it wakes, memory is empty (new users, no old games).

**When you want real persistence:**

1. Add a database (e.g. **Render PostgreSQL**, **Supabase**, or **MongoDB Atlas**).
2. Set `DATABASE_URL` in your host’s environment variables.
3. Replace the in-memory store in `src/data/store.js` with DB calls (or add a small persistence layer and keep the same route handlers).

Until then, the app works for demos and testing; just be aware that “production” without a DB means no long-term data.

---

## 5. Quick checklist

| Step | What you do |
|------|-------------|
| Deploy API | Push backend to GitHub → Render or Railway → add `JWT_SECRET` → copy API URL |
| App config | Set `EXPO_PUBLIC_API_URL` to that URL in the frontend `.env` |
| Build app | Use EAS Build (or similar) with production profile and same API URL |
| Test | Install the built app (or use Expo Go) and sign in / create game / etc. |
| Publish (optional) | Apple + Google developer accounts → EAS Submit or manual upload |
| Later | Add a database and `DATABASE_URL` for persistent data |

---

## 6. Security reminder

- **Never** commit `.env` or put `JWT_SECRET` in the repo. Set secrets only in the host’s environment (Render/Railway dashboard).
- In production, use a **strong** `JWT_SECRET` (e.g. `openssl rand -hex 32`).
- When you add a DB, keep `DATABASE_URL` only in env vars, not in code.
