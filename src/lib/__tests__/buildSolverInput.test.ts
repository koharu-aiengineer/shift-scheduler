import { describe, expect, it } from "vitest";
import {
  mapClosedDates,
  mapEmployees,
  mapEmploymentTypeMinStaffing,
  mapEmploymentTypes,
  mapShiftTypes,
  mapStaffingRequirements,
  type ClosedDateRow,
  type ClosedWeekdayRow,
  type EmployeeRow,
  type EmploymentTypeRow,
  type ShiftTypeRow,
  type StaffingOverrideRow,
  type StaffingRequirementRow,
} from "../buildSolverInput";

describe("mapShiftTypes", () => {
  it("Postgresのtime型（HH:MM:SS）をHH:mmに変換する", () => {
    const rows: ShiftTypeRow[] = [
      { id: "shift-1", name: "日勤A", start_time: "09:00:00", end_time: "17:00:00" },
    ];

    expect(mapShiftTypes(rows)).toEqual([
      { id: "shift-1", name: "日勤A", startTime: "09:00", endTime: "17:00" },
    ]);
  });
});

describe("mapEmploymentTypes", () => {
  it("employment_type_rulesが配列で返ってきても単一オブジェクトで返ってきても正しく扱う", () => {
    const rowAsArray: EmploymentTypeRow = {
      id: "et-1",
      name: "正社員",
      employment_type_rules: [
        { max_work_days_per_week: 5, max_work_hours_per_week: 40, max_consecutive_work_days: 5 },
      ],
      employment_type_shift_restrictions: [],
      employment_type_shift_staffing_requirements: [],
    };
    const rowAsObject: EmploymentTypeRow = {
      ...rowAsArray,
      id: "et-2",
      employment_type_rules: {
        max_work_days_per_week: 4,
        max_work_hours_per_week: 32,
        max_consecutive_work_days: 3,
      },
    };

    const result = mapEmploymentTypes([rowAsArray, rowAsObject]);

    expect(result[0]).toEqual({
      id: "et-1",
      name: "正社員",
      maxWorkDaysPerWeek: 5,
      maxWorkHoursPerWeek: 40,
      maxConsecutiveWorkDays: 5,
      forbiddenShiftTypeIds: [],
    });
    expect(result[1]).toEqual({
      id: "et-2",
      name: "正社員",
      maxWorkDaysPerWeek: 4,
      maxWorkHoursPerWeek: 32,
      maxConsecutiveWorkDays: 3,
      forbiddenShiftTypeIds: [],
    });
  });

  it("ルール未設定（null）ならすべてnullとして扱う", () => {
    const row: EmploymentTypeRow = {
      id: "et-1",
      name: "フリー",
      employment_type_rules: null,
      employment_type_shift_restrictions: [],
      employment_type_shift_staffing_requirements: [],
    };

    expect(mapEmploymentTypes([row])[0]).toMatchObject({
      maxWorkDaysPerWeek: null,
      maxWorkHoursPerWeek: null,
      maxConsecutiveWorkDays: null,
    });
  });

  it("禁止勤務区分をforbiddenShiftTypeIdsに変換する", () => {
    const row: EmploymentTypeRow = {
      id: "et-1",
      name: "アルバイト",
      employment_type_rules: null,
      employment_type_shift_restrictions: [{ shift_type_id: "shift-night" }],
      employment_type_shift_staffing_requirements: [],
    };

    expect(mapEmploymentTypes([row])[0].forbiddenShiftTypeIds).toEqual(["shift-night"]);
  });
});

describe("mapEmploymentTypeMinStaffing", () => {
  it("雇用形態ごとの必須人数を、employmentTypeIdを付けてフラットなリストにする", () => {
    const rows: EmploymentTypeRow[] = [
      {
        id: "et-full",
        name: "正社員",
        employment_type_rules: null,
        employment_type_shift_restrictions: [],
        employment_type_shift_staffing_requirements: [
          { shift_type_id: "shift-night", min_count: 1 },
        ],
      },
      {
        id: "et-part",
        name: "アルバイト",
        employment_type_rules: null,
        employment_type_shift_restrictions: [],
        employment_type_shift_staffing_requirements: [],
      },
    ];

    expect(mapEmploymentTypeMinStaffing(rows)).toEqual([
      { employmentTypeId: "et-full", shiftTypeId: "shift-night", minCount: 1 },
    ]);
  });
});

describe("mapEmployees", () => {
  it("NG曜日・休み希望日を正しく変換する", () => {
    const rows: EmployeeRow[] = [
      {
        id: "emp-1",
        name: "鈴木 花子",
        employment_type_id: "et-1",
        employee_ng_weekdays: [{ weekday: 1 }, { weekday: 4 }],
        employee_leave_requests: [{ requested_date: "2026-09-10" }],
      },
    ];

    const result = mapEmployees(rows, "2026-09-01", "2026-09-30");

    expect(result).toEqual([
      {
        id: "emp-1",
        name: "鈴木 花子",
        employmentTypeId: "et-1",
        ngWeekdays: [1, 4],
        leaveRequestDates: ["2026-09-10"],
      },
    ]);
  });

  it("対象期間外の休み希望日は除外する", () => {
    const rows: EmployeeRow[] = [
      {
        id: "emp-1",
        name: "emp-1",
        employment_type_id: "et-1",
        employee_ng_weekdays: [],
        employee_leave_requests: [
          { requested_date: "2026-08-31" }, // 期間より前
          { requested_date: "2026-09-15" }, // 期間内
          { requested_date: "2026-10-01" }, // 期間より後
        ],
      },
    ];

    const result = mapEmployees(rows, "2026-09-01", "2026-09-30");

    expect(result[0].leaveRequestDates).toEqual(["2026-09-15"]);
  });
});

describe("mapClosedDates", () => {
  it("定休日（曜日）を対象期間内の日付に展開する", () => {
    // 2026-09-07は月曜日
    const closedWeekdayRows: ClosedWeekdayRow[] = [{ weekday: 1 }];

    const result = mapClosedDates(closedWeekdayRows, [], "2026-09-07", "2026-09-13");

    expect(result).toEqual(["2026-09-07"]);
  });

  it("特別休業日（特定日）と定休日（曜日）を統合し、重複を除いて昇順に並べる", () => {
    const closedWeekdayRows: ClosedWeekdayRow[] = [{ weekday: 1 }]; // 2026-09-07(月)
    const closedDateRows: ClosedDateRow[] = [
      { closed_date: "2026-09-10" },
      { closed_date: "2026-09-07" }, // 定休日と重複
    ];

    const result = mapClosedDates(closedWeekdayRows, closedDateRows, "2026-09-07", "2026-09-13");

    expect(result).toEqual(["2026-09-07", "2026-09-10"]);
  });

  it("対象期間外の特別休業日は除外する", () => {
    const closedDateRows: ClosedDateRow[] = [
      { closed_date: "2026-08-31" }, // 期間より前
      { closed_date: "2026-09-10" }, // 期間内
    ];

    const result = mapClosedDates([], closedDateRows, "2026-09-07", "2026-09-13");

    expect(result).toEqual(["2026-09-10"]);
  });
});

describe("mapStaffingRequirements", () => {
  it("デフォルト必要人数と特定日の上書きを勤務区分ごとにまとめる", () => {
    const shiftTypeRows: StaffingRequirementRow[] = [
      { id: "shift-day", shift_staffing_requirements: [{ required_count: 2 }] },
      { id: "shift-night", shift_staffing_requirements: { required_count: 1 } },
    ];
    const overrideRows: StaffingOverrideRow[] = [
      { shift_type_id: "shift-day", target_date: "2026-09-20", required_count: 4 },
    ];

    const result = mapStaffingRequirements(shiftTypeRows, overrideRows);

    expect(result).toEqual([
      {
        shiftTypeId: "shift-day",
        defaultRequiredCount: 2,
        overrides: [{ date: "2026-09-20", requiredCount: 4 }],
      },
      { shiftTypeId: "shift-night", defaultRequiredCount: 1, overrides: [] },
    ]);
  });

  it("必要人数が未設定（null）ならデフォルト0とする", () => {
    const shiftTypeRows: StaffingRequirementRow[] = [
      { id: "shift-day", shift_staffing_requirements: null },
    ];

    const result = mapStaffingRequirements(shiftTypeRows, []);

    expect(result[0].defaultRequiredCount).toBe(0);
  });
});
