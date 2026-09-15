"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentStore } from "@/lib/store";
import { buildSolverInputForStore } from "@/lib/buildSolverInput";
import { generateShift, type ConstraintViolation } from "@/lib/shift-solver";
import { writeShiftOutput } from "@/lib/google/writeShiftOutput";

export type GenerateShiftState = {
  status: "idle" | "success" | "error";
  error?: string;
  spreadsheetUrl?: string;
  sheetTitle?: string;
  violations?: ConstraintViolation[];
  fairnessScore?: number;
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

    const { data: employeeRows, error: employeesError } = await supabase
      .from("employees")
      .select("id, name")
      .eq("store_id", store.id)
      .order("name", { ascending: true });
    if (employeesError) throw new Error(employeesError.message);

    const { data: shiftTypeRows, error: shiftTypesError } = await supabase
      .from("shift_types")
      .select("id, name, color")
      .eq("store_id", store.id)
      .order("start_time", { ascending: true });
    if (shiftTypesError) throw new Error(shiftTypesError.message);

    const solverOutput = generateShift(solverInput);

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
