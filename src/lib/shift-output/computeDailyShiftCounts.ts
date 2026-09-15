import { enumerateDates } from "../shift-solver/dateUtils";
import type { Assignment, ISODate } from "../shift-solver/types";

export type DailyShiftCount = {
  date: ISODate;
  counts: { shiftTypeId: string; shiftTypeName: string; count: number }[];
};

export type ComputeDailyShiftCountsInput = {
  periodStart: ISODate;
  periodEnd: ISODate;
  shiftTypes: { id: string; name: string }[];
  assignments: Assignment[];
};

// 日付ごと・勤務区分ごとの出勤人数を集計する純粋関数。
// 店長画面（/dashboard/shift）にのみ表示する目的で、出力用スプレッドシート
// には書き込まない（CLAUDE.mdの「出力用シートには集計行を持たせない」方針のため）。
export function computeDailyShiftCounts(
  input: ComputeDailyShiftCountsInput,
): DailyShiftCount[] {
  const dates = enumerateDates(input.periodStart, input.periodEnd);

  const countByKey = new Map<string, number>();
  for (const assignment of input.assignments) {
    if (assignment.kind !== "shift") continue;
    const key = `${assignment.date}#${assignment.shiftTypeId}`;
    countByKey.set(key, (countByKey.get(key) ?? 0) + 1);
  }

  return dates.map((date) => ({
    date,
    counts: input.shiftTypes.map((shiftType) => ({
      shiftTypeId: shiftType.id,
      shiftTypeName: shiftType.name,
      count: countByKey.get(`${date}#${shiftType.id}`) ?? 0,
    })),
  }));
}
