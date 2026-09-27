-- 必要人数（下限・必ず埋めようとする人数）とは別に、任意で「上限人数」を設定できるようにする。
-- 上限人数が設定されている場合、必要人数を満たした上で、まだ条件を満たす候補者が
-- 余っていれば上限人数まで追加で割り当てる（週の需給が厳しく按分縮小が発生している
-- 週は、按分の仕組みを壊さないよう上限までの追加は行わない）。
-- nullの場合は従来どおり必要人数ちょうどまでしか埋めない。
alter table public.shift_staffing_requirements
  add column max_count integer,
  add constraint max_count_not_below_required check (max_count is null or max_count >= required_count);
