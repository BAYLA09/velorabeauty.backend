# COD orders → Google Sheet

When a **new** COD order hits `POST /api/orders`, the backend appends one row to your sheet.

## Sheet columns (A → Q)

`OrderDate`, `country`, `name`, `phone`, `address`, `url`, `sku`, `Product`, `quantity`, `price`, `currency`, `notes`, `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`

Your spreadsheet ID (from the URL):

`1nasdcXYD5ihxj5QnGMWQ05ug3VqoVfgP8R9ojBnsjXQ`

Tab: use **`GOOGLE_SHEETS_GID=469291840`** (from your sheet URL) — backend resolves the correct tab name automatically.

## 1. Google Cloud service account

1. [Google Cloud Console](https://console.cloud.google.com/) → create/select project  
2. Enable **Google Sheets API**  
3. **IAM → Service Accounts** → Create → Keys → **JSON**  
4. Copy the JSON file contents (keep secret)

## 2. Share the sheet

Open the Google Sheet → **Share** → add the service account email  
(e.g. `something@project-id.iam.gserviceaccount.com`) as **Editor**.

## 3. EasyPanel environment (backend)

| Variable | Value |
| --- | --- |
| `GOOGLE_SHEETS_SPREADSHEET_ID` | `1nasdcXYD5ihxj5QnGMWQ05ug3VqoVfgP8R9ojBnsjXQ` |
| `GOOGLE_SHEETS_GID` | `469291840` |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Full JSON on **one line**, **or** use `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64` |

Redeploy backend.

### Test (after deploy)

```bash
curl -sS -X POST "https://api.velorabeauty.world/api/admin/sheets/cod/test" \
  -H "Authorization: Bearer STORE_API_KEY"

curl -sS -X POST "https://api.velorabeauty.world/api/admin/sheets/cod/test-row" \
  -H "Authorization: Bearer STORE_API_KEY"
```

First command checks auth + tab. Second adds one **TEST** row to the sheet.

## 4. Store / COD app request

`POST https://api.velorabeauty.world/api/orders`  
Header: `Authorization: Bearer STORE_API_KEY`

Example body:

```json
{
  "email": "customer@example.com",
  "name": "Sara Ali",
  "phone": "+971501234567",
  "country": "UAE",
  "address": "Dubai Marina, Tower 1",
  "externalOrderId": "COD-10042",
  "totalAmount": 199,
  "currency": "AED",
  "status": "pending_cod",
  "paymentMethod": "cod",
  "product": "Velora Serum",
  "sku": "VS-001",
  "quantity": 1,
  "price": 199,
  "url": "https://velorabeauty.world/checkout",
  "utmSource": "instagram",
  "notes": "COD UAE"
}
```

Default `paymentMethod` is treated as **cod**. Orders already in DB (same `externalOrderId`) are **not** duplicated in the sheet.

The API response includes **`codSheet`**:

- `{ "status": "synced", "tabName": "..." }` — row added  
- `{ "status": "failed", "error": "..." }` — read the error (share sheet, bad JSON, wrong gid)  
- `{ "status": "disabled", "reason": "..." }` — env vars missing on server  

## Troubleshooting

- Row missing → check backend logs for `google_sheets_cod_failed`  
- 403 → service account not shared on the sheet  
- Wrong tab → fix `GOOGLE_SHEETS_TAB_NAME`
