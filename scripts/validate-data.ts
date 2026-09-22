#!/usr/bin/env node
/** src/data/**\/*.yaml をスキーマ検証する。ビルドを待たずに AI 生成データを検品する用。 */
import { loadAll } from '../src/lib/load.ts';
import { LANES } from '../src/lib/model.ts';

const { periods, events, byLane, files, errors } = loadAll();

if (errors.length > 0) {
  console.error(`\n✗ ${errors.length} 件の問題が見つかりました\n`);
  for (const e of errors) console.error(`  - ${e}`);
  console.error('');
  process.exit(1);
}

console.log(`\n✓ ${files.length} ファイル / 期間 ${periods.length} 件 / 出来事 ${events.length} 件\n`);
const width = Math.max(...LANES.map((l) => [...l.label].length)) * 2;
for (const lane of LANES) {
  const d = byLane.get(lane.id)!;
  const total = d.periods.length + d.events.length;
  const bar = '■'.repeat(Math.min(40, Math.ceil(total / 2)));
  console.log(
    `  ${lane.label.padEnd(width - [...lane.label].length)} ${String(total).padStart(4)}  ${bar}${total === 0 ? ' (空)' : ''}`,
  );
}
console.log('');
