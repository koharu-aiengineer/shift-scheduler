import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentStore } from "@/lib/store";
import { saveDefaultRequirement, addOverride, deleteOverride } from "./actions";

export default async function StaffingRequirementsPage() {
  const store = await getCurrentStore();
  if (!store) {
    redirect("/dashboard/setup");
  }

  const supabase = await createClient();

  const { data: shiftTypes, error: shiftTypesError } = await supabase
    .from("shift_types")
    .select(
      "id, name, color, shift_staffing_requirements(required_count)",
    )
    .eq("store_id", store.id)
    .order("start_time", { ascending: true });
  if (shiftTypesError) throw new Error(shiftTypesError.message);

  const shiftTypeIds = (shiftTypes ?? []).map((st) => st.id);
  const { data: overrides, error: overridesError } = shiftTypeIds.length
    ? await supabase
        .from("shift_staffing_overrides")
        .select("id, shift_type_id, target_date, required_count")
        .in("shift_type_id", shiftTypeIds)
        .order("target_date", { ascending: true })
    : { data: [], error: null };
  if (overridesError) throw new Error(overridesError.message);

  const shiftTypeNameById = new Map(
    (shiftTypes ?? []).map((st) => [st.id as string, st.name as string]),
  );

  return (
    <main className="flex flex-col gap-8">
      <h1 className="text-xl font-bold">必要人数設定</h1>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-gray-600">
          デフォルト必要人数（全日程共通）
        </h2>
        {shiftTypes && shiftTypes.length > 0 ? (
          <table className="w-full max-w-md border-collapse text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="py-2 font-normal">勤務区分</th>
                <th className="py-2 font-normal">必要人数</th>
                <th className="py-2 font-normal"></th>
              </tr>
            </thead>
            <tbody>
              {shiftTypes.map((shiftType) => {
                const requirement = Array.isArray(
                  shiftType.shift_staffing_requirements,
                )
                  ? shiftType.shift_staffing_requirements[0]
                  : shiftType.shift_staffing_requirements;
                return (
                  <tr key={shiftType.id} className="border-b">
                    <td className="py-2">
                      <span className="inline-flex items-center gap-2">
                        <span
                          className="inline-block h-3 w-3 rounded"
                          style={{ backgroundColor: shiftType.color ?? "#9CA3AF" }}
                        />
                        {shiftType.name}
                      </span>
                    </td>
                    <td className="py-2">
                      <form action={saveDefaultRequirement} className="flex items-center gap-2">
                        <input type="hidden" name="shift_type_id" value={shiftType.id} />
                        <input
                          type="number"
                          name="required_count"
                          min={0}
                          defaultValue={requirement?.required_count ?? 0}
                          className="w-20 rounded border px-2 py-1"
                        />
                        <button
                          type="submit"
                          className="rounded border px-2 py-1 text-xs hover:bg-gray-50"
                        >
                          保存
                        </button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-gray-500">
            先に勤務区分を登録してください。
          </p>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-gray-600">特定日の上書き</h2>
        {overrides && overrides.length > 0 ? (
          <table className="w-full max-w-md border-collapse text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="py-2 font-normal">日付</th>
                <th className="py-2 font-normal">勤務区分</th>
                <th className="py-2 font-normal">必要人数</th>
                <th className="py-2 font-normal"></th>
              </tr>
            </thead>
            <tbody>
              {overrides.map((override) => (
                <tr key={override.id} className="border-b">
                  <td className="py-2">{override.target_date}</td>
                  <td className="py-2">
                    {shiftTypeNameById.get(override.shift_type_id) ?? "?"}
                  </td>
                  <td className="py-2">{override.required_count}</td>
                  <td className="py-2">
                    <form action={deleteOverride}>
                      <input type="hidden" name="id" value={override.id} />
                      <input
                        type="hidden"
                        name="shift_type_id"
                        value={override.shift_type_id}
                      />
                      <button type="submit" className="text-red-600 hover:underline">
                        削除
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-gray-500">未登録</p>
        )}

        {shiftTypes && shiftTypes.length > 0 && (
          <form action={addOverride} className="flex items-end gap-2">
            <label className="flex flex-col gap-1 text-sm">
              日付
              <input
                type="date"
                name="target_date"
                required
                className="rounded border px-2 py-1"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              勤務区分
              <select
                name="shift_type_id"
                required
                defaultValue=""
                className="rounded border px-2 py-1"
              >
                <option value="" disabled>
                  選択してください
                </option>
                {shiftTypes.map((st) => (
                  <option key={st.id} value={st.id}>
                    {st.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              必要人数
              <input
                type="number"
                name="required_count"
                min={0}
                required
                className="w-20 rounded border px-2 py-1"
              />
            </label>
            <button
              type="submit"
              className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
            >
              追加する
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
