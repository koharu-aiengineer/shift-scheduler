import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentStore } from "@/lib/store";
import { pickAutoColor } from "@/lib/colors";
import { createShiftType } from "./actions";
import { ShiftTypeRow } from "./ShiftTypeRow";

export default async function ShiftTypesPage() {
  const store = await getCurrentStore();
  if (!store) {
    redirect("/dashboard/setup");
  }

  const supabase = await createClient();
  const { data: shiftTypes, error } = await supabase
    .from("shift_types")
    .select("id, name, start_time, end_time, color")
    .eq("store_id", store.id)
    .order("start_time", { ascending: true });

  if (error) throw new Error(error.message);

  const nextAutoColor = pickAutoColor(shiftTypes?.length ?? 0);

  return (
    <main className="flex flex-col gap-8">
      <h1 className="text-xl font-bold">勤務区分マスタ</h1>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-gray-600">登録済み勤務区分</h2>
        {shiftTypes && shiftTypes.length > 0 ? (
          <table className="w-full max-w-2xl border-collapse text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="py-2 font-normal">色</th>
                <th className="py-2 font-normal">名称</th>
                <th className="py-2 font-normal">開始</th>
                <th className="py-2 font-normal">終了</th>
                <th className="py-2 font-normal"></th>
              </tr>
            </thead>
            <tbody>
              {shiftTypes.map((shiftType) => (
                <ShiftTypeRow key={shiftType.id} shiftType={shiftType} />
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-gray-500">
            まだ勤務区分が登録されていません。
          </p>
        )}
      </section>

      <section className="flex max-w-sm flex-col gap-3">
        <h2 className="text-sm font-semibold text-gray-600">勤務区分を追加</h2>
        <form action={createShiftType} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            名称
            <input
              name="name"
              required
              className="rounded border px-3 py-2"
              placeholder="例: 日勤A"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            開始時刻
            <input
              type="time"
              name="start_time"
              required
              className="rounded border px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            終了時刻
            <input
              type="time"
              name="end_time"
              required
              className="rounded border px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            色（未指定なら自動で割り当てます。後から変更可能）
            <input
              type="color"
              name="color"
              defaultValue={nextAutoColor}
              className="h-10 w-16 rounded border"
            />
          </label>
          <button
            type="submit"
            className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
          >
            追加する
          </button>
        </form>
      </section>
    </main>
  );
}
