import { describe, expect, it } from "vitest";
import {
  buildCellLegend,
  pickFallbackShiftColor,
  lightenHexColor,
  CLOSED_DAY_COLOR,
  LEAVE_COLOR_LIGHTEN_AMOUNT,
  REQUESTED_LEAVE_COLOR,
  SYSTEM_ASSIGNED_LEAVE_COLOR,
} from "../colors";

describe("lightenHexColor", () => {
  it("amount=0では元の色のまま", () => {
    expect(lightenHexColor("#8963F2", 0)).toBe("#8963F2");
  });

  it("amount=1では白になる", () => {
    expect(lightenHexColor("#8963F2", 1)).toBe("#FFFFFF");
  });

  it("amountに応じて白方向に混ぜる", () => {
    // (137,99,242) を45%だけ白(255,255,255)に寄せる
    expect(lightenHexColor("#8963F2", 0.45)).toBe("#BEA9F8");
  });
});

describe("buildCellLegend", () => {
  it("勤務区分の色は、マスタの色設定（configured color）に関わらず並び順ベースのパレットを使う（出力用・印刷用シートの見た目を揃えるため）", () => {
    const legend = buildCellLegend([{ name: "早番", color: "#111111" }]);

    expect(legend).toContainEqual({ text: "早番", color: pickFallbackShiftColor(0) });
    expect(legend).not.toContainEqual({ text: "早番", color: "#111111" });
  });

  it("色が未設定の勤務区分でも同じパレット（並び順）から色を割り当てる", () => {
    const legend = buildCellLegend([
      { name: "早番", color: null },
      { name: "遅番", color: null },
    ]);

    expect(legend).toContainEqual({ text: "早番", color: pickFallbackShiftColor(0) });
    expect(legend).toContainEqual({ text: "遅番", color: pickFallbackShiftColor(1) });
  });

  it("always includes 休・公休・定休日, with colors lightened toward white", () => {
    const legend = buildCellLegend([]);

    expect(legend).toEqual([
      { text: "休", color: lightenHexColor(REQUESTED_LEAVE_COLOR, LEAVE_COLOR_LIGHTEN_AMOUNT) },
      { text: "公休", color: lightenHexColor(SYSTEM_ASSIGNED_LEAVE_COLOR, LEAVE_COLOR_LIGHTEN_AMOUNT) },
      { text: "定休日", color: lightenHexColor(CLOSED_DAY_COLOR, LEAVE_COLOR_LIGHTEN_AMOUNT) },
    ]);
  });
});
