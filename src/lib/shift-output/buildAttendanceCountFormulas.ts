import { columnIndexToLetter } from "./a1Notation";

export type AttendanceCountFormulaRow = {
  label: string; // 例:「早番 出勤人数」
  formulas: string[]; // 日付列と同じ並び順・同じ数（各要素は"="から始まる数式文字列）
};

export type BuildAttendanceCountFormulasInput = {
  // 出勤人数を数える対象の行数（従業員の行数）。0でも安全に動く。
  employeeCount: number;
  dateColumnCount: number;
  shiftTypes: {
    id: string;
    name: string;
    // 設定されている場合、この勤務区分の出勤人数は自分自身の行を持たず、
    // 参照先（親）の行に合算される（例:「早番パートバイト」→「早番」）。
    countsTowardShiftTypeId?: string | null;
  }[];
  // 設定すると、COUNTIFの範囲をこのシート名を付けた他シート参照にする
  // （例:「'2026-11'!B2:B6」）。印刷用シートから通常タブを参照して出勤人数を
  // 数式で追従させるために使う。省略時は同じシート内の範囲になる。
  sourceSheetTitle?: string;
};

// 勤務区分（合算先でまとめたグループ）ごとの日付別出勤人数を、店長がセルを
// ドロップダウンや直接入力で手直ししても自動的に再計算されるよう、COUNTIFを
// 組み合わせた数式として組み立てる純粋関数（Google Sheets APIへの依存を持たない）。
// 出力用シート自身に書き込む場合と、印刷用シートから出力用シートを参照する
// 場合の両方で使う（sourceSheetTitleの有無で切り替える）。
// 値ではなく数式を書き込む都合上、呼び出し側はvalueInputOption: "USER_ENTERED"
// で書き込む必要がある（"RAW"だと数式が文字列としてそのまま入ってしまう）。
export function buildAttendanceCountFormulaRows(
  input: BuildAttendanceCountFormulasInput,
): AttendanceCountFormulaRow[] {
  const rootShiftTypes = input.shiftTypes.filter((st) => !st.countsTowardShiftTypeId);
  const memberNamesByRootId = new Map<string, string[]>();
  for (const shiftType of input.shiftTypes) {
    const rootId = shiftType.countsTowardShiftTypeId ?? shiftType.id;
    const list = memberNamesByRootId.get(rootId) ?? [];
    list.push(shiftType.name);
    memberNamesByRootId.set(rootId, list);
  }

  // 従業員の行は2行目（1行目は日付見出し行）から始まる。従業員が0人でも
  // 範囲の開始行が終了行を超えないようにする（無効な範囲エラーを避ける）。
  const firstRow = 2;
  const lastRow = Math.max(firstRow, 1 + input.employeeCount);
  const sheetPrefix = input.sourceSheetTitle ? `'${input.sourceSheetTitle}'!` : "";

  return rootShiftTypes.map((root) => {
    const memberNames = memberNamesByRootId.get(root.id) ?? [root.name];
    const formulas = Array.from({ length: input.dateColumnCount }, (_, dayIndex) => {
      // +1: A列（0列目）は従業員名なので、1日目はB列（1列目）から始まる
      const columnLetter = columnIndexToLetter(dayIndex + 1);
      const range = `${sheetPrefix}${columnLetter}${firstRow}:${columnLetter}${lastRow}`;
      const terms = memberNames.map((name) => `COUNTIF(${range},"${escapeFormulaText(name)}")`);
      return `=${terms.join("+")}`;
    });
    return { label: `${root.name} 出勤人数`, formulas };
  });
}

// 勤務区分名に"（ダブルクォート）が含まれていても数式が壊れないようにする。
function escapeFormulaText(text: string): string {
  return text.replace(/"/g, '""');
}
