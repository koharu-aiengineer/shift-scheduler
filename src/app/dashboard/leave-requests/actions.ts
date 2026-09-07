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

async function requireOwnedEmployeeId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  storeId: string,
  employeeId: string,
) {
  const { data, error } = await supabase
    .from("employees")
    .select("id")
    .eq("id", employeeId)
    .eq("store_id", storeId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("従業員が見つかりません");
}

export async function saveNgWeekdays(formData: FormData) {
  const store = await getCurrentStore();
  if (!store) throw new Error("店舗が見つかりません");

  const employeeId = requireString(formData, "employee_id", "従業員");

  const supabase = await createClient();
  await requireOwnedEmployeeId(supabase, store.id, employeeId);

  const weekdays = [1, 2, 3, 4, 5, 6, 7].filter(
    (weekday) => formData.get(`weekday_${weekday}`) === "on",
  );

  const { error: deleteError } = await supabase
    .from("employee_ng_weekdays")
    .delete()
    .eq("employee_id", employeeId);
  if (deleteError) throw new Error(deleteError.message);

  if (weekdays.length > 0) {
    const { error: insertError } = await supabase.from("employee_ng_weekdays").insert(
      weekdays.map((weekday) => ({ employee_id: employeeId, weekday })),
    );
    if (insertError) throw new Error(insertError.message);
  }

  revalidatePath("/dashboard/leave-requests");
}

export async function addLeaveRequest(formData: FormData) {
  const store = await getCurrentStore();
  if (!store) throw new Error("店舗が見つかりません");

  const employeeId = requireString(formData, "employee_id", "従業員");
  const requestedDate = requireString(formData, "requested_date", "休み希望日");

  const supabase = await createClient();
  await requireOwnedEmployeeId(supabase, store.id, employeeId);

  const { error } = await supabase.from("employee_leave_requests").insert({
    employee_id: employeeId,
    requested_date: requestedDate,
  });

  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/leave-requests");
}

export async function deleteLeaveRequest(formData: FormData) {
  const store = await getCurrentStore();
  if (!store) throw new Error("店舗が見つかりません");

  const id = requireString(formData, "id", "ID");
  const employeeId = requireString(formData, "employee_id", "従業員");

  const supabase = await createClient();
  await requireOwnedEmployeeId(supabase, store.id, employeeId);

  const { error } = await supabase
    .from("employee_leave_requests")
    .delete()
    .eq("id", id)
    .eq("employee_id", employeeId);

  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/leave-requests");
}
