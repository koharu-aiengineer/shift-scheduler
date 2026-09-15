"use client";

import { useState } from "react";
import { EmployeeLeaveSection, type LeaveRequest } from "./EmployeeLeaveSection";

export type EmployeeLeaveGroup = {
  employmentTypeId: string;
  employmentTypeName: string;
  employees: {
    employeeId: string;
    employeeName: string;
    ngWeekdays: number[];
    leaveRequests: LeaveRequest[];
  }[];
};

export function LeaveRequestsTabs({ groups }: { groups: EmployeeLeaveGroup[] }) {
  const [activeTypeId, setActiveTypeId] = useState(groups[0].employmentTypeId);
  const activeGroup = groups.find((g) => g.employmentTypeId === activeTypeId) ?? groups[0];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex gap-1 border-b">
        {groups.map((group) => (
          <button
            key={group.employmentTypeId}
            type="button"
            onClick={() => setActiveTypeId(group.employmentTypeId)}
            className={
              group.employmentTypeId === activeGroup.employmentTypeId
                ? "border-b-2 border-blue-600 px-4 py-2 text-sm font-semibold text-blue-600"
                : "border-b-2 border-transparent px-4 py-2 text-sm text-gray-500 hover:text-gray-700"
            }
          >
            {group.employmentTypeName}（{group.employees.length}名）
          </button>
        ))}
      </div>

      {activeGroup.employees.length > 0 ? (
        <div className="flex flex-col gap-8">
          {activeGroup.employees.map((employee) => (
            <EmployeeLeaveSection
              key={employee.employeeId}
              employeeId={employee.employeeId}
              employeeName={employee.employeeName}
              ngWeekdays={employee.ngWeekdays}
              leaveRequests={employee.leaveRequests}
            />
          ))}
        </div>
      ) : (
        <p className="text-sm text-gray-500">この雇用形態の従業員はいません。</p>
      )}
    </div>
  );
}
