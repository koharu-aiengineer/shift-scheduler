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
  // 設定されている場合、この勤務区分の必要人数・出勤人数は自分自身では持たず、
  // 参照先の勤務区分（親）の必要人数に合算されるサブ区分として扱われる
  // （例: 「早番パートバイト」→「早番」）。親を指す1段階のみを想定し、
  // 親自身がさらに別の親を持つ（2段階以上の連鎖）ことはUI側で許可しない。
  countsTowardShiftTypeId?: string | null;
  // trueの場合、平日（月〜金）に限り、同じグループ（合算先でまとめられた
  // メンバー同士）の中でこの勤務区分を優先的に埋めようとする（強制ではなく、
  // 足りない分は他メンバーで埋める）。土日は影響しない。
  weekdayPriority?: boolean;
};

export type EmploymentType = {
  id: string;
  name: string;
  maxWorkDaysPerWeek: number | null;
  maxWorkHoursPerWeek: number | null;
  maxConsecutiveWorkDays: number | null;
  forbiddenShiftTypeIds: string[]; // employment_type_shift_restrictions
  // 任意の月間目標時間。設定されている場合、この時間にまだ達していない
  // この雇用形態の従業員を、候補者の優先順位づけで他より優先する
  // （ハード制約ではなく、あくまで目標に近づけるための優先度）。
  targetMonthlyHours?: number | null;
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
  // 任意の上限人数。設定されている場合、必要人数を満たした上でまだ条件を
  // 満たす候補者が余っていれば、この人数までは追加で割り当ててよい
  // （週の需給按分が働いている週は対象外。greedy.ts参照）。
  // 日付別の上書き（overrides）には対応せず、常にこの値を上限とする。
  defaultMaxCount?: number | null;
  overrides: { date: ISODate; requiredCount: number }[];
};

// employment_type_shift_staffing_requirements（雇用形態×勤務区分ごとの必須最低人数）
export type EmploymentTypeMinStaffing = {
  employmentTypeId: string;
  shiftTypeId: string;
  minCount: number;
};

// employment_type_shift_staffing_requirements.max_count_weekend
// （雇用形態×勤務区分ごとの、土日限定の上限人数）。平日には適用しない。
export type EmploymentTypeWeekendMaxStaffing = {
  employmentTypeId: string;
  shiftTypeId: string;
  maxCount: number;
};

export type SolverInput = {
  periodStart: ISODate;
  periodEnd: ISODate;
  shiftTypes: ShiftType[];
  employmentTypes: EmploymentType[];
  employees: Employee[];
  staffingRequirements: StaffingRequirement[];
  employmentTypeMinStaffing: EmploymentTypeMinStaffing[];
  employmentTypeWeekendMaxStaffing?: EmploymentTypeWeekendMaxStaffing[];
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
