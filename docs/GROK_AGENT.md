# Grok agent integration

Grok manages **what** to write and **when** to respond. This backend manages **data**, **rules**, **history**, and **delivery**. Grok must **never** receive `DATABASE_URL` or direct PostgreSQL access.

**Machine-readable tools:** [GROK_TOOL_MANIFEST.json](./GROK_TOOL_MANIFEST.json)  
**System prompt:** [GROK_SYSTEM_PROMPT.md](./GROK_SYSTEM_PROMPT.md)

### Customer 360 & intelligence endpoints (summary)

| Tool name | Method | Path |
| --- | --- | --- |
| get_customer | GET | `/customers/:emailOrId` |
| get_customer_context | GET | `/customers/:emailOrId/context` |
| get_customer_timeline | GET | `/customers/:emailOrId/timeline` |
| get_customer_orders | GET | `/customers/:emailOrId/orders` |
| get_customer_checkouts | GET | `/customers/:emailOrId/checkouts` |
| get_customer_email_history | GET | `/customers/:emailOrId/emails` |
| search_customers | GET | `/customers/search?q=` |
| get_customer_segments | GET | `/customers/:emailOrId/segments` |
| list segments | GET | `/segments` |
| customers by segment | GET | `/segments/:slug/customers` |
| get_abandoned_checkouts | GET | `/checkouts/abandoned` |
| check_email_eligibility | POST | `/email/check-eligibility` |
| send_email | POST | `/email/send` |
| get_email_metrics | GET | `/metrics/email` |
| get_campaign | GET | `/campaigns/:id` |
| create_campaign | POST | `/campaigns` |
| activate_campaign | POST | `/campaigns/:id/activate` |
| get_campaign_metrics | GET | `/metrics/campaigns/:id` |
| create_support_ticket | POST | `/support/tickets` |
| get_support_ticket | GET | `/support/tickets/:id` |
| reply_to_customer | POST | `/support/reply` |
| mark_human_required | POST | `/support/tickets/:id/human-required` |
| record_customer_event | POST | `/events` |

### MCP vs REST

- **Option A (default):** HTTPS REST + Bearer `GROK_AGENT_API_KEY`
- **Option B:** Custom MCP connector exposing the same operations — PostgreSQL remains on the backend only

## Architecture

```text
Store → Backend API → PostgreSQL
              ↓
       Secure Grok Agent API (/api/agent/*)
              ↓
            Grok
              ↓
       POST /api/agent/email/send (or /support/reply)
              ↓
       Email provider (SendGrid) → Customer
```

## API base URL

Use your deployed backend public URL (EasyPanel domain or custom domain):

```text
https://<your-backend-host>
```

All Grok endpoints are under:

```text
https://<your-backend-host>/api/agent
```

Example (replace with your real host):

```text
https://api.velorabeauty.example.com/api/agent
```

## Authentication

Every `/api/agent/*` request requires:

```http
Authorization: Bearer <GROK_AGENT_API_KEY>
Content-Type: application/json
```

- `GROK_AGENT_API_KEY` is set only in EasyPanel / server environment.
- Generate a long random string (32+ characters).
- **Do not** share `STORE_API_KEY` or `DATABASE_URL` with Grok.

Unauthorized requests receive `401` with `{ "error": "Unauthorized", "code": "AGENT_AUTH_REQUIRED" }`.

---

## Endpoints

### GET `/customers/:emailOrId`

Lookup by **customer id** or **URL-encoded email** (e.g. `user%40example.com`).

**Response `200`:**

```json
{
  "customer": {
    "id": "clx...",
    "email": "customer@example.com",
    "firstName": "Jane",
    "lastName": "Doe",
    "phone": null,
    "country": "US",
    "marketingConsent": true,
    "marketingConsentAt": "2026-10-06T12:00:00.000Z",
    "unsubscribed": false,
    "unsubscribedAt": null,
    "createdAt": "2026-10-06T12:00:00.000Z",
    "updatedAt": "2026-10-06T12:00:00.000Z"
  }
}
```

---

### GET `/customers/:emailOrId/context`

Consolidated context for decision-making (orders, checkouts, emails, tickets, consent).

**Response `200`:**

```json
{
  "customer": { "...": "same as above" },
  "marketingConsent": true,
  "unsubscribeStatus": {
    "unsubscribed": false,
    "unsubscribedAt": null
  },
  "recentOrders": [],
  "activeAndAbandonedCheckouts": [],
  "emailHistory": [],
  "supportTickets": []
}
```

---

### GET `/customers/:emailOrId/orders`

**Response `200`:**

```json
{
  "customerId": "clx...",
  "orders": [
    {
      "id": "clx...",
      "customerId": "clx...",
      "externalOrderId": "shop-1001",
      "totalAmount": "99.00",
      "currency": "USD",
      "status": "paid",
      "createdAt": "2026-10-06T12:00:00.000Z",
      "updatedAt": "2026-10-06T12:00:00.000Z"
    }
  ]
}
```

---

### GET `/customers/:emailOrId/checkouts`

**Response `200`:**

```json
{
  "customerId": "clx...",
  "checkouts": []
}
```

---

### GET `/customers/:emailOrId/emails`

Full email history (inbound + outbound).

**Response `200`:**

```json
{
  "customerId": "clx...",
  "emails": [
    {
      "id": "clx...",
      "direction": "OUTBOUND",
      "type": "ABANDONED_CHECKOUT",
      "subject": "...",
      "body": "...",
      "status": "SENT",
      "sentAt": "2026-10-06T12:00:00.000Z",
      "createdAt": "2026-10-06T12:00:00.000Z"
    }
  ]
}
```

---

### GET `/checkouts/abandoned`

Eligible abandoned carts for follow-up (consent, not unsubscribed, cooldown, no recent duplicate abandoned email).

**Response `200`:**

```json
{
  "count": 1,
  "items": [
    {
      "checkout": {
        "id": "clx...",
        "externalCheckoutId": "cart-abc",
        "cartData": { "items": [] },
        "totalAmount": "49.00",
        "currency": "USD",
        "abandonedAt": "2026-10-06T10:00:00.000Z",
        "status": "ABANDONED"
      },
      "customer": {
        "id": "clx...",
        "email": "customer@example.com",
        "firstName": "Jane",
        "lastName": "Doe",
        "marketingConsent": true,
        "unsubscribed": false
      },
      "previousEmails": []
    }
  ]
}
```

---

### POST `/email/send`

Backend validates, sends via configured provider, and **always** records outbound mail in `EMAIL_MESSAGES`. Failed sends are stored with status `FAILED`, not `SENT`.

**Request:**

```json
{
  "customerId": "clx...",
  "recipientEmail": "customer@example.com",
  "subject": "You left something in your cart",
  "body": "Plain text body...",
  "type": "ABANDONED_CHECKOUT",
  "checkoutId": "clx...",
  "model": "grok-4"
}
```

`type` enum: `ABANDONED_CHECKOUT` | `FOLLOW_UP` | `SUPPORT` | `ORDER_UPDATE` | `OTHER`

**Success `201`:**

```json
{
  "sent": true,
  "emailMessage": { "id": "...", "status": "SENT", "providerMessageId": "..." },
  "providerMessageId": "..."
}
```

**Validation failure `422` (email not sent):**

```json
{
  "sent": false,
  "reason": "Marketing consent is required for this email type",
  "code": "MARKETING_CONSENT_REQUIRED"
}
```

Common codes: `INVALID_EMAIL`, `CUSTOMER_NOT_FOUND`, `RECIPIENT_MISMATCH`, `CUSTOMER_UNSUBSCRIBED`, `MARKETING_CONSENT_REQUIRED`, `CHECKOUT_NOT_ABANDONED`, `DUPLICATE_EMAIL`, `EMAIL_SEND_FAILED`, `RATE_LIMIT_EXCEEDED` (429 from rate limiter).

---

### POST `/support/reply`

**Request:**

```json
{
  "customerId": "clx...",
  "ticketId": "clx...",
  "recipientEmail": "customer@example.com",
  "subject": "Re: Your order",
  "body": "Plain text reply...",
  "aiConfidence": 0.92,
  "model": "grok-4"
}
```

**Sent `201`:** `{ "sent": true, "emailMessage": {...}, "ticket": {...} }`

**Human required `409`:** sensitive topics (refunds, legal, etc.) or low confidence — no email sent.

**Blocked `422`:** validation / duplicate / provider errors.

---

## Example: abandoned checkout workflow

1. **Poll** `GET /api/agent/checkouts/abandoned`.
2. For each item, **load context** optionally: `GET /api/agent/customers/{customerId}/context`.
3. **Review** `emailHistory` and `previousEmails` to avoid repetition.
4. **Compose** subject/body in Grok.
5. **Send** `POST /api/agent/email/send` with `type: ABANDONED_CHECKOUT` and `checkoutId`.
6. If `422`, adjust or skip; if `201`, record `emailMessage.id` in your Grok run logs.

```bash
curl -sS -X GET "https://<host>/api/agent/checkouts/abandoned" \
  -H "Authorization: Bearer $GROK_AGENT_API_KEY"

curl -sS -X POST "https://<host>/api/agent/email/send" \
  -H "Authorization: Bearer $GROK_AGENT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "customerId": "CUSTOMER_ID",
    "recipientEmail": "customer@example.com",
    "subject": "Complete your Velora order",
    "body": "Hi Jane, ...",
    "type": "ABANDONED_CHECKOUT",
    "checkoutId": "CHECKOUT_ID"
  }'
```

---

## Example: customer support workflow

1. Store receives inbound mail → `POST /api/support/inbound` (store API key, not Grok).
2. Grok **loads** `GET /api/agent/customers/{email}/context` and `/emails`.
3. Grok **drafts** reply; checks ticket status in `supportTickets`.
4. Grok **sends** `POST /api/agent/support/reply` with `ticketId` and `aiConfidence`.
5. If response is `409` / `humanRequired`, escalate to a human — do not retry blindly.

```bash
curl -sS -X GET "https://<host>/api/agent/customers/customer%40example.com/context" \
  -H "Authorization: Bearer $GROK_AGENT_API_KEY"

curl -sS -X POST "https://<host>/api/agent/support/reply" \
  -H "Authorization: Bearer $GROK_AGENT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "customerId": "CUSTOMER_ID",
    "ticketId": "TICKET_ID",
    "recipientEmail": "customer@example.com",
    "subject": "Re: Shipping question",
    "body": "Thanks for reaching out...",
    "aiConfidence": 0.95
  }'
```

---

## Grok tool configuration (conceptual)

Configure HTTP tools or actions pointing to the URLs above with header `Authorization: Bearer <GROK_AGENT_API_KEY>`. Restrict tools to `/api/agent/*` only.

When you change sender address later, update `EMAIL_FROM` / `EMAIL_REPLY_TO` in EasyPanel only — **no Grok or code changes required**.
