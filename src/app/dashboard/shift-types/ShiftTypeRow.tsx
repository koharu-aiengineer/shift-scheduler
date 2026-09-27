"use client";

import { useState } from "react";
import { updateShiftType, deleteShiftType } from "./actions";

type ShiftType = {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  color: string | null;
  counts_toward_shift_type_id: string | null;
  weekday_priority: boolean;
};

type CountsTowardOption = { id: string; name: string };

export function ShiftTypeRow({
  shiftType,
  countsTowardOptions,
  countsTowardName,
}: {
  shiftType: ShiftType;
  countsTowardOptions: CountsTowardOption[];
  countsTowardName: string | null;
}) {
  const [isEditing, setIsEditing] = useState(false);

  if (isEditing) {
    return (
      <tr className="border-b">
        <td colSpan={7} className="py-2">
          <form
            action={async (formData) => {
              await updateShiftType(formData);
              setIsEditing(false);
            }}
            className="flex flex-wrap items-center gap-2"
          >
            <input type="hidden" name="id" value={shiftType.id} />
            <input
              type="color"
              name="color"
              defaultValue={shiftType.color ?? "#9CA3AF"}
              className="h-9 w-12 rounded border"
            />
            <input
              name="name"
              defaultValue={shiftType.name}
              required
              className="rounded border px-2 py-1"
            />
            <input
              type="time"
              name="start_time"
              defaultValue={shiftType.start_time.slice(0, 5)}
              required
              className="rounded border px-2 py-1"
            />
            <input
              type="time"
              name="end_time"
              defaultValue={shiftType.end_time.slice(0, 5)}
              required
              className="rounded border px-2 py-1"
            />
            <select
              name="counts_toward_shift_type_id"
              defaultValue={shiftType.counts_toward_shift_type_id ?? ""}
              className="rounded border px-2 py-1"
            >
              <option value="">合算先なし</option>
              {countsTowardOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}に合算
                </option>
              ))}
            </select>
            <label className="flex items-center gap-1 text-sm">
              <input
                type="checkbox"
                name="weekday_priority"
                defaultChecked={shiftType.weekday_priority}
                className="h-4 w-4"
              />
              平日優先
            </label>
            <button
              type="submit"
              className="rounded bg-blue-600 px-3 py-1 text-white hover:bg-blue-700"
            >
              保存
            </button>
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="rounded border px-3 py-1"
            >
              キャンセル
            </button>
          </form>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b">
      <td className="py-2">
        <span
          className="inline-block h-5 w-5 rounded border"
          style={{ backgroundColor: shiftType.color ?? "#9CA3AF" }}
        />
      </td>
      <td className="py-2">{shiftType.name}</td>
      <td className="py-2">{shiftType.start_time.slice(0, 5)}</td>
      <td className="py-2">{shiftType.end_time.slice(0, 5)}</td>
      <td className="py-2 text-gray-500">
        {countsTowardName ? `→ ${countsTowardName}に合算` : "—"}
      </td>
      <td className="py-2 text-gray-500">{shiftType.weekday_priority ? "○" : "—"}</td>
      <td className="flex gap-3 py-2">
        <button
          onClick={() => setIsEditing(true)}
          className="text-blue-600 hover:underline"
        >
          編集
        </button>
        <form action={deleteShiftType}>
          <input type="hidden" name="id" value={shiftType.id} />
          <button type="submit" className="text-red-600 hover:underline">
            削除
          </button>
        </form>
      </td>
    </tr>
  );
}
