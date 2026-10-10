import { getAccessTokenForStore } from "./getAccessTokenForStore";
import { createGoogleClients } from "./sheetsClient";
import { ensureSheet } from "./writeShiftOutput";
import { buildPrintMatrix } from "../shift-output/buildPrintMatrix";
import { buildDeleteConditionalFormatRequests } from "../shift-output/buildSheetEditingRequests";
import {
  buildDataConditionalFormatRequests,
  buildGridResizeRequest,
  buildPrintFormatRequests,
  buildPrintSheetContent,
  columnIndexToLetter,
  computeRequiredGridSize,
} from "../shift-output/buildPrintSheetRequests";

export type WritePrintSheetInput = {
  storeId: string;
  storeName: string;
  outputSheetId: string;
  period: string; // "YYYY-MM"。通常タブ（この同じ月）のタブ名。セルの数式が参照する
  periodStart: string; // "YYYY-MM-DD"。日付・曜日見出しの生成に使う
  periodEnd: string; // "YYYY-MM-DD"
  shiftTypes: {
    id: string;
    name: string;
    color: string | null;
    startTime: string;
    endTime: string;
    countsTowardShiftTypeId?: string | null;
  }[];
  // 通常タブと完全に同じ並び順で渡すこと（数式が「同じ行番号」を参照する
  // 前提のため。雇用形態の境目の太線判定にも使う）。
  employees: { name: string; employmentTypeId: string }[];
};

export type WritePrintSheetResult = {
  spreadsheetUrl: string;
  sheetTitle: string;
};

const PRINT_SHEET_SUFFIX = "_印刷用";

// 印刷・画像化しやすい1文字コード＋色＋凡例の専用タブを、通常タブを直接
// 参照する数式で書き出す。通常タブとは別のタブとして作る（同じファイル内。
// 手直し可能な通常タブのドロップダウンはこちらには付けない、閲覧・印刷専用
// のタブ）。セルの中身が数式のため、店長が通常タブ側をドロップダウンや
// 直接入力で手直しすると、この印刷用タブの表示もSheets側で自動的に追従する
// （このタブ自体のセルを直接書き換えると数式が失われるので、あくまで
// 「見る・印刷する」専用として扱うこと）。
export async function writePrintSheet(input: WritePrintSheetInput): Promise<WritePrintSheetResult> {
  const accessToken = await getAccessTokenForStore(input.storeId);
  const { sheets } = createGoogleClients(accessToken);

  const matrix = buildPrintMatrix({
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    sourceSheetTitle: input.period,
    employees: input.employees,
    shiftTypes: input.shiftTypes,
  });

  const printSheetTitle = `${input.period}${PRINT_SHEET_SUFFIX}`;
  const { sheetId, existingConditionalFormatRuleCount } = await ensureSheet(
    sheets,
    input.outputSheetId,
    printSheetTitle,
  );

  const content = buildPrintSheetContent(matrix, `${input.storeName} ${input.period} シフト表（印刷用）`);

  // 新規タブの既定のグリッドサイズは、凡例を表の右側の別列に置くには足りない
  // ことがある（values.update等はグリッドを自動で広げてくれないため、書き込み
  // より前に明示的に広げておく必要がある）。
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: input.outputSheetId,
    requestBody: { requests: [buildGridResizeRequest(sheetId, content.layout)] },
  });

  // values.updateは指定した範囲にしか書き込まない（それより外側の古いセルの
  // 値は勝手に消えない）。前回より従業員数が減った月を再生成した場合などに、
  // 出勤人数の行や凡例が前回の位置に古い値のまま残ってしまう（書式は
  // buildPrintFormatRequestsの先頭で広くクリアしているが、値は別チャンネル
  // のため別途必要）。値の書き込み前に、実際に必要なグリッドサイズ
  // （書式クリアと同じ基準）と同じ広さの範囲で値もクリアする。
  const requiredGridSize = computeRequiredGridSize(content.layout);
  const clearRangeEndColumn = columnIndexToLetter(requiredGridSize.columnCount - 1);
  await sheets.spreadsheets.values.clear({
    spreadsheetId: input.outputSheetId,
    range: `'${printSheetTitle}'!A1:${clearRangeEndColumn}${requiredGridSize.rowCount}`,
  });

  // セルの中身が数式（通常タブの対応セルを参照するもの）なので、文字列として
  // ではなく数式として解釈させるためUSER_ENTEREDで書き込む。
  await sheets.spreadsheets.values.update({
    spreadsheetId: input.outputSheetId,
    range: `'${printSheetTitle}'!A1`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: content.mainValues },
  });

  // 凡例は表（日付グリッド）とは別の列ブロックに書き込む（日付列の狭い幅の
  // 影響を受けず、勤務区分名を読み取れる幅を確保するため）。こちらは固定
  // テキストなのでRAWのままでよい。
  const legendStartCell = `${columnIndexToLetter(content.layout.legendColumnStart)}${content.layout.legendTitleRowIndex + 1}`;
  await sheets.spreadsheets.values.update({
    spreadsheetId: input.outputSheetId,
    range: `'${printSheetTitle}'!${legendStartCell}`,
    valueInputOption: "RAW",
    requestBody: { values: content.legendValues },
  });

  // 再生成のたびにルールが積み重ならないよう、既存の条件付き書式ルールを
  // 全て削除してから作り直す（通常タブの再生成と同じ方式）。
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: input.outputSheetId,
    requestBody: {
      requests: [
        ...buildPrintFormatRequests(sheetId, matrix, content.layout),
        ...buildDeleteConditionalFormatRequests(sheetId, existingConditionalFormatRuleCount),
        ...buildDataConditionalFormatRequests(sheetId, matrix, content.layout),
      ],
    },
  });

  return {
    spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${input.outputSheetId}/edit`,
    sheetTitle: printSheetTitle,
  };
}
