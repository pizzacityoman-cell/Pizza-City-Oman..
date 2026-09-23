# Pizza City Oman

Full-stack restaurant ordering system with an online menu, cart, WhatsApp invoice routing, and an admin dashboard.

**Stack:** Express + MongoDB (Mongoose) + React (Vite) + TypeScript + Tailwind CSS

---

## Architecture

- **Netlify** — serves the built React client and proxies `/api/*` + `/admin/api/*` to the Railway backend (see `netlify.toml`). The proxy uses `status = 200` rewrites so the browser sees a single origin, keeping cookies and CORS simple.
- **Railway** — runs the Express backend (API + admin API + data layer). Build/start config lives in `railway.json`.
- **Hostinger** — DNS only; the custom domain points at Netlify.

## Features

- Public menu, banners, branches, promo codes, order placement with server-side pricing
- WhatsApp order notification to the selected outlet
- Order tracking by reference ID
- JWT auth with two roles: **superadmin** (full access) and **moderator** (outlet-restricted)
- Admin dashboard: orders, menu manager, banners, promos, branches, users, image uploads
- Optional Google Sheets order sync
- Graceful in-memory/local fallback when MongoDB is unavailable

## Auth System

JWT-based with two roles: **superadmin** (full access) and **moderator** (outlet-restricted). Login at `/auth/login`, token refresh via httpOnly cookie.

## Environment Variables (`.env`)

See `.env.example` for the full list:

| Variable | Required | Description |
| --- | --- | --- |
| `JWT_SECRET` | yes | JWT access-token signing secret |
| `JWT_REFRESH_SECRET` | yes (prod) | Separate signing key for refresh tokens |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | yes | Seed credentials for the initial superadmin |
| `MONGODB_URI` | no | MongoDB connection string (empty = in-memory/local fallback) |
| `CLOUDFLARE_R2_ACCOUNT_ID` / `CLOUDFLARE_R2_ACCESS_KEY_ID` / `CLOUDFLARE_R2_SECRET_ACCESS_KEY` / `CLOUDFLARE_R2_BUCKET_NAME` / `CLOUDFLARE_R2_PUBLIC_URL` | no | R2 media storage for banner/menu uploads (auto-optimized to WebP) |
| `ALLOWED_ORIGIN` | no | CORS origin; defaults to `https://pizzacityoman.com` |

## Setup & Commands

```bash
npm install
npm run dev        # dev server (Express + Vite HMR)
npm run build      # production build (client + server bundle)
npm run start      # production server (serves dist/ + API)
npm run lint       # TypeScript check (tsc --noEmit)
```

## Public API Endpoints

- `GET /api/health`
- `GET /api/menu`
- `GET /api/banners`
- `GET /api/branches`
- `POST /api/orders`
- `GET /api/orders/track/:id`
- `POST /api/promos/validate`
- `GET /api/promos/list`

## Authenticated API Endpoints

- `GET /api/orders/:outletId` (moderator/superadmin)
- `GET /api/orders/:outletId/summary`
- `PATCH /api/orders/:id/status`
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`

## Admin-Only API Endpoints

Full CRUD for branches, promos, banners, menu items, and users under `/admin/api/*` (superadmin required), plus `POST /admin/api/upload?type=banner|menu|branch|misc` for R2 image uploads (auto-resized + WebP).

Migrate legacy Cloudinary assets: `npx tsx scripts/migrate-cloudinary-to-cloudflare.ts --dry-run` then without flags for live rewrite.

## Deployment

### Backend — Railway

- Connect the GitHub repo as a **new web service**.
- `railway.json` supplies the build/start/healthcheck config (build: `npm run build`, start: `npm start`, health check path: `/api/health`).
- Set the env vars listed above (values from your local `.env`; never commit secrets).
- Verify with `https://<service>.up.railway.app/api/health` — expect `status: "ok"` and `database: "MongoDB Atlas"`.

### Frontend — Netlify

- `netlify.toml` builds the client (`npm run build:client`), publishes `dist/`, provides SPA fallback, and proxies `/api/*` and `/admin/api/*` to the Railway URL.
- After creating the Railway service, update the proxy targets in `netlify.toml` to the new URL.

### Custom domain — Hostinger

- Add the domain under Netlify → Site → **Domain management**.
- In Hostinger DNS (keep DNS at Hostinger):
  - `A` record `@` → `75.2.60.5` (Netlify load balancer)
  - `CNAME` record `www` → `<site>.netlify.app`
- Netlify auto-issues SSL once DNS propagates.
- Set `ALLOWED_ORIGIN` on Railway to `https://<your-domain>`.

### Deployment checklist

- [ ] Push code to GitHub (`.gitignore` excludes `node_modules/`, `dist/`, `.env*`)
- [ ] Create Railway service from repo; confirm env vars + health check
- [ ] Update `netlify.toml` proxy URLs to the Railway service
- [ ] Attach custom domain in Netlify + point Hostinger DNS records
- [ ] Smoke-test public site, order placement (WhatsApp link), and admin login
- [ ] Retire any old/stale Railway services
