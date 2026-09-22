/**
 * Astro（Vite）側のデータ読み込み。
 * import.meta.glob でビルドに YAML を取り込むので、本番ビルドでも確実にデータが入り、
 * 開発中は YAML を保存すると自動で再読み込みされる。
 */
import { orThrow, parseFiles, type LoadResult, type RawFile } from './load.ts';

const modules = import.meta.glob('../data/**/*.{yaml,yml}', { query: '?raw', import: 'default', eager: true });

const rawFiles: RawFile[] = Object.entries(modules)
  .filter(([path]) => !/\/[._]/.test(path))
  .map(([path, text]) => ({ path: path.replace('../', 'src/'), text: text as string }));

export function loadAll(): LoadResult {
  return parseFiles(rawFiles);
}

export function loadOrThrow(): LoadResult {
  return orThrow(loadAll());
}
