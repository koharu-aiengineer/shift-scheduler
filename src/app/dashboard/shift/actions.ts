"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentStore } from "@/lib/store";
import { buildSolverInputForStore } from "@/lib/buildSolverInput";
import { generateShift, type ConstraintViolation } from "@/lib/shift-solver";
import { writeShiftOutput } from "@/lib/google/writeShiftOutput";
import { readShiftOutputRows } from "@/lib/google/readShiftOutput";
import { writePrintSheet } from "@/lib/google/writePrintSheet";
import { enumerateDates } from "@/lib/shift-solver/dateUtils";
import {
  computeEmployeeShiftSummaryFromSheetRows,
  type EmployeeShiftSummary,
} from "@/lib/shift-output/computeEmployeeShiftSummary";

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
      .select("id, name, color, counts_toward_shift_type_id")
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
      shiftTypes: (shiftTypeRows ?? []).map((row) => ({
        id: row.id,
        name: row.name,
        color: row.color,
        countsTowardShiftTypeId: row.counts_toward_shift_type_id,
      })),
      assignments: solverOutput.assignments,
      closedDates: solverInput.closedDates,
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

export type RefreshShiftSummaryState = {
  status: "idle" | "success" | "error";
  error?: string;
  employeeShiftSummary?: EmployeeShiftSummary[];
  refreshedAt?: string;
};

// 出力用スプレッドシートの対象月タブを読み直し、店長画面の「従業員別 出勤日数」を
// 最新の状態（スプレッドシート上での手動修正を含む）に更新する。
// 出力用シート自体は読むだけで、一切書き込まない。
export async function refreshEmployeeShiftSummary(
  _prevState: RefreshShiftSummaryState,
  formData: FormData,
): Promise<RefreshShiftSummaryState> {
  const period = formData.get("period");
  if (typeof period !== "string" || !/^\d{4}-\d{2}$/.test(period)) {
    return { status: "error", error: "対象月が不正です" };
  }

  const store = await getCurrentStore();
  if (!store) {
    return { status: "error", error: "店舗が見つかりません" };
  }
  if (!store.output_sheet_id) {
    return { status: "error", error: "まだシフトが生成されていません" };
  }

  const supabase = await createClient();

  try {
    // generateAndWriteShiftと同じ並び順（雇用形態の登録順→氏名順）で取得する。
    // 表示順を生成直後の表と揃えるため。
    const { data: employeeRows, error: employeesError } = await supabase
      .from("employees")
      .select("id, name, employment_types(created_at)")
      .eq("store_id", store.id)
      .order("employment_types(created_at)", { ascending: true })
      .order("name", { ascending: true });
    if (employeesError) throw new Error(employeesError.message);

    const { data: shiftTypeRows, error: shiftTypesError } = await supabase
      .from("shift_types")
      .select("id, name")
      .eq("store_id", store.id)
      .order("start_time", { ascending: true });
    if (shiftTypesError) throw new Error(shiftTypesError.message);

    const sheetRows = await readShiftOutputRows({
      storeId: store.id,
      outputSheetId: store.output_sheet_id,
      sheetTitle: period,
    });

    const dayCount = enumerateDates(`${period}-01`, lastDayOfMonth(period)).length;

    const employeeShiftSummary = computeEmployeeShiftSummaryFromSheetRows({
      employees: employeeRows ?? [],
      shiftTypes: shiftTypeRows ?? [],
      sheetRows,
      dayCount,
    });

    return {
      status: "success",
      employeeShiftSummary,
      refreshedAt: new Date().toISOString(),
    };
  } catch (error) {
    return {
      status: "error",
      error: error instanceof Error ? error.message : "集計の更新に失敗しました",
    };
  }
}

export type GeneratePrintSheetState = {
  status: "idle" | "success" | "error";
  error?: string;
  spreadsheetUrl?: string;
  printSheetTitle?: string;
  generatedAt?: string;
};

// 通常タブ（対象月。スプレッドシート上での手直しを含む）を読み直し、
// 印刷・画像化しやすい1文字コード＋色＋凡例の専用タブ（別タブ）へ書き出す。
export async function generatePrintSheet(
  _prevState: GeneratePrintSheetState,
  formData: FormData,
): Promise<GeneratePrintSheetState> {
  const period = formData.get("period");
  if (typeof period !== "string" || !/^\d{4}-\d{2}$/.test(period)) {
    return { status: "error", error: "対象月が不正です" };
  }

  const store = await getCurrentStore();
  if (!store) {
    return { status: "error", error: "店舗が見つかりません" };
  }
  if (!store.output_sheet_id) {
    return { status: "error", error: "まだシフトが生成されていません" };
  }

  const supabase = await createClient();
  const periodStart = `${period}-01`;
  const periodEnd = lastDayOfMonth(period);

  try {
    const { data: shiftTypeRows, error: shiftTypesError } = await supabase
      .from("shift_types")
      .select("id, name, color, start_time, end_time, counts_toward_shift_type_id")
      .eq("store_id", store.id)
      .order("start_time", { ascending: true });
    if (shiftTypesError) throw new Error(shiftTypesError.message);

    // generateAndWriteShiftと完全に同じ並び順（雇用形態の登録順→氏名順）で
    // 取得する。印刷用シートのセルの数式は「通常タブの同じ行番号」を直接
    // 参照するため、ここでの並び順が通常タブと1行でもズレると、印刷用シート
    // 側が別人の行を参照してしまう（雇用形態の境目の太線判定にも使う）。
    const { data: employeeRows, error: employeesError } = await supabase
      .from("employees")
      .select("name, employment_type_id, employment_types(created_at)")
      .eq("store_id", store.id)
      .order("employment_types(created_at)", { ascending: true })
      .order("name", { ascending: true });
    if (employeesError) throw new Error(employeesError.message);

    const result = await writePrintSheet({
      storeId: store.id,
      storeName: store.name,
      outputSheetId: store.output_sheet_id,
      period,
      periodStart,
      periodEnd,
      shiftTypes: (shiftTypeRows ?? []).map((row) => ({
        id: row.id,
        name: row.name,
        color: row.color,
        startTime: row.start_time,
        endTime: row.end_time,
        countsTowardShiftTypeId: row.counts_toward_shift_type_id,
      })),
      employees: (employeeRows ?? []).map((row) => ({
        name: row.name,
        employmentTypeId: row.employment_type_id,
      })),
    });

    return {
      status: "success",
      spreadsheetUrl: result.spreadsheetUrl,
      printSheetTitle: result.sheetTitle,
      generatedAt: new Date().toISOString(),
    };
  } catch (error) {
    return {
      status: "error",
      error: error instanceof Error ? error.message : "印刷用シートの作成に失敗しました",
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
