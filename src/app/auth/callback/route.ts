import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runSheetsSmokeTest } from "@/lib/google/sheetsSmokeTest";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=no_code`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.session) {
    return NextResponse.redirect(`${origin}/login?error=exchange_failed`);
  }

  const providerToken = data.session.provider_token;
  if (!providerToken) {
    return NextResponse.redirect(`${origin}/login?error=no_provider_token`);
  }

  try {
    const result = await runSheetsSmokeTest(providerToken);
    const params = new URLSearchParams({
      spreadsheetId: result.spreadsheetId,
      spreadsheetUrl: result.spreadsheetUrl,
      writtenValue: result.writtenValue,
      readBackValue: result.readBackValue,
    });
    return NextResponse.redirect(`${origin}/test-sheets/result?${params}`);
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown_error";
    return NextResponse.redirect(
      `${origin}/test-sheets/result?error=${encodeURIComponent(message)}`,
    );
  }
}
