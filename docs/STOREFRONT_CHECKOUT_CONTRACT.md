# Storefront checkout contract

Audience: the Velora Beauty storefront (`velorabeauty.frontend`). This backend does not run Stripe and does not own the shopper session. The storefront already verifies Stripe signatures in `src/app/api/stripe/webhook/route.ts` and stores orders in its own database. Keep that. Forward lifecycle events here with `STORE_API_KEY`.

Base URL is the backend origin. All store routes below use:

```http
Authorization: Bearer <STORE_API_KEY>
Content-Type: application/json
```

The Grok agent key cannot call these routes. The store key cannot call `/api/agent`.

## Why payment is forwarded, not webhooked here

This API has no Stripe SDK and no `STRIPE_WEBHOOK_SECRET`. The storefront already handles `payment_intent.succeeded` and `checkout.session.completed`, then sets its order status to `paid`. Adding a second webhook would split signature verification and require a production Stripe change. After the storefront marks an order paid, it calls `POST /api/orders` (below). That call is idempotent.

## Identifier

Use one stable id for the whole attempt. Recommended value: the storefront order UUID (`orders.id`), because both the Stripe Checkout Session flow and the PaymentIntent flow create that row before payment.

| Field | Value |
| --- | --- |
| `externalCheckoutId` | Storefront order UUID |
| `externalOrderId` | Same storefront order UUID |

A Stripe id (`cs_...` or `pi_...`) is allowed as `externalCheckoutId` only if every later call repeats that exact string. Do not create the checkout with a session id and recover it with the order UUID. Put Stripe ids inside `cartData` either way.

`cartData` must be a JSON object, not an array. Amounts are major units (AED dirhams), not fils. `currency` is three letters, for this shop `AED`.

## When to call each route

### 1. `POST /api/checkouts` — shopper has an email and an open checkout

Call when a valid email is known and checkout has started (Checkout Session created, PaymentIntent created, or the form is submitted with an email). Call again with the same `externalCheckoutId` when the cart or total changes.

Do not poll this route on a timer. Each call refreshes activity. A heartbeat would keep the checkout `ACTIVE` forever and no abandonment email would send.

Skip the call when there is no email. This API rejects an invalid email with `400 INVALID_EMAIL`, and abandoned-checkout mail has nowhere to go. The storefront order row does not currently store email. Pass the address the shopper typed.

`marketingConsent: true` only when the shopper opted in. Omitted or `false` still stores the checkout, and the agent will not email it.

**Create `201`:**

```json
{
  "created": true,
  "checkout": {
    "id": "clx...",
    "externalCheckoutId": "0f1c2a3b-4d5e-6789-aaaa-bbbbbbbbbbbb",
    "status": "ACTIVE",
    "email": "shopper@example.com",
    "currency": "AED",
    "abandonedAt": null,
    "recoveredAt": null
  }
}
```

**Replay `200`:** same `externalCheckoutId`.

- `ACTIVE`: cart, total, currency, and email are updated. No second `CHECKOUT_STARTED` event.
- `ABANDONED`: shopper came back. Status returns to `ACTIVE`, `abandonedAt` is cleared, cart is updated. Previous sends still count toward the 3-message cap.
- `RECOVERED` or `EXPIRED`: body is ignored and the stored row is returned unchanged. A new purchase attempt needs a new id.

If a paid order with this `externalCheckoutId` was already stored, the checkout is created or updated as `RECOVERED` so the sequence does not start.

```bash
curl -sS -X POST "https://<backend-host>/api/checkouts" \
  -H "Authorization: Bearer $STORE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "shopper@example.com",
    "firstName": "Jane",
    "lastName": "Doe",
    "phone": "+971500000000",
    "country": "AE",
    "marketingConsent": true,
    "externalCheckoutId": "STORE_ORDER_UUID",
    "cartData": {
      "items": [{ "slug": "serum", "name": "Velora Serum", "quantity": 1 }],
      "paymentMethod": "card",
      "stripeCheckoutSessionId": "cs_...",
      "stripePaymentIntentId": "pi_..."
    },
    "totalAmount": 149,
    "currency": "AED"
  }'
```

### 2. `POST /api/checkouts/:id/abandon` — optional, immediate

`:id` is the backend `checkout.id` from the create response, not the external id.

Call from the Stripe cancel URL or when the shopper leaves checkout, if you want abandonment to start immediately. `abandonedAt` is the time of this call. A second call returns the same row and does not write another event.

If you never call it, the sweep below does, after 30 minutes without an upsert.

`409 CHECKOUT_RECOVERED` if the checkout was already recovered. `404 CHECKOUT_NOT_FOUND` for an unknown id.

### 3. `POST /api/checkouts/abandon-stale` — scheduler only, not the page

```bash
curl -sS -X POST "https://<backend-host>/api/checkouts/abandon-stale" \
  -H "Authorization: Bearer $STORE_API_KEY"
```

Response: `{ "abandoned": 1, "checkoutIds": ["clx..."] }`.

The storefront page does not need this. `GET /api/agent/checkouts/abandoned` runs the same sweep. A cron is useful so segments stay current between agent polls. Overlapping runs are safe. Each run updates at most 500 quiet checkouts; a later poll or cron continues.

### 4. `POST /api/orders` — order created, and again when it is paid

Call once when the storefront order row exists (`status` `pending` or `awaiting_payment` does **not** stop abandonment). Call again when Stripe (or cash on delivery captured as paid) sets the order to a paid status. Same `externalOrderId` both times.

Paid statuses, case-insensitive: `paid`, `complete`, `completed`, `succeeded`. The storefront webhook's `paid` value matches.

On the transition to paid, every linked checkout in `ACTIVE` or `ABANDONED` becomes `RECOVERED`. That stops the abandoned sequence: the agent list only returns `ABANDONED`, and a send is rejected with `CHECKOUT_RECOVERED`. There is no background mail queue. A send already inside `POST /api/agent/email/send` can finish. Later sends will not.

Repeating the paid call does not move `recoveredAt` and does not write a second `ORDER_PAID` event.

If `externalCheckoutId` is omitted on a paid order, every open checkout for that customer email is recovered. Always send the id when you have it.

Cash on delivery that is placed but not paid will keep receiving abandonment mail unless you also call `POST /api/checkouts/:id/recover`.

```bash
curl -sS -X POST "https://<backend-host>/api/orders" \
  -H "Authorization: Bearer $STORE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "shopper@example.com",
    "firstName": "Jane",
    "phone": "+971500000000",
    "country": "AE",
    "externalOrderId": "STORE_ORDER_UUID",
    "externalCheckoutId": "STORE_ORDER_UUID",
    "totalAmount": 149,
    "currency": "AED",
    "status": "paid"
  }'
```

`201` with `{ "order": { ... } }`. The order includes `externalCheckoutId` when you sent one. `409 CHECKOUT_ALREADY_LINKED` if that checkout id is already stored on a different order.

### 5. `POST /api/checkouts/:id/recover` — explicit stop

Use for cash on delivery, or as a safety net after payment if you have the backend checkout id. Idempotent: a second call returns the recovered row and keeps the original `recoveredAt`.

## Abandonment and email timing

The sweep is on-read plus the optional endpoint above. It is not an in-process timer. Several backend instances can run it. The update only matches `status = ACTIVE`, and the customer event is written only for the instance that changed the row.

| Clock | Default | What happens |
| --- | --- | --- |
| Last successful `POST /api/checkouts` | 0 | Checkout stays `ACTIVE` |
| `CHECKOUT_ABANDON_AFTER_MINUTES` | 30 min | `ACTIVE` → `ABANDONED`. `abandonedAt` = last activity + 30 min |
| Message 1 | 30 min after `abandonedAt` | Eligible. About 60 min after the last upsert |
| Message 2 | 24 h after `abandonedAt` | `ABANDONED_CHECKOUT_MESSAGE2_HOURS` |
| Message 3 | 48 h after `abandonedAt` | `ABANDONED_CHECKOUT_MESSAGE3_HOURS` |
| After 3 successful sends | | `ABANDONED_SEQUENCE_COMPLETE` |

An immediate `POST /:id/abandon` sets `abandonedAt` to now, so message 1 is 30 minutes after that call instead of 60 minutes after the last upsert.

The agent (`GET /api/agent/checkouts/abandoned`, then `POST /api/agent/email/send` with `type: ABANDONED_CHECKOUT` and `checkoutId`) sends the mail. The storefront does not.

## Rules the backend already enforces

Do not reimplement these in the storefront. They are checked on every marketing send and when the agent lists abandoned checkouts.

- Customer must exist and the recipient must match the customer email
- Suppression list (`SUPPRESSED`)
- Global marketing pause (`MARKETING_PAUSED`)
- Unsubscribe (`CUSTOMER_UNSUBSCRIBED`)
- Marketing consent (`MARKETING_CONSENT_REQUIRED`)
- At most `MAX_MARKETING_EMAILS_PER_7_DAYS` marketing sends (default 3), counting queued and successful sends, not `FAILED` or `BOUNCED`
- Duplicate of the same type and checkout inside `DUPLICATE_EMAIL_WINDOW_MINUTES` (default 60). `FAILED` does not block a retry
- Abandoned sequence timing and the 3-send cap
- Recovered checkout (`CHECKOUT_RECOVERED`)
- Every attempt is stored in `email_messages` (`QUEUED`, then `SENT` or `FAILED`) plus a customer event on success

`ABANDONED_CHECKOUT_COOLDOWN_HOURS` is present in the environment and is not used.

## Migration

`20261013143000_order_external_checkout_id` adds nullable unique `orders.externalCheckoutId`. Existing rows stay null. The container entrypoint already runs `prisma migrate deploy` before listen. No backfill. Deploy the migration with the code. Do not apply it by hand to production outside the normal release.

## Staging test (owner address only)

Use `baylaamine@gmail.com` and `EMAIL_PROVIDER=console` first. Do not switch to SendGrid or SMTP, and do not use any other recipient, until console logs show the sequence and a paid order removes the checkout from the agent list. Shorten the timers only on that staging process:

```env
EMAIL_PROVIDER=console
CHECKOUT_ABANDON_AFTER_MINUTES=1
ABANDONED_CHECKOUT_DELAY_MINUTES=1
ABANDONED_CHECKOUT_MIN_AGE_MINUTES=1
```

1. `POST /api/checkouts` with that email, `marketingConsent: true`, and a fresh `externalCheckoutId`.
2. Wait for the abandon window, or `POST /api/checkouts/:id/abandon`, then `POST /api/checkouts/abandon-stale`.
3. `GET /api/agent/checkouts/abandoned` with the agent key. Confirm the checkout is listed.
4. `POST /api/agent/email/send` and confirm the log event `email_send_console`. Confirm there is no call to SendGrid.
5. `POST /api/orders` with `status: "paid"` and the same external ids. List abandoned checkouts again and confirm it is gone.
6. Repeat the paid order call and confirm the API still returns 201/upsert success without a second email.
