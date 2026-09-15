import { describe, expect, it } from "vitest";
import {
  buildCellLegend,
  pickFallbackShiftColor,
  REQUESTED_LEAVE_COLOR,
  SYSTEM_ASSIGNED_LEAVE_COLOR,
} from "../colors";

describe("buildCellLegend", () => {
  it("uses each shift type's configured color when set", () => {
    const legend = buildCellLegend([{ name: "早番", color: "#111111" }]);

    expect(legend).toContainEqual({ text: "早番", color: "#111111" });
  });

  it("falls back to the palette color (by array index) when a shift type has no color", () => {
    const legend = buildCellLegend([
      { name: "早番", color: null },
      { name: "遅番", color: null },
    ]);

    expect(legend).toContainEqual({ text: "早番", color: pickFallbackShiftColor(0) });
    expect(legend).toContainEqual({ text: "遅番", color: pickFallbackShiftColor(1) });
  });

  it("always includes 休 and 公休 with their fixed colors", () => {
    const legend = buildCellLegend([]);

    expect(legend).toEqual([
      { text: "休", color: REQUESTED_LEAVE_COLOR },
      { text: "公休", color: SYSTEM_ASSIGNED_LEAVE_COLOR },
    ]);
  });
});
