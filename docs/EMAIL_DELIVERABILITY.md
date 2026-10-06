# Email deliverability — production checklist

## Sender identity (environment variables)

Configure in EasyPanel only — **not in GitHub**:

| Variable | Purpose |
| --- | --- |
| `EMAIL_FROM` | Verified sender (e.g. Gmail single sender until domain ready) |
| `EMAIL_REPLY_TO` | Where replies go |
| `EMAIL_UNSUBSCRIBE_URL` | Public HTTPS endpoint (e.g. `POST /api/unsubscribe` on your API) |

## DNS (when using a custom domain)

Work with your DNS provider and SendGrid (or your ESP):

- **SPF** — authorize SendGrid to send for your domain
- **DKIM** — cryptographic signing (SendGrid domain authentication)
- **DMARC** — policy for failed alignment (`p=none` → `quarantine` → `reject` as you mature)

## SendGrid

1. Create API key → `EMAIL_API_KEY`
2. Verify **Single Sender** (Gmail) or **Domain Authentication** (professional domain)
3. Set `EMAIL_PROVIDER=sendgrid`
4. Monitor bounces/complaints in SendGrid; sync suppressions via admin processes

## Backend protections

- `email_suppressions` table for bounces/complaints/manual blocks
- Marketing requires consent + not unsubscribed
- Frequency cap: `MAX_MARKETING_EMAILS_PER_7_DAYS`
- Unsubscribe footer appended when `EMAIL_UNSUBSCRIBE_URL` is set on marketing sends

## Webhooks (recommended next step)

Configure SendGrid Event Webhook → store endpoint (future) to update `OPENED`, `CLICKED`, `BOUNCED` on `EMAIL_MESSAGES` and add suppressions.

## Complaints

High complaint rates damage domain reputation. Pause marketing via **admin** `POST /api/admin/marketing/pause` if needed (Grok **cannot** call admin routes).
