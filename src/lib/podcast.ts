/**
 * ポッドキャストと年表項目の対応表（src/podcasts/*.yaml）の検証。
 * 年表データ（src/data）とは別経路で読み、items の id が実在するかだけを突き合わせる。
 * 結合は podcast → data の片方向に保つので、load.ts には手を入れない。
 */
import yaml from 'js-yaml';
import { PodcastFileSchema, PodcastSeriesSchema } from './schema.ts';
import type { LaneId, PodcastIndex } from './model.ts';
import type { RawFile } from './load.ts';

export type PodcastSeries = {
  season: number;
  title: string;
  episodes: number;
  firstAired: string;
  lastAired?: string;
  url: string;
  podyUrl?: string;
  kind: 'topic' | 'theme' | 'uncovered';
  items: string[];
  laneHint?: LaneId;
  note?: string;
};

export type PodcastResult = {
  show: string;
  showUrl: string;
  series: PodcastSeries[];
  files: string[];
  errors: string[];
};

function formatPath(p: readonly PropertyKey[]): string {
  return p
    .map((seg, i) => (typeof seg === 'number' ? `[${seg}]` : i === 0 ? String(seg) : `.${String(seg)}`))
    .join('');
}

/**
 * 対応表を読んで検証する。
 * knownIds を渡すと items の参照先が実在するかも見る。
 * 年表データ自体にエラーがあるときは id が欠けて誤報になるので、呼び側が undefined を渡して抑える。
 */
export function parsePodcasts(rawFiles: RawFile[], knownIds?: ReadonlySet<string>): PodcastResult {
  const errors: string[] = [];
  const series: PodcastSeries[] = [];
  const files = [...rawFiles].sort((a, b) => a.path.localeCompare(b.path));
  let show = '';
  let showUrl = '';

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

    const parsed = PodcastFileSchema.safeParse(raw);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) errors.push(`${rel} ${formatPath(issue.path)}: ${issue.message}`);
      continue;
    }
    show ||= parsed.data.podcast.title;
    showUrl ||= parsed.data.podcast.url;

    // 1本ずつ検証する。1本壊れていても他は読み込み、エラーは全部出す
    parsed.data.series.forEach((entry, i) => {
      const result = PodcastSeriesSchema.safeParse(entry);
      const season = (entry as Record<string, unknown> | null)?.season;
      const where = `${rel} series[${i}]${typeof season === 'number' ? `（season ${season}）` : ''}`;
      if (!result.success) {
        for (const issue of result.error.issues) {
          errors.push(`${where}${issue.path.length ? '.' + formatPath(issue.path) : ''}: ${issue.message}`);
        }
        return;
      }
      series.push(result.data as PodcastSeries);
    });
  }

  // 横断チェック: season の重複
  const seenSeason = new Map<number, string>();
  for (const s of series) {
    const prev = seenSeason.get(s.season);
    if (prev) errors.push(`season の重複: ${s.season} が「${prev}」と「${s.title}」の両方にあります`);
    else seenSeason.set(s.season, s.title);
  }

  // 横断チェック: items の参照先（load.ts の related 切れチェックと同じ文面にそろえる）
  for (const s of series) {
    const seenItem = new Set<string>();
    for (const ref of s.items) {
      if (seenItem.has(ref)) errors.push(`「${s.title}」の items: "${ref}" が重複しています`);
      seenItem.add(ref);
      if (knownIds && !knownIds.has(ref)) {
        errors.push(`「${s.title}」の items: "${ref}" という id は存在しません`);
      }
    }
  }

  series.sort((a, b) => a.season - b.season);
  return { show, showUrl, series, files: files.map((f) => f.path), errors };
}

/** ビルド時用: 対応表が壊れていたら止める */
export function podcastOrThrow(result: PodcastResult): PodcastResult {
  // 読み込み経路が壊れると0件のまま静かにビルドが通ってしまうので、ここで止める
  if (result.series.length === 0) {
    throw new Error('ポッドキャストの対応表が1件も読み込めませんでした（src/podcasts/*.yaml の読み込み経路を確認してください）');
  }
  if (result.errors.length > 0) {
    throw new Error(
      `ポッドキャストの対応表に ${result.errors.length} 件の問題があります:\n` +
        result.errors.map((e) => `  - ${e}`).join('\n') +
        `\n(npm run validate で同じ検査ができます)`,
    );
  }
  return result;
}

/**
 * ブラウザに送る索引。
 * 年表項目に紐づいた（kind: topic）シリーズだけを入れる。
 * テーマ史・未カバーはビルド時の作業記録で、来訪者向けの情報ではない。
 */
export function toPodcastIndex(result: PodcastResult): PodcastIndex {
  const index: PodcastIndex = { show: result.show, series: {}, byItem: {} };
  for (const s of result.series) {
    if (s.kind !== 'topic') continue;
    // Pody に同じ回があればそちらを開く（番組公式のリンクは対応表に残してある）
    index.series[String(s.season)] = {
      title: s.title,
      episodes: s.episodes,
      firstAired: s.firstAired,
      url: s.podyUrl ?? s.url,
      ...(s.podyUrl ? { via: 'Pody' } : {}),
    };
    for (const id of s.items) {
      (index.byItem[id] ??= []).push(s.season);
    }
  }
  return index;
}

/** npm run validate で出す内訳 */
export function podcastSummary(result: PodcastResult) {
  const by = (k: PodcastSeries['kind']) => result.series.filter((s) => s.kind === k);
  const topic = by('topic');
  return {
    seriesCount: result.series.length,
    episodeCount: result.series.reduce((n, s) => n + s.episodes, 0),
    topic: topic.length,
    linkedItems: new Set(topic.flatMap((s) => s.items)).size,
    theme: by('theme').length,
    uncovered: by('uncovered'),
  };
}
