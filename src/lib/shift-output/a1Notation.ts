// Google Sheets APIのA1記法（セル参照文字列）関連の小さなユーティリティ。
// 出力用シート・印刷用シートの両方で使うため共通化している。

// 0-indexed列番号をA1記法の列文字（0→"A", 25→"Z", 26→"AA", ...）に変換する。
export function columnIndexToLetter(index: number): string {
  let n = index + 1;
  let letters = "";
  while (n > 0) {
    const remainder = (n - 1) % 26;
    letters = String.fromCharCode(65 + remainder) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}
