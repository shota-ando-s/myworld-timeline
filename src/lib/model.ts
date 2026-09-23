/**
 * レーン・カテゴリの定義と、年の整形ヘルパー。
 * ここはブラウザにも送られるので zod や node の API を持ち込まないこと。
 */

export const LANES = [
  { id: 'west-europe', label: '西ヨーロッパ', note: 'フランク・神聖ローマ・英仏独', group: 'europe' },
  { id: 'mediterranean', label: '地中海・南欧', note: 'ギリシア・ローマ・ビザンツ・イタリア', group: 'europe' },
  { id: 'east-europe', label: '東欧・ロシア', note: 'ルーシ・ポーランド・ロシア', group: 'europe' },
  { id: 'west-asia', label: '西アジア・イスラム', note: 'オリエント・ペルシア・アラブ・オスマン', group: 'westasia' },
  { id: 'central-eurasia', label: '中央ユーラシア', note: '草原の遊牧国家・シルクロード', group: 'westasia' },
  { id: 'south-asia', label: '南アジア', note: 'インド・パキスタン', group: 'southasia' },
  { id: 'southeast-asia', label: '東南アジア', note: 'ベトナム・カンボジア・ジャワ', group: 'southasia' },
  { id: 'china', label: '中国', note: '中原王朝と征服王朝', group: 'eastasia' },
  { id: 'korea', label: '朝鮮半島', note: '三国・高麗・朝鮮', group: 'eastasia' },
  { id: 'japan', label: '日本', note: '', group: 'eastasia' },
  { id: 'africa', label: 'アフリカ', note: 'エジプト・サハラ以南', group: 'other' },
  { id: 'americas', label: 'アメリカ大陸', note: 'メソアメリカ・アンデス・南北アメリカ', group: 'other' },
] as const;

export type LaneId = (typeof LANES)[number]['id'];
export type LaneGroup = (typeof LANES)[number]['group'];
export const LANE_IDS = LANES.map((l) => l.id) as [LaneId, ...LaneId[]];

/**
 * カテゴリは4つの系統に束ねてある。
 * 色は系統ごと（全ペアでCVD検証済みの4色）、系統内の区別はアイコンが担う。
 * 8色すべてを別の色にすると、色覚特性によらず見分けられない組み合わせが出るため。
 *
 * shape は Font Awesome Free（Solid）のアイコン名。
 * 変更したら scripts/build-icons.mjs の ICONS も直して `npm run icons` を実行する。
 */
export const FAMILIES = [
  { id: 'state', label: '国家・統治', color: '#2a78d6' },
  { id: 'conflict', label: '争い・災い', color: '#eb6834' },
  { id: 'material', label: '技術・経済', color: '#1baf7a' },
  { id: 'mind', label: '精神・文化', color: '#4a3aa7' },
] as const;

export type FamilyId = (typeof FAMILIES)[number]['id'];

export const CATEGORIES = [
  { id: 'politics', label: '政治・王朝', family: 'state', shape: 'crown' },
  { id: 'society', label: '社会・制度', family: 'state', shape: 'scale-balanced' },
  { id: 'war', label: '戦争・征服', family: 'conflict', shape: 'shield-halved' },
  { id: 'disaster', label: '災害・疫病', family: 'conflict', shape: 'triangle-exclamation' },
  { id: 'science', label: '科学・技術', family: 'material', shape: 'lightbulb' },
  { id: 'economy', label: '経済・交易', family: 'material', shape: 'coins' },
  { id: 'religion', label: '宗教・思想', family: 'mind', shape: 'place-of-worship' },
  { id: 'culture', label: '文化・芸術', family: 'mind', shape: 'palette' },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]['id'];
export const CATEGORY_IDS = CATEGORIES.map((c) => c.id) as [CategoryId, ...CategoryId[]];

/** 年表が扱う年の範囲（負 = 紀元前。0年は使わない） */
export const MIN_YEAR = -3500;
export const MAX_YEAR = new Date().getFullYear() + 1;

export type Link = { label: string; url: string };

type Common = {
  id: string;
  title: string;
  lane: LaneId;
  category: CategoryId;
  tags: string[];
  summary: string;
  detail?: string;
  links: Link[];
  related: string[];
};

export type Period = Common & {
  kind: 'period';
  start: number;
  end?: number;
  startCirca: boolean;
  endCirca: boolean;
  ongoing: boolean;
};

export type TimelineEvent = Common & {
  kind: 'event';
  year: number;
  displayDate?: string;
  circa: boolean;
};

export type Item = Period | TimelineEvent;

export const laneById = new Map(LANES.map((l) => [l.id, l]));
export const categoryById = new Map(CATEGORIES.map((c) => [c.id, c]));
export const familyById = new Map(FAMILIES.map((f) => [f.id, f]));

/** 期間バーの終了年（ongoing は「今」まで伸ばす） */
export function periodEnd(p: Period): number {
  return p.ongoing || p.end === undefined ? MAX_YEAR : p.end;
}

/** その項目が年表上で占める年の範囲 */
export function itemSpan(item: Item): [number, number] {
  return item.kind === 'event' ? [item.year, item.year] : [item.start, periodEnd(item)];
}

/** -221 -> 「紀元前221年」/ 1492 -> 「1492年」 */
export function formatYear(year: number): string {
  return year < 0 ? `紀元前${-year}年` : `${year}年`;
}

/** -221 -> 「前221」/ 1492 -> 「1492」（幅の狭い場所用） */
export function formatYearShort(year: number): string {
  return year < 0 ? `前${-year}` : `${year}`;
}

/** スマホの縦リスト用の短い年表示 */
export function formatItemDateShort(item: Item): string {
  if (item.kind === 'event') return formatYearShort(item.year) + (item.circa ? '頃' : '');
  const from = formatYearShort(item.start) + (item.startCirca ? '頃' : '');
  const to = item.ongoing || item.end === undefined ? '現在' : formatYearShort(item.end) + (item.endCirca ? '頃' : '');
  return `${from}–${to}`;
}

/** パネルや一覧で使う年の表示 */
export function formatItemDate(item: Item): string {
  if (item.kind === 'event') {
    const base = item.displayDate ?? formatYear(item.year);
    return item.circa ? `${base}頃` : base;
  }
  const from = `${formatYear(item.start)}${item.startCirca ? '頃' : ''}`;
  const to = item.ongoing || item.end === undefined ? '現在' : `${formatYear(item.end)}${item.endCirca ? '頃' : ''}`;
  return `${from} 〜 ${to}`;
}
