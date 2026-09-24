#!/usr/bin/env node
/**
 * 承認ファイルから src/podcasts/coten-radio.yaml を書き出す。
 *
 *   node scripts/coten-apply.mjs scripts/.cache/coten-approved.json
 *
 * 事実の列（season/title/episodes/配信月/url）は RSS 由来なので毎回作り直し、
 * 人が決めた分（items / kind / note / laneHint / title の上書き）だけを引き継ぐ。
 * 引き継ぎの優先順は 承認ファイル > 現行 YAML > 既定値 なので、
 * 手で直したあとに再実行しても消えない（冪等）。
 *
 * 他の apply 群（wiki-apply など）と違って行単位の挿入はしない。
 * このファイルで人が書くのは上の5つだけで、それは承認ファイルに集まるため、
 * 全体を書き出しても人の書いたものは失われない。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const SERIES = fileURLToPath(new URL('.cache/coten-series.json', import.meta.url));
const DEST = fileURLToPath(new URL('../src/podcasts/coten-radio.yaml', import.meta.url));

/** 人が決めるフィールド。これ以外は RSS から作り直す */
const HUMAN = ['title', 'kind', 'items', 'laneHint', 'note'];

const DEFAULT_PODCAST = {
  title: 'COTEN RADIO',
  url: 'https://coten.co.jp/services/cotenradio/',
  feed: 'https://anchor.fm/s/8c2088c/podcast/rss',
  note: '歴史を扱う日本語ポッドキャスト。1シリーズ4〜16回の連続もの。',
};

const approvedPath = process.argv[2];
if (!approvedPath) {
  console.error('使い方: node scripts/coten-apply.mjs <承認ファイル.json>');
  process.exit(1);
}
if (!fs.existsSync(SERIES)) {
  console.error('先に node scripts/coten-series.mjs を走らせてください');
  process.exit(1);
}

const series = JSON.parse(fs.readFileSync(SERIES, 'utf8'));
const approved = JSON.parse(fs.readFileSync(approvedPath, 'utf8'));

// 現行 YAML から過去の判断を読む（壊れていても止めない。検証は npm run validate の仕事）
let podcastMeta = DEFAULT_PODCAST;
const previous = new Map();
if (fs.existsSync(DEST)) {
  try {
    const raw = yaml.load(fs.readFileSync(DEST, 'utf8'));
    if (raw?.podcast) podcastMeta = raw.podcast;
    for (const s of raw?.series ?? []) {
      if (typeof s?.season === 'number') previous.set(s.season, s);
    }
  } catch (e) {
    console.error(`現行 YAML が読めないので既定値から作り直します — ${e.message.split('\n')[0]}`);
  }
}

/** 最小限のクォート。日本語や URL は裸で置きたいので、必要なときだけ引用符を付ける */
function scalar(v) {
  const s = String(v);
  if (s === '') return "''";
  if (/^[-?:,[\]{}#&*!|>'"%@`]/.test(s) || /:\s|\s#|^\s|\s$/.test(s) || /^(true|false|null|yes|no|on|off|~)$/i.test(s) || /^-?\d/.test(s)) {
    return `'${s.replace(/'/g, "''")}'`;
  }
  return s;
}

const unknown = [];
const out = [];
for (const fact of series) {
  const a = approved[String(fact.season)] ?? {};
  const p = previous.get(fact.season) ?? {};
  const pick = (key) => (a[key] !== undefined ? a[key] : p[key]);

  const kind = pick('kind') ?? 'topic';
  const items = pick('items') ?? [];
  const entry = {
    season: fact.season,
    title: pick('title') ?? fact.title,
    episodes: fact.episodes,
    firstAired: fact.firstAired,
    lastAired: fact.lastAired,
    url: fact.url,
    kind,
    items,
    laneHint: pick('laneHint'),
    note: pick('note'),
  };
  if (kind === 'topic' && items.length === 0) unknown.push(fact.season);
  out.push(entry);
}

for (const key of Object.keys(approved)) {
  if (!series.some((s) => String(s.season) === key)) {
    console.error(`! 承認ファイルの season ${key} は RSS に無いシリーズです（無視しました）`);
  }
}
for (const key of Object.keys(approved)) {
  for (const f of Object.keys(approved[key])) {
    if (!HUMAN.includes(f)) console.error(`! season ${key}: ${f} は人が決めるフィールドではありません（無視しました）`);
  }
}

const lines = [
  '# COTEN RADIO と年表項目の対応表。',
  `# 出所: 番組公式 RSS（${podcastMeta.feed}）。`,
  '#',
  '# season / title / episodes / firstAired / lastAired / url は scripts/coten-series.mjs が RSS から作り、',
  '# items / kind / note / laneHint だけを人が決める。書き戻しは scripts/coten-apply.mjs。',
  '# シリーズごとの補足はコメントではなく note: に書くこと（apply が再生成するとコメントは消える）。',
  '#',
  `# 本編${series.length}シリーズ（${series.reduce((n, s) => n + s.episodes, 0)}回）だけを扱う。番外編と形式外（告知・特別編）は入れない。`,
  '# エピソードの題名や説明文は転記せず、シリーズ単位の事実と第1回へのリンクだけを持つ。',
  '',
  'podcast:',
  `  title: ${scalar(podcastMeta.title)}`,
  `  url: ${scalar(podcastMeta.url)}`,
  `  feed: ${scalar(podcastMeta.feed)}`,
  ...(podcastMeta.note ? [`  note: ${scalar(podcastMeta.note)}`] : []),
  '',
  'series:',
];

for (const e of out) {
  lines.push(`  - season: ${e.season}`);
  lines.push(`    title: ${scalar(e.title)}`);
  lines.push(`    episodes: ${e.episodes}`);
  lines.push(`    firstAired: '${e.firstAired}'`);
  if (e.lastAired) lines.push(`    lastAired: '${e.lastAired}'`);
  lines.push(`    url: ${scalar(e.url)}`);
  if (e.kind !== 'topic') lines.push(`    kind: ${e.kind}`);
  lines.push(`    items: [${e.items.map(scalar).join(', ')}]`);
  if (e.laneHint) lines.push(`    laneHint: ${e.laneHint}`);
  if (e.note) lines.push(`    note: ${scalar(e.note)}`);
  lines.push('');
}

fs.mkdirSync(path.dirname(DEST), { recursive: true });
fs.writeFileSync(DEST, `${lines.join('\n').replace(/\n+$/, '')}\n`);

const count = (k) => out.filter((e) => e.kind === k).length;
const linked = new Set(out.filter((e) => e.kind === 'topic').flatMap((e) => e.items)).size;
console.log(`${out.length} シリーズを書き出しました → ${path.relative(process.cwd(), DEST)}`);
console.log(`  紐付け ${count('topic')}（年表 ${linked}項目）/ テーマ史 ${count('theme')} / 未カバー ${count('uncovered')}`);
if (unknown.length) {
  console.log(`\n未判断 ${unknown.length} 件（kind: topic なのに items が空。npm run validate で止まります）: ${unknown.join(', ')}`);
}
