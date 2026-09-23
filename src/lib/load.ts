import yaml from 'js-yaml';
import { DataFileSchema, EventSchema, PeriodSchema } from './schema.ts';
import { LANES, type Item, type LaneId, type Period, type TimelineEvent } from './model.ts';

export type LaneBucket = { periods: Period[]; leaders: Period[]; events: TimelineEvent[] };

export type LoadResult = {
  /** 王朝・時代区分の帯（人物は含まない） */
  periods: Period[];
  /** 人物の治世の帯 */
  leaders: Period[];
  events: TimelineEvent[];
  items: Item[];
  byLane: Map<LaneId, LaneBucket>;
  files: string[];
  errors: string[];
};

/** 読み込むデータファイル1枚（パスと中身） */
export type RawFile = { path: string; text: string };

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

/**
 * YAML のテキスト群を読んで検証する。
 * ファイルの集め方は呼び出し側に任せる（ビルド時は Vite のグロブ、CLI は fs）。
 */
export function parseFiles(rawFiles: RawFile[]): LoadResult {
  const errors: string[] = [];
  const periods: Period[] = [];
  const leaders: Period[] = [];
  const events: TimelineEvent[] = [];
  const files = [...rawFiles].sort((a, b) => a.path.localeCompare(b.path));

  for (const file of files) {
    const rel = file.path;
    let raw: unknown;
    try {
      raw = yaml.load(file.text);
    } catch (e) {
      errors.push(`${rel}: YAML として読めません — ${(e as Error).message.split('\n')[0]}`);
      continue;
    }
    if (raw === null || raw === undefined) continue; // 空ファイルは許容

    const parsed = DataFileSchema.safeParse(raw);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        errors.push(`${rel} ${formatPath(issue.path)}: ${issue.message}`);
      }
      continue;
    }

    const fileLane = parsed.data.lane;
    const basename = rel.split('/').pop()!.replace(/\.ya?ml$/, '');
    const fallbackLane = LANES.find((l) => l.id === basename)?.id;

    // 1項目ずつ検証する。1つ壊れていても他の項目は読み込み、エラーは全部出す
    for (const [kind, list] of [
      ['periods', parsed.data.periods],
      ['leaders', parsed.data.leaders],
      ['events', parsed.data.events],
    ] as const) {
      list.forEach((entry, i) => {
        const result = kind === 'events' ? EventSchema.safeParse(entry) : PeriodSchema.safeParse(entry);
        const where = `${rel} ${kind}[${i}]${titleAt(raw, [kind, i])}`;
        if (!result.success) {
          for (const issue of result.error.issues) {
            errors.push(`${where}${issue.path.length ? '.' + formatPath(issue.path) : ''}: ${issue.message}`);
          }
          return;
        }
        const item = result.data;
        const lane = item.lane ?? fileLane ?? fallbackLane;
        if (!lane) {
          errors.push(`${where}: lane が決まりません（ファイル先頭に lane: を書くか、項目に lane: を足してください）`);
          return;
        }
        if (kind === 'events') {
          events.push({ ...(item as Omit<TimelineEvent, 'lane' | 'kind'>), lane, kind: 'event' });
        } else {
          const bar = { ...(item as Omit<Period, 'lane' | 'kind' | 'leader'>), lane, kind: 'period' as const, leader: kind === 'leaders' };
          (kind === 'leaders' ? leaders : periods).push(bar);
        }
      });
    }
  }

  const all: Item[] = [...periods, ...leaders, ...events];

  // 横断チェック: id の重複
  const seen = new Map<string, string>();
  for (const item of all) {
    const where = `${item.kind === 'event' ? '出来事' : item.leader ? '人物' : '期間'}「${item.title}」`;
    const prev = seen.get(item.id);
    if (prev) errors.push(`id の重複: "${item.id}" が ${prev} と ${where} の両方にあります`);
    else seen.set(item.id, where);
  }

  // 横断チェック: related の参照先
  for (const item of all) {
    for (const ref of item.related) {
      if (!seen.has(ref)) errors.push(`「${item.title}」の related: "${ref}" という id は存在しません`);
    }
  }

  const byStart = (a: Period, b: Period) => a.start - b.start || a.id.localeCompare(b.id);
  periods.sort(byStart);
  leaders.sort(byStart);
  events.sort((a, b) => a.year - b.year || a.id.localeCompare(b.id));

  const byLane = new Map<LaneId, LaneBucket>();
  for (const lane of LANES) byLane.set(lane.id, { periods: [], leaders: [], events: [] });
  for (const p of periods) byLane.get(p.lane)!.periods.push(p);
  for (const l of leaders) byLane.get(l.lane)!.leaders.push(l);
  for (const e of events) byLane.get(e.lane)!.events.push(e);

  return { periods, leaders, events, items: all, byLane, files: files.map((f) => f.path), errors };
}

/** ビルド時用: データが壊れていたら止める */
export function orThrow(result: LoadResult): LoadResult {
  // 読み込み経路が壊れるとデータ0件のまま静かにビルドが通ってしまうので、ここで止める
  if (result.items.length === 0) {
    throw new Error('年表データが1件も読み込めませんでした（src/data/*.yaml の読み込み経路を確認してください）');
  }
  if (result.errors.length > 0) {
    throw new Error(
      `年表データに ${result.errors.length} 件の問題があります:\n` +
        result.errors.map((e) => `  - ${e}`).join('\n') +
        `\n(npm run validate で同じ検査ができます)`,
    );
  }
  return result;
}
