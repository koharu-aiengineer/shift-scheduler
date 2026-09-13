import { createClient } from "@/lib/supabase/server";

export type Store = {
  id: string;
  name: string;
  owner_user_id: string;
  input_sheet_id: string | null;
  output_sheet_id: string | null;
  created_at: string;
  updated_at: string;
};

// google_refresh_token / google_token_updated_at はカラム権限でauthenticatedロールから
// 読めないため、明示的なカラム指定でselectする（select("*")は権限エラーになる）。
export async function getCurrentStore(): Promise<Store | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("stores")
    .select("id, name, owner_user_id, input_sheet_id, output_sheet_id, created_at, updated_at")
    .eq("owner_user_id", user.id)
    .maybeSingle();

  return data;
}
