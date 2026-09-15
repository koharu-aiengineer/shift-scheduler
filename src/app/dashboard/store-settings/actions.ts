"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentStore } from "@/lib/store";

function requireString(formData: FormData, field: string, label: string): string {
  const value = formData.get(field);
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label}を入力してください`);
  }
  return value.trim();
}

export async function saveClosedWeekdays(formData: FormData) {
  const store = await getCurrentStore();
  if (!store) throw new Error("店舗が見つかりません");

  const supabase = await createClient();

  const weekdays = [1, 2, 3, 4, 5, 6, 7].filter(
    (weekday) => formData.get(`weekday_${weekday}`) === "on",
  );

  const { error: deleteError } = await supabase
    .from("store_closed_weekdays")
    .delete()
    .eq("store_id", store.id);
  if (deleteError) throw new Error(deleteError.message);

  if (weekdays.length > 0) {
    const { error: insertError } = await supabase.from("store_closed_weekdays").insert(
      weekdays.map((weekday) => ({ store_id: store.id, weekday })),
    );
    if (insertError) throw new Error(insertError.message);
  }

  revalidatePath("/dashboard/store-settings");
}

export async function addClosedDate(formData: FormData) {
  const store = await getCurrentStore();
  if (!store) throw new Error("店舗が見つかりません");

  const closedDate = requireString(formData, "closed_date", "特別休業日");

  const supabase = await createClient();
  const { error } = await supabase.from("store_closed_dates").insert({
    store_id: store.id,
    closed_date: closedDate,
  });

  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/store-settings");
}

export async function deleteClosedDate(formData: FormData) {
  const store = await getCurrentStore();
  if (!store) throw new Error("店舗が見つかりません");

  const id = requireString(formData, "id", "ID");

  const supabase = await createClient();
  const { error } = await supabase
    .from("store_closed_dates")
    .delete()
    .eq("id", id)
    .eq("store_id", store.id);

  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/store-settings");
}
