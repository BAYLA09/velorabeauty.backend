# EasyPanel deployment

Deploy the **backend** service from this repository (`main` branch). PostgreSQL runs as a separate EasyPanel service. **Never** put real secrets in GitHub — set them in **backend → Environment**.

## Services

| Service | Purpose |
| --- | --- |
| **database** | PostgreSQL |
| **backend** | This API (Dockerfile in repo root) |
| **frontend** | Your storefront (separate repo/service) |

## Required environment variables (backend)

Copy these into **velorabeauty → backend → Environment**. Generate unique random values for API keys (32+ characters).

| Variable | Required | Description |
| --- | --- | --- |
| `DATABASE_URL` | Yes | Internal Postgres URL from EasyPanel database service |
| `STORE_API_KEY` | Yes | Authenticates store/webhook routes (`/api/customers`, `/api/checkouts`, …) |
| `GROK_AGENT_API_KEY` | Yes | Authenticates Grok-only routes (`/api/agent/*`) — **give this to Grok, not the DB URL** |
| `EMAIL_PROVIDER` | Yes | `console` (no delivery) or `sendgrid` (production) |
| `EMAIL_API_KEY` | If SendGrid | SendGrid API key with Mail Send permission |
| `EMAIL_FROM` | Yes | Verified sender address (e.g. your Gmail until domain is ready) |
| `EMAIL_REPLY_TO` | Yes | Reply-to address (often same as `EMAIL_FROM`) |
| `NODE_ENV` | Recommended | `production` |
| `PORT` | Optional | Default `3000` (match EasyPanel port mapping) |

### Example values (templates — replace secrets in EasyPanel)

```env
NODE_ENV=production
PORT=3000

DATABASE_URL=postgresql://USER:PASSWORD@velorabeauty_database:5432/velorabeauty?schema=public

STORE_API_KEY=<generate-long-random-string>
GROK_AGENT_API_KEY=<generate-different-long-random-string>

EMAIL_PROVIDER=sendgrid
EMAIL_API_KEY=<your-sendgrid-api-key>
EMAIL_FROM=beautyvelora038@gmail.com
EMAIL_REPLY_TO=beautyvelora038@gmail.com
```

Use the **internal** hostname EasyPanel provides for Postgres (not a public IP) in `DATABASE_URL`.

## SendGrid setup

1. Create a SendGrid account and API key with **Mail Send** scope → set as `EMAIL_API_KEY`.
2. **Verify a sender** matching `EMAIL_FROM`:
   - For Gmail, use [Single Sender Verification](https://docs.sendgrid.com/ui/sending-email/sender-verification) for `beautyvelora038@gmail.com`, **or**
   - Later: domain authentication for `support@yourdomain.com` and update `EMAIL_FROM` / `EMAIL_REPLY_TO` in EasyPanel only.
3. Set `EMAIL_PROVIDER=sendgrid` and redeploy.
4. If SendGrid rejects mail, check backend logs; failed sends are stored as `FAILED` in the database, not `SENT`.

## Local / staging without SendGrid

Set `EMAIL_PROVIDER=console` — emails are logged only (safe for testing logic and `EMAIL_MESSAGES` records).

## Deploy steps

1. Connect GitHub repo to **backend** service, branch `main`.
2. Add all environment variables above.
3. Deploy; container runs `prisma migrate deploy` then starts the API.
4. Verify: `GET https://<your-backend-host>/health` → `{ "status": "ok", "database": "connected" }`.

## What Grok receives vs what stays on the server

| Give to Grok | Keep on server only |
| --- | --- |
| Public backend URL | `DATABASE_URL` |
| `GROK_AGENT_API_KEY` | `STORE_API_KEY`, `EMAIL_API_KEY` |

## Optional tuning

```env
AGENT_EMAIL_RATE_LIMIT_WINDOW_MS=60000
AGENT_EMAIL_RATE_LIMIT_MAX=30
DUPLICATE_EMAIL_WINDOW_MINUTES=60
ABANDONED_CHECKOUT_MIN_AGE_MINUTES=60
ABANDONED_CHECKOUT_COOLDOWN_HOURS=24
```

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Build fails on Prisma | Latest `main` includes Dockerfile fixes (schema copied before `npm ci`) |
| Container exits on start | Missing/invalid env vars; view runtime logs |
| Grok gets 401 | Wrong or missing `Authorization: Bearer` header |
| Email 422 | Consent, unsubscribe, checkout state, or duplicate rules — read `reason` / `code` |
| SendGrid 502 | Sender not verified or invalid `EMAIL_API_KEY` |
