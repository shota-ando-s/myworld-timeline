import { z } from 'zod';
import { CATEGORY_IDS, LANE_IDS, MAX_YEAR, MIN_YEAR } from './model.ts';

const yearField = z
  .int()
  .min(MIN_YEAR, `${MIN_YEAR} より前は扱いません`)
  .max(MAX_YEAR, `${MAX_YEAR} より後は扱いません`)
  .refine((y) => y !== 0, { message: '0年は存在しません（紀元前1年は -1、紀元1年は 1）' });

const slug = z
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
