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

export async function createEmployee(formData: FormData) {
  const store = await getCurrentStore();
  if (!store) throw new Error("店舗が見つかりません");

  const name = requireString(formData, "name", "氏名");
  const employmentTypeId = requireString(formData, "employment_type_id", "雇用形態");

  const supabase = await createClient();
  const { error } = await supabase.from("employees").insert({
    store_id: store.id,
    name,
    employment_type_id: employmentTypeId,
  });

  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/employees");
}

export async function updateEmployee(formData: FormData) {
  const store = await getCurrentStore();
  if (!store) throw new Error("店舗が見つかりません");

  const id = requireString(formData, "id", "ID");
  const name = requireString(formData, "name", "氏名");
  const employmentTypeId = requireString(formData, "employment_type_id", "雇用形態");

  const supabase = await createClient();
  const { error } = await supabase
    .from("employees")
    .update({ name, employment_type_id: employmentTypeId })
    .eq("id", id)
    .eq("store_id", store.id);

  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/employees");
}

export async function deleteEmployee(formData: FormData) {
  const store = await getCurrentStore();
  if (!store) throw new Error("店舗が見つかりません");

  const id = requireString(formData, "id", "ID");

  const supabase = await createClient();
  const { error } = await supabase
    .from("employees")
    .delete()
    .eq("id", id)
    .eq("store_id", store.id);

  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/employees");
}
