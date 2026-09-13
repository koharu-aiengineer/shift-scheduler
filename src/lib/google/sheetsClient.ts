import { google } from "googleapis";

// getAccessTokenForStoreで取得した短命なアクセストークンから、
// Sheets/Drive APIクライアントを組み立てる薄いラッパー。
export function createGoogleClients(accessToken: string) {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });

  return {
    sheets: google.sheets({ version: "v4", auth }),
    drive: google.drive({ version: "v3", auth }),
  };
}
