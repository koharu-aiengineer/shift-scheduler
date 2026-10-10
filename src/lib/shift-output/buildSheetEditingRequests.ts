import { hexToRgb, type CellLegendEntry } from "./colors";
import type { SheetMatrix } from "./buildSheetMatrix";

// sheets_v4.Schema$Request の必要最小限の形（googleapisへの直接依存を避け、
// このモジュールはGoogle APIクライアント無しで単体テストできるようにする）。
export type SheetsApiRequest = Record<string, unknown>;

const CLEAR_FORMAT_ROW_COUNT = 1000;
const CLEAR_FORMAT_COLUMN_COUNT = 60;

// 既存タブを再利用する（＝上書き再生成する）ときに、前回書き込み時の
// 背景色・太字・罫線が新しい表の外側に残らないよう、十分広い範囲を先に
// クリアする。通常の出勤セルの色分けは条件付き書式（buildConditionalFormatRequests）
// が担うため、ここでクリアするのは「ルールに一致しない自由入力セル」に前回の
// 色が残らないようにするための保険。罫線・太字も含めているのは、出勤人数の
// 行（buildAttendanceCountFormatRequests）の太字・境界線が、従業員数の増減で
// 行位置が変わったときに前回の位置に残ったまま新しい位置にも追加され、
// 二重（ズレて見える）にならないようにするため。
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
      cell: {
        userEnteredFormat: {
          backgroundColor: { red: 1, green: 1, blue: 1 },
          textFormat: { bold: false },
          borders: {
            top: { style: "NONE" },
            bottom: { style: "NONE" },
            left: { style: "NONE" },
            right: { style: "NONE" },
          },
        },
      },
      fields: "userEnteredFormat(backgroundColor,textFormat,borders)",
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

// 出勤人数の行（勤務区分ごとの日付別出勤人数。値そのものはCOUNTIFを使った
// 数式でSheets側に計算させる）の見た目（太字・従業員の行との区切り線）を
// 組み立てる。rowCountが0（対象の勤務区分が無い）なら何も返さない。
export function buildAttendanceCountFormatRequests(
  sheetId: number,
  startRowIndex: number, // 0-indexed。従業員の最終行の次の行
  rowCount: number,
  totalColumns: number, // 従業員名列＋日付列
): SheetsApiRequest[] {
  if (rowCount <= 0) return [];
  return [
    {
      repeatCell: {
        range: {
          sheetId,
          startRowIndex,
          endRowIndex: startRowIndex + rowCount,
          startColumnIndex: 0,
          endColumnIndex: totalColumns,
        },
        cell: { userEnteredFormat: { textFormat: { bold: true } } },
        fields: "userEnteredFormat.textFormat",
      },
    },
    {
      updateBorders: {
        range: {
          sheetId,
          startRowIndex,
          endRowIndex: startRowIndex + 1,
          startColumnIndex: 0,
          endColumnIndex: totalColumns,
        },
        top: { style: "SOLID_THICK", color: { red: 0, green: 0, blue: 0 } },
      },
    },
  ];
}

// 従業員名の列（A列）を、横スクロールしても常に見えるように固定する。
// 印刷用シート（buildPrintSheetRequests.ts）も同様に名前の列を固定している。
export function buildFreezePaneRequest(sheetId: number): SheetsApiRequest {
  return {
    updateSheetProperties: {
      properties: { sheetId, gridProperties: { frozenColumnCount: 1 } },
      fields: "gridProperties.frozenColumnCount",
    },
  };
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
