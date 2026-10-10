import { describe, expect, it } from "vitest";
import { buildAttendanceCountFormulaRows } from "../buildAttendanceCountFormulas";

const shiftTypes = [
  { id: "st-early", name: "早番" },
  { id: "st-early-part", name: "早番パートバイト", countsTowardShiftTypeId: "st-early" },
  { id: "st-late", name: "遅番" },
];

describe("buildAttendanceCountFormulaRows", () => {
  it("合算先を持たない勤務区分（グループの親）ごとに1行作る", () => {
    const rows = buildAttendanceCountFormulaRows({ employeeCount: 5, dateColumnCount: 2, shiftTypes });

    expect(rows.map((r) => r.label)).toEqual(["早番 出勤人数", "遅番 出勤人数"]);
  });

  it("親には、自分自身とサブ区分（合算先が自分を指すもの）の両方をCOUNTIFで足し合わせる数式を作る", () => {
    const rows = buildAttendanceCountFormulaRows({ employeeCount: 5, dateColumnCount: 1, shiftTypes });

    const earlyRow = rows.find((r) => r.label === "早番 出勤人数")!;
    // 従業員は2行目〜6行目（5人）、1日目はB列
    expect(earlyRow.formulas[0]).toBe('=COUNTIF(B2:B6,"早番")+COUNTIF(B2:B6,"早番パートバイト")');
  });

  it("合算先を持たない勤務区分（遅番）は、自分自身だけのCOUNTIFにする", () => {
    const rows = buildAttendanceCountFormulaRows({ employeeCount: 5, dateColumnCount: 1, shiftTypes });

    const lateRow = rows.find((r) => r.label === "遅番 出勤人数")!;
    expect(lateRow.formulas[0]).toBe('=COUNTIF(B2:B6,"遅番")');
  });

  it("日付列の数だけ数式を作り、列がC列・D列…と進んでいく", () => {
    const rows = buildAttendanceCountFormulaRows({ employeeCount: 3, dateColumnCount: 3, shiftTypes });

    const lateRow = rows.find((r) => r.label === "遅番 出勤人数")!;
    expect(lateRow.formulas).toEqual([
      '=COUNTIF(B2:B4,"遅番")',
      '=COUNTIF(C2:C4,"遅番")',
      '=COUNTIF(D2:D4,"遅番")',
    ]);
  });

  it("従業員が0人でも範囲が壊れない（開始行が終了行を超えない）", () => {
    const rows = buildAttendanceCountFormulaRows({ employeeCount: 0, dateColumnCount: 1, shiftTypes });

    const lateRow = rows.find((r) => r.label === "遅番 出勤人数")!;
    expect(lateRow.formulas[0]).toBe('=COUNTIF(B2:B2,"遅番")');
  });

  it("勤務区分名に二重引用符が含まれていてもエスケープする", () => {
    const rows = buildAttendanceCountFormulaRows({
      employeeCount: 2,
      dateColumnCount: 1,
      shiftTypes: [{ id: "st-x", name: '早番"A"' }],
    });

    expect(rows[0].formulas[0]).toBe('=COUNTIF(B2:B3,"早番""A""")');
  });
});
