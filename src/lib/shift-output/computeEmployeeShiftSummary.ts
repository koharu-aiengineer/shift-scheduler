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

export type SheetEmployeeRow = {
  employeeName: string;
  // 対象月の日数分、日付順に並んだセルのテキスト（勤務区分名 / 休 / 公休 / 定休日 / 空欄など）
  cellTexts: string[];
};

export type ComputeEmployeeShiftSummaryFromSheetInput = {
  employees: { id: string; name: string }[];
  shiftTypes: { id: string; name: string }[];
  sheetRows: SheetEmployeeRow[];
  // 対象月の日数。sheetRowsのcellTextsがこれより短い場合（Sheets APIは行末の
  // 空セルを省略して返すため）、不足分は空欄＝休みとして扱う。
  dayCount: number;
};

// 出力用スプレッドシートを読み直した結果（手動修正後の値を含む）から、
// computeEmployeeShiftSummaryと同じ形の集計を作る純粋関数。
// セルのテキストが勤務区分名のどれとも一致しない場合（休・公休・定休日・空欄・
// 手直しによる誤字なども含む）は、その従業員のその日を全て「休み」として数える。
// 出力用シートには書き戻さず、店長画面の表示専用に使う。
export function computeEmployeeShiftSummaryFromSheetRows(
  input: ComputeEmployeeShiftSummaryFromSheetInput,
): EmployeeShiftSummary[] {
  const shiftTypeIdByName = new Map(input.shiftTypes.map((st) => [st.name, st.id]));
  const sheetRowByEmployeeName = new Map(input.sheetRows.map((row) => [row.employeeName, row]));

  return input.employees.map((employee) => {
    const sheetRow = sheetRowByEmployeeName.get(employee.name);
    const countByShiftTypeId = new Map<string, number>();
    let leaveDaysCount = 0;

    for (let i = 0; i < input.dayCount; i++) {
      const text = sheetRow?.cellTexts[i] ?? "";
      const shiftTypeId = shiftTypeIdByName.get(text);
      if (shiftTypeId) {
        countByShiftTypeId.set(shiftTypeId, (countByShiftTypeId.get(shiftTypeId) ?? 0) + 1);
      } else {
        leaveDaysCount += 1;
      }
    }

    return {
      employeeId: employee.id,
      employeeName: employee.name,
      shiftCounts: input.shiftTypes.map((shiftType) => ({
        shiftTypeId: shiftType.id,
        shiftTypeName: shiftType.name,
        count: countByShiftTypeId.get(shiftType.id) ?? 0,
      })),
      leaveDaysCount,
    };
  });
}
