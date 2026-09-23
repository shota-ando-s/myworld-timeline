#!/usr/bin/env node
/**
 * detail の改行位置を「1文＝1行」にそろえる。
 * 文の途中で折り返すと、パネル側の折り返しと二重になって行が不揃いに見えるため。
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

let changed = 0;
for (const file of collect(DATA)) {
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/^ {4}detail: \|\s*$/.test(lines[i])) { out.push(lines[i]); continue; }
    const body = [];
    let j = i + 1;
    while (j < lines.length && /^ {6}\S/.test(lines[j])) body.push(lines[j].trim()), j++;
    // 日本語はそのまま、英数字で終わる行だけ空白を挟んでつなぐ
    const joined = body.reduce((acc, l) => (acc && /[A-Za-z0-9]$/.test(acc) && /^[A-Za-z0-9]/.test(l) ? `${acc} ${l}` : acc + l), '');
    const sentences = joined.split(/(?<=。)/).filter(Boolean);
    out.push(lines[i], ...sentences.map((s) => `      ${s}`));
    if (sentences.length !== body.length || sentences.some((t, k) => t !== body[k])) changed++;
    i = j - 1;
  }
  fs.writeFileSync(file, out.join('\n'));
}
console.log(`detail の改行を整えました（${changed} 件）`);
