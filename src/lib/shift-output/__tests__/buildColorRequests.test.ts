import { describe, expect, it } from "vitest";
import { buildClearFormatRequest, buildColorRequests } from "../buildColorRequests";
import { hexToRgb } from "../colors";
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

describe("hexToRgb", () => {
  it("converts a hex color into 0-1 float RGB", () => {
    expect(hexToRgb("#FFFFFF")).toEqual({ red: 1, green: 1, blue: 1 });
    expect(hexToRgb("#000000")).toEqual({ red: 0, green: 0, blue: 0 });
  });
});

describe("buildColorRequests", () => {
  it("creates one updateCells request per data row, offset by the header row and name column", () => {
    const requests = buildColorRequests(42, matrix);

    expect(requests).toHaveLength(2);
    expect(requests[0]).toMatchObject({
      updateCells: {
        range: {
          sheetId: 42,
          startRowIndex: 1,
          endRowIndex: 2,
          startColumnIndex: 1,
          endColumnIndex: 3,
        },
        fields: "userEnteredFormat.backgroundColor",
      },
    });
  });

  it("maps each cell's background color into the request in order", () => {
    const requests = buildColorRequests(42, matrix);
    const firstRowValues = (
      requests[0] as {
        updateCells: { rows: { values: { userEnteredFormat: { backgroundColor: unknown } }[] }[] };
      }
    ).updateCells.rows[0].values;

    expect(firstRowValues[0].userEnteredFormat.backgroundColor).toEqual(hexToRgb("#111111"));
    expect(firstRowValues[1].userEnteredFormat.backgroundColor).toEqual(hexToRgb("#FEF3C7"));
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
