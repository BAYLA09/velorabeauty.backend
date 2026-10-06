# Fix SSL for api.velorabeauty.world (2 minutes)

Your API **already runs**. The browser error is only a **certificate** issue (EasyPanel default self-signed cert).

## Option A — EasyPanel Let's Encrypt (best)

1. Cloudflare: **`api`** record → **DNS only** (grey cloud) ✓ you already have this
2. EasyPanel → **velorabeauty** → **backend** → **Domains**
3. Add: `api.velorabeauty.world`
4. Enable **HTTPS** → **Let's Encrypt** → Generate
5. **Redeploy** backend
6. Open `https://api.velorabeauty.world/health` — padlock should be green

If Let's Encrypt fails: open backend **Logs** and search `acme` or `certificate`.

## Option B — Cloudflare proxy (no EasyPanel cert needed)

1. Cloudflare → DNS → **`api`** → turn **Proxied** ON (orange cloud)
2. Cloudflare → **SSL/TLS** → **Overview** → encryption mode **Full** (not strict)
3. Wait 1–2 minutes
4. Open `https://api.velorabeauty.world/` — browser uses Cloudflare's valid certificate

Later, after Option A works, you can use **Full (strict)**.

## Verify

```bash
curl -sS https://api.velorabeauty.world/health
```

Expected: `{"status":"ok","database":"connected"}` or `database":"unavailable"` (DB env still needed).
