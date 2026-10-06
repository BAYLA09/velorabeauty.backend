-- CreateEnum
CREATE TYPE "CustomerStatus" AS ENUM ('NEW', 'ACTIVE', 'VIP', 'AT_RISK', 'INACTIVE', 'UNSUBSCRIBED');

-- CreateEnum
CREATE TYPE "CustomerEventType" AS ENUM ('CUSTOMER_CREATED', 'EMAIL_CAPTURED', 'PRODUCT_VIEWED', 'PRODUCT_ADDED_TO_CART', 'CHECKOUT_STARTED', 'CHECKOUT_ABANDONED', 'ORDER_CREATED', 'ORDER_PAID', 'ORDER_CANCELLED', 'EMAIL_SENT', 'EMAIL_OPENED', 'EMAIL_CLICKED', 'EMAIL_BOUNCED', 'SUPPORT_MESSAGE', 'SUPPORT_REPLY', 'UNSUBSCRIBED');

-- CreateEnum
CREATE TYPE "EmailCampaignType" AS ENUM ('ABANDONED_CHECKOUT', 'WELCOME', 'POST_PURCHASE', 'REVIEW_REQUEST', 'WIN_BACK', 'PRODUCT_FOLLOWUP', 'SUPPORT', 'CUSTOM');

-- CreateEnum
CREATE TYPE "EmailCampaignStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SupportCategory" AS ENUM ('ORDER_STATUS', 'SHIPPING', 'PRODUCT_QUESTION', 'PRODUCT_USAGE', 'RETURN', 'REFUND', 'PAYMENT', 'COMPLAINT', 'GENERAL_QUESTION', 'OTHER');

-- CreateEnum
CREATE TYPE "SuppressionReason" AS ENUM ('BOUNCE', 'COMPLAINT', 'MANUAL', 'INVALID');

-- AlterTable customers
ALTER TABLE "customers" ADD COLUMN "language" VARCHAR(10),
ADD COLUMN "customerStatus" "CustomerStatus" NOT NULL DEFAULT 'NEW',
ADD COLUMN "firstPurchaseAt" TIMESTAMP(3),
ADD COLUMN "lastPurchaseAt" TIMESTAMP(3),
ADD COLUMN "totalOrders" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "totalSpent" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN "averageOrderValue" DECIMAL(14,2) NOT NULL DEFAULT 0;

CREATE INDEX "customers_customerStatus_idx" ON "customers"("customerStatus");
CREATE INDEX "customers_lastPurchaseAt_idx" ON "customers"("lastPurchaseAt");

UPDATE "customers" SET "customerStatus" = 'UNSUBSCRIBED' WHERE "unsubscribed" = true;

-- CreateTable customer_events
CREATE TABLE "customer_events" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "type" "CustomerEventType" NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "customer_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable email_campaigns
CREATE TABLE "email_campaigns" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "EmailCampaignType" NOT NULL,
    "status" "EmailCampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "targetSegment" TEXT,
    "description" TEXT,
    "experimentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "email_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable email_suppressions
CREATE TABLE "email_suppressions" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "reason" "SuppressionReason" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "email_suppressions_pkey" PRIMARY KEY ("id")
);

-- CreateTable system_settings
CREATE TABLE "system_settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("key")
);

-- AlterTable email_messages
ALTER TABLE "email_messages" ADD COLUMN "campaignId" TEXT,
ADD COLUMN "aiGenerated" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "aiModel" TEXT,
ADD COLUMN "aiConfidence" DOUBLE PRECISION,
ADD COLUMN "generationReason" TEXT,
ADD COLUMN "variant" TEXT,
ADD COLUMN "experimentId" TEXT;

-- AlterTable support_tickets
ALTER TABLE "support_tickets" ADD COLUMN "category" "SupportCategory" NOT NULL DEFAULT 'OTHER';

-- CreateIndex
CREATE INDEX "customer_events_customerId_idx" ON "customer_events"("customerId");
CREATE INDEX "customer_events_type_idx" ON "customer_events"("type");
CREATE INDEX "customer_events_createdAt_idx" ON "customer_events"("createdAt");
CREATE INDEX "customer_events_customerId_createdAt_idx" ON "customer_events"("customerId", "createdAt");

CREATE INDEX "email_campaigns_status_idx" ON "email_campaigns"("status");
CREATE INDEX "email_campaigns_type_idx" ON "email_campaigns"("type");
CREATE INDEX "email_campaigns_targetSegment_idx" ON "email_campaigns"("targetSegment");

CREATE UNIQUE INDEX "email_suppressions_email_key" ON "email_suppressions"("email");
CREATE INDEX "email_suppressions_email_idx" ON "email_suppressions"("email");

CREATE INDEX "email_messages_campaignId_idx" ON "email_messages"("campaignId");
CREATE INDEX "email_messages_experimentId_idx" ON "email_messages"("experimentId");

CREATE INDEX "support_tickets_category_idx" ON "support_tickets"("category");

-- AddForeignKey
ALTER TABLE "customer_events" ADD CONSTRAINT "customer_events_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "email_campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;
