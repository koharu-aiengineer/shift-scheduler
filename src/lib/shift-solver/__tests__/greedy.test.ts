import { describe, expect, it } from "vitest";
import { buildGreedySolution } from "../greedy";
import type { Employee, EmploymentType, ShiftType, SolverInput } from "../types";

const dayShift: ShiftType = {
  id: "shift-day",
  name: "日勤A",
  startTime: "09:00",
  endTime: "17:00",
};

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

describe("buildGreedySolution: 基本的な割当て", () => {
  it("必要人数を満たせる場合は全員分の割当てを1日1件ずつ作る", () => {
    const employees = [employee("emp-a"), employee("emp-b")];
    const input = baseInput({ employees, staffingRequirements: [{ shiftTypeId: dayShift.id, defaultRequiredCount: 1, overrides: [] }] });

    const { assignments, violations } = buildGreedySolution(input);

    expect(assignments).toHaveLength(2); // 出勤1件 + システム割振休1件
    const shiftAssignments = assignments.filter((a) => a.kind === "shift");
    expect(shiftAssignments).toHaveLength(1);
    const offAssignments = assignments.filter((a) => a.kind !== "shift");
    expect(offAssignments).toHaveLength(1);
    expect(offAssignments[0].kind).toBe("system_assigned_leave");
    expect(violations).toHaveLength(0);
  });

  it("休み希望日は、破らずに済むなら希望どおり休みにする", () => {
    const employees = [
      employee("emp-a", { leaveRequestDates: ["2026-09-07"] }),
      employee("emp-b"),
    ];
    const input = baseInput({ employees });

    const { assignments, violations } = buildGreedySolution(input);

    const empA = assignments.find((a) => a.employeeId === "emp-a")!;
    expect(empA.kind).toBe("requested_leave");
    const empB = assignments.find((a) => a.employeeId === "emp-b")!;
    expect(empB.kind).toBe("shift");
    expect(violations).toHaveLength(0);
  });

  it("NG曜日は禁止勤務区分と違いハード制約ではないため、他に候補がいなければ割り当てる", () => {
    const employees = [employee("emp-a", { ngWeekdays: [1] })]; // 2026-09-07は月曜
    const input = baseInput({ employees });

    const { assignments, violations } = buildGreedySolution(input);

    const shiftAssignment = assignments.find((a) => a.kind === "shift");
    expect(shiftAssignment?.employeeId).toBe("emp-a");
    expect(violations).toEqual([
      expect.objectContaining({ severity: "soft", type: "ng_weekday_not_honored", employeeId: "emp-a" }),
    ]);
  });

  it("雇用形態の禁止勤務区分に該当する従業員はハード制約として割り当てない", () => {
    const restricted: EmploymentType = { ...freeType, id: "et-restricted", forbiddenShiftTypeIds: [dayShift.id] };
    const employees = [employee("emp-a", { employmentTypeId: restricted.id })];
    const input = baseInput({ employees, employmentTypes: [freeType, restricted] });

    const { assignments, violations } = buildGreedySolution(input);

    expect(assignments.filter((a) => a.kind === "shift")).toHaveLength(0);
    expect(assignments.find((a) => a.employeeId === "emp-a")?.kind).toBe("system_assigned_leave");
    expect(violations).toEqual([
      expect.objectContaining({ severity: "hard", type: "understaffed" }),
    ]);
  });
});

describe("buildGreedySolution: 休み希望を破る優先順位", () => {
  it("破らざるを得ない場合、これまでの勤務日数が少ない人から優先して破る", () => {
    // day1: K,L休み希望 → Mのみ出勤可 → M勤務
    // day2: L,M休み希望 → Kのみ出勤可 → K勤務
    // day3: K,L,M全員休み希望 → 全員破ることになる。
    //   この時点の勤務日数: K=1, L=0, M=1 → 最も少ないLが選ばれるはず
    const employees = [
      employee("emp-k", { leaveRequestDates: ["2026-09-07", "2026-09-09", "2026-09-10"] }),
      employee("emp-l", { leaveRequestDates: ["2026-09-07", "2026-09-08", "2026-09-09", "2026-09-10"] }),
      employee("emp-m", { leaveRequestDates: ["2026-09-08", "2026-09-09", "2026-09-10"] }),
    ];
    const input = baseInput({
      periodStart: "2026-09-07",
      periodEnd: "2026-09-10",
      employees,
    });

    const { assignments } = buildGreedySolution(input);

    const day3Shift = assignments.find(
      (a) => a.date === "2026-09-09" && a.kind === "shift",
    );
    expect(day3Shift?.employeeId).toBe("emp-l");
  });

  it("勤務日数が同点の場合は、休み希望を破られた回数が少ない人を優先して破る", () => {
    // day1: K,L休み希望 → Mのみ出勤可 → M勤務（M:1日, 0回破られ）
    // day2: L,M休み希望 → Kのみ出勤可 → K勤務（K:1日, 0回破られ）
    // day3: 全員休み希望、勤務日数 K=1,L=0,M=1 → 最少のLが破られる（L:1日, 1回破られ）
    // day4: 全員休み希望、勤務日数は K=1,L=1,M=1 で同点
    //   → 破られた回数が少ないK・Mが優先され、破られた回数1のLは選ばれない
    const employees = [
      employee("emp-k", { leaveRequestDates: ["2026-09-07", "2026-09-09", "2026-09-10"] }),
      employee("emp-l", { leaveRequestDates: ["2026-09-07", "2026-09-08", "2026-09-09", "2026-09-10"] }),
      employee("emp-m", { leaveRequestDates: ["2026-09-08", "2026-09-09", "2026-09-10"] }),
    ];
    const input = baseInput({
      periodStart: "2026-09-07",
      periodEnd: "2026-09-10",
      employees,
    });

    const { assignments } = buildGreedySolution(input);

    const day4Shift = assignments.find(
      (a) => a.date === "2026-09-10" && a.kind === "shift",
    );
    expect(day4Shift?.employeeId).toBe("emp-k"); // emp-k, emp-mが同点でidの若い方
    expect(day4Shift?.employeeId).not.toBe("emp-l"); // 前日に破られたLは避けられる
  });
});

describe("buildGreedySolution: ハード制約（連勤上限）", () => {
  it("連勤上限に達した従業員は、それ以上連続で割り当てない", () => {
    const limited: EmploymentType = { ...freeType, id: "et-limited", maxConsecutiveWorkDays: 2 };
    const employees = [
      // emp-aは休み希望なし（常にpreferred）。公平性ソートで交代させられないよう
      // emp-bには常に休み希望を入れ、連勤上限のハード制約だけが交代の理由になるようにする。
      employee("emp-a", { employmentTypeId: limited.id }),
      employee("emp-b", {
        employmentTypeId: limited.id,
        leaveRequestDates: ["2026-09-07", "2026-09-08", "2026-09-09"],
      }),
    ];
    const input = baseInput({
      periodStart: "2026-09-07",
      periodEnd: "2026-09-09",
      employees,
      employmentTypes: [freeType, limited],
    });

    const { assignments } = buildGreedySolution(input);

    const shiftsByEmployee = new Map<string, string[]>();
    for (const a of assignments.filter((x) => x.kind === "shift")) {
      shiftsByEmployee.set(a.employeeId, [...(shiftsByEmployee.get(a.employeeId) ?? []), a.date]);
    }
    // emp-aが2日連続で選ばれた後、連勤上限のハード制約でemp-aが対象外になり、
    // 休み希望のあるemp-bがやむを得ず割り当てられる
    expect(shiftsByEmployee.get("emp-a")).toEqual(["2026-09-07", "2026-09-08"]);
    expect(shiftsByEmployee.get("emp-b")).toEqual(["2026-09-09"]);
  });
});

describe("buildGreedySolution: 最制約優先（動的順序）", () => {
  it("入力順が後ろの勤務区分でも、候補者が限られる方を先に埋めて全体の不足を避ける", () => {
    // emp-1は日勤Aしか入れない雇用形態、emp-2はどちらにも入れる雇用形態。
    // 配列の入力順は [日勤A, 限定シフト] だが、限定シフトはemp-2しか
    // 候補がいないため、最制約優先なら限定シフトを先に埋めるはず。
    // 単純な入力順処理だと、日勤Aで先にemp-2が使われてしまい
    // 限定シフトが人手不足になる。
    const dayOnly: EmploymentType = { ...freeType, id: "et-day-only" };
    const flexible: EmploymentType = {
      ...freeType,
      id: "et-flexible",
      forbiddenShiftTypeIds: [],
    };
    const restrictedShift: ShiftType = { ...dayShift, id: "shift-restricted", name: "限定シフト" };
    const dayOnlyWithRestriction: EmploymentType = {
      ...dayOnly,
      forbiddenShiftTypeIds: [restrictedShift.id],
    };

    const employees = [
      employee("emp-1", { employmentTypeId: dayOnlyWithRestriction.id }),
      employee("emp-2", { employmentTypeId: flexible.id }),
    ];
    const input = baseInput({
      shiftTypes: [dayShift, restrictedShift], // 入力順は日勤Aが先
      employees,
      employmentTypes: [dayOnlyWithRestriction, flexible],
      staffingRequirements: [
        { shiftTypeId: dayShift.id, defaultRequiredCount: 1, overrides: [] },
        { shiftTypeId: restrictedShift.id, defaultRequiredCount: 1, overrides: [] },
      ],
    });

    const { assignments, violations } = buildGreedySolution(input);

    const shiftAssignments = assignments.filter((a) => a.kind === "shift");
    expect(violations).toHaveLength(0);
    expect(shiftAssignments.find((a) => a.shiftTypeId === restrictedShift.id)?.employeeId).toBe("emp-2");
    expect(shiftAssignments.find((a) => a.shiftTypeId === dayShift.id)?.employeeId).toBe("emp-1");
  });
});

describe("buildGreedySolution: 雇用形態別必須人数", () => {
  it("必須人数を満たせる場合は指定の雇用形態から優先的に割り当てる", () => {
    const fulltime: EmploymentType = { ...freeType, id: "et-full" };
    const parttime: EmploymentType = { ...freeType, id: "et-part" };
    const employees = [
      employee("emp-full", { employmentTypeId: fulltime.id }),
      employee("emp-part", { employmentTypeId: parttime.id }),
    ];
    const input = baseInput({
      employees,
      employmentTypes: [fulltime, parttime],
      staffingRequirements: [{ shiftTypeId: dayShift.id, defaultRequiredCount: 2, overrides: [] }],
      employmentTypeMinStaffing: [
        { employmentTypeId: fulltime.id, shiftTypeId: dayShift.id, minCount: 1 },
      ],
    });

    const { assignments, violations } = buildGreedySolution(input);

    const shiftAssignments = assignments.filter((a) => a.kind === "shift");
    expect(shiftAssignments.map((a) => a.employeeId).sort()).toEqual(["emp-full", "emp-part"]);
    expect(violations).toHaveLength(0);
  });
});

describe("buildGreedySolution: 週単位の需給比による目標人数の按分", () => {
  it("週の供給が需要を下回る週でも通常週ではtargetCountがrequiredCountと変わらない（fillRatio=1）", () => {
    // 供給が需要以上の週では按分が発生しないことを確認する回帰用テスト
    const employees = [employee("emp-a"), employee("emp-b")];
    const input = baseInput({
      periodStart: "2026-09-07",
      periodEnd: "2026-09-07",
      employees,
      staffingRequirements: [{ shiftTypeId: dayShift.id, defaultRequiredCount: 1, overrides: [] }],
    });

    const { violations } = buildGreedySolution(input);

    expect(violations).toHaveLength(0);
  });

  it("週の合計必要人数が週の供給可能人日を上回る場合、不足を特定の曜日に集中させず週全体に分散させる", () => {
    const weeklyLimited: EmploymentType = {
      ...freeType,
      id: "et-weekly-limited",
      maxWorkDaysPerWeek: 3,
    };
    const employees = [
      employee("emp-1", { employmentTypeId: weeklyLimited.id }),
      employee("emp-2", { employmentTypeId: weeklyLimited.id }),
      employee("emp-3", { employmentTypeId: weeklyLimited.id }),
      employee("emp-4", { employmentTypeId: weeklyLimited.id }),
    ];
    // 週供給: 4人 x 3日 = 12人日。週需要: 3人/日 x 7日 = 21人日 → 供給不足の週
    const input = baseInput({
      periodStart: "2026-09-07", // 月曜
      periodEnd: "2026-09-13", // 日曜（ちょうど1週間）
      employees,
      employmentTypes: [weeklyLimited],
      staffingRequirements: [{ shiftTypeId: dayShift.id, defaultRequiredCount: 3, overrides: [] }],
    });

    const { assignments } = buildGreedySolution(input);

    const shiftCountByDate = new Map<string, number>();
    for (const a of assignments.filter((x) => x.kind === "shift")) {
      shiftCountByDate.set(a.date, (shiftCountByDate.get(a.date) ?? 0) + 1);
    }

    const dates = [
      "2026-09-07",
      "2026-09-08",
      "2026-09-09",
      "2026-09-10",
      "2026-09-11",
      "2026-09-12",
      "2026-09-13",
    ];
    // 暦順に3人ずつ埋める素朴な貪欲法なら供給12人日を4日で使い切り、
    // 残り3日（特に週末の日曜）は0人になる。週単位の按分により、
    // 7日すべてに出勤者がいる（＝不足が週全体に分散している）ことを確認する。
    for (const date of dates) {
      expect(shiftCountByDate.get(date) ?? 0).toBeGreaterThan(0);
    }
    // 供給量の上限（12人日）は超えない
    const totalShifts = [...shiftCountByDate.values()].reduce((a, b) => a + b, 0);
    expect(totalShifts).toBeLessThanOrEqual(12);
  });
});

describe("buildGreedySolution: 極端なケース（人数不足）", () => {
  it("従業員が1人しかおらず必要人数を満たせない場合、割当て可能な分だけ割り当てハード違反を記録する", () => {
    const employees = [employee("emp-a")];
    const input = baseInput({
      employees,
      staffingRequirements: [{ shiftTypeId: dayShift.id, defaultRequiredCount: 3, overrides: [] }],
    });

    const { assignments, violations } = buildGreedySolution(input);

    const shiftAssignments = assignments.filter((a) => a.kind === "shift");
    expect(shiftAssignments).toHaveLength(1);
    expect(shiftAssignments[0].employeeId).toBe("emp-a");
    expect(violations).toEqual([
      expect.objectContaining({
        severity: "hard",
        type: "understaffed",
        date: "2026-09-07",
        shiftTypeId: dayShift.id,
        message: expect.stringContaining("不足2人"),
      }),
    ]);
  });

  it("従業員が1人もいない場合でもクラッシュせず、不足人数どおりのハード違反を記録する", () => {
    const input = baseInput({
      employees: [],
      staffingRequirements: [{ shiftTypeId: dayShift.id, defaultRequiredCount: 2, overrides: [] }],
    });

    const { assignments, violations } = buildGreedySolution(input);

    expect(assignments).toHaveLength(0);
    expect(violations).toEqual([
      expect.objectContaining({
        severity: "hard",
        type: "understaffed",
        message: expect.stringContaining("不足2人"),
      }),
    ]);
  });

  it("複数勤務区分の需要合計が従業員数を上回る場合、両方の勤務区分で不足を記録する", () => {
    const nightShift: ShiftType = { ...dayShift, id: "shift-night", name: "遅番" };
    const employees = [employee("emp-a"), employee("emp-b")];
    const input = baseInput({
      shiftTypes: [dayShift, nightShift],
      employees,
      // 各3人ずつ必要だが従業員は2人しかいないため、先に処理される日勤Aで
      // 全員使い切られ、後続の遅番はさらに深刻な人数不足になる
      staffingRequirements: [
        { shiftTypeId: dayShift.id, defaultRequiredCount: 3, overrides: [] },
        { shiftTypeId: nightShift.id, defaultRequiredCount: 3, overrides: [] },
      ],
    });

    const { assignments, violations } = buildGreedySolution(input);

    // 1人1日1勤務区分までのため、6人分の需要に対し2人しか割り当てられない
    expect(assignments.filter((a) => a.kind === "shift")).toHaveLength(2);
    const understaffed = violations.filter((v) => v.type === "understaffed");
    expect(understaffed).toHaveLength(2);
    expect(understaffed.map((v) => v.shiftTypeId).sort()).toEqual(
      [dayShift.id, nightShift.id].sort(),
    );
  });

  it("雇用形態別必須人数の担い手が足りない場合、専用の違反と全体の不足violationsの両方を記録する", () => {
    const fulltime: EmploymentType = { ...freeType, id: "et-full" };
    const employees = [employee("emp-full", { employmentTypeId: fulltime.id })];
    const input = baseInput({
      employees,
      employmentTypes: [fulltime],
      staffingRequirements: [{ shiftTypeId: dayShift.id, defaultRequiredCount: 2, overrides: [] }],
      employmentTypeMinStaffing: [
        { employmentTypeId: fulltime.id, shiftTypeId: dayShift.id, minCount: 2 },
      ],
    });

    const { assignments, violations } = buildGreedySolution(input);

    expect(assignments.filter((a) => a.kind === "shift")).toHaveLength(1);
    expect(violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ severity: "hard", type: "employment_type_min_understaffed" }),
        expect.objectContaining({ severity: "hard", type: "understaffed" }),
      ]),
    );
  });
});
