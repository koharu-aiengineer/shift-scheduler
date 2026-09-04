"use client";

import { useState } from "react";
import { EmployeeForm } from "./EmployeeForm";
import { updateEmployee, deleteEmployee } from "./actions";

type EmploymentType = {
  id: string;
  name: string;
};

export type EmployeeListItem = {
  id: string;
  name: string;
  employmentTypeId: string;
  employmentTypeName: string;
};

export function EmployeeRow({
  employee,
  employmentTypes,
}: {
  employee: EmployeeListItem;
  employmentTypes: EmploymentType[];
}) {
  const [isEditing, setIsEditing] = useState(false);

  if (isEditing) {
    return (
      <tr className="border-b">
        <td colSpan={3} className="py-2">
          <EmployeeForm
            action={async (formData) => {
              await updateEmployee(formData);
              setIsEditing(false);
            }}
            employmentTypes={employmentTypes}
            initial={{
              id: employee.id,
              name: employee.name,
              employmentTypeId: employee.employmentTypeId,
            }}
            submitLabel="保存"
            onCancel={() => setIsEditing(false)}
          />
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b">
      <td className="py-2">{employee.name}</td>
      <td className="py-2">{employee.employmentTypeName}</td>
      <td className="flex gap-3 py-2">
        <button
          onClick={() => setIsEditing(true)}
          className="text-blue-600 hover:underline"
        >
          編集
        </button>
        <form action={deleteEmployee}>
          <input type="hidden" name="id" value={employee.id} />
          <button type="submit" className="text-red-600 hover:underline">
            削除
          </button>
        </form>
      </td>
    </tr>
  );
}
