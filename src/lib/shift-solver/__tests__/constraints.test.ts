import { describe, expect, it } from "vitest";
import {
  buildShiftTypeGroups,
  canAssignShift,
  computeShiftHours,
  findUnmetEmploymentTypeMinStaffing,
  isLeaveRequested,
  isNgWeekday,
  isShiftAllowedForEmploymentType,
  wouldExceedConsecutiveWorkDays,
  wouldExceedMaxWorkDaysPerWeek,
  wouldExceedMaxWorkHoursPerWeek,
  type EmployeeWorkStats,
} from "../constraints";
import type { Employee, EmploymentType, ShiftType } from "../types";

const dayShift: ShiftType = {
  id: "shift-day",
  name: "日勤A",
  startTime: "09:00",
  endTime: "17:00",
};

const overnightShift: ShiftType = {
  id: "shift-night",
  name: "夜勤",
  startTime: "22:00",
  endTime: "06:00",
};

const noLimits: EmploymentType = {
  id: "et-free",
  name: "フリー",
  maxWorkDaysPerWeek: null,
  maxWorkHoursPerWeek: null,
  maxConsecutiveWorkDays: null,
  forbiddenShiftTypeIds: [],
};

const zeroStats: EmployeeWorkStats = {
  consecutiveWorkDaysBeforeDate: 0,
  workDaysThisWeek: 0,
  workHoursThisWeek: 0,
};

describe("computeShiftHours", () => {
  it("通常の勤務区分は終了時刻-開始時刻を時間で返す", () => {
    expect(computeShiftHours(dayShift)).toBe(8);
  });

  it("日をまたぐ勤務区分は24時間を跨いで計算する", () => {
    expect(computeShiftHours(overnightShift)).toBe(8);
  });
});

describe("isShiftAllowedForEmploymentType", () => {
  it("禁止勤務区分に含まれていなければ許可される", () => {
    expect(isShiftAllowedForEmploymentType(noLimits, "shift-day")).toBe(true);
  });

  it("禁止勤務区分に含まれていれば許可されない", () => {
    const restricted: EmploymentType = { ...noLimits, forbiddenShiftTypeIds: ["shift-day"] };
    expect(isShiftAllowedForEmploymentType(restricted, "shift-day")).toBe(false);
  });
});

describe("wouldExceedConsecutiveWorkDays", () => {
  it("上限未設定なら常にfalse", () => {
    expect(wouldExceedConsecutiveWorkDays(noLimits, { ...zeroStats, consecutiveWorkDaysBeforeDate: 100 })).toBe(false);
  });

  it("上限ちょうどに収まるならfalse", () => {
    const et: EmploymentType = { ...noLimits, maxConsecutiveWorkDays: 5 };
    expect(wouldExceedConsecutiveWorkDays(et, { ...zeroStats, consecutiveWorkDaysBeforeDate: 4 })).toBe(false);
  });

  it("割り当てると上限を超えるならtrue", () => {
    const et: EmploymentType = { ...noLimits, maxConsecutiveWorkDays: 5 };
    expect(wouldExceedConsecutiveWorkDays(et, { ...zeroStats, consecutiveWorkDaysBeforeDate: 5 })).toBe(true);
  });
});

describe("wouldExceedMaxWorkDaysPerWeek", () => {
  it("上限未設定なら常にfalse", () => {
    expect(wouldExceedMaxWorkDaysPerWeek(noLimits, { ...zeroStats, workDaysThisWeek: 100 })).toBe(false);
  });

  it("割り当てると週の上限を超えるならtrue", () => {
    const et: EmploymentType = { ...noLimits, maxWorkDaysPerWeek: 3 };
    expect(wouldExceedMaxWorkDaysPerWeek(et, { ...zeroStats, workDaysThisWeek: 3 })).toBe(true);
    expect(wouldExceedMaxWorkDaysPerWeek(et, { ...zeroStats, workDaysThisWeek: 2 })).toBe(false);
  });
});

describe("wouldExceedMaxWorkHoursPerWeek", () => {
  it("上限未設定なら常にfalse", () => {
    expect(wouldExceedMaxWorkHoursPerWeek(noLimits, zeroStats, 100)).toBe(false);
  });

  it("割り当てると週の時間上限を超えるならtrue", () => {
    const et: EmploymentType = { ...noLimits, maxWorkHoursPerWeek: 20 };
    expect(wouldExceedMaxWorkHoursPerWeek(et, { ...zeroStats, workHoursThisWeek: 13 }, 8)).toBe(true);
    expect(wouldExceedMaxWorkHoursPerWeek(et, { ...zeroStats, workHoursThisWeek: 12 }, 8)).toBe(false);
  });
});

describe("canAssignShift", () => {
  it("すべてのハード制約を満たせばtrue", () => {
    expect(canAssignShift(noLimits, dayShift, zeroStats)).toBe(true);
  });

  it("いずれか一つでもハード制約に違反すればfalse", () => {
    const restricted: EmploymentType = { ...noLimits, forbiddenShiftTypeIds: [dayShift.id] };
    expect(canAssignShift(restricted, dayShift, zeroStats)).toBe(false);

    const consecutiveLimited: EmploymentType = { ...noLimits, maxConsecutiveWorkDays: 1 };
    expect(
      canAssignShift(consecutiveLimited, dayShift, { ...zeroStats, consecutiveWorkDaysBeforeDate: 1 }),
    ).toBe(false);
  });
});

describe("isNgWeekday / isLeaveRequested", () => {
  const employee: Employee = {
    id: "emp-1",
    name: "鈴木 花子",
    employmentTypeId: "et-free",
    ngWeekdays: [1, 4], // 月・木
    leaveRequestDates: ["2026-09-20"],
  };

  it("NG曜日に該当する日はtrue", () => {
    expect(isNgWeekday(employee, "2026-09-07")).toBe(true); // 月曜
    expect(isNgWeekday(employee, "2026-09-08")).toBe(false); // 火曜
  });

  it("休み希望日に該当すればtrue", () => {
    expect(isLeaveRequested(employee, "2026-09-20")).toBe(true);
    expect(isLeaveRequested(employee, "2026-09-21")).toBe(false);
  });
});

describe("findUnmetEmploymentTypeMinStaffing", () => {
  it("必須人数に満たない雇用形態別要件のみ返す", () => {
    const unmet = findUnmetEmploymentTypeMinStaffing(
      "shift-night",
      new Map([
        ["et-fulltime", 1],
        ["et-parttime", 2],
      ]),
      [
        { employmentTypeId: "et-fulltime", shiftTypeId: "shift-night", minCount: 2 },
        { employmentTypeId: "et-parttime", shiftTypeId: "shift-night", minCount: 2 },
        { employmentTypeId: "et-fulltime", shiftTypeId: "shift-day", minCount: 5 },
      ],
    );

    expect(unmet).toEqual([
      { employmentTypeId: "et-fulltime", shiftTypeId: "shift-night", minCount: 2 },
    ]);
  });

  it("割り当てが0人の雇用形態も未充足として検出する", () => {
    const unmet = findUnmetEmploymentTypeMinStaffing(
      "shift-night",
      new Map(),
      [{ employmentTypeId: "et-fulltime", shiftTypeId: "shift-night", minCount: 1 }],
    );

    expect(unmet).toHaveLength(1);
  });
});

describe("buildShiftTypeGroups", () => {
  it("合算先を持たない勤務区分は、それぞれ単独のグループになる", () => {
    const nightShift: ShiftType = { ...dayShift, id: "shift-night", name: "遅番" };
    const groups = buildShiftTypeGroups([dayShift, nightShift]);

    expect(groups).toEqual([{ members: [dayShift] }, { members: [nightShift] }]);
  });

  it("合算先を持つ勤務区分は、親のグループのメンバーに含まれる（親が先頭）", () => {
    const partTime: ShiftType = { ...dayShift, id: "shift-day-part", name: "早番パートバイト", countsTowardShiftTypeId: "shift-day" };
    const groups = buildShiftTypeGroups([partTime, dayShift]);

    expect(groups).toEqual([{ members: [dayShift, partTime] }]);
  });

  it("同じ親を持つサブ区分が複数あれば、すべて同じグループにまとまる", () => {
    const partTimeA: ShiftType = { ...dayShift, id: "shift-day-a", name: "サブA", countsTowardShiftTypeId: "shift-day" };
    const partTimeB: ShiftType = { ...dayShift, id: "shift-day-b", name: "サブB", countsTowardShiftTypeId: "shift-day" };
    const groups = buildShiftTypeGroups([dayShift, partTimeA, partTimeB]);

    expect(groups).toEqual([{ members: [dayShift, partTimeA, partTimeB] }]);
  });
});
