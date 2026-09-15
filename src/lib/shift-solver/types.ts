// シフト自動生成ロジック（CSPソルバー）の型定義。
// このモジュール配下はSupabase/Next.jsから独立した純粋なTypeScriptとして実装する。
// DBの行データはAPI Route側でここに定義する型へ変換してから渡す。

export type ISODate = string; // "YYYY-MM-DD"
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7; // ISO8601: 1=月 ... 7=日

export type ShiftType = {
  id: string;
  name: string;
  startTime: string; // "HH:mm"
  endTime: string; // "HH:mm"（開始より前なら日をまたぐ勤務区分とみなす）
};

export type EmploymentType = {
  id: string;
  name: string;
  maxWorkDaysPerWeek: number | null;
  maxWorkHoursPerWeek: number | null;
  maxConsecutiveWorkDays: number | null;
  forbiddenShiftTypeIds: string[]; // employment_type_shift_restrictions
};

export type Employee = {
  id: string;
  name: string;
  employmentTypeId: string;
  ngWeekdays: Weekday[];
  leaveRequestDates: ISODate[]; // 本人が申請した休み希望日
};

// shift_staffing_requirements（デフォルト）+ shift_staffing_overrides（特定日上書き）
export type StaffingRequirement = {
  shiftTypeId: string;
  defaultRequiredCount: number;
  overrides: { date: ISODate; requiredCount: number }[];
};

// employment_type_shift_staffing_requirements（雇用形態×勤務区分ごとの必須最低人数）
export type EmploymentTypeMinStaffing = {
  employmentTypeId: string;
  shiftTypeId: string;
  minCount: number;
};

export type SolverInput = {
  periodStart: ISODate;
  periodEnd: ISODate;
  shiftTypes: ShiftType[];
  employmentTypes: EmploymentType[];
  employees: Employee[];
  staffingRequirements: StaffingRequirement[];
  employmentTypeMinStaffing: EmploymentTypeMinStaffing[];
  // 店舗の定休日・特別休業日（店舗設定画面で登録）。この日は曜日別デフォルトや
  // 特定日の必要人数上書きより優先して、全勤務区分の必要人数を0にする。
  closedDates?: ISODate[];
  randomSeed?: number; // 再生成ボタン用。省略時は都度ランダムなシードを使う
};

export type AssignmentKind =
  | "shift" // 出勤
  | "requested_leave" // 希望休（本人申請）
  | "system_assigned_leave"; // 自動割振休（システム割当）

export type Assignment = {
  date: ISODate;
  employeeId: string;
  kind: AssignmentKind;
  shiftTypeId: string | null; // kind === "shift" のときのみ値を持つ
};

export type ConstraintViolation = {
  severity: "hard" | "soft";
  type:
    | "understaffed" // 勤務区分の必要人数を満たせなかった
    | "employment_type_min_understaffed" // 雇用形態別必須人数を満たせなかった
    | "leave_request_not_honored" // 休み希望を守れなかった
    | "ng_weekday_not_honored"; // NG曜日を守れなかった
  date: ISODate | null;
  employeeId: string | null;
  shiftTypeId: string | null;
  message: string;
};

export type SolverOutput = {
  assignments: Assignment[];
  violations: ConstraintViolation[];
  fairnessScore: number; // 低いほど公平（勤務日数の分散などを合成）
};
