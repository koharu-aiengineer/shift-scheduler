"use client";

type ShiftType = {
  id: string;
  name: string;
  color: string | null;
};

export type EmploymentTypeInitialValues = {
  id?: string;
  name?: string;
  maxWorkDaysPerWeek?: number | null;
  maxWorkHoursPerWeek?: number | null;
  maxConsecutiveWorkDays?: number | null;
  restrictedShiftTypeIds?: string[];
  requirements?: Record<string, number>;
};

export function EmploymentTypeForm({
  action,
  shiftTypes,
  initial,
  submitLabel,
  onCancel,
}: {
  action: (formData: FormData) => void | Promise<void>;
  shiftTypes: ShiftType[];
  initial?: EmploymentTypeInitialValues;
  submitLabel: string;
  onCancel?: () => void;
}) {
  const restricted = new Set(initial?.restrictedShiftTypeIds ?? []);
  const requirements = initial?.requirements ?? {};

  return (
    <form action={action} className="flex max-w-lg flex-col gap-4">
      {initial?.id && <input type="hidden" name="id" value={initial.id} />}

      <label className="flex flex-col gap-1 text-sm">
        名称
        <input
          name="name"
          defaultValue={initial?.name}
          required
          className="rounded border px-3 py-2"
          placeholder="例: 一般職"
        />
      </label>

      <div className="grid grid-cols-3 gap-3">
        <label className="flex flex-col gap-1 text-sm">
          週の最大勤務日数
          <input
            type="number"
            name="max_work_days_per_week"
            min={0}
            max={7}
            defaultValue={initial?.maxWorkDaysPerWeek ?? undefined}
            className="rounded border px-3 py-2"
            placeholder="未設定"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          週の最大勤務時間
          <input
            type="number"
            name="max_work_hours_per_week"
            min={0}
            step={0.5}
            defaultValue={initial?.maxWorkHoursPerWeek ?? undefined}
            className="rounded border px-3 py-2"
            placeholder="未設定"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          連勤上限日数
          <input
            type="number"
            name="max_consecutive_work_days"
            min={0}
            defaultValue={initial?.maxConsecutiveWorkDays ?? undefined}
            className="rounded border px-3 py-2"
            placeholder="未設定"
          />
        </label>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-gray-600">勤務区分ごとの設定</h3>
        {shiftTypes.length === 0 ? (
          <p className="text-sm text-gray-500">
            先に勤務区分を登録すると、ここで入れない勤務区分や必須配置人数を設定できます。
          </p>
        ) : (
          <table className="w-full max-w-lg border-collapse text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="py-1 font-normal">勤務区分</th>
                <th className="py-1 font-normal">入れない</th>
                <th className="py-1 font-normal">必須配置人数</th>
              </tr>
            </thead>
            <tbody>
              {shiftTypes.map((shiftType) => (
                <tr key={shiftType.id} className="border-b">
                  <td className="py-2">
                    <span className="inline-flex items-center gap-2">
                      <span
                        className="inline-block h-3 w-3 rounded"
                        style={{ backgroundColor: shiftType.color ?? "#9CA3AF" }}
                      />
                      {shiftType.name}
                    </span>
                  </td>
                  <td className="py-2">
                    <input
                      type="checkbox"
                      name={`restrict_${shiftType.id}`}
                      defaultChecked={restricted.has(shiftType.id)}
                    />
                  </td>
                  <td className="py-2">
                    <input
                      type="number"
                      name={`min_${shiftType.id}`}
                      min={1}
                      defaultValue={requirements[shiftType.id] ?? undefined}
                      className="w-20 rounded border px-2 py-1"
                      placeholder="未設定"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="flex gap-2">
        <button
          type="submit"
          className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
        >
          {submitLabel}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded border px-4 py-2"
          >
            キャンセル
          </button>
        )}
      </div>
    </form>
  );
}
