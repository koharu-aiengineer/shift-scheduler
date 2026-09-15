import {
  canAssignShift,
  computeShiftHours,
  isLeaveRequested,
  isNgWeekday,
  type EmployeeWorkStats,
} from "./constraints";
import { enumerateDates, getIsoWeekStart } from "./dateUtils";
import {
  buildRequirementLookup,
  requirementKey,
  resolveRequirements,
  type ResolvedRequirement,
} from "./resolveRequirements";
import type {
  Assignment,
  AssignmentKind,
  ConstraintViolation,
  Employee,
  EmploymentType,
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

// 従業員ごとの実行時状態。公平性の優先順位づけ（勤務日数）と、
// ハード制約判定用の勤務実績の両方をここで追跡する。
type EmployeeRuntimeState = {
  workDaysSoFar: number;
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

  // 週あたり合計必要人数が、雇用形態の週稼働日数上限の合計（週あたりの
  // 理論上の供給可能人日）を上回る週では、日付を暦順に埋めていくと
  // 週後半（実務上は土日になりやすい）に不足がしわ寄せされる。
  // そのような週だけ、各日・各勤務区分の「今日の目標人数」を、その時点で
  // 週に残っている供給・需要の比率で按分縮小し、不足を週全体に分散させる。
  // 固定比率ではなく「残り」を都度再計算するのは、ある日にNG曜日などで
  // 目標未達だった分を翌日以降の目標に回せるようにするため（固定比率だと、
  // 本来フルに埋まる日まで一律に縮小してしまい、枠を無駄にする）。
  // 従業員ごとの連勤上限・状態追跡には一切触れないため、既存のハード制約
  // 判定はそのまま安全に動く。
  const weeklyDemand = computeWeeklyDemand(resolved);
  const totalWeeklySupply = computeTotalWeeklySupply(input.employees, employmentTypeById);
  const weeklySupplyRemaining = new Map<ISODate, number>();
  const weeklyDemandRemaining = new Map<ISODate, number>();

  const state = new Map<string, EmployeeRuntimeState>(
    input.employees.map((employee) => [
      employee.id,
      {
        workDaysSoFar: 0,
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

  for (const date of dates) {
    const weekStart = getIsoWeekStart(date);
    if (!weeklySupplyRemaining.has(weekStart)) {
      weeklySupplyRemaining.set(weekStart, totalWeeklySupply);
      weeklyDemandRemaining.set(weekStart, weeklyDemand.get(weekStart) ?? 0);
    }
    const supplyRemaining = weeklySupplyRemaining.get(weekStart)!;
    const demandRemaining = weeklyDemandRemaining.get(weekStart)!;
    const fillRatio = demandRemaining <= 0 ? 1 : Math.max(0, Math.min(1, supplyRemaining / demandRemaining));

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

    // 休み希望日・NG曜日はハード制約（ユーザー決定事項）: この日に希望・NGが
    // ある従業員はそもそも候補から除外し、どんなに人手が足りなくても破らない。
    const isEligible = (employee: Employee, shiftTypeId: string): boolean => {
      if (assignedToday.has(employee.id)) return false;
      if (isLeaveRequested(employee, date) || isNgWeekday(employee, date)) return false;
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

    const orderCandidates = (pool: Employee[], shiftTypeId: string): Employee[] => {
      return pool.filter((employee) => isEligible(employee, shiftTypeId)).sort(compareByWorkDays);
    };

    const assign = (employee: Employee, shiftTypeId: string) => {
      assignedToday.add(employee.id);
      todayShiftByEmployee.set(employee.id, shiftTypeId);
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
        const minStaffingFloor = input.employmentTypeMinStaffing
          .filter((r) => r.shiftTypeId === shiftType.id)
          .reduce((sum, r) => sum + r.minCount, 0);
        // 週の需給が厳しい週だけ、今日の目標人数を按分縮小する（雇用形態別
        // 必須人数の下限は必ず下回らないようにする）。通常週はfillRatio=1のため
        // targetCount === requiredCountで、既存の挙動と変わらない。
        // 端数はMath.floorで切り捨てる: Σfloor(requiredCount_i × fillRatio) は
        // 常に週の供給量以下になることが数学的に保証される（Σ(x_i×r) = r×Σx_i =
        // 供給量になるため）。Math.roundやMath.ceilだと週の目標合計が供給量を
        // 超えたままになり得て、結局週の前半で供給を使い切り後半の曜日が
        // ゼロ人のまま、という元の問題を解消しきれない。
        const targetCount = Math.max(minStaffingFloor, Math.floor(requiredCount * fillRatio));
        const eligibleCount = input.employees.filter((e) => isEligible(e, shiftType.id)).length;
        return { shiftType, requiredCount, targetCount, slack: eligibleCount - targetCount };
      })
      .filter((entry) => entry.requiredCount > 0)
      .sort((a, b) => a.slack - b.slack);

    for (const { shiftType, requiredCount, targetCount } of shiftPlanForToday) {
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
          if (shortfall <= 0 || assignedCount >= targetCount) break;
          assign(candidate, shiftType.id);
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
      if (assignedCount < targetCount) {
        const ordered = orderCandidates(input.employees, shiftType.id);
        for (const candidate of ordered) {
          if (assignedCount >= targetCount) break;
          assign(candidate, shiftType.id);
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

    // 週の残り供給・残り需要を、今日実際に消費した分だけ減らす（固定比率ではなく
    // 「残り」を都度更新することで、今日目標未達だった分は翌日以降に回る）
    const todayDemand = shiftPlanForToday.reduce((sum, entry) => sum + entry.requiredCount, 0);
    weeklySupplyRemaining.set(weekStart, supplyRemaining - assignedToday.size);
    weeklyDemandRemaining.set(weekStart, demandRemaining - todayDemand);

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

// 週開始日（ISO週の月曜日）ごとの合計必要人数（週の需要合計）を返す。
function computeWeeklyDemand(resolved: ResolvedRequirement[]): Map<ISODate, number> {
  const weeklyDemand = new Map<ISODate, number>();
  for (const entry of resolved) {
    const weekStart = getIsoWeekStart(entry.date);
    weeklyDemand.set(weekStart, (weeklyDemand.get(weekStart) ?? 0) + entry.requiredCount);
  }
  return weeklyDemand;
}

// 雇用形態の週稼働日数上限を全従業員分合計した、週あたりの理論上の
// 供給可能人日（全週共通の定数）。週稼働日数上限が無い（null）従業員が
// 1人でもいれば、供給は事実上無制限（Infinity）とみなす。
function computeTotalWeeklySupply(
  employees: Employee[],
  employmentTypeById: Map<string, EmploymentType>,
): number {
  let totalWeeklySupply = 0;
  for (const employee of employees) {
    const cap = employmentTypeById.get(employee.employmentTypeId)?.maxWorkDaysPerWeek;
    if (cap == null) return Infinity;
    totalWeeklySupply += cap;
  }
  return totalWeeklySupply;
}
