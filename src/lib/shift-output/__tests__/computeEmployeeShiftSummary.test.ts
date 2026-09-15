import { describe, expect, it } from "vitest";
import { computeEmployeeShiftSummary } from "../computeEmployeeShiftSummary";
import type { Assignment } from "../../shift-solver/types";

const employees = [
  { id: "emp-1", name: "田中" },
  { id: "emp-2", name: "佐藤" },
];

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

describe("computeEmployeeShiftSummary", () => {
  it("returns one entry per employee, in the given order", () => {
    const result = computeEmployeeShiftSummary({ employees, shiftTypes, assignments: [] });

    expect(result.map((r) => r.employeeName)).toEqual(["田中", "佐藤"]);
  });

  it("counts shift assignments per shift type per employee", () => {
    const result = computeEmployeeShiftSummary({
      employees,
      shiftTypes,
      assignments: [
        assignment({ date: "2026-09-01", employeeId: "emp-1", shiftTypeId: "shift-early" }),
        assignment({ date: "2026-09-02", employeeId: "emp-1", shiftTypeId: "shift-early" }),
        assignment({ date: "2026-09-03", employeeId: "emp-1", shiftTypeId: "shift-late" }),
        assignment({ date: "2026-09-01", employeeId: "emp-2", shiftTypeId: "shift-late" }),
      ],
    });

    expect(result[0]).toMatchObject({
      employeeId: "emp-1",
      shiftCounts: [
        { shiftTypeId: "shift-early", shiftTypeName: "早番", count: 2 },
        { shiftTypeId: "shift-late", shiftTypeName: "遅番", count: 1 },
      ],
    });
    expect(result[1]).toMatchObject({
      employeeId: "emp-2",
      shiftCounts: [
        { shiftTypeId: "shift-early", shiftTypeName: "早番", count: 0 },
        { shiftTypeId: "shift-late", shiftTypeName: "遅番", count: 1 },
      ],
    });
  });

  it("counts both requested_leave and system_assigned_leave as leave days", () => {
    const result = computeEmployeeShiftSummary({
      employees,
      shiftTypes,
      assignments: [
        assignment({ date: "2026-09-01", employeeId: "emp-1", kind: "requested_leave", shiftTypeId: null }),
        assignment({ date: "2026-09-02", employeeId: "emp-1", kind: "system_assigned_leave", shiftTypeId: null }),
        assignment({ date: "2026-09-03", employeeId: "emp-1", kind: "shift", shiftTypeId: "shift-early" }),
      ],
    });

    expect(result[0].leaveDaysCount).toBe(2);
  });

  it("zero-fills employees with no assignments at all", () => {
    const result = computeEmployeeShiftSummary({ employees, shiftTypes, assignments: [] });

    expect(result[0].shiftCounts.every((c) => c.count === 0)).toBe(true);
    expect(result[0].leaveDaysCount).toBe(0);
  });
});
