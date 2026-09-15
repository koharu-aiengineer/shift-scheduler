-- ============================================================
-- 店舗の定休日（曜日単位）・特別休業日（特定日）を管理する。
-- employee_ng_weekdays / employee_leave_requests と同じパターンを
-- 店舗単位に適用したもの。該当する日はシフト自動生成時に全勤務区分の
-- 必要人数が強制的に0になる（既存の曜日別デフォルト・特定日上書きより優先）。
-- ============================================================

-- ------------------------------------------------------------
-- store_closed_weekdays（定休日。行が存在する曜日が定休日扱い）
-- weekday: 1=月, 2=火, 3=水, 4=木, 5=金, 6=土, 7=日（ISO 8601準拠）
-- ------------------------------------------------------------
create table public.store_closed_weekdays (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  weekday smallint not null,
  created_at timestamptz not null default now(),
  unique (store_id, weekday),
  constraint weekday_range check (weekday between 1 and 7)
);

-- ------------------------------------------------------------
-- store_closed_dates（特別休業日。特定日のみの臨時休業）
-- ------------------------------------------------------------
create table public.store_closed_dates (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  closed_date date not null,
  created_at timestamptz not null default now(),
  unique (store_id, closed_date)
);

alter table public.store_closed_weekdays enable row level security;
alter table public.store_closed_dates enable row level security;

create policy "store_closed_weekdays_owner_all" on public.store_closed_weekdays
  for all
  using (public.is_store_owner(store_id))
  with check (public.is_store_owner(store_id));

create policy "store_closed_dates_owner_all" on public.store_closed_dates
  for all
  using (public.is_store_owner(store_id))
  with check (public.is_store_owner(store_id));
