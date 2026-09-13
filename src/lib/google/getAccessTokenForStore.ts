import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { decryptToken } from "./tokenCrypto";

// 保存済みのリフレッシュトークンを復号し、Googleのトークンエンドポイントで
// 短命なアクセストークンに交換する。google_refresh_tokenはauthenticated/anon
// から読めないカラムのため、サービスロールクライアントでのみ取得できる。
export async function getAccessTokenForStore(storeId: string): Promise<string> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("stores")
    .select("google_refresh_token")
    .eq("id", storeId)
    .single();

  if (error) {
    throw new Error(`店舗情報の取得に失敗しました: ${error.message}`);
  }
  if (!data.google_refresh_token) {
    throw new Error(
      "この店舗にはGoogleのリフレッシュトークンが保存されていません。店長に再度Googleログインを行ってもらってください。",
    );
  }

  const refreshToken = decryptToken(data.google_refresh_token);

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Googleアクセストークンの取得に失敗しました: ${response.status} ${body}`);
  }

  const json = (await response.json()) as { access_token?: string };
  if (!json.access_token) {
    throw new Error("Googleのレスポンスにアクセストークンが含まれていません");
  }

  return json.access_token;
}
