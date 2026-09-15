import {
  computeShiftHours,
  findUnmetEmploymentTypeMinStaffing,
  isLeaveRequested,
  isNgWeekday,
  isShiftAllowedForEmploymentType,
} from "./constraints";
import { addDaysToDate, enumerateDates, getIsoWeekStart } from "./dateUtils";
import { computeFairnessScoreFromAssignments } from "./fairness";
import { createRandomGenerator, generateRandomSeed, randomInt } from "./random";
import type {
  Assignment,
  AssignmentKind,
  Employee,
  EmploymentType,
  EmploymentTypeMinStaffing,
  ISODate,
  ShiftType,
  SolverInput,
} from "./types";

export type LocalSearchOptions = {
  maxIterations?: number;
  randomSeed?: number;
};

type LocalSearchContext = {
  employeeById: Map<string, Employee>;
  employmentTypeById: Map<string, EmploymentType>;
  shiftTypeById: Map<string, ShiftType>;
  employmentTypeMinStaffing: EmploymentTypeMinStaffing[];
};

// 貪欲法の初期解を、同一日内の2者間スワップによる局所探索で改善する。
// スワップは「その日にどの勤務区分を何人にするか」という頭数を一切変えないため、
// understaffed（必要人数充足）はスワップによって壊れも直りもしない
// ——局所探索が扱うのはあくまで「誰が働くか」の入れ替えによる公平性の改善のみ。
// randomSeedを変えると探索の道筋が変わり、別の局所最適解（＝別パターン）に
// 収束するため、これが「再生成」ボタンの多様性の源になる。
export function runLocalSearch(
  input: SolverInput,
  initialAssignments: Assignment[],
  options: LocalSearchOptions = {},
): Assignment[] {
  const dates = enumerateDates(input.periodStart, input.periodEnd);
  if (input.employees.length < 2 || dates.length === 0) {
    return initialAssignments;
  }

  const context: LocalSearchContext = {
    employeeById: new Map(input.employees.map((e) => [e.id, e])),
    employmentTypeById: new Map(input.employmentTypes.map((et) => [et.id, et])),
    shiftTypeById: new Map(input.shiftTypes.map((st) => [st.id, st])),
    employmentTypeMinStaffing: input.employmentTypeMinStaffing,
  };

  const rng = createRandomGenerator(options.randomSeed ?? generateRandomSeed());
  const maxIterations =
    options.maxIterations ?? defaultMaxIterations(input.employees.length, dates.length);

  let assignments = initialAssignments.map((a) => ({ ...a }));
  let currentScore = computeFairnessScoreFromAssignments(assignments, input.employees);

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    const date = dates[randomInt(rng, dates.length)];
    const dayAssignments = assignments.filter((a) => a.date === date);
    if (dayAssignments.length < 2) continue;

    const indexA = randomInt(rng, dayAssignments.length);
    const indexB = randomInt(rng, dayAssignments.length);
    if (indexA === indexB) continue;
    const a = dayAssignments[indexA];
    const b = dayAssignments[indexB];

    // 休み同士の交換や、同じ勤務区分同士の交換は結果が変わらないためスキップ
    if (a.kind !== "shift" && b.kind !== "shift") continue;
    if (a.kind === "shift" && b.kind === "shift" && a.shiftTypeId === b.shiftTypeId) continue;

    const newA = buildSwappedAssignment(a.employeeId, date, b, context);
    const newB = buildSwappedAssignment(b.employeeId, date, a, context);

    if (!isChangeHardConstraintSafe(a.employeeId, date, newA, assignments, context)) continue;
    if (!isChangeHardConstraintSafe(b.employeeId, date, newB, assignments, context)) continue;

    const changes = [
      ...buildEmploymentTypeCountChanges(a, newA, context),
      ...buildEmploymentTypeCountChanges(b, newB, context),
    ];
    if (wouldBreakEmploymentTypeMinStaffing(date, changes, assignments, context)) continue;

    const candidateAssignments = assignments.map((assignment) => {
      if (assignment === a) return { date, employeeId: a.employeeId, kind: newA.kind, shiftTypeId: newA.shiftTypeId };
      if (assignment === b) return { date, employeeId: b.employeeId, kind: newB.kind, shiftTypeId: newB.shiftTypeId };
      return assignment;
    });

    const candidateScore = computeFairnessScoreFromAssignments(candidateAssignments, input.employees);
    const delta = candidateScore - currentScore;
    const temperature = Math.max(1 - iteration / maxIterations, 0.01);
    const accept = delta <= 0 || rng() < Math.exp(-delta / temperature);

    if (accept) {
      assignments = candidateAssignments;
      currentScore = candidateScore;
    }
  }

  return assignments;
}

function defaultMaxIterations(employeeCount: number, dateCount: number): number {
  return Math.min(5000, Math.max(200, employeeCount * dateCount * 5));
}

// 相手側(other)の役割をそのまま受け継いだ、新しい割当て内容を組み立てる
function buildSwappedAssignment(
  employeeId: string,
  date: ISODate,
  other: Assignment,
  context: LocalSearchContext,
): { kind: AssignmentKind; shiftTypeId: string | null } {
  if (other.kind === "shift") {
    return { kind: "shift", shiftTypeId: other.shiftTypeId };
  }
  const employee = context.employeeById.get(employeeId)!;
  const kind: AssignmentKind = isLeaveRequested(employee, date)
    ? "requested_leave"
    : "system_assigned_leave";
  return { kind, shiftTypeId: null };
}

// このスワップが従業員個人のハード制約（休み希望・NG曜日・雇用形態の禁止
// 勤務区分・連勤上限・週あたり勤務日数/時間上限）を壊さないかを判定する。
// 休みへの変更はハード制約を壊しようがないため常に安全。
function isChangeHardConstraintSafe(
  employeeId: string,
  date: ISODate,
  newAssignment: { kind: AssignmentKind; shiftTypeId: string | null },
  assignments: Assignment[],
  context: LocalSearchContext,
): boolean {
  if (newAssignment.kind !== "shift") return true;

  const employee = context.employeeById.get(employeeId);
  const employmentType = employee ? context.employmentTypeById.get(employee.employmentTypeId) : undefined;
  const shiftType = context.shiftTypeById.get(newAssignment.shiftTypeId!);
  if (!employee || !employmentType || !shiftType) return false;

  if (isLeaveRequested(employee, date) || isNgWeekday(employee, date)) return false;

  if (!isShiftAllowedForEmploymentType(employmentType, shiftType.id)) return false;

  if (
    wouldExceedConsecutiveWorkDaysAfterChange(
      employeeId,
      date,
      employmentType.maxConsecutiveWorkDays,
      assignments,
    )
  ) {
    return false;
  }

  if (
    wouldExceedWeeklyLimitsAfterChange(
      employeeId,
      date,
      newAssignment.shiftTypeId,
      employmentType,
      assignments,
      context.shiftTypeById,
    )
  ) {
    return false;
  }

  return true;
}

// 局所探索は既に完成した全期間のスケジュールを扱うため、貪欲法と違い
// 対象日より後ろの連勤にも影響しうる。前後両方向に連続日数を数える。
function wouldExceedConsecutiveWorkDaysAfterChange(
  employeeId: string,
  date: ISODate,
  maxConsecutiveWorkDays: number | null,
  assignments: Assignment[],
): boolean {
  if (maxConsecutiveWorkDays == null) return false;

  const shiftDatesByEmployee = new Set(
    assignments
      .filter((a) => a.employeeId === employeeId && a.date !== date && a.kind === "shift")
      .map((a) => a.date),
  );

  let streak = 1; // date自身
  let cursor = addDaysToDate(date, -1);
  while (shiftDatesByEmployee.has(cursor)) {
    streak += 1;
    cursor = addDaysToDate(cursor, -1);
  }
  cursor = addDaysToDate(date, 1);
  while (shiftDatesByEmployee.has(cursor)) {
    streak += 1;
    cursor = addDaysToDate(cursor, 1);
  }

  return streak > maxConsecutiveWorkDays;
}

function wouldExceedWeeklyLimitsAfterChange(
  employeeId: string,
  date: ISODate,
  newShiftTypeId: string | null,
  employmentType: EmploymentType,
  assignments: Assignment[],
  shiftTypeById: Map<string, ShiftType>,
): boolean {
  if (employmentType.maxWorkDaysPerWeek == null && employmentType.maxWorkHoursPerWeek == null) {
    return false;
  }

  const weekStart = getIsoWeekStart(date);
  let days = 0;
  let hours = 0;
  for (const assignment of assignments) {
    if (assignment.employeeId !== employeeId) continue;
    if (assignment.date === date) continue; // dateの新しい値は後で加える
    if (assignment.kind !== "shift") continue;
    if (getIsoWeekStart(assignment.date) !== weekStart) continue;
    days += 1;
    const shiftType = shiftTypeById.get(assignment.shiftTypeId!);
    if (shiftType) hours += computeShiftHours(shiftType);
  }

  if (newShiftTypeId) {
    days += 1;
    const shiftType = shiftTypeById.get(newShiftTypeId);
    if (shiftType) hours += computeShiftHours(shiftType);
  }

  if (employmentType.maxWorkDaysPerWeek != null && days > employmentType.maxWorkDaysPerWeek) {
    return true;
  }
  if (employmentType.maxWorkHoursPerWeek != null && hours > employmentType.maxWorkHoursPerWeek) {
    return true;
  }
  return false;
}

type EmploymentTypeCountChange = { shiftTypeId: string; employmentTypeId: string; delta: 1 | -1 };

function buildEmploymentTypeCountChanges(
  before: Assignment,
  after: { kind: AssignmentKind; shiftTypeId: string | null },
  context: LocalSearchContext,
): EmploymentTypeCountChange[] {
  const employee = context.employeeById.get(before.employeeId);
  if (!employee) return [];

  const changes: EmploymentTypeCountChange[] = [];
  if (before.kind === "shift") {
    changes.push({ shiftTypeId: before.shiftTypeId!, employmentTypeId: employee.employmentTypeId, delta: -1 });
  }
  if (after.kind === "shift") {
    changes.push({ shiftTypeId: after.shiftTypeId!, employmentTypeId: employee.employmentTypeId, delta: 1 });
  }
  return changes;
}

// スワップ後の勤務区分ごとの雇用形態別人数が、必須最低人数
// （employment_type_shift_staffing_requirements）を下回らないかを確認する。
function wouldBreakEmploymentTypeMinStaffing(
  date: ISODate,
  changes: EmploymentTypeCountChange[],
  assignments: Assignment[],
  context: LocalSearchContext,
): boolean {
  const affectedShiftTypeIds = [...new Set(changes.map((c) => c.shiftTypeId))];

  for (const shiftTypeId of affectedShiftTypeIds) {
    const counts = new Map<string, number>();
    for (const assignment of assignments) {
      if (assignment.date !== date || assignment.kind !== "shift" || assignment.shiftTypeId !== shiftTypeId) {
        continue;
      }
      const employee = context.employeeById.get(assignment.employeeId);
      if (!employee) continue;
      counts.set(employee.employmentTypeId, (counts.get(employee.employmentTypeId) ?? 0) + 1);
    }

    for (const change of changes) {
      if (change.shiftTypeId !== shiftTypeId) continue;
      counts.set(change.employmentTypeId, (counts.get(change.employmentTypeId) ?? 0) + change.delta);
    }

    const unmet = findUnmetEmploymentTypeMinStaffing(
      shiftTypeId,
      counts,
      context.employmentTypeMinStaffing,
    );
    if (unmet.length > 0) return true;
  }

  return false;
}
