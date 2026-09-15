import { describe, expect, it } from "vitest";
import {
  buildClearFormatRequest,
  buildConditionalFormatRequests,
  buildDataValidationRequest,
  buildDeleteConditionalFormatRequests,
} from "../buildSheetEditingRequests";
import { hexToRgb, type CellLegendEntry } from "../colors";
import type { SheetMatrix } from "../buildSheetMatrix";

const matrix: SheetMatrix = {
  headerRow: ["", "9/1(火)", "9/2(水)"],
  rows: [
    {
      employeeName: "田中",
      cells: [
        { text: "早番", backgroundColor: "#111111" },
        { text: "休", backgroundColor: "#FEF3C7" },
      ],
    },
    {
      employeeName: "佐藤",
      cells: [
        { text: "公休", backgroundColor: "#E5E7EB" },
        { text: "遅番", backgroundColor: "#BFDBFE" },
      ],
    },
  ],
};

const legend: CellLegendEntry[] = [
  { text: "早番", color: "#111111" },
  { text: "遅番", color: "#BFDBFE" },
  { text: "休", color: "#FEF3C7" },
  { text: "公休", color: "#E5E7EB" },
];

describe("hexToRgb", () => {
  it("converts a hex color into 0-1 float RGB", () => {
    expect(hexToRgb("#FFFFFF")).toEqual({ red: 1, green: 1, blue: 1 });
    expect(hexToRgb("#000000")).toEqual({ red: 0, green: 0, blue: 0 });
  });
});

describe("buildClearFormatRequest", () => {
  it("targets the given sheet with a generous, fixed-size range", () => {
    const request = buildClearFormatRequest(7);

    expect(request).toMatchObject({
      repeatCell: {
        range: { sheetId: 7, startRowIndex: 0, startColumnIndex: 0 },
        fields: "userEnteredFormat.backgroundColor",
      },
    });
  });
});

describe("buildDataValidationRequest", () => {
  it("targets the data range only (excludes the header row and name column)", () => {
    const request = buildDataValidationRequest(42, matrix, legend);

    expect(request).toMatchObject({
      setDataValidation: {
        range: {
          sheetId: 42,
          startRowIndex: 1,
          endRowIndex: 3,
          startColumnIndex: 1,
          endColumnIndex: 3,
        },
      },
    });
  });

  it("lists every legend entry as a dropdown option and allows free text (non-strict)", () => {
    const request = buildDataValidationRequest(42, matrix, legend);

    expect(request).toMatchObject({
      setDataValidation: {
        rule: {
          condition: {
            type: "ONE_OF_LIST",
            values: [
              { userEnteredValue: "早番" },
              { userEnteredValue: "遅番" },
              { userEnteredValue: "休" },
              { userEnteredValue: "公休" },
            ],
          },
          showCustomUi: true,
          strict: false,
        },
      },
    });
  });
});

describe("buildConditionalFormatRequests", () => {
  it("creates one rule per legend entry, each matching the whole data range by exact text", () => {
    const requests = buildConditionalFormatRequests(42, matrix, legend);

    expect(requests).toHaveLength(4);
    expect(requests[0]).toMatchObject({
      addConditionalFormatRule: {
        index: 0,
        rule: {
          ranges: [{ sheetId: 42, startRowIndex: 1, endRowIndex: 3, startColumnIndex: 1, endColumnIndex: 3 }],
          booleanRule: {
            condition: { type: "TEXT_EQ", values: [{ userEnteredValue: "早番" }] },
            format: { backgroundColor: hexToRgb("#111111") },
          },
        },
      },
    });
    expect(requests[3]).toMatchObject({
      addConditionalFormatRule: {
        index: 3,
        rule: {
          booleanRule: {
            condition: { type: "TEXT_EQ", values: [{ userEnteredValue: "公休" }] },
            format: { backgroundColor: hexToRgb("#E5E7EB") },
          },
        },
      },
    });
  });
});

describe("buildDeleteConditionalFormatRequests", () => {
  it("deletes existing rules from the highest index down, to keep indices stable while deleting", () => {
    const requests = buildDeleteConditionalFormatRequests(7, 3);

    expect(requests).toEqual([
      { deleteConditionalFormatRule: { sheetId: 7, index: 2 } },
      { deleteConditionalFormatRule: { sheetId: 7, index: 1 } },
      { deleteConditionalFormatRule: { sheetId: 7, index: 0 } },
    ]);
  });

  it("returns no requests when there are no existing rules", () => {
    expect(buildDeleteConditionalFormatRequests(7, 0)).toEqual([]);
  });
});
