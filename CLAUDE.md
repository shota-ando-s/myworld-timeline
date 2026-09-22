# 世界史タイムライン（myworld-timeline）

紀元前3500年から現代までを、12の地域レーンに並べて見比べる年表サイト。
自分用の教養・知識整理ツールで、Astro の静的サイトとして GitHub Pages に置く。

## コマンド

| 目的 | コマンド |
|---|---|
| 開発サーバ | `npm run dev` （http://localhost:4321/myworld-timeline） |
| **データ検証** | `npm run validate` |
| 本番ビルド | `npm run build` |
| ビルド結果の確認 | `npm run preview` |

**YAML を触ったら必ず `npm run validate` を通すこと。** ビルドでも同じ検査が走り、
問題があれば止まる。エラーは「ファイル名 + 場所 + 項目名 + 理由」の形で全件まとめて出る。

## データの置き場所

`src/data/<レーンid>.yaml` の12枚。1ファイル＝1レーンで、ファイル先頭の `lane:` が既定値になる。
ファイルが大きくなったら `src/data/china/tang.yaml` のようにサブディレクトリへ分けてよい（再帰的に読む）。

| ファイル / lane | 範囲の目安 |
|---|---|
| `west-europe` | フランク・神聖ローマ・英仏独、近代以降の西欧 |
| `mediterranean` | 古代ギリシア・ローマ・ビザンツ・イタリア諸都市 |
| `east-europe` | ルーシ・ポーランド・ロシア・ソ連 |
| `west-asia` | メソポタミア・ペルシア・アラブ・オスマン（**エジプトは africa**） |
| `central-eurasia` | 匈奴・突厥・モンゴル・ティムールなど草原の国家 |
| `south-asia` | インド・パキスタン |
| `southeast-asia` | ベトナム・カンボジア・ジャワ・マラッカ |
| `china` | 中原王朝と征服王朝 |
| `korea` | 朝鮮半島 |
| `japan` | 日本 |
| `africa` | **エジプトを含む**アフリカ全域 |
| `americas` | メソアメリカ・アンデス・アメリカ合衆国 |

迷ったら「その出来事を探す人がどのレーンを見るか」で決める。
複数地域にまたがる出来事（例：モンゴルのバグダード占領）は、**舞台になった土地のレーン**に置く。

## 書き方

```yaml
lane: china            # このファイルの既定レーン

periods:               # 期間バー（王朝・帝国・時代区分）
  - id: han            # 半角英小文字・数字・ハイフン。全ファイルで重複禁止
    title: 漢
    start: -202        # 負 = 紀元前。0年は存在しない（前1年は -1）
    end: 220
    startCirca: false  # 省略可。true にすると端が破線になる
    endCirca: false
    ongoing: false     # 現在まで続くなら true にして end を省く
    category: politics
    tags: [中国, 王朝]
    summary: 400年続いた大帝国。儒学の官学化とシルクロード交易が本格化した。
    detail: |          # 省略可。パネルに出る数百字
      もう少し詳しい説明。
    links:             # 省略可
      - label: Wikipedia
        url: https://ja.wikipedia.org/wiki/...
    related: [qin]     # 省略可。他の項目の id（存在しない id はエラー）

events:                # 点イベント（単年の出来事）
  - id: qin-unification
    year: -221
    displayDate: 紀元前221年   # 省略可。細かい日付を出したいときだけ
    circa: false               # 年が不確かなら true（表示に「頃」が付く）
    title: 秦の始皇帝が中国を統一
    category: politics
    tags: [中国, 統一]
    summary: 戦国の争いを終わらせ、皇帝という称号と中央集権の型を作った。
```

### 決まりごと

- `id` は英語の内容を表す kebab-case（`qin-unification`, `fall-of-constantinople`）。日本語やローマ字読みは使わない。
- `summary` は**必ず1文**。「何が起きたか」ではなく「**なぜ覚える価値があるか**」を書く。
  - ✗ 「1492年にコロンブスがカリブ海に到達した。」（タイトルの言い換え）
  - ○ 「二つの大陸が結びつき、作物・病原菌・人の大規模な交換が始まった。」
- **年代が不確か・諸説ある場合は必ず `circa: true`（期間なら `startCirca` / `endCirca`）を付ける。**
  推定で断定しない。諸説あることは `summary` か `detail` にも書く。
- 出典 URL を `links` に入れられるなら入れる。**あやふやな URL を作らない**（リンク切れは検証で防げない）。
- `category` は下の8つから選ぶ。複数当てはまるときは「その出来事の一番の性格」で選ぶ。

| category | 使いどころ |
|---|---|
| `politics` | 王朝の成立・滅亡、統一、条約、独立、革命の結果としての政権 |
| `society` | 制度・法・身分・人口・都市、社会の作り替え（マグナ・カルタ、農奴解放） |
| `war` | 戦争、戦闘、征服、侵攻 |
| `disaster` | 疫病、飢饉、地震、噴火 |
| `science` | 発明、技術、学問上の発見 |
| `economy` | 交易、通貨、恐慌、会社、資源 |
| `religion` | 宗教の成立・伝播・改革、思想・哲学 |
| `culture` | 文学・美術・建築・文字 |

色は4系統（`politics`/`society`＝青、`war`/`disaster`＝橙、`science`/`economy`＝藍緑、`religion`/`culture`＝紫）で、
系統の中の区別は点の形が担う。**カテゴリを増やすときは `src/lib/model.ts` の `CATEGORIES` に形と系統も足すこと。**

### 量の目安

1レーンあたり50〜80項目（全体で600〜1000）を目標にしている。
`npm run validate` が各レーンの件数を棒グラフで出すので、薄いレーンから埋めていく。

## コードの構成

| ファイル | 役割 |
|---|---|
| `src/lib/model.ts` | レーン・カテゴリの定義、年の整形。**ブラウザにも送られるので zod や node API を入れない** |
| `src/lib/schema.ts` | zod スキーマ（検証はここ） |
| `src/lib/load.ts` | YAML 読み込みと横断チェック |
| `src/lib/scale.ts` | 年↔x座標の区分線形スケール、目盛り、時代帯 |
| `src/lib/layout.ts` | レーン内の段組み（重なり回避） |
| `src/pages/index.astro` | ビルド時に全項目の DOM を出力 |
| `src/scripts/timeline.ts` | 選択・パネル・フィルタ・ズーム・スナップショット |
| `src/styles/tokens.css` | 配色トークン |

レーンを増減するときは `src/lib/model.ts` の `LANES` だけを直せばよい（データファイル名も合わせる）。

配色は dataviz スキルの検証器（全ペアで色覚特性を確認）を通した4色を使っている。
**色を変えるときは必ず検証し直すこと。**
