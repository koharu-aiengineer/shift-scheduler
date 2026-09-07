"use client";

import { saveNgWeekdays, addLeaveRequest, deleteLeaveRequest } from "./actions";

const WEEKDAYS: { value: number; label: string }[] = [
  { value: 1, label: "月" },
  { value: 2, label: "火" },
  { value: 3, label: "水" },
  { value: 4, label: "木" },
  { value: 5, label: "金" },
  { value: 6, label: "土" },
  { value: 7, label: "日" },
];

export type LeaveRequest = {
  id: string;
  requestedDate: string;
};

export function EmployeeLeaveSection({
  employeeId,
  employeeName,
  ngWeekdays,
  leaveRequests,
}: {
  employeeId: string;
  employeeName: string;
  ngWeekdays: number[];
  leaveRequests: LeaveRequest[];
}) {
  const ngSet = new Set(ngWeekdays);

  return (
    <section className="flex max-w-lg flex-col gap-3 border-b pb-6">
      <h2 className="font-semibold">{employeeName}</h2>

      <form action={saveNgWeekdays} className="flex flex-col gap-2">
        <input type="hidden" name="employee_id" value={employeeId} />
        <span className="text-sm text-gray-600">NG曜日</span>
        <div className="flex gap-3">
          {WEEKDAYS.map((weekday) => (
            <label key={weekday.value} className="flex items-center gap-1 text-sm">
              <input
                type="checkbox"
                name={`weekday_${weekday.value}`}
                defaultChecked={ngSet.has(weekday.value)}
              />
              {weekday.label}
            </label>
          ))}
        </div>
        <button
          type="submit"
          className="w-fit rounded bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700"
        >
          NG曜日を保存
        </button>
      </form>

      <div className="flex flex-col gap-2">
        <span className="text-sm text-gray-600">休み希望日</span>
        {leaveRequests.length > 0 ? (
          <ul className="flex flex-col gap-1">
            {leaveRequests.map((leaveRequest) => (
              <li key={leaveRequest.id} className="flex items-center gap-2 text-sm">
                {leaveRequest.requestedDate}
                <form action={deleteLeaveRequest}>
                  <input type="hidden" name="id" value={leaveRequest.id} />
                  <input type="hidden" name="employee_id" value={employeeId} />
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
        <form action={addLeaveRequest} className="flex items-center gap-2">
          <input type="hidden" name="employee_id" value={employeeId} />
          <input
            type="date"
            name="requested_date"
            required
            className="rounded border px-2 py-1 text-sm"
          />
          <button
            type="submit"
            className="rounded border px-3 py-1 text-sm hover:bg-gray-50"
          >
            追加
          </button>
        </form>
      </div>
    </section>
  );
}
