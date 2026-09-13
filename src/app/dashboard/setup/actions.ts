"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function createStore(formData: FormData) {
  const name = formData.get("name");
  if (typeof name !== "string" || name.trim().length === 0) {
    throw new Error("店舗名を入力してください");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { error } = await supabase.from("stores").insert({
    name: name.trim(),
    owner_user_id: user.id,
  });

  if (error) {
    throw new Error(error.message);
  }

  // 初回ログイン時点ではまだstore行が無くGoogleリフレッシュトークンを
  // 保存できていない（auth/callback/route.ts参照）。店舗作成直後に
  // 再度Googleログインを要求し、その場で確実に保存する。
  redirect("/login?reauth=1");
}
