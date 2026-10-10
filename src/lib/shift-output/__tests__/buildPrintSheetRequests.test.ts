import { describe, expect, it } from "vitest";
import {
  buildDataConditionalFormatRequests,
  buildGridResizeRequest,
  buildPrintFormatRequests,
  buildPrintSheetContent,
  columnIndexToLetter,
  computeRequiredGridSize,
} from "../buildPrintSheetRequests";
import { SUNDAY_HEADER_TEXT_COLOR } from "../buildPrintMatrix";
import type { SheetsApiRequest } from "../buildSheetEditingRequests";
import { hexToRgb } from "../colors";
import type { PrintMatrix } from "../buildPrintMatrix";

type UpdateCellsRequest = {
  updateCells: {
    range: {
      sheetId: number;
      startRowIndex: number;
      endRowIndex: number;
      startColumnIndex: number;
      endColumnIndex: number;
    };
    rows: unknown[];
    fields: string;
  };
};

function isUpdateCellsRequest(
  request: SheetsApiRequest,
): request is SheetsApiRequest & UpdateCellsRequest {
  return "updateCells" in request;
}

type UpdateDimensionPropertiesRequest = {
  updateDimensionProperties: {
    range: { startIndex: number; endIndex?: number };
    properties: Record<string, unknown>;
  };
};

function isUpdateDimensionPropertiesRequest(
  request: SheetsApiRequest,
): request is SheetsApiRequest & UpdateDimensionPropertiesRequest {
  return "updateDimensionProperties" in request;
}

const matrix: PrintMatrix = {
  dateRow: [
    { text: "", textColor: null },
    { text: "1", textColor: null },
    { text: "2", textColor: SUNDAY_HEADER_TEXT_COLOR },
  ],
  weekdayRow: [
    { text: "", textColor: null },
    { text: "火", textColor: null },
    { text: "日", textColor: SUNDAY_HEADER_TEXT_COLOR },
  ],
  rows: [
    {
      employeeName: "田中",
      isEmploymentTypeBoundary: false,
      formulas: ["=LEFT('2026-09'!B2,1)", "=LEFT('2026-09'!C2,1)"],
      helperFormulas: ["='2026-09'!B2", "='2026-09'!C2"],
    },
    {
      employeeName: "佐藤",
      isEmploymentTypeBoundary: true,
      formulas: ["=LEFT('2026-09'!B3,1)", "=LEFT('2026-09'!C3,1)"],
      helperFormulas: ["='2026-09'!B3", "='2026-09'!C3"],
    },
  ],
  attendanceCountRows: [
    {
      label: "早番 出勤人数",
      formulas: ['=COUNTIF(\'2026-09\'!B2:B3,"早番")', '=COUNTIF(\'2026-09\'!C2:C3,"早番")'],
    },
  ],
  legend: [
    { text: "早番", abbreviation: "早", color: "#93c5fd", timeRange: "09:00〜18:00" },
    { text: "休", abbreviation: "休", color: "#FEF3C7", timeRange: null },
  ],
};

describe("computeRequiredGridSize / buildGridResizeRequest", () => {
  it("requires enough columns to fit the helper block and legend block (4 columns past legendColumnStart)", () => {
    const content = buildPrintSheetContent(matrix, "title");

    const { columnCount } = computeRequiredGridSize(content.layout);

    // legendColumnStart(6) + 4列（色見本・略称・名前・時間帯）
    expect(columnCount).toBeGreaterThanOrEqual(content.layout.legendColumnStart + 4);
  });

  it("never requests fewer than a sane minimum, so a sheet is never shrunk below what already fits typical use", () => {
    const tinyLayout = {
      titleRowIndex: 0,
      dateRowIndex: 1,
      weekdayRowIndex: 2,
      dataStartRowIndex: 3,
      dataRowCount: 0,
      dateColumnCount: 0,
      attendanceCountStartRowIndex: 3,
      attendanceCountRowCount: 0,
      helperColumnStart: 1,
      legendColumnStart: 2,
      legendTitleRowIndex: 0,
      legendStartRowIndex: 1,
      legendRowCount: 0,
    };

    const { rowCount, columnCount } = computeRequiredGridSize(tinyLayout);

    expect(rowCount).toBeGreaterThanOrEqual(1000);
    expect(columnCount).toBeGreaterThanOrEqual(26);
  });

  it("builds an updateSheetProperties request that resizes the given sheet's grid", () => {
    const content = buildPrintSheetContent(matrix, "title");
    const { rowCount, columnCount } = computeRequiredGridSize(content.layout);

    expect(buildGridResizeRequest(7, content.layout)).toEqual({
      updateSheetProperties: {
        properties: { sheetId: 7, gridProperties: { rowCount, columnCount } },
        fields: "gridProperties.rowCount,gridProperties.columnCount",
      },
    });
  });
});

describe("columnIndexToLetter", () => {
  it("converts 0-indexed column numbers to A1-notation letters", () => {
    expect(columnIndexToLetter(0)).toBe("A");
    expect(columnIndexToLetter(25)).toBe("Z");
    expect(columnIndexToLetter(26)).toBe("AA");
    expect(columnIndexToLetter(27)).toBe("AB");
  });
});

describe("buildPrintSheetContent", () => {
  it("builds the main table (title, date row, weekday row, employee formula rows [display formula + hidden helper formula], attendance count formula rows) as one block", () => {
    const content = buildPrintSheetContent(matrix, "テスト店舗 2026-09 シフト表（印刷用）");

    expect(content.mainValues).toEqual([
      ["テスト店舗 2026-09 シフト表（印刷用）"],
      ["", "1", "2"],
      ["", "火", "日"],
      [
        "田中",
        "=LEFT('2026-09'!B2,1)",
        "=LEFT('2026-09'!C2,1)",
        "='2026-09'!B2",
        "='2026-09'!C2",
      ],
      [
        "佐藤",
        "=LEFT('2026-09'!B3,1)",
        "=LEFT('2026-09'!C3,1)",
        "='2026-09'!B3",
        "='2026-09'!C3",
      ],
      ["早番 出勤人数", '=COUNTIF(\'2026-09\'!B2:B3,"早番")', '=COUNTIF(\'2026-09\'!C2:C3,"早番")'],
    ]);
  });

  it("builds the legend as a separate block (title + one row per entry)", () => {
    const content = buildPrintSheetContent(matrix, "title");

    expect(content.legendValues).toEqual([
      ["凡例（色は各セルの背景色と対応）"],
      ["", "早", "早番", "09:00〜18:00"],
      ["", "休", "休", ""],
    ]);
  });

  it("computes the row/column layout used by buildPrintFormatRequests, placing the hidden helper block right after the date grid and the legend after that", () => {
    const content = buildPrintSheetContent(matrix, "title");

    expect(content.layout).toEqual({
      titleRowIndex: 0,
      dateRowIndex: 1,
      weekdayRowIndex: 2,
      dataStartRowIndex: 3,
      dataRowCount: 2,
      dateColumnCount: 2,
      attendanceCountStartRowIndex: 5, // 3(dataStartRowIndex) + 2(dataRowCount)
      attendanceCountRowCount: 1,
      helperColumnStart: 3, // 1(従業員名列) + 2(日付列)
      legendColumnStart: 6, // 3(helperColumnStart) + 2(日付列と同数のヘルパー列) + 1(空け列)
      legendTitleRowIndex: 0,
      legendStartRowIndex: 1,
      legendRowCount: 2,
    });
  });
});

describe("buildDataConditionalFormatRequests", () => {
  it("adds one CUSTOM_FORMULA conditional format rule per legend entry, referencing the hidden helper block's employee-data start cell (same sheet, not the source sheet directly)", () => {
    const content = buildPrintSheetContent(matrix, "title");

    const requests = buildDataConditionalFormatRequests(42, matrix, content.layout);

    expect(requests).toHaveLength(2);
    expect(requests[0]).toEqual({
      addConditionalFormatRule: {
        index: 0,
        rule: {
          ranges: [{ sheetId: 42, startRowIndex: 3, endRowIndex: 5, startColumnIndex: 1, endColumnIndex: 3 }],
          booleanRule: {
            condition: {
              type: "CUSTOM_FORMULA",
              // helperColumnStart(3)→D列、dataStartRowIndex(3)+1行目→4行目
              values: [{ userEnteredValue: '=D4="早番"' }],
            },
            format: { backgroundColor: hexToRgb("#93c5fd") },
          },
        },
      },
    });
    expect(requests[1]).toMatchObject({
      addConditionalFormatRule: {
        index: 1,
        rule: {
          booleanRule: {
            condition: { values: [{ userEnteredValue: '=D4="休"' }] },
            format: { backgroundColor: hexToRgb("#FEF3C7") },
          },
        },
      },
    });
  });

  it("returns no requests when there are no employee rows", () => {
    const emptyMatrix: PrintMatrix = { ...matrix, rows: [] };
    const content = buildPrintSheetContent(emptyMatrix, "title");

    expect(buildDataConditionalFormatRequests(42, emptyMatrix, content.layout)).toEqual([]);
  });
});

describe("buildPrintFormatRequests", () => {
  const content = buildPrintSheetContent(matrix, "title");

  it("clears previous borders (not just background/text format) over the actual required grid size, so a shrinking/growing employee list doesn't leave stray boundary lines or stale helper/legend columns behind", () => {
    const requests = buildPrintFormatRequests(42, matrix, content.layout);
    const { rowCount, columnCount } = computeRequiredGridSize(content.layout);

    expect(requests[0]).toMatchObject({
      repeatCell: {
        range: { sheetId: 42, startRowIndex: 0, endRowIndex: rowCount, startColumnIndex: 0, endColumnIndex: columnCount },
        cell: {
          userEnteredFormat: {
            borders: {
              top: { style: "NONE" },
              bottom: { style: "NONE" },
              left: { style: "NONE" },
              right: { style: "NONE" },
            },
          },
        },
        fields: "userEnteredFormat(backgroundColor,textFormat,borders)",
      },
    });
  });

  it("hides the helper column block (it only exists so same-sheet conditional formatting can read the un-truncated source text)", () => {
    const requests = buildPrintFormatRequests(42, matrix, content.layout);

    expect(requests).toContainEqual({
      updateDimensionProperties: {
        range: {
          sheetId: 42,
          dimension: "COLUMNS",
          startIndex: content.layout.helperColumnStart,
          endIndex: content.layout.helperColumnStart + content.layout.dateColumnCount,
        },
        properties: { hiddenByUser: true },
        fields: "hiddenByUser",
      },
    });
  });

  it("colors the date row and weekday row per cell (Saturday blue, Sunday red, weekday default black)", () => {
    const requests = buildPrintFormatRequests(42, matrix, content.layout);
    const headerUpdates = requests
      .filter(isUpdateCellsRequest)
      .filter(
        (r) =>
          r.updateCells.range.startRowIndex === content.layout.dateRowIndex &&
          r.updateCells.range.startColumnIndex === 0,
      );

    expect(headerUpdates).toHaveLength(1);
    expect(headerUpdates[0].updateCells.rows).toEqual([
      {
        values: [
          { userEnteredFormat: { textFormat: { bold: true, foregroundColor: { red: 0, green: 0, blue: 0 } } } },
          { userEnteredFormat: { textFormat: { bold: true, foregroundColor: { red: 0, green: 0, blue: 0 } } } },
          { userEnteredFormat: { textFormat: { bold: true, foregroundColor: hexToRgb(SUNDAY_HEADER_TEXT_COLOR) } } },
        ],
      },
    ]);
  });

  it("does not set data-cell background colors directly (color now comes from buildDataConditionalFormatRequests)", () => {
    const requests = buildPrintFormatRequests(42, matrix, content.layout);

    const dataUpdate = requests
      .filter(isUpdateCellsRequest)
      .find((r) => r.updateCells.range.startRowIndex === content.layout.dataStartRowIndex);

    expect(dataUpdate).toBeUndefined();
  });

  it("places the legend swatch colors in the legend's own column block (not the date grid's columns, and not the hidden helper columns)", () => {
    const requests = buildPrintFormatRequests(42, matrix, content.layout);

    const legendUpdate = requests.filter(isUpdateCellsRequest).find(
      (r) =>
        r.updateCells.range.startRowIndex === content.layout.legendStartRowIndex &&
        r.updateCells.range.startColumnIndex === content.layout.legendColumnStart,
    )!;

    expect(legendUpdate.updateCells.range).toEqual({
      sheetId: 42,
      startRowIndex: 1,
      endRowIndex: 3,
      startColumnIndex: 6,
      endColumnIndex: 7,
    });
    expect(legendUpdate.updateCells.rows).toEqual([
      { values: [{ userEnteredFormat: { backgroundColor: hexToRgb("#93c5fd") } }] },
      { values: [{ userEnteredFormat: { backgroundColor: hexToRgb("#FEF3C7") } }] },
    ]);
  });

  it("gives the legend's own columns their own (wider) pixel widths, independent of the narrow date columns", () => {
    const requests = buildPrintFormatRequests(42, matrix, content.layout);

    const dimensionRequests = requests
      .filter(isUpdateDimensionPropertiesRequest)
      .filter((r) => "pixelSize" in r.updateDimensionProperties.properties);
    const nameColumnEntry = dimensionRequests.find((r) => r.updateDimensionProperties.range.startIndex === content.layout.legendColumnStart + 2)!;

    // 凡例の勤務区分名の列は、日付列(36px)よりずっと広い
    expect(nameColumnEntry.updateDimensionProperties.properties.pixelSize).toBeGreaterThan(100);
  });

  it("freezes the title/date/weekday rows and the employee name column", () => {
    const requests = buildPrintFormatRequests(42, matrix, content.layout);

    expect(requests).toContainEqual({
      updateSheetProperties: {
        properties: { sheetId: 42, gridProperties: { frozenRowCount: 3, frozenColumnCount: 1 } },
        fields: "gridProperties.frozenRowCount,gridProperties.frozenColumnCount",
      },
    });
  });

  it("skips the legend/attendance/helper-hiding cell requests when there are no legend/attendance/date entries (header formatting still happens)", () => {
    const emptyMatrix: PrintMatrix = {
      dateRow: [{ text: "", textColor: null }],
      weekdayRow: [{ text: "", textColor: null }],
      rows: [],
      attendanceCountRows: [],
      legend: [],
    };
    const emptyContent = buildPrintSheetContent(emptyMatrix, "title");

    const requests = buildPrintFormatRequests(42, emptyMatrix, emptyContent.layout);
    const updateCellsRequests = requests.filter(isUpdateCellsRequest);

    expect(
      updateCellsRequests.some(
        (r) =>
          r.updateCells.range.startRowIndex === emptyContent.layout.legendStartRowIndex &&
          r.updateCells.range.startColumnIndex === emptyContent.layout.legendColumnStart,
      ),
    ).toBe(false);
    const borderRequests = requests.filter(
      (r): r is SheetsApiRequest & { updateBorders: { range: { startRowIndex: number } } } =>
        "updateBorders" in r,
    );
    expect(
      borderRequests.some((r) => r.updateBorders.range.startRowIndex === emptyContent.layout.attendanceCountStartRowIndex),
    ).toBe(false);
    expect(
      requests
        .filter(isUpdateDimensionPropertiesRequest)
        .some((r) => "hiddenByUser" in r.updateDimensionProperties.properties),
    ).toBe(false);
  });

  it("draws a thick top border above the attendance-count block, separating it from the employee rows, and bolds the whole row", () => {
    const requests = buildPrintFormatRequests(42, matrix, content.layout);

    expect(requests).toContainEqual({
      updateBorders: {
        range: {
          sheetId: 42,
          startRowIndex: content.layout.attendanceCountStartRowIndex,
          endRowIndex: content.layout.attendanceCountStartRowIndex + 1,
          startColumnIndex: 0,
          endColumnIndex: 3,
        },
        top: { style: "SOLID_THICK", color: { red: 0, green: 0, blue: 0 } },
      },
    });
    expect(requests).toContainEqual({
      repeatCell: {
        range: {
          sheetId: 42,
          startRowIndex: content.layout.attendanceCountStartRowIndex,
          endRowIndex: content.layout.attendanceCountStartRowIndex + content.layout.attendanceCountRowCount,
          startColumnIndex: 0,
          endColumnIndex: 3,
        },
        cell: { userEnteredFormat: { textFormat: { bold: true } } },
        fields: "userEnteredFormat.textFormat",
      },
    });
  });

  it("draws a thick top border on rows marked as an employment-type boundary, spanning the whole table width", () => {
    const requests = buildPrintFormatRequests(42, matrix, content.layout);

    // matrix.rows[1]（佐藤）がisEmploymentTypeBoundary: true → dataStartRowIndex(3)+1=4行目の上端
    expect(requests).toContainEqual({
      updateBorders: {
        range: { sheetId: 42, startRowIndex: 4, endRowIndex: 5, startColumnIndex: 0, endColumnIndex: 3 },
        top: { style: "SOLID_THICK", color: { red: 0, green: 0, blue: 0 } },
      },
    });
  });

  it("draws no boundary border for rows not marked as a boundary", () => {
    const requests = buildPrintFormatRequests(42, matrix, content.layout);

    const borderRequests = requests.filter((r): r is SheetsApiRequest & { updateBorders: { range: { startRowIndex: number } } } => "updateBorders" in r);
    // matrix.rows[0]（田中、dataStartRowIndex(3)+0=3行目）用のupdateBordersは無い
    expect(borderRequests.some((r) => r.updateBorders.range.startRowIndex === 3)).toBe(false);
  });
});
