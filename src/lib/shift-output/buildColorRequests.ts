import { hexToRgb } from "./colors";
import type { SheetMatrix } from "./buildSheetMatrix";

// sheets_v4.Schema$Request の必要最小限の形（googleapisへの直接依存を避け、
// このモジュールはGoogle APIクライアント無しで単体テストできるようにする）。
export type SheetsApiRequest = Record<string, unknown>;

const CLEAR_FORMAT_ROW_COUNT = 1000;
const CLEAR_FORMAT_COLUMN_COUNT = 60;

// 既存タブを再利用する（＝上書き再生成する）ときに、前回書き込み時の
// 背景色が新しい表の外側に残らないよう、十分広い範囲の背景色を先にクリアする。
export function buildClearFormatRequest(sheetId: number): SheetsApiRequest {
  return {
    repeatCell: {
      range: {
        sheetId,
        startRowIndex: 0,
        endRowIndex: CLEAR_FORMAT_ROW_COUNT,
        startColumnIndex: 0,
        endColumnIndex: CLEAR_FORMAT_COLUMN_COUNT,
      },
      cell: { userEnteredFormat: { backgroundColor: { red: 1, green: 1, blue: 1 } } },
      fields: "userEnteredFormat.backgroundColor",
    },
  };
}

// matrixの各データ行（1行目のヘッダーは除く。日付列はA列の次から始まる）について、
// 行ごとに1つのupdateCellsリクエストを作る。値(values.update)は別APIで書き込み済み
// の前提で、fieldsをbackgroundColorのみに絞ることでテキストを上書きしない。
export function buildColorRequests(sheetId: number, matrix: SheetMatrix): SheetsApiRequest[] {
  return matrix.rows.map((row, rowIndex) => ({
    updateCells: {
      range: {
        sheetId,
        startRowIndex: rowIndex + 1,
        endRowIndex: rowIndex + 2,
        startColumnIndex: 1,
        endColumnIndex: 1 + row.cells.length,
      },
      rows: [
        {
          values: row.cells.map((cell) => ({
            userEnteredFormat: { backgroundColor: hexToRgb(cell.backgroundColor) },
          })),
        },
      ],
      fields: "userEnteredFormat.backgroundColor",
    },
  }));
}
