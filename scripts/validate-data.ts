#!/usr/bin/env node
/** src/data/**\/*.yaml をスキーマ検証する。ビルドを待たずに AI 生成データを検品する用。 */
import { loadAll, loadPodcastFiles } from '../src/lib/load-fs.ts';
import { LANES, laneById } from '../src/lib/model.ts';
import { parsePodcasts, podcastSummary } from '../src/lib/podcast.ts';

const { periods, leaders, events, items, byLane, files, errors } = loadAll();

// 年表側が壊れているときは id 集合が欠けて「存在しません」の誤報が出るので、突き合わせは諦める
const podcast = parsePodcasts(
  loadPodcastFiles(),
  errors.length > 0 ? undefined : new Set(items.map((i) => i.id)),
);
const allErrors = [...errors, ...podcast.errors];

if (allErrors.length > 0) {
  console.error(`\n✗ ${allErrors.length} 件の問題が見つかりました\n`);
  for (const e of allErrors) console.error(`  - ${e}`);
  console.error('');
  process.exit(1);
}

console.log(
  `\n✓ ${files.length} ファイル / 期間 ${periods.length} 件 / 人物 ${leaders.length} 件 / 出来事 ${events.length} 件\n`,
);
const width = Math.max(...LANES.map((l) => [...l.label].length)) * 2;
for (const lane of LANES) {
  const d = byLane.get(lane.id)!;
  const total = d.periods.length + d.leaders.length + d.events.length;
  // 期間・出来事（■）と人物（□）を続けて描き、どちらが薄いレーンかを見分けられるようにする
  const bar = '■'.repeat(Math.min(40, Math.ceil((d.periods.length + d.events.length) / 2))) +
    '□'.repeat(Math.min(40, Math.ceil(d.leaders.length / 2)));
  console.log(
    `  ${lane.label.padEnd(width - [...lane.label].length)} ${String(total).padStart(4)} (人物${String(d.leaders.length).padStart(3)})  ${bar}${total === 0 ? ' (空)' : ''}`,
  );
}
console.log('');

if (podcast.series.length > 0) {
  const p = podcastSummary(podcast);
  console.log(
    `  ${podcast.show}: ${p.seriesCount}シリーズ（${p.episodeCount}回）/ 紐付け ${p.topic}（年表 ${p.linkedItems}項目）/ テーマ史 ${p.theme} / 未カバー ${p.uncovered.length}`,
  );
  if (p.uncovered.length > 0) {
    // 「番組は扱っているのに年表に無い話題」＝後日、項目を足す候補
    const list = p.uncovered
      .map((s) => `${s.title}${s.laneHint ? `(${laneById.get(s.laneHint)?.label ?? s.laneHint})` : ''}`)
      .join(' ');
    console.log(`  未カバー（項目を足す候補）: ${list}`);
  }
  console.log('');
}

// detail が Wikipedia の冒頭文をなぞっていないかも見ておく（キャッシュがあるときだけ）
const { execFileSync } = await import('node:child_process');
execFileSync(process.execPath, [new URL('check-originality.mjs', import.meta.url).pathname], { stdio: 'inherit' });
