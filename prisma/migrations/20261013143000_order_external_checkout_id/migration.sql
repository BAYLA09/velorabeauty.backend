-- Persist the storefront checkout key on the order.
-- POST /api/orders already accepts externalCheckoutId, but the value was only
-- used in-memory to mark a checkout recovered. Storing it lets a later checkout
-- upsert see that payment already happened, and lets a paid retry find the same link.
ALTER TABLE "orders" ADD COLUMN "externalCheckoutId" TEXT;

-- Multiple orders with no checkout key (NULL) remain allowed.
CREATE UNIQUE INDEX "orders_externalCheckoutId_key" ON "orders"("externalCheckoutId");
