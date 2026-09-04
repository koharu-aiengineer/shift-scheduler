-- ============================================================
-- 「1日あたり必須配置人数」を雇用形態全体の1日合計ではなく、
-- 「特定の勤務区分（例: 遅番）にこの雇用形態が最低何人必要か」という
-- 勤務区分ごとの必須人数として管理できるように変更する。
-- ============================================================

-- 旧: 雇用形態1件につき1つの「1日あたり必須配置人数」だった列を廃止
alter table public.employment_type_rules
  drop column min_staff_per_day;

-- 新: 雇用形態 × 勤務区分 ごとに必須最低人数を設定するテーブル
-- 行が存在する組み合わせのみ「必須人数が設定されている」ことを意味する
-- （未設定の組み合わせは制約なし、というシンプルな表現にする）
create table public.employment_type_shift_staffing_requirements (
  id uuid primary key default gen_random_uuid(),
  employment_type_id uuid not null references public.employment_types (id) on delete cascade,
  shift_type_id uuid not null references public.shift_types (id) on delete cascade,
  min_count integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employment_type_id, shift_type_id),
  constraint min_count_positive check (min_count >= 1)
);

create trigger employment_type_shift_staffing_requirements_set_updated_at
  before update on public.employment_type_shift_staffing_requirements
  for each row execute function public.set_updated_at();

alter table public.employment_type_shift_staffing_requirements enable row level security;

create policy "employment_type_shift_staffing_requirements_owner_all"
  on public.employment_type_shift_staffing_requirements
  for all
  using (
    exists (
      select 1 from public.employment_types et
      where et.id = employment_type_id
        and public.is_store_owner(et.store_id)
    )
  )
  with check (
    exists (
      select 1 from public.employment_types et
      where et.id = employment_type_id
        and public.is_store_owner(et.store_id)
    )
  );
