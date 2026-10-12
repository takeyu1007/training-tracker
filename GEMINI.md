# Project Context: Training Tracker (筋トレ＆PFC管理)

AI エージェント向けの開発ルール。実装前に必ず読むこと。仕様は [SPEC.md](./SPEC.md) を参照。

## 概要
トレーニング記録と栄養（PFC）・日々のコンディション（睡眠・トレ前糖質等）をシームレスに紐付け、
推定1RMや相関を可視化する個人用 PWA。
利用者は開発者本人（Android）および友人（iOS/PC）。
GitHub Pages で `https://takeyu1007.github.io/training-tracker/` に公開している。

## 技術スタック
- 素の HTML / CSS / JavaScript（ES Modules）。**ビルド工程・外部 npm 依存パッケージは追加しない**（Vanilla Web Standards）。
- 型: JSDoc + 各ファイル先頭の `// @ts-check`
- 保存: `localStorage`（キー `trainingTracker.data`）。外部通信は行わない（フォント・アイコン自前ホスト）。
- テスト: `node --test`（Node 20+）

## ディレクトリ構成
| パス | 役割 |
| :--- | :--- |
| `src/model.js` | 型定義（`Profile` / `Workout` / `WorkoutSet` / `DailyNutrition` / `Routine` / `AppData`）とファクトリ |
| `src/calc.js` | 推定1RM、ボリューム、基礎代謝・目標PFC、相関分析、過負荷サジェスト。**純粋関数のみ（DOM・Storage 禁止）** |
| `src/format.js` | 表示用整形（日時、重量、カロリー、`escapeHtml`） |
| `src/storage.js` | 保存・読込・スキーマ移行・破損データ退避 |
| `src/store.js` | 状態管理。**状態変更は必ずここの関数経由**（自動保存・リスナー通知） |
| `src/sound.js` | タイマー通知用の Web Audio ビープ音 |
| `src/ui/*.js` | 画面部品（`workout.js`, `nutrition.js`, `analytics.js`, `settings.js`, `timer.js`, `tabs.js`, `toast.js`） |
| `styles/tokens.css` | デザイントークン（色・余白・フォント・シャドウ） |
| `styles/app.css` | コンポーネントスタイル |
| `sw.js` | Service Worker（ネットワーク優先＋キャッシュフォールバック） |
| `docs/private/` | 非公開資料。git 管理外。内容を公開ファイルへ転記しないこと |

## 必須ルール
1. **パスは全て相対パス**（`./src/...`）。GitHub Pages のサブディレクトリ配信で壊れないようにする。
2. **保存形式を変えたら** `storage.js` の `SCHEMA_VERSION` を上げ、`migrate()` に旧→新の変換とテストを追加する。保存済みデータを絶対に壊さないこと。
3. **ロジック変更時はテストを追加・更新**し、`npm test` が通ることを確認する。
4. **ファイルを追加・改名したら** `sw.js` の `APP_SHELL` を更新し、`CACHE_VERSION` を上げる。
5. ユーザー入力を `innerHTML` に入れる場合は必ず `escapeHtml()` を通す。
6. iOS 対応を崩さない: 入力欄の文字サイズ 16px 以上、`env(safe-area-inset-*)`、`100dvh`。
7. 他社アプリの商標・固有名称・完全なUIコピーを避ける。
