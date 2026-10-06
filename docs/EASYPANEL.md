# EasyPanel — Velora Beauty backend

## Services

| Service | Role |
| --- | --- |
| **database** | PostgreSQL (persistent memory) |
| **backend** | This API (Dockerfile) |
| **frontend** | Storefront (separate) |

## Deploy

1. GitHub repo → **backend** service, branch **`main`**
2. Add environment variables below
3. Deploy → container runs `prisma migrate deploy` then starts API
4. Map domain + **HTTPS** (required for production webhooks and trust)
5. Health: `GET https://YOUR_HOST/health`

## Required environment variables

Set in **backend → Environment** (never commit real values):

```env
NODE_ENV=production
PORT=3000

DATABASE_URL=<internal-postgres-url-from-easypanel>

STORE_API_KEY=<long-random-string>
GROK_AGENT_API_KEY=<different-long-random-string>

EMAIL_PROVIDER=sendgrid
EMAIL_API_KEY=<sendgrid-api-key>
EMAIL_FROM=beautyvelora038@gmail.com
EMAIL_REPLY_TO=beautyvelora038@gmail.com
EMAIL_UNSUBSCRIBE_URL=https://YOUR_HOST/api/unsubscribe

MAX_MARKETING_EMAILS_PER_7_DAYS=3
ABANDONED_CHECKOUT_DELAY_MINUTES=30
WINBACK_DAYS=60
```

Optional: `ABANDONED_CHECKOUT_MESSAGE2_HOURS`, `ABANDONED_CHECKOUT_MESSAGE3_HOURS`, `VIP_MIN_TOTAL_SPENT`, rate limits — see `.env.example`.

## What Grok receives

| Provide to Grok | Never give Grok |
| --- | --- |
| `https://YOUR_HOST/api/agent` | `DATABASE_URL` |
| `GROK_AGENT_API_KEY` | `STORE_API_KEY`, `EMAIL_API_KEY` |

## Webhooks

| Source | Target | Auth |
| --- | --- | --- |
| Store / ESP inbound mail | `POST /api/support/inbound` | Bearer `STORE_API_KEY` |
| Deploy trigger | EasyPanel deploy URL | EasyPanel token |

## Migrations

New releases apply SQL via `prisma migrate deploy` on container start. Ensure **one** Postgres instance and correct `DATABASE_URL`.

## Admin (owner only)

Routes under `/api/admin/*` use **`STORE_API_KEY`** — pause marketing, view failures, unsubscribes. Grok agent key **cannot** access these.

## SendGrid

Verify sender matching `EMAIL_FROM` before production sends. See [EMAIL_DELIVERABILITY.md](./EMAIL_DELIVERABILITY.md).

## MCP (optional)

Same REST API can be wrapped in a custom MCP server later; PostgreSQL stays on the backend only. See [GROK_AGENT.md](./GROK_AGENT.md).
