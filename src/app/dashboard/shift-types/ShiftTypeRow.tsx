"use client";

import { useState } from "react";
import { updateShiftType, deleteShiftType } from "./actions";

type ShiftType = {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  color: string | null;
};

export function ShiftTypeRow({ shiftType }: { shiftType: ShiftType }) {
  const [isEditing, setIsEditing] = useState(false);

  if (isEditing) {
    return (
      <tr className="border-b">
        <td colSpan={5} className="py-2">
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
