import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { DataFileSchema } from './schema.ts';
import { LANES, type Item, type LaneId, type Period, type TimelineEvent } from './model.ts';

const DATA_DIR = fileURLToPath(new URL('../data', import.meta.url));

export type LoadResult = {
  periods: Period[];
  events: TimelineEvent[];
  items: Item[];
  byLane: Map<LaneId, { periods: Period[]; events: TimelineEvent[] }>;
  files: string[];
  errors: string[];
};

/** src/data 以下の *.yaml を再帰的に集める（_ で始まるファイルは説明書扱いで無視） */
function collectFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name.startsWith('_') || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectFiles(full));
    else if (/\.ya?ml$/.test(entry.name)) out.push(full);
  }
  return out;
}

function formatPath(p: readonly PropertyKey[]): string {
  return p
    .map((seg, i) => (typeof seg === 'number' ? `[${seg}]` : i === 0 ? String(seg) : `.${String(seg)}`))
    .join('');
}

/** エラーメッセージに「どの項目か」を混ぜるため、生データからタイトルを拾う */
function titleAt(raw: unknown, issuePath: readonly PropertyKey[]): string {
  if (issuePath.length < 2 || typeof raw !== 'object' || raw === null) return '';
  const list = (raw as Record<string, unknown>)[String(issuePath[0])];
  if (!Array.isArray(list)) return '';
  const entry = list[Number(issuePath[1])];
  if (typeof entry !== 'object' || entry === null) return '';
  const t = (entry as Record<string, unknown>).title ?? (entry as Record<string, unknown>).id;
  return typeof t === 'string' ? `「${t}」` : '';
}

export function loadAll(): LoadResult {
  const errors: string[] = [];
  const periods: Period[] = [];
  const events: TimelineEvent[] = [];
  const files = collectFiles(DATA_DIR);

  for (const file of files) {
    const rel = path.relative(process.cwd(), file);
    let raw: unknown;
    try {
      raw = yaml.load(fs.readFileSync(file, 'utf8'));
    } catch (e) {
      errors.push(`${rel}: YAML として読めません — ${(e as Error).message.split('\n')[0]}`);
      continue;
    }
    if (raw === null || raw === undefined) continue; // 空ファイルは許容

    const parsed = DataFileSchema.safeParse(raw);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        errors.push(`${rel} ${formatPath(issue.path)}${titleAt(raw, issue.path)}: ${issue.message}`);
      }
      continue;
    }

    const fileLane = parsed.data.lane;
    const fallbackLane = LANES.find((l) => l.id === path.basename(file).replace(/\.ya?ml$/, ''))?.id;

    for (const p of parsed.data.periods) {
      const lane = p.lane ?? fileLane ?? fallbackLane;
      if (!lane) {
        errors.push(`${rel} periods「${p.title}」: lane が決まりません（ファイル先頭に lane: を書くか、項目に lane: を足してください）`);
        continue;
      }
      periods.push({ ...p, lane, kind: 'period' });
    }
    for (const e of parsed.data.events) {
      const lane = e.lane ?? fileLane ?? fallbackLane;
      if (!lane) {
        errors.push(`${rel} events「${e.title}」: lane が決まりません（ファイル先頭に lane: を書くか、項目に lane: を足してください）`);
        continue;
      }
      events.push({ ...e, lane, kind: 'event' });
    }
  }

  // 横断チェック: id の重複
  const seen = new Map<string, string>();
  for (const item of [...periods, ...events]) {
    const where = `${item.kind === 'period' ? '期間' : '出来事'}「${item.title}」`;
    const prev = seen.get(item.id);
    if (prev) errors.push(`id の重複: "${item.id}" が ${prev} と ${where} の両方にあります`);
    else seen.set(item.id, where);
  }

  // 横断チェック: related の参照先
  for (const item of [...periods, ...events]) {
    for (const ref of item.related) {
      if (!seen.has(ref)) errors.push(`「${item.title}」の related: "${ref}" という id は存在しません`);
    }
  }

  periods.sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
  events.sort((a, b) => a.year - b.year || a.id.localeCompare(b.id));

  const byLane = new Map<LaneId, { periods: Period[]; events: TimelineEvent[] }>();
  for (const lane of LANES) byLane.set(lane.id, { periods: [], events: [] });
  for (const p of periods) byLane.get(p.lane)!.periods.push(p);
  for (const e of events) byLane.get(e.lane)!.events.push(e);

  return { periods, events, items: [...periods, ...events], byLane, files, errors };
}

/** ビルド時用: データが壊れていたら止める */
export function loadOrThrow(): LoadResult {
  const result = loadAll();
  if (result.errors.length > 0) {
    throw new Error(
      `年表データに ${result.errors.length} 件の問題があります:\n` +
        result.errors.map((e) => `  - ${e}`).join('\n') +
        `\n(npm run validate で同じ検査ができます)`,
    );
  }
  return result;
}
