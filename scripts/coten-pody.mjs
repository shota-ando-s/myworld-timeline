#!/usr/bin/env node
/**
 * COTEN RADIO の各シリーズ第1回に対応する Pody（pody.jp）の記事 URL を取る。
 *
 *   node scripts/coten-pody.mjs [--refetch]
 *
 * 取るのは URL だけ。記事本文・文字起こし・AI 要約は取らないし持たない。
 * Pody 利用規約 第14条(5) が禁じているのは、それらを転載・データベース化することで、
 * (10) のクローリング禁止には「ただし、当社が明示的に許可した範囲を除きます」という
 * 留保がある。pody.jp の robots.txt は全 UA に Allow: / を出し（禁止は /api/ /mypage 等）、
 * sitemap.xml を公開している。sitemap は「ここを機械で読んでよい」という表明なので、
 * その範囲（公開ページの URL の発見）に留める。
 *
 * 対応付けの方法:
 *   番組の sitemap は公式 RSS と同じ順（新しい順）で、件数も一致する。
 *   ただし lastmod は配信日ではなく Pody 側の取り込み日時なので、日付では対応が付かない。
 *   そこで「同じ位置＝同じ回」と見なし、**実際に採用する第1回のページだけを1件ずつ開いて
 *   <title> が RSS の題名と一致することを確かめる**。1件でも食い違ったら何も書かずに止める。
 */
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const SHOW = 'hh0fJGjBuDtPNVFIvZKq'; // pody.jp の COTEN RADIO
const SITEMAP = `https://pody.jp/sitemaps/episodes/${SHOW}.xml`;
const UA = 'myworld-timeline/0.1 (personal history timeline; https://github.com/shota-ando-s/myworld-timeline)';
const RSS = fileURLToPath(new URL('.cache/coten-rss.xml', import.meta.url));
const RAW = fileURLToPath(new URL('.cache/pody-sitemap.xml', import.meta.url));
const OUT = fileURLToPath(new URL('.cache/coten-pody.json', import.meta.url));
/** 1件ずつ間を置いて開く。小さなサービスに負荷をかけない */
const DELAY_MS = 1200;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const refetch = process.argv.includes('--refetch');

function unescapeHtml(s) {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&');
}

function tag(block, name) {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
  if (!m) return '';
  return unescapeHtml(m[1].trim().replace(/^<!\[CDATA\[|\]\]>$/g, '').trim());
}

if (!fs.existsSync(RSS)) {
  console.error('先に node scripts/coten-series.mjs を走らせてください（RSS のキャッシュが要ります）');
  process.exit(1);
}

/** 公式 RSS の題名を新しい順に並べる（coten-series.mjs と同じ読み方） */
const rssTitles = (fs.readFileSync(RSS, 'utf8').match(/<item>[\s\S]*?<\/item>/g) ?? []).map((b) => tag(b, 'title'));

let sitemapXml;
if (fs.existsSync(RAW) && !refetch) {
  console.error(`sitemap のキャッシュを使います（取り直すなら --refetch）`);
  sitemapXml = fs.readFileSync(RAW, 'utf8');
} else {
  console.error(`sitemap を取得: ${SITEMAP}`);
  const res = await fetch(SITEMAP, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`sitemap の取得に失敗しました: ${res.status}`);
  sitemapXml = await res.text();
  fs.writeFileSync(RAW, sitemapXml);
}
const locs = [...sitemapXml.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]);

console.log(`公式RSS ${rssTitles.length} 回 / Pody ${locs.length} 回`);
if (rssTitles.length !== locs.length) {
  console.error(
    `件数が違うので位置での対応付けはできません。` +
      `\n  どちらかに新しい回が入った可能性があります。coten-series.mjs を --refetch してから出直してください。`,
  );
  process.exit(1);
}

/** 各シリーズ第1回が RSS の何番目か（RSS は新しい順なので、そのまま sitemap の添字になる） */
const firsts = new Map();
rssTitles.forEach((title, i) => {
  const m = title.match(/^【(\d+)-(\d+)】/);
  if (m && Number(m[2]) === 1) firsts.set(Number(m[1]), i);
});
// 第1回が無いシリーズ（回番号が 2 から始まるなど）は、そのシリーズの最も古い回を第1回として扱う
rssTitles.forEach((title, i) => {
  const m = title.match(/^【(\d+)-(\d+)】/);
  if (!m) return;
  const season = Number(m[1]);
  if (!firsts.has(season) || i > firsts.get(season)) {
    if (!firsts.has(season)) firsts.set(season, i);
  }
});

const seasons = [...firsts.keys()].sort((a, b) => a - b);
console.log(`${seasons.length} シリーズの第1回を1件ずつ照合します（${DELAY_MS}ms 間隔）\n`);

const cached = fs.existsSync(OUT) && !refetch ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {};
const result = {};
const mismatched = [];

for (const season of seasons) {
  const i = firsts.get(season);
  const url = locs[i];
  const expected = rssTitles[i];

  if (cached[String(season)] === url) {
    result[String(season)] = url;
    process.stdout.write(`  ${String(season).padStart(3)} 済\n`);
    continue;
  }

  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) {
    mismatched.push(`season ${season}: ページが開けません（${res.status}） ${url}`);
    await sleep(DELAY_MS);
    continue;
  }
  const html = await res.text();
  const m = html.match(/<title>([\s\S]*?)<\/title>/);
  const got = m ? unescapeHtml(m[1]).replace(/\s*\|\s*Pody\s*$/, '').trim() : '';

  if (got === expected.trim()) {
    result[String(season)] = url;
    console.log(`  ${String(season).padStart(3)} ○ ${expected.slice(0, 44)}`);
  } else {
    mismatched.push(`season ${season}:\n      RSS  = ${expected}\n      Pody = ${got || '(題名が取れず)'}\n      ${url}`);
    console.log(`  ${String(season).padStart(3)} × 題名が一致しません`);
  }
  await sleep(DELAY_MS);
}

if (mismatched.length > 0) {
  console.error(`\n${mismatched.length} 件が照合できませんでした。何も書き出していません。`);
  for (const m of mismatched) console.error(`  - ${m}`);
  console.error('\nPody 側の並びが変わった可能性があります。対応付けの前提を見直してください。');
  process.exit(1);
}

fs.writeFileSync(OUT, `${JSON.stringify(result, null, 1)}\n`);
console.log(`\n${Object.keys(result).length} シリーズ分の Pody URL を照合して書き出しました → ${OUT}`);
