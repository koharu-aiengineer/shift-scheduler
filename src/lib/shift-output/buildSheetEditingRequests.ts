import { hexToRgb, type CellLegendEntry } from "./colors";
import type { SheetMatrix } from "./buildSheetMatrix";

// sheets_v4.Schema$Request の必要最小限の形（googleapisへの直接依存を避け、
// このモジュールはGoogle APIクライアント無しで単体テストできるようにする）。
export type SheetsApiRequest = Record<string, unknown>;

const CLEAR_FORMAT_ROW_COUNT = 1000;
const CLEAR_FORMAT_COLUMN_COUNT = 60;

// 既存タブを再利用する（＝上書き再生成する）ときに、前回書き込み時の
// 背景色が新しい表の外側に残らないよう、十分広い範囲の背景色を先にクリアする。
// 通常の出勤セルの色分けは条件付き書式（buildConditionalFormatRequests）が
// 担うため、ここでクリアするのは「ルールに一致しない自由入力セル」に前回の
// 色が残らないようにするための保険。
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

function dataRange(sheetId: number, matrix: SheetMatrix) {
  return {
    sheetId,
    startRowIndex: 1, // 1行目はヘッダー
    endRowIndex: 1 + matrix.rows.length,
    startColumnIndex: 1, // A列は従業員名
    endColumnIndex: 1 + (matrix.rows[0]?.cells.length ?? 0),
  };
}

// 出勤欄（表のデータ部分）にドロップダウン（データの入力規則）を設定する。
// strict:falseにより、リストにない文字列を直接入力することも引き続き許可する
// （店長がスプレッドシート上で自由に手直しできる、という既存方針を維持するため）。
export function buildDataValidationRequest(
  sheetId: number,
  matrix: SheetMatrix,
  legend: CellLegendEntry[],
): SheetsApiRequest {
  return {
    setDataValidation: {
      range: dataRange(sheetId, matrix),
      rule: {
        condition: {
          type: "ONE_OF_LIST",
          values: legend.map((entry) => ({ userEnteredValue: entry.text })),
        },
        showCustomUi: true,
        strict: false,
      },
    },
  };
}

// セルの文字列が勤務区分名／休／公休のいずれかと一致したら、対応する色を
// 自動で背景に適用する条件付き書式ルールを作る。店長がドロップダウンや
// 直接入力でセルの内容を変えると、色も自動で追従する。
export function buildConditionalFormatRequests(
  sheetId: number,
  matrix: SheetMatrix,
  legend: CellLegendEntry[],
): SheetsApiRequest[] {
  const range = dataRange(sheetId, matrix);
  return legend.map((entry, index) => ({
    addConditionalFormatRule: {
      index,
      rule: {
        ranges: [range],
        booleanRule: {
          condition: { type: "TEXT_EQ", values: [{ userEnteredValue: entry.text }] },
          format: { backgroundColor: hexToRgb(entry.color) },
        },
      },
    },
  }));
}

// 再生成のたびにルールが積み重ならないよう、そのシートに既存の条件付き書式
// ルールを全て削除するリクエストを作る。indexは後ろから削除しないと、
// 削除のたびに残りのルールのindexがズレてしまうため降順にする。
export function buildDeleteConditionalFormatRequests(
  sheetId: number,
  existingRuleCount: number,
): SheetsApiRequest[] {
  const requests: SheetsApiRequest[] = [];
  for (let index = existingRuleCount - 1; index >= 0; index--) {
    requests.push({ deleteConditionalFormatRule: { sheetId, index } });
  }
  return requests;
}
