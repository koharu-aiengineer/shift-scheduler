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

  it("NG曜日はハード制約のため、他に候補がいなくても割り当てない", () => {
    const employees = [employee("emp-a", { ngWeekdays: [1] })]; // 2026-09-07は月曜
    const input = baseInput({ employees });

    const { assignments, violations } = buildGreedySolution(input);

    expect(assignments.filter((a) => a.kind === "shift")).toHaveLength(0);
    expect(assignments.find((a) => a.employeeId === "emp-a")?.kind).toBe("system_assigned_leave");
    expect(violations).toEqual([
      expect.objectContaining({ severity: "hard", type: "understaffed" }),
    ]);
  });

  it("休み希望日もハード制約のため、他に候補がいなくても割り当てない", () => {
    const employees = [employee("emp-a", { leaveRequestDates: ["2026-09-07"] })];
    const input = baseInput({ employees });

    const { assignments, violations } = buildGreedySolution(input);

    expect(assignments.filter((a) => a.kind === "shift")).toHaveLength(0);
    expect(assignments.find((a) => a.employeeId === "emp-a")?.kind).toBe("requested_leave");
    expect(violations).toEqual([
      expect.objectContaining({ severity: "hard", type: "understaffed" }),
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

describe("buildGreedySolution: 休み希望・NG曜日は必ず守る（ハード制約）", () => {
  it("その日の候補者全員が休み希望でも、誰にも割り当てず希望通り全員休みにする", () => {
    const employees = [
      employee("emp-k", { leaveRequestDates: ["2026-09-07"] }),
      employee("emp-l", { leaveRequestDates: ["2026-09-07"] }),
      employee("emp-m", { leaveRequestDates: ["2026-09-07"] }),
    ];
    const input = baseInput({
      periodStart: "2026-09-07",
      periodEnd: "2026-09-07",
      employees,
    });

    const { assignments, violations } = buildGreedySolution(input);

    expect(assignments.filter((a) => a.kind === "shift")).toHaveLength(0);
    expect(assignments.every((a) => a.kind === "requested_leave")).toBe(true);
    expect(violations).toEqual([
      expect.objectContaining({ severity: "hard", type: "understaffed", message: expect.stringContaining("不足1人") }),
    ]);
  });

  it("休み希望・NG曜日どちらでもない従業員がいれば、そちらを優先して割り当てる", () => {
    const employees = [
      employee("emp-k", { leaveRequestDates: ["2026-09-07"] }),
      employee("emp-l", { ngWeekdays: [1] }), // 2026-09-07は月曜
      employee("emp-m"),
    ];
    const input = baseInput({
      periodStart: "2026-09-07",
      periodEnd: "2026-09-07",
      employees,
    });

    const { assignments } = buildGreedySolution(input);

    const shiftAssignment = assignments.find((a) => a.kind === "shift");
    expect(shiftAssignment?.employeeId).toBe("emp-m");
  });
});

describe("buildGreedySolution: ハード制約（連勤上限）", () => {
  it("連勤上限に達した従業員は、それ以上連続で割り当てない", () => {
    const limited: EmploymentType = { ...freeType, id: "et-limited", maxConsecutiveWorkDays: 2 };
    const employees = [
      // emp-aは2026-09-07(月)・09-08(火)はNG曜日なし（常にpreferred）。
      // 公平性ソートで交代させられないよう、emp-bには月・火をNG曜日にして
      // ハード制約で除外し、連勤上限のハード制約だけがemp-a→emp-bの
      // 交代理由になるようにする（09-09(水)はemp-bもNGなし）。
      employee("emp-a", { employmentTypeId: limited.id }),
      employee("emp-b", { employmentTypeId: limited.id, ngWeekdays: [1, 2] }),
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

  it("上限人数が設定されていても、週の需給が厳しい週では不足の週全体への分散が壊れない（供給量を超えない）", () => {
    // 前のテストと同条件（供給12人日 < 需要21人日）に、上限人数（+2人ぶん）を
    // 追加しても、按分の保証（週の供給量を超えない）が壊れないことを確認する。
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
    const input = baseInput({
      periodStart: "2026-09-07",
      periodEnd: "2026-09-13",
      employees,
      employmentTypes: [weeklyLimited],
      staffingRequirements: [
        { shiftTypeId: dayShift.id, defaultRequiredCount: 3, defaultMaxCount: 5, overrides: [] },
      ],
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
    for (const date of dates) {
      expect(shiftCountByDate.get(date) ?? 0).toBeGreaterThan(0);
    }
    const totalShifts = [...shiftCountByDate.values()].reduce((a, b) => a + b, 0);
    expect(totalShifts).toBeLessThanOrEqual(12);
  });
});

describe("buildGreedySolution: 店舗の定休日・特別休業日", () => {
  it("closedDatesに含まれる日は必要人数を満たせなくても誰にも割り当てず、違反も記録しない", () => {
    const employees = [employee("emp-a"), employee("emp-b")];
    const input = baseInput({
      employees,
      staffingRequirements: [{ shiftTypeId: dayShift.id, defaultRequiredCount: 2, overrides: [] }],
      closedDates: ["2026-09-07"],
    });

    const { assignments, violations } = buildGreedySolution(input);

    expect(assignments.filter((a) => a.kind === "shift")).toHaveLength(0);
    expect(assignments.every((a) => a.kind === "system_assigned_leave")).toBe(true);
    expect(violations).toHaveLength(0);
  });

  it("特定日の必要人数上書きがあっても、closedDatesの方を優先して0にする", () => {
    const employees = [employee("emp-a")];
    const input = baseInput({
      employees,
      staffingRequirements: [
        {
          shiftTypeId: dayShift.id,
          defaultRequiredCount: 1,
          overrides: [{ date: "2026-09-07", requiredCount: 3 }],
        },
      ],
      closedDates: ["2026-09-07"],
    });

    const { assignments, violations } = buildGreedySolution(input);

    expect(assignments.filter((a) => a.kind === "shift")).toHaveLength(0);
    expect(violations).toHaveLength(0);
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

describe("buildGreedySolution: 勤務区分の合算先（グループ必要人数）", () => {
  it("親とサブ区分の合計で必要人数を満たしていれば違反にならない", () => {
    const subShift: ShiftType = {
      ...dayShift,
      id: "shift-day-part",
      name: "早番パートバイト",
      countsTowardShiftTypeId: dayShift.id,
    };
    const employees = [employee("emp-a"), employee("emp-b")];
    const input = baseInput({
      shiftTypes: [dayShift, subShift],
      employees,
      // 親(日勤A)の必要人数だけが「合計の目標」として使われる。
      // サブ区分自身に必要人数を設定しても無視される想定。
      staffingRequirements: [
        { shiftTypeId: dayShift.id, defaultRequiredCount: 2, overrides: [] },
        { shiftTypeId: subShift.id, defaultRequiredCount: 0, overrides: [] },
      ],
    });

    const { assignments, violations } = buildGreedySolution(input);

    const shiftAssignments = assignments.filter((a) => a.kind === "shift");
    expect(shiftAssignments).toHaveLength(2);
    expect(violations).toHaveLength(0);
  });

  it("親側の候補者が尽きていれば、サブ区分側で埋めて合計人数を満たす", () => {
    const subShift: ShiftType = {
      ...dayShift,
      id: "shift-day-part",
      name: "早番パートバイト",
      countsTowardShiftTypeId: dayShift.id,
    };
    // 親（日勤A）にしか入れない雇用形態と、サブ区分にしか入れない雇用形態を用意し、
    // 親側の候補が1人しかいなくても、サブ区分側の候補で合計2人に埋まることを確認する。
    const parentOnly: EmploymentType = { ...freeType, id: "et-parent-only", forbiddenShiftTypeIds: [subShift.id] };
    const subOnly: EmploymentType = { ...freeType, id: "et-sub-only", forbiddenShiftTypeIds: [dayShift.id] };
    const employees = [
      employee("emp-parent", { employmentTypeId: parentOnly.id }),
      employee("emp-sub", { employmentTypeId: subOnly.id }),
    ];
    const input = baseInput({
      shiftTypes: [dayShift, subShift],
      employees,
      employmentTypes: [freeType, parentOnly, subOnly],
      staffingRequirements: [{ shiftTypeId: dayShift.id, defaultRequiredCount: 2, overrides: [] }],
    });

    const { assignments, violations } = buildGreedySolution(input);

    const shiftAssignments = assignments.filter((a) => a.kind === "shift");
    expect(shiftAssignments.map((a) => a.employeeId).sort()).toEqual(["emp-parent", "emp-sub"]);
    expect(shiftAssignments.find((a) => a.employeeId === "emp-parent")?.shiftTypeId).toBe(dayShift.id);
    expect(shiftAssignments.find((a) => a.employeeId === "emp-sub")?.shiftTypeId).toBe(subShift.id);
    expect(violations).toHaveLength(0);
  });

  it("親とサブ区分の合計でも人数が足りない場合は、グループ全体として1件だけ不足violationを記録する", () => {
    const subShift: ShiftType = {
      ...dayShift,
      id: "shift-day-part",
      name: "早番パートバイト",
      countsTowardShiftTypeId: dayShift.id,
    };
    const employees = [employee("emp-a")];
    const input = baseInput({
      shiftTypes: [dayShift, subShift],
      employees,
      staffingRequirements: [{ shiftTypeId: dayShift.id, defaultRequiredCount: 2, overrides: [] }],
    });

    const { assignments, violations } = buildGreedySolution(input);

    expect(assignments.filter((a) => a.kind === "shift")).toHaveLength(1);
    expect(violations).toEqual([
      expect.objectContaining({
        severity: "hard",
        type: "understaffed",
        shiftTypeId: dayShift.id,
        message: expect.stringContaining("不足1人"),
      }),
    ]);
  });

  it("雇用形態別必須人数はグループ内の特定の勤務区分（親）に指定でき、合計人数の枠内で優先確保される", () => {
    const subShift: ShiftType = {
      ...dayShift,
      id: "shift-day-part",
      name: "早番パートバイト",
      countsTowardShiftTypeId: dayShift.id,
    };
    const fulltime: EmploymentType = { ...freeType, id: "et-full" };
    const parttime: EmploymentType = { ...freeType, id: "et-part" };
    const employees = [
      employee("emp-full", { employmentTypeId: fulltime.id }),
      employee("emp-part", { employmentTypeId: parttime.id }),
    ];
    const input = baseInput({
      shiftTypes: [dayShift, subShift],
      employees,
      employmentTypes: [fulltime, parttime],
      staffingRequirements: [{ shiftTypeId: dayShift.id, defaultRequiredCount: 2, overrides: [] }],
      // 社員(fulltime)は「親」(日勤A)に最低1人、という指定
      employmentTypeMinStaffing: [
        { employmentTypeId: fulltime.id, shiftTypeId: dayShift.id, minCount: 1 },
      ],
    });

    const { assignments, violations } = buildGreedySolution(input);

    const shiftAssignments = assignments.filter((a) => a.kind === "shift");
    expect(shiftAssignments.find((a) => a.employeeId === "emp-full")?.shiftTypeId).toBe(dayShift.id);
    expect(shiftAssignments).toHaveLength(2);
    expect(violations).toHaveLength(0);
  });
});

describe("buildGreedySolution: 上限人数（任意）による余裕があるときの追加割当て", () => {
  it("上限人数が設定されていて候補者に余裕があれば、必要人数を超えて上限まで割り当てる", () => {
    const employees = [employee("emp-a"), employee("emp-b"), employee("emp-c")];
    const input = baseInput({
      employees,
      staffingRequirements: [
        { shiftTypeId: dayShift.id, defaultRequiredCount: 1, defaultMaxCount: 3, overrides: [] },
      ],
    });

    const { assignments, violations } = buildGreedySolution(input);

    expect(assignments.filter((a) => a.kind === "shift")).toHaveLength(3);
    expect(violations).toHaveLength(0);
  });

  it("上限人数が設定されていても、候補者が足りなければ無理に増やさず必要人数の充足だけを見る", () => {
    const employees = [employee("emp-a")];
    const input = baseInput({
      employees,
      staffingRequirements: [
        { shiftTypeId: dayShift.id, defaultRequiredCount: 1, defaultMaxCount: 3, overrides: [] },
      ],
    });

    const { assignments, violations } = buildGreedySolution(input);

    expect(assignments.filter((a) => a.kind === "shift")).toHaveLength(1);
    expect(violations).toHaveLength(0);
  });

  it("上限人数が未設定（null）なら、候補者に余裕があっても必要人数ちょうどまでしか割り当てない（従来どおり）", () => {
    const employees = [employee("emp-a"), employee("emp-b"), employee("emp-c")];
    const input = baseInput({
      employees,
      staffingRequirements: [{ shiftTypeId: dayShift.id, defaultRequiredCount: 1, overrides: [] }],
    });

    const { assignments } = buildGreedySolution(input);

    expect(assignments.filter((a) => a.kind === "shift")).toHaveLength(1);
  });
});

describe("buildGreedySolution: サブ区分のweekdayPriority（平日優先）", () => {
  it("平日は、weekdayPriority: trueのサブ区分を親より先に埋めようとする", () => {
    const subShift: ShiftType = {
      ...dayShift,
      id: "shift-day-part",
      name: "早番パートバイト",
      countsTowardShiftTypeId: dayShift.id,
      weekdayPriority: true,
    };
    const employees = [employee("emp-a"), employee("emp-b")];
    const input = baseInput({
      periodStart: "2026-09-07", // 月曜
      periodEnd: "2026-09-07",
      shiftTypes: [dayShift, subShift],
      employees,
      staffingRequirements: [{ shiftTypeId: dayShift.id, defaultRequiredCount: 2, overrides: [] }],
    });

    const { assignments } = buildGreedySolution(input);

    const shiftAssignments = assignments.filter((a) => a.kind === "shift");
    expect(shiftAssignments).toHaveLength(2);
    expect(shiftAssignments.every((a) => a.shiftTypeId === subShift.id)).toBe(true);
  });

  it("土日はweekdayPriorityの影響を受けず、従来どおり親を優先して埋める", () => {
    const subShift: ShiftType = {
      ...dayShift,
      id: "shift-day-part",
      name: "早番パートバイト",
      countsTowardShiftTypeId: dayShift.id,
      weekdayPriority: true,
    };
    const employees = [employee("emp-a"), employee("emp-b")];
    const input = baseInput({
      periodStart: "2026-09-12", // 土曜
      periodEnd: "2026-09-12",
      shiftTypes: [dayShift, subShift],
      employees,
      staffingRequirements: [{ shiftTypeId: dayShift.id, defaultRequiredCount: 2, overrides: [] }],
    });

    const { assignments } = buildGreedySolution(input);

    const shiftAssignments = assignments.filter((a) => a.kind === "shift");
    expect(shiftAssignments).toHaveLength(2);
    expect(shiftAssignments.every((a) => a.shiftTypeId === dayShift.id)).toBe(true);
  });

  it("weekdayPriorityが設定されていても、埋めきれない分は通常どおり他メンバーに回る", () => {
    const subShift: ShiftType = {
      ...dayShift,
      id: "shift-day-part",
      name: "早番パートバイト",
      countsTowardShiftTypeId: dayShift.id,
      weekdayPriority: true,
    };
    // サブ区分にしか入れない従業員1人 + 親にしか入れない従業員1人
    const subOnly: EmploymentType = { ...freeType, id: "et-sub-only", forbiddenShiftTypeIds: [dayShift.id] };
    const parentOnly: EmploymentType = { ...freeType, id: "et-parent-only", forbiddenShiftTypeIds: [subShift.id] };
    const employees = [
      employee("emp-sub", { employmentTypeId: subOnly.id }),
      employee("emp-parent", { employmentTypeId: parentOnly.id }),
    ];
    const input = baseInput({
      periodStart: "2026-09-07", // 月曜
      periodEnd: "2026-09-07",
      shiftTypes: [dayShift, subShift],
      employees,
      employmentTypes: [freeType, subOnly, parentOnly],
      staffingRequirements: [{ shiftTypeId: dayShift.id, defaultRequiredCount: 2, overrides: [] }],
    });

    const { assignments, violations } = buildGreedySolution(input);

    const shiftAssignments = assignments.filter((a) => a.kind === "shift");
    expect(shiftAssignments.find((a) => a.employeeId === "emp-sub")?.shiftTypeId).toBe(subShift.id);
    expect(shiftAssignments.find((a) => a.employeeId === "emp-parent")?.shiftTypeId).toBe(dayShift.id);
    expect(violations).toHaveLength(0);
  });
});

describe("buildGreedySolution: 雇用形態の月間目標時間（任意）による優先順位づけ", () => {
  it("目標時間に達していない従業員を、達している／目標未設定の従業員より優先して割り当てる", () => {
    // dayShiftは8時間。targeted(目標16時間)は最初の2日で目標に達し、
    // 3日目は目標未設定のnoTargetの方が（従来どおり勤務日数の少なさで）優先されるはず。
    const targeted: EmploymentType = { ...freeType, id: "et-targeted", targetMonthlyHours: 16 };
    const noTarget: EmploymentType = { ...freeType, id: "et-no-target" };
    const employees = [
      employee("emp-targeted", { employmentTypeId: targeted.id }),
      employee("emp-no-target", { employmentTypeId: noTarget.id }),
    ];
    const input = baseInput({
      periodStart: "2026-09-07",
      periodEnd: "2026-09-09",
      employees,
      employmentTypes: [targeted, noTarget],
      staffingRequirements: [{ shiftTypeId: dayShift.id, defaultRequiredCount: 1, overrides: [] }],
    });

    const { assignments } = buildGreedySolution(input);

    const shiftsByDate = new Map(
      assignments.filter((a) => a.kind === "shift").map((a) => [a.date, a.employeeId]),
    );
    expect(shiftsByDate.get("2026-09-07")).toBe("emp-targeted");
    expect(shiftsByDate.get("2026-09-08")).toBe("emp-targeted");
    // 2日目終了時点でemp-targetedは16時間に達しているため、3日目は
    // 従来どおりの公平性（勤務日数が少ない方）でemp-no-targetが優先される
    expect(shiftsByDate.get("2026-09-09")).toBe("emp-no-target");
  });

  it("目標時間が未設定（null）なら、従来どおり勤務日数の公平性だけで順序を決める", () => {
    const employees = [employee("emp-a"), employee("emp-b")];
    const input = baseInput({
      periodStart: "2026-09-07",
      periodEnd: "2026-09-08",
      employees,
      staffingRequirements: [{ shiftTypeId: dayShift.id, defaultRequiredCount: 1, overrides: [] }],
    });

    const { assignments } = buildGreedySolution(input);

    const shiftsByDate = new Map(
      assignments.filter((a) => a.kind === "shift").map((a) => [a.date, a.employeeId]),
    );
    // 目標未設定なので、勤務日数の少ない方が交互に選ばれる（従来どおり）
    expect(shiftsByDate.get("2026-09-07")).not.toBe(shiftsByDate.get("2026-09-08"));
  });

  it("平日優先（weekdayPriority）のサブ区分に入れない雇用形態でも、目標未達なら親（本体）を優先して割り当てる", () => {
    // サブ区分に入れない雇用形態（例: 社員）が目標時間未達の場合、
    // weekdayPriorityでサブ区分が先に埋まってしまい親（本体）の枠が
    // 残らない、ということがないようにする（Step2aで親を先に確保する）。
    const subShift: ShiftType = {
      ...dayShift,
      id: "shift-day-part",
      name: "早番パートバイト",
      countsTowardShiftTypeId: dayShift.id,
      weekdayPriority: true,
    };
    const targeted: EmploymentType = {
      ...freeType,
      id: "et-targeted",
      targetMonthlyHours: 100,
      forbiddenShiftTypeIds: [subShift.id],
    };
    const employees = [
      employee("emp-targeted", { employmentTypeId: targeted.id }),
      employee("emp-free"),
    ];
    const input = baseInput({
      periodStart: "2026-09-07", // 月曜
      periodEnd: "2026-09-07",
      shiftTypes: [dayShift, subShift],
      employees,
      employmentTypes: [freeType, targeted],
      staffingRequirements: [{ shiftTypeId: dayShift.id, defaultRequiredCount: 2, overrides: [] }],
    });

    const { assignments, violations } = buildGreedySolution(input);

    const shiftAssignments = assignments.filter((a) => a.kind === "shift");
    expect(shiftAssignments.find((a) => a.employeeId === "emp-targeted")?.shiftTypeId).toBe(dayShift.id);
    expect(shiftAssignments.find((a) => a.employeeId === "emp-free")?.shiftTypeId).toBe(subShift.id);
    expect(violations).toHaveLength(0);
  });

  it("複数の勤務区分（グループ）が同じ雇用形態の必須人数を要求している場合、目標時間の優先割当てが一方の必須人数を枯渇させない", () => {
    // shiftA・shiftBはそれぞれ独立したグループ（合算関係なし）で、両方とも
    // targeted（目標時間999時間＝常に未達扱い）に最低1人を要求している。
    // targetedが2人しかいない状況で、Step2の目標時間優先割当てが片方の
    // グループに両方のtargetedを取り込んでしまうと、もう片方のグループの
    // 必須人数が満たせなくなる（このリグレッションを防ぐための回帰テスト）。
    const shiftA: ShiftType = { ...dayShift, id: "shift-a", name: "シフトA" };
    const shiftB: ShiftType = { ...dayShift, id: "shift-b", name: "シフトB" };
    const targeted: EmploymentType = { ...freeType, id: "et-targeted", targetMonthlyHours: 999 };
    const employees = [
      employee("emp-targeted-1", { employmentTypeId: targeted.id }),
      employee("emp-targeted-2", { employmentTypeId: targeted.id }),
      employee("emp-filler"),
    ];
    const input = baseInput({
      periodStart: "2026-09-07",
      periodEnd: "2026-09-07",
      shiftTypes: [shiftA, shiftB],
      employees,
      employmentTypes: [freeType, targeted],
      staffingRequirements: [
        { shiftTypeId: shiftA.id, defaultRequiredCount: 2, overrides: [] },
        { shiftTypeId: shiftB.id, defaultRequiredCount: 1, overrides: [] },
      ],
      employmentTypeMinStaffing: [
        { employmentTypeId: targeted.id, shiftTypeId: shiftA.id, minCount: 1 },
        { employmentTypeId: targeted.id, shiftTypeId: shiftB.id, minCount: 1 },
      ],
    });

    const { violations } = buildGreedySolution(input);

    expect(violations.filter((v) => v.type === "employment_type_min_understaffed")).toHaveLength(0);
  });
});

describe("buildGreedySolution: 雇用形態×勤務区分の土日限定の上限人数", () => {
  it("土曜・日曜は、上限人数を超えてその雇用形態を割り当てない（他に埋める候補がいなければ不足になる）", () => {
    const limited: EmploymentType = { ...freeType, id: "et-limited" };
    const employees = [
      employee("emp-1", { employmentTypeId: limited.id }),
      employee("emp-2", { employmentTypeId: limited.id }),
      employee("emp-3", { employmentTypeId: limited.id }),
    ];
    const input = baseInput({
      periodStart: "2026-09-12", // 土曜
      periodEnd: "2026-09-12",
      employees,
      employmentTypes: [limited],
      staffingRequirements: [{ shiftTypeId: dayShift.id, defaultRequiredCount: 3, overrides: [] }],
      employmentTypeWeekendMaxStaffing: [
        { employmentTypeId: limited.id, shiftTypeId: dayShift.id, maxCount: 2 },
      ],
    });

    const { assignments, violations } = buildGreedySolution(input);

    expect(assignments.filter((a) => a.kind === "shift")).toHaveLength(2);
    expect(violations).toEqual([
      expect.objectContaining({
        severity: "hard",
        type: "understaffed",
        message: expect.stringContaining("不足1人"),
      }),
    ]);
  });

  it("平日は土日限定の上限人数の影響を受けない", () => {
    const limited: EmploymentType = { ...freeType, id: "et-limited" };
    const employees = [
      employee("emp-1", { employmentTypeId: limited.id }),
      employee("emp-2", { employmentTypeId: limited.id }),
      employee("emp-3", { employmentTypeId: limited.id }),
    ];
    const input = baseInput({
      periodStart: "2026-09-07", // 月曜
      periodEnd: "2026-09-07",
      employees,
      employmentTypes: [limited],
      staffingRequirements: [{ shiftTypeId: dayShift.id, defaultRequiredCount: 3, overrides: [] }],
      employmentTypeWeekendMaxStaffing: [
        { employmentTypeId: limited.id, shiftTypeId: dayShift.id, maxCount: 2 },
      ],
    });

    const { assignments, violations } = buildGreedySolution(input);

    expect(assignments.filter((a) => a.kind === "shift")).toHaveLength(3);
    expect(violations).toHaveLength(0);
  });
});
