import type { createClient } from "@/lib/supabase/server";
import type {
  Employee,
  EmploymentType,
  EmploymentTypeMinStaffing,
  ISODate,
  ShiftType,
  StaffingRequirement,
  SolverInput,
} from "@/lib/shift-solver";
// 実行時に必要なインポートは、vitestがパスエイリアスを解決できないため
// （このファイルのテストは相対importで読み込む設計）相対パスで行う。
// 型のみのインポート（上のimport type）はビルド時に消えるため問題ない。
import { enumerateDates, getIsoWeekday } from "./shift-solver/dateUtils";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// ============================================================
// Supabaseの生の行データからshift-solverの型への純粋な変換関数群。
// DBアクセスを含まないため、モックデータだけで単体テストできる。
// ============================================================

export type ShiftTypeRow = {
  id: string;
  name: string;
  start_time: string; // "HH:MM:SS"（Postgresのtime型）
  end_time: string;
};

export function mapShiftTypes(rows: ShiftTypeRow[]): ShiftType[] {
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    startTime: toHHMM(row.start_time),
    endTime: toHHMM(row.end_time),
  }));
}

function toHHMM(dbTime: string): string {
  return dbTime.slice(0, 5);
}

export type EmploymentTypeRow = {
  id: string;
  name: string;
  employment_type_rules:
    | {
        max_work_days_per_week: number | null;
        max_work_hours_per_week: number | null;
        max_consecutive_work_days: number | null;
      }[]
    | { max_work_days_per_week: number | null; max_work_hours_per_week: number | null; max_consecutive_work_days: number | null }
    | null;
  employment_type_shift_restrictions: { shift_type_id: string }[];
  employment_type_shift_staffing_requirements: { shift_type_id: string; min_count: number }[];
};

export function mapEmploymentTypes(rows: EmploymentTypeRow[]): EmploymentType[] {
  return rows.map((row) => {
    const rule = Array.isArray(row.employment_type_rules)
      ? row.employment_type_rules[0]
      : row.employment_type_rules;

    return {
      id: row.id,
      name: row.name,
      maxWorkDaysPerWeek: rule?.max_work_days_per_week ?? null,
      maxWorkHoursPerWeek: rule?.max_work_hours_per_week ?? null,
      maxConsecutiveWorkDays: rule?.max_consecutive_work_days ?? null,
      forbiddenShiftTypeIds: (row.employment_type_shift_restrictions ?? []).map(
        (r) => r.shift_type_id,
      ),
    };
  });
}

export function mapEmploymentTypeMinStaffing(rows: EmploymentTypeRow[]): EmploymentTypeMinStaffing[] {
  return rows.flatMap((row) =>
    (row.employment_type_shift_staffing_requirements ?? []).map((requirement) => ({
      employmentTypeId: row.id,
      shiftTypeId: requirement.shift_type_id,
      minCount: requirement.min_count,
    })),
  );
}

export type EmployeeRow = {
  id: string;
  name: string;
  employment_type_id: string;
  employee_ng_weekdays: { weekday: number }[];
  employee_leave_requests: { requested_date: string }[];
};

// leave_requests・ng_weekdaysはDBから期間で絞り込まずに全件渡ってくる前提。
// 対象期間外の休み希望日はここで除外する（NG曜日は曜日そのものなので絞り込み不要）。
export function mapEmployees(
  rows: EmployeeRow[],
  periodStart: ISODate,
  periodEnd: ISODate,
): Employee[] {
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    employmentTypeId: row.employment_type_id,
    ngWeekdays: (row.employee_ng_weekdays ?? []).map((w) => w.weekday) as Employee["ngWeekdays"],
    leaveRequestDates: (row.employee_leave_requests ?? [])
      .map((r) => r.requested_date)
      .filter((date) => date >= periodStart && date <= periodEnd),
  }));
}

export type ClosedWeekdayRow = { weekday: number };
export type ClosedDateRow = { closed_date: string };

// 定休日（曜日）と特別休業日（特定日）を、対象期間内のISODate一覧に
// 変換する（重複除去・昇順ソート）。
export function mapClosedDates(
  closedWeekdayRows: ClosedWeekdayRow[],
  closedDateRows: ClosedDateRow[],
  periodStart: ISODate,
  periodEnd: ISODate,
): ISODate[] {
  const closedWeekdays = new Set(closedWeekdayRows.map((row) => row.weekday));
  const dates = enumerateDates(periodStart, periodEnd);

  const closedFromWeekdays = dates.filter(
    (date) => closedWeekdays.has(getIsoWeekday(date)),
  );
  const closedFromDates = closedDateRows
    .map((row) => row.closed_date)
    .filter((date) => date >= periodStart && date <= periodEnd);

  return [...new Set([...closedFromWeekdays, ...closedFromDates])].sort();
}

export type StaffingRequirementRow = {
  id: string; // shift_typeのid
  shift_staffing_requirements: { required_count: number }[] | { required_count: number } | null;
};

export type StaffingOverrideRow = {
  shift_type_id: string;
  target_date: string;
  required_count: number;
};

export function mapStaffingRequirements(
  shiftTypeRows: StaffingRequirementRow[],
  overrideRows: StaffingOverrideRow[],
): StaffingRequirement[] {
  const overridesByShiftType = new Map<string, { date: ISODate; requiredCount: number }[]>();
  for (const override of overrideRows) {
    const list = overridesByShiftType.get(override.shift_type_id) ?? [];
    list.push({ date: override.target_date, requiredCount: override.required_count });
    overridesByShiftType.set(override.shift_type_id, list);
  }

  return shiftTypeRows.map((row) => {
    const requirement = Array.isArray(row.shift_staffing_requirements)
      ? row.shift_staffing_requirements[0]
      : row.shift_staffing_requirements;

    return {
      shiftTypeId: row.id,
      defaultRequiredCount: requirement?.required_count ?? 0,
      overrides: overridesByShiftType.get(row.id) ?? [],
    };
  });
}

// ============================================================
// Supabaseへのアクセスを含む本体。上記の純粋関数を組み合わせて呼ぶだけで、
// クエリ自体はマスタ登録画面（shift-types/employment-types/leave-requests/
// staffing-requirements）と同じ埋め込みselectパターンに揃えている。
// ============================================================

export async function buildSolverInputForStore(
  supabase: SupabaseServerClient,
  storeId: string,
  periodStart: ISODate,
  periodEnd: ISODate,
): Promise<SolverInput> {
  const { data: shiftTypeRows, error: shiftTypesError } = await supabase
    .from("shift_types")
    .select("id, name, start_time, end_time, shift_staffing_requirements(required_count)")
    .eq("store_id", storeId)
    .order("start_time", { ascending: true });
  if (shiftTypesError) throw new Error(shiftTypesError.message);

  const shiftTypeIds = (shiftTypeRows ?? []).map((row) => row.id);

  const { data: overrideRows, error: overridesError } = shiftTypeIds.length
    ? await supabase
        .from("shift_staffing_overrides")
        .select("shift_type_id, target_date, required_count")
        .in("shift_type_id", shiftTypeIds)
        .gte("target_date", periodStart)
        .lte("target_date", periodEnd)
    : { data: [], error: null };
  if (overridesError) throw new Error(overridesError.message);

  const { data: employmentTypeRows, error: employmentTypesError } = await supabase
    .from("employment_types")
    .select(
      "id, name, employment_type_rules(max_work_days_per_week, max_work_hours_per_week, max_consecutive_work_days), employment_type_shift_restrictions(shift_type_id), employment_type_shift_staffing_requirements(shift_type_id, min_count)",
    )
    .eq("store_id", storeId);
  if (employmentTypesError) throw new Error(employmentTypesError.message);

  const { data: employeeRows, error: employeesError } = await supabase
    .from("employees")
    .select(
      "id, name, employment_type_id, employee_ng_weekdays(weekday), employee_leave_requests(requested_date)",
    )
    .eq("store_id", storeId);
  if (employeesError) throw new Error(employeesError.message);

  const { data: closedWeekdayRows, error: closedWeekdaysError } = await supabase
    .from("store_closed_weekdays")
    .select("weekday")
    .eq("store_id", storeId);
  if (closedWeekdaysError) throw new Error(closedWeekdaysError.message);

  const { data: closedDateRows, error: closedDatesError } = await supabase
    .from("store_closed_dates")
    .select("closed_date")
    .eq("store_id", storeId)
    .gte("closed_date", periodStart)
    .lte("closed_date", periodEnd);
  if (closedDatesError) throw new Error(closedDatesError.message);

  return {
    periodStart,
    periodEnd,
    shiftTypes: mapShiftTypes(shiftTypeRows ?? []),
    employmentTypes: mapEmploymentTypes((employmentTypeRows ?? []) as EmploymentTypeRow[]),
    employees: mapEmployees((employeeRows ?? []) as EmployeeRow[], periodStart, periodEnd),
    staffingRequirements: mapStaffingRequirements(shiftTypeRows ?? [], overrideRows ?? []),
    employmentTypeMinStaffing: mapEmploymentTypeMinStaffing(
      (employmentTypeRows ?? []) as EmploymentTypeRow[],
    ),
    closedDates: mapClosedDates(closedWeekdayRows ?? [], closedDateRows ?? [], periodStart, periodEnd),
  };
}
