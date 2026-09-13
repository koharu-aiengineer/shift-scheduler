import { describe, expect, it } from "vitest";
import { computeFairnessScore } from "../fairness";
import { buildGreedySolution } from "../greedy";
import { detectViolations } from "../detectViolations";
import { generateShift } from "../generateShift";
import type { Employee, EmploymentType, ShiftType, SolverInput } from "../types";

const dayShift: ShiftType = { id: "shift-day", name: "日勤A", startTime: "09:00", endTime: "17:00" };
const nightShift: ShiftType = { id: "shift-night", name: "遅番", startTime: "17:00", endTime: "22:00" };

const fulltime: EmploymentType = {
  id: "et-fulltime",
  name: "正社員",
  maxWorkDaysPerWeek: 5,
  maxWorkHoursPerWeek: 40,
  maxConsecutiveWorkDays: 5,
  forbiddenShiftTypeIds: [],
};

const parttime: EmploymentType = {
  id: "et-parttime",
  name: "アルバイト",
  // 週5日まで（4人×5日=20 ≥ 日勤A需要2人×7日=14）と、休み希望・NG曜日を
  // 破らずに済むだけの明確な余裕を持たせている
  maxWorkDaysPerWeek: 5,
  maxWorkHoursPerWeek: 40,
  maxConsecutiveWorkDays: 3,
  forbiddenShiftTypeIds: [nightShift.id], // アルバイトは遅番に入れない
};

function employee(id: string, overrides: Partial<Employee> = {}): Employee {
  return {
    id,
    name: id,
    employmentTypeId: parttime.id,
    ngWeekdays: [],
    leaveRequestDates: [],
    ...overrides,
  };
}

// 実運用に近い、1週間・2勤務区分・複数雇用形態の現実的なSolverInput。
// 正社員2人・アルバイト4人で、日勤A2人+遅番1人/日を無理なく満たせる規模にしてある。
function realisticInput(overrides: Partial<SolverInput> = {}): SolverInput {
  const employees = [
    employee("emp-1", { employmentTypeId: fulltime.id }),
    employee("emp-2", { employmentTypeId: fulltime.id }),
    employee("emp-3", { employmentTypeId: parttime.id, ngWeekdays: [6, 7] }), // 土日NG
    employee("emp-4", { employmentTypeId: parttime.id, leaveRequestDates: ["2026-09-09"] }),
    employee("emp-5", { employmentTypeId: parttime.id }),
    employee("emp-6", { employmentTypeId: parttime.id }),
  ];

  return {
    periodStart: "2026-09-07",
    periodEnd: "2026-09-13",
    shiftTypes: [dayShift, nightShift],
    employmentTypes: [fulltime, parttime],
    employees,
    staffingRequirements: [
      { shiftTypeId: dayShift.id, defaultRequiredCount: 2, overrides: [] },
      { shiftTypeId: nightShift.id, defaultRequiredCount: 1, overrides: [] },
    ],
    employmentTypeMinStaffing: [
      { employmentTypeId: fulltime.id, shiftTypeId: nightShift.id, minCount: 1 },
    ],
    ...overrides,
  };
}

describe("generateShift: end-to-endの統合テスト", () => {
  it("実際のSolverInputを渡すと、resolveRequirements→greedy→localSearch→violations再計算→fairnessScore算出の一連の流れで正しいSolverOutputが返る", () => {
    const input = realisticInput({ randomSeed: 123 });

    const output = generateShift(input, { maxIterations: 1000 });

    // 形状: 従業員数×日数ぶんの割当てが1人1日1件ずつ存在する
    const dateCount = 7;
    expect(output.assignments).toHaveLength(input.employees.length * dateCount);
    expect(typeof output.fairnessScore).toBe("number");
    expect(Number.isFinite(output.fairnessScore)).toBe(true);

    // 十分な人数を確保したシナリオなので、必要人数不足のハード違反は出ない
    const hardViolations = output.violations.filter((v) => v.severity === "hard");
    expect(hardViolations).toEqual([]);

    // TODO対応の核心: violationsは局所探索後の最終assignmentsから独立に
    // 再計算したものと完全に一致する（greedy構築時点のスナップショットを
    // 転用していないことの証明）
    expect(output.violations).toEqual(detectViolations(output.assignments, input));

    // fairnessScoreも同様に、最終assignments・violationsから独立に
    // 再計算した値と完全に一致する
    expect(output.fairnessScore).toBe(
      computeFairnessScore(output.assignments, input.employees, output.violations),
    );
  });

  it("同じrandomSeedなら常に同じSolverOutputになる（再現性）", () => {
    const input = realisticInput({ randomSeed: 999 });

    const outputA = generateShift(input, { maxIterations: 500 });
    const outputB = generateShift(input, { maxIterations: 500 });

    expect(outputA).toEqual(outputB);
  });

  it("randomSeedを変えると別パターンになりうる（再生成ボタンの土台）", () => {
    const outputs = [1, 2, 3, 4, 5].map((seed) =>
      generateShift(realisticInput({ randomSeed: seed }), { maxIterations: 500 }),
    );

    const serialized = outputs.map((o) =>
      JSON.stringify(
        [...o.assignments].sort((a, b) => (a.date + a.employeeId).localeCompare(b.date + b.employeeId)),
      ),
    );
    expect(new Set(serialized).size).toBeGreaterThan(1);
  });

  it("休み希望・NG曜日は、破らずに済む候補が必ずいる状況ではsoft違反にならない", () => {
    // realisticInputのように週次上限・雇用形態制限・休み希望・NG曜日が絡み合う
    // シナリオだと、週の合計人員には余裕があってもgreedyが日付を先読みせず
    // 貪欲に埋めるため、週の後半で候補が偏り、本来避けられそうな
    // NG曜日・休み希望の違反が発生することがある（局所探索は同日内の
    // 交換のみを行うため、日をまたいだ人員配分そのものは是正できない）。
    // ここでは制約を単純化し、「常に破らずに済む候補がいる」ことを
    // 明確にした上で、実際に破られないことを検証する。
    const unrestricted: EmploymentType = {
      id: "et-unrestricted",
      name: "無制限",
      maxWorkDaysPerWeek: null,
      maxWorkHoursPerWeek: null,
      maxConsecutiveWorkDays: null,
      forbiddenShiftTypeIds: [],
    };
    const employees = [
      employee("emp-weekend-ng", { employmentTypeId: unrestricted.id, ngWeekdays: [6, 7] }),
      employee("emp-free-1", { employmentTypeId: unrestricted.id }),
      employee("emp-free-2", { employmentTypeId: unrestricted.id }),
    ];
    const input: SolverInput = {
      periodStart: "2026-09-07",
      periodEnd: "2026-09-13",
      shiftTypes: [dayShift],
      employmentTypes: [unrestricted],
      employees,
      staffingRequirements: [{ shiftTypeId: dayShift.id, defaultRequiredCount: 1, overrides: [] }],
      employmentTypeMinStaffing: [],
      randomSeed: 5,
    };

    const output = generateShift(input, { maxIterations: 1000 });

    const softViolations = output.violations.filter((v) => v.severity === "soft");
    expect(softViolations).toEqual([]);
  });

  it("極端な人数不足でも最後まで壊れずに動作し、violationsに正しく反映される", () => {
    const employees = [employee("emp-1")];
    const input: SolverInput = {
      periodStart: "2026-09-07",
      periodEnd: "2026-09-08",
      shiftTypes: [dayShift],
      employmentTypes: [parttime],
      employees,
      staffingRequirements: [{ shiftTypeId: dayShift.id, defaultRequiredCount: 3, overrides: [] }],
      employmentTypeMinStaffing: [],
      randomSeed: 1,
    };

    const output = generateShift(input);

    expect(output.assignments).toHaveLength(2); // 1人×2日
    const understaffed = output.violations.filter((v) => v.type === "understaffed");
    expect(understaffed).toHaveLength(2); // 2日とも不足
    expect(output.violations).toEqual(detectViolations(output.assignments, input));
    expect(Number.isFinite(output.fairnessScore)).toBe(true);
  });

  it("従業員が0人でもクラッシュしない", () => {
    const input: SolverInput = {
      periodStart: "2026-09-07",
      periodEnd: "2026-09-07",
      shiftTypes: [dayShift],
      employmentTypes: [parttime],
      employees: [],
      staffingRequirements: [{ shiftTypeId: dayShift.id, defaultRequiredCount: 1, overrides: [] }],
      employmentTypeMinStaffing: [],
    };

    const output = generateShift(input);

    expect(output.assignments).toEqual([]);
    expect(output.violations).toEqual([
      expect.objectContaining({ type: "understaffed" }),
    ]);
    expect(output.fairnessScore).toBe(0);
  });

  it("局所探索を経てもgreedy単体の結果と比べて頭数（必要人数充足の実績）は変わらない", () => {
    const input = realisticInput({ randomSeed: 42 });

    const { assignments: greedyAssignments } = buildGreedySolution(input);
    const output = generateShift(input, { maxIterations: 1000 });

    const countKey = (date: string, shiftTypeId: string) => `${date}#${shiftTypeId}`;
    const countShifts = (assignments: typeof greedyAssignments) => {
      const counts = new Map<string, number>();
      for (const a of assignments) {
        if (a.kind !== "shift") continue;
        const key = countKey(a.date, a.shiftTypeId!);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      return counts;
    };

    expect(countShifts(output.assignments)).toEqual(countShifts(greedyAssignments));
  });
});
