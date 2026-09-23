/**
 * レーン内の段組み（重なりを避ける行割り当て）。
 * 期間バーは時間の重なりだけで決まるのでズームに依らない＝ビルド時に1回計算すれば足りる。
 * 点イベントはラベル幅が効くのでズームごとに計算し直す。
 */
import { itemSpan, type Period, type TimelineEvent } from './model.ts';
import { yearToX } from './scale.ts';

export const LABEL_COL_W = 152;
export const BAR_H = 22;
export const BAR_GAP = 3;
export const EVENT_ROW_H = 19;
/** 人物の帯は王朝の帯より一回り低くして、主従がひと目で分かるようにする */
export const LEADER_H = 16;
export const LEADER_GAP = 2;
/** 帯どうしの段のあいだに置くすき間 */
export const BAND_GAP = 6;
export const LANE_PAD_TOP = 8;
export const LANE_PAD_BOTTOM = 10;
export const MIN_BAR_W = 26;
/** 数年で代わった君主も点にならないよう、人物の帯にも最小幅を与える */
export const MIN_LEADER_W = 14;
/** 同じ段で隣り合う帯のあいだに残す最小のすき間 */
export const BAR_MIN_GAP = 2;
export const DOT_SIZE = 13;

/** 日本語は全角、英数は半角として文字幅をざっくり見積もる（font-size 11px 想定） */
export function estimateTextWidth(text: string, fontSize = 11): number {
  let units = 0;
  for (const ch of text) units += /[\x20-\x7e｡-ﾟ]/.test(ch) ? 0.55 : 1;
  return units * fontSize;
}

/** [開始x, 終了x] の配列を、重ならないように行へ割り当てる */
function packSpans(spans: [number, number][], gap: number): { rows: number[]; rowCount: number } {
  const order = spans.map((_, i) => i).sort((a, b) => spans[a]![0] - spans[b]![0]);
  const rowEnds: number[] = [];
  const rows = new Array<number>(spans.length).fill(0);
  for (const i of order) {
    const [start, end] = spans[i]!;
    let row = rowEnds.findIndex((e) => e + gap <= start);
    if (row === -1) row = rowEnds.push(-Infinity) - 1;
    rowEnds[row] = end;
    rows[i] = row;
  }
  return { rows, rowCount: Math.max(rowEnds.length, 0) };
}

/**
 * 期間バーの段組みと幅。
 *
 * 段は「年が重なっているか」だけで決める。終わりと始まりが同じ年（周→秦、秦→漢）は
 * 重なりとみなさないので、続く王朝は1本の帯としてつながって見える。
 * 段が増えるのは、本当に同時に存在していたとき（宋と遼と金、漢と新）だけ。
 *
 * 幅は px で返す。15年しか続かなかった秦のような短い王朝も見えるよう最小幅を与えるが、
 * 同じ段の次の帯に食い込まない範囲までにとどめる。
 */
export function packPeriods(periods: Period[], zoom = 1, minWidth = MIN_BAR_W) {
  const spans = periods.map((p) => itemSpan(p));
  const order = periods.map((_, i) => i).sort((a, b) => spans[a]![0] - spans[b]![0]);

  const rows = new Array<number>(periods.length).fill(0);
  const rowEndYear: number[] = [];
  const rowLastIndex: number[] = [];
  /** 同じ段で次に来る帯の開始年（無ければ +∞） */
  const nextStartYear = new Array<number>(periods.length).fill(Number.POSITIVE_INFINITY);

  for (const i of order) {
    const [from, to] = spans[i]!;
    let row = rowEndYear.findIndex((end) => end <= from);
    if (row === -1) {
      rowEndYear.push(Number.NEGATIVE_INFINITY);
      rowLastIndex.push(-1);
      row = rowEndYear.length - 1;
    }
    const prev = rowLastIndex[row]!;
    if (prev >= 0) nextStartYear[prev] = from;
    rowEndYear[row] = to;
    rowLastIndex[row] = i;
    rows[i] = row;
  }

  const widths = periods.map((_, i) => {
    const [from, to] = spans[i]!;
    const x = yearToX(from, zoom);
    const natural = yearToX(to, zoom) - x;
    const room = Math.max(0, yearToX(nextStartYear[i]!, zoom) - x - BAR_MIN_GAP);
    return Math.max(natural, Math.min(minWidth, room));
  });

  return { rows, rowCount: rowEndYear.length, widths };
}

export function packEvents(events: TimelineEvent[], zoom = 1) {
  const spans = events.map((e): [number, number] => {
    const x = yearToX(e.year, zoom);
    return [x - DOT_SIZE / 2, x + DOT_SIZE / 2 + 4 + estimateTextWidth(e.title)];
  });
  return packSpans(spans, 10);
}

/** n 段ぶんの高さ（0段なら0） */
function bandHeight(rows: number, rowH: number, gap: number): number {
  return rows > 0 ? rows * rowH + (rows - 1) * gap : 0;
}

export type LaneBands = {
  /** レーン全体の高さ */
  height: number;
  /** 人物の帯の上端（レーンの上からの距離） */
  leaderTop: number;
  /** 点イベントの帯の上端 */
  eventTop: number;
};

/**
 * レーンの中身を「王朝の帯 → 人物の帯 → 点イベント」の3段に積む。
 * 空の段は高さもすき間も取らないので、人物を隠すとレーンはその分だけ縮む。
 */
export function laneBands(barRows: number, leaderRows: number, eventRows: number): LaneBands {
  const bars = bandHeight(barRows, BAR_H, BAR_GAP);
  const leaders = bandHeight(leaderRows, LEADER_H, LEADER_GAP);
  const events = eventRows > 0 ? eventRows * EVENT_ROW_H : 0;

  const leaderTop = LANE_PAD_TOP + bars + (bars && leaders ? BAND_GAP : 0);
  const eventTop = leaderTop + leaders + ((bars || leaders) && events ? BAND_GAP : 0);
  return { height: eventTop + events + LANE_PAD_BOTTOM, leaderTop, eventTop };
}
