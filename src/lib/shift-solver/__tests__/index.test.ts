import { describe, expect, it } from "vitest";
import { generateShift, type SolverInput } from "../index";

describe("index: 公開インターフェースからgenerateShiftを呼び出せる", () => {
  it("barrel export経由でも正しく動作する", () => {
    const input: SolverInput = {
      periodStart: "2026-09-07",
      periodEnd: "2026-09-07",
      shiftTypes: [{ id: "shift-day", name: "日勤A", startTime: "09:00", endTime: "17:00" }],
      employmentTypes: [
        {
          id: "et-free",
          name: "フリー",
          maxWorkDaysPerWeek: null,
          maxWorkHoursPerWeek: null,
          maxConsecutiveWorkDays: null,
          forbiddenShiftTypeIds: [],
        },
      ],
      employees: [
        { id: "emp-a", name: "emp-a", employmentTypeId: "et-free", ngWeekdays: [], leaveRequestDates: [] },
      ],
      staffingRequirements: [{ shiftTypeId: "shift-day", defaultRequiredCount: 1, overrides: [] }],
      employmentTypeMinStaffing: [],
    };

    const output = generateShift(input);

    expect(output.assignments).toHaveLength(1);
    expect(output.assignments[0]).toMatchObject({ employeeId: "emp-a", kind: "shift", shiftTypeId: "shift-day" });
    expect(output.violations).toEqual([]);
    expect(output.fairnessScore).toBe(0);
  });
});
