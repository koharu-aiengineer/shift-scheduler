import { describe, expect, it } from "vitest";
import { detectViolations } from "../detectViolations";
import type { Assignment, Employee, EmploymentType, ShiftType, SolverInput } from "../types";

const dayShift: ShiftType = { id: "shift-day", name: "日勤A", startTime: "09:00", endTime: "17:00" };
const nightShift: ShiftType = { id: "shift-night", name: "遅番", startTime: "17:00", endTime: "22:00" };

const freeType: EmploymentType = {
  id: "et-free",
  name: "フリー",
  maxWorkDaysPerWeek: null,
  maxWorkHoursPerWeek: null,
  maxConsecutiveWorkDays: null,
  forbiddenShiftTypeIds: [],
};

function employee(id: string, overrides: Partial<Employee> = {}): Employee {
  return {
    id,
    name: id,
    employmentTypeId: freeType.id,
    ngWeekdays: [],
    leaveRequestDates: [],
    ...overrides,
  };
}

function baseInput(overrides: Partial<SolverInput> = {}): SolverInput {
  return {
    periodStart: "2026-09-07",
    periodEnd: "2026-09-07",
    shiftTypes: [dayShift],
    employmentTypes: [freeType],
    employees: [],
    staffingRequirements: [{ shiftTypeId: dayShift.id, defaultRequiredCount: 1, overrides: [] }],
    employmentTypeMinStaffing: [],
    ...overrides,
  };
}

describe("detectViolations: 構築過程に依存せず、渡されたassignmentsだけから判定する", () => {
  it("必要人数を満たしていれば違反なし", () => {
    const employees = [employee("emp-a")];
    const input = baseInput({ employees });
    const assignments: Assignment[] = [
      { date: "2026-09-07", employeeId: "emp-a", kind: "shift", shiftTypeId: dayShift.id },
    ];

    expect(detectViolations(assignments, input)).toEqual([]);
  });

  it("必要人数を満たしていなければunderstaffedを検出する", () => {
    const employees = [employee("emp-a")];
    const input = baseInput({
      employees,
      staffingRequirements: [{ shiftTypeId: dayShift.id, defaultRequiredCount: 2, overrides: [] }],
    });
    // greedyが作ったのではない、手組みのassignments（emp-aだけ出勤）
    const assignments: Assignment[] = [
      { date: "2026-09-07", employeeId: "emp-a", kind: "shift", shiftTypeId: dayShift.id },
    ];

    const violations = detectViolations(assignments, input);

    expect(violations).toEqual([
      expect.objectContaining({
        severity: "hard",
        type: "understaffed",
        date: "2026-09-07",
        shiftTypeId: dayShift.id,
        message: expect.stringContaining("不足1人"),
      }),
    ]);
  });

  it("休み希望日に出勤していればleave_request_not_honoredを検出する", () => {
    const employees = [employee("emp-a", { leaveRequestDates: ["2026-09-07"] })];
    const input = baseInput({ employees });
    const assignments: Assignment[] = [
      { date: "2026-09-07", employeeId: "emp-a", kind: "shift", shiftTypeId: dayShift.id },
    ];

    const violations = detectViolations(assignments, input);

    expect(violations).toContainEqual(
      expect.objectContaining({ severity: "soft", type: "leave_request_not_honored", employeeId: "emp-a" }),
    );
  });

  it("NG曜日に出勤していればng_weekday_not_honoredを検出する", () => {
    const employees = [employee("emp-a", { ngWeekdays: [1] })]; // 2026-09-07は月曜
    const input = baseInput({ employees });
    const assignments: Assignment[] = [
      { date: "2026-09-07", employeeId: "emp-a", kind: "shift", shiftTypeId: dayShift.id },
    ];

    const violations = detectViolations(assignments, input);

    expect(violations).toContainEqual(
      expect.objectContaining({ severity: "soft", type: "ng_weekday_not_honored", employeeId: "emp-a" }),
    );
  });

  it("希望どおり休みなら休み希望の違反は出ない", () => {
    const employees = [
      employee("emp-a", { leaveRequestDates: ["2026-09-07"] }),
      employee("emp-b"),
    ];
    const input = baseInput({ employees });
    const assignments: Assignment[] = [
      { date: "2026-09-07", employeeId: "emp-a", kind: "requested_leave", shiftTypeId: null },
      { date: "2026-09-07", employeeId: "emp-b", kind: "shift", shiftTypeId: dayShift.id },
    ];

    expect(detectViolations(assignments, input)).toEqual([]);
  });

  it("雇用形態別必須人数を満たしていなければemployment_type_min_understaffedを検出する", () => {
    const fulltime: EmploymentType = { ...freeType, id: "et-full" };
    const employees = [employee("emp-part")]; // 正社員が1人もいない
    const input = baseInput({
      employees,
      employmentTypes: [freeType, fulltime],
      staffingRequirements: [{ shiftTypeId: dayShift.id, defaultRequiredCount: 1, overrides: [] }],
      employmentTypeMinStaffing: [
        { employmentTypeId: fulltime.id, shiftTypeId: dayShift.id, minCount: 1 },
      ],
    });
    const assignments: Assignment[] = [
      { date: "2026-09-07", employeeId: "emp-part", kind: "shift", shiftTypeId: dayShift.id },
    ];

    const violations = detectViolations(assignments, input);

    expect(violations).toContainEqual(
      expect.objectContaining({ severity: "hard", type: "employment_type_min_understaffed", shiftTypeId: dayShift.id }),
    );
  });

  it("複数勤務区分・複数日にまたがっても、それぞれ独立に正しく判定する", () => {
    const employees = [employee("emp-a"), employee("emp-b")];
    const input = baseInput({
      periodStart: "2026-09-07",
      periodEnd: "2026-09-08",
      shiftTypes: [dayShift, nightShift],
      employees,
      staffingRequirements: [
        { shiftTypeId: dayShift.id, defaultRequiredCount: 1, overrides: [] },
        { shiftTypeId: nightShift.id, defaultRequiredCount: 1, overrides: [] },
      ],
    });
    // 09-07は両方充足、09-08は遅番だけ不足
    const assignments: Assignment[] = [
      { date: "2026-09-07", employeeId: "emp-a", kind: "shift", shiftTypeId: dayShift.id },
      { date: "2026-09-07", employeeId: "emp-b", kind: "shift", shiftTypeId: nightShift.id },
      { date: "2026-09-08", employeeId: "emp-a", kind: "shift", shiftTypeId: dayShift.id },
      { date: "2026-09-08", employeeId: "emp-b", kind: "system_assigned_leave", shiftTypeId: null },
    ];

    const violations = detectViolations(assignments, input);

    expect(violations).toEqual([
      expect.objectContaining({ type: "understaffed", date: "2026-09-08", shiftTypeId: nightShift.id }),
    ]);
  });
});
