import { getIsoWeekday } from "./dateUtils";
import type { Employee, EmploymentType, EmploymentTypeMinStaffing, ISODate, ShiftType } from "./types";

// ある従業員を対象日に割り当てる直前時点までの勤務実績。
// 連勤上限・週あたり上限のハード制約判定に使う。
// 「これまでの勤務日数」「休み希望を崩された回数」など公平性の優先順位づけに
// 使う集計は greedy.ts 側で別途保持する（ここでは扱わない）。
export type EmployeeWorkStats = {
  consecutiveWorkDaysBeforeDate: number; // 対象日の直前まで連続で勤務している日数
  workDaysThisWeek: number; // 対象日が属する週の、対象日より前の勤務日数
  workHoursThisWeek: number; // 同上の勤務時間合計
};

// 勤務区分の稼働時間（時間単位）。終了時刻が開始時刻以前なら日をまたぐ勤務区分とみなす。
export function computeShiftHours(shiftType: ShiftType): number {
  const startMinutes = toMinutes(shiftType.startTime);
  let endMinutes = toMinutes(shiftType.endTime);
  if (endMinutes <= startMinutes) {
    endMinutes += 24 * 60;
  }
  return (endMinutes - startMinutes) / 60;
}

function toMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

export function isShiftAllowedForEmploymentType(
  employmentType: EmploymentType,
  shiftTypeId: string,
): boolean {
  return !employmentType.forbiddenShiftTypeIds.includes(shiftTypeId);
}

export function wouldExceedConsecutiveWorkDays(
  employmentType: EmploymentType,
  stats: EmployeeWorkStats,
): boolean {
  if (employmentType.maxConsecutiveWorkDays == null) return false;
  return stats.consecutiveWorkDaysBeforeDate + 1 > employmentType.maxConsecutiveWorkDays;
}

export function wouldExceedMaxWorkDaysPerWeek(
  employmentType: EmploymentType,
  stats: EmployeeWorkStats,
): boolean {
  if (employmentType.maxWorkDaysPerWeek == null) return false;
  return stats.workDaysThisWeek + 1 > employmentType.maxWorkDaysPerWeek;
}

export function wouldExceedMaxWorkHoursPerWeek(
  employmentType: EmploymentType,
  stats: EmployeeWorkStats,
  shiftHours: number,
): boolean {
  if (employmentType.maxWorkHoursPerWeek == null) return false;
  return stats.workHoursThisWeek + shiftHours > employmentType.maxWorkHoursPerWeek;
}

// ハード制約をすべて満たすかどうか（雇用形態の禁止勤務区分／連勤上限／
// 週あたり勤務日数・時間上限）。NG曜日・休み希望はソフト制約のためここでは判定しない。
export function canAssignShift(
  employmentType: EmploymentType,
  shiftType: ShiftType,
  stats: EmployeeWorkStats,
): boolean {
  const shiftHours = computeShiftHours(shiftType);
  return (
    isShiftAllowedForEmploymentType(employmentType, shiftType.id) &&
    !wouldExceedConsecutiveWorkDays(employmentType, stats) &&
    !wouldExceedMaxWorkDaysPerWeek(employmentType, stats) &&
    !wouldExceedMaxWorkHoursPerWeek(employmentType, stats, shiftHours)
  );
}

// ソフト制約の判定用述語（誰の希望を崩すかの優先順位づけは greedy.ts で行う）
export function isNgWeekday(employee: Employee, date: ISODate): boolean {
  return employee.ngWeekdays.includes(getIsoWeekday(date));
}

export function isLeaveRequested(employee: Employee, date: ISODate): boolean {
  return employee.leaveRequestDates.includes(date);
}

// ある勤務区分の当日メンバー構成（雇用形態ID -> 人数）が、
// 雇用形態別必須最低人数（employment_type_shift_staffing_requirements）を
// 満たしているかを判定し、満たしていない要件を返す。
export function findUnmetEmploymentTypeMinStaffing(
  shiftTypeId: string,
  assignedCountByEmploymentType: Map<string, number>,
  employmentTypeMinStaffing: EmploymentTypeMinStaffing[],
): EmploymentTypeMinStaffing[] {
  return employmentTypeMinStaffing.filter(
    (requirement) =>
      requirement.shiftTypeId === shiftTypeId &&
      (assignedCountByEmploymentType.get(requirement.employmentTypeId) ?? 0) <
        requirement.minCount,
  );
}
