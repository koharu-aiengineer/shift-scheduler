import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentStore } from "@/lib/store";
import { LeaveRequestsTabs, type EmployeeLeaveGroup } from "./LeaveRequestsTabs";

export default async function LeaveRequestsPage() {
  const store = await getCurrentStore();
  if (!store) {
    redirect("/dashboard/setup");
  }

  const supabase = await createClient();

  // 雇用形態の登録順（作成日時が古い順）→ 氏名順に並べる。従業員一覧・シフト生成
  // 画面と同じ並び順にするため、特定の名称をハードコードせずに「基幹となる
  // 雇用形態から登録していく」慣習に乗せている。supabase-jsの
  // .order(col, {foreignTable})は埋め込み配列(1対多)の並び順用で、多対1の
  // 関連先では親行の並びに効かないため、PostgRESTの埋め込みリソース記法を
  // そのままカラム名として.order()に渡す（他画面と同じ書き方）。
  const { data: employees, error: employeesError } = await supabase
    .from("employees")
    .select(
      "id, name, employment_type_id, employment_types(name, created_at), employee_ng_weekdays(weekday), employee_leave_requests(id, requested_date)",
    )
    .eq("store_id", store.id)
    .order("employment_types(created_at)", { ascending: true })
    .order("name", { ascending: true });
  if (employeesError) throw new Error(employeesError.message);

  // 雇用形態タブ（社員→パート→アルバイトのように登録順）ごとに従業員をまとめる。
  // employeesは既に雇用形態の登録順→氏名順で並んでいるため、出現順に
  // グルーピングするだけでタブの順序もそのまま維持される。
  const groups: EmployeeLeaveGroup[] = [];
  const groupIndexByEmploymentTypeId = new Map<string, number>();
  for (const employee of employees ?? []) {
    const employmentType = Array.isArray(employee.employment_types)
      ? employee.employment_types[0]
      : employee.employment_types;
    const employmentTypeId = employee.employment_type_id;
    const employmentTypeName = employmentType?.name ?? "?";

    let groupIndex = groupIndexByEmploymentTypeId.get(employmentTypeId);
    if (groupIndex === undefined) {
      groupIndex = groups.length;
      groupIndexByEmploymentTypeId.set(employmentTypeId, groupIndex);
      groups.push({ employmentTypeId, employmentTypeName, employees: [] });
    }

    groups[groupIndex].employees.push({
      employeeId: employee.id,
      employeeName: employee.name,
      ngWeekdays: (employee.employee_ng_weekdays ?? []).map((w) => w.weekday as number),
      leaveRequests: (employee.employee_leave_requests ?? [])
        .map((r) => ({ id: r.id as string, requestedDate: r.requested_date as string }))
        .sort((a, b) => a.requestedDate.localeCompare(b.requestedDate)),
    });
  }

  return (
    <main className="flex flex-col gap-8">
      <h1 className="text-xl font-bold">休み希望・NG曜日</h1>

      {groups.length > 0 ? (
        <LeaveRequestsTabs groups={groups} />
      ) : (
        <p className="text-sm text-gray-500">
          先に従業員を登録してください。
        </p>
      )}
    </main>
  );
}
