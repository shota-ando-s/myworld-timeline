#!/usr/bin/env node
/**
 * COTEN RADIO の公式 RSS から「本編シリーズ」の一覧を作って .cache に置く。
 * 持ち出すのはシリーズ単位の事実（名前・season・回数・配信月・第1回のURL）だけで、
 * エピソードの題名や説明文は書き出さない。
 *
 *   node scripts/coten-series.mjs [--refetch]
 *
 * タイトルが `【67-4】…【COTEN RADIO モンゴル帝国襲来編4】` という形で揃っているので、
 * 先頭の `【season-回】` を正として畳む（itunes:season は一部の回にしか無い）。
 */
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const FEED = 'https://anchor.fm/s/8c2088c/podcast/rss';
const UA = 'myworld-timeline/0.1 (personal history timeline; https://github.com/shota-ando-s/myworld-timeline)';
const RAW = fileURLToPath(new URL('.cache/coten-rss.xml', import.meta.url));
const OUT = fileURLToPath(new URL('.cache/coten-series.json', import.meta.url));

const MONTHS = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
  Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' };

/** 7.3MB あるので、--refetch と言われるまでは取り直さない */
async function feedText() {
  if (fs.existsSync(RAW) && !process.argv.includes('--refetch')) {
    console.error(`キャッシュを使います（取り直すなら --refetch）: ${RAW}`);
    return fs.readFileSync(RAW, 'utf8');
  }
  console.error(`RSS を取得: ${FEED}`);
  const res = await fetch(FEED, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`RSS の取得に失敗しました: ${res.status}`);
  const text = await res.text();
  fs.mkdirSync(fileURLToPath(new URL('.cache', import.meta.url)), { recursive: true });
  fs.writeFileSync(RAW, text);
  return text;
}

/** CDATA と実体参照をほどいてタグの中身を取る */
function tag(block, name) {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
  if (!m) return '';
  return m[1]
    .trim()
    .replace(/^<!\[CDATA\[|\]\]>$/g, '')
    .trim()
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

/** 「Wed, 23 Sep 2026 21:00:00 GMT」→「2026-09」。日まで持つと js-yaml が Date に変える */
function month(pubDate) {
  const p = pubDate.split(/\s+/);
  const mon = MONTHS[p[2]];
  return mon ? `${p[3]}-${mon}` : '';
}

/**
 * 末尾の `【COTEN RADIO 〇〇編4】` から回数だけ落とす。
 * `ショート 〇〇`・`ジンブンガク 〇〇` も同じ形。
 * 「ハンニバル 編」「クレオパトラ 編」のように余分な空白が入っている回があるので詰める。
 */
function seriesTitle(title) {
  const m = title.match(/【COTEN\s*RADIO\s*(.+?)\s*】\s*$/);
  if (!m) return '';
  return m[1]
    .replace(/\s*\d+$/, '')
    .replace(/\s+/g, ' ')
    .replace(/\s+(編|前編|後編)$/, '$1')
    .trim();
}

const xml = await feedText();
const blocks = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];
if (blocks.length === 0) throw new Error('RSS から <item> が1件も取れませんでした（形式が変わった可能性があります）');

const series = new Map();
let bangai = 0;
const offFormat = [];

// フィードは新しい順なので、古い順に見て第1回を素直に拾える形にする
for (const block of [...blocks].reverse()) {
  const title = tag(block, 'title');
  const m = title.match(/^【(\d+)-(\d+)】/);
  if (!m) {
    if (title.includes('番外編')) bangai += 1;
    else offFormat.push(title);
    continue;
  }
  const season = Number(m[1]);
  const ep = Number(m[2]);
  const ym = month(tag(block, 'pubDate'));
  const s = series.get(season) ?? {
    season, title: '', episodes: 0, firstAired: ym, lastAired: ym, url: '', epNumbers: [], names: new Set(),
  };
  const name = seriesTitle(title);
  if (name) s.names.add(name);
  s.episodes += 1;
  s.epNumbers.push(ep);
  s.lastAired = ym;
  if (ep === 1 || !s.url) s.url = tag(block, 'link');
  series.set(season, s);
}

const warn = [];
const out = [...series.values()]
  .sort((a, b) => a.season - b.season)
  .map((s) => {
    const names = [...s.names];
    if (names.length === 0) warn.push(`season ${s.season}: シリーズ名が取れませんでした`);
    if (names.length > 1) warn.push(`season ${s.season}: 名前が複数あります（${names.join(' / ')}）→ 先頭を採用`);
    const nums = [...s.epNumbers].sort((a, b) => a - b);
    const missing = [];
    for (let i = 1; i <= nums[nums.length - 1]; i += 1) if (!nums.includes(i)) missing.push(i);
    if (missing.length) warn.push(`season ${s.season}（${names[0]}）: 回番号に欠番 ${missing.join(',')}`);
    if (!s.url) warn.push(`season ${s.season}（${names[0]}）: 第1回の URL が取れませんでした`);
    return {
      season: s.season,
      title: names[0] ?? `(season ${s.season})`,
      episodes: s.episodes,
      firstAired: s.firstAired,
      lastAired: s.lastAired,
      url: s.url,
      epNumbers: nums,
    };
  });

const total = out.reduce((n, s) => n + s.episodes, 0);
fs.writeFileSync(OUT, `${JSON.stringify(out, null, 1)}\n`);

console.log(`本編 ${out.length} シリーズ / ${total} 回`);
console.log(`番外編 ${bangai} 回 / 形式外 ${offFormat.length} 回（告知・特別編など。対応表には入れない）`);
console.log(`→ ${OUT}`);
if (warn.length) {
  console.log('');
  for (const w of warn) console.log(`! ${w}`);
}
if (out.length < 50) {
  console.error(`\nシリーズが ${out.length} 件しか取れていません。タイトルの形式が変わった可能性があります。`);
  process.exit(1);
}
