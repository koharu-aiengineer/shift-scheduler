"use client";

import { useActionState, useState } from "react";
import {
  generateAndWriteShift,
  generatePrintSheet,
  refreshEmployeeShiftSummary,
  type GenerateShiftState,
} from "./actions";

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

      {/*
        state.sheetTitleをkeyにして、生成した対象月が変わるたびに入力欄のdefaultValueと
        集計結果をリセットする。シフト生成の成否や画面遷移（ページ再読み込み含む）に
        依存しない独立したセクションにしているのは、店長がスプレッドシート上で手直しした
        「後日」戻ってきても出勤日数を確認できるようにするため
        （生成直後の一時的な画面状態としてだけ持たせると、ページを離れると消えてしまうため）。
      */}
      <EmployeeSummaryChecker key={`summary-${state.sheetTitle}`} defaultPeriod={state.sheetTitle} />

      {/* 理由はEmployeeSummaryCheckerと同じ（生成直後の一時的な画面状態に留めない）。
          keyの接頭辞を分けているのは、同じstate.sheetTitleを使う上のコンポーネントと
          keyが重複してReactが子要素を混同するのを防ぐため。 */}
      <PrintSheetGenerator key={`print-${state.sheetTitle}`} defaultPeriod={state.sheetTitle} />
    </div>
  );
}

function EmployeeSummaryChecker({ defaultPeriod }: { defaultPeriod?: string }) {
  const [refreshState, refreshAction, isRefreshPending] = useActionState(
    refreshEmployeeShiftSummary,
    { status: "idle" as const },
  );

  return (
    <div className="flex flex-col gap-3 rounded border p-4">
      <h2 className="text-base font-bold">出勤日数を確認</h2>
      <p className="text-xs text-gray-500">
        既にシフトを生成済みの月を選ぶと、出力用スプレッドシートの現在の内容（スプレッドシート上での手動修正を含む）から従業員別の出勤日数・休み日数を集計します（店長画面のみの表示。出力用シートには含まれません）。
      </p>
      <form action={refreshAction} className="flex items-end gap-2">
        <label className="flex flex-col gap-1 text-sm">
          対象月
          <input
            type="month"
            name="period"
            required
            defaultValue={defaultPeriod}
            className="rounded border px-3 py-2"
          />
        </label>
        <button
          type="submit"
          disabled={isRefreshPending}
          className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {isRefreshPending ? "集計中..." : "集計を表示"}
        </button>
      </form>

      {refreshState.status === "error" && (
        <p className="text-sm text-red-600">{refreshState.error}</p>
      )}

      {refreshState.status === "success" &&
        refreshState.employeeShiftSummary &&
        refreshState.employeeShiftSummary.length > 0 && (
          <div className="max-h-64 overflow-y-auto rounded border">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-white">
                <tr className="border-b text-gray-500">
                  <th className="px-2 py-1 font-normal">氏名</th>
                  {refreshState.employeeShiftSummary[0].shiftCounts.map((c) => (
                    <th key={c.shiftTypeId} className="px-2 py-1 font-normal">
                      {c.shiftTypeName}
                    </th>
                  ))}
                  <th className="px-2 py-1 font-normal">休み</th>
                </tr>
              </thead>
              <tbody>
                {refreshState.employeeShiftSummary.map((employee) => (
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
        )}
    </div>
  );
}

function PrintSheetGenerator({ defaultPeriod }: { defaultPeriod?: string }) {
  const [printState, printAction, isPrintPending] = useActionState(generatePrintSheet, {
    status: "idle" as const,
  });

  return (
    <div className="flex flex-col gap-3 rounded border p-4">
      <h2 className="text-base font-bold">印刷用シートを作成</h2>
      <p className="text-xs text-gray-500">
        通常タブ（対象月。スプレッドシート上での手動修正を含む）の現在の内容から、印刷・画像化しやすい表（1文字コード＋色分け＋凡例）を、同じスプレッドシート内の別タブに作成します。集計欄は含みません。
      </p>
      <form action={printAction} className="flex items-end gap-2">
        <label className="flex flex-col gap-1 text-sm">
          対象月
          <input
            type="month"
            name="period"
            required
            defaultValue={defaultPeriod}
            className="rounded border px-3 py-2"
          />
        </label>
        <button
          type="submit"
          disabled={isPrintPending}
          className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {isPrintPending ? "作成中..." : "印刷用シートを作成"}
        </button>
      </form>

      {printState.status === "error" && (
        <p className="text-sm text-red-600">{printState.error}</p>
      )}

      {printState.status === "success" && (
        <p className="text-sm">
          {printState.printSheetTitle}
          タブを作成しました。
          <a
            href={printState.spreadsheetUrl}
            target="_blank"
            rel="noreferrer"
            className="ml-1 text-blue-600 hover:underline"
          >
            スプレッドシートを開く
          </a>
        </p>
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
