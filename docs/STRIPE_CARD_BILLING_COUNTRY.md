# Stripe card checkout: `billing_details.address.country`

## Symptom

Browser console / Stripe.js error when paying by card:

> You specified "never" for `fields.billing_details.address` when creating the payment Element, but did not pass `confirmParams.payment_method_data.billing_details.address.country` when calling `stripe.confirmPayment()`.

Payment never completes (`confirmPayment` fails before charge).

## Cause

`velorabeauty.frontend` sets Payment Element `fields.billingDetails.address: "never"` (shop collects address in Velora form). Stripe still requires **`address.country`** (ISO code) on `confirmPayment`.

## Fix (frontend)

Apply in `velorabeauty.frontend`:

1. Add `src/lib/checkout/buildStripeConfirmBillingDetails.ts` — builds `{ name, email, phone, address: { country: "AE", line1, state } }`.
2. Use it in `CheckoutCardStripeCheckout.tsx` and `CheckoutCardVanillaCheckout.tsx` when calling `submitAndConfirmStripePayment`.
3. Redeploy the **storefront** (not this API).

UAE storefront default: `country: "AE"`, `line1` = delivery address, `state` = emirate.

## After deploy

Card flow: create order → `confirmPayment` → redirect `/checkout/success` → Stripe webhook marks `paid` → storefront calls `POST /api/orders` with `status: "paid"`.

COD sheet sync is unrelated to Stripe; card orders do not append to the COD Google Sheet unless you add a separate integration.
