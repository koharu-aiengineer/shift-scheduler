import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentStore } from "@/lib/store";
import { EmployeeLeaveSection } from "./EmployeeLeaveSection";

export default async function LeaveRequestsPage() {
  const store = await getCurrentStore();
  if (!store) {
    redirect("/dashboard/setup");
  }

  const supabase = await createClient();

  const { data: employees, error: employeesError } = await supabase
    .from("employees")
    .select(
      "id, name, employee_ng_weekdays(weekday), employee_leave_requests(id, requested_date)",
    )
    .eq("store_id", store.id)
    .order("name", { ascending: true });
  if (employeesError) throw new Error(employeesError.message);

  return (
    <main className="flex flex-col gap-8">
      <h1 className="text-xl font-bold">休み希望・NG曜日</h1>

      {employees && employees.length > 0 ? (
        <div className="flex flex-col gap-8">
          {employees.map((employee) => (
            <EmployeeLeaveSection
              key={employee.id}
              employeeId={employee.id}
              employeeName={employee.name}
              ngWeekdays={(employee.employee_ng_weekdays ?? []).map(
                (w) => w.weekday as number,
              )}
              leaveRequests={(employee.employee_leave_requests ?? [])
                .map((r) => ({
                  id: r.id as string,
                  requestedDate: r.requested_date as string,
                }))
                .sort((a, b) => a.requestedDate.localeCompare(b.requestedDate))}
            />
          ))}
        </div>
      ) : (
        <p className="text-sm text-gray-500">
          先に従業員を登録してください。
        </p>
      )}
    </main>
  );
}
