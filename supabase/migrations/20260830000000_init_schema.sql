-- ============================================================
-- AIシフト自動生成システム: 初期スキーマ
-- 店舗・従業員・勤務区分・雇用形態ルール・必要人数設定のみを管理する。
-- 休み希望・NG曜日・完成シフト表はGoogleスプレッドシート側で管理するため対象外。
-- ============================================================

-- updated_at を自動更新する共通トリガー関数
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ------------------------------------------------------------
-- stores（店舗）
-- 店長のGoogleアカウント（Supabase Auth）と1対1で紐づく
-- ------------------------------------------------------------
create table public.stores (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_user_id uuid not null unique references auth.users (id) on delete cascade,
  input_sheet_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger stores_set_updated_at
  before update on public.stores
  for each row execute function public.set_updated_at();

-- 店舗の所有者かどうかを判定するヘルパー（RLSポリシーで再利用）
create or replace function public.is_store_owner(target_store_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.stores
    where id = target_store_id
      and owner_user_id = auth.uid()
  );
$$;

-- ------------------------------------------------------------
-- employment_types（雇用形態マスタ）
-- ------------------------------------------------------------
create table public.employment_types (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, name)
);

create trigger employment_types_set_updated_at
  before update on public.employment_types
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- employment_type_rules（雇用形態ごとのルール、1雇用形態1レコード）
-- ------------------------------------------------------------
create table public.employment_type_rules (
  id uuid primary key default gen_random_uuid(),
  employment_type_id uuid not null unique references public.employment_types (id) on delete cascade,
  max_work_days_per_week integer,
  max_work_hours_per_week numeric,
  max_consecutive_work_days integer,
  min_staff_per_day integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint max_work_days_per_week_range check (max_work_days_per_week is null or max_work_days_per_week between 0 and 7),
  constraint max_work_hours_per_week_positive check (max_work_hours_per_week is null or max_work_hours_per_week >= 0),
  constraint max_consecutive_work_days_positive check (max_consecutive_work_days is null or max_consecutive_work_days >= 0),
  constraint min_staff_per_day_positive check (min_staff_per_day is null or min_staff_per_day >= 0)
);

create trigger employment_type_rules_set_updated_at
  before update on public.employment_type_rules
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- shift_types（勤務区分マスタ）
-- ------------------------------------------------------------
create table public.shift_types (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  name text not null,
  start_time time not null,
  end_time time not null,
  color text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, name)
);

create trigger shift_types_set_updated_at
  before update on public.shift_types
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- employment_type_shift_restrictions（雇用形態ごとに入れない勤務区分、多対多）
-- ------------------------------------------------------------
create table public.employment_type_shift_restrictions (
  id uuid primary key default gen_random_uuid(),
  employment_type_id uuid not null references public.employment_types (id) on delete cascade,
  shift_type_id uuid not null references public.shift_types (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (employment_type_id, shift_type_id)
);

-- ------------------------------------------------------------
-- employees（従業員マスタ）
-- ------------------------------------------------------------
create table public.employees (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  name text not null,
  employment_type_id uuid not null references public.employment_types (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger employees_set_updated_at
  before update on public.employees
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- shift_staffing_requirements（勤務区分ごとのデフォルト必要人数、1勤務区分1レコード）
-- ------------------------------------------------------------
create table public.shift_staffing_requirements (
  id uuid primary key default gen_random_uuid(),
  shift_type_id uuid not null unique references public.shift_types (id) on delete cascade,
  required_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint required_count_positive check (required_count >= 0)
);

create trigger shift_staffing_requirements_set_updated_at
  before update on public.shift_staffing_requirements
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- shift_staffing_overrides（特定日のみの必要人数上書き）
-- ------------------------------------------------------------
create table public.shift_staffing_overrides (
  id uuid primary key default gen_random_uuid(),
  shift_type_id uuid not null references public.shift_types (id) on delete cascade,
  target_date date not null,
  required_count integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shift_type_id, target_date),
  constraint required_count_positive check (required_count >= 0)
);

create trigger shift_staffing_overrides_set_updated_at
  before update on public.shift_staffing_overrides
  for each row execute function public.set_updated_at();

-- ============================================================
-- Row Level Security
-- MVPは店舗1件・管理者1名だが、将来の複数店舗対応を見据えて
-- 「自分が所有する店舗のデータのみ読み書きできる」形でRLSを設定する。
-- ============================================================

alter table public.stores enable row level security;
alter table public.employment_types enable row level security;
alter table public.employment_type_rules enable row level security;
alter table public.shift_types enable row level security;
alter table public.employment_type_shift_restrictions enable row level security;
alter table public.employees enable row level security;
alter table public.shift_staffing_requirements enable row level security;
alter table public.shift_staffing_overrides enable row level security;

-- stores: 自分が owner のレコードのみ
create policy "stores_owner_select" on public.stores
  for select using (owner_user_id = auth.uid());
create policy "stores_owner_insert" on public.stores
  for insert with check (owner_user_id = auth.uid());
create policy "stores_owner_update" on public.stores
  for update using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
create policy "stores_owner_delete" on public.stores
  for delete using (owner_user_id = auth.uid());

-- employment_types: store_id経由でownerを判定
create policy "employment_types_owner_all" on public.employment_types
  for all
  using (public.is_store_owner(store_id))
  with check (public.is_store_owner(store_id));

-- shift_types: store_id経由でownerを判定
create policy "shift_types_owner_all" on public.shift_types
  for all
  using (public.is_store_owner(store_id))
  with check (public.is_store_owner(store_id));

-- employees: store_id経由でownerを判定
create policy "employees_owner_all" on public.employees
  for all
  using (public.is_store_owner(store_id))
  with check (public.is_store_owner(store_id));

-- employment_type_rules: employment_type_id -> store_id経由でownerを判定
create policy "employment_type_rules_owner_all" on public.employment_type_rules
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

-- employment_type_shift_restrictions: employment_type_id -> store_id経由でownerを判定
create policy "employment_type_shift_restrictions_owner_all" on public.employment_type_shift_restrictions
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

-- shift_staffing_requirements: shift_type_id -> store_id経由でownerを判定
create policy "shift_staffing_requirements_owner_all" on public.shift_staffing_requirements
  for all
  using (
    exists (
      select 1 from public.shift_types st
      where st.id = shift_type_id
        and public.is_store_owner(st.store_id)
    )
  )
  with check (
    exists (
      select 1 from public.shift_types st
      where st.id = shift_type_id
        and public.is_store_owner(st.store_id)
    )
  );

-- shift_staffing_overrides: shift_type_id -> store_id経由でownerを判定
create policy "shift_staffing_overrides_owner_all" on public.shift_staffing_overrides
  for all
  using (
    exists (
      select 1 from public.shift_types st
      where st.id = shift_type_id
        and public.is_store_owner(st.store_id)
    )
  )
  with check (
    exists (
      select 1 from public.shift_types st
      where st.id = shift_type_id
        and public.is_store_owner(st.store_id)
    )
  );
