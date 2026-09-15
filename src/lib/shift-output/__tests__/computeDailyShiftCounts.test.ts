import { describe, expect, it } from "vitest";
import { computeDailyShiftCounts } from "../computeDailyShiftCounts";
import type { Assignment } from "../../shift-solver/types";

const shiftTypes = [
  { id: "shift-early", name: "早番" },
  { id: "shift-late", name: "遅番" },
];

function assignment(overrides: Partial<Assignment>): Assignment {
  return {
    date: "2026-09-01",
    employeeId: "emp-1",
    kind: "shift",
    shiftTypeId: "shift-early",
    ...overrides,
  };
}

describe("computeDailyShiftCounts", () => {
  it("returns one entry per date in the period, in order", () => {
    const result = computeDailyShiftCounts({
      periodStart: "2026-09-01",
      periodEnd: "2026-09-03",
      shiftTypes,
      assignments: [],
    });

    expect(result.map((r) => r.date)).toEqual(["2026-09-01", "2026-09-02", "2026-09-03"]);
  });

  it("counts shift assignments per shift type per date", () => {
    const result = computeDailyShiftCounts({
      periodStart: "2026-09-01",
      periodEnd: "2026-09-01",
      shiftTypes,
      assignments: [
        assignment({ employeeId: "emp-1", shiftTypeId: "shift-early" }),
        assignment({ employeeId: "emp-2", shiftTypeId: "shift-early" }),
        assignment({ employeeId: "emp-3", shiftTypeId: "shift-late" }),
      ],
    });

    expect(result[0].counts).toEqual([
      { shiftTypeId: "shift-early", shiftTypeName: "早番", count: 2 },
      { shiftTypeId: "shift-late", shiftTypeName: "遅番", count: 1 },
    ]);
  });

  it("ignores non-shift assignments (leave) and zero-fills shift types with no one assigned", () => {
    const result = computeDailyShiftCounts({
      periodStart: "2026-09-01",
      periodEnd: "2026-09-01",
      shiftTypes,
      assignments: [
        assignment({ kind: "requested_leave", shiftTypeId: null }),
        assignment({ kind: "system_assigned_leave", shiftTypeId: null }),
      ],
    });

    expect(result[0].counts).toEqual([
      { shiftTypeId: "shift-early", shiftTypeName: "早番", count: 0 },
      { shiftTypeId: "shift-late", shiftTypeName: "遅番", count: 0 },
    ]);
  });

  it("only counts assignments that fall within the given period", () => {
    const result = computeDailyShiftCounts({
      periodStart: "2026-09-01",
      periodEnd: "2026-09-01",
      shiftTypes,
      assignments: [assignment({ date: "2026-09-02" })],
    });

    expect(result).toHaveLength(1);
    expect(result[0].counts.every((c) => c.count === 0)).toBe(true);
  });
});
