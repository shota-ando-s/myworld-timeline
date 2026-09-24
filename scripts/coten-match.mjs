#!/usr/bin/env node
/**
 * COTEN RADIO のシリーズと年表項目の候補を並べる。貼らない。人が選ぶための材料。
 *
 *   node scripts/coten-match.mjs [--only <season>] [--quiet]
 *
 * 突き合わせは項目の title と tags にだけ当て、id には当てない。
 * id はローマ字綴りなので部分一致が効いてしまい、
 *   諸葛孔明 → ming（明） / お金の歴史 → jurchen-jin（金）
 *   民主主義の歴史 → north-korea（朝鮮民主主義人民共和国） / ニコラ・テスラ → nicholas-i
 * のように当たる。wiki-match.mjs の「マクロン → 発音記号」と同じ型の誤爆。
 */
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadAll } from '../src/lib/load-fs.ts';
import { formatItemDate, laneById } from '../src/lib/model.ts';

const SERIES = fileURLToPath(new URL('.cache/coten-series.json', import.meta.url));
const OUT = fileURLToPath(new URL('.cache/coten-match.json', import.meta.url));

/** 候補が多すぎるときは自動候補をあてにしない（「天皇」→ 歴代天皇レコード全件になる） */
const TOO_MANY = 6;
const MAX_SHOW = 5;
/** CJK は1文字の情報量が大きいぶん短い一致が効きすぎるので、3文字以上を要求する */
const MIN_OVERLAP = 3;

if (!fs.existsSync(SERIES)) {
  console.error('先に node scripts/coten-series.mjs を走らせてください');
  process.exit(1);
}

/** シリーズ名から、年表と突き合わせる「芯」を取り出す */
function core(title) {
  return title
    .replace(/^(ショート|ジンブンガク)\s*/, '')
    .replace(/編$/, '')
    .replace(/(前|後)$/, '')
    .trim();
}

/** 表記の揺れを吸収する（中黒・イコール・空白・全角英数） */
function norm(s) {
  return s
    .replace(/[・＝=\s]/g, '')
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .toLowerCase();
}

const { items, errors } = loadAll();
if (errors.length > 0) {
  console.error(`年表データに ${errors.length} 件の問題があります。先に npm run validate を通してください。`);
  process.exit(1);
}

const series = JSON.parse(fs.readFileSync(SERIES, 'utf8'));
const only = process.argv.includes('--only') ? Number(process.argv[process.argv.indexOf('--only') + 1]) : null;
const quiet = process.argv.includes('--quiet');

const out = [];
for (const s of series) {
  if (only !== null && s.season !== only) continue;
  const c = core(s.title);
  const nc = norm(c);
  // 「〇〇の歴史」「〇〇史」はテーマ史。芯から外した形でも当ててみる
  const theme = /の歴史$|史$/.test(c);
  const bare = norm(c.replace(/の歴史$|史$/, ''));

  const scored = [];
  for (const item of items) {
    const nt = norm(item.title);
    const tags = item.tags.map(norm);
    let level = null;
    if (nt === nc) level = 'exact';
    else if (nc.length >= MIN_OVERLAP && nt.includes(nc)) level = 'title-in';
    else if (nt.length >= MIN_OVERLAP && nc.includes(nt)) level = 'title-of';
    else if (tags.some((t) => t === nc || (bare.length >= MIN_OVERLAP && t === bare))) level = 'tag';
    else if (!theme && bare.length >= MIN_OVERLAP && bare !== nc && nt.includes(bare)) level = 'bare';
    if (level) scored.push({ level, item });
  }

  const order = { exact: 0, 'title-in': 1, 'title-of': 2, tag: 3, bare: 4 };
  scored.sort((a, b) => order[a.level] - order[b.level] || a.item.title.localeCompare(b.item.title));

  out.push({
    season: s.season,
    title: s.title,
    core: c,
    episodes: s.episodes,
    firstAired: s.firstAired,
    url: s.url,
    ambiguous: scored.length >= TOO_MANY,
    candidates: scored.slice(0, MAX_SHOW).map(({ level, item }) => ({
      id: item.id,
      level,
      title: item.title,
      lane: item.lane,
      kind: item.kind === 'event' ? '出来事' : item.leader ? '人物' : '期間',
      date: formatItemDate(item),
    })),
    candidateCount: scored.length,
  });
}

fs.writeFileSync(OUT, `${JSON.stringify(out, null, 1)}\n`);

if (!quiet) {
  for (const s of out) {
    const flag = s.candidateCount === 0 ? ' ← 候補なし' : s.ambiguous ? ` ← 候補${s.candidateCount}件、自動候補はあてにならない` : '';
    console.log(`\n${String(s.season).padStart(3)} ${s.title}（全${s.episodes}回・${s.firstAired}）${flag}`);
    for (const c of s.candidates) {
      console.log(`      ${c.level.padEnd(8)} ${c.id.padEnd(26)} ${c.title} / ${laneById.get(c.lane).label}・${c.kind}・${c.date}`);
    }
  }
}

const none = out.filter((s) => s.candidateCount === 0).length;
console.log(`\n${out.length} シリーズ / 候補ゼロ ${none} / 候補多すぎ ${out.filter((s) => s.ambiguous).length}`);
console.log(`→ ${OUT}`);
console.log('候補は判断材料。67件すべて目で見て、承認ファイル（JSON）を書くこと。');
