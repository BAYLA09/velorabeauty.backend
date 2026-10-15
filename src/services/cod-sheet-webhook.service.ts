import type { CodSheetRow } from "./google-sheets-cod.service.js";
import { logStructured } from "../lib/logger.js";

export type AppsScriptWebhookConfig = {
  url: string;
  secret: string;
  gid: string;
};

export function getAppsScriptWebhookConfig(): AppsScriptWebhookConfig | null {
  const url = process.env.ORDERS_SHEETS_COD_WEBHOOK_URL?.trim();
  const secret = process.env.ORDERS_SHEETS_WEBHOOK_SECRET?.trim();
  const gid =
    process.env.SHEET_GID?.trim() ||
    process.env.GOOGLE_SHEETS_GID?.trim() ||
    "469291840";

  if (!url || !secret) return null;
  return { url, secret, gid };
}

export function isAppsScriptWebhookConfigured(): boolean {
  return getAppsScriptWebhookConfig() !== null;
}

/** Payload matches Velora COD sheet columns + common Apps Script doPost patterns. */
function buildWebhookBody(config: AppsScriptWebhookConfig, row: CodSheetRow) {
  return {
    secret: config.secret,
    webhookSecret: config.secret,
    gid: config.gid,
    sheetGid: config.gid,
    spreadsheetId: process.env.GOOGLE_SHEETS_SPREADSHEET_ID?.trim(),
    row: {
      OrderDate: row.orderDate,
      country: row.country,
      name: row.name,
      phone: row.phone,
      address: row.address,
      url: row.url,
      sku: row.sku,
      Product: row.product,
      quantity: row.quantity,
      price: row.price,
      currency: row.currency,
      notes: row.notes,
      utm_source: row.utmSource,
      utm_medium: row.utmMedium,
      utm_campaign: row.utmCampaign,
      utm_term: row.utmTerm,
      utm_content: row.utmContent,
    },
    OrderDate: row.orderDate,
    country: row.country,
    name: row.name,
    phone: row.phone,
    address: row.address,
    url: row.url,
    sku: row.sku,
    Product: row.product,
    quantity: row.quantity,
    price: row.price,
    currency: row.currency,
    notes: row.notes,
    utm_source: row.utmSource,
    utm_medium: row.utmMedium,
    utm_campaign: row.utmCampaign,
    utm_term: row.utmTerm,
    utm_content: row.utmContent,
  };
}

export async function appendCodOrderViaAppsScriptWebhook(row: CodSheetRow): Promise<void> {
  const config = getAppsScriptWebhookConfig();
  if (!config) {
    throw new Error("ORDERS_SHEETS_COD_WEBHOOK_URL and ORDERS_SHEETS_WEBHOOK_SECRET are required");
  }

  const response = await fetch(config.url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildWebhookBody(config, row)),
    redirect: "follow",
  });

  const text = await response.text();

  if (!response.ok) {
    logStructured("error", "cod_sheet_webhook_http_error", {
      status: response.status,
      body: text.slice(0, 300),
    });
    throw new Error(`Apps Script webhook HTTP ${response.status}: ${text.slice(0, 200)}`);
  }

  const lower = text.toLowerCase();
  if (lower.includes("unauthorized") || lower.includes("invalid secret") || lower.includes("forbidden")) {
    throw new Error(`Apps Script rejected request: ${text.slice(0, 200)}`);
  }

  logStructured("info", "cod_sheet_webhook_success", {
    gid: config.gid,
    responsePreview: text.slice(0, 120),
  });
}
