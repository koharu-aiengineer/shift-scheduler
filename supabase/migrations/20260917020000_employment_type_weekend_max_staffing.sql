-- 雇用形態×勤務区分ごとの「土日の上限人数（任意）」。設定すると、土曜・日曜に
-- 限り、その勤務区分にこの雇用形態の人数がこの数を超えて割り当てられない
-- ハード制約として扱う（平日は対象外）。既存のmin_count（必須配置人数、
-- 曜日を問わず適用）とは独立した設定。
-- max_count_weekendのみを設定（min_countは未設定）というケースが発生しうる
-- ため、min_countのNOT NULL制約を緩和する（アプリ側は、min_countと
-- max_count_weekendの少なくとも一方が設定されているときだけ行を作成する）。
alter table public.employment_type_shift_staffing_requirements
  alter column min_count drop not null;

alter table public.employment_type_shift_staffing_requirements
  drop constraint min_count_positive;

alter table public.employment_type_shift_staffing_requirements
  add constraint min_count_positive check (min_count is null or min_count >= 1),
  add column max_count_weekend integer,
  add constraint max_count_weekend_non_negative check (max_count_weekend is null or max_count_weekend >= 0);
