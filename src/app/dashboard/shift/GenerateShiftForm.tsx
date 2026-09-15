"use client";

import { useActionState, useState } from "react";
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
      <p className="text-xs text-gray-500">
        対象月に既に生成済みのタブがある場合、その内容（スプレッドシート上での手動修正を含む）は上書きされます。
      </p>

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

          {state.employeeShiftSummary && state.employeeShiftSummary.length > 0 && (
            <div className="flex flex-col gap-1">
              <h3 className="text-sm font-semibold text-gray-600">
                従業員別 出勤日数（店長画面のみの表示。出力用シートには含まれません）
              </h3>
              <div className="max-h-64 overflow-y-auto rounded border">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 bg-white">
                    <tr className="border-b text-gray-500">
                      <th className="px-2 py-1 font-normal">氏名</th>
                      {state.employeeShiftSummary[0].shiftCounts.map((c) => (
                        <th key={c.shiftTypeId} className="px-2 py-1 font-normal">
                          {c.shiftTypeName}
                        </th>
                      ))}
                      <th className="px-2 py-1 font-normal">休み</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.employeeShiftSummary.map((employee) => (
                      <tr key={employee.employeeId} className="border-b last:border-0">
                        <td className="px-2 py-1">{employee.employeeName}</td>
                        {employee.shiftCounts.map((c) => (
                          <td key={c.shiftTypeId} className="px-2 py-1">
                            {c.count}日
                          </td>
                        ))}
                        <td className="px-2 py-1">{employee.leaveDaysCount}日</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

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

          <div className="flex flex-col gap-2 border-t pt-3">
            <p className="text-xs text-gray-500">
              再生成すると、{state.sheetTitle}
              タブの内容（スプレッドシート上での手動修正を含む）が別パターンで上書きされます。手動修正が完了した後は再生成しないでください。
            </p>
            {/* generatedAtをkeyにして、生成が完了するたびに確認状態をリセットする */}
            <RegenerateButton
              key={state.generatedAt}
              formAction={formAction}
              period={state.sheetTitle!}
              isPending={isPending}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function RegenerateButton({
  formAction,
  period,
  isPending,
}: {
  formAction: (formData: FormData) => void;
  period: string;
  isPending: boolean;
}) {
  const [isConfirming, setIsConfirming] = useState(false);

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="period" value={period} />
      {isConfirming ? (
        <>
          <button
            type="submit"
            disabled={isPending}
            className="rounded bg-amber-600 px-4 py-2 text-sm text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {isPending ? "生成中..." : "本当に上書きしますか？（クリックで実行）"}
          </button>
          <button
            type="button"
            onClick={() => setIsConfirming(false)}
            className="rounded border px-4 py-2 text-sm hover:bg-gray-50"
          >
            キャンセル
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setIsConfirming(true)}
          disabled={isPending}
          className="rounded border px-4 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
        >
          再生成
        </button>
      )}
    </form>
  );
}
