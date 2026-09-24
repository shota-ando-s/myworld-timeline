# 世界史タイムライン（myworld-timeline）

紀元前3500年から現代までを、12の地域レーンに並べて見比べる年表サイト。
自分用の教養・知識整理ツールで、Astro の静的サイトとして GitHub Pages に置く。

## コマンド

| 目的 | コマンド |
|---|---|
| 開発サーバ | `npm run dev` （http://localhost:4321/myworld-timeline） |
| **データ検証** | `npm run validate` |
| 型チェック | `npm run check` |
| アイコンCSSの再生成 | `npm run icons` |
| 本番ビルド | `npm run build` |
| ビルド結果の確認 | `npm run preview` |

**YAML を触ったら必ず `npm run validate` を通すこと。** ビルドでも同じ検査が走り、
問題があれば止まる。エラーは「ファイル名 + 場所 + 項目名 + 理由」の形で全件まとめて出る。

## データの置き場所

`src/data/<レーンid>.yaml` の12枚と、人物の治世を入れる `src/data/leaders/<レーンid>.yaml` の12枚。
1ファイル＝1レーンで、ファイル先頭の `lane:` が既定値になる。
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

年表そのものではない付随データは `src/data/` の**外**に置く。いまは
`src/podcasts/coten-radio.yaml`（COTEN RADIO のシリーズと年表項目の対応表）だけ。
`src/data/` 配下は `DataFileSchema`（strictObject、`lane`/`periods`/`leaders`/`events` のみ）で
検査されるので、形の違うデータを混ぜると読み込みが止まる。

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

leaders:               # 人物の治世。形は periods と同じで、置かれる帯だけが違う
  - id: tang-taizong
    title: 太宗 李世民
    start: 626
    end: 649
    category: politics
    tags: [中国, 唐]
    summary: 臣下の諫言を容れた「貞観の治」が、東アジア中で理想の君主像として読まれた。

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
系統の中の区別は Font Awesome のアイコンが担う。

カテゴリやアイコンを変えるときは、
`src/lib/model.ts` の `CATEGORIES`（`shape` に Font Awesome Solid のアイコン名）と
`scripts/build-icons.mjs` の `ICONS` を両方直し、`npm run icons` で
`src/styles/icons.css`（mask-image の data URI）を作り直す。
項目ごとに SVG を置くと1000件規模でHTMLが膨らむので、CSS のマスクで描いている。

### 人物（`leaders:`）

王朝の帯のすぐ下に、一回り低い帯として並ぶ。上のフィルタの「人物」でまとめて消せる。

- フィールドは `periods` と同じ。**役割で `category` を選ぶ**（君主＝`politics`、宗教指導者＝`religion`、
  将軍＝`war`、文化で名を残した君主＝`culture`、制度を作った人＝`society`）。色とアイコンはそこから決まる。
- 期間は**在位、または実権を握っていた期間**。即位年に諸説あるときは `startCirca` / `endCirca` を付ける。
- 同じ人物の出来事が `events` にあるときは id を分ける（`akbar-throne` は出来事、`akbar-reign` は治世）。
- 1レーン20〜45人。人数より**時代が途切れないこと**を優先する。
  数百年にわたって誰も並ばない区間があれば、そこを埋めるほうが人数を増やすより効く。

### detail と画像

`detail` は「何が起きたか」を**600字前後・4段落**で書く。教科書の記述程度の概略にとどめ、
細かい逸話は入れない（詳しく知りたい人は参考リンクの Wikipedia へ飛ぶ）。
`summary` が「なぜ覚える価値があるか」の1文なので、役割は重ならない。
段落は**空行**で区切る。段落の中の改行は原稿を読みやすくするためのもので、表示では
つながった文に戻る。書いたら `detail-reflow.mjs` で1文＝1行にそろえる。

構成は「何であるか → 経過 → 経過の続き → 結果と意味」の4段落を基本にする。
Wikipedia は年代と事実の確認に使い、**本文は引用せず自分の言葉で書く**
（事実に著作権は無いが、表現をなぞると翻案にあたりうる）。

```sh
node scripts/wiki-leads.mjs               # リンク先の冒頭文を取る（裏取りと下の検査に使う）
node scripts/detail-todo.mjs <lane>       # まだ書いていない項目を材料つきで並べる
node scripts/detail-apply.mjs <本文.json> [--replace|--append]
node scripts/detail-reflow.mjs            # 1文＝1行にそろえる（改行が二重に折れるのを防ぐ）
```

`npm run validate` が `check-originality.mjs` を呼び、Wikipedia の冒頭文と
20文字以上一致するか、8文字の並びの一致率が25%を超えたら警告する。出たら書き直す。

画像は記事の代表画像を参照する（再配布はしない）。`node scripts/wiki-images.mjs <lane>`
で URL・作者・ライセンス・ファイルページを取り、`image-apply.mjs` で差し込む。
**CC BY-SA などは表示義務があるので、credit と page は必ず一緒に持たせる**。
パネルでは説明の上に出し、下に作者とライセンスを小さく添える。

### 出典リンク

全項目に ja.wikipedia の参考リンクが入っている（`links:` の1件目）。パネルでは説明の
すぐ下に「参考: Wikipedia」として出る。**本文は引用していない**ので、ライセンス上の
制約は無い（リンクと、年代・事実の確認に使っているだけ）。

項目を足したら、次の順で貼る。

```sh
node scripts/wiki-match.mjs                      # 全項目の記事候補を照合（.cache に書き出す）
node scripts/wiki-verify.mjs "<id>=<記事名>" ...   # 差し替え候補が実在するか確かめる
node scripts/wiki-apply.mjs <承認ファイル.json>     # 承認した分だけ YAML に差し込む
```

- 記事名がこちらの項目名と完全一致し、冒頭文に年代も出てくるものは、そのまま貼ってよい
- **それ以外は必ず目で見る。** 人名は姓だけだと曖昧さ回避のページに落ちる
  （マクロン→発音記号、モディ→丸井のビル、韓流→映画『うなぎ』に当たった）
- 適切な記事が無いときは**貼らない**。近いだけの記事を貼らない

### ポッドキャストの対応表

`src/podcasts/coten-radio.yaml` に、COTEN RADIO のシリーズ（〇〇編）と年表項目の対応を持たせている。
パネルでは `参考: Wikipedia` の下に「聴く: COTEN RADIO 帝政ローマ編（全14回）」として出て、
紐づいた項目は年表上でも題名に点線の下線が付く。

```yaml
series:
  - season: 66            # 番組自身が「【66-1】」で使っている連番。これが主キー
    title: 帝政ローマ編
    episodes: 14
    firstAired: '2026-07'  # 'YYYY-MM'。日まで書くと js-yaml が Date に変える
    lastAired: '2026-09'
    url: https://...       # 第1回のリンク
    items: [roman-empire, augustus, pax-romana]
```

- `kind` は3つ。`topic`（既定、年表項目に紐づく）/ `theme`（テーマ史で単一項目に紐づかない）/
  `uncovered`（年表に該当項目が無い）。**`theme` と `uncovered` には `note` が必須**で、
  これは「見たけど紐づけないと決めた」の記録。`topic` なのに `items` が空だと検証で止まるので、
  67件のレビューが済んだかどうかはファイルを見れば分かる。
- 持つのは**シリーズ単位の事実（名前・season・回数・配信月）と第1回の公式リンクだけ**。
  エピソードの題名や説明文は転記しない。番外編146回と形式外33回（告知・特別編）も入れない。
  Pody のような記事化サービスの本文は、規約上も方針上も入れない。
- `uncovered` の一覧が「番組は扱っているのに年表に無い話題」＝**後日項目を足す候補リスト**になる
  （`npm run validate` が出す）。
- コメントはファイル先頭のヘッダだけ。シリーズごとの補足は `note:` に書く（apply が再生成すると消える）。

```sh
node scripts/coten-series.mjs [--refetch]        # 公式RSSからシリーズを抜く（.cache に置く）
node scripts/coten-match.mjs [--only <season>]   # 年表項目の候補を並べる（貼らない。人が選ぶ）
node scripts/coten-apply.mjs <承認ファイル.json>   # src/podcasts/coten-radio.yaml を書き出す
```

承認ファイルは `{ "66": { "items": [...] }, "12": { "kind": "theme", "note": "..." } }` の形で、
人が決めるのは `items` / `kind` / `note` / `laneHint` / `title`（題名の上書き）の5つだけ。
`coten-apply.mjs` は 承認ファイル > 現行 YAML > 既定値 の順にマージして全体を書き出すので、
手で直したあとに再実行しても消えない。

**自動マッチは候補提示まで。67件は必ず全部目で見る。** 突き合わせは項目の `title` と `tags` にだけ
当てて、`id` には当てない。id はローマ字綴りなので、諸葛孔明→`ming`（明）、お金の歴史→`jurchen-jin`（金）、
民主主義の歴史→`north-korea`（朝鮮民主主義人民共和国）、ニコラ・テスラ→`nicholas-i` のように当たる
（wiki-match の「マクロン→発音記号」と同じ型）。年表側の名前は番組と違うことが多い
（武則天→則天武后、鎌倉武士→鎌倉時代、帝政ローマ→ローマ帝国、項羽と劉邦→高祖 劉邦）。

`【特別編】ウクライナとロシア`（全6回）と `財閥の歴史`（前後編）は形式外だが中身は歴史なので、
入れたくなったら `specials:` を足す余地を残してある。

### 量の目安

期間と出来事は1レーンあたり50〜90項目、人物は20〜45人を目安にしている。
現在は期間221・人物432・出来事502の約1150項目。
`npm run validate` が各レーンの件数を棒グラフ（■＝期間と出来事、□＝人物）で出すので、薄いレーンから埋めていく。
特定の時代だけ厚くすると年表が偏るので、追加するときは時代の散らばりも見ること。
COTEN RADIO の内訳（紐付け／テーマ史／未カバー）も同じところに出る。

## コードの構成

| ファイル | 役割 |
|---|---|
| `src/lib/model.ts` | レーン・カテゴリの定義、年の整形。**ブラウザにも送られるので zod や node API を入れない** |
| `src/lib/schema.ts` | zod スキーマ（検証はここ）。ポッドキャスト対応表のスキーマもここ |
| `src/lib/load.ts` | YAML の検証本体（1項目ずつ検証し、id重複・related切れも見る） |
| `src/lib/load-glob.ts` | Astro 側の読み込み。`import.meta.glob` でビルドに YAML を同梱する（`src/podcasts/` も読む） |
| `src/lib/load-fs.ts` | `npm run validate` 用の読み込み（node の fs。`src/podcasts/` も読む） |
| `src/lib/podcast.ts` | ポッドキャスト対応表の検証（シリーズの形と、`items` の id が実在するか）と索引の生成 |
| `src/lib/scale.ts` | 年↔x座標の区分線形スケール、目盛り、時代帯 |
| `src/lib/layout.ts` | レーン内の段組み（王朝・人物・出来事の3段）と、帯の名前を中に入れるか外に出すかの判定 |
| `src/pages/index.astro` | ビルド時に全項目の DOM を出力 |
| `src/scripts/timeline.ts` | 選択・パネル・フィルタ・ズーム・スナップショット |
| `src/styles/tokens.css` | 配色トークン |
| `src/styles/icons.css` | カテゴリのアイコン（**生成物。`npm run icons` で作る**） |

レーンを増減するときは `src/lib/model.ts` の `LANES` だけを直せばよい（データファイル名も合わせる）。

人物は `Period` に `leader: true` を立てたものとして読み込む（`src/lib/load.ts`）。
見た目は `.bar--leader`、まとめて隠すのは `html[data-leaders='off']`、
隠したときのレーンの高さは `laneBands()` が段を詰めて計算し直す。

配色は dataviz スキルの検証器（全ペアで色覚特性を確認）を通した4色を使っている。
**色を変えるときは必ず検証し直すこと。**
