-- 雇用形態ごとの「月間目標時間（任意）」。設定すると、シフト自動生成の候補者
-- 優先順位づけにおいて、この時間にまだ達していない従業員を他の人より優先して
-- 割り当てる（目標に達したら通常の公平性ロジックに戻る。強制ではなく、あくまで
-- 目標に近づけるための優先度づけ）。週の最大勤務時間（ハード制約）とは独立。
alter table public.employment_type_rules
  add column target_monthly_hours numeric,
  add constraint target_monthly_hours_positive check (target_monthly_hours is null or target_monthly_hours >= 0);
