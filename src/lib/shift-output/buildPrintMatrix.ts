import { columnIndexToLetter } from "./a1Notation";
import { buildAttendanceCountFormulaRows } from "./buildAttendanceCountFormulas";
import {
  CLOSED_DAY_COLOR,
  LEAVE_COLOR_LIGHTEN_AMOUNT,
  REQUESTED_LEAVE_COLOR,
  SYSTEM_ASSIGNED_LEAVE_COLOR,
  lightenHexColor,
  pickFallbackShiftColor,
} from "./colors";
import { enumerateDates, getIsoWeekday } from "../shift-solver/dateUtils";
import type { ISODate } from "../shift-solver/types";

// 日本のカレンダーの慣習に合わせ、日付見出しの文字色を土曜=青・日曜=赤にする。
export const SATURDAY_HEADER_TEXT_COLOR = "#1d4ed8"; // blue-700
export const SUNDAY_HEADER_TEXT_COLOR = "#dc2626"; // red-600

const WEEKDAY_LABELS = ["月", "火", "水", "木", "金", "土", "日"] as const;

export type PrintLegendEntry = {
  text: string; // 通常タブのセルに入りうる文字列（この文字列と完全一致したらこのエントリを使う）
  abbreviation: string; // 印刷用シートのセルに表示する短い文字（先頭1文字）
  color: string; // "#RRGGBB"
  timeRange: string | null; // "09:00〜18:00" など。休み系はnull
};

export type PrintHeaderCell = { text: string; textColor: string | null }; // textColor: nullは既定（黒）
export type PrintRow = {
  employeeName: string;
  // trueなら、この行の上端に太線を引く（雇用形態が直前の行と変わる境目）。
  // 一番最初の行はtrueにしない（表の外枠と重なるだけで意味がないため）。
  isEmploymentTypeBoundary: boolean;
  // 各セルの数式（例:"=LEFT('2026-11'!B2,1)"）。通常タブの対応セルの先頭1文字を
  // 直接参照するため、通常タブを手直しすると印刷用シート側も自動で追従する。
  formulas: string[];
  // formulasと同じ並び（日付列と同数）で、先頭1文字に省略する前の全文を
  // ミラーする数式（例:"='2026-11'!B2"）。セルの色を条件付き書式で決める
  // ための下準備。Google Sheetsの条件付き書式（カスタム数式）は別シートの
  // セルを直接参照できない制約があるため、印刷用シート自身の非表示列に
  // この全文をミラーしておき、条件付き書式はそちら（同一シート内）を参照する。
  helperFormulas: string[];
};
export type PrintAttendanceCountRow = {
  label: string; // 例:「早番 出勤人数」
  formulas: string[]; // 日付列と同じ並び順・同じ数（通常タブを参照するCOUNTIF数式）
};
export type PrintMatrix = {
  // 見出しは「日付（日番号のみ）」「曜日」の2行に分ける（月表記は入れない。
  // 対象は常に1か月分なので不要な情報になるため）。
  dateRow: PrintHeaderCell[];
  weekdayRow: PrintHeaderCell[];
  rows: PrintRow[];
  // 勤務区分（合算先でまとめたグループ単位）ごとの、日付別の出勤人数。
  attendanceCountRows: PrintAttendanceCountRow[];
  legend: PrintLegendEntry[];
};

export type BuildPrintMatrixInput = {
  periodStart: ISODate;
  periodEnd: ISODate;
  // 参照する通常タブのタブ名（例:"2026-11"）。セルの数式・出勤人数の数式は
  // すべてこのタブを直接参照する。
  sourceSheetTitle: string;
  // 通常タブと同じ並び順で渡すこと（数式が「同じ行番号」を参照する前提のため）。
  // employmentTypeIdは雇用形態の境目に太線を引くためだけに使う。
  employees: { name: string; employmentTypeId: string }[];
  shiftTypes: {
    id: string;
    name: string;
    color: string | null;
    startTime: string;
    endTime: string;
    // 設定されている場合、この勤務区分の出勤人数は自分自身の行を持たず、
    // 参照先（親）の行に合算される（例:「早番パートバイト」→「早番」）。
    countsTowardShiftTypeId?: string | null;
  }[];
};

// 印刷・画像化しやすい1文字コード＋凡例の表を、通常タブを直接参照する数式で
// 組み立てる純粋関数。値そのものではなく数式を組み立てるため、通常タブを
// 店長がドロップダウンや直接入力で手直しすると、この表の内容もSheets側で
// 自動的に再計算される（アプリ側の再生成は不要）。
// 数式は通常タブの「対応するセル（同じ日付・同じ行位置）」を直接参照する
// ため、呼び出し側は通常タブと全く同じ並び順でemployeesを渡す必要がある。
export function buildPrintMatrix(input: BuildPrintMatrixInput): PrintMatrix {
  const legend = buildPrintLegend(input.shiftTypes);

  const dates = enumerateDates(input.periodStart, input.periodEnd);
  const dateRow: PrintHeaderCell[] = [
    { text: "", textColor: null },
    ...dates.map((date) => ({ text: String(Number(date.slice(8, 10))), textColor: weekendTextColor(date) })),
  ];
  const weekdayRow: PrintHeaderCell[] = [
    { text: "", textColor: null },
    ...dates.map((date) => ({
      text: WEEKDAY_LABELS[getIsoWeekday(date) - 1],
      textColor: weekendTextColor(date),
    })),
  ];

  const rows = input.employees.map((employee, index) => {
    const previousEmploymentTypeId = input.employees[index - 1]?.employmentTypeId;
    // 通常タブの1-indexed行番号（1行目は日付見出し行なので、従業員は2行目から）
    const sourceRowNumber = 2 + index;
    return {
      employeeName: employee.name,
      isEmploymentTypeBoundary: index > 0 && previousEmploymentTypeId !== employee.employmentTypeId,
      formulas: dates.map((_, dayIndex) => {
        // +1: A列（0列目）は従業員名なので、1日目はB列（1列目）から始まる
        const columnLetter = columnIndexToLetter(dayIndex + 1);
        return `=LEFT('${input.sourceSheetTitle}'!${columnLetter}${sourceRowNumber},1)`;
      }),
      helperFormulas: dates.map((_, dayIndex) => {
        const columnLetter = columnIndexToLetter(dayIndex + 1);
        return `='${input.sourceSheetTitle}'!${columnLetter}${sourceRowNumber}`;
      }),
    };
  });

  const attendanceCountRows = buildAttendanceCountFormulaRows({
    employeeCount: input.employees.length,
    dateColumnCount: dates.length,
    shiftTypes: input.shiftTypes,
    sourceSheetTitle: input.sourceSheetTitle,
  });

  return { dateRow, weekdayRow, rows, attendanceCountRows, legend };
}

function weekendTextColor(date: ISODate): string | null {
  const weekday = getIsoWeekday(date); // 1=月 ... 7=日
  if (weekday === 6) return SATURDAY_HEADER_TEXT_COLOR;
  if (weekday === 7) return SUNDAY_HEADER_TEXT_COLOR;
  return null;
}

// 出力用（通常タブ）と全く同じ色ロジック（colors.tsのbuildCellLegendが使う
// ものと同一のパレット・明るさ）を使う。勤務区分マスタの色設定は使わない
// （文字が同じでも色で見分けられるようにするためと、通常タブ・印刷用シート
// の見た目を揃えるため）。この凡例は、印刷用シートのセルの色を条件付き書式
// （通常タブの対応セルの文字列を参照するルール）で決めるためにも使う。
export function buildPrintLegend(
  shiftTypes: { name: string; color: string | null; startTime: string; endTime: string }[],
): PrintLegendEntry[] {
  return [
    ...shiftTypes.map((shiftType, index) => ({
      text: shiftType.name,
      abbreviation: firstCharacter(shiftType.name),
      color: pickFallbackShiftColor(index),
      timeRange: `${shiftType.startTime}〜${shiftType.endTime}`,
    })),
    {
      text: "休",
      abbreviation: "休",
      color: lightenHexColor(REQUESTED_LEAVE_COLOR, LEAVE_COLOR_LIGHTEN_AMOUNT),
      timeRange: null,
    },
    {
      text: "公休",
      abbreviation: "公",
      color: lightenHexColor(SYSTEM_ASSIGNED_LEAVE_COLOR, LEAVE_COLOR_LIGHTEN_AMOUNT),
      timeRange: null,
    },
    {
      text: "定休日",
      abbreviation: "定",
      color: lightenHexColor(CLOSED_DAY_COLOR, LEAVE_COLOR_LIGHTEN_AMOUNT),
      timeRange: null,
    },
  ];
}

// サロゲートペア（絵文字など）を含む勤務区分名でも文字化けしないよう、
// スプレッド構文でUnicodeコードポイント単位に分割してから先頭を取る。
function firstCharacter(text: string): string {
  return [...text][0] ?? "";
}

// 色を白方向にamount（0〜1）だけ混ぜて明るくする。amount=0で元の色のまま、
// amount=1で白になる。colors.tsから再エクスポートしている（従来の呼び出し元
// との互換のため）。
export { lightenHexColor };
