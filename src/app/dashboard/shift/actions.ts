"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentStore } from "@/lib/store";
import { buildSolverInputForStore } from "@/lib/buildSolverInput";
import { generateShift, type ConstraintViolation } from "@/lib/shift-solver";
import { writeShiftOutput } from "@/lib/google/writeShiftOutput";
import {
  computeEmployeeShiftSummary,
  type EmployeeShiftSummary,
} from "@/lib/shift-output/computeEmployeeShiftSummary";

export type GenerateShiftState = {
  status: "idle" | "success" | "error";
  error?: string;
  spreadsheetUrl?: string;
  sheetTitle?: string;
  violations?: ConstraintViolation[];
  fairnessScore?: number;
  // 従業員ごとの勤務区分別出勤日数・休み日数。出力用スプレッドシートには書かず、
  // 店長画面（このページ）にのみ表示する。
  employeeShiftSummary?: EmployeeShiftSummary[];
  // 生成が完了するたびに変わる値。再生成ボタンの確認状態をリセットするための
  // React key として使う（sheetTitle/spreadsheetUrlは同月なら毎回同じ値になるため使えない）。
  generatedAt?: string;
};

export async function generateAndWriteShift(
  _prevState: GenerateShiftState,
  formData: FormData,
): Promise<GenerateShiftState> {
  const period = formData.get("period"); // "YYYY-MM"（<input type="month">）
  if (typeof period !== "string" || !/^\d{4}-\d{2}$/.test(period)) {
    return { status: "error", error: "対象月を選択してください" };
  }

  const store = await getCurrentStore();
  if (!store) {
    return { status: "error", error: "店舗が見つかりません" };
  }

  const periodStart = `${period}-01`;
  const periodEnd = lastDayOfMonth(period);

  const supabase = await createClient();

  try {
    const solverInput = await buildSolverInputForStore(
      supabase,
      store.id,
      periodStart,
      periodEnd,
    );

    // 雇用形態の登録順（作成日時が古い順）→ 氏名順に並べる。従業員一覧画面
    // （dashboard/employees/page.tsx）と同じ並び順にするため、特定の名称を
    // ハードコードせずに「基幹となる雇用形態から登録していく」慣習に乗せている。
    // supabase-jsの.order(col, {foreignTable})は埋め込み配列(1対多)の並び順用で、
    // employees→employment_typesのような多対1の関連先では親行の並びに効かないため、
    // PostgRESTの埋め込みリソース記法をそのままカラム名として.order()に渡す
    // （src/app/dashboard/employees/page.tsxと同じ理由・同じ書き方）。
    const { data: employeeRows, error: employeesError } = await supabase
      .from("employees")
      .select("id, name, employment_types(created_at)")
      .eq("store_id", store.id)
      .order("employment_types(created_at)", { ascending: true })
      .order("name", { ascending: true });
    if (employeesError) throw new Error(employeesError.message);

    const { data: shiftTypeRows, error: shiftTypesError } = await supabase
      .from("shift_types")
      .select("id, name, color")
      .eq("store_id", store.id)
      .order("start_time", { ascending: true });
    if (shiftTypesError) throw new Error(shiftTypesError.message);

    const solverOutput = generateShift(solverInput);

    const employeeShiftSummary = computeEmployeeShiftSummary({
      employees: employeeRows ?? [],
      shiftTypes: shiftTypeRows ?? [],
      assignments: solverOutput.assignments,
    });

    const result = await writeShiftOutput({
      storeId: store.id,
      storeName: store.name,
      outputSheetId: store.output_sheet_id,
      periodStart,
      periodEnd,
      employees: employeeRows ?? [],
      shiftTypes: shiftTypeRows ?? [],
      assignments: solverOutput.assignments,
      onSpreadsheetCreated: async (spreadsheetId) => {
        const { error } = await supabase
          .from("stores")
          .update({ output_sheet_id: spreadsheetId })
          .eq("id", store.id);
        if (error) throw new Error(error.message);
      },
    });

    return {
      status: "success",
      spreadsheetUrl: result.spreadsheetUrl,
      sheetTitle: result.sheetTitle,
      violations: solverOutput.violations,
      employeeShiftSummary,
      fairnessScore: solverOutput.fairnessScore,
      generatedAt: new Date().toISOString(),
    };
  } catch (error) {
    return {
      status: "error",
      error: error instanceof Error ? error.message : "シフト生成に失敗しました",
    };
  }
}

function lastDayOfMonth(period: string): string {
  const [yearStr, monthStr] = period.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr); // 1-12
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${yearStr}-${monthStr}-${String(lastDay).padStart(2, "0")}`;
}
