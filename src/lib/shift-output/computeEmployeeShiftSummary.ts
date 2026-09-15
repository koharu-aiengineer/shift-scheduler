import type { Assignment } from "../shift-solver/types";

export type EmployeeShiftSummary = {
  employeeId: string;
  employeeName: string;
  shiftCounts: { shiftTypeId: string; shiftTypeName: string; count: number }[];
  leaveDaysCount: number; // 休み希望消化＋自動割振休の合計日数
};

export type ComputeEmployeeShiftSummaryInput = {
  employees: { id: string; name: string }[];
  shiftTypes: { id: string; name: string }[];
  assignments: Assignment[];
};

// 従業員ごとに、勤務区分別の出勤日数と休みの日数を集計する純粋関数。
// 店長画面（/dashboard/shift）にのみ表示する目的で、出力用スプレッドシート
// には書き込まない（CLAUDE.mdの「出力用シートには集計行を持たせない」方針のため）。
// employeesの並び順をそのまま結果の並び順として使うため、呼び出し側で
// 表示したい順（雇用形態順など）に並べ替えてから渡すこと。
export function computeEmployeeShiftSummary(
  input: ComputeEmployeeShiftSummaryInput,
): EmployeeShiftSummary[] {
  const shiftCountByKey = new Map<string, number>();
  const leaveDaysByEmployee = new Map<string, number>();

  for (const assignment of input.assignments) {
    if (assignment.kind === "shift") {
      const key = `${assignment.employeeId}#${assignment.shiftTypeId}`;
      shiftCountByKey.set(key, (shiftCountByKey.get(key) ?? 0) + 1);
    } else {
      leaveDaysByEmployee.set(
        assignment.employeeId,
        (leaveDaysByEmployee.get(assignment.employeeId) ?? 0) + 1,
      );
    }
  }

  return input.employees.map((employee) => ({
    employeeId: employee.id,
    employeeName: employee.name,
    shiftCounts: input.shiftTypes.map((shiftType) => ({
      shiftTypeId: shiftType.id,
      shiftTypeName: shiftType.name,
      count: shiftCountByKey.get(`${employee.id}#${shiftType.id}`) ?? 0,
    })),
    leaveDaysCount: leaveDaysByEmployee.get(employee.id) ?? 0,
  }));
}
