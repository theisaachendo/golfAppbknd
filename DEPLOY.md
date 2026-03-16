# Deploy Backend for Free

## Option A: Render (recommended, no credit card)

1. Push this repo to **GitHub**.
2. Sign up at [render.com](https://render.com) (GitHub login).
3. **New** → **Web Service**.
4. Connect your GitHub repo and select it.
5. Settings:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Free
6. Click **Create Web Service**. Render builds and deploys.
7. Your API URL: `https://<your-service-name>.onrender.com`

**Note:** Free services “spin down” after ~15 minutes of no traffic. The first request after that may take 30–60 seconds (cold start).

---

## Option B: Vercel (serverless)

1. Install Vercel CLI: `npm i -g vercel`
2. From repo root: `vercel`
3. Follow prompts (link to a new or existing Vercel project).
4. Vercel will detect Node and deploy.

For a single Express app, you might need to use a serverless adapter (e.g. `@vercel/node` with a single handler). For the simplest path, Render is easier for an Express server.

---

## Option C: Railway

1. Sign up at [railway.app](https://railway.app).
2. **New Project** → **Deploy from GitHub** → select this repo.
3. Deploy (repo root is the backend).
4. You get a URL like `https://golf-app-api.up.railway.app`.

Free tier gives a monthly credit; usage is deducted from it.

---

## After deploy

- Use the deployed URL as `API_BASE_URL` (or similar) in your iPhone app.
- Add a free database when needed (Render PostgreSQL, [Supabase](https://supabase.com), or [MongoDB Atlas](https://www.mongodb.com/atlas)) and set `DATABASE_URL` in the service’s environment variables.
