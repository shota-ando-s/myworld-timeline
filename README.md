# 世界史タイムライン

紀元前3500年から現代まで、世界の12地域で何が並行して起きていたかを見比べるための年表。

- 横軸が時間、縦に地域レーン。王朝や時代は帯、その下の細い帯が人物の治世、出来事は点
- 時間は区分線形スケール（古代を圧縮し、近現代を広く取る）
- 「この年の世界」で、ある年に各地で何が進行していたかを一覧できる
- カテゴリ（8種 / 色は4系統）と地域で絞り込め、人物（君主・宗教指導者・将軍）はまとめて隠せる
- スマホでは年代順の縦リストに切り替わる

## 使い方

```sh
npm install
npm run dev        # http://localhost:4321/myworld-timeline
npm run validate   # データの検証（YAML を触ったら必ず）
npm run build
```

アイコンは [Font Awesome Free](https://fontawesome.com/license/free)（CC BY 4.0）。
`npm run icons` で `src/styles/icons.css` を生成している。

データは `src/data/*.yaml`（1ファイル＝1地域レーン）と `src/data/leaders/*.yaml`（人物の治世）。
書き方と決まりごとは [CLAUDE.md](CLAUDE.md) にまとめてある。
