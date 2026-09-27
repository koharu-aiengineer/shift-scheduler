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
    .select("id, name, start_time, end_time, color, counts_toward_shift_type_id, weekday_priority")
    .eq("store_id", store.id)
    .order("start_time", { ascending: true });

  if (error) throw new Error(error.message);

  const nextAutoColor = pickAutoColor(shiftTypes?.length ?? 0);
  // 合算先の選択肢は「まだ自分自身が合算先を持たない（＝ルート）」勤務区分のみ。
  // 親がさらに別の親を持つ2段階以上の連鎖を防ぐための制限。
  const countsTowardOptions = (shiftTypes ?? []).filter((st) => !st.counts_toward_shift_type_id);

  return (
    <main className="flex flex-col gap-8">
      <h1 className="text-xl font-bold">勤務区分マスタ</h1>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-gray-600">登録済み勤務区分</h2>
        {shiftTypes && shiftTypes.length > 0 ? (
          <table className="w-full max-w-3xl border-collapse text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="py-2 font-normal">色</th>
                <th className="py-2 font-normal">名称</th>
                <th className="py-2 font-normal">開始</th>
                <th className="py-2 font-normal">終了</th>
                <th className="py-2 font-normal">合算先</th>
                <th className="py-2 font-normal">平日優先</th>
                <th className="py-2 font-normal"></th>
              </tr>
            </thead>
            <tbody>
              {shiftTypes.map((shiftType) => (
                <ShiftTypeRow
                  key={shiftType.id}
                  shiftType={shiftType}
                  countsTowardOptions={countsTowardOptions.filter((o) => o.id !== shiftType.id)}
                  countsTowardName={
                    shiftType.counts_toward_shift_type_id
                      ? (shiftTypes.find((st) => st.id === shiftType.counts_toward_shift_type_id)?.name ?? null)
                      : null
                  }
                />
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
          <label className="flex flex-col gap-1 text-sm">
            合算先（任意）
            <select
              name="counts_toward_shift_type_id"
              defaultValue=""
              className="rounded border px-3 py-2"
            >
              <option value="">なし（この勤務区分で独立して必要人数を設定）</option>
              {countsTowardOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}の人数に合算する
                </option>
              ))}
            </select>
            <span className="text-xs text-gray-500">
              選ぶと、必要人数設定ではこの勤務区分は表示されず、合算先の必要人数の一部として扱われます。
            </span>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="weekday_priority" className="h-4 w-4" />
            平日はこの勤務区分を優先的に埋める
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
