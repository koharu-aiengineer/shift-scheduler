import { enumerateDates, getIsoWeekday } from "../shift-solver/dateUtils";
import type { Assignment, ISODate } from "../shift-solver/types";
import { buildCellLegend } from "./colors";

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
  // 店舗の定休日・特別休業日。この日は割当ての内容に関わらず全員「定休日」と
  // 表示する（店長画面ではなく出力用シート自体の表示。個人の公休と区別する）。
  closedDates?: ISODate[];
};

// SolverOutput.assignments（純粋なドメインデータ）から、出力用シートに
// そのまま書き込める行列（表示テキスト＋背景色）を組み立てる純粋関数。
// Google Sheets APIへの依存を持たないためモックデータだけで単体テストできる。
export function buildSheetMatrix(input: BuildSheetMatrixInput): SheetMatrix {
  const dates = enumerateDates(input.periodStart, input.periodEnd);
  const closedDateSet = new Set(input.closedDates ?? []);

  const shiftTypeNameById = new Map(input.shiftTypes.map((st) => [st.id, st.name]));
  const colorByText = new Map(
    buildCellLegend(input.shiftTypes).map((entry) => [entry.text, entry.color]),
  );

  const assignmentByEmployeeAndDate = new Map<string, Assignment>();
  for (const assignment of input.assignments) {
    assignmentByEmployeeAndDate.set(`${assignment.employeeId}:${assignment.date}`, assignment);
  }

  const headerRow = ["", ...dates.map((date) => formatDateLabel(date))];

  const rows = input.employees.map((employee) => ({
    employeeName: employee.name,
    cells: dates.map((date) =>
      closedDateSet.has(date)
        ? { text: "定休日", backgroundColor: colorByText.get("定休日") ?? "#FFFFFF" }
        : buildCell(
            assignmentByEmployeeAndDate.get(`${employee.id}:${date}`) ?? null,
            shiftTypeNameById,
            colorByText,
          ),
    ),
  }));

  return { headerRow, rows };
}

function buildCell(
  assignment: Assignment | null,
  shiftTypeNameById: Map<string, string>,
  colorByText: Map<string, string>,
): SheetCell {
  if (!assignment) {
    // 通常は発生しない（ソルバーが全従業員・全日付分のAssignmentを返す前提）が、
    // データ不整合時に表が壊れないよう空セルにフォールバックする。
    return { text: "", backgroundColor: "#FFFFFF" };
  }

  const text =
    assignment.kind === "shift"
      ? (shiftTypeNameById.get(assignment.shiftTypeId!) ?? "?")
      : assignment.kind === "requested_leave"
        ? "休"
        : "公休";

  return { text, backgroundColor: colorByText.get(text) ?? "#FFFFFF" };
}

function formatDateLabel(date: ISODate): string {
  const [, month, day] = date.split("-");
  const weekday = WEEKDAY_LABELS[getIsoWeekday(date) - 1];
  return `${Number(month)}/${Number(day)}(${weekday})`;
}
