-- ============================================================
-- 休み希望・NG曜日をSupabaseで管理する（当初はGoogleスプレッドシート
-- 管理の想定だったが、他のマスタ画面と同じ構成に統一するため変更）。
-- ============================================================

-- ------------------------------------------------------------
-- employee_ng_weekdays（曜日単位のNG。行が存在する曜日がNG扱い）
-- weekday: 1=月, 2=火, 3=水, 4=木, 5=金, 6=土, 7=日（ISO 8601準拠）
-- ------------------------------------------------------------
create table public.employee_ng_weekdays (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete cascade,
  weekday smallint not null,
  created_at timestamptz not null default now(),
  unique (employee_id, weekday),
  constraint weekday_range check (weekday between 1 and 7)
);

-- ------------------------------------------------------------
-- employee_leave_requests（特定日付の休み希望）
-- ------------------------------------------------------------
create table public.employee_leave_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete cascade,
  requested_date date not null,
  created_at timestamptz not null default now(),
  unique (employee_id, requested_date)
);

alter table public.employee_ng_weekdays enable row level security;
alter table public.employee_leave_requests enable row level security;

-- employee_id -> store_id 経由でownerを判定（employment_type_shift_restrictionsと同じパターン）
create policy "employee_ng_weekdays_owner_all" on public.employee_ng_weekdays
  for all
  using (
    exists (
      select 1 from public.employees e
      where e.id = employee_id
        and public.is_store_owner(e.store_id)
    )
  )
  with check (
    exists (
      select 1 from public.employees e
      where e.id = employee_id
        and public.is_store_owner(e.store_id)
    )
  );

create policy "employee_leave_requests_owner_all" on public.employee_leave_requests
  for all
  using (
    exists (
      select 1 from public.employees e
      where e.id = employee_id
        and public.is_store_owner(e.store_id)
    )
  )
  with check (
    exists (
      select 1 from public.employees e
      where e.id = employee_id
        and public.is_store_owner(e.store_id)
    )
  );
