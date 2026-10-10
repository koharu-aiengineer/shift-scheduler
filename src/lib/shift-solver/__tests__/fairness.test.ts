import { describe, expect, it } from "vitest";
import {
  computeFairnessScore,
  computeTargetHoursDeficitTotal,
  computeVariance,
  computeWorkDaysByEmployee,
  computeWorkHoursByEmployee,
  countSoftViolations,
} from "../fairness";
import type { Assignment, ConstraintViolation, Employee, EmploymentType, ShiftType } from "../types";

function employee(id: string, overrides: Partial<Employee> = {}): Employee {
  return { id, name: id, employmentTypeId: "et-1", ngWeekdays: [], leaveRequestDates: [], ...overrides };
}

const dayShift: ShiftType = { id: "shift-day", name: "日勤A", startTime: "09:00", endTime: "18:00" }; // 9時間

const targetType: EmploymentType = {
  id: "et-target",
  name: "社員",
  maxWorkDaysPerWeek: null,
  maxWorkHoursPerWeek: null,
  maxConsecutiveWorkDays: null,
  forbiddenShiftTypeIds: [],
  targetMonthlyHours: 100,
};

const noTargetType: EmploymentType = {
  id: "et-no-target",
  name: "パート",
  maxWorkDaysPerWeek: null,
  maxWorkHoursPerWeek: null,
  maxConsecutiveWorkDays: null,
  forbiddenShiftTypeIds: [],
};

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

describe("computeWorkHoursByEmployee", () => {
  it("勤務区分の所要時間ぶんを従業員ごとに合計する", () => {
    const employees = [employee("emp-a"), employee("emp-b")];
    const assignments: Assignment[] = [
      { date: "2026-09-07", employeeId: "emp-a", kind: "shift", shiftTypeId: dayShift.id },
      { date: "2026-09-08", employeeId: "emp-a", kind: "shift", shiftTypeId: dayShift.id },
      { date: "2026-09-07", employeeId: "emp-b", kind: "requested_leave", shiftTypeId: null },
    ];
    const shiftTypeById = new Map([[dayShift.id, dayShift]]);

    const result = computeWorkHoursByEmployee(assignments, employees, shiftTypeById);

    expect(result.get("emp-a")).toBe(18); // 9時間 × 2日
    expect(result.get("emp-b")).toBe(0);
  });
});

describe("computeTargetHoursDeficitTotal", () => {
  it("月間目標時間が設定された雇用形態の従業員だけ、不足時間を合計する", () => {
    const employees = [
      employee("emp-target", { employmentTypeId: targetType.id }), // 目標100h、実績9h → 不足91h
      employee("emp-no-target", { employmentTypeId: noTargetType.id }), // 目標なし → 対象外
    ];
    const assignments: Assignment[] = [
      { date: "2026-09-07", employeeId: "emp-target", kind: "shift", shiftTypeId: dayShift.id },
    ];
    const employmentTypeById = new Map([
      [targetType.id, targetType],
      [noTargetType.id, noTargetType],
    ]);
    const shiftTypeById = new Map([[dayShift.id, dayShift]]);

    const total = computeTargetHoursDeficitTotal(assignments, employees, employmentTypeById, shiftTypeById);

    expect(total).toBe(91);
  });

  it("目標時間に達していれば不足は0になる（マイナスにはならない）", () => {
    const employees = [employee("emp-target", { employmentTypeId: targetType.id })];
    const assignments: Assignment[] = Array.from({ length: 20 }, (_, i) => ({
      date: `2026-09-${String(i + 1).padStart(2, "0")}`,
      employeeId: "emp-target",
      kind: "shift" as const,
      shiftTypeId: dayShift.id,
    })); // 20日 × 9時間 = 180h > 目標100h
    const employmentTypeById = new Map([[targetType.id, targetType]]);
    const shiftTypeById = new Map([[dayShift.id, dayShift]]);

    const total = computeTargetHoursDeficitTotal(assignments, employees, employmentTypeById, shiftTypeById);

    expect(total).toBe(0);
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

  it("勤務日数の分散が同じでも、月間目標時間が未達の従業員から勤務を減らす方がスコアが悪化する（局所探索がそのスワップを避けるようにするため）", () => {
    const employees = [
      employee("emp-target", { employmentTypeId: targetType.id }), // 目標100h、まだ大きく未達
      employee("emp-no-target", { employmentTypeId: noTargetType.id }), // 目標なし
    ];
    const employmentTypeById = new Map([
      [targetType.id, targetType],
      [noTargetType.id, noTargetType],
    ]);
    const shiftTypeById = new Map([[dayShift.id, dayShift]]);

    // どちらも「2日のうち1日ずつ出勤」で勤務日数の分散は同じ（1人1日ずつ = 分散0）。
    // 違いは「目標未達のemp-targetが出勤する日」か「emp-no-targetが出勤する日」か。
    const targetEmployeeWorks: Assignment[] = [
      { date: "2026-09-07", employeeId: "emp-target", kind: "shift", shiftTypeId: dayShift.id },
      { date: "2026-09-08", employeeId: "emp-no-target", kind: "shift", shiftTypeId: dayShift.id },
    ];
    const noTargetEmployeeWorksMore: Assignment[] = [
      { date: "2026-09-07", employeeId: "emp-no-target", kind: "shift", shiftTypeId: dayShift.id },
      { date: "2026-09-08", employeeId: "emp-no-target", kind: "shift", shiftTypeId: dayShift.id },
    ];
    // emp-targetは1日も出勤していない（さらに目標から遠ざかっている）

    const scoreWithTargetEmployeeWorking = computeFairnessScore(
      targetEmployeeWorks,
      employees,
      [],
      employmentTypeById,
      shiftTypeById,
    );
    const scoreWithoutTargetEmployeeWorking = computeFairnessScore(
      noTargetEmployeeWorksMore,
      employees,
      [],
      employmentTypeById,
      shiftTypeById,
    );

    expect(scoreWithTargetEmployeeWorking).toBeLessThan(scoreWithoutTargetEmployeeWorking);
  });

  it("employmentTypeById/shiftTypeByIdを省略した場合は、月間目標時間の不足を考慮しない（従来どおり）", () => {
    const employees = [employee("emp-target", { employmentTypeId: targetType.id })];
    const assignments: Assignment[] = [];

    // マップを渡さなくてもエラーにならず、targetHoursDeficitの寄与は0になる
    expect(computeFairnessScore(assignments, employees, [])).toBe(0);
  });

  it("両方ゼロなら0を返す", () => {
    const employees = [employee("emp-a")];
    expect(computeFairnessScore([], employees, [])).toBe(0);
  });
});
