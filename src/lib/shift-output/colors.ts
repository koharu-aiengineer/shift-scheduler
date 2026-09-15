// 出力用スプレッドシートのセル背景色。
// - 勤務区分に色が未設定の場合に使うフォールバックパレット（勤務区分の並び順で循環割当）
// - 希望休／自動割振休は勤務区分の色と混同しないよう固定色にする（要件定義書5.10）

export const FALLBACK_SHIFT_COLOR_PALETTE = [
  "#BFDBFE", // blue-200
  "#BBF7D0", // green-200
  "#FDE68A", // amber-200
  "#FBCFE8", // pink-200
  "#DDD6FE", // violet-200
  "#FED7AA", // orange-200
] as const;

export const REQUESTED_LEAVE_COLOR = "#FEF3C7"; // amber-100（希望休＝本人申請）
export const SYSTEM_ASSIGNED_LEAVE_COLOR = "#E5E7EB"; // gray-200（自動割振休＝システム割当）
export const CLOSED_DAY_COLOR = "#D1D5DB"; // gray-300（定休日・特別休業日。公休より一段濃くして区別する）

export function pickFallbackShiftColor(shiftTypeIndex: number): string {
  return FALLBACK_SHIFT_COLOR_PALETTE[shiftTypeIndex % FALLBACK_SHIFT_COLOR_PALETTE.length];
}

export type CellLegendEntry = { text: string; color: string };

// セルに入りうるテキスト（勤務区分名＋休＋公休）と、それぞれの背景色の対応表。
// buildSheetMatrix（初回生成時の色）と buildEditingRequests（店長が手直しした
// 際に自動で追従させる条件付き書式のルール）の両方が、この同じ対応表を使う
// ことで色がズレないようにする。
export function buildCellLegend(
  shiftTypes: { name: string; color: string | null }[],
): CellLegendEntry[] {
  return [
    ...shiftTypes.map((shiftType, index) => ({
      text: shiftType.name,
      color: shiftType.color ?? pickFallbackShiftColor(index),
    })),
    { text: "休", color: REQUESTED_LEAVE_COLOR },
    { text: "公休", color: SYSTEM_ASSIGNED_LEAVE_COLOR },
    { text: "定休日", color: CLOSED_DAY_COLOR },
  ];
}

export type RgbColor = { red: number; green: number; blue: number };

// Google Sheets APIのColor型は0〜1のfloatで指定する。
export function hexToRgb(hex: string): RgbColor {
  const normalized = hex.replace("#", "");
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return { red: r / 255, green: g / 255, blue: b / 255 };
}
