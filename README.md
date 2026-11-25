# DOWNTOWN STREET — Trading Floor Fever

90年代風トレーディングフロアを舞台にした、60秒のアーケード・キャッチゲーム。
React + Canvas 製。スマホ縦画面に最適化しつつ、PCでも遊べます。

## 遊ぶ

- **いちばん手軽**：`docs/index.html` をブラウザで直接開く（1ファイル完結版）
- **開発サーバー**：
  ```bash
  npm install
  npm run dev        # 表示されたURLを開く（--host を付ければ同じLANのスマホからも確認可）
  ```
- **ビルド**：`npm run build` → `dist/` ／ `npm run build:single` → `dist-single/index.html`（1ファイル）
- **GitHub Pages**：Settings → Pages → Branch `main` / フォルダ `/docs`

## ルール

| アイテム | 効果 |
| --- | --- |
| 札束・マネーバッグ・金塊・鳴る電話 | キャッチで資産（NET WORTH）に加算 |
| ブルコイン | HYPEゲージが大きく上がる |
| 暴落チャート・監査ファイル | 信用（♦）−1。3つ失うと退場 |

- **相場**：BULLは獲得額×2、BEARは危険物が増えて落下も速くなる
- **コンボ**：連続10キャッチごとにボーナス倍率UP（最大×3）。取り逃すとリセット
- **PARTY TIME**：HYPE満タンで発動。7秒間、危険物がすべて現金化・獲得額×3・お金が吸い寄せられる
- **称号・実績**：5段階の称号と8つの実績。ベストスコアと実績は localStorage に保存

## 操作

| | スマホ | PC |
| --- | --- | --- |
| 移動 | 画面のどこでも左右ドラッグ（相対移動） | ← → / A D / マウス |
| PARTY TIME | PARTY TIME! ボタン | Space（ボタンも可） |
| 一時停止 | ❚❚ | P / Esc |

## 構成

```
src/
  App.jsx            画面（タイトル／プレイ／リザルト）、HUD、モーダル
  styles.css
  game/engine.js     ゲームループ・当たり判定・Canvas描画（画像素材なし）
  game/audio.js      WebAudioによる効果音とディスコBGM（音声ファイルなし）
  game/progress.js   称号・実績・セーブデータ
docs/index.html      1ファイル完結ビルド
```

キャラクター・アートはすべてコードで描いたオリジナルです。
