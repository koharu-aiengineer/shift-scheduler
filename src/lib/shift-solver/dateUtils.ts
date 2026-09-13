import type { ISODate, Weekday } from "./types";

// 期間内の日付をISO文字列の配列として列挙する（start・end両端を含む）
export function enumerateDates(start: ISODate, end: ISODate): ISODate[] {
  const dates: ISODate[] = [];
  let current = parseISODate(start);
  const endDate = parseISODate(end);
  while (current.getTime() <= endDate.getTime()) {
    dates.push(formatISODate(current));
    current = addDays(current, 1);
  }
  return dates;
}

// ISO8601準拠の曜日番号（1=月 ... 7=日）を返す
export function getIsoWeekday(date: ISODate): Weekday {
  const jsDay = parseISODate(date).getUTCDay(); // 0=日 ... 6=土
  return (jsDay === 0 ? 7 : jsDay) as Weekday;
}

// dateが属するISO週（月曜始まり）の月曜日の日付を返す
export function getIsoWeekStart(date: ISODate): ISODate {
  const weekday = getIsoWeekday(date);
  return formatISODate(addDays(parseISODate(date), -(weekday - 1)));
}

// dateからdays日後（負なら前）の日付を返す
export function addDaysToDate(date: ISODate, days: number): ISODate {
  return formatISODate(addDays(parseISODate(date), days));
}

function parseISODate(date: ISODate): Date {
  return new Date(`${date}T00:00:00Z`);
}

function formatISODate(date: Date): ISODate {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}
