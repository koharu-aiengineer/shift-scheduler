"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentStore } from "@/lib/store";
import { toFriendlyInsertError } from "@/lib/supabase/errors";

function requireString(formData: FormData, field: string, label: string): string {
  const value = formData.get(field);
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label}を入力してください`);
  }
  return value.trim();
}

function optionalString(formData: FormData, field: string): string | null {
  const value = formData.get(field);
  if (typeof value !== "string" || value.trim().length === 0) return null;
  return value.trim();
}

export async function createShiftType(formData: FormData) {
  const store = await getCurrentStore();
  if (!store) throw new Error("店舗が見つかりません");

  const name = requireString(formData, "name", "名称");
  const startTime = requireString(formData, "start_time", "開始時刻");
  const endTime = requireString(formData, "end_time", "終了時刻");
  const color = requireString(formData, "color", "色");
  const countsTowardShiftTypeId = optionalString(formData, "counts_toward_shift_type_id");
  const weekdayPriority = formData.get("weekday_priority") === "on";

  const supabase = await createClient();
  const { error } = await supabase.from("shift_types").insert({
    store_id: store.id,
    name,
    start_time: startTime,
    end_time: endTime,
    color,
    counts_toward_shift_type_id: countsTowardShiftTypeId,
    weekday_priority: weekdayPriority,
  });

  if (error) throw toFriendlyInsertError(error, `「${name}」という名称の勤務区分は既に登録されています`);

  revalidatePath("/dashboard/shift-types");
  revalidatePath("/dashboard/staffing-requirements");
}

export async function updateShiftType(formData: FormData) {
  const store = await getCurrentStore();
  if (!store) throw new Error("店舗が見つかりません");

  const id = requireString(formData, "id", "ID");
  const name = requireString(formData, "name", "名称");
  const startTime = requireString(formData, "start_time", "開始時刻");
  const endTime = requireString(formData, "end_time", "終了時刻");
  const color = requireString(formData, "color", "色");
  const countsTowardShiftTypeId = optionalString(formData, "counts_toward_shift_type_id");
  const weekdayPriority = formData.get("weekday_priority") === "on";

  if (countsTowardShiftTypeId === id) {
    throw new Error("合算先に自分自身は選べません");
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("shift_types")
    .update({
      name,
      start_time: startTime,
      end_time: endTime,
      color,
      counts_toward_shift_type_id: countsTowardShiftTypeId,
      weekday_priority: weekdayPriority,
    })
    .eq("id", id)
    .eq("store_id", store.id);

  if (error) throw toFriendlyInsertError(error, `「${name}」という名称の勤務区分は既に登録されています`);

  revalidatePath("/dashboard/shift-types");
  revalidatePath("/dashboard/staffing-requirements");
}

export async function deleteShiftType(formData: FormData) {
  const store = await getCurrentStore();
  if (!store) throw new Error("店舗が見つかりません");

  const id = requireString(formData, "id", "ID");

  const supabase = await createClient();
  const { error } = await supabase
    .from("shift_types")
    .delete()
    .eq("id", id)
    .eq("store_id", store.id);

  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/shift-types");
}
