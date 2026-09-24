/** CLI（npm run validate）用のデータ読み込み。 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFiles, type LoadResult, type RawFile } from './load.ts';

const DATA_DIR = fileURLToPath(new URL('../data', import.meta.url));
const PODCAST_DIR = fileURLToPath(new URL('../podcasts', import.meta.url));

/** _ や . で始まるファイルは説明書扱いで読み飛ばす */
function collect(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('_') || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collect(full));
    else if (/\.ya?ml$/.test(entry.name)) out.push(full);
  }
  return out;
}

export function loadAll(): LoadResult {
  const files: RawFile[] = collect(DATA_DIR).map((file) => ({
    path: path.relative(process.cwd(), file),
    text: fs.readFileSync(file, 'utf8'),
  }));
  return parseFiles(files);
}

/** ポッドキャストの対応表。年表そのものではないので src/data の外に置いてある */
export function loadPodcastFiles(): RawFile[] {
  return collect(PODCAST_DIR).map((file) => ({
    path: path.relative(process.cwd(), file),
    text: fs.readFileSync(file, 'utf8'),
  }));
}
