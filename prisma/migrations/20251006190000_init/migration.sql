-- CreateEnum
CREATE TYPE "CheckoutStatus" AS ENUM ('ACTIVE', 'ABANDONED', 'RECOVERED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "EmailDirection" AS ENUM ('OUTBOUND', 'INBOUND');

-- CreateEnum
CREATE TYPE "EmailType" AS ENUM ('ABANDONED_CHECKOUT', 'FOLLOW_UP', 'SUPPORT', 'ORDER_UPDATE', 'OTHER');

-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'OPENED', 'CLICKED', 'BOUNCED', 'FAILED');

-- CreateEnum
CREATE TYPE "SupportTicketStatus" AS ENUM ('OPEN', 'AI_HANDLED', 'HUMAN_REQUIRED', 'CLOSED');

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "phone" TEXT,
    "country" TEXT,
    "marketingConsent" BOOLEAN NOT NULL DEFAULT false,
    "marketingConsentAt" TIMESTAMP(3),
    "unsubscribed" BOOLEAN NOT NULL DEFAULT false,
    "unsubscribedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "externalOrderId" TEXT NOT NULL,
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checkouts" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "externalCheckoutId" TEXT NOT NULL,
    "cartData" JSONB NOT NULL,
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "status" "CheckoutStatus" NOT NULL DEFAULT 'ACTIVE',
    "abandonedAt" TIMESTAMP(3),
    "recoveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "checkouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_messages" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "checkoutId" TEXT,
    "direction" "EmailDirection" NOT NULL,
    "type" "EmailType" NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "senderEmail" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "providerMessageId" TEXT,
    "status" "EmailStatus" NOT NULL DEFAULT 'QUEUED',
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3),
    "clickedAt" TIMESTAMP(3),
    "bouncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_tickets" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "originalMessage" TEXT NOT NULL,
    "aiResponse" TEXT,
    "aiConfidence" DOUBLE PRECISION,
    "status" "SupportTicketStatus" NOT NULL DEFAULT 'OPEN',
    "humanRequired" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unsubscribes" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "unsubscribes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_interactions" (
    "id" TEXT NOT NULL,
    "customerId" TEXT,
    "type" TEXT NOT NULL,
    "input" JSONB NOT NULL,
    "output" JSONB NOT NULL,
    "model" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_interactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "customers_email_key" ON "customers"("email");

-- CreateIndex
CREATE INDEX "customers_email_idx" ON "customers"("email");

-- CreateIndex
CREATE INDEX "customers_unsubscribed_idx" ON "customers"("unsubscribed");

-- CreateIndex
CREATE INDEX "customers_marketingConsent_idx" ON "customers"("marketingConsent");

-- CreateIndex
CREATE UNIQUE INDEX "orders_externalOrderId_key" ON "orders"("externalOrderId");

-- CreateIndex
CREATE INDEX "orders_customerId_idx" ON "orders"("customerId");

-- CreateIndex
CREATE INDEX "orders_status_idx" ON "orders"("status");

-- CreateIndex
CREATE INDEX "orders_createdAt_idx" ON "orders"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "checkouts_externalCheckoutId_key" ON "checkouts"("externalCheckoutId");

-- CreateIndex
CREATE INDEX "checkouts_customerId_idx" ON "checkouts"("customerId");

-- CreateIndex
CREATE INDEX "checkouts_status_idx" ON "checkouts"("status");

-- CreateIndex
CREATE INDEX "checkouts_abandonedAt_idx" ON "checkouts"("abandonedAt");

-- CreateIndex
CREATE INDEX "checkouts_email_idx" ON "checkouts"("email");

-- CreateIndex
CREATE INDEX "email_messages_customerId_idx" ON "email_messages"("customerId");

-- CreateIndex
CREATE INDEX "email_messages_checkoutId_idx" ON "email_messages"("checkoutId");

-- CreateIndex
CREATE INDEX "email_messages_recipientEmail_idx" ON "email_messages"("recipientEmail");

-- CreateIndex
CREATE INDEX "email_messages_type_idx" ON "email_messages"("type");

-- CreateIndex
CREATE INDEX "email_messages_status_idx" ON "email_messages"("status");

-- CreateIndex
CREATE INDEX "email_messages_createdAt_idx" ON "email_messages"("createdAt");

-- CreateIndex
CREATE INDEX "email_messages_customerId_type_subject_createdAt_idx" ON "email_messages"("customerId", "type", "subject", "createdAt");

-- CreateIndex
CREATE INDEX "support_tickets_customerId_idx" ON "support_tickets"("customerId");

-- CreateIndex
CREATE INDEX "support_tickets_email_idx" ON "support_tickets"("email");

-- CreateIndex
CREATE INDEX "support_tickets_status_idx" ON "support_tickets"("status");

-- CreateIndex
CREATE INDEX "support_tickets_createdAt_idx" ON "support_tickets"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "unsubscribes_email_key" ON "unsubscribes"("email");

-- CreateIndex
CREATE INDEX "unsubscribes_email_idx" ON "unsubscribes"("email");

-- CreateIndex
CREATE INDEX "ai_interactions_customerId_idx" ON "ai_interactions"("customerId");

-- CreateIndex
CREATE INDEX "ai_interactions_type_idx" ON "ai_interactions"("type");

-- CreateIndex
CREATE INDEX "ai_interactions_createdAt_idx" ON "ai_interactions"("createdAt");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkouts" ADD CONSTRAINT "checkouts_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_checkoutId_fkey" FOREIGN KEY ("checkoutId") REFERENCES "checkouts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_interactions" ADD CONSTRAINT "ai_interactions_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
