import { redirect } from "next/navigation";
import { getCurrentStore } from "@/lib/store";
import { createStore } from "./actions";

export default async function SetupPage() {
  const store = await getCurrentStore();
  if (store) {
    redirect("/dashboard");
  }

  return (
    <main className="flex flex-col items-center justify-center gap-4 py-24">
      <h1 className="text-xl font-bold">店舗の初期設定</h1>
      <form action={createStore} className="flex w-full max-w-sm flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          店舗名
          <input
            name="name"
            required
            className="rounded border px-3 py-2"
            placeholder="例: 〇〇店"
          />
        </label>
        <button
          type="submit"
          className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
        >
          作成する
        </button>
      </form>
    </main>
  );
}
