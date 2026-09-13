"use client";

import { useActionState } from "react";
import { generateAndWriteShift, type GenerateShiftState } from "./actions";

const initialState: GenerateShiftState = { status: "idle" };

export function GenerateShiftForm() {
  const [state, formAction, isPending] = useActionState(generateAndWriteShift, initialState);

  return (
    <div className="flex flex-col gap-4">
      <form action={formAction} className="flex items-end gap-2">
        <label className="flex flex-col gap-1 text-sm">
          対象月
          <input
            type="month"
            name="period"
            required
            className="rounded border px-3 py-2"
          />
        </label>
        <button
          type="submit"
          disabled={isPending}
          className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {isPending ? "生成中..." : "シフトを生成"}
        </button>
      </form>

      {state.status === "error" && (
        <p className="text-sm text-red-600">{state.error}</p>
      )}

      {state.status === "success" && (
        <div className="flex flex-col gap-3 rounded border p-4">
          <p className="text-sm">
            {state.sheetTitle}
            のシフトを生成しました。
            <a
              href={state.spreadsheetUrl}
              target="_blank"
              rel="noreferrer"
              className="ml-1 text-blue-600 hover:underline"
            >
              スプレッドシートを開く
            </a>
          </p>

          {state.violations && state.violations.length > 0 ? (
            <div className="flex flex-col gap-1">
              <h3 className="text-sm font-semibold text-gray-600">
                妥協した制約（{state.violations.length}件）
              </h3>
              <ul className="flex flex-col gap-1 text-sm text-amber-700">
                {state.violations.map((violation, index) => (
                  <li key={index}>{violation.message}</li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-sm text-gray-500">
              妥協した制約はありませんでした。
            </p>
          )}
        </div>
      )}
    </div>
  );
}
