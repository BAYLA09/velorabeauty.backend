# COD orders → Google Sheet

When a **new** COD order is saved via `POST /api/orders`, the backend forwards it to your sheet.

## Your setup (Apps Script webhook) — recommended

You already use a Google Apps Script web app. Configure **EasyPanel → backend → Environment**:

| Variable | Description |
| --- | --- |
| `ORDERS_SHEETS_COD_WEBHOOK_URL` | `https://script.google.com/macros/s/.../exec` |
| `ORDERS_SHEETS_WEBHOOK_SECRET` | Same secret as in Apps Script (`VeloraCOD-...`) |
| `SHEET_GID` | `469291840` (from sheet URL `#gid=469291840`) |
| `GOOGLE_SHEETS_SPREADSHEET_ID` | Optional; `1nasdcXYD5ihxj5QnGMWQ05ug3VqoVfgP8R9ojBnsjXQ` |

**You do NOT need `GOOGLE_SERVICE_ACCOUNT_JSON`** if the webhook is configured.

Redeploy backend after saving env vars.

### Test

```bash
curl -sS -X POST "https://api.velorabeauty.world/api/admin/sheets/cod/test-row" \
  -H "Authorization: Bearer STORE_API_KEY"
```

Check the sheet for a **TEST** row.

### Store must call the backend

Opening `/api/orders` in a browser does **nothing**. The storefront/COD flow must send:

```http
POST https://api.velorabeauty.world/api/orders
Authorization: Bearer STORE_API_KEY
```

Response includes `codSheet.status` (`synced` | `failed` | `disabled`).

---

## Alternative: Google Service Account (no Apps Script)

See env vars `GOOGLE_SERVICE_ACCOUNT_JSON` in `.env.example`. Used only if webhook URL is **not** set.

---

## Sheet columns

`OrderDate`, `country`, `name`, `phone`, `address`, `url`, `sku`, `Product`, `quantity`, `price`, `currency`, `notes`, `utm_*`

Spreadsheet: [Orders VeloraBeauty COD UAE](https://docs.google.com/spreadsheets/d/1nasdcXYD5ihxj5QnGMWQ05ug3VqoVfgP8R9ojBnsjXQ/edit?gid=469291840)
