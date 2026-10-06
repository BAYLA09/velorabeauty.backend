# Email strategy — Grok intelligence + backend safety

## Division of responsibility

| Grok | Backend |
| --- | --- |
| Segment selection, copy, timing decisions | Consent, unsubscribe, frequency, duplicates |
| Campaign plans and A/B variants | Campaign **ACTIVE** gate, send execution |
| Support classification and replies | Escalation rules, provider delivery, audit logs |
| Learning from metrics API | Permanent storage in PostgreSQL |

## Lifecycle programs (infrastructure ready)

- **Abandoned checkout** — 3-step sequence (30m / 24h / 48h defaults, env-configurable)
- **Welcome / post-purchase / review / win-back** — use `EmailCampaign` types + segments
- **Support** — inbound webhook → tickets → Grok reply API

## Segmentation

Dynamic segments (see `GET /api/agent/segments`) — extensible slugs, not hardcoded customer rows.

## Quality bar

Every email needs: purpose, truthfulness, personalization from API data, eligibility check (marketing), and history review.

## Metrics

`GET /api/agent/metrics/email` and campaign metrics — use to refine strategy; **do not invent ROI** when `revenueAttributed` is null.
