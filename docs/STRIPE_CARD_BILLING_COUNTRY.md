# Stripe card checkout: `billing_details.address.country`

## Symptom

Browser console / Stripe.js error when paying by card:

> You specified "never" for `fields.billing_details.address` when creating the payment Element, but did not pass `confirmParams.payment_method_data.billing_details.address.country` when calling `stripe.confirmPayment()`.

Payment never completes (`confirmPayment` fails before charge).

## Cause

`velorabeauty.frontend` sets Payment Element `fields.billingDetails.address: "never"` (shop collects address in Velora form). Stripe still requires **`address.country`** (ISO code) on `confirmPayment`.

## Fix (frontend)

Payment Element stays **`address: "never"`** (no UI change). On `confirmPayment`, pass delivery data from the existing form:

```ts
address: { country: "AE", line1: fullAddress, state: emirate }
```

Files: `submitAndConfirmStripePayment.ts`, `CheckoutCardStripeCheckout.tsx`, `CheckoutCardVanillaCheckout.tsx`.

Apply from this repo:

```bash
cd velorabeauty.frontend
git apply ../velorabeauty.backend/docs/patches/frontend-stripe-billing-country.patch
```

Then redeploy the **storefront** only (no Stripe env changes).

## After deploy

Card flow: create order → `confirmPayment` → redirect `/checkout/success` → Stripe webhook marks `paid` → storefront calls `POST /api/orders` with `status: "paid"`.

COD sheet sync is unrelated to Stripe; card orders do not append to the COD Google Sheet unless you add a separate integration.
