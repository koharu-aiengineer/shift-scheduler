import { describe, expect, it } from "vitest";
import {
  computeShiftHours,
  findUnmetEmploymentTypeMinStaffing,
  isShiftAllowedForEmploymentType,
} from "../constraints";
import { enumerateDates, getIsoWeekStart } from "../dateUtils";
import { computeFairnessScoreFromAssignments } from "../fairness";
import { buildGreedySolution } from "../greedy";
import { runLocalSearch } from "../localSearch";
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

// greedy.tsに依存しない、独立した検証用ヘルパー。
// localSearch.ts内部のロジックを再利用せず、constraints.tsの公開関数だけで
// 「最終的な割当てがハード制約を一切破っていないか」を確認する。
function verifyNoHardConstraintViolations(assignments: Assignment[], input: SolverInput) {
  const dates = enumerateDates(input.periodStart, input.periodEnd);
  const employmentTypeById = new Map(input.employmentTypes.map((et) => [et.id, et]));
  const shiftTypeById = new Map(input.shiftTypes.map((st) => [st.id, st]));

  for (const employee of input.employees) {
    const employmentType = employmentTypeById.get(employee.employmentTypeId)!;
    const byDate = new Map(
      assignments.filter((a) => a.employeeId === employee.id).map((a) => [a.date, a]),
    );

    for (const a of byDate.values()) {
      if (a.kind === "shift") {
        expect(isShiftAllowedForEmploymentType(employmentType, a.shiftTypeId!)).toBe(true);
      }
    }

    if (employmentType.maxConsecutiveWorkDays != null) {
      let maxStreak = 0;
      let current = 0;
      for (const date of dates) {
        if (byDate.get(date)?.kind === "shift") {
          current += 1;
          maxStreak = Math.max(maxStreak, current);
        } else {
          current = 0;
        }
      }
      expect(maxStreak).toBeLessThanOrEqual(employmentType.maxConsecutiveWorkDays);
    }

    if (employmentType.maxWorkDaysPerWeek != null || employmentType.maxWorkHoursPerWeek != null) {
      const weekTotals = new Map<string, { days: number; hours: number }>();
      for (const date of dates) {
        const a = byDate.get(date);
        if (a?.kind !== "shift") continue;
        const weekStart = getIsoWeekStart(date);
        const totals = weekTotals.get(weekStart) ?? { days: 0, hours: 0 };
        totals.days += 1;
        const shiftType = shiftTypeById.get(a.shiftTypeId!);
        if (shiftType) totals.hours += computeShiftHours(shiftType);
        weekTotals.set(weekStart, totals);
      }
      for (const totals of weekTotals.values()) {
        if (employmentType.maxWorkDaysPerWeek != null) {
          expect(totals.days).toBeLessThanOrEqual(employmentType.maxWorkDaysPerWeek);
        }
        if (employmentType.maxWorkHoursPerWeek != null) {
          expect(totals.hours).toBeLessThanOrEqual(employmentType.maxWorkHoursPerWeek);
        }
      }
    }
  }
}

function countShiftsByDateAndType(assignments: Assignment[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const a of assignments) {
    if (a.kind !== "shift") continue;
    const key = `${a.date}#${a.shiftTypeId}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

describe("runLocalSearch: 頭数（必要人数充足）を変えない", () => {
  it("スワップ後も日付×勤務区分ごとの出勤人数は貪欲法の結果と完全に一致する", () => {
    const limited: EmploymentType = { ...freeType, id: "et-limited", maxConsecutiveWorkDays: 3, maxWorkDaysPerWeek: 5 };
    const restricted: EmploymentType = { ...freeType, id: "et-restricted", forbiddenShiftTypeIds: [nightShift.id] };
    const employees = [
      employee("emp-1", { employmentTypeId: limited.id }),
      employee("emp-2", { employmentTypeId: limited.id }),
      employee("emp-3", { employmentTypeId: limited.id }),
      employee("emp-4", { employmentTypeId: restricted.id }),
      employee("emp-5", { employmentTypeId: restricted.id }),
    ];
    const input = baseInput({
      periodStart: "2026-09-07",
      periodEnd: "2026-09-13",
      shiftTypes: [dayShift, nightShift],
      employees,
      employmentTypes: [limited, restricted],
      staffingRequirements: [
        { shiftTypeId: dayShift.id, defaultRequiredCount: 2, overrides: [] },
        { shiftTypeId: nightShift.id, defaultRequiredCount: 1, overrides: [] },
      ],
    });

    const { assignments: greedyAssignments } = buildGreedySolution(input);
    const result = runLocalSearch(input, greedyAssignments, { randomSeed: 1, maxIterations: 1000 });

    expect(countShiftsByDateAndType(result)).toEqual(countShiftsByDateAndType(greedyAssignments));
    expect(result).toHaveLength(greedyAssignments.length);
  });
});

describe("runLocalSearch: ハード制約は同点や改善であっても絶対に破らない", () => {
  it("雇用形態別必須人数を破るスワップ（fairnessスコアは同点）は採用しない", () => {
    const etA: EmploymentType = { ...freeType, id: "et-a" };
    const etB: EmploymentType = { ...freeType, id: "et-b" };
    const employees = [
      employee("emp-a1", { employmentTypeId: etA.id }),
      employee("emp-b1", { employmentTypeId: etB.id }),
    ];
    const input = baseInput({
      shiftTypes: [dayShift, nightShift],
      employees,
      employmentTypes: [etA, etB],
      staffingRequirements: [
        { shiftTypeId: dayShift.id, defaultRequiredCount: 1, overrides: [] },
        { shiftTypeId: nightShift.id, defaultRequiredCount: 1, overrides: [] },
      ],
      // 日勤Aにはet-aが最低1人必要。emp-a1とemp-b1を入れ替えると
      // 日勤Aからet-aがいなくなり、この制約を破ってしまう。
      employmentTypeMinStaffing: [
        { employmentTypeId: etA.id, shiftTypeId: dayShift.id, minCount: 1 },
      ],
    });
    const initialAssignments: Assignment[] = [
      { date: "2026-09-07", employeeId: "emp-a1", kind: "shift", shiftTypeId: dayShift.id },
      { date: "2026-09-07", employeeId: "emp-b1", kind: "shift", shiftTypeId: nightShift.id },
    ];

    // 入れ替え自体はfairnessスコアを変えない（両者とも出勤日数1のまま）ため、
    // スコアだけを見れば採用されてもおかしくない。それでも複数シードで
    // 一貫して拒否されることを確認する。
    for (const seed of [1, 2, 3, 4, 5]) {
      const result = runLocalSearch(input, initialAssignments, { randomSeed: seed, maxIterations: 500 });
      const emp1Assignment = result.find((a) => a.employeeId === "emp-a1" && a.date === "2026-09-07");
      expect(emp1Assignment?.shiftTypeId).toBe(dayShift.id);
      verifyNoHardConstraintViolations(result, input);

      const counts = new Map<string, number>();
      for (const a of result) {
        if (a.date !== "2026-09-07" || a.kind !== "shift" || a.shiftTypeId !== dayShift.id) continue;
        const emp = employees.find((e) => e.id === a.employeeId)!;
        counts.set(emp.employmentTypeId, (counts.get(emp.employmentTypeId) ?? 0) + 1);
      }
      expect(
        findUnmetEmploymentTypeMinStaffing(dayShift.id, counts, input.employmentTypeMinStaffing),
      ).toHaveLength(0);
    }
  });

  it("雇用形態の禁止勤務区分を破るスワップは採用しない", () => {
    const dayOnly: EmploymentType = { ...freeType, id: "et-day-only", forbiddenShiftTypeIds: [nightShift.id] };
    const flexible: EmploymentType = { ...freeType, id: "et-flexible" };
    const employees = [
      employee("emp-day-only", { employmentTypeId: dayOnly.id }),
      employee("emp-flexible", { employmentTypeId: flexible.id }),
    ];
    const input = baseInput({
      shiftTypes: [dayShift, nightShift],
      employees,
      employmentTypes: [dayOnly, flexible],
      staffingRequirements: [
        { shiftTypeId: dayShift.id, defaultRequiredCount: 1, overrides: [] },
        { shiftTypeId: nightShift.id, defaultRequiredCount: 1, overrides: [] },
      ],
    });
    const initialAssignments: Assignment[] = [
      { date: "2026-09-07", employeeId: "emp-day-only", kind: "shift", shiftTypeId: dayShift.id },
      { date: "2026-09-07", employeeId: "emp-flexible", kind: "shift", shiftTypeId: nightShift.id },
    ];

    for (const seed of [1, 2, 3]) {
      const result = runLocalSearch(input, initialAssignments, { randomSeed: seed, maxIterations: 500 });
      const dayOnlyAssignment = result.find((a) => a.employeeId === "emp-day-only");
      // emp-day-onlyが遅番（禁止勤務区分）に入ることは絶対にない
      expect(dayOnlyAssignment?.shiftTypeId).not.toBe(nightShift.id);
      verifyNoHardConstraintViolations(result, input);
    }
  });

  it("連勤上限・週あたり上限・禁止勤務区分がある複雑な設定でも、局所探索後にハード制約違反は発生しない", () => {
    const limited: EmploymentType = {
      ...freeType,
      id: "et-limited",
      maxConsecutiveWorkDays: 3,
      maxWorkDaysPerWeek: 5,
      maxWorkHoursPerWeek: 999,
    };
    const restricted: EmploymentType = {
      ...freeType,
      id: "et-restricted",
      forbiddenShiftTypeIds: [nightShift.id],
      maxWorkDaysPerWeek: 5,
    };
    const employees = [
      employee("emp-1", { employmentTypeId: limited.id }),
      employee("emp-2", { employmentTypeId: limited.id }),
      employee("emp-3", { employmentTypeId: limited.id }),
      employee("emp-4", { employmentTypeId: restricted.id }),
      employee("emp-5", { employmentTypeId: restricted.id }),
    ];
    const input = baseInput({
      periodStart: "2026-09-07",
      periodEnd: "2026-09-13",
      shiftTypes: [dayShift, nightShift],
      employees,
      employmentTypes: [limited, restricted],
      staffingRequirements: [
        { shiftTypeId: dayShift.id, defaultRequiredCount: 2, overrides: [] },
        { shiftTypeId: nightShift.id, defaultRequiredCount: 1, overrides: [] },
      ],
    });

    const { assignments: greedyAssignments, violations } = buildGreedySolution(input);
    expect(violations).toHaveLength(0); // 前提: 貪欲法の時点で人手は足りている

    for (const seed of [10, 20, 30]) {
      const result = runLocalSearch(input, greedyAssignments, { randomSeed: seed, maxIterations: 2000 });
      verifyNoHardConstraintViolations(result, input);
    }
  });
});

describe("runLocalSearch: 公平性の改善", () => {
  it("不公平な初期解を、より均等な勤務日数に近づける", () => {
    const employees = [employee("emp-a"), employee("emp-b")];
    const input = baseInput({
      periodStart: "2026-09-07",
      periodEnd: "2026-09-08",
      employees,
    });
    // emp-aだけが2日とも出勤し、emp-bは1日も出勤しない不公平な初期解
    const initialAssignments: Assignment[] = [
      { date: "2026-09-07", employeeId: "emp-a", kind: "shift", shiftTypeId: dayShift.id },
      { date: "2026-09-07", employeeId: "emp-b", kind: "system_assigned_leave", shiftTypeId: null },
      { date: "2026-09-08", employeeId: "emp-a", kind: "shift", shiftTypeId: dayShift.id },
      { date: "2026-09-08", employeeId: "emp-b", kind: "system_assigned_leave", shiftTypeId: null },
    ];
    const initialScore = computeFairnessScoreFromAssignments(initialAssignments, employees);

    const result = runLocalSearch(input, initialAssignments, { randomSeed: 42, maxIterations: 500 });
    const finalScore = computeFairnessScoreFromAssignments(result, employees);

    expect(finalScore).toBeLessThanOrEqual(initialScore);
    expect(finalScore).toBe(0); // emp-a, emp-bとも1日ずつ出勤する状態に収束するはず
  });
});

describe("runLocalSearch: 再現性と多様性", () => {
  it("同じシードなら常に同じ結果になる", () => {
    const employees = [employee("emp-a"), employee("emp-b"), employee("emp-c")];
    const input = baseInput({
      periodStart: "2026-09-07",
      periodEnd: "2026-09-10",
      employees,
      staffingRequirements: [{ shiftTypeId: dayShift.id, defaultRequiredCount: 1, overrides: [] }],
    });
    const { assignments: greedyAssignments } = buildGreedySolution(input);

    const resultA = runLocalSearch(input, greedyAssignments, { randomSeed: 777, maxIterations: 300 });
    const resultB = runLocalSearch(input, greedyAssignments, { randomSeed: 777, maxIterations: 300 });

    expect(resultA).toEqual(resultB);
  });

  it("異なるシードでは異なる結果になりうる（再生成の多様性）", () => {
    const employees = [
      employee("emp-a"),
      employee("emp-b"),
      employee("emp-c"),
      employee("emp-d"),
    ];
    const input = baseInput({
      periodStart: "2026-09-07",
      periodEnd: "2026-09-13",
      employees,
      staffingRequirements: [{ shiftTypeId: dayShift.id, defaultRequiredCount: 2, overrides: [] }],
    });
    const { assignments: greedyAssignments } = buildGreedySolution(input);

    const results = [1, 2, 3, 4, 5].map(
      (seed) => runLocalSearch(input, greedyAssignments, { randomSeed: seed, maxIterations: 500 }),
    );

    const serialized = results.map((r) =>
      JSON.stringify([...r].sort((x, y) => (x.date + x.employeeId).localeCompare(y.date + y.employeeId))),
    );
    expect(new Set(serialized).size).toBeGreaterThan(1);
  });
});

describe("runLocalSearch: 極端なケース（スワップの余地がほぼない）", () => {
  it("従業員が1人しかいない場合はスワップ相手がおらず、初期解をそのまま返す", () => {
    const employees = [employee("emp-a")];
    const input = baseInput({ employees });
    const { assignments } = buildGreedySolution(input);

    const result = runLocalSearch(input, assignments, { randomSeed: 1 });

    expect(result).toEqual(assignments);
  });

  it("従業員が0人でもクラッシュせず、空の割当てをそのまま返す", () => {
    const input = baseInput({ employees: [] });
    const { assignments } = buildGreedySolution(input);

    const result = runLocalSearch(input, assignments, { randomSeed: 1 });

    expect(result).toEqual([]);
  });

  it("maxIterationsを0にすると、スワップを一切試さず初期解をそのまま返す", () => {
    const employees = [employee("emp-a"), employee("emp-b")];
    const input = baseInput({
      periodStart: "2026-09-07",
      periodEnd: "2026-09-08",
      employees,
    });
    const { assignments } = buildGreedySolution(input);

    const result = runLocalSearch(input, assignments, { randomSeed: 1, maxIterations: 0 });

    expect(result).toEqual(assignments);
  });

  it("唯一の交換が必ずハード制約を破る2人・1日構成では、初期解の実質的な中身を変えない", () => {
    const dayOnly: EmploymentType = { ...freeType, id: "et-day-only", forbiddenShiftTypeIds: [nightShift.id] };
    const nightOnly: EmploymentType = { ...freeType, id: "et-night-only", forbiddenShiftTypeIds: [dayShift.id] };
    const employees = [
      employee("emp-day", { employmentTypeId: dayOnly.id }),
      employee("emp-night", { employmentTypeId: nightOnly.id }),
    ];
    const input = baseInput({
      shiftTypes: [dayShift, nightShift],
      employees,
      employmentTypes: [dayOnly, nightOnly],
      staffingRequirements: [
        { shiftTypeId: dayShift.id, defaultRequiredCount: 1, overrides: [] },
        { shiftTypeId: nightShift.id, defaultRequiredCount: 1, overrides: [] },
      ],
    });
    const { assignments } = buildGreedySolution(input);

    const result = runLocalSearch(input, assignments, { randomSeed: 1, maxIterations: 1000 });

    // emp-dayは日勤A、emp-nightは遅番のまま（唯一可能な組み合わせ）
    expect(result.find((a) => a.employeeId === "emp-day")?.shiftTypeId).toBe(dayShift.id);
    expect(result.find((a) => a.employeeId === "emp-night")?.shiftTypeId).toBe(nightShift.id);
    verifyNoHardConstraintViolations(result, input);
  });
});
