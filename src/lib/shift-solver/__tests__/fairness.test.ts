import { describe, expect, it } from "vitest";
import {
  computeFairnessScore,
  computeVariance,
  computeWorkDaysByEmployee,
  countSoftViolations,
} from "../fairness";
import type { Assignment, ConstraintViolation, Employee } from "../types";

function employee(id: string): Employee {
  return { id, name: id, employmentTypeId: "et-1", ngWeekdays: [], leaveRequestDates: [] };
}

describe("computeWorkDaysByEmployee", () => {
  it("kind=shiftの件数だけを従業員ごとに数える", () => {
    const employees = [employee("emp-a"), employee("emp-b")];
    const assignments: Assignment[] = [
      { date: "2026-09-07", employeeId: "emp-a", kind: "shift", shiftTypeId: "shift-1" },
      { date: "2026-09-08", employeeId: "emp-a", kind: "shift", shiftTypeId: "shift-1" },
      { date: "2026-09-07", employeeId: "emp-b", kind: "requested_leave", shiftTypeId: null },
    ];

    const result = computeWorkDaysByEmployee(assignments, employees);

    expect(result.get("emp-a")).toBe(2);
    expect(result.get("emp-b")).toBe(0); // 一度も出勤しなくても0件として含まれる
  });
});

describe("computeVariance", () => {
  it("全員同じ値なら分散は0", () => {
    expect(computeVariance([3, 3, 3])).toBe(0);
  });

  it("ばらつきがあれば分散は正の値になる", () => {
    expect(computeVariance([1, 5])).toBe(4); // 平均3、各偏差2乗の平均 = 4
  });

  it("空配列なら0を返す", () => {
    expect(computeVariance([])).toBe(0);
  });
});

describe("countSoftViolations", () => {
  it("severity=softのものだけを数える", () => {
    const violations: ConstraintViolation[] = [
      { severity: "soft", type: "leave_request_not_honored", date: null, employeeId: null, shiftTypeId: null, message: "" },
      { severity: "hard", type: "understaffed", date: null, employeeId: null, shiftTypeId: null, message: "" },
      { severity: "soft", type: "ng_weekday_not_honored", date: null, employeeId: null, shiftTypeId: null, message: "" },
    ];

    expect(countSoftViolations(violations)).toBe(2);
  });
});

describe("computeFairnessScore", () => {
  it("勤務日数の均等さを最優先するため、分散の差はソフト違反の差より重く扱われる", () => {
    const employees = [employee("emp-a"), employee("emp-b")];

    // ケース1: 勤務日数は均等（分散0）だがソフト違反が多い
    const balancedAssignments: Assignment[] = [
      { date: "2026-09-07", employeeId: "emp-a", kind: "shift", shiftTypeId: "shift-1" },
      { date: "2026-09-08", employeeId: "emp-b", kind: "shift", shiftTypeId: "shift-1" },
    ];
    const manyViolations: ConstraintViolation[] = Array.from({ length: 5 }, () => ({
      severity: "soft" as const,
      type: "leave_request_not_honored" as const,
      date: null,
      employeeId: null,
      shiftTypeId: null,
      message: "",
    }));

    // ケース2: 勤務日数は不均等（分散あり）だがソフト違反はゼロ
    const unbalancedAssignments: Assignment[] = [
      { date: "2026-09-07", employeeId: "emp-a", kind: "shift", shiftTypeId: "shift-1" },
      { date: "2026-09-08", employeeId: "emp-a", kind: "shift", shiftTypeId: "shift-1" },
    ];

    const balancedScore = computeFairnessScore(balancedAssignments, employees, manyViolations);
    const unbalancedScore = computeFairnessScore(unbalancedAssignments, employees, []);

    expect(balancedScore).toBeLessThan(unbalancedScore);
  });

  it("両方ゼロなら0を返す", () => {
    const employees = [employee("emp-a")];
    expect(computeFairnessScore([], employees, [])).toBe(0);
  });
});
