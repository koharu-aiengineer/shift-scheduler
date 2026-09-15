import { enumerateDates } from "./dateUtils";
import type { ISODate, StaffingRequirement } from "./types";

export type ResolvedRequirement = {
  date: ISODate;
  shiftTypeId: string;
  requiredCount: number;
};

// デフォルト必要人数（shift_staffing_requirements）と特定日の上書き
// （shift_staffing_overrides）から、期間内の日付×勤務区分ごとの
// 必要人数を解決する。上書きが存在する日はそちらを優先する。
// ただし店舗の定休日・特別休業日（closedDates）はそれよりさらに優先し、
// 該当日は全勤務区分の必要人数を強制的に0にする。
export function resolveRequirements(
  periodStart: ISODate,
  periodEnd: ISODate,
  staffingRequirements: StaffingRequirement[],
  closedDates: ISODate[] = [],
): ResolvedRequirement[] {
  const dates = enumerateDates(periodStart, periodEnd);
  const closedDateSet = new Set(closedDates);
  const resolved: ResolvedRequirement[] = [];

  for (const requirement of staffingRequirements) {
    const overrideByDate = new Map(
      requirement.overrides.map((override) => [override.date, override.requiredCount]),
    );

    for (const date of dates) {
      const requiredCount = closedDateSet.has(date)
        ? 0
        : (overrideByDate.get(date) ?? requirement.defaultRequiredCount);
      resolved.push({ date, shiftTypeId: requirement.shiftTypeId, requiredCount });
    }
  }

  return resolved;
}

// (date, shiftTypeId) をキーにした必要人数の高速参照用マップを構築する
export function buildRequirementLookup(
  resolved: ResolvedRequirement[],
): Map<string, number> {
  const lookup = new Map<string, number>();
  for (const entry of resolved) {
    lookup.set(requirementKey(entry.date, entry.shiftTypeId), entry.requiredCount);
  }
  return lookup;
}

export function requirementKey(date: ISODate, shiftTypeId: string): string {
  return `${date}#${shiftTypeId}`;
}
