import {
  buildShiftTypeGroups,
  findUnmetEmploymentTypeMinStaffing,
  isLeaveRequested,
  isNgWeekday,
} from "./constraints";
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
  const resolved = resolveRequirements(
    input.periodStart,
    input.periodEnd,
    input.staffingRequirements,
    input.closedDates,
  );
  const requirementLookup = buildRequirementLookup(resolved);
  const shiftTypeGroups = buildShiftTypeGroups(input.shiftTypes);

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

  // ハード違反: 日付×勤務区分ごとに、必要人数・雇用形態別必須人数の充足状況を集計し直す。
  // 必要人数（understaffed）は合算先（counts_toward_shift_type_id）を踏まえ、
  // グループ（親＋サブ区分）単位の合計人数で判定する。雇用形態別必須人数は
  // 個別の勤務区分に紐づく要件のため、これまでどおり勤務区分単位で判定する。
  for (const date of dates) {
    // その日、グループ（親＋サブ区分）の必要人数が0（店舗の定休日・特別休業日や、
    // 単にその勤務区分が不要な日）であれば、そのグループの全メンバーについて
    // 必要人数チェック・雇用形態別必須人数チェックの両方をスキップする。
    // 必要人数が0の日はそもそも誰も出勤を期待されていないため。
    const activeShiftTypeIds = new Set<string>();

    for (const group of shiftTypeGroups) {
      const rootId = group.members[0].id;
      const requiredCount = requirementLookup.get(requirementKey(date, rootId)) ?? 0;
      if (requiredCount <= 0) continue;
      for (const member of group.members) activeShiftTypeIds.add(member.id);

      const memberIds = new Set(group.members.map((m) => m.id));
      let totalCount = 0;
      for (const assignment of assignments) {
        if (
          assignment.date !== date ||
          assignment.kind !== "shift" ||
          !assignment.shiftTypeId ||
          !memberIds.has(assignment.shiftTypeId)
        ) {
          continue;
        }
        totalCount += 1;
      }

      if (totalCount < requiredCount) {
        const groupLabel = group.members.map((m) => m.name).join("・");
        violations.push({
          severity: "hard",
          type: "understaffed",
          date,
          employeeId: null,
          shiftTypeId: rootId,
          message: `${date}の${groupLabel}で必要人数（${requiredCount}人）を満たせませんでした（不足${requiredCount - totalCount}人）。`,
        });
      }
    }

    for (const shiftType of input.shiftTypes) {
      if (!activeShiftTypeIds.has(shiftType.id)) continue;
      const countsByEmploymentType = new Map<string, number>();
      for (const assignment of assignments) {
        if (assignment.date !== date || assignment.kind !== "shift" || assignment.shiftTypeId !== shiftType.id) {
          continue;
        }
        const employee = employeeById.get(assignment.employeeId);
        if (employee) {
          countsByEmploymentType.set(
            employee.employmentTypeId,
            (countsByEmploymentType.get(employee.employmentTypeId) ?? 0) + 1,
          );
        }
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
