import { findUnmetEmploymentTypeMinStaffing, isLeaveRequested, isNgWeekday } from "./constraints";
import { enumerateDates } from "./dateUtils";
import { buildRequirementLookup, requirementKey, resolveRequirements } from "./resolveRequirements";
import type { Assignment, ConstraintViolation, SolverInput } from "./types";

// 最終的なassignmentsだけを入力として違反を再計算する。
// 貪欲法の構築過程で記録されたviolations（greedy.tsのGreedyResult.violations）は
// 局所探索が割当てを変更した後は実態とズレる可能性があるため使わず、
// 必ずこの関数で「今のassignments」から独立に導出する。
export function detectViolations(assignments: Assignment[], input: SolverInput): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];

  const employeeById = new Map(input.employees.map((employee) => [employee.id, employee]));
  const dates = enumerateDates(input.periodStart, input.periodEnd);
  const resolved = resolveRequirements(input.periodStart, input.periodEnd, input.staffingRequirements);
  const requirementLookup = buildRequirementLookup(resolved);

  // 休み希望・NG曜日はハード制約（ユーザー決定事項）。greedy.ts/localSearch.tsが
  // 候補から除外する形で守っているため通常は検出されないはずだが、
  // detectViolationsは最終assignmentsから独立に再計算する安全網という設計
  // （このファイル冒頭のコメント参照）のため、ここでも引き続きチェックする。
  for (const assignment of assignments) {
    if (assignment.kind !== "shift") continue;
    const employee = employeeById.get(assignment.employeeId);
    if (!employee) continue;

    if (isLeaveRequested(employee, assignment.date)) {
      violations.push({
        severity: "hard",
        type: "leave_request_not_honored",
        date: assignment.date,
        employeeId: employee.id,
        shiftTypeId: assignment.shiftTypeId,
        message: `${employee.name}の休み希望日（${assignment.date}）に勤務が割り当てられています。`,
      });
    }
    if (isNgWeekday(employee, assignment.date)) {
      violations.push({
        severity: "hard",
        type: "ng_weekday_not_honored",
        date: assignment.date,
        employeeId: employee.id,
        shiftTypeId: assignment.shiftTypeId,
        message: `${employee.name}のNG曜日（${assignment.date}）に勤務が割り当てられています。`,
      });
    }
  }

  // ハード違反: 日付×勤務区分ごとに、必要人数・雇用形態別必須人数の充足状況を集計し直す
  for (const date of dates) {
    for (const shiftType of input.shiftTypes) {
      const requiredCount = requirementLookup.get(requirementKey(date, shiftType.id)) ?? 0;
      if (requiredCount <= 0) continue;

      let totalCount = 0;
      const countsByEmploymentType = new Map<string, number>();
      for (const assignment of assignments) {
        if (assignment.date !== date || assignment.kind !== "shift" || assignment.shiftTypeId !== shiftType.id) {
          continue;
        }
        totalCount += 1;
        const employee = employeeById.get(assignment.employeeId);
        if (employee) {
          countsByEmploymentType.set(
            employee.employmentTypeId,
            (countsByEmploymentType.get(employee.employmentTypeId) ?? 0) + 1,
          );
        }
      }

      if (totalCount < requiredCount) {
        violations.push({
          severity: "hard",
          type: "understaffed",
          date,
          employeeId: null,
          shiftTypeId: shiftType.id,
          message: `${date}の${shiftType.name}で必要人数（${requiredCount}人）を満たせませんでした（不足${requiredCount - totalCount}人）。`,
        });
      }

      const unmet = findUnmetEmploymentTypeMinStaffing(shiftType.id, countsByEmploymentType, input.employmentTypeMinStaffing);
      for (const requirement of unmet) {
        const have = countsByEmploymentType.get(requirement.employmentTypeId) ?? 0;
        violations.push({
          severity: "hard",
          type: "employment_type_min_understaffed",
          date,
          employeeId: null,
          shiftTypeId: shiftType.id,
          message: `${date}の${shiftType.name}で雇用形態別必須人数（${requirement.minCount}人）を満たせませんでした（不足${requirement.minCount - have}人）。`,
        });
      }
    }
  }

  return violations;
}
