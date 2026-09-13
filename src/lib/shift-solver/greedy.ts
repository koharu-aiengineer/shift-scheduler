import {
  canAssignShift,
  computeShiftHours,
  isLeaveRequested,
  isNgWeekday,
  type EmployeeWorkStats,
} from "./constraints";
import { enumerateDates, getIsoWeekStart } from "./dateUtils";
import { buildRequirementLookup, requirementKey, resolveRequirements } from "./resolveRequirements";
import type {
  Assignment,
  AssignmentKind,
  ConstraintViolation,
  Employee,
  ISODate,
  SolverInput,
} from "./types";

export type GreedyResult = {
  assignments: Assignment[];
  // 貪欲法の構築過程で記録したスナップショット。局所探索（localSearch.ts）が
  // 後で割当てを変更すると実態とズレるため、SolverOutputにはこれを使わず、
  // generateShift.tsが局所探索後の最終的なassignmentsに対して
  // detectViolations（detectViolations.ts）で独立に再計算したものを使う。
  violations: ConstraintViolation[];
};

// 従業員ごとの実行時状態。公平性の優先順位づけ（勤務日数・休み希望を
// 破られた回数）と、ハード制約判定用の勤務実績の両方をここで追跡する。
type EmployeeRuntimeState = {
  workDaysSoFar: number;
  softBreakCount: number; // 休み希望・NG曜日を破られた回数（優先順位の二次キー）
  consecutiveWorkDays: number; // 直前の日までの連続勤務日数
  currentWeekStart: ISODate | null;
  workDaysThisWeek: number;
  workHoursThisWeek: number;
};

// 貪欲法で初期解を構築する。randomSeedは局所探索（localSearch.ts）側で
// パターンの多様性を出すために使う想定で、この段階では意図的に決定的にしている。
export function buildGreedySolution(input: SolverInput): GreedyResult {
  const employmentTypeById = new Map(input.employmentTypes.map((et) => [et.id, et]));
  const shiftTypeById = new Map(input.shiftTypes.map((st) => [st.id, st]));
  const dates = enumerateDates(input.periodStart, input.periodEnd);

  const resolved = resolveRequirements(input.periodStart, input.periodEnd, input.staffingRequirements);
  const requirementLookup = buildRequirementLookup(resolved);

  const state = new Map<string, EmployeeRuntimeState>(
    input.employees.map((employee) => [
      employee.id,
      {
        workDaysSoFar: 0,
        softBreakCount: 0,
        consecutiveWorkDays: 0,
        currentWeekStart: null,
        workDaysThisWeek: 0,
        workHoursThisWeek: 0,
      },
    ]),
  );

  const assignments: Assignment[] = [];
  const violations: ConstraintViolation[] = [];

  const compareByWorkDays = (a: Employee, b: Employee): number => {
    const diff = state.get(a.id)!.workDaysSoFar - state.get(b.id)!.workDaysSoFar;
    return diff !== 0 ? diff : a.id.localeCompare(b.id);
  };

  const compareByBreakPriority = (a: Employee, b: Employee): number => {
    const sa = state.get(a.id)!;
    const sb = state.get(b.id)!;
    if (sa.workDaysSoFar !== sb.workDaysSoFar) return sa.workDaysSoFar - sb.workDaysSoFar;
    if (sa.softBreakCount !== sb.softBreakCount) return sa.softBreakCount - sb.softBreakCount;
    return a.id.localeCompare(b.id);
  };

  for (const date of dates) {
    const weekStart = getIsoWeekStart(date);
    for (const employee of input.employees) {
      const s = state.get(employee.id)!;
      if (s.currentWeekStart !== weekStart) {
        s.currentWeekStart = weekStart;
        s.workDaysThisWeek = 0;
        s.workHoursThisWeek = 0;
      }
    }

    const assignedToday = new Set<string>();
    const todayShiftByEmployee = new Map<string, string>();

    const isEligible = (employee: Employee, shiftTypeId: string): boolean => {
      if (assignedToday.has(employee.id)) return false;
      const employmentType = employmentTypeById.get(employee.employmentTypeId);
      const shiftType = shiftTypeById.get(shiftTypeId);
      if (!employmentType || !shiftType) return false;
      const s = state.get(employee.id)!;
      const stats: EmployeeWorkStats = {
        consecutiveWorkDaysBeforeDate: s.consecutiveWorkDays,
        workDaysThisWeek: s.workDaysThisWeek,
        workHoursThisWeek: s.workHoursThisWeek,
      };
      return canAssignShift(employmentType, shiftType, stats);
    };

    // 候補プールを「希望を破らない人」「破ることになる人」に分け、
    // それぞれ優先順位でソートして連結する（破らない人を必ず先に検討する）
    const orderCandidates = (pool: Employee[], shiftTypeId: string): Employee[] => {
      const preferred: Employee[] = [];
      const violating: Employee[] = [];
      for (const employee of pool) {
        if (!isEligible(employee, shiftTypeId)) continue;
        if (isLeaveRequested(employee, date) || isNgWeekday(employee, date)) {
          violating.push(employee);
        } else {
          preferred.push(employee);
        }
      }
      preferred.sort(compareByWorkDays);
      violating.sort(compareByBreakPriority);
      return [...preferred, ...violating];
    };

    const assign = (employee: Employee, shiftTypeId: string, shiftTypeName: string) => {
      assignedToday.add(employee.id);
      todayShiftByEmployee.set(employee.id, shiftTypeId);

      const brokeLeave = isLeaveRequested(employee, date);
      const brokeNg = isNgWeekday(employee, date);
      if (brokeLeave || brokeNg) {
        state.get(employee.id)!.softBreakCount += 1;
      }
      if (brokeLeave) {
        violations.push({
          severity: "soft",
          type: "leave_request_not_honored",
          date,
          employeeId: employee.id,
          shiftTypeId,
          message: `${employee.name}の休み希望日（${date}）に${shiftTypeName}を割り当てました。`,
        });
      }
      if (brokeNg) {
        violations.push({
          severity: "soft",
          type: "ng_weekday_not_honored",
          date,
          employeeId: employee.id,
          shiftTypeId,
          message: `${employee.name}のNG曜日（${date}）に${shiftTypeName}を割り当てました。`,
        });
      }

      assignments.push({ date, employeeId: employee.id, kind: "shift", shiftTypeId });
    };

    // 最制約優先（fail-first）: 必要人数に対して候補者に余裕がない勤務区分
    // （ハード制約を満たせる候補者数 - 必要人数、が小さいもの）から処理する。
    // 「配列の後ろにある勤務区分ほど構造的に人員を使い切られやすい」という
    // 処理順バイアスを避けるための並べ替えで、この時点ではまだ誰も
    // 割り当てていないためisEligibleは全員分フラットに評価できる。
    const shiftPlanForToday = input.shiftTypes
      .map((shiftType) => {
        const requiredCount = requirementLookup.get(requirementKey(date, shiftType.id)) ?? 0;
        const eligibleCount = input.employees.filter((e) => isEligible(e, shiftType.id)).length;
        return { shiftType, requiredCount, slack: eligibleCount - requiredCount };
      })
      .filter((entry) => entry.requiredCount > 0)
      .sort((a, b) => a.slack - b.slack);

    for (const { shiftType, requiredCount } of shiftPlanForToday) {
      const minStaffingForShift = input.employmentTypeMinStaffing.filter(
        (r) => r.shiftTypeId === shiftType.id,
      );
      const assignedCountByEmploymentType = new Map<string, number>();
      let assignedCount = 0;

      // Step1: 雇用形態別必須人数を優先充足
      for (const requirement of minStaffingForShift) {
        let shortfall = requirement.minCount - (assignedCountByEmploymentType.get(requirement.employmentTypeId) ?? 0);
        if (shortfall <= 0) continue;

        const pool = input.employees.filter((e) => e.employmentTypeId === requirement.employmentTypeId);
        const ordered = orderCandidates(pool, shiftType.id);
        for (const candidate of ordered) {
          if (shortfall <= 0 || assignedCount >= requiredCount) break;
          assign(candidate, shiftType.id, shiftType.name);
          assignedCountByEmploymentType.set(
            requirement.employmentTypeId,
            (assignedCountByEmploymentType.get(requirement.employmentTypeId) ?? 0) + 1,
          );
          assignedCount += 1;
          shortfall -= 1;
        }

        if (shortfall > 0) {
          violations.push({
            severity: "hard",
            type: "employment_type_min_understaffed",
            date,
            employeeId: null,
            shiftTypeId: shiftType.id,
            message: `${date}の${shiftType.name}で雇用形態別必須人数（${requirement.minCount}人）を満たせませんでした（不足${shortfall}人）。`,
          });
        }
      }

      // Step2: 残りの必要人数を全体から充足
      if (assignedCount < requiredCount) {
        const ordered = orderCandidates(input.employees, shiftType.id);
        for (const candidate of ordered) {
          if (assignedCount >= requiredCount) break;
          assign(candidate, shiftType.id, shiftType.name);
          assignedCount += 1;
        }
      }

      if (assignedCount < requiredCount) {
        violations.push({
          severity: "hard",
          type: "understaffed",
          date,
          employeeId: null,
          shiftTypeId: shiftType.id,
          message: `${date}の${shiftType.name}で必要人数（${requiredCount}人）を満たせませんでした（不足${requiredCount - assignedCount}人）。`,
        });
      }
    }

    // 出勤しなかった従業員の休み区分を確定し、勤務実績カウンタを更新する
    for (const employee of input.employees) {
      const s = state.get(employee.id)!;
      const shiftTypeId = todayShiftByEmployee.get(employee.id);

      if (shiftTypeId) {
        const shiftType = shiftTypeById.get(shiftTypeId)!;
        s.workDaysSoFar += 1;
        s.workDaysThisWeek += 1;
        s.workHoursThisWeek += computeShiftHours(shiftType);
        s.consecutiveWorkDays += 1;
      } else {
        s.consecutiveWorkDays = 0;
        const kind: AssignmentKind = isLeaveRequested(employee, date)
          ? "requested_leave"
          : "system_assigned_leave";
        assignments.push({ date, employeeId: employee.id, kind, shiftTypeId: null });
      }
    }
  }

  return { assignments, violations };
}
