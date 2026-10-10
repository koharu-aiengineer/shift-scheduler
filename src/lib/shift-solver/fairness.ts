import { computeShiftHours, isLeaveRequested, isNgWeekday } from "./constraints";
import type { Assignment, ConstraintViolation, Employee, EmploymentType, ShiftType } from "./types";

export type FairnessWeights = {
  workDaysVarianceWeight: number;
  softViolationWeight: number;
  // 雇用形態に月間目標時間が設定されている従業員（例: 社員）の、目標時間への
  // 不足合計（時間）にかける重み。局所探索（localSearch.ts）のスワップが、
  // 貪欲法（greedy.ts）が優先的に割り当てた目標未達の候補者を、勤務日数の
  // 均等さだけを理由に押し出してしまわないようにするためのもの。
  targetHoursDeficitWeight: number;
};

// 休み希望・NG曜日は現在ハード制約（greedy.ts/localSearch.tsが候補から
// 除外する形で必ず守る）のため、softViolationWeightが実際に効くのは理論上
// 発生しないはずのケースの安全網のみ。勤務日数の均等さ（variance）が
// スコアの主要な要素になる。
// targetHoursDeficitWeightの0.05という値は、1回のスワップで動く時間
// （1勤務あたり数時間〜9時間程度）による不足合計の変化を、勤務日数の
// 分散の変化（1回のスワップで概ね1未満）と同程度のオーダーにするための
// 目安であり、厳密な理論値ではない。
export const DEFAULT_FAIRNESS_WEIGHTS: FairnessWeights = {
  workDaysVarianceWeight: 1,
  softViolationWeight: 0.01,
  targetHoursDeficitWeight: 0.05,
};

// 従業員ごとの出勤日数（kind === "shift" の件数）を集計する。
// 一度も出勤しない従業員も0件として含める。
export function computeWorkDaysByEmployee(
  assignments: Assignment[],
  employees: Employee[],
): Map<string, number> {
  const counts = new Map<string, number>(employees.map((employee) => [employee.id, 0]));
  for (const assignment of assignments) {
    if (assignment.kind !== "shift") continue;
    counts.set(assignment.employeeId, (counts.get(assignment.employeeId) ?? 0) + 1);
  }
  return counts;
}

// 従業員ごとの合計勤務時間を集計する。shiftTypeByIdに無い勤務区分IDは
// （データ不整合時のフォールバックとして）0時間扱いで無視する。
export function computeWorkHoursByEmployee(
  assignments: Assignment[],
  employees: Employee[],
  shiftTypeById: Map<string, ShiftType>,
): Map<string, number> {
  const hours = new Map<string, number>(employees.map((employee) => [employee.id, 0]));
  for (const assignment of assignments) {
    if (assignment.kind !== "shift" || !assignment.shiftTypeId) continue;
    const shiftType = shiftTypeById.get(assignment.shiftTypeId);
    if (!shiftType) continue;
    hours.set(assignment.employeeId, (hours.get(assignment.employeeId) ?? 0) + computeShiftHours(shiftType));
  }
  return hours;
}

// 雇用形態に月間目標時間が設定されている従業員について、目標に対する不足
// 時間（達していれば0）を合計する。目標未設定の雇用形態は対象外。
export function computeTargetHoursDeficitTotal(
  assignments: Assignment[],
  employees: Employee[],
  employmentTypeById: Map<string, EmploymentType>,
  shiftTypeById: Map<string, ShiftType>,
): number {
  const hoursByEmployee = computeWorkHoursByEmployee(assignments, employees, shiftTypeById);
  let total = 0;
  for (const employee of employees) {
    const target = employmentTypeById.get(employee.employmentTypeId)?.targetMonthlyHours ?? null;
    if (target == null) continue;
    const hours = hoursByEmployee.get(employee.id) ?? 0;
    total += Math.max(0, target - hours);
  }
  return total;
}

export function computeVariance(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const squaredDiffs = values.map((value) => (value - mean) ** 2);
  return squaredDiffs.reduce((sum, value) => sum + value, 0) / values.length;
}

export function countSoftViolations(violations: ConstraintViolation[]): number {
  return violations.filter((violation) => violation.severity === "soft").length;
}

// 低いほど公平・良い解であることを表す単一スコア。局所探索（localSearch.ts）が
// 近傍解を採用するかどうかの判定に使う。
// employmentTypeById/shiftTypeByIdを省略した場合（呼び出し側が持っていない
// 場面や既存テストとの互換性のため）、月間目標時間の不足はスコアに影響しない
// （＝targetHoursDeficitTotalが常に0になる）。
export function computeFairnessScore(
  assignments: Assignment[],
  employees: Employee[],
  violations: ConstraintViolation[],
  employmentTypeById: Map<string, EmploymentType> = new Map(),
  shiftTypeById: Map<string, ShiftType> = new Map(),
  weights: FairnessWeights = DEFAULT_FAIRNESS_WEIGHTS,
): number {
  const workDays = [...computeWorkDaysByEmployee(assignments, employees).values()];
  const variance = computeVariance(workDays);
  const softViolationCount = countSoftViolations(violations);
  const targetHoursDeficitTotal = computeTargetHoursDeficitTotal(
    assignments,
    employees,
    employmentTypeById,
    shiftTypeById,
  );

  return (
    variance * weights.workDaysVarianceWeight +
    softViolationCount * weights.softViolationWeight +
    targetHoursDeficitTotal * weights.targetHoursDeficitWeight
  );
}

// assignmentsから直接、休み希望・NG曜日を破った件数を数える（違反オブジェクトを
// 都度組み立てないための軽量版）。局所探索の反復のように大量に呼ばれる場面で使う。
export function countSoftBreaksInAssignments(
  assignments: Assignment[],
  employees: Employee[],
): number {
  const employeeById = new Map(employees.map((employee) => [employee.id, employee]));
  let count = 0;
  for (const assignment of assignments) {
    if (assignment.kind !== "shift") continue;
    const employee = employeeById.get(assignment.employeeId);
    if (!employee) continue;
    if (isLeaveRequested(employee, assignment.date) || isNgWeekday(employee, assignment.date)) {
      count += 1;
    }
  }
  return count;
}

// computeFairnessScoreのassignments直接版。局所探索のホットループ用。
export function computeFairnessScoreFromAssignments(
  assignments: Assignment[],
  employees: Employee[],
  employmentTypeById: Map<string, EmploymentType> = new Map(),
  shiftTypeById: Map<string, ShiftType> = new Map(),
  weights: FairnessWeights = DEFAULT_FAIRNESS_WEIGHTS,
): number {
  const workDays = [...computeWorkDaysByEmployee(assignments, employees).values()];
  const variance = computeVariance(workDays);
  const softBreakCount = countSoftBreaksInAssignments(assignments, employees);
  const targetHoursDeficitTotal = computeTargetHoursDeficitTotal(
    assignments,
    employees,
    employmentTypeById,
    shiftTypeById,
  );

  return (
    variance * weights.workDaysVarianceWeight +
    softBreakCount * weights.softViolationWeight +
    targetHoursDeficitTotal * weights.targetHoursDeficitWeight
  );
}
