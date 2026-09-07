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

async function requireOwnedShiftTypeId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  storeId: string,
  shiftTypeId: string,
) {
  const { data, error } = await supabase
    .from("shift_types")
    .select("id")
    .eq("id", shiftTypeId)
    .eq("store_id", storeId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("勤務区分が見つかりません");
}

export async function saveDefaultRequirement(formData: FormData) {
  const store = await getCurrentStore();
  if (!store) throw new Error("店舗が見つかりません");

  const shiftTypeId = requireString(formData, "shift_type_id", "勤務区分");
  const requiredCountRaw = requireString(formData, "required_count", "必要人数");
  const requiredCount = Number.parseInt(requiredCountRaw, 10);
  if (!Number.isFinite(requiredCount) || requiredCount < 0) {
    throw new Error("必要人数は0以上の整数で入力してください");
  }

  const supabase = await createClient();
  await requireOwnedShiftTypeId(supabase, store.id, shiftTypeId);

  const { error } = await supabase
    .from("shift_staffing_requirements")
    .upsert(
      { shift_type_id: shiftTypeId, required_count: requiredCount },
      { onConflict: "shift_type_id" },
    );

  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/staffing-requirements");
}

export async function addOverride(formData: FormData) {
  const store = await getCurrentStore();
  if (!store) throw new Error("店舗が見つかりません");

  const shiftTypeId = requireString(formData, "shift_type_id", "勤務区分");
  const targetDate = requireString(formData, "target_date", "日付");
  const requiredCountRaw = requireString(formData, "required_count", "必要人数");
  const requiredCount = Number.parseInt(requiredCountRaw, 10);
  if (!Number.isFinite(requiredCount) || requiredCount < 0) {
    throw new Error("必要人数は0以上の整数で入力してください");
  }

  const supabase = await createClient();
  await requireOwnedShiftTypeId(supabase, store.id, shiftTypeId);

  const { error } = await supabase.from("shift_staffing_overrides").upsert(
    { shift_type_id: shiftTypeId, target_date: targetDate, required_count: requiredCount },
    { onConflict: "shift_type_id,target_date" },
  );

  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/staffing-requirements");
}

export async function deleteOverride(formData: FormData) {
  const store = await getCurrentStore();
  if (!store) throw new Error("店舗が見つかりません");

  const id = requireString(formData, "id", "ID");
  const shiftTypeId = requireString(formData, "shift_type_id", "勤務区分");

  const supabase = await createClient();
  await requireOwnedShiftTypeId(supabase, store.id, shiftTypeId);

  const { error } = await supabase
    .from("shift_staffing_overrides")
    .delete()
    .eq("id", id)
    .eq("shift_type_id", shiftTypeId);

  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/staffing-requirements");
}
