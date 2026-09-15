// Postgresのunique_violationエラーコード（23505）を判定するヘルパー。
// supabase-jsのエラーオブジェクトは常にPostgrestErrorとは限らない
// （認証エラー等ではAuthErrorになる）ため、codeプロパティの有無だけで
// ダックタイピング判定する。
export function isUniqueViolation(error: { code?: string } | null | undefined): boolean {
  return error?.code === "23505";
}

// 一意制約違反（重複登録）のときだけ分かりやすい日本語メッセージに差し替え、
// それ以外のエラーはそのままDBのメッセージを使う。
export function toFriendlyInsertError(
  error: { code?: string; message: string },
  duplicateMessage: string,
): Error {
  return new Error(isUniqueViolation(error) ? duplicateMessage : error.message);
}
