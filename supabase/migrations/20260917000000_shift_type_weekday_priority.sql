-- 「合算先」で親にまとめられている勤務区分（サブ区分）向けの、平日（月〜金）限定の
-- 充足優先度。trueの勤務区分は、平日に限りグループ内の他メンバー（親を含む）より
-- 先に埋めようとする（足りない分は通常どおり他メンバーで埋める。強制ではない）。
-- 土日祝日相当の扱いには影響しない（ISO週の6・7＝土・日のみ対象外）。
alter table public.shift_types
  add column weekday_priority boolean not null default false;
