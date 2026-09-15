import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentStore } from "@/lib/store";
import { createEmployee } from "./actions";
import { EmployeeForm } from "./EmployeeForm";
import { EmployeeRow, type EmployeeListItem } from "./EmployeeRow";

export default async function EmployeesPage() {
  const store = await getCurrentStore();
  if (!store) {
    redirect("/dashboard/setup");
  }

  const supabase = await createClient();

  const { data: employmentTypes, error: employmentTypesError } = await supabase
    .from("employment_types")
    .select("id, name")
    .eq("store_id", store.id)
    .order("name", { ascending: true });
  if (employmentTypesError) throw new Error(employmentTypesError.message);

  // 雇用形態の登録順（作成日時が古い順）→ 氏名順に並べる。店舗は通常
  // 「社員→パート→アルバイト」のように基幹となる雇用形態から登録していくため、
  // 特定の名称をハードコードせずに意図した並び順を自動で再現できる。
  // supabase-jsの.order(col, {foreignTable})は「埋め込んだ配列(1対多)の並び順」用で、
  // employees→employment_typesのような多対1の関連先で親行を並べ替えるには効かない
  // （実際に生成されるクエリを確認して判明）。PostgRESTの埋め込みリソース記法
  // employment_types(created_at) をそのままカラム名として.order()に渡す必要がある。
  const { data: employees, error: employeesError } = await supabase
    .from("employees")
    .select("id, name, employment_type_id, employment_types(name, created_at)")
    .eq("store_id", store.id)
    .order("employment_types(created_at)", { ascending: true })
    .order("name", { ascending: true });
  if (employeesError) throw new Error(employeesError.message);

  const rows: EmployeeListItem[] = (employees ?? []).map((employee) => {
    const employmentType = Array.isArray(employee.employment_types)
      ? employee.employment_types[0]
      : employee.employment_types;

    return {
      id: employee.id,
      name: employee.name,
      employmentTypeId: employee.employment_type_id,
      employmentTypeName: employmentType?.name ?? "?",
    };
  });

  return (
    <main className="flex flex-col gap-8">
      <h1 className="text-xl font-bold">従業員マスタ</h1>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-gray-600">登録済み従業員</h2>
        {rows.length > 0 ? (
          <table className="w-full max-w-lg border-collapse text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="py-2 font-normal">氏名</th>
                <th className="py-2 font-normal">雇用形態</th>
                <th className="py-2 font-normal"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((employee) => (
                <EmployeeRow
                  key={employee.id}
                  employee={employee}
                  employmentTypes={employmentTypes ?? []}
                />
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-gray-500">
            まだ従業員が登録されていません。
          </p>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-gray-600">従業員を追加</h2>
        {employmentTypes && employmentTypes.length > 0 ? (
          <EmployeeForm
            action={createEmployee}
            employmentTypes={employmentTypes}
            submitLabel="追加する"
          />
        ) : (
          <p className="text-sm text-gray-500">
            先に雇用形態を登録してください。
          </p>
        )}
      </section>
    </main>
  );
}
