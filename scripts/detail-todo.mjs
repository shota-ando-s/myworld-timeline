#!/usr/bin/env node
/** detail がまだ無い項目を、書くのに要る材料つきで並べる。 node scripts/detail-todo.mjs <lane> [開始] [件数] */
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadAll } from '../src/lib/load-fs.ts';
import { formatItemDate } from '../src/lib/model.ts';

const leads = JSON.parse(fs.readFileSync(fileURLToPath(new URL('.cache/wiki-leads.json', import.meta.url)), 'utf8'));
const [lane, from = '0', count = '60'] = process.argv.slice(2);
const { items } = loadAll();
const todo = items.filter((i) => i.lane === lane && !i.detail).sort((a, b) => (a.kind === 'event' ? a.year : a.start) - (b.kind === 'event' ? b.year : b.start));
console.log(`# ${lane}: detail 未記入 ${todo.length} 件中 ${from} から ${count} 件\n`);
for (const item of todo.slice(Number(from), Number(from) + Number(count))) {
  const link = item.links.find((l) => l.url.includes('ja.wikipedia.org/wiki/'));
  const article = link ? decodeURIComponent(link.url.split('/wiki/')[1]).replace(/_/g, ' ') : null;
  const lead = (article && leads[article] ? leads[article] : '').replace(/\s+/g, ' ').slice(0, 210);
  console.log(`${item.id} | ${item.title}（${formatItemDate(item)}）`);
  console.log(`  要約: ${item.summary}`);
  console.log(`  典拠: ${article ?? '（リンクなし）'} — ${lead}`);
}
