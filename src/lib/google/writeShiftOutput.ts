import { getAccessTokenForStore } from "./getAccessTokenForStore";
import { createGoogleClients } from "./sheetsClient";
import {
  buildAttendanceCountFormatRequests,
  buildClearFormatRequest,
  buildConditionalFormatRequests,
  buildDataValidationRequest,
  buildDeleteConditionalFormatRequests,
  buildFreezePaneRequest,
} from "../shift-output/buildSheetEditingRequests";
import { buildAttendanceCountFormulaRows } from "../shift-output/buildAttendanceCountFormulas";
import { buildSheetMatrix } from "../shift-output/buildSheetMatrix";
import { buildCellLegend } from "../shift-output/colors";
import { enumerateDates } from "../shift-solver/dateUtils";
import type { Assignment, ISODate } from "../shift-solver/types";

export type WriteShiftOutputInput = {
  storeId: string;
  storeName: string;
  outputSheetId: string | null; // stores.output_sheet_id。nullなら新規作成する
  periodStart: ISODate;
  periodEnd: ISODate;
  employees: { id: string; name: string }[];
  shiftTypes: {
    id: string;
    name: string;
    color: string | null;
    countsTowardShiftTypeId?: string | null;
  }[];
  assignments: Assignment[];
  // 店舗の定休日・特別休業日。該当日は全員「定休日」と表示する。
  closedDates?: ISODate[];
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
  const { sheetId, existingConditionalFormatRuleCount } = await ensureSheet(
    sheets,
    spreadsheetId,
    sheetTitle,
  );

  const matrix = buildSheetMatrix({
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    employees: input.employees,
    shiftTypes: input.shiftTypes,
    assignments: input.assignments,
    closedDates: input.closedDates,
  });
  const legend = buildCellLegend(input.shiftTypes);

  const values = [
    matrix.headerRow,
    ...matrix.rows.map((row) => [row.employeeName, ...row.cells.map((cell) => cell.text)]),
  ];

  // values.updateは指定した範囲にしか書き込まない（それより外側の古いセルの
  // 値は勝手に消えない）。前回より従業員数が減った月を再生成した場合などに、
  // 出勤人数の行が前回の位置に古いラベル・数式のまま残ってしまう（書式は
  // 下のbatchUpdateで広くクリアしているが、値は別チャンネルのため別途必要）。
  // そのため値の書き込み前に、書式クリアと同じ広さの範囲で値もクリアする。
  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: `'${sheetTitle}'!A1:BH1000`,
  });

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${sheetTitle}'!A1`,
    valueInputOption: "RAW",
    requestBody: { values },
  });

  // 勤務区分（合算先でまとめたグループ）ごとの、日付別出勤人数の行。
  // 値ではなくCOUNTIFの数式として書き込むことで、店長がセルをドロップダウンや
  // 直接入力で手直しした際も、Sheets側で自動的に再計算される。
  const dateColumnCount = enumerateDates(input.periodStart, input.periodEnd).length;
  const attendanceCountRows = buildAttendanceCountFormulaRows({
    employeeCount: input.employees.length,
    dateColumnCount,
    shiftTypes: input.shiftTypes,
  });
  const attendanceCountStartRowIndex = 1 + matrix.rows.length; // 0-indexed。従業員の最終行の次
  if (attendanceCountRows.length > 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      // 数式を文字列としてではなく数式として解釈させるためUSER_ENTEREDにする
      // （上のvalues.updateはセルの見た目のテキストをそのまま書き込みたいので
      // RAWのまま。数式を書くこの範囲だけ別のvalues.update呼び出しにしている）。
      range: `'${sheetTitle}'!A${attendanceCountStartRowIndex + 1}`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: attendanceCountRows.map((row) => [row.label, ...row.formulas]),
      },
    });
  }

  // 背景色は条件付き書式に任せる（店長がセルの値をドロップダウンや直接入力で
  // 手直ししても、色が自動で追従するようにするため）。再生成のたびにルールが
  // 積み重ならないよう、既存ルールを全て削除してから作り直す。
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        buildClearFormatRequest(sheetId),
        buildFreezePaneRequest(sheetId),
        ...buildDeleteConditionalFormatRequests(sheetId, existingConditionalFormatRuleCount),
        buildDataValidationRequest(sheetId, matrix, legend),
        ...buildConditionalFormatRequests(sheetId, matrix, legend),
        ...buildAttendanceCountFormatRequests(
          sheetId,
          attendanceCountStartRowIndex,
          attendanceCountRows.length,
          1 + dateColumnCount,
        ),
      ],
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

export type EnsureSheetResult = {
  sheetId: number;
  // 既存タブが持つ条件付き書式ルールの件数（新規タブなら0）。
  // 再生成時にこの件数分だけ削除してから、新しいルールを作り直す。
  existingConditionalFormatRuleCount: number;
};

// 対象月のシート（タブ）が無ければ追加し、あればsheetIdを返す。
// writePrintSheet.tsからも再利用する（印刷用タブも同じ「無ければ作る」動作のため）。
export async function ensureSheet(
  sheets: ReturnType<typeof createGoogleClients>["sheets"],
  spreadsheetId: string,
  sheetTitle: string,
): Promise<EnsureSheetResult> {
  const spreadsheet = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets(properties(sheetId,title),conditionalFormats)",
  });
  const existing = spreadsheet.data.sheets?.find((s) => s.properties?.title === sheetTitle);
  if (existing?.properties?.sheetId != null) {
    return {
      sheetId: existing.properties.sheetId,
      existingConditionalFormatRuleCount: existing.conditionalFormats?.length ?? 0,
    };
  }

  const response = await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests: [{ addSheet: { properties: { title: sheetTitle } } }] },
  });

  const sheetId = response.data.replies?.[0]?.addSheet?.properties?.sheetId;
  if (sheetId == null) {
    throw new Error("出力用シートのタブ作成に失敗しました");
  }
  return { sheetId, existingConditionalFormatRuleCount: 0 };
}

function periodToSheetTitle(periodStart: ISODate): string {
  return periodStart.slice(0, 7); // "YYYY-MM"
}
