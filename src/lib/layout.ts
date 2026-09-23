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
export const LANE_PAD_TOP = 8;
export const LANE_PAD_BOTTOM = 10;
export const MIN_BAR_W = 26;
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

export function packPeriods(periods: Period[], zoom = 1) {
  const spans = periods.map((p): [number, number] => {
    const [from, to] = itemSpan(p);
    const x1 = yearToX(from, zoom);
    return [x1, Math.max(yearToX(to, zoom), x1 + MIN_BAR_W)];
  });
  return packSpans(spans, 2);
}

export function packEvents(events: TimelineEvent[], zoom = 1) {
  const spans = events.map((e): [number, number] => {
    const x = yearToX(e.year, zoom);
    return [x - DOT_SIZE / 2, x + DOT_SIZE / 2 + 4 + estimateTextWidth(e.title)];
  });
  return packSpans(spans, 10);
}

export function laneHeight(barRows: number, eventRows: number): number {
  const bars = barRows > 0 ? barRows * BAR_H + (barRows - 1) * BAR_GAP : 0;
  const events = eventRows > 0 ? eventRows * EVENT_ROW_H : 0;
  return LANE_PAD_TOP + bars + (bars && events ? 6 : 0) + events + LANE_PAD_BOTTOM;
}
