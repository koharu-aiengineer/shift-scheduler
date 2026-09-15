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

function optionalInt(formData: FormData, field: string): number | null {
  const value = formData.get(field);
  if (typeof value !== "string" || value.trim().length === 0) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function optionalFloat(formData: FormData, field: string): number | null {
  const value = formData.get(field);
  if (typeof value !== "string" || value.trim().length === 0) return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

type ShiftSetting = {
  shiftTypeId: string;
  restricted: boolean;
  minCount: number | null;
};

function collectShiftSettings(
  formData: FormData,
  shiftTypeIds: string[],
): ShiftSetting[] {
  return shiftTypeIds.map((shiftTypeId) => {
    const restricted = formData.get(`restrict_${shiftTypeId}`) === "on";
    const minCountRaw = formData.get(`min_${shiftTypeId}`);
    const minCount =
      typeof minCountRaw === "string" && minCountRaw.trim().length > 0
        ? Number.parseInt(minCountRaw, 10)
        : null;
    return { shiftTypeId, restricted, minCount: minCount && minCount > 0 ? minCount : null };
  });
}

async function saveShiftSettings(
  supabase: Awaited<ReturnType<typeof createClient>>,
  employmentTypeId: string,
  settings: ShiftSetting[],
) {
  const { error: deleteRestrictionsError } = await supabase
    .from("employment_type_shift_restrictions")
    .delete()
    .eq("employment_type_id", employmentTypeId);
  if (deleteRestrictionsError) throw new Error(deleteRestrictionsError.message);

  const { error: deleteRequirementsError } = await supabase
    .from("employment_type_shift_staffing_requirements")
    .delete()
    .eq("employment_type_id", employmentTypeId);
  if (deleteRequirementsError) throw new Error(deleteRequirementsError.message);

  const restrictions = settings
    .filter((s) => s.restricted)
    .map((s) => ({ employment_type_id: employmentTypeId, shift_type_id: s.shiftTypeId }));
  if (restrictions.length > 0) {
    const { error } = await supabase
      .from("employment_type_shift_restrictions")
      .insert(restrictions);
    if (error) throw new Error(error.message);
  }

  const requirements = settings
    .filter((s) => s.minCount !== null)
    .map((s) => ({
      employment_type_id: employmentTypeId,
      shift_type_id: s.shiftTypeId,
      min_count: s.minCount,
    }));
  if (requirements.length > 0) {
    const { error } = await supabase
      .from("employment_type_shift_staffing_requirements")
      .insert(requirements);
    if (error) throw new Error(error.message);
  }
}

export async function createEmploymentType(formData: FormData) {
  const store = await getCurrentStore();
  if (!store) throw new Error("店舗が見つかりません");

  const name = requireString(formData, "name", "名称");
  const maxWorkDaysPerWeek = optionalInt(formData, "max_work_days_per_week");
  const maxWorkHoursPerWeek = optionalFloat(formData, "max_work_hours_per_week");
  const maxConsecutiveWorkDays = optionalInt(formData, "max_consecutive_work_days");

  const supabase = await createClient();

  const { data: shiftTypes, error: shiftTypesError } = await supabase
    .from("shift_types")
    .select("id")
    .eq("store_id", store.id);
  if (shiftTypesError) throw new Error(shiftTypesError.message);

  const { data: employmentType, error } = await supabase
    .from("employment_types")
    .insert({ store_id: store.id, name })
    .select("id")
    .single();
  if (error) throw toFriendlyInsertError(error, `「${name}」という名称の雇用形態は既に登録されています`);

  const { error: ruleError } = await supabase.from("employment_type_rules").insert({
    employment_type_id: employmentType.id,
    max_work_days_per_week: maxWorkDaysPerWeek,
    max_work_hours_per_week: maxWorkHoursPerWeek,
    max_consecutive_work_days: maxConsecutiveWorkDays,
  });
  if (ruleError) throw new Error(ruleError.message);

  const shiftTypeIds = (shiftTypes ?? []).map((st) => st.id as string);
  const settings = collectShiftSettings(formData, shiftTypeIds);
  await saveShiftSettings(supabase, employmentType.id, settings);

  revalidatePath("/dashboard/employment-types");
}

export async function updateEmploymentType(formData: FormData) {
  const store = await getCurrentStore();
  if (!store) throw new Error("店舗が見つかりません");

  const id = requireString(formData, "id", "ID");
  const name = requireString(formData, "name", "名称");
  const maxWorkDaysPerWeek = optionalInt(formData, "max_work_days_per_week");
  const maxWorkHoursPerWeek = optionalFloat(formData, "max_work_hours_per_week");
  const maxConsecutiveWorkDays = optionalInt(formData, "max_consecutive_work_days");

  const supabase = await createClient();

  const { data: shiftTypes, error: shiftTypesError } = await supabase
    .from("shift_types")
    .select("id")
    .eq("store_id", store.id);
  if (shiftTypesError) throw new Error(shiftTypesError.message);

  const { error } = await supabase
    .from("employment_types")
    .update({ name })
    .eq("id", id)
    .eq("store_id", store.id);
  if (error) throw toFriendlyInsertError(error, `「${name}」という名称の雇用形態は既に登録されています`);

  const { error: ruleError } = await supabase
    .from("employment_type_rules")
    .update({
      max_work_days_per_week: maxWorkDaysPerWeek,
      max_work_hours_per_week: maxWorkHoursPerWeek,
      max_consecutive_work_days: maxConsecutiveWorkDays,
    })
    .eq("employment_type_id", id);
  if (ruleError) throw new Error(ruleError.message);

  const shiftTypeIds = (shiftTypes ?? []).map((st) => st.id as string);
  const settings = collectShiftSettings(formData, shiftTypeIds);
  await saveShiftSettings(supabase, id, settings);

  revalidatePath("/dashboard/employment-types");
}

export async function deleteEmploymentType(formData: FormData) {
  const store = await getCurrentStore();
  if (!store) throw new Error("店舗が見つかりません");

  const id = requireString(formData, "id", "ID");

  const supabase = await createClient();
  const { error } = await supabase
    .from("employment_types")
    .delete()
    .eq("id", id)
    .eq("store_id", store.id);

  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/employment-types");
}
