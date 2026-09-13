import { isLeaveRequested, isNgWeekday } from "./constraints";
import type { Assignment, ConstraintViolation, Employee } from "./types";

export type FairnessWeights = {
  workDaysVarianceWeight: number;
  softViolationWeight: number;
};

// 「勤務日数の均等さを最優先、休み希望・NG曜日の充足はその次」という方針
// （ユーザー決定事項）に沿って、分散側の重みを十分大きくしている。
export const DEFAULT_FAIRNESS_WEIGHTS: FairnessWeights = {
  workDaysVarianceWeight: 1,
  softViolationWeight: 0.01,
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
export function computeFairnessScore(
  assignments: Assignment[],
  employees: Employee[],
  violations: ConstraintViolation[],
  weights: FairnessWeights = DEFAULT_FAIRNESS_WEIGHTS,
): number {
  const workDays = [...computeWorkDaysByEmployee(assignments, employees).values()];
  const variance = computeVariance(workDays);
  const softViolationCount = countSoftViolations(violations);

  return (
    variance * weights.workDaysVarianceWeight + softViolationCount * weights.softViolationWeight
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
  weights: FairnessWeights = DEFAULT_FAIRNESS_WEIGHTS,
): number {
  const workDays = [...computeWorkDaysByEmployee(assignments, employees).values()];
  const variance = computeVariance(workDays);
  const softBreakCount = countSoftBreaksInAssignments(assignments, employees);

  return (
    variance * weights.workDaysVarianceWeight + softBreakCount * weights.softViolationWeight
  );
}
