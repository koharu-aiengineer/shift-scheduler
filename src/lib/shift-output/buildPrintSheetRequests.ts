import { columnIndexToLetter } from "./a1Notation";
import { hexToRgb } from "./colors";
import type { PrintHeaderCell, PrintMatrix } from "./buildPrintMatrix";
import type { SheetsApiRequest } from "./buildSheetEditingRequests";

// writePrintSheet.tsが`'タブ名'!${columnIndexToLetter(...)}...`の形でセル参照を
// 組み立てるために使う。実体はa1Notation.tsにあり、ここでは呼び出し側の
// import元を変えずに済むよう再エクスポートしている。
export { columnIndexToLetter };

const DATE_COLUMN_WIDTH_PX = 36; // 日数が多い月でも1画面・1ページに収まりやすい幅
const NAME_COLUMN_WIDTH_PX = 110;

// 凡例は表（日付グリッド）とは別の列に置く。日付列は幅を詰めているため、
// 同じ列に「早番パートバイト」のような長い勤務区分名を置くと窮屈で読みにくく
// なるため（見た目の詰まりを避けるための意図的な分離）。
const LEGEND_SWATCH_COLUMN_WIDTH_PX = 24;
const LEGEND_ABBREVIATION_COLUMN_WIDTH_PX = 32;
const LEGEND_NAME_COLUMN_WIDTH_PX = 170;
const LEGEND_TIME_RANGE_COLUMN_WIDTH_PX = 120;
const LEGEND_GAP_COLUMN_COUNT = 1; // 表と凡例の間に空ける列数

export type PrintSheetLayout = {
  titleRowIndex: number;
  dateRowIndex: number; // 日付（日番号のみ）の行
  weekdayRowIndex: number; // 曜日の行（日付行の直下、別行）
  dataStartRowIndex: number;
  dataRowCount: number;
  dateColumnCount: number;
  // 勤務区分ごとの日付別出勤人数（従業員行の直下）
  attendanceCountStartRowIndex: number;
  attendanceCountRowCount: number;
  // 従業員データと同じ行・同じ日数分だけ並ぶ、非表示のヘルパー列ブロックの
  // 開始列（0-indexed）。条件付き書式（セルの色）が「同一シート内」から
  // 全文を参照できるようにするための下準備（詳しくはbuildPrintMatrix.tsの
  // PrintRow.helperFormulasのコメントを参照）。ユーザーの目には触れない。
  helperColumnStart: number;
  // 凡例（表の右側、別の列ブロックとして配置する）
  legendColumnStart: number; // 凡例ブロックの開始列（0-indexed）
  legendTitleRowIndex: number;
  legendStartRowIndex: number;
  legendRowCount: number;
};

export type PrintSheetContent = {
  // メイン表（タイトル・日付・曜日・従業員行）。A1起点で書き込む。
  // セルの中身は数式（通常タブを参照する）なので、書き込みはvalueInputOption:
  // "USER_ENTERED"で行う必要がある。
  mainValues: (string | number)[][];
  // 凡例ブロック。legendColumnStart列・legendTitleRowIndex行を起点に書き込む。
  // こちらは固定テキストなのでRAWのままでよい。
  legendValues: (string | number)[][];
  layout: PrintSheetLayout;
};

// values.updateにそのまま渡せる2次元配列（メイン表・凡例の2ブロック）と、
// 後続の書式設定（buildPrintFormatRequests）が必要とする各ブロックの
// 行・列位置をまとめて組み立てる。
export function buildPrintSheetContent(matrix: PrintMatrix, title: string): PrintSheetContent {
  const dateColumnCount = matrix.dateRow.length - 1; // 先頭は従業員名列
  const totalColumns = 1 + dateColumnCount;
  const dateRowIndex = 1; // 0:タイトル行
  const weekdayRowIndex = 2;
  const dataStartRowIndex = 3;
  const dataRowCount = matrix.rows.length;

  const attendanceCountStartRowIndex = dataStartRowIndex + dataRowCount;
  const attendanceCountRowCount = matrix.attendanceCountRows.length;

  // 非表示のヘルパー列ブロック（全文ミラー。条件付き書式が同一シート内から
  // 参照するためのもの）は、表の右側・凡例より前に、日付列と同じ列数だけ
  // 隙間なく続ける（従業員行の右端にそのまま繋げて書き込む）。
  const helperColumnStart = totalColumns;

  const mainValues: (string | number)[][] = [
    [title],
    matrix.dateRow.map((cell) => cell.text),
    matrix.weekdayRow.map((cell) => cell.text),
    ...matrix.rows.map((row) => [row.employeeName, ...row.formulas, ...row.helperFormulas]),
    ...matrix.attendanceCountRows.map((row) => [row.label, ...row.formulas]),
  ];

  const legendColumnStart = helperColumnStart + dateColumnCount + LEGEND_GAP_COLUMN_COUNT;
  const legendTitleRowIndex = 0;
  const legendStartRowIndex = 1;
  const legendRowCount = matrix.legend.length;

  const legendValues: (string | number)[][] = [
    ["凡例（色は各セルの背景色と対応）"],
    ...matrix.legend.map((entry) => ["", entry.abbreviation, entry.text, entry.timeRange ?? ""]),
  ];

  return {
    mainValues,
    legendValues,
    layout: {
      titleRowIndex: 0,
      dateRowIndex,
      weekdayRowIndex,
      dataStartRowIndex,
      dataRowCount,
      dateColumnCount,
      attendanceCountStartRowIndex,
      attendanceCountRowCount,
      helperColumnStart,
      legendColumnStart,
      legendTitleRowIndex,
      legendStartRowIndex,
      legendRowCount,
    },
  };
}

// 新規タブの既定のグリッドサイズ（列数）は、凡例を表の右側の別列に置く前提の
// 幅に足りないことがある（例: 日数が多い月は日付列だけでその既定値に近づく）。
// values.update・updateCells等はグリッドの範囲を自動では広げてくれないため、
// 書き込み前に明示的にグリッドサイズを広げる必要がある。
const MIN_GRID_ROW_COUNT = 1000;
const MIN_GRID_COLUMN_COUNT = 26;

export function computeRequiredGridSize(layout: PrintSheetLayout): {
  rowCount: number;
  columnCount: number;
} {
  const columnCount = layout.legendColumnStart + 4; // 凡例4列（色見本・略称・名前・時間帯）
  const rowCount = Math.max(
    layout.attendanceCountStartRowIndex + layout.attendanceCountRowCount,
    layout.legendStartRowIndex + layout.legendRowCount,
  );
  return {
    rowCount: Math.max(rowCount, MIN_GRID_ROW_COUNT),
    columnCount: Math.max(columnCount, MIN_GRID_COLUMN_COUNT),
  };
}

// 値の書き込み（values.update）より前に呼ぶ必要がある。グリッドが既に
// これより大きい場合に縮めてしまわないよう、必ず現実的な最小値以上を渡す
// （computeRequiredGridSizeのMIN_GRID_*で担保）。
export function buildGridResizeRequest(sheetId: number, layout: PrintSheetLayout): SheetsApiRequest {
  const { rowCount, columnCount } = computeRequiredGridSize(layout);
  return {
    updateSheetProperties: {
      properties: { sheetId, gridProperties: { rowCount, columnCount } },
      fields: "gridProperties.rowCount,gridProperties.columnCount",
    },
  };
}

// 印刷用シートのセルの色は、条件付き書式で「非表示のヘルパー列（同一シート内。
// 通常タブの対応セルの全文をミラーしたもの）」を参照して決める
// （updateCellsで直接書き込むのではなく）。これにより、通常タブを手直しすると
// 印刷用シート側の色も自動で追従する。
// Google Sheetsの条件付き書式（カスタム数式）は別シートのセルを直接参照
// できない制約があるため、一度印刷用シート自身の非表示列に全文をミラーして
// から、条件付き書式はそちら（同一シート）を参照する2段構えにしている。
// 条件付き書式のカスタム数式は「範囲の左上セルに入力したもの」として扱われ、
// 範囲内の他のセルには相対参照として自動調整される（通常の数式のフィル
// ダウン／フィルライトと同じ挙動）。そのため、データ範囲の左上セル（B列・
// 最初の従業員行）に対応するヘルパー列の同じ行のセルを指すformulaを
// 書けばよい。
export function buildDataConditionalFormatRequests(
  sheetId: number,
  matrix: PrintMatrix,
  layout: PrintSheetLayout,
): SheetsApiRequest[] {
  if (layout.dataRowCount === 0) return [];
  const range = {
    sheetId,
    startRowIndex: layout.dataStartRowIndex,
    endRowIndex: layout.dataStartRowIndex + layout.dataRowCount,
    startColumnIndex: 1,
    endColumnIndex: 1 + layout.dateColumnCount,
  };
  const helperAnchorCell = `${columnIndexToLetter(layout.helperColumnStart)}${layout.dataStartRowIndex + 1}`;
  return matrix.legend.map((entry, index) => ({
    addConditionalFormatRule: {
      index,
      rule: {
        ranges: [range],
        booleanRule: {
          condition: {
            type: "CUSTOM_FORMULA",
            values: [{ userEnteredValue: `=${helperAnchorCell}="${escapeFormulaText(entry.text)}"` }],
          },
          format: { backgroundColor: hexToRgb(entry.color) },
        },
      },
    },
  }));
}

// 印刷用シートの書式（太字・文字色・列幅・見出し固定）をまとめて組み立てる。
// データセルの背景色は別関数（buildDataConditionalFormatRequests）が条件付き
// 書式として担う。
export function buildPrintFormatRequests(
  sheetId: number,
  matrix: PrintMatrix,
  layout: PrintSheetLayout,
): SheetsApiRequest[] {
  const totalColumns = 1 + layout.dateColumnCount; // 従業員名列＋日付列
  const legendColumnCount = 4; // 色見本・略称・勤務区分名・時間帯
  const requests: SheetsApiRequest[] = [];

  // 前回書き込み分の背景色・書式・罫線が新しい表の外側に残らないよう、広めに
  // クリアする。罫線もここで含めてクリアしないと、雇用形態の境目・出勤人数の
  // 行の太線が、従業員数の増減で行位置が変わったときに前回の位置に残ったまま
  // 新しい位置にも追加され、線が二重（ズレて見える）になってしまう。
  // クリアする範囲は、今回書き込むグリッド全体（ヘルパー列・凡例を含む）を
  // 必ず覆うよう、実際に必要なグリッドサイズ（computeRequiredGridSize）に
  // 合わせる（固定の列数だと、日数の多い月でヘルパー列・凡例が範囲外に
  // はみ出すことがある）。
  const requiredGridSize = computeRequiredGridSize(layout);
  requests.push({
    repeatCell: {
      range: {
        sheetId,
        startRowIndex: 0,
        endRowIndex: requiredGridSize.rowCount,
        startColumnIndex: 0,
        endColumnIndex: requiredGridSize.columnCount,
      },
      cell: {
        userEnteredFormat: {
          backgroundColor: { red: 1, green: 1, blue: 1 },
          textFormat: { bold: false, foregroundColor: { red: 0, green: 0, blue: 0 } },
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
  });

  // タイトル行: 太字・少し大きめの文字にする。セルの結合はしない
  // （結合すると、従業員名列だけを固定する下のupdateSheetProperties
  // （frozenColumnCount）と衝突する — 固定する列の境界が結合セルの
  // 途中を横切ることはGoogle Sheets側で許可されていない）。
  // 結合しなくても、右隣のセルが空欄であれば見た目上はみ出して表示される。
  requests.push({
    repeatCell: {
      range: {
        sheetId,
        startRowIndex: layout.titleRowIndex,
        endRowIndex: layout.titleRowIndex + 1,
        startColumnIndex: 0,
        endColumnIndex: Math.max(totalColumns, 1),
      },
      cell: { userEnteredFormat: { textFormat: { bold: true, fontSize: 14 } } },
      fields: "userEnteredFormat.textFormat",
    },
  });

  // 日付行・曜日行: 太字＋土曜=青・日曜=赤の文字色（それ以外は黒）。
  // 日付と曜日を分けて2行にしているのは、列幅が狭くても読み取りやすくするため。
  requests.push(buildHeaderRowFormatRequest(sheetId, layout.dateRowIndex, matrix.dateRow, totalColumns));
  requests.push(
    buildHeaderRowFormatRequest(sheetId, layout.weekdayRowIndex, matrix.weekdayRow, totalColumns),
  );

  // 出勤人数の行: 太字にし、従業員の行との区切りが分かるよう上端に太線を引く。
  // （数値が通常タブを参照する数式のため、背景色での不足の目立たせはしない）
  if (layout.attendanceCountRowCount > 0) {
    requests.push({
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: layout.attendanceCountStartRowIndex,
          endRowIndex: layout.attendanceCountStartRowIndex + layout.attendanceCountRowCount,
          startColumnIndex: 0,
          endColumnIndex: totalColumns,
        },
        cell: { userEnteredFormat: { textFormat: { bold: true } } },
        fields: "userEnteredFormat.textFormat",
      },
    });
    requests.push(buildThickTopBorderRequest(sheetId, layout.attendanceCountStartRowIndex, totalColumns));
  }

  // 雇用形態の境目に太線を引く（社員・パート・アルバイトなどのまとまりを
  // 見やすくする）。境目の行の上端にだけ太い罫線を引く。
  requests.push(...buildEmploymentTypeBoundaryBorderRequests(sheetId, matrix, layout, totalColumns));

  // ヘルパー列（セルの色を決める条件付き書式が参照する、全文ミラー用の列）は
  // 店長の目に触れる必要がない内部データなので非表示にする。
  if (layout.dateColumnCount > 0) {
    requests.push({
      updateDimensionProperties: {
        range: {
          sheetId,
          dimension: "COLUMNS",
          startIndex: layout.helperColumnStart,
          endIndex: layout.helperColumnStart + layout.dateColumnCount,
        },
        properties: { hiddenByUser: true },
        fields: "hiddenByUser",
      },
    });
  }

  // 凡例タイトル: 太字（表とは別の列ブロックにあるため、表のタイトル行とは別に指定する）
  requests.push({
    repeatCell: {
      range: {
        sheetId,
        startRowIndex: layout.legendTitleRowIndex,
        endRowIndex: layout.legendTitleRowIndex + 1,
        startColumnIndex: layout.legendColumnStart,
        endColumnIndex: layout.legendColumnStart + legendColumnCount,
      },
      cell: { userEnteredFormat: { textFormat: { bold: true } } },
      fields: "userEnteredFormat.textFormat",
    },
  });

  // 凡例の色見本（1列目）: 表の日付列とは別の、凡例専用の列に置く
  if (layout.legendRowCount > 0) {
    requests.push({
      updateCells: {
        range: {
          sheetId,
          startRowIndex: layout.legendStartRowIndex,
          endRowIndex: layout.legendStartRowIndex + layout.legendRowCount,
          startColumnIndex: layout.legendColumnStart,
          endColumnIndex: layout.legendColumnStart + 1,
        },
        rows: matrix.legend.map((entry) => ({
          values: [{ userEnteredFormat: { backgroundColor: hexToRgb(entry.color) } }],
        })),
        fields: "userEnteredFormat.backgroundColor",
      },
    });
  }

  // 列幅: 日付列は狭くして、多い日数でも1画面・印刷1ページに収まりやすくする。
  // 凡例の各列は、日付列とは独立に、内容（特に勤務区分名）が読み取れる幅にする。
  requests.push({
    updateDimensionProperties: {
      range: { sheetId, dimension: "COLUMNS", startIndex: 0, endIndex: 1 },
      properties: { pixelSize: NAME_COLUMN_WIDTH_PX },
      fields: "pixelSize",
    },
  });
  requests.push({
    updateDimensionProperties: {
      range: { sheetId, dimension: "COLUMNS", startIndex: 1, endIndex: totalColumns },
      properties: { pixelSize: DATE_COLUMN_WIDTH_PX },
      fields: "pixelSize",
    },
  });
  const legendColumnWidths = [
    LEGEND_SWATCH_COLUMN_WIDTH_PX,
    LEGEND_ABBREVIATION_COLUMN_WIDTH_PX,
    LEGEND_NAME_COLUMN_WIDTH_PX,
    LEGEND_TIME_RANGE_COLUMN_WIDTH_PX,
  ];
  legendColumnWidths.forEach((pixelSize, offset) => {
    requests.push({
      updateDimensionProperties: {
        range: {
          sheetId,
          dimension: "COLUMNS",
          startIndex: layout.legendColumnStart + offset,
          endIndex: layout.legendColumnStart + offset + 1,
        },
        properties: { pixelSize },
        fields: "pixelSize",
      },
    });
  });

  // タイトル行・日付行・曜日行・従業員名列をスクロールしても常に見えるように固定する
  requests.push({
    updateSheetProperties: {
      properties: {
        sheetId,
        gridProperties: { frozenRowCount: layout.weekdayRowIndex + 1, frozenColumnCount: 1 },
      },
      fields: "gridProperties.frozenRowCount,gridProperties.frozenColumnCount",
    },
  });

  return requests;
}

// PrintRow.isEmploymentTypeBoundaryがtrueの行1つにつき1件、その行の上端
// （＝直前の行との境目）に太い罫線を引くリクエストを作る。
function buildEmploymentTypeBoundaryBorderRequests(
  sheetId: number,
  matrix: PrintMatrix,
  layout: PrintSheetLayout,
  totalColumns: number,
): SheetsApiRequest[] {
  return matrix.rows.flatMap((row, index) => {
    if (!row.isEmploymentTypeBoundary) return [];
    return [buildThickTopBorderRequest(sheetId, layout.dataStartRowIndex + index, totalColumns)];
  });
}

// 指定した行1行の上端（＝直前の行との境目）全体に太い罫線を引くリクエストを
// 作る。区切りを見やすくしたい箇所（雇用形態の境目、出勤人数の行の直前など）
// で共通して使う。
function buildThickTopBorderRequest(sheetId: number, rowIndex: number, totalColumns: number): SheetsApiRequest {
  return {
    updateBorders: {
      range: {
        sheetId,
        startRowIndex: rowIndex,
        endRowIndex: rowIndex + 1,
        startColumnIndex: 0,
        endColumnIndex: totalColumns,
      },
      top: { style: "SOLID_THICK", color: { red: 0, green: 0, blue: 0 } },
    },
  };
}

function buildHeaderRowFormatRequest(
  sheetId: number,
  rowIndex: number,
  headerCells: PrintHeaderCell[],
  totalColumns: number,
): SheetsApiRequest {
  return {
    updateCells: {
      range: { sheetId, startRowIndex: rowIndex, endRowIndex: rowIndex + 1, startColumnIndex: 0, endColumnIndex: totalColumns },
      rows: [
        {
          values: headerCells.map((cell) => ({
            userEnteredFormat: {
              textFormat: {
                bold: true,
                foregroundColor: cell.textColor ? hexToRgb(cell.textColor) : { red: 0, green: 0, blue: 0 },
              },
            },
          })),
        },
      ],
      fields: "userEnteredFormat.textFormat",
    },
  };
}

// 条件付き書式のカスタム数式の文字列に、勤務区分名の"（ダブルクォート）が
// 含まれていても壊れないようにする。
function escapeFormulaText(text: string): string {
  return text.replace(/"/g, '""');
}
