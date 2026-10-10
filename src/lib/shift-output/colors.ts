// 出力用スプレッドシート・印刷用シート共通のセル背景色ロジック。
// 両方の見た目を揃えるため、勤務区分の色は常にこの固定パレットから
// 並び順で割り当てる（勤務区分マスタの色設定は使わない）。
// 希望休／自動割振休／定休日は勤務区分の色と混同しないよう固定色にし、
// 白方向に少し混ぜて明るくしたものを実際の表示色として使う。

export const SHIFT_COLOR_PALETTE = [
  "#93C5FD", // blue-300
  "#86EFAC", // green-300
  "#FCD34D", // amber-300
  "#F9A8D4", // pink-300
  "#C4B5FD", // violet-300
  "#FDBA74", // orange-300
] as const;

export const REQUESTED_LEAVE_COLOR = "#FEF3C7"; // amber-100（希望休＝本人申請）
export const SYSTEM_ASSIGNED_LEAVE_COLOR = "#E5E7EB"; // gray-200（自動割振休＝システム割当）
export const CLOSED_DAY_COLOR = "#D1D5DB"; // gray-300（定休日・特別休業日。公休より一段濃くして区別する）

// 休み系の色に適用する「白方向に混ぜる」割合。出力用・印刷用の両方で
// 同じ値を使うことで、見た目を完全に揃える。
export const LEAVE_COLOR_LIGHTEN_AMOUNT = 0.45;

export function pickFallbackShiftColor(shiftTypeIndex: number): string {
  return SHIFT_COLOR_PALETTE[shiftTypeIndex % SHIFT_COLOR_PALETTE.length];
}

export type CellLegendEntry = { text: string; color: string };

// セルに入りうるテキスト（勤務区分名＋休＋公休＋定休日）と、それぞれの
// 背景色の対応表。buildSheetMatrix（初回生成時の色）・buildEditingRequests
// （店長が手直しした際に自動で追従させる条件付き書式のルール）・
// buildPrintMatrix（印刷用シート）が、全てこの同じ対応表を使うことで
// 色がズレないようにする。
export function buildCellLegend(
  shiftTypes: { name: string; color?: string | null }[],
): CellLegendEntry[] {
  return [
    // 勤務区分の色は、勤務区分マスタでの色設定に関わらず、常にこの固定
    // パレットを並び順で割り当てる（出力用シートと印刷用シートの見た目を
    // 揃えるため。マスタ画面のカラーピッカー自体は残すが、実際の表示色には
    // 反映されない）。
    ...shiftTypes.map((shiftType, index) => ({
      text: shiftType.name,
      color: pickFallbackShiftColor(index),
    })),
    { text: "休", color: lightenHexColor(REQUESTED_LEAVE_COLOR, LEAVE_COLOR_LIGHTEN_AMOUNT) },
    { text: "公休", color: lightenHexColor(SYSTEM_ASSIGNED_LEAVE_COLOR, LEAVE_COLOR_LIGHTEN_AMOUNT) },
    { text: "定休日", color: lightenHexColor(CLOSED_DAY_COLOR, LEAVE_COLOR_LIGHTEN_AMOUNT) },
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

// 色を白方向にamount（0〜1）だけ混ぜて明るくする。amount=0で元の色のまま、
// amount=1で白になる。
export function lightenHexColor(hex: string, amount: number): string {
  const normalized = hex.replace("#", "");
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  const blend = (channel: number) => Math.round(channel + (255 - channel) * amount);
  const toHex = (channel: number) => channel.toString(16).padStart(2, "0");
  return `#${toHex(blend(r))}${toHex(blend(g))}${toHex(blend(b))}`.toUpperCase();
}
