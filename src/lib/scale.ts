/**
 * 年 ↔ x座標 の変換。
 * 5000年を等間隔に引くと近現代が潰れるので、区間ごとに縮尺を変える（区分線形）。
 * 目盛りの間隔が区間で変わること自体が「ここは圧縮されている」という合図になる。
 */
import { MAX_YEAR, MIN_YEAR } from './model.ts';

export type Segment = { from: number; to: number; pxPerYear: number };

export const SEGMENTS: Segment[] = [
  { from: MIN_YEAR, to: -1000, pxPerYear: 0.5 },
  { from: -1000, to: 1000, pxPerYear: 1.2 },
  { from: 1000, to: 1500, pxPerYear: 2 },
  { from: 1500, to: 1800, pxPerYear: 3.5 },
  { from: 1800, to: 1900, pxPerYear: 6 },
  { from: 1900, to: MAX_YEAR, pxPerYear: 9 },
];

/** 各区間の左端の x（zoom=1） */
const OFFSETS: number[] = (() => {
  const out: number[] = [];
  let acc = 0;
  for (const s of SEGMENTS) {
    out.push(acc);
    acc += (s.to - s.from) * s.pxPerYear;
  }
  return out;
})();

const BASE_WIDTH = OFFSETS[OFFSETS.length - 1]! + (SEGMENTS.at(-1)!.to - SEGMENTS.at(-1)!.from) * SEGMENTS.at(-1)!.pxPerYear;

export function timelineWidth(zoom = 1): number {
  return BASE_WIDTH * zoom;
}

export function clampYear(year: number): number {
  return Math.min(MAX_YEAR, Math.max(MIN_YEAR, year));
}

export function yearToX(year: number, zoom = 1): number {
  const y = clampYear(year);
  for (let i = 0; i < SEGMENTS.length; i++) {
    const s = SEGMENTS[i]!;
    if (y <= s.to || i === SEGMENTS.length - 1) {
      return (OFFSETS[i]! + (y - s.from) * s.pxPerYear) * zoom;
    }
  }
  return 0;
}

export function xToYear(x: number, zoom = 1): number {
  const px = x / zoom;
  for (let i = SEGMENTS.length - 1; i >= 0; i--) {
    if (px >= OFFSETS[i]! || i === 0) {
      const s = SEGMENTS[i]!;
      return clampYear(Math.round(s.from + (px - OFFSETS[i]!) / s.pxPerYear));
    }
  }
  return MIN_YEAR;
}

/** 時代の帯（年表上部のバンド） */
export const ERAS = [
  { id: 'prehistory', label: '古代オリエント', from: MIN_YEAR, to: -500 },
  { id: 'classical', label: '古典古代', from: -500, to: 476 },
  { id: 'medieval', label: '中世', from: 476, to: 1453 },
  { id: 'early-modern', label: '近世', from: 1453, to: 1789 },
  { id: 'modern', label: '近代', from: 1789, to: 1945 },
  { id: 'contemporary', label: '現代', from: 1945, to: MAX_YEAR },
] as const;

export type Tick = { year: number; x: number; label: string; major: boolean };

const STEPS = [2000, 1000, 500, 250, 100, 50, 25, 10];

/** ズームに応じて、区間ごとにちょうどよい間隔の目盛りを作る */
export function ticks(zoom = 1, minGapPx = 84): Tick[] {
  const out: Tick[] = [];
  const seen = new Set<number>();
  for (const s of SEGMENTS) {
    // 間隔が minGapPx 以上になる刻みのうち最も細かいものを選ぶ
    const step = STEPS.findLast((v) => v * s.pxPerYear * zoom >= minGapPx) ?? STEPS[0]!;
    const first = Math.ceil(s.from / step) * step;
    for (let y = first; y <= s.to; y += step) {
      if (seen.has(y)) continue;
      seen.add(y);
      out.push({
        year: y,
        x: yearToX(y, zoom),
        label: y === 0 ? '紀元' : y < 0 ? `前${-y}` : `${y}`,
        major: y === 0 || Math.abs(y) % 1000 === 0,
      });
    }
  }
  return out.sort((a, b) => a.year - b.year);
}
