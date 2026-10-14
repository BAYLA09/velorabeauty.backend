import { google } from "googleapis";
import { logStructured } from "../lib/logger.js";

export type CodSheetRow = {
  orderDate: string;
  country: string;
  name: string;
  phone: string;
  address: string;
  url: string;
  sku: string;
  product: string;
  quantity: string;
  price: string;
  currency: string;
  notes: string;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  utmTerm: string;
  utmContent: string;
};

export type SheetsConfigStatus = {
  configured: boolean;
  spreadsheetId?: string;
  tabName?: string;
  serviceAccountEmail?: string;
  missing: string[];
};

type SheetsConfig = {
  spreadsheetId: string;
  tabName?: string;
  sheetGid?: number;
  credentialsJson: string;
};

function readCredentialsRaw(): string | null {
  const inline = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  if (inline) return inline;

  const b64 = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64?.trim();
  if (b64) {
    return Buffer.from(b64, "base64").toString("utf8");
  }
  return null;
}

function getSheetsConfig(): SheetsConfig | null {
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID?.trim();
  const credentialsJson = readCredentialsRaw();
  if (!spreadsheetId || !credentialsJson) return null;

  const gidRaw = process.env.GOOGLE_SHEETS_GID?.trim();
  const sheetGid = gidRaw ? Number(gidRaw) : undefined;

  return {
    spreadsheetId,
    tabName: process.env.GOOGLE_SHEETS_TAB_NAME?.trim() || undefined,
    sheetGid: Number.isFinite(sheetGid) ? sheetGid : undefined,
    credentialsJson,
  };
}

function parseCredentials(json: string): { client_email: string; private_key: string } {
  let raw = json.trim();
  if (raw.startsWith("{")) {
    // ok
  } else {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON must be valid JSON");
  }

  const parsed = JSON.parse(raw) as { client_email?: string; private_key?: string };
  if (!parsed.client_email || !parsed.private_key) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON must include client_email and private_key");
  }
  return {
    client_email: parsed.client_email,
    private_key: parsed.private_key.replace(/\\n/g, "\n"),
  };
}

export function getSheetsConfigStatus(): SheetsConfigStatus {
  const missing: string[] = [];
  if (!process.env.GOOGLE_SHEETS_SPREADSHEET_ID?.trim()) {
    missing.push("GOOGLE_SHEETS_SPREADSHEET_ID");
  }
  if (!readCredentialsRaw()) {
    missing.push("GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_SERVICE_ACCOUNT_JSON_BASE64");
  }

  const config = getSheetsConfig();
  if (!config) {
    return { configured: false, missing };
  }

  let serviceAccountEmail: string | undefined;
  try {
    serviceAccountEmail = parseCredentials(config.credentialsJson).client_email;
  } catch {
    missing.push("GOOGLE_SERVICE_ACCOUNT_JSON (invalid JSON)");
  }

  return {
    configured: missing.length === 0,
    spreadsheetId: config.spreadsheetId,
    tabName: config.tabName,
    serviceAccountEmail,
    missing,
  };
}

export function isCodSheetsConfigured(): boolean {
  return getSheetsConfigStatus().configured;
}

async function resolveTabName(
  sheets: ReturnType<typeof google.sheets>,
  config: SheetsConfig,
): Promise<string> {
  if (config.tabName) return config.tabName;

  const meta = await sheets.spreadsheets.get({
    spreadsheetId: config.spreadsheetId,
    fields: "sheets.properties",
  });

  const sheetList = meta.data.sheets ?? [];

  if (config.sheetGid !== undefined) {
    const match = sheetList.find((s) => s.properties?.sheetId === config.sheetGid);
    if (match?.properties?.title) return match.properties.title;
    throw new Error(
      `No tab with gid ${config.sheetGid}. Available: ${sheetList.map((s) => s.properties?.title).join(", ")}`,
    );
  }

  const first = sheetList[0]?.properties?.title;
  if (!first) throw new Error("Spreadsheet has no tabs");
  return first;
}

async function getSheetsClient() {
  const config = getSheetsConfig();
  if (!config) throw new Error("Google Sheets is not configured");

  const credentials = parseCredentials(config.credentialsJson);
  const auth = new google.auth.JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  const sheets = google.sheets({ version: "v4", auth });
  const tabName = await resolveTabName(sheets, config);
  return { sheets, config, tabName };
}

export async function appendCodOrderToSheet(row: CodSheetRow): Promise<{ tabName: string }> {
  const { sheets, config, tabName } = await getSheetsClient();
  const range = `'${tabName.replace(/'/g, "''")}'!A:Q`;

  const values = [
    [
      row.orderDate,
      row.country,
      row.name,
      row.phone,
      row.address,
      row.url,
      row.sku,
      row.product,
      row.quantity,
      row.price,
      row.currency,
      row.notes,
      row.utmSource,
      row.utmMedium,
      row.utmCampaign,
      row.utmTerm,
      row.utmContent,
    ],
  ];

  await sheets.spreadsheets.values.append({
    spreadsheetId: config.spreadsheetId,
    range,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values },
  });

  logStructured("info", "google_sheets_cod_appended", {
    spreadsheetId: config.spreadsheetId,
    tab: tabName,
    name: row.name,
  });

  return { tabName };
}

export async function testCodSheetConnection(): Promise<{
  ok: boolean;
  tabName: string;
  serviceAccountEmail: string;
}> {
  const status = getSheetsConfigStatus();
  if (!status.configured || !status.serviceAccountEmail) {
    throw new Error(`Sheets not configured: ${status.missing.join(", ")}`);
  }

  const { tabName } = await getSheetsClient();
  return {
    ok: true,
    tabName,
    serviceAccountEmail: status.serviceAccountEmail,
  };
}
