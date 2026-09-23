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
    // 空行は段落の切れ目なので残す（次に本文が続く場合だけ）
    while (j < lines.length && (/^ {6}\S/.test(lines[j]) || (lines[j].trim() === '' && /^ {6}\S/.test(lines[j + 1] ?? '')))) {
      body.push(lines[j].trim());
      j++;
    }
    // 日本語はそのまま、英数字で終わる行だけ空白を挟んでつなぐ
    // 段落ごとに、1文＝1行へそろえる
    const paras = body.join('\n').split(/\n{2,}/).filter((t) => t.trim());
    const rebuilt = paras.flatMap((para, k) => {
      const joined = para
        .split('\n')
        .reduce((acc, l) => (acc && /[A-Za-z0-9]$/.test(acc) && /^[A-Za-z0-9]/.test(l) ? `${acc} ${l}` : acc + l), '');
      const sentences = joined.split(/(?<=。)/).filter(Boolean).map((t) => `      ${t}`);
      return k === 0 ? sentences : ['', ...sentences];
    });
    out.push(lines[i], ...rebuilt);
    const sentences = rebuilt;
    if (sentences.length !== body.length || sentences.some((t, k) => t !== body[k])) changed++;
    i = j - 1;
  }
  fs.writeFileSync(file, out.join('\n'));
}
console.log(`detail の改行を整えました（${changed} 件）`);
