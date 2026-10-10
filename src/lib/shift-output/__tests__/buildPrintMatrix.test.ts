import { describe, expect, it } from "vitest";
import {
  buildPrintLegend,
  buildPrintMatrix,
  SATURDAY_HEADER_TEXT_COLOR,
  SUNDAY_HEADER_TEXT_COLOR,
} from "../buildPrintMatrix";
import {
  CLOSED_DAY_COLOR,
  LEAVE_COLOR_LIGHTEN_AMOUNT,
  REQUESTED_LEAVE_COLOR,
  SYSTEM_ASSIGNED_LEAVE_COLOR,
  lightenHexColor,
  pickFallbackShiftColor,
} from "../colors";

const shiftTypes = [
  { id: "st-early", name: "早番", color: "#93c5fd", startTime: "09:00", endTime: "18:00" },
  {
    id: "st-early-part",
    name: "早番パートバイト",
    color: "#fdba74",
    startTime: "09:00",
    endTime: "13:00",
    countsTowardShiftTypeId: "st-early",
  },
  { id: "st-late", name: "遅番", color: null, startTime: "13:00", endTime: "22:00" },
];

describe("buildPrintLegend", () => {
  it("勤務区分ごとに先頭1文字の略称・時間帯を持つエントリを作り、背景色は通常タブと同じ統一パレットを並び順で割り当てる（勤務区分マスタの色設定は使わない）", () => {
    const legend = buildPrintLegend(shiftTypes);

    expect(legend[0]).toEqual({
      text: "早番",
      abbreviation: "早",
      color: pickFallbackShiftColor(0),
      timeRange: "09:00〜18:00",
    });
    expect(legend[1]).toEqual({
      text: "早番パートバイト",
      abbreviation: "早",
      color: pickFallbackShiftColor(1),
      timeRange: "09:00〜13:00",
    });
    // 通常タブ用に設定した元の色（#93c5fd）そのままではないことの確認
    expect(legend[0].color).not.toBe("#93c5fd");
  });

  it("色が未設定の勤務区分でも、他の勤務区分と同じ並び順ベースのパレットから色を割り当てる", () => {
    const legend = buildPrintLegend(shiftTypes);

    expect(legend[2]).toEqual({
      text: "遅番",
      abbreviation: "遅",
      color: pickFallbackShiftColor(2),
      timeRange: "13:00〜22:00",
    });
  });

  it("休・公休・定休日の固定エントリを末尾に追加する（色は通常タブと同じ色を明るく調整したもの）", () => {
    const legend = buildPrintLegend(shiftTypes);
    const fixed = legend.slice(-3);

    expect(fixed).toEqual([
      {
        text: "休",
        abbreviation: "休",
        color: lightenHexColor(REQUESTED_LEAVE_COLOR, LEAVE_COLOR_LIGHTEN_AMOUNT),
        timeRange: null,
      },
      {
        text: "公休",
        abbreviation: "公",
        color: lightenHexColor(SYSTEM_ASSIGNED_LEAVE_COLOR, LEAVE_COLOR_LIGHTEN_AMOUNT),
        timeRange: null,
      },
      {
        text: "定休日",
        abbreviation: "定",
        color: lightenHexColor(CLOSED_DAY_COLOR, LEAVE_COLOR_LIGHTEN_AMOUNT),
        timeRange: null,
      },
    ]);
  });
});

describe("buildPrintMatrix", () => {
  it("日付行（日番号のみ・月表記なし）と曜日行を別々に作る", () => {
    const matrix = buildPrintMatrix({
      periodStart: "2026-11-01",
      periodEnd: "2026-11-03",
      sourceSheetTitle: "2026-11",
      employees: [],
      shiftTypes,
    });

    // 2026-11-01は日曜日
    expect(matrix.dateRow.map((c) => c.text)).toEqual(["", "1", "2", "3"]);
    expect(matrix.weekdayRow.map((c) => c.text)).toEqual(["", "日", "月", "火"]);
  });

  it("土曜は青、日曜は赤の文字色を日付行・曜日行の両方に付ける", () => {
    const matrix = buildPrintMatrix({
      periodStart: "2026-11-07", // 土
      periodEnd: "2026-11-08", // 日
      sourceSheetTitle: "2026-11",
      employees: [],
      shiftTypes,
    });

    expect(matrix.dateRow.map((c) => c.textColor)).toEqual([
      null,
      SATURDAY_HEADER_TEXT_COLOR,
      SUNDAY_HEADER_TEXT_COLOR,
    ]);
    expect(matrix.weekdayRow.map((c) => c.textColor)).toEqual([
      null,
      SATURDAY_HEADER_TEXT_COLOR,
      SUNDAY_HEADER_TEXT_COLOR,
    ]);
  });

  it("平日は文字色を指定しない（null＝既定の黒）", () => {
    const matrix = buildPrintMatrix({
      periodStart: "2026-11-02", // 月
      periodEnd: "2026-11-02",
      sourceSheetTitle: "2026-11",
      employees: [],
      shiftTypes,
    });

    expect(matrix.dateRow[1].textColor).toBeNull();
  });

  it("各従業員の各日について、通常タブの対応セルの先頭1文字を参照する数式を作る", () => {
    const matrix = buildPrintMatrix({
      periodStart: "2026-09-01",
      periodEnd: "2026-09-02",
      sourceSheetTitle: "2026-09",
      employees: [
        { name: "田中", employmentTypeId: "et-1" },
        { name: "佐藤", employmentTypeId: "et-1" },
      ],
      shiftTypes,
    });

    // 田中は通常タブの2行目、佐藤は3行目。1日目はB列、2日目はC列。
    expect(matrix.rows[0].employeeName).toBe("田中");
    expect(matrix.rows[0].formulas).toEqual([
      "=LEFT('2026-09'!B2,1)",
      "=LEFT('2026-09'!C2,1)",
    ]);
    expect(matrix.rows[1].employeeName).toBe("佐藤");
    expect(matrix.rows[1].formulas).toEqual([
      "=LEFT('2026-09'!B3,1)",
      "=LEFT('2026-09'!C3,1)",
    ]);
  });

  it("各従業員の各日について、先頭1文字に省略する前の全文をミラーする数式（helperFormulas）も作る（条件付き書式が同一シート内から参照するためのもの）", () => {
    const matrix = buildPrintMatrix({
      periodStart: "2026-09-01",
      periodEnd: "2026-09-02",
      sourceSheetTitle: "2026-09",
      employees: [{ name: "田中", employmentTypeId: "et-1" }],
      shiftTypes,
    });

    expect(matrix.rows[0].helperFormulas).toEqual(["='2026-09'!B2", "='2026-09'!C2"]);
  });

  it("legendを結果に含める", () => {
    const matrix = buildPrintMatrix({
      periodStart: "2026-09-01",
      periodEnd: "2026-09-01",
      sourceSheetTitle: "2026-09",
      employees: [],
      shiftTypes,
    });

    expect(matrix.legend).toHaveLength(shiftTypes.length + 3);
  });

  describe("雇用形態の境目（isEmploymentTypeBoundary）", () => {
    it("先頭行はfalse（表の外枠と重なるだけなので境界線を引かない）", () => {
      const matrix = buildPrintMatrix({
        periodStart: "2026-09-01",
        periodEnd: "2026-09-01",
        sourceSheetTitle: "2026-09",
        employees: [{ name: "田中", employmentTypeId: "et-staff" }],
        shiftTypes,
      });

      expect(matrix.rows[0].isEmploymentTypeBoundary).toBe(false);
    });

    it("直前の行と雇用形態が変わる行だけtrueにする", () => {
      const matrix = buildPrintMatrix({
        periodStart: "2026-09-01",
        periodEnd: "2026-09-01",
        sourceSheetTitle: "2026-09",
        employees: [
          { name: "田中", employmentTypeId: "et-staff" },
          { name: "佐藤", employmentTypeId: "et-staff" },
          { name: "鈴木", employmentTypeId: "et-part" },
          { name: "山本", employmentTypeId: "et-part" },
          { name: "高橋", employmentTypeId: "et-baito" },
        ],
        shiftTypes,
      });

      expect(matrix.rows.map((r) => r.isEmploymentTypeBoundary)).toEqual([
        false,
        false,
        true,
        false,
        true,
      ]);
    });
  });

  describe("勤務区分ごとの出勤人数（attendanceCountRows）", () => {
    it("合算先を持たない勤務区分ごとに1行作り、通常タブを参照するCOUNTIF数式にする", () => {
      const matrix = buildPrintMatrix({
        periodStart: "2026-09-01",
        periodEnd: "2026-09-02",
        sourceSheetTitle: "2026-09",
        employees: [
          { name: "田中", employmentTypeId: "et-1" },
          { name: "佐藤", employmentTypeId: "et-1" },
        ],
        shiftTypes,
      });

      expect(matrix.attendanceCountRows.map((r) => r.label)).toEqual([
        "早番 出勤人数",
        "遅番 出勤人数",
      ]);
      const earlyRow = matrix.attendanceCountRows[0];
      expect(earlyRow.formulas[0]).toBe(
        '=COUNTIF(\'2026-09\'!B2:B3,"早番")+COUNTIF(\'2026-09\'!B2:B3,"早番パートバイト")',
      );
    });
  });
});
