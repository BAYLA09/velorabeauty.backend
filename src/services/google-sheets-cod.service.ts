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

type SheetsConfig = {
  spreadsheetId: string;
  tabName: string;
  credentialsJson: string;
};

function getSheetsConfig(): SheetsConfig | null {
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID?.trim();
  const credentialsJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  if (!spreadsheetId || !credentialsJson) return null;

  return {
    spreadsheetId,
    tabName: process.env.GOOGLE_SHEETS_TAB_NAME?.trim() || "Sheet1",
    credentialsJson,
  };
}

function parseCredentials(json: string): { client_email: string; private_key: string } {
  const parsed = JSON.parse(json) as { client_email?: string; private_key?: string };
  if (!parsed.client_email || !parsed.private_key) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON must include client_email and private_key");
  }
  return {
    client_email: parsed.client_email,
    private_key: parsed.private_key.replace(/\\n/g, "\n"),
  };
}

export function isCodSheetsConfigured(): boolean {
  return getSheetsConfig() !== null;
}

export async function appendCodOrderToSheet(row: CodSheetRow): Promise<void> {
  const config = getSheetsConfig();
  if (!config) {
    logStructured("debug", "google_sheets_skip", { reason: "not_configured" });
    return;
  }

  const credentials = parseCredentials(config.credentialsJson);
  const auth = new google.auth.JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  const sheets = google.sheets({ version: "v4", auth });
  const range = `${config.tabName}!A:Q`;

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
    tab: config.tabName,
    name: row.name,
  });
}
