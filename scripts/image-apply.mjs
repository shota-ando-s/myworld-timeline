#!/usr/bin/env node
/**
 * 取ってきた画像を YAML に差し込む。 node scripts/image-apply.mjs scripts/.cache/wiki-images.json
 * 並びは summary → detail → image → links → related。既に image がある項目は触らない。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DATA = fileURLToPath(new URL('../src/data', import.meta.url));
function collect(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('_') || e.name.startsWith('.')) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...collect(full));
    else if (/\.ya?ml$/.test(e.name)) out.push(full);
  }
  return out;
}
const q = (v) => (/^[\s#&*!|>%@`-]|:\s|\s#/.test(v) ? `"${v.replace(/"/g, '\\"')}"` : v);

const images = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
let added = 0, skipped = 0;
for (const file of collect(DATA)) {
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  const starts = [];
  lines.forEach((l, i) => {
    const m = l.match(/^ {2}- id: (\S+)\s*$/);
    if (m) starts.push({ i, id: m[1] });
  });
  for (let s = starts.length - 1; s >= 0; s--) {
    const { i, id } = starts[s];
    const img = images[id];
    if (!img) continue;
    let end = i + 1;
    while (end < lines.length && !/^\S/.test(lines[end]) && !/^ {2}- id: /.test(lines[end])) end++;
    while (end > i && lines[end - 1].trim() === '') end--;
    const block = lines.slice(i, end);
    if (block.some((l) => /^ {4}image:/.test(l))) { skipped++; continue; }
    const at = i + (block.findIndex((l) => /^ {4}(links|related):/.test(l)) === -1
      ? block.length
      : block.findIndex((l) => /^ {4}(links|related):/.test(l)));
    lines.splice(at, 0, '    image:', `      url: ${q(img.url)}`, `      credit: ${q(img.credit)}`, `      page: ${q(img.page)}`);
    added++;
  }
  fs.writeFileSync(file, lines.join('\n'));
}
console.log(`画像 追加 ${added} 件 / 既にある ${skipped} 件`);
