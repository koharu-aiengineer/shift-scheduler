-- 勤務区分の「合算先」。設定すると、この勤務区分の出勤人数は自分自身の
-- 必要人数を持たず、参照先（親）の必要人数に合算される
-- （例: 「早番パートバイト」の合算先を「早番」にすると、必要人数設定画面で
-- 「早番」に入力した人数が、早番・早番パートバイト合計の目標人数になる）。
-- 親自身が別の親を持つ2段階以上の連鎖はアプリ側（勤務区分マスタ画面の
-- 選択肢をルートのみに絞る）で防止し、DB側では素朴な自己参照循環（自分自身を
-- 指す）だけをCHECK制約で防ぐ。
alter table public.shift_types
  add column counts_toward_shift_type_id uuid references public.shift_types (id) on delete set null,
  add constraint shift_types_counts_toward_not_self check (counts_toward_shift_type_id is null or counts_toward_shift_type_id <> id);
