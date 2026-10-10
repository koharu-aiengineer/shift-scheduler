import { getAccessTokenForStore } from "./getAccessTokenForStore";
import { createGoogleClients } from "./sheetsClient";
import type { SheetEmployeeRow } from "../shift-output/computeEmployeeShiftSummary";

export type ReadShiftOutputRowsInput = {
  storeId: string;
  outputSheetId: string;
  sheetTitle: string; // "YYYY-MM"
};

export type ReadShiftOutputSheetResult = {
  headerRow: string[]; // 1行目（日付見出し行）。先頭セルは従業員名列のための空文字
  rows: SheetEmployeeRow[];
};

// 出力用スプレッドシートの対象月タブを読み直し、見出し行と、行ごと
// （従業員ごと）のセルのテキストを返す。店長がスプレッドシート上で直接
// 手直しした後の最新の値を取得するために使う（書き込みは行わない）。
export async function readShiftOutputSheet(
  input: ReadShiftOutputRowsInput,
): Promise<ReadShiftOutputSheetResult> {
  const accessToken = await getAccessTokenForStore(input.storeId);
  const { sheets } = createGoogleClients(accessToken);

  let values: string[][];
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: input.outputSheetId,
      range: `'${input.sheetTitle}'!A1:ZZ`,
    });
    values = (response.data.values ?? []) as string[][];
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("Unable to parse range")) {
      throw new Error(
        `${input.sheetTitle}のタブが見つかりませんでした。先にその月のシフトを生成してください。`,
      );
    }
    throw error;
  }

  const [headerRow = [], ...bodyRows] = values;
  return {
    headerRow: headerRow.map((cell) => String(cell ?? "")),
    rows: bodyRows
      .filter((row) => row[0])
      .map((row) => ({
        employeeName: String(row[0]),
        cellTexts: row.slice(1).map((cell) => String(cell ?? "")),
      })),
  };
}

// readShiftOutputSheetのrowsだけが欲しい呼び出し側向けの薄いラッパー
// （店長画面の集計表示など）。
export async function readShiftOutputRows(
  input: ReadShiftOutputRowsInput,
): Promise<SheetEmployeeRow[]> {
  const { rows } = await readShiftOutputSheet(input);
  return rows;
}
