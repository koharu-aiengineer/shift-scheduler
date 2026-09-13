import { redirect } from "next/navigation";
import { getCurrentStore } from "@/lib/store";
import { GenerateShiftForm } from "./GenerateShiftForm";

export default async function ShiftPage() {
  const store = await getCurrentStore();
  if (!store) {
    redirect("/dashboard/setup");
  }

  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-xl font-bold">シフト生成</h1>
      <p className="text-sm text-gray-600">
        対象月を選んで生成すると、店舗の出力用スプレッドシート内にその月のタブが作成（既にあれば上書き）されます。
      </p>
      <GenerateShiftForm />
    </main>
  );
}
