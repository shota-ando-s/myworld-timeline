#!/usr/bin/env node
/**
 * 差し替え候補の記事が実在するか、冒頭文とあわせて確かめる。
 *   node scripts/wiki-verify.mjs "id=記事名" "id=記事名" ...
 * 通ったものは scripts/.cache/verified.json に書き、そのまま wiki-apply に渡せる。
 */
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const UA = 'myworld-timeline/0.1 (personal history timeline; ando@fuenn.co.jp)';
const OUT = fileURLToPath(new URL('.cache/verified.json', import.meta.url));
const pairs = process.argv.slice(2).map((a) => {
  const at = a.indexOf('=');
  return { id: a.slice(0, at), title: a.slice(at + 1) };
});

const url = `https://ja.wikipedia.org/w/api.php?${new URLSearchParams({
  action: 'query', format: 'json', formatversion: '2', prop: 'extracts|pageprops|info',
  inprop: 'url', exintro: '1', explaintext: '1', exlimit: '20', redirects: '1',
  titles: [...new Set(pairs.map((p) => p.title))].join('|'),
})}`;
const data = await (await fetch(url, { headers: { 'User-Agent': UA } })).json();

const alias = new Map();
for (const n of data.query?.normalized ?? []) alias.set(n.from, n.to);
for (const r of data.query?.redirects ?? []) alias.set(r.from, r.to);
const byTitle = new Map((data.query?.pages ?? []).map((p) => [p.title, p]));

const out = {};
for (const { id, title } of pairs) {
  let name = title;
  for (let i = 0; i < 3 && alias.has(name); i++) name = alias.get(name);
  const p = byTitle.get(name);
  if (!p || p.missing) { console.log(`✗ ${id}: 「${title}」という記事は無い`); continue; }
  if (p.pageprops?.disambiguation) { console.log(`▲ ${id}: 「${p.title}」は曖昧さ回避のページ`); continue; }
  out[id] = { label: 'Wikipedia', url: decodeURIComponent(p.fullurl) };
  console.log(`○ ${id}: ${p.title} — ${(p.extract ?? '').replace(/\s+/g, ' ').slice(0, 70)}`);
}
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
console.log(`\n確認できた ${Object.keys(out).length} 件を .cache/verified.json に書きました`);
