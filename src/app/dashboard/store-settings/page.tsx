import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentStore } from "@/lib/store";
import { addClosedDate, deleteClosedDate, saveClosedWeekdays } from "./actions";

const WEEKDAYS: { value: number; label: string }[] = [
  { value: 1, label: "月" },
  { value: 2, label: "火" },
  { value: 3, label: "水" },
  { value: 4, label: "木" },
  { value: 5, label: "金" },
  { value: 6, label: "土" },
  { value: 7, label: "日" },
];

export default async function StoreSettingsPage() {
  const store = await getCurrentStore();
  if (!store) {
    redirect("/dashboard/setup");
  }

  const supabase = await createClient();

  const { data: closedWeekdayRows, error: closedWeekdaysError } = await supabase
    .from("store_closed_weekdays")
    .select("weekday")
    .eq("store_id", store.id);
  if (closedWeekdaysError) throw new Error(closedWeekdaysError.message);

  const { data: closedDates, error: closedDatesError } = await supabase
    .from("store_closed_dates")
    .select("id, closed_date")
    .eq("store_id", store.id)
    .order("closed_date", { ascending: true });
  if (closedDatesError) throw new Error(closedDatesError.message);

  const closedWeekdaySet = new Set((closedWeekdayRows ?? []).map((row) => row.weekday));

  return (
    <main className="flex flex-col gap-8">
      <h1 className="text-xl font-bold">店舗設定</h1>

      <section className="flex max-w-lg flex-col gap-3">
        <h2 className="font-semibold">定休日</h2>
        <p className="text-sm text-gray-500">
          毎週決まった曜日が定休日の場合はチェックしてください。この曜日は必要人数が自動的に0になり、全従業員が休みになります。
        </p>
        <form action={saveClosedWeekdays} className="flex flex-col gap-2">
          <div className="flex gap-3">
            {WEEKDAYS.map((weekday) => (
              <label key={weekday.value} className="flex items-center gap-1 text-sm">
                <input
                  type="checkbox"
                  name={`weekday_${weekday.value}`}
                  defaultChecked={closedWeekdaySet.has(weekday.value)}
                />
                {weekday.label}
              </label>
            ))}
          </div>
          <button
            type="submit"
            className="w-fit rounded bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700"
          >
            定休日を保存
          </button>
        </form>
      </section>

      <section className="flex max-w-lg flex-col gap-3 border-t pt-6">
        <h2 className="font-semibold">特別休業日</h2>
        <p className="text-sm text-gray-500">
          年末年始など、特定の日だけ臨時休業する場合はここに追加してください。この日も必要人数が自動的に0になります。
        </p>
        {closedDates && closedDates.length > 0 ? (
          <ul className="flex flex-col gap-1">
            {closedDates.map((closedDate) => (
              <li key={closedDate.id} className="flex items-center gap-2 text-sm">
                {closedDate.closed_date}
                <form action={deleteClosedDate}>
                  <input type="hidden" name="id" value={closedDate.id} />
                  <button type="submit" className="text-red-600 hover:underline">
                    削除
                  </button>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-500">未登録</p>
        )}
        <form action={addClosedDate} className="flex items-center gap-2">
          <input
            type="date"
            name="closed_date"
            required
            className="rounded border px-2 py-1 text-sm"
          />
          <button type="submit" className="rounded border px-3 py-1 text-sm hover:bg-gray-50">
            追加
          </button>
        </form>
      </section>
    </main>
  );
}
