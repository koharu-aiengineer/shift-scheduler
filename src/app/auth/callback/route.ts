import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { encryptToken } from "@/lib/google/tokenCrypto";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=no_code`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}/login?error=exchange_failed`);
  }

  // prompt=consentで毎回リフレッシュトークンが返ってくるため、store行が
  // 既に存在する場合は都度保存し直す（store作成前の初回ログインでは対象0件で
  // 何もしない。setup/actions.tsの店舗作成後に再度この経路を通ることで確実に保存する）。
  const refreshToken = data.session?.provider_refresh_token;
  if (refreshToken) {
    const serviceRoleClient = createServiceRoleClient();
    await serviceRoleClient
      .from("stores")
      .update({
        google_refresh_token: encryptToken(refreshToken),
        google_token_updated_at: new Date().toISOString(),
      })
      .eq("owner_user_id", data.user.id);
  }

  return NextResponse.redirect(`${origin}/dashboard`);
}
