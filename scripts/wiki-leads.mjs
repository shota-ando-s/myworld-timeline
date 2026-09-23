#!/usr/bin/env node
/**
 * リンク先の記事の冒頭文をまとめて取ってきて .cache に置く。
 * 使い道は2つ。
 *   1. detail を書くときの事実確認（年代・順序・固有名詞の裏取り）
 *   2. 書いた detail が元の文をなぞっていないかの検査（check-originality.mjs）
 * 本文をサイトに載せるためのものではない。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAll } from '../src/lib/load-fs.ts';

const UA = 'myworld-timeline/0.1 (personal history timeline; ando@fuenn.co.jp)';
const OUT = fileURLToPath(new URL('.cache/wiki-leads.json', import.meta.url));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** URL から記事名を取り出す */
function articleOf(item) {
  const link = item.links.find((l) => l.url.includes('ja.wikipedia.org/wiki/'));
  if (!link) return null;
  return decodeURIComponent(link.url.split('/wiki/')[1]).replace(/_/g, ' ');
}

const { items } = loadAll();
const byArticle = new Map();
for (const item of items) {
  const a = articleOf(item);
  if (a) byArticle.set(a, [...(byArticle.get(a) ?? []), item.id]);
}
const titles = [...byArticle.keys()];
console.error(`${titles.length} 記事の冒頭文を取ります`);

const cached = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {};
const todo = titles.filter((t) => !cached[t]);
console.error(`うち未取得 ${todo.length} 件`);

for (let i = 0; i < todo.length; i += 20) {
  const url = `https://ja.wikipedia.org/w/api.php?${new URLSearchParams({
    action: 'query', format: 'json', formatversion: '2', prop: 'extracts',
    exintro: '1', explaintext: '1', exlimit: '20', redirects: '1',
    titles: todo.slice(i, i + 20).join('|'),
  })}`;
  const data = await (await fetch(url, { headers: { 'User-Agent': UA } })).json();
  const alias = new Map();
  for (const n of data.query?.normalized ?? []) alias.set(n.from, n.to);
  for (const r of data.query?.redirects ?? []) alias.set(r.from, r.to);
  const got = new Map((data.query?.pages ?? []).map((p) => [p.title, p.extract ?? '']));
  for (const asked of todo.slice(i, i + 20)) {
    let name = asked;
    for (let h = 0; h < 3 && alias.has(name); h++) name = alias.get(name);
    if (got.has(name)) cached[asked] = got.get(name);
  }
  process.stderr.write(`\r${Math.min(i + 20, todo.length)}/${todo.length}`);
  await sleep(130);
}
process.stderr.write('\n');

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(cached, null, 1));
const chars = Object.values(cached).reduce((a, b) => a + b.length, 0);
console.error(`${Object.keys(cached).length} 記事 / 計 ${Math.round(chars / 1000)}千字を ${path.relative(process.cwd(), OUT)} に置きました`);
