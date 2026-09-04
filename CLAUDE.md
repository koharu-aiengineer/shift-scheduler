# CLAUDE.md

このファイルはClaude Code（Cursor）がこのプロジェクトで作業する際に必ず参照するルールです。
詳細要件は `docs/要件定義書_AIシフト自動生成システム.md` を参照してください。

## プロジェクト概要

アルバイト・パートを含む店舗スタッフのシフト表を、休み希望・雇用形態別ルール・必要人数を踏まえて自動生成するWebシステム。生成結果はGoogleスプレッドシートに入出力する。MVPは1店舗分の運用を対象とする。

## 技術スタック

- フロントエンド: Next.js + TypeScript + Tailwind CSS
- バックエンド: Next.js API Routes（必要に応じてSupabase Edge Functions）
- DB: Supabase（店舗・従業員・ルールなどのマスタ管理）
- 外部連携: Google Sheets API、Google OAuth（店長ログイン）
- ホスティング: Vercel

## 絶対に守る方針

- **シフト生成にOpenAI APIなど外部LLM APIを使わない。** 制約充足問題（CSP）として解く最適化アルゴリズムのみで実装する。コストをゼロに保つことが目的。
- ハード制約（絶対に守る）
  1. 日ごと・勤務区分ごとの必要人数を満たす
  2. 雇用形態別ルール（勤務区分の制限、連勤上限、必須配置人数など）を満たす
- ソフト制約（可能な範囲で守り、破る場合はログに残す）
  1. 休み希望・NG曜日の尊重
  2. 勤務日数・希望休消化の公平性（最終的な優先順位は最下位でよい）
- 生成後にどの制約を妥協したかが分かるログ／注意表示を出すこと
- 出力用シートは「希望休（本人申請）」と「自動割振休（システム割当）」を色または表記で区別する
- 入力用シートと出力用シートは分離する。入力用のみ集計行を持たせ、出力用には集計行を持たせない
- 出力画面には「再生成」ボタンを設置し、押下で別パターンのシフト案を再生成できるようにする
- 店舗ごとに作成するGoogleスプレッドシートは、その店長のGoogleアカウントのみ閲覧・編集できるようにする

## データ構成の基本方針

- 従業員マスタ・勤務区分マスタ・雇用形態ルール・必要人数設定はSupabaseで管理する
- 休み希望・NG曜日・完成シフト表はGoogleスプレッドシート（入力用／出力用）で管理する
- 従業員マスタの必須項目は「氏名」「雇用形態」のみ（それ以外の項目は追加しない）

## 実装の進め方（推奨順序）

1. Supabaseのテーブル設計（店舗・従業員・勤務区分・雇用形態ルール）
2. Google Sheets APIとの入出力連携の疎通確認
3. 店舗設定・マスタ登録画面（勤務区分／雇用形態／従業員）
4. 休み希望・NG曜日・必要人数の入力機能
5. シフト自動生成ロジック（CSPソルバー）を単体で実装・テスト
6. 生成結果のスプレッドシート出力（色分け・希望休/自動割振休の区別）
7. 再生成ボタン、生成後の手動微調整との整合性確認

## 作業の進め方（必ず守る）

- 実装は一気に進めず、**必ず1タスクずつ**進める
- 各タスクに着手する前に、これから何をするか（変更するファイル、実装内容、想定される影響範囲）を簡潔に説明し、**必ずユーザーの承認を得てから**コードを書き始める
- 承認を得ずに複数タスクをまとめて実装しない
- 1つのタスクが完了したら、変更内容を簡潔に報告し、次のタスクに進んでよいか確認する
- 大きな設計判断（DBスキーマ変更、外部APIの選定など）が必要な場合は、複数の選択肢を提示してユーザーに選ばせる

## やらないこと（フェーズ2以降。実装しない）

- 複数店舗のセルフサーブ登録・課金プラン
- 1店舗に複数管理者アカウント
- スタッフ本人によるWeb/LINEからの休み希望入力
- AIによる自然文での調整提案・チャット操作

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
