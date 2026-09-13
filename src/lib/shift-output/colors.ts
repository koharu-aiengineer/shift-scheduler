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

export function pickFallbackShiftColor(shiftTypeIndex: number): string {
  return FALLBACK_SHIFT_COLOR_PALETTE[shiftTypeIndex % FALLBACK_SHIFT_COLOR_PALETTE.length];
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
