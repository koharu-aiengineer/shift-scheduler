-- ============================================================
-- stores テーブルに Google リフレッシュトークン保存用カラムを追加
--
-- 値はアプリケーション層（Node.js側）で AES-256-GCM 暗号化してから
-- 保存する前提（暗号化キーはサーバー環境変数のみに保持し、DBには入れない）。
-- 実際の保存・リフレッシュ処理の実装は別タスクで行う。
--
-- ここでは「ログインセッションが無い状態でもSheets APIを呼べるようにする」
-- ための保存領域だけを用意する。ブラウザ側（anon/authenticatedロール）から
-- この2カラムだけは絶対に読み書きできないよう、カラム単位で権限を剥奪する。
-- RLSで自分のstores行が見える設定になっていても、この防御は独立して効く。
-- ============================================================

alter table public.stores
  add column google_refresh_token text,
  add column google_token_updated_at timestamptz;

revoke select (google_refresh_token, google_token_updated_at),
  insert (google_refresh_token, google_token_updated_at),
  update (google_refresh_token, google_token_updated_at)
  on public.stores
  from authenticated, anon;
