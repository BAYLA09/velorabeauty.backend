# velorabeauty.backend

Production backend for Velora Beauty ecommerce: PostgreSQL persistence, store APIs, and a **secured agent API** for Grok (email + support automation).

## Architecture

| Layer | Responsibility |
| --- | --- |
| **This backend** | Database, business rules, email sending, auth, deployment |
| **Grok (agent)** | Copy, personalization, support decisions — **no direct DB access** |
| **PostgreSQL** | Customers, orders, checkouts, email history, support tickets |
| **GitHub** | Source + config templates only (**no customer data**) |
| **EasyPanel** | Deploy API + managed PostgreSQL |

Grok authenticates with `Authorization: Bearer <GROK_AGENT_API_KEY>` on `/api/agent/*` routes only.

## Quick start (local)

```bash
cp .env.example .env
# Edit .env with local DATABASE_URL and API keys

docker compose up -d postgres
npm install
npx prisma migrate deploy
npm run dev
```

## API overview

### Store (Bearer `STORE_API_KEY`)

| Method | Path | Description |
| --- | --- | --- |
| POST | `/api/customers` | Upsert customer + marketing consent |
| POST | `/api/checkouts` | Start / update checkout session |
| POST | `/api/checkouts/:id/abandon` | Mark checkout abandoned |
| POST | `/api/checkouts/:id/recover` | Mark checkout recovered |
| POST | `/api/orders` | Create order + recover related checkout |
| POST | `/api/support/inbound` | Inbound support email webhook |

### Public

| Method | Path | Description |
| --- | --- | --- |
| POST | `/api/unsubscribe` | Record unsubscribe + update customer |
| GET | `/health` | Liveness + DB check |

### Grok agent (Bearer `GROK_AGENT_API_KEY`)

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/agent/customers/:email` | Safe customer profile |
| GET | `/api/agent/customers/:id/orders` | Order history |
| GET | `/api/agent/customers/:id/checkouts` | Checkout history |
| GET | `/api/agent/customers/:id/emails` | Full email thread history |
| GET | `/api/agent/customers/:id/context` | Consolidated context for Grok |
| GET | `/api/agent/checkouts/abandoned` | Eligible abandoned carts |
| POST | `/api/agent/email/send` | Validated outbound email |
| POST | `/api/agent/support/reply` | Support reply (human gate for sensitive cases) |

## Email send validation

Outbound agent emails are blocked unless: valid recipient, customer exists, recipient matches customer, marketing rules/consent/unsubscribe checks pass, checkout eligibility (when applicable), no duplicate within window, rate limits, and valid agent auth.

## EasyPanel deployment

1. Create a PostgreSQL service and set `DATABASE_URL` on the API service (secrets in EasyPanel only).
2. Deploy from this repo using the included `Dockerfile`.
3. Set `STORE_API_KEY`, `GROK_AGENT_API_KEY`, `FROM_EMAIL`, and email provider env vars.
4. On boot, the container runs `prisma migrate deploy` then starts the API.

## Security notes

- Never commit `.env` or customer exports.
- Rotate `GROK_AGENT_API_KEY` independently of database credentials.
- Grok should only receive the agent API base URL + key, not `DATABASE_URL`.
