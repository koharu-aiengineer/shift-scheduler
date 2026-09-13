import { getAccessTokenForStore } from "./getAccessTokenForStore";
import { createGoogleClients } from "./sheetsClient";
import { buildClearFormatRequest, buildColorRequests } from "../shift-output/buildColorRequests";
import { buildSheetMatrix } from "../shift-output/buildSheetMatrix";
import type { Assignment, ISODate } from "../shift-solver/types";

export type WriteShiftOutputInput = {
  storeId: string;
  storeName: string;
  outputSheetId: string | null; // stores.output_sheet_id。nullなら新規作成する
  periodStart: ISODate;
  periodEnd: ISODate;
  employees: { id: string; name: string }[];
  shiftTypes: { id: string; name: string; color: string | null }[];
  assignments: Assignment[];
  // 新規作成したスプレッドシートIDをstores.output_sheet_idへ保存するためのコールバック
  onSpreadsheetCreated: (spreadsheetId: string) => Promise<void>;
};

export type WriteShiftOutputResult = {
  spreadsheetId: string;
  spreadsheetUrl: string;
  sheetTitle: string;
};

// 生成結果（SolverOutput.assignments）を店舗の出力用スプレッドシートへ書き込む。
// 店舗ごとに1ファイルのみを使い回し（要件定義書6.2）、月ごとに1タブを作成する。
// 同じ月に対して再度呼び出した場合は、そのタブの中身（値・背景色）を上書きする。
export async function writeShiftOutput(input: WriteShiftOutputInput): Promise<WriteShiftOutputResult> {
  const accessToken = await getAccessTokenForStore(input.storeId);
  const { sheets, drive } = createGoogleClients(accessToken);

  const spreadsheetId = input.outputSheetId ?? (await createSpreadsheet(drive, input));
  if (!input.outputSheetId) {
    await input.onSpreadsheetCreated(spreadsheetId);
  }

  const sheetTitle = periodToSheetTitle(input.periodStart);
  const sheetId = await ensureSheet(sheets, spreadsheetId, sheetTitle);

  const matrix = buildSheetMatrix({
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    employees: input.employees,
    shiftTypes: input.shiftTypes,
    assignments: input.assignments,
  });

  const values = [
    matrix.headerRow,
    ...matrix.rows.map((row) => [row.employeeName, ...row.cells.map((cell) => cell.text)]),
  ];

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${sheetTitle}'!A1`,
    valueInputOption: "RAW",
    requestBody: { values },
  });

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [buildClearFormatRequest(sheetId), ...buildColorRequests(sheetId, matrix)],
    },
  });

  return {
    spreadsheetId,
    spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
    sheetTitle,
  };
}

async function createSpreadsheet(
  drive: ReturnType<typeof createGoogleClients>["drive"],
  input: WriteShiftOutputInput,
): Promise<string> {
  const response = await drive.files.create({
    requestBody: {
      name: `${input.storeName}_出力用シフト表`,
      mimeType: "application/vnd.google-apps.spreadsheet",
    },
    fields: "id",
  });

  const spreadsheetId = response.data.id;
  if (!spreadsheetId) {
    throw new Error("出力用スプレッドシートの作成に失敗しました");
  }
  return spreadsheetId;
}

// 対象月のシート（タブ）が無ければ追加し、あればsheetIdを返す。
async function ensureSheet(
  sheets: ReturnType<typeof createGoogleClients>["sheets"],
  spreadsheetId: string,
  sheetTitle: string,
): Promise<number> {
  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
  const existing = spreadsheet.data.sheets?.find((s) => s.properties?.title === sheetTitle);
  if (existing?.properties?.sheetId != null) {
    return existing.properties.sheetId;
  }

  const response = await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests: [{ addSheet: { properties: { title: sheetTitle } } }] },
  });

  const sheetId = response.data.replies?.[0]?.addSheet?.properties?.sheetId;
  if (sheetId == null) {
    throw new Error("出力用シートのタブ作成に失敗しました");
  }
  return sheetId;
}

function periodToSheetTitle(periodStart: ISODate): string {
  return periodStart.slice(0, 7); // "YYYY-MM"
}
