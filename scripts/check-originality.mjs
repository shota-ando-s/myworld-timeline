#!/usr/bin/env node
/**
 * detail が Wikipedia の冒頭文をなぞっていないかを調べる。
 *
 * 事実（年代・人名・出来事の順序）に著作権は無いので借りてよいが、
 * 表現をなぞると翻案にあたりうる。ここでは「どれだけ同じ字面が続くか」を見る。
 *   - 20文字以上そのまま一致する箇所があれば要注意
 *   - 8文字の並びの4分の1以上が元の文と一致していれば要注意
 * 固有名詞や定型句はどうしても一致するので、警告であって失格ではない。
 * 引っかかったら、その項目を自分の言葉で書き直す。
 */
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadAll } from '../src/lib/load-fs.ts';

const LEADS = fileURLToPath(new URL('.cache/wiki-leads.json', import.meta.url));
const LONG_RUN = 20;
const GRAM = 8;
const GRAM_RATIO = 0.25;

if (!fs.existsSync(LEADS)) {
  console.log('（wiki-leads のキャッシュが無いので、なぞり書きの検査は省略しました）');
  process.exit(0);
}
const leads = JSON.parse(fs.readFileSync(LEADS, 'utf8'));

/** 比べる前に、空白と記号の違いをならす */
const norm = (s) => s.replace(/[\s、。「」『』（）()・,.\-–—]/g, '');

function grams(s, n) {
  const out = new Set();
  for (let i = 0; i + n <= s.length; i++) out.add(s.slice(i, i + n));
  return out;
}

const { items } = loadAll();
const hits = [];
for (const item of items) {
  if (!item.detail) continue;
  const link = item.links.find((l) => l.url.includes('ja.wikipedia.org/wiki/'));
  if (!link) continue;
  const article = decodeURIComponent(link.url.split('/wiki/')[1]).replace(/_/g, ' ');
  const lead = leads[article];
  if (!lead) continue;

  const mine = norm(item.detail);
  const theirs = norm(lead);
  if (mine.length < GRAM) continue;

  const theirLong = grams(theirs, LONG_RUN);
  const run = [...grams(mine, LONG_RUN)].find((g) => theirLong.has(g));

  const theirGrams = grams(theirs, GRAM);
  const mineGrams = [...grams(mine, GRAM)];
  const shared = mineGrams.filter((g) => theirGrams.has(g)).length;
  const ratio = mineGrams.length ? shared / mineGrams.length : 0;

  if (run || ratio > GRAM_RATIO) {
    hits.push({ item, article, run, ratio });
  }
}

if (hits.length === 0) {
  console.log('✓ なぞり書きの疑いはありません');
  process.exit(0);
}
console.log(`\n⚠ ${hits.length} 件、Wikipedia の冒頭文と字面が近すぎます（自分の言葉で書き直してください）\n`);
for (const h of hits) {
  console.log(`  - 「${h.item.title}」 ← ${h.article}`);
  console.log(`      一致率 ${(h.ratio * 100).toFixed(0)}%${h.run ? ` / 連続一致: 「${h.run}」` : ''}`);
}
console.log('');
