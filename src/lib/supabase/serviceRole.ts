import { createClient } from "@supabase/supabase-js";

// サービスロールキーを使う専用クライアント。RLS・カラム権限をすべて
// バイパスするため、google_refresh_tokenのようにauthenticated/anonから
// 読み書き禁止にしているカラムを扱うサーバー専用コードでのみ使うこと。
// ブラウザやクライアントコンポーネントに絶対に渡さない。
export function createServiceRoleClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
