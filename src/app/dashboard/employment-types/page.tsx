import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentStore } from "@/lib/store";
import { createEmploymentType } from "./actions";
import { EmploymentTypeForm } from "./EmploymentTypeForm";
import { EmploymentTypeRow, type EmploymentTypeListItem } from "./EmploymentTypeRow";

export default async function EmploymentTypesPage() {
  const store = await getCurrentStore();
  if (!store) {
    redirect("/dashboard/setup");
  }

  const supabase = await createClient();

  const { data: shiftTypes, error: shiftTypesError } = await supabase
    .from("shift_types")
    .select("id, name, color")
    .eq("store_id", store.id)
    .order("start_time", { ascending: true });
  if (shiftTypesError) throw new Error(shiftTypesError.message);

  const { data: employmentTypes, error: employmentTypesError } = await supabase
    .from("employment_types")
    .select(
      "id, name, employment_type_rules(max_work_days_per_week, max_work_hours_per_week, max_consecutive_work_days), employment_type_shift_restrictions(shift_type_id), employment_type_shift_staffing_requirements(shift_type_id, min_count)",
    )
    .eq("store_id", store.id)
    .order("name", { ascending: true });
  if (employmentTypesError) throw new Error(employmentTypesError.message);

  const shiftTypeNameById = new Map(
    (shiftTypes ?? []).map((st) => [st.id as string, st.name as string]),
  );

  const rows = (employmentTypes ?? []).map((et) => {
    const rule = Array.isArray(et.employment_type_rules)
      ? et.employment_type_rules[0]
      : et.employment_type_rules;

    const restrictedShiftTypeIds = (et.employment_type_shift_restrictions ?? []).map(
      (r) => r.shift_type_id as string,
    );

    const requirements: Record<string, number> = {};
    for (const req of et.employment_type_shift_staffing_requirements ?? []) {
      requirements[req.shift_type_id as string] = req.min_count as number;
    }

    const listItem: EmploymentTypeListItem = {
      id: et.id,
      name: et.name,
      maxWorkDaysPerWeek: rule?.max_work_days_per_week ?? null,
      maxWorkHoursPerWeek: rule?.max_work_hours_per_week ?? null,
      maxConsecutiveWorkDays: rule?.max_consecutive_work_days ?? null,
      restrictedShiftTypeNames: restrictedShiftTypeIds
        .map((id) => shiftTypeNameById.get(id))
        .filter((name): name is string => Boolean(name)),
      requirementSummaries: Object.entries(requirements).map(
        ([shiftTypeId, minCount]) =>
          `${shiftTypeNameById.get(shiftTypeId) ?? "?"} ${minCount}人以上`,
      ),
    };

    return {
      listItem,
      initial: {
        id: et.id,
        name: et.name,
        maxWorkDaysPerWeek: rule?.max_work_days_per_week ?? null,
        maxWorkHoursPerWeek: rule?.max_work_hours_per_week ?? null,
        maxConsecutiveWorkDays: rule?.max_consecutive_work_days ?? null,
        restrictedShiftTypeIds,
        requirements,
      },
    };
  });

  return (
    <main className="flex flex-col gap-8">
      <h1 className="text-xl font-bold">雇用形態マスタ</h1>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-gray-600">登録済み雇用形態</h2>
        {rows.length > 0 ? (
          <ul className="max-w-lg">
            {rows.map(({ listItem, initial }) => (
              <EmploymentTypeRow
                key={listItem.id}
                employmentType={listItem}
                shiftTypes={shiftTypes ?? []}
                initial={initial}
              />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-500">
            まだ雇用形態が登録されていません。
          </p>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-gray-600">雇用形態を追加</h2>
        <EmploymentTypeForm
          action={createEmploymentType}
          shiftTypes={shiftTypes ?? []}
          submitLabel="追加する"
        />
      </section>
    </main>
  );
}
