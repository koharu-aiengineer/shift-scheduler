"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function LoginContent() {
  const searchParams = useSearchParams();
  const isReauth = searchParams.get("reauth") === "1";

  const handleLogin = async () => {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        scopes:
          "https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file",
        queryParams: {
          access_type: "offline",
          prompt: "consent",
        },
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-xl font-bold">店長ログイン</h1>
      {isReauth && (
        <p className="max-w-sm text-center text-sm text-gray-600">
          スプレッドシート連携の権限を確認するため、もう一度Googleでログインしてください。
        </p>
      )}
      <button
        onClick={handleLogin}
        className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
      >
        Googleでログイン
      </button>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginContent />
    </Suspense>
  );
}
