# Email deliverability — providers, env, and DNS

The backend sends mail. Grok never calls SendGrid or SMTP directly. Tests and dry runs use `EMAIL_PROVIDER=console`. Do not send real mail from this repository's tests.

Production today: `EMAIL_API_KEY` is a placeholder, and `velorabeauty.world` is not authenticated at SendGrid (no SPF/DKIM in Cloudflare). This document is the setup checklist. It does not change production DNS or secrets.

## Providers

| `EMAIL_PROVIDER` | Delivers mail? | Required env |
| --- | --- | --- |
| `console` (default) | No. Logs `email_send_console` with recipient, from, subject, and body length. | `EMAIL_FROM`, `EMAIL_REPLY_TO` |
| `sendgrid` | Yes, via `POST https://api.sendgrid.com/v3/mail/send`. | `EMAIL_API_KEY` (legacy alias `SENDGRID_API_KEY`), `EMAIL_FROM`, `EMAIL_REPLY_TO` |
| `smtp` | Yes, via nodemailer, only when the host accepts the credentials. | `SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_FROM`, `EMAIL_REPLY_TO`. Optional: `SMTP_PORT` (default `587`), `SMTP_SECURE` |

Shared optional: `EMAIL_UNSUBSCRIBE_URL`. When set, marketing bodies get a plain-text unsubscribe footer. Legacy alias: `FROM_EMAIL` fills `EMAIL_FROM` when that variable is empty.

`SMTP_SECURE` accepts `true`/`false`/`1`/`0`/`yes`/`no`. When omitted, port `465` uses implicit TLS and every other port (including `587`) uses STARTTLS (`secure=false`).

### SMTP / Gmail / Google Workspace

Example shape only. This repo has no mailbox password, and nothing here has been verified against Google.

```env
EMAIL_PROVIDER=smtp
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=you@your-domain
SMTP_PASSWORD=<app-password>
EMAIL_FROM=you@your-domain
EMAIL_REPLY_TO=you@your-domain
```

Google requires 2-Step Verification and an [app password](https://support.google.com/accounts/answer/185833) (or an equivalent Workspace SMTP policy). `EMAIL_FROM` must be the authenticated mailbox or an alias Google already allows. A wrong password fails at send time with `EMAIL_PROVIDER_ERROR`. Do not treat this as working until the owner sends one message from staging with a real app password.

### SendGrid

1. Create an API key with Mail Send permission and set `EMAIL_API_KEY`.
2. Set `EMAIL_PROVIDER=sendgrid`.
3. Authenticate the sending domain (below) or verify a Single Sender. A Gmail From address is Single Sender verification. It is not authenticated by `velorabeauty.world` DNS.
4. After domain authentication, `EMAIL_FROM` must be an address on that domain, for example `hello@velorabeauty.world`.
5. Monitor bounces and complaints. Suppression lives in `email_suppressions`.

## DNS for `velorabeauty.world` on Cloudflare

Do this in the SendGrid UI and Cloudflare DNS. Do not invent the numeric hostnames. SendGrid shows the exact records for the account.

1. SendGrid → Settings → Sender Authentication → Authenticate Your Domain.
2. Domain: `velorabeauty.world`. DNS host: Cloudflare. Leave **Automated Security** on (SendGrid's default).
3. SendGrid displays CNAME records. They look like the following, with account-specific numbers:

   | Type | Cloudflare name | Target |
   | --- | --- | --- |
   | CNAME | `em####.velorabeauty.world` | `u####.wl.sendgrid.net` |
   | CNAME | `s1._domainkey.velorabeauty.world` | `s1.domainkey.u####.wl.sendgrid.net` |
   | CNAME | `s2._domainkey.velorabeauty.world` | `s2.domainkey.u####.wl.sendgrid.net` |

   The first CNAME is the return-path / SPF host. The `s1` and `s2` CNAMEs are DKIM.
4. In Cloudflare DNS, add each record with **Proxy status = DNS only** (grey cloud). An orange-cloud proxy breaks DKIM and the bounce domain.
5. If SendGrid also offers link branding, add those CNAMEs the same way, DNS only.
6. DMARC is not created by the SendGrid wizard. Add a TXT record:

   - Name: `_dmarc` (Cloudflare displays `_dmarc.velorabeauty.world`)
   - Value: `v=DMARC1; p=none; rua=mailto:baylaamine@gmail.com; fo=1`

   Stay on `p=none` until SendGrid shows the domain as verified and real mail is aligning. Move to `quarantine`, then `reject`, only after that.
7. SPF at the apex:
   - **Automated Security on:** do not add a second SPF TXT. SendGrid publishes SPF on the `em####` host via CNAME. If the apex already has a TXT starting with `v=spf1`, leave it unless you know it is unused. Two SPF TXT records at the same name are a permanent SPF failure.
   - **Automated Security off:** the wizard instead asks for an apex TXT `v=spf1 include:sendgrid.net ~all` and two DKIM TXT records. Use only the set the wizard shows. Merge `include:sendgrid.net` into an existing SPF record. Do not create a parallel one.
8. Click Verify in SendGrid. Cloudflare DNS-only records usually appear within a few minutes. Verification can still lag.
9. Confirm in SendGrid that the domain is authenticated before any production send. This repository does not check DNS and does not claim `velorabeauty.world` is authenticated.

## Backend protections

- `email_suppressions` for bounces, complaints, manual blocks, and invalid addresses
- Marketing requires consent and a customer who is not unsubscribed
- Frequency cap: `MAX_MARKETING_EMAILS_PER_7_DAYS` (default 3)
- Duplicate window: `DUPLICATE_EMAIL_WINDOW_MINUTES` (default 60) for the same customer, type, and checkout
- Abandoned sequence: message 1 after `ABANDONED_CHECKOUT_DELAY_MINUTES` (default 30), message 2 after `ABANDONED_CHECKOUT_MESSAGE2_HOURS` (default 24), message 3 after `ABANDONED_CHECKOUT_MESSAGE3_HOURS` (default 48), then stop
- `ABANDONED_CHECKOUT_COOLDOWN_HOURS` is accepted in the environment and is not applied. The live duplicate rule is the 60-minute window above
- Unsubscribe footer when `EMAIL_UNSUBSCRIBE_URL` is set on marketing sends
- Pause everything with admin `POST /api/admin/marketing/pause` (Grok cannot call admin routes)

## Webhooks (not implemented)

Configure a SendGrid Event Webhook later if you want `OPENED`, `CLICKED`, and `BOUNCED` written onto `email_messages`. There is no inbound provider webhook in this service today.

## Complaints

High complaint rates damage domain reputation. Pause marketing via admin `POST /api/admin/marketing/pause` if needed.
