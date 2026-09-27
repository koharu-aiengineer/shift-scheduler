"use client";

import { useState } from "react";
import {
  EmploymentTypeForm,
  type EmploymentTypeInitialValues,
} from "./EmploymentTypeForm";
import { updateEmploymentType, deleteEmploymentType } from "./actions";

type ShiftType = {
  id: string;
  name: string;
  color: string | null;
};

export type EmploymentTypeListItem = {
  id: string;
  name: string;
  maxWorkDaysPerWeek: number | null;
  maxWorkHoursPerWeek: number | null;
  maxConsecutiveWorkDays: number | null;
  targetMonthlyHours: number | null;
  restrictedShiftTypeNames: string[];
  requirementSummaries: string[];
  weekendMaxSummaries: string[];
};

export function EmploymentTypeRow({
  employmentType,
  shiftTypes,
  initial,
}: {
  employmentType: EmploymentTypeListItem;
  shiftTypes: ShiftType[];
  initial: EmploymentTypeInitialValues;
}) {
  const [isEditing, setIsEditing] = useState(false);

  if (isEditing) {
    return (
      <li className="border-b py-4">
        <EmploymentTypeForm
          action={async (formData) => {
            await updateEmploymentType(formData);
            setIsEditing(false);
          }}
          shiftTypes={shiftTypes}
          initial={initial}
          submitLabel="保存"
          onCancel={() => setIsEditing(false)}
        />
      </li>
    );
  }

  return (
    <li className="flex flex-col gap-1 border-b py-4">
      <div className="flex items-center gap-3">
        <span className="font-semibold">{employmentType.name}</span>
        <button
          onClick={() => setIsEditing(true)}
          className="text-sm text-blue-600 hover:underline"
        >
          編集
        </button>
        <form action={deleteEmploymentType}>
          <input type="hidden" name="id" value={employmentType.id} />
          <button type="submit" className="text-sm text-red-600 hover:underline">
            削除
          </button>
        </form>
      </div>
      <div className="text-sm text-gray-600">
        週最大勤務日数: {employmentType.maxWorkDaysPerWeek ?? "未設定"} / 週最大勤務時間:{" "}
        {employmentType.maxWorkHoursPerWeek ?? "未設定"} / 連勤上限:{" "}
        {employmentType.maxConsecutiveWorkDays ?? "未設定"} / 月間目標時間:{" "}
        {employmentType.targetMonthlyHours ?? "未設定"}
      </div>
      {employmentType.restrictedShiftTypeNames.length > 0 && (
        <div className="text-sm text-gray-600">
          入れない勤務区分: {employmentType.restrictedShiftTypeNames.join("、")}
        </div>
      )}
      {employmentType.requirementSummaries.length > 0 && (
        <div className="text-sm text-gray-600">
          必須配置人数: {employmentType.requirementSummaries.join("、")}
        </div>
      )}
      {employmentType.weekendMaxSummaries.length > 0 && (
        <div className="text-sm text-gray-600">
          土日の上限人数: {employmentType.weekendMaxSummaries.join("、")}
        </div>
      )}
    </li>
  );
}
