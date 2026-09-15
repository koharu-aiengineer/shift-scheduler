import { describe, expect, it } from "vitest";
import { buildSheetMatrix } from "../buildSheetMatrix";
import { CLOSED_DAY_COLOR, REQUESTED_LEAVE_COLOR, SYSTEM_ASSIGNED_LEAVE_COLOR } from "../colors";
import type { Assignment } from "../../shift-solver/types";

const employees = [
  { id: "emp-1", name: "田中" },
  { id: "emp-2", name: "佐藤" },
];

const shiftTypes = [
  { id: "shift-early", name: "早番", color: "#111111" },
  { id: "shift-late", name: "遅番", color: null },
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

describe("buildSheetMatrix", () => {
  it("builds a header row with date and weekday labels", () => {
    const matrix = buildSheetMatrix({
      periodStart: "2026-09-01",
      periodEnd: "2026-09-03",
      employees,
      shiftTypes,
      assignments: [],
    });

    // 2026-09-01は火曜日
    expect(matrix.headerRow).toEqual(["", "9/1(火)", "9/2(水)", "9/3(木)"]);
  });

  it("uses the employee's row order and one cell per date", () => {
    const matrix = buildSheetMatrix({
      periodStart: "2026-09-01",
      periodEnd: "2026-09-02",
      employees,
      shiftTypes,
      assignments: [],
    });

    expect(matrix.rows.map((r) => r.employeeName)).toEqual(["田中", "佐藤"]);
    expect(matrix.rows[0].cells).toHaveLength(2);
  });

  it("renders a shift assignment with the shift type name and its configured color", () => {
    const matrix = buildSheetMatrix({
      periodStart: "2026-09-01",
      periodEnd: "2026-09-01",
      employees,
      shiftTypes,
      assignments: [assignment({})],
    });

    expect(matrix.rows[0].cells[0]).toEqual({ text: "早番", backgroundColor: "#111111" });
  });

  it("falls back to the palette color when the shift type has no color set", () => {
    const matrix = buildSheetMatrix({
      periodStart: "2026-09-01",
      periodEnd: "2026-09-01",
      employees,
      shiftTypes,
      assignments: [assignment({ shiftTypeId: "shift-late" })],
    });

    expect(matrix.rows[0].cells[0].text).toBe("遅番");
    expect(matrix.rows[0].cells[0].backgroundColor).not.toBe("");
  });

  it("distinguishes requested leave from system-assigned leave", () => {
    const matrix = buildSheetMatrix({
      periodStart: "2026-09-01",
      periodEnd: "2026-09-01",
      employees,
      shiftTypes,
      assignments: [
        assignment({ employeeId: "emp-1", kind: "requested_leave", shiftTypeId: null }),
        assignment({ employeeId: "emp-2", kind: "system_assigned_leave", shiftTypeId: null }),
      ],
    });

    expect(matrix.rows[0].cells[0]).toEqual({ text: "休", backgroundColor: REQUESTED_LEAVE_COLOR });
    expect(matrix.rows[1].cells[0]).toEqual({
      text: "公休",
      backgroundColor: SYSTEM_ASSIGNED_LEAVE_COLOR,
    });
  });

  it("shows 定休日 for every employee on a closed date, overriding whatever assignment exists", () => {
    const matrix = buildSheetMatrix({
      periodStart: "2026-09-01",
      periodEnd: "2026-09-01",
      employees,
      shiftTypes,
      assignments: [
        assignment({ employeeId: "emp-1", kind: "shift", shiftTypeId: "shift-early" }),
        assignment({ employeeId: "emp-2", kind: "system_assigned_leave", shiftTypeId: null }),
      ],
      closedDates: ["2026-09-01"],
    });

    expect(matrix.rows[0].cells[0]).toEqual({ text: "定休日", backgroundColor: CLOSED_DAY_COLOR });
    expect(matrix.rows[1].cells[0]).toEqual({ text: "定休日", backgroundColor: CLOSED_DAY_COLOR });
  });

  it("falls back to a blank cell when an assignment is missing for a given employee/date", () => {
    const matrix = buildSheetMatrix({
      periodStart: "2026-09-01",
      periodEnd: "2026-09-01",
      employees,
      shiftTypes,
      assignments: [],
    });

    expect(matrix.rows[0].cells[0].text).toBe("");
  });
});
