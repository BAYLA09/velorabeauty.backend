# velorabeauty.backend

Production backend for **Velora Beauty**: Customer 360, secure **Grok Agent API**, email delivery, support, campaigns, and admin controls.

## Architecture

```text
STORE → BACKEND → POSTGRESQL → Customer 360
                      ↓
              Secure Grok Agent API
                      ↓
                    GROK → decisions / copy
                      ↓
              BACKEND validation → EMAIL PROVIDER → CUSTOMER
```

- **Grok**: intelligence (personalization, support, campaigns)
- **Backend**: security, rules, delivery, audit
- **GitHub**: source only — no customer data or secrets
- **EasyPanel**: hosting

## Documentation

| Doc | Purpose |
| --- | --- |
| [docs/EASYPANEL.md](docs/EASYPANEL.md) | Deploy + env vars |
| [docs/GROK_AGENT.md](docs/GROK_AGENT.md) | Agent API reference |
| [docs/GROK_TOOL_MANIFEST.json](docs/GROK_TOOL_MANIFEST.json) | Tool definitions for Grok |
| [docs/GROK_SYSTEM_PROMPT.md](docs/GROK_SYSTEM_PROMPT.md) | System prompt template |
| [docs/EMAIL_DELIVERABILITY.md](docs/EMAIL_DELIVERABILITY.md) | SPF/DKIM/DMARC + SendGrid |
| [docs/EMAIL_STRATEGY.md](docs/EMAIL_STRATEGY.md) | Strategy split Grok vs backend |

## Commands

```bash
cp .env.example .env   # local only — never commit .env
npm install
DATABASE_URL=... npx prisma migrate deploy
npm run dev
npm run build
npm test
npm run prisma:validate
```

## API surfaces

| Auth | Prefix | Consumer |
| --- | --- | --- |
| `STORE_API_KEY` | `/api/customers`, `/api/checkouts`, `/api/orders`, `/api/support`, `/api/admin` | Store + owner admin |
| `GROK_AGENT_API_KEY` | `/api/agent` | Grok only |
| Public | `/api/unsubscribe`, `/health` | Customers / monitors |
