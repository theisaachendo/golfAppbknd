# Golf App – Backend API

Node.js/Express API for the golf betting (skins, per-hole, per-match) app. This repo is the **backend only**; the mobile app lives in a separate repo.

## Stack

- Node.js, Express
- JWT auth, in-memory store (see `PRODUCTION.md` for DB options)

## Run locally

```bash
npm install
npm run dev
```

API: http://localhost:3000 (e.g. http://localhost:3000/health)

## Deploy

See **`DEPLOY.md`** for Render, Vercel, or Railway. **Render** is the simplest: connect this repo, root is the repo root, build `npm install`, start `npm start`.

## Docs

| File | Purpose |
|------|--------|
| `API.md` | API routes and examples |
| `DEPLOY.md` | Deploy to Render / Vercel / Railway |
| `PRODUCTION.md` | Production notes (env, DB, etc.) |
