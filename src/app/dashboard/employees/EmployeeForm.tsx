"use client";

type EmploymentType = {
  id: string;
  name: string;
};

export function EmployeeForm({
  action,
  employmentTypes,
  initial,
  submitLabel,
  onCancel,
}: {
  action: (formData: FormData) => void | Promise<void>;
  employmentTypes: EmploymentType[];
  initial?: { id?: string; name?: string; employmentTypeId?: string };
  submitLabel: string;
  onCancel?: () => void;
}) {
  return (
    <form action={action} className="flex max-w-sm flex-col gap-3">
      {initial?.id && <input type="hidden" name="id" value={initial.id} />}

      <label className="flex flex-col gap-1 text-sm">
        氏名
        <input
          name="name"
          defaultValue={initial?.name}
          required
          className="rounded border px-3 py-2"
          placeholder="例: 山田 太郎"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        雇用形態
        <select
          name="employment_type_id"
          defaultValue={initial?.employmentTypeId}
          required
          className="rounded border px-3 py-2"
        >
          <option value="" disabled>
            選択してください
          </option>
          {employmentTypes.map((et) => (
            <option key={et.id} value={et.id}>
              {et.name}
            </option>
          ))}
        </select>
      </label>

      <div className="flex gap-2">
        <button
          type="submit"
          className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
        >
          {submitLabel}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="rounded border px-4 py-2">
            キャンセル
          </button>
        )}
      </div>
    </form>
  );
}
