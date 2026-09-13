import { enumerateDates, getIsoWeekday } from "../shift-solver/dateUtils";
import type { Assignment, ISODate } from "../shift-solver/types";
import {
  pickFallbackShiftColor,
  REQUESTED_LEAVE_COLOR,
  SYSTEM_ASSIGNED_LEAVE_COLOR,
} from "./colors";

const WEEKDAY_LABELS = ["月", "火", "水", "木", "金", "土", "日"] as const;

export type SheetCell = {
  text: string;
  backgroundColor: string; // "#RRGGBB"
};

export type SheetRow = {
  employeeName: string;
  cells: SheetCell[]; // periodStart〜periodEndの日付分、日付順
};

export type SheetMatrix = {
  headerRow: string[]; // ["", "9/1(月)", "9/2(火)", ...]（先頭は従業員名列のための空セル）
  rows: SheetRow[];
};

export type BuildSheetMatrixInput = {
  periodStart: ISODate;
  periodEnd: ISODate;
  employees: { id: string; name: string }[];
  shiftTypes: { id: string; name: string; color: string | null }[];
  assignments: Assignment[];
};

// SolverOutput.assignments（純粋なドメインデータ）から、出力用シートに
// そのまま書き込める行列（表示テキスト＋背景色）を組み立てる純粋関数。
// Google Sheets APIへの依存を持たないためモックデータだけで単体テストできる。
export function buildSheetMatrix(input: BuildSheetMatrixInput): SheetMatrix {
  const dates = enumerateDates(input.periodStart, input.periodEnd);

  const shiftTypeById = new Map(
    input.shiftTypes.map((st, index) => [st.id, { name: st.name, color: st.color, index }]),
  );

  const assignmentByEmployeeAndDate = new Map<string, Assignment>();
  for (const assignment of input.assignments) {
    assignmentByEmployeeAndDate.set(`${assignment.employeeId}:${assignment.date}`, assignment);
  }

  const headerRow = ["", ...dates.map((date) => formatDateLabel(date))];

  const rows = input.employees.map((employee) => ({
    employeeName: employee.name,
    cells: dates.map((date) =>
      buildCell(assignmentByEmployeeAndDate.get(`${employee.id}:${date}`) ?? null, shiftTypeById),
    ),
  }));

  return { headerRow, rows };
}

function buildCell(
  assignment: Assignment | null,
  shiftTypeById: Map<string, { name: string; color: string | null; index: number }>,
): SheetCell {
  if (!assignment) {
    // 通常は発生しない（ソルバーが全従業員・全日付分のAssignmentを返す前提）が、
    // データ不整合時に表が壊れないよう空セルにフォールバックする。
    return { text: "", backgroundColor: "#FFFFFF" };
  }

  switch (assignment.kind) {
    case "shift": {
      const shiftType = shiftTypeById.get(assignment.shiftTypeId!);
      return {
        text: shiftType?.name ?? "?",
        backgroundColor: shiftType?.color ?? pickFallbackShiftColor(shiftType?.index ?? 0),
      };
    }
    case "requested_leave":
      return { text: "休", backgroundColor: REQUESTED_LEAVE_COLOR };
    case "system_assigned_leave":
      return { text: "公休", backgroundColor: SYSTEM_ASSIGNED_LEAVE_COLOR };
  }
}

function formatDateLabel(date: ISODate): string {
  const [, month, day] = date.split("-");
  const weekday = WEEKDAY_LABELS[getIsoWeekday(date) - 1];
  return `${Number(month)}/${Number(day)}(${weekday})`;
}
