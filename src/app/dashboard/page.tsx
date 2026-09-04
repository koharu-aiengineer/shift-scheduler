import { redirect } from "next/navigation";
import { getCurrentStore } from "@/lib/store";

export default async function DashboardPage() {
  const store = await getCurrentStore();

  if (!store) {
    redirect("/dashboard/setup");
  }

  redirect("/dashboard/shift-types");
}
