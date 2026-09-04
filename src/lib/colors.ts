// 勤務区分に自動で割り当てる色のパレット。店長は後からカラーピッカーで自由に変更できる。
const AUTO_COLOR_PALETTE = [
  "#FCA5A5", // red
  "#FDBA74", // orange
  "#FCD34D", // amber
  "#BEF264", // lime
  "#86EFAC", // green
  "#5EEAD4", // teal
  "#7DD3FC", // sky
  "#93C5FD", // blue
  "#C4B5FD", // violet
  "#F0ABFC", // fuchsia
  "#FDA4AF", // rose
  "#D9F99D", // lime (alt)
] as const;

export function pickAutoColor(existingCount: number): string {
  return AUTO_COLOR_PALETTE[existingCount % AUTO_COLOR_PALETTE.length];
}
