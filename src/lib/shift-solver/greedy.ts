import {
  buildShiftTypeGroups,
  canAssignShift,
  computeShiftHours,
  isLeaveRequested,
  isNgWeekday,
  type EmployeeWorkStats,
} from "./constraints";
import { enumerateDates, getIsoWeekday, getIsoWeekStart } from "./dateUtils";
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
  workHoursSoFar: number; // 週でリセットしない、期間全体の累計時間（月間目標時間の優先順位づけに使う）
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
  const shiftTypeGroups = buildShiftTypeGroups(input.shiftTypes);
  const dates = enumerateDates(input.periodStart, input.periodEnd);

  const resolved = resolveRequirements(
    input.periodStart,
    input.periodEnd,
    input.staffingRequirements,
    input.closedDates,
  );
  const requirementLookup = buildRequirementLookup(resolved);
  // 上限人数は日付別の上書きを持たない（常にこの値が上限）。未設定（null/undefined）
  // なら上限なし＝従来どおり必要人数ちょうどまでしか埋めない。
  const maxCountByShiftTypeId = new Map(
    input.staffingRequirements.map((r) => [r.shiftTypeId, r.defaultMaxCount ?? null]),
  );
  // 雇用形態×勤務区分ごとの、土日限定の上限人数（ハード制約）。平日は対象外。
  const weekendMaxByEmploymentTypeShift = new Map(
    (input.employmentTypeWeekendMaxStaffing ?? []).map((r) => [
      `${r.employmentTypeId}#${r.shiftTypeId}`,
      r.maxCount,
    ]),
  );

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
        workHoursSoFar: 0,
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

  // 雇用形態に月間目標時間（任意）が設定されている場合、その時間にまだ
  // 達していない従業員を他より優先して割り当てる（強制ではなく優先度づけ）。
  // 目標に達している／目標未設定の従業員同士は、従来どおり勤務日数の
  // 公平性（compareByWorkDays）でタイブレークする。
  const compareForFairness = (a: Employee, b: Employee): number => {
    const targetA = employmentTypeById.get(a.employmentTypeId)?.targetMonthlyHours ?? null;
    const targetB = employmentTypeById.get(b.employmentTypeId)?.targetMonthlyHours ?? null;
    const hoursA = state.get(a.id)!.workHoursSoFar;
    const hoursB = state.get(b.id)!.workHoursSoFar;
    const belowTargetA = targetA != null && hoursA < targetA;
    const belowTargetB = targetB != null && hoursB < targetB;

    if (belowTargetA !== belowTargetB) {
      return belowTargetA ? -1 : 1;
    }
    if (belowTargetA && belowTargetB) {
      const deficitA = targetA! - hoursA;
      const deficitB = targetB! - hoursB;
      if (deficitA !== deficitB) return deficitB - deficitA;
    }
    return compareByWorkDays(a, b);
  };

  for (const date of dates) {
    const isWeekday = getIsoWeekday(date) <= 5; // ISO: 1=月...5=金
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
    // 土日限定の雇用形態別上限人数を、その日実際に使った分だけ消費していく
    // カウンタ（日ごとにリセットする）。
    const weekendAssignedCountByEmploymentTypeShift = new Map<string, number>();

    // 休み希望日・NG曜日はハード制約（ユーザー決定事項）: この日に希望・NGが
    // ある従業員はそもそも候補から除外し、どんなに人手が足りなくても破らない。
    const isEligible = (employee: Employee, shiftTypeId: string): boolean => {
      if (assignedToday.has(employee.id)) return false;
      if (isLeaveRequested(employee, date) || isNgWeekday(employee, date)) return false;
      const employmentType = employmentTypeById.get(employee.employmentTypeId);
      const shiftType = shiftTypeById.get(shiftTypeId);
      if (!employmentType || !shiftType) return false;
      if (!isWeekday) {
        const key = `${employee.employmentTypeId}#${shiftTypeId}`;
        const max = weekendMaxByEmploymentTypeShift.get(key);
        if (max != null && (weekendAssignedCountByEmploymentTypeShift.get(key) ?? 0) >= max) {
          return false;
        }
      }
      const s = state.get(employee.id)!;
      const stats: EmployeeWorkStats = {
        consecutiveWorkDaysBeforeDate: s.consecutiveWorkDays,
        workDaysThisWeek: s.workDaysThisWeek,
        workHoursThisWeek: s.workHoursThisWeek,
      };
      return canAssignShift(employmentType, shiftType, stats);
    };

    const orderCandidates = (pool: Employee[], shiftTypeId: string): Employee[] => {
      return pool.filter((employee) => isEligible(employee, shiftTypeId)).sort(compareForFairness);
    };

    // 月間目標時間にまだ届いていない従業員かどうか（雇用形態に目標が
    // 設定されていない場合は常にfalse）。
    const isBelowTarget = (employee: Employee): boolean => {
      const target = employmentTypeById.get(employee.employmentTypeId)?.targetMonthlyHours ?? null;
      return target != null && state.get(employee.id)!.workHoursSoFar < target;
    };

    const assign = (employee: Employee, shiftTypeId: string) => {
      assignedToday.add(employee.id);
      todayShiftByEmployee.set(employee.id, shiftTypeId);
      assignments.push({ date, employeeId: employee.id, kind: "shift", shiftTypeId });
      if (!isWeekday) {
        const key = `${employee.employmentTypeId}#${shiftTypeId}`;
        weekendAssignedCountByEmploymentTypeShift.set(
          key,
          (weekendAssignedCountByEmploymentTypeShift.get(key) ?? 0) + 1,
        );
      }
    };

    // 最制約優先（fail-first）: 必要人数に対して候補者に余裕がないグループ
    // （ハード制約を満たせる候補者数 - 必要人数、が小さいもの）から処理する。
    // 「配列の後ろにある勤務区分ほど構造的に人員を使い切られやすい」という
    // 処理順バイアスを避けるための並べ替えで、この時点ではまだ誰も
    // 割り当てていないためisEligibleは全員分フラットに評価できる。
    // 合算先（counts_toward_shift_type_id）を持つ勤務区分は自分の必要人数を
    // 持たず親に合算されるグループとして扱う（buildShiftTypeGroups）。
    // eligibleCountはグループ内メンバーの単純合計（両方に入れる人がいれば
    // 重複カウントされ得るが、処理順を決める目安として使うだけなので許容する）。
    const groupPlanForToday = shiftTypeGroups
      .map((group) => {
        const rootId = group.members[0].id;
        const memberIds = group.members.map((m) => m.id);
        const requiredCount = requirementLookup.get(requirementKey(date, rootId)) ?? 0;
        const minStaffingFloor = input.employmentTypeMinStaffing
          .filter((r) => memberIds.includes(r.shiftTypeId))
          .reduce((sum, r) => sum + r.minCount, 0);
        // 週の需給が厳しい週だけ、今日の目標人数を按分縮小する（雇用形態別
        // 必須人数の下限は必ず下回らないようにする）。通常週はfillRatio=1のため
        // targetCount === requiredCountで、既存の挙動と変わらない。
        // 端数はMath.floorで切り捨てる: Σfloor(requiredCount_i × fillRatio) は
        // 常に週の供給量以下になることが数学的に保証される（Σ(x_i×r) = r×Σx_i =
        // 供給量になるため）。Math.roundやMath.ceilだと週の目標合計が供給量を
        // 超えたままになり得て、結局週の前半で供給を使い切り後半の曜日が
        // ゼロ人のまま、という元の問題を解消しきれない。
        const baseTargetCount = Math.max(minStaffingFloor, Math.floor(requiredCount * fillRatio));
        // 上限人数（任意）が設定されていれば、必要人数を満たした上でなお
        // 候補者が余っている場合に、上限まで追加で割り当てることを許可する。
        // ただし週の需給按分が働いている週（fillRatio<1）は対象外にする——
        // 按分は「Σfloor(requiredCount_i×fillRatio) ≤ 週の供給量」という
        // 数学的保証の上に成り立っており、ここで上限まで積み増すとその保証が
        // 崩れ、按分導入前に戻っていた「週後半が0人になる」問題が再発しうるため。
        const maxCount = maxCountByShiftTypeId.get(rootId) ?? null;
        const targetCount =
          maxCount != null && fillRatio === 1 ? Math.max(baseTargetCount, maxCount) : baseTargetCount;
        const eligibleCount = group.members.reduce(
          (sum, member) => sum + input.employees.filter((e) => isEligible(e, member.id)).length,
          0,
        );
        return { group, requiredCount, targetCount, baseTargetCount, slack: eligibleCount - targetCount };
      })
      .filter((entry) => entry.requiredCount > 0)
      .sort((a, b) => a.slack - b.slack);

    // 上限人数の追加割当て（バッファ）で使った人数は、週の残り供給から
    // 差し引かない。差し引いてしまうと、早い日にバッファを使っただけで
    // その週の後半の必要人数（下限）の充足が圧迫されてしまい、按分の
    // 数学的保証（Σfloor(requiredCount_i×fillRatio) ≤ 供給量）が崩れるため。
    let requiredPortionAssignedToday = 0;

    // Step1（雇用形態別必須人数の優先充足）は、その日の対象グループすべてに
    // ついて先に確定させる。例えば早番グループ・遅番グループの両方が同じ
    // 雇用形態（社員など）に必須人数を要求している場合、後続のStep2
    // （目標時間優先やバッファ埋め）が先にその雇用形態の候補者を使い切って
    // しまうと、後で処理されるグループの必須人数を満たせなくなる
    // （＝ソフトな優先度づけがハードな必須人数要件を壊してしまう）ため、
    // 全グループのStep1を1パス目として独立に済ませてから、Step2以降に進む。
    const assignedCountAfterStep1ByGroup = new Map<string, number>();
    for (const { group, targetCount } of groupPlanForToday) {
      const memberIds = group.members.map((m) => m.id);
      const minStaffingForGroup = input.employmentTypeMinStaffing.filter((r) =>
        memberIds.includes(r.shiftTypeId),
      );
      const assignedCountByEmploymentType = new Map<string, number>();
      let assignedCount = 0;

      // Step1: 雇用形態別必須人数を優先充足（グループ内の各勤務区分に個別に
      // 紐づく要件を、指定されたその勤務区分そのものへ割り当てる）
      for (const requirement of minStaffingForGroup) {
        let shortfall = requirement.minCount - (assignedCountByEmploymentType.get(requirement.employmentTypeId) ?? 0);
        if (shortfall <= 0) continue;

        const pool = input.employees.filter((e) => e.employmentTypeId === requirement.employmentTypeId);
        const ordered = orderCandidates(pool, requirement.shiftTypeId);
        for (const candidate of ordered) {
          if (shortfall <= 0 || assignedCount >= targetCount) break;
          // orderCandidatesはこのループ開始時点のスナップショットのため、
          // 土日限定の上限人数のような「今まさに割り当てた分だけ消費される」
          // 制約は、実際に割り当てる直前に再チェックする必要がある。
          if (!isEligible(candidate, requirement.shiftTypeId)) continue;
          assign(candidate, requirement.shiftTypeId);
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
            shiftTypeId: requirement.shiftTypeId,
            message: `${date}の${shiftTypeById.get(requirement.shiftTypeId)!.name}で雇用形態別必須人数（${requirement.minCount}人）を満たせませんでした（不足${shortfall}人）。`,
          });
        }
      }

      assignedCountAfterStep1ByGroup.set(group.members[0].id, assignedCount);
    }

    for (const { group, requiredCount, targetCount, baseTargetCount } of groupPlanForToday) {
      let assignedCount = assignedCountAfterStep1ByGroup.get(group.members[0].id) ?? 0;

      // Step2a: 月間目標時間にまだ届いていない候補者（例: 目標時間を設定した
      // 社員）を、weekdayPriorityの並べ替えより前に、グループの通常順
      // （親members[0]→サブ区分）で優先的に埋める。平日優先でサブ区分側が
      // 先に埋まってしまうと、サブ区分に入れない雇用形態の従業員（例: 社員は
      // パートバイト区分に入れない）が目標時間に届きにくくなるため、
      // 目標未達の人がいる限りは常に親を優先する。
      if (assignedCount < targetCount) {
        for (const member of group.members) {
          if (assignedCount >= targetCount) break;
          const priorityOrdered = orderCandidates(input.employees, member.id).filter(isBelowTarget);
          for (const candidate of priorityOrdered) {
            if (assignedCount >= targetCount) break;
            if (!isEligible(candidate, member.id)) continue;
            assign(candidate, member.id);
            assignedCount += 1;
          }
        }
      }

      // Step2b: 残りの必要人数を全体から充足。グループ内では基本的に親
      // （members[0]）を優先して埋め、親側の候補が尽きた場合にのみサブ区分側で
      // 埋めるが、weekdayPriority: trueのメンバーがいれば、平日（月〜金）に限り
      // そのメンバーを先に試す（強制ではなく、埋まらない分はそのまま他メンバーへ
      // 回る）。土日はこの並べ替えを行わない。
      const fillOrder = isWeekday
        ? [...group.members].sort(
            (a, b) => Number(b.weekdayPriority ?? false) - Number(a.weekdayPriority ?? false),
          )
        : group.members;
      if (assignedCount < targetCount) {
        for (const member of fillOrder) {
          if (assignedCount >= targetCount) break;
          const ordered = orderCandidates(input.employees, member.id);
          for (const candidate of ordered) {
            if (assignedCount >= targetCount) break;
            if (!isEligible(candidate, member.id)) continue;
            assign(candidate, member.id);
            assignedCount += 1;
          }
        }
      }

      if (assignedCount < requiredCount) {
        const groupLabel = group.members.map((m) => m.name).join("・");
        violations.push({
          severity: "hard",
          type: "understaffed",
          date,
          employeeId: null,
          shiftTypeId: group.members[0].id,
          message: `${date}の${groupLabel}で必要人数（${requiredCount}人）を満たせませんでした（不足${requiredCount - assignedCount}人）。`,
        });
      }

      requiredPortionAssignedToday += Math.min(assignedCount, baseTargetCount);
    }

    // 週の残り供給・残り需要を、今日実際に消費した分だけ減らす（固定比率ではなく
    // 「残り」を都度更新することで、今日目標未達だった分は翌日以降に回る）
    const todayDemand = groupPlanForToday.reduce((sum, entry) => sum + entry.requiredCount, 0);
    weeklySupplyRemaining.set(weekStart, supplyRemaining - requiredPortionAssignedToday);
    weeklyDemandRemaining.set(weekStart, demandRemaining - todayDemand);

    // 出勤しなかった従業員の休み区分を確定し、勤務実績カウンタを更新する
    for (const employee of input.employees) {
      const s = state.get(employee.id)!;
      const shiftTypeId = todayShiftByEmployee.get(employee.id);

      if (shiftTypeId) {
        const shiftType = shiftTypeById.get(shiftTypeId)!;
        s.workDaysSoFar += 1;
        s.workHoursSoFar += computeShiftHours(shiftType);
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
