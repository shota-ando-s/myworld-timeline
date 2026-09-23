#!/usr/bin/env node
/**
 * 書いた detail を YAML に差し込む。
 *   node scripts/detail-apply.mjs <本文.json>
 * 本文ファイルは { "<項目id>": "1行目\n2行目" }。
 * 既に detail がある項目は触らない。YAML は再生成せず該当箇所に挿すだけ。
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

const replace = process.argv.includes('--replace'); // 既にある detail を書き換える
const append = process.argv.includes('--append'); // 既にある detail の後ろに書き足す
const texts = JSON.parse(fs.readFileSync(process.argv.find((a) => a.endsWith('.json')), 'utf8'));
let added = 0;
let skipped = 0;
const seen = new Set();

for (const file of collect(DATA)) {
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  const starts = [];
  lines.forEach((l, i) => {
    const m = l.match(/^ {2}- id: (\S+)\s*$/);
    if (m) starts.push({ i, id: m[1] });
  });

  for (let s = starts.length - 1; s >= 0; s--) {
    const { i, id } = starts[s];
    const text = texts[id];
    if (!text) continue;
    seen.add(id);

    let end = i + 1;
    while (end < lines.length && !/^\S/.test(lines[end]) && !/^ {2}- id: /.test(lines[end])) end++;
    while (end > i && lines[end - 1].trim() === '') end--;

    let block = lines.slice(i, end);
    const has = block.findIndex((l) => /^ {4}detail:/.test(l));
    if (has !== -1 && append) {
      let last = has + 1;
      while (last < block.length && /^ {6}\S/.test(block[last])) last++;
      const body = String(text).trim().split('\n').map((l) => `      ${l.trim()}`);
      lines.splice(i + last, 0, ...body);
      added++;
      continue;
    }
    if (has !== -1) {
      if (!replace) { skipped++; continue; }
      // 既存の detail（|ブロックの中身も）を取り除いてから入れ直す
      let last = has + 1;
      while (last < block.length && /^ {6}\S/.test(block[last])) last++;
      lines.splice(i + has, last - has);
      end -= last - has;
      block = lines.slice(i, end);
    }

    // 並びは summary → detail → image → links → related
    const after = block.findIndex((l) => /^ {4}(image|links|related):/.test(l));
    const at = i + (after === -1 ? block.length : after);
    const body = String(text).trim().split('\n').map((l) => `      ${l.trim()}`);
    lines.splice(at, 0, '    detail: |', ...body);
    added++;
  }
  fs.writeFileSync(file, lines.join('\n'));
}

const missing = Object.keys(texts).filter((id) => !seen.has(id));
console.log(`detail 追加 ${added} 件 / 既にある ${skipped} 件${missing.length ? ` / 不明な id ${missing.length} 件: ${missing.slice(0, 5).join(', ')}` : ''}`);
