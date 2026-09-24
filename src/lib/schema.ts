import { z } from 'zod';
import { CATEGORY_IDS, LANE_IDS, MAX_YEAR, MIN_YEAR } from './model.ts';

const yearField = z
  .int()
  .min(MIN_YEAR, `${MIN_YEAR} より前は扱いません`)
  .max(MAX_YEAR, `${MAX_YEAR} より後は扱いません`)
  .refine((y) => y !== 0, { message: '0年は存在しません（紀元前1年は -1、紀元1年は 1）' });

export const slug = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]*$/, 'id は半角英小文字・数字・ハイフンのみ（例: qin-unification）');

const linkSchema = z.strictObject({
  label: z.string().min(1),
  url: z.url('http(s) から始まる URL を書いてください'),
});

const imageSchema = z.strictObject({
  url: z.url('http(s) から始まる URL を書いてください'),
  credit: z.string().min(1, '作者とライセンスを「作者 / ライセンス」の形で書いてください'),
  page: z.url('ファイルページの URL（出所の証拠）が要ります'),
});

/** 期間バーと点イベントで共通のフィールド */
const baseFields = {
  id: slug,
  title: z.string().min(1),
  lane: z.enum(LANE_IDS).optional(),
  category: z.enum(CATEGORY_IDS),
  tags: z.array(z.string().min(1)).default([]),
  summary: z.string().min(1, 'summary は必須（パネル冒頭の一行要約）'),
  detail: z.string().optional(),
  image: imageSchema.optional(),
  links: z.array(linkSchema).default([]),
  related: z.array(slug).default([]),
};

/** 期間バー：王朝・帝国・時代区分など幅を持つもの */
export const PeriodSchema = z
  .strictObject({
    ...baseFields,
    start: yearField,
    end: yearField.optional(),
    startCirca: z.boolean().default(false),
    endCirca: z.boolean().default(false),
    ongoing: z.boolean().default(false),
  })
  .superRefine((p, ctx) => {
    if (p.end === undefined && !p.ongoing) {
      ctx.addIssue({ code: 'custom', message: 'end が無い場合は ongoing: true が必要です', path: ['end'] });
    }
    if (p.end !== undefined && p.end < p.start) {
      ctx.addIssue({ code: 'custom', message: `end(${p.end}) が start(${p.start}) より前です`, path: ['end'] });
    }
  });

/** 点イベント：単年の出来事 */
export const EventSchema = z.strictObject({
  ...baseFields,
  year: yearField,
  /** 「1789年7月14日」のように細かく出したいときだけ書く。省略時は year から自動生成 */
  displayDate: z.string().min(1).optional(),
  circa: z.boolean().default(false),
});

/**
 * データファイル1枚の外枠だけを見るスキーマ。
 * 中身は1項目ずつ検証する（1つ壊れていても残りを読み、エラーをまとめて出すため）。
 */
export const DataFileSchema = z.strictObject({
  lane: z.enum(LANE_IDS).optional(),
  periods: z.array(z.unknown()).default([]),
  /** 人物の治世。形は periods と同じで、置かれる帯だけが違う */
  leaders: z.array(z.unknown()).default([]),
  events: z.array(z.unknown()).default([]),
});

/**
 * ポッドキャストの対応表（src/podcasts/*.yaml）。
 * 中身は1件ずつ検証する（1本壊れていても残りを読み、エラーをまとめて出すため）。
 */
export const PodcastFileSchema = z.strictObject({
  podcast: z.strictObject({
    title: z.string().min(1),
    url: z.url('番組の公式ページの URL を書いてください'),
    feed: z.url('RSS の URL を書いてください'),
    note: z.string().optional(),
  }),
  series: z.array(z.unknown()).default([]),
});

/**
 * シリーズ1本。事実の列（season/title/episodes/配信月/url）は RSS 由来で、
 * 人が決めるのは items / kind / note / laneHint の4つだけ。
 */
/**
 * 配信月。'YYYY-MM' に限る。
 * js-yaml は引用符なしの 2026-07-28 を Date に変えてしまい、そのままだと
 * 「expected string, received Date」という理由の分からないエラーになるので、
 * 文字列に戻してから形を見る。
 */
const airedMonth = z.preprocess(
  (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v),
  z
    .string()
    .regex(/^\d{4}-\d{2}$/, "配信月は 'YYYY-MM' の形で書いてください（日まで書くと日付として読まれるので、引用符で囲む）"),
);

export const PodcastSeriesSchema = z
  .strictObject({
    /** 番組自身が「【67-4】」で使っている連番。これが主キー */
    season: z.int().min(1).max(999),
    title: z.string().min(1),
    episodes: z.int().min(1).max(99),
    firstAired: airedMonth,
    lastAired: airedMonth.optional(),
    url: z.url('第1回の URL を書いてください'),
    /** Pody（記事化サービス）に同じ回があるときの URL。あればパネルはこちらを開く */
    podyUrl: z.url('Pody の記事 URL を書いてください').optional(),
    /** topic = 年表項目に紐づく / theme = テーマ史で紐づかない / uncovered = 年表に該当項目が無い */
    kind: z.enum(['topic', 'theme', 'uncovered']).default('topic'),
    items: z.array(slug).default([]),
    /** uncovered のとき、項目を足すならどのレーンか */
    laneHint: z.enum(LANE_IDS).optional(),
    note: z.string().optional(),
  })
  .superRefine((s, ctx) => {
    // 「まだ見ていない」と「見て紐づけないと決めた」を取り違えないよう、必ず言語化させる
    if (s.kind === 'topic' && s.items.length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['items'],
        message: 'items が空です（紐づけないと決めたなら kind: theme か uncovered にして note に理由を書いてください）',
      });
    }
    if (s.kind !== 'topic' && s.items.length > 0) {
      ctx.addIssue({ code: 'custom', path: ['kind'], message: `kind: ${s.kind} なのに items があります` });
    }
    if (s.kind !== 'topic' && !s.note) {
      ctx.addIssue({ code: 'custom', path: ['note'], message: '紐づけない理由を note に書いてください' });
    }
  });
