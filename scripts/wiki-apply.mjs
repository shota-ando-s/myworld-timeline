#!/usr/bin/env node
/**
 * 承認済みのリンクを YAML に書き入れる。
 *   node scripts/wiki-apply.mjs scripts/.cache/approved.json
 *
 * 承認ファイルは { "<項目id>": { "label": "Wikipedia", "url": "https://..." } }。
 * 既に Wikipedia のリンクがある項目は触らない（何度流しても同じ結果になる）。
 * YAML を再生成せず該当行だけ挿し込むので、コメントや [] 記法はそのまま残る。
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

/**
 * YAML の値として裸で置けない形（行頭の記号、": "、" #"）だけ引用符でくるむ。
 * 日本語を含む URL はそのまま置いたほうが読みやすいので、必要なときだけ引用する。
 */
function yamlScalar(v) {
  return /^[\s#&*!|>%@`-]|:\s|\s#/.test(v) ? `"${v.replace(/"/g, '\\"')}"` : v;
}

const approved = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
let added = 0;
let skipped = 0;
const seen = new Set();

for (const file of collect(DATA)) {
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  // 後ろから入れないと、挿し込みで行番号がずれる
  const starts = [];
  lines.forEach((l, i) => {
    const m = l.match(/^ {2}- id: (\S+)\s*$/);
    if (m) starts.push({ i, id: m[1] });
  });

  for (let s = starts.length - 1; s >= 0; s--) {
    const { i, id } = starts[s];
    const entry = approved[id];
    if (!entry) continue;
    seen.add(id);
    // 項目の終わりは「次の - id:」か「periods: / events: のような行頭のキー」の手前
    let end = i + 1;
    while (end < lines.length && !/^\S/.test(lines[end]) && !/^ {2}- id: /.test(lines[end])) end++;
    while (end > i && lines[end - 1].trim() === '') end--; // 項目の間の空行は残す

    const block = lines.slice(i, end);
    if (block.some((l) => /^ {4}links:/.test(l))) { skipped++; continue; }

    const rel = block.findIndex((l) => /^ {4}related:/.test(l));
    const at = i + (rel === -1 ? block.length : rel);
    lines.splice(at, 0, '    links:', `      - label: ${entry.label ?? 'Wikipedia'}`, `        url: ${yamlScalar(entry.url)}`);
    added++;
  }
  fs.writeFileSync(file, lines.join('\n'));
}

const missing = Object.keys(approved).filter((id) => !seen.has(id));
console.log(`追加 ${added} 件 / 既にリンクあり ${skipped} 件${missing.length ? ` / 見つからない id ${missing.length} 件: ${missing.slice(0, 5).join(', ')}` : ''}`);
