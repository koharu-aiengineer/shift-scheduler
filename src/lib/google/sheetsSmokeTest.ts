import { google } from "googleapis";

export type SheetsSmokeTestResult = {
  spreadsheetId: string;
  spreadsheetUrl: string;
  writtenValue: string;
  readBackValue: string;
};

/**
 * Googleアカウントのアクセストークンを使い、
 * 「シート作成→書き込み→読み取り」が一通り動くことを確認する疎通テスト。
 */
export async function runSheetsSmokeTest(
  accessToken: string,
): Promise<SheetsSmokeTestResult> {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });

  const sheets = google.sheets({ version: "v4", auth });

  const createRes = await sheets.spreadsheets.create({
    requestBody: {
      properties: {
        title: `AIシフト_疎通確認_${new Date().toISOString()}`,
      },
    },
  });

  const spreadsheetId = createRes.data.spreadsheetId;
  const spreadsheetUrl = createRes.data.spreadsheetUrl;
  if (!spreadsheetId || !spreadsheetUrl) {
    throw new Error("スプレッドシートの作成に失敗しました");
  }

  const writtenValue = `疎通確認OK ${new Date().toLocaleString("ja-JP")}`;

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: "A1",
    valueInputOption: "RAW",
    requestBody: {
      values: [[writtenValue]],
    },
  });

  const readRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: "A1",
  });

  const readBackValue = readRes.data.values?.[0]?.[0] ?? "";

  return { spreadsheetId, spreadsheetUrl, writtenValue, readBackValue };
}
