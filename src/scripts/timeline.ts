/**
 * 年表のクライアント側の挙動。
 * - 選択と右パネル（ハッシュで復元できる）
 * - カテゴリ / 地域のフィルタ
 * - ズーム（座標と段組みの計算し直し）
 * - 同時代スナップショット（縦のスキャンライン）
 */
import {
  BAR_GAP,
  BAR_H,
  LABEL_COL_W,
  LANE_PAD_TOP,
  laneHeight,
  packEvents,
  packPeriods,
} from '../lib/layout.ts';
import {
  CATEGORIES,
  LANES,
  categoryById,
  formatItemDate,
  formatItemDateShort,
  formatYear,
  itemSpan,
  type CategoryId,
  type Item,
  type LaneId,
  type Period,
  type TimelineEvent,
} from '../lib/model.ts';
import { ERAS, ticks, timelineWidth, xToYear, yearToX } from '../lib/scale.ts';

const ZOOM_LEVELS = [0.5, 1, 2, 4];
const STORE_KEY = 'myworld-timeline:view';

const $ = <T extends Element = HTMLElement>(sel: string) => document.querySelector(sel) as T | null;

const items: Item[] = JSON.parse(document.getElementById('tl-data')!.textContent!);
const byId = new Map(items.map((i) => [i.id, i]));
const laneItems = new Map<LaneId, Item[]>();
const lanePeriods = new Map<LaneId, Period[]>();
const laneEvents = new Map<LaneId, TimelineEvent[]>();
for (const lane of LANES) {
  const mine = items.filter((i) => i.lane === lane.id);
  laneItems.set(
    lane.id,
    [...mine].sort((a, b) => itemSpan(a)[0] - itemSpan(b)[0]),
  );
  lanePeriods.set(lane.id, mine.filter((i): i is Period => i.kind === 'period'));
  laneEvents.set(lane.id, mine.filter((i): i is TimelineEvent => i.kind === 'event'));
}

const tl = $('#tl')!;
const inner = $('#tl-inner')!;
const lanesEl = $('#lanes')!;
const axisTrack = $('#axis-track')!;
const panel = $('#panel')!;
const panelBody = $('#panel-body')!;
const scan = $('#scan')!;
const scanHandle = $('#scan-handle')!;
const centerButton = $('#center-year')!;
const centerLabel = centerButton.querySelector('b')!;

type View = { zoom: number; off: CategoryId[]; hiddenLanes: LaneId[] };
const view: View = { zoom: 1, off: [], hiddenLanes: [] };

let selectedId: string | null = null;
let scanYear: number | null = null;

/** 中央線の、スクロール領域の左端からの距離（レーン名の固定列を除いた真ん中） */
function centerOffset(): number {
  return LABEL_COL_W + (tl.clientWidth - LABEL_COL_W) / 2;
}

/** いま中央線が指している年 */
function centerYear(): number {
  return xToYear(tl.scrollLeft + centerOffset() - LABEL_COL_W, view.zoom);
}

/** その年が中央線に来るようにスクロールする */
function scrollYearToCenter(year: number, behavior: ScrollBehavior = 'smooth') {
  tl.scrollTo({ left: Math.max(0, yearToX(year, view.zoom) + LABEL_COL_W - centerOffset()), behavior });
}

let centerRaf = 0;
function updateCenterYear() {
  centerRaf = 0;
  centerLabel.textContent = formatYear(centerYear());
}

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/* ───────── 保存と復元 ───────── */

function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(view));
  } catch {
    /* プライベートウィンドウなどでは保存しない */
  }
}

function restore() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw) as Partial<View>;
    if (ZOOM_LEVELS.includes(saved.zoom as number)) view.zoom = saved.zoom!;
    if (Array.isArray(saved.off)) view.off = saved.off.filter((c) => categoryById.has(c));
    if (Array.isArray(saved.hiddenLanes)) view.hiddenLanes = saved.hiddenLanes.filter((l) => LANES.some((x) => x.id === l));
  } catch {
    /* 壊れていたら初期値のまま */
  }
}

/* ───────── ズーム（座標の計算し直し） ───────── */

function relayout() {
  const zoom = view.zoom;
  inner.style.setProperty('--w', `${timelineWidth(zoom)}px`);

  // 時代帯
  for (const [i, era] of ERAS.entries()) {
    const el = axisTrack.children[i] as HTMLElement | undefined;
    if (!el?.classList.contains('era')) continue;
    const x1 = yearToX(era.from, zoom);
    el.style.setProperty('--x1', `${x1}px`);
    el.style.setProperty('--ew', `${yearToX(era.to, zoom) - x1}px`);
  }

  // 目盛りは作り直す
  for (const old of axisTrack.querySelectorAll('.tick')) old.remove();
  const frag = document.createDocumentFragment();
  for (const t of ticks(zoom)) {
    const el = document.createElement('div');
    el.className = 'tick';
    el.dataset.year = String(t.year);
    if (t.major) el.dataset.major = '';
    el.style.setProperty('--x', `${t.x}px`);
    el.innerHTML = `<span>${t.label}</span>`;
    frag.append(el);
  }
  axisTrack.append(frag);

  // レーンごとに段組みと座標を計算し直す
  for (const lane of LANES) {
    const section = lanesEl.querySelector<HTMLElement>(`.lane[data-lane="${lane.id}"]`);
    const track = section?.querySelector<HTMLElement>('.lane__track');
    if (!track) continue;

    const periods = lanePeriods.get(lane.id)!;
    const events = laneEvents.get(lane.id)!;
    const packedBars = packPeriods(periods, zoom);
    const packedDots = packEvents(events, zoom);

    periods.forEach((p, i) => {
      const el = track.querySelector<HTMLElement>(`.bar[data-id="${p.id}"]`);
      if (!el) return;
      el.style.setProperty('--bx', `${yearToX(itemSpan(p)[0], zoom)}px`);
      el.style.setProperty('--bw', `${packedBars.widths[i]!}px`);
      el.style.setProperty('--row', String(packedBars.rows[i]!));
    });

    events.forEach((e, i) => {
      const el = track.querySelector<HTMLElement>(`.ev[data-id="${e.id}"]`);
      if (!el) return;
      el.style.setProperty('--ex', `${yearToX(e.year, zoom)}px`);
      el.style.setProperty('--row', String(packedDots.rows[i]!));
    });

    const barsHeight = packedBars.rowCount > 0 ? packedBars.rowCount * BAR_H + (packedBars.rowCount - 1) * BAR_GAP : 0;
    track.style.setProperty('--h', `${laneHeight(packedBars.rowCount, packedDots.rowCount)}px`);
    track.style.setProperty('--ev-top', `${LANE_PAD_TOP + barsHeight + (barsHeight && packedDots.rowCount ? 6 : 0)}px`);
  }

  if (scanYear !== null) moveScan(scanYear, false);
}

function setZoom(next: number) {
  const zoom = Math.min(...ZOOM_LEVELS.filter((z) => z >= next).concat(ZOOM_LEVELS[ZOOM_LEVELS.length - 1]!));
  if (zoom === view.zoom) return;
  // 中央線が指している年を保ったまま拡大縮小する
  const keep = centerYear();
  view.zoom = zoom;
  relayout();
  scrollYearToCenter(keep, 'instant');
  updateCenterYear();
  $('#zoom-value')!.textContent = `×${zoom}`;
  save();
}

/* ───────── フィルタ ───────── */

function applyFilters() {
  const off = new Set(view.off);
  for (const el of lanesEl.querySelectorAll<HTMLElement>('.bar, .ev')) {
    if (off.has(el.dataset.cat as CategoryId)) el.dataset.off = '';
    else delete el.dataset.off;
  }
  for (const cat of CATEGORIES) {
    const chip = document.querySelector<HTMLElement>(`.chip[data-cat="${cat.id}"]`);
    chip?.setAttribute('aria-pressed', String(!off.has(cat.id)));
  }

  for (const row of mlist.querySelectorAll<HTMLElement>('.mrow')) {
    row.hidden = off.has(row.dataset.cat as CategoryId) || view.hiddenLanes.includes(row.dataset.lane as LaneId);
  }

  const hidden = new Set(view.hiddenLanes);
  for (const lane of LANES) {
    const section = lanesEl.querySelector<HTMLElement>(`.lane[data-lane="${lane.id}"]`);
    if (section) section.hidden = hidden.has(lane.id);
    const box = document.querySelector<HTMLInputElement>(`.lanepick__menu input[value="${lane.id}"]`);
    if (box) box.checked = !hidden.has(lane.id);
  }
  $('#lanepick-count')!.textContent = hidden.size ? `${LANES.length - hidden.size}/${LANES.length}` : '';
  save();
}

/* ───────── 右パネル ───────── */

function itemDot(item: Item) {
  const cat = categoryById.get(item.category)!;
  return `<span class="ev__dot" data-shape="${cat.shape}" data-fam="${cat.family}" style="--fam:var(--fam-${cat.family})"></span>`;
}

function renderItem(item: Item) {
  const cat = categoryById.get(item.category)!;
  const lane = LANES.find((l) => l.id === item.lane)!;
  const neighbours = laneItems.get(item.lane)!;
  const at = neighbours.findIndex((n) => n.id === item.id);
  const prev = neighbours[at - 1];
  const next = neighbours[at + 1];

  panel.removeAttribute('data-empty');
  panelBody.innerHTML = `
    <button type="button" class="panel__close" id="panel-close" aria-label="閉じる">×</button>
    <div class="panel__kicker" data-fam="${cat.family}">${itemDot(item)} ${esc(lane.label)} ・ ${esc(cat.label)}</div>
    <h2 class="panel__title">${esc(item.title)}</h2>
    <div class="panel__date">${esc(formatItemDate(item))}</div>
    <p class="panel__summary">${esc(item.summary)}</p>
    ${item.detail ? `<p class="panel__detail">${esc(item.detail.trim())}</p>` : ''}
    ${
      item.tags.length
        ? `<h3>タグ</h3><div class="panel__tags">${item.tags.map((t) => `<span>${esc(t)}</span>`).join('')}</div>`
        : ''
    }
    ${
      item.links.length
        ? `<h3>もっと読む</h3><ul class="panel__links">${item.links
            .map((l) => `<li><a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)}</a></li>`)
            .join('')}</ul>`
        : ''
    }
    ${
      item.related.length
        ? `<h3>関連</h3><div class="snapshot">${item.related
            .map((id) => byId.get(id))
            .filter((r): r is Item => Boolean(r))
            .map((r) => `<div class="snapshot__row"><button type="button" class="link" data-goto="${r.id}">${esc(r.title)}</button></div>`)
            .join('')}</div>`
        : ''
    }
    <h3>${esc(lane.label)}のこの前後</h3>
    <div class="snapshot">
      ${[prev, next]
        .filter((n): n is Item => Boolean(n))
        .map(
          (n) =>
            `<div class="snapshot__row"><span class="snapshot__year">${esc(formatItemDate(n))}</span>
             <button type="button" class="link" data-goto="${n.id}">${esc(n.title)}</button></div>`,
        )
        .join('')}
    </div>`;
}

function snapshotWindow(year: number) {
  return year < 0 ? 100 : year < 1500 ? 50 : 25;
}

function renderSnapshot(year: number) {
  const span = snapshotWindow(year);
  const hidden = new Set(view.hiddenLanes);
  const off = new Set(view.off);

  const blocks = LANES.filter((l) => !hidden.has(l.id)).map((lane) => {
    const active = lanePeriods
      .get(lane.id)!
      .filter((p) => !off.has(p.category) && itemSpan(p)[0] <= year && year <= itemSpan(p)[1]);
    const near = laneEvents
      .get(lane.id)!
      .filter((e) => !off.has(e.category) && Math.abs(e.year - year) <= span)
      .sort((a, b) => Math.abs(a.year - year) - Math.abs(b.year - year))
      .slice(0, 4)
      .sort((a, b) => a.year - b.year);

    const rows = [
      ...active.map(
        (p) =>
          `<div class="snapshot__row" data-fam="${categoryById.get(p.category)!.family}">
             <span class="snapshot__dot"></span>
             <button type="button" class="link" data-goto="${p.id}">${esc(p.title)}</button>
             <span class="snapshot__year">${esc(formatItemDate(p))}</span>
           </div>`,
      ),
      ...near.map(
        (e) =>
          `<div class="snapshot__row">
             <span class="snapshot__year">${esc(formatYear(e.year))}</span>
             <button type="button" class="link" data-goto="${e.id}">${esc(e.title)}</button>
           </div>`,
      ),
    ];

    return `<div class="snapshot__lane"${rows.length ? '' : ' data-quiet'}>
        <b>${esc(lane.label)}</b>
        ${rows.length ? rows.join('') : '<div class="snapshot__row"><span class="snapshot__year">—</span></div>'}
      </div>`;
  });

  panel.removeAttribute('data-empty');
  panelBody.innerHTML = `
    <button type="button" class="panel__close" id="panel-close" aria-label="閉じる">×</button>
    <div class="panel__kicker">同時代スナップショット</div>
    <h2 class="panel__title">${esc(formatYear(year))}の世界</h2>
    <div class="panel__date">進行中の王朝・時代と、前後${span}年以内の出来事</div>
    <div class="snapshot">${blocks.join('')}</div>`;
}

function closePanel() {
  panel.setAttribute('data-empty', '');
  panelBody.innerHTML = '';
  if (selectedId) {
    lanesEl.querySelector(`[data-id="${selectedId}"]`)?.removeAttribute('data-selected');
    selectedId = null;
  }
  scanYear = null;
  scan.hidden = true;
  scanHandle.hidden = true;
  history.replaceState(null, '', location.pathname + location.search);
}

/* ───────── 選択 ───────── */

function select(id: string, opts: { scroll?: boolean; push?: boolean } = {}) {
  const item = byId.get(id);
  if (!item) return;
  if (selectedId) lanesEl.querySelector(`[data-id="${selectedId}"]`)?.removeAttribute('data-selected');
  selectedId = id;
  const el = lanesEl.querySelector<HTMLElement>(`[data-id="${id}"]`);
  el?.setAttribute('data-selected', '');
  if (el && opts.scroll !== false) {
    scrollYearToCenter(itemSpan(item)[0]);
    const top = el.getBoundingClientRect().top - tl.getBoundingClientRect().top + tl.scrollTop;
    if (top < tl.scrollTop + 60 || top > tl.scrollTop + tl.clientHeight - 60) {
      tl.scrollTo({ top: Math.max(0, top - tl.clientHeight / 2), behavior: 'smooth' });
    }
  }
  renderItem(item);
  if (opts.push !== false) history.replaceState(null, '', `#e/${id}`);
}

function moveScan(year: number, render = true) {
  scanYear = year;
  scan.hidden = false;
  scanHandle.hidden = false;
  inner.style.setProperty('--scan-x', `${yearToX(year, view.zoom)}px`);
  scanHandle.textContent = formatYear(year);
  if (render) {
    renderSnapshot(year);
    history.replaceState(null, '', `#y/${year}`);
  }
}

/* ───────── イベント登録 ───────── */

lanesEl.addEventListener('click', (e) => {
  const target = (e.target as HTMLElement).closest<HTMLElement>('.bar, .ev');
  if (target?.dataset.id) select(target.dataset.id, { scroll: false });
});

panel.addEventListener('click', (e) => {
  const t = e.target as HTMLElement;
  if (t.id === 'panel-close') closePanel();
  const goto = t.closest<HTMLElement>('[data-goto]');
  if (goto) select(goto.dataset.goto!);
});

document.getElementById('filters')!.addEventListener('click', (e) => {
  const chip = (e.target as HTMLElement).closest<HTMLElement>('.chip');
  if (!chip) return;
  const cat = chip.dataset.cat as CategoryId;
  view.off = view.off.includes(cat) ? view.off.filter((c) => c !== cat) : [...view.off, cat];
  applyFilters();
  if (scanYear !== null) renderSnapshot(scanYear);
});

$('#lanepick')!.addEventListener('change', (e) => {
  const box = e.target as HTMLInputElement;
  const lane = box.value as LaneId;
  view.hiddenLanes = box.checked ? view.hiddenLanes.filter((l) => l !== lane) : [...view.hiddenLanes, lane];
  applyFilters();
  if (scanYear !== null) renderSnapshot(scanYear);
});

$('#zoom-in')!.addEventListener('click', () => setZoom(ZOOM_LEVELS[Math.min(ZOOM_LEVELS.indexOf(view.zoom) + 1, ZOOM_LEVELS.length - 1)]!));
$('#zoom-out')!.addEventListener('click', () => setZoom(ZOOM_LEVELS[Math.max(ZOOM_LEVELS.indexOf(view.zoom) - 1, 0)]!));

const yearInput = $<HTMLInputElement>('#year-input')!;
function goToYear() {
  const year = Number(yearInput.value);
  if (!Number.isFinite(year) || yearInput.value === '') return;
  moveScan(year);
  scrollYearToCenter(year);
}
$('#year-go')!.addEventListener('click', goToYear);
yearInput.addEventListener('keydown', (e) => {
  if ((e as KeyboardEvent).key === 'Enter') goToYear();
});

// 目盛りをクリックしてもその年のスナップショットを出す
axisTrack.addEventListener('click', (e) => {
  const rect = axisTrack.getBoundingClientRect();
  moveScan(xToYear((e as MouseEvent).clientX - rect.left, view.zoom));
});

// スキャンラインのドラッグ
scanHandle.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  scanHandle.setPointerCapture((e as PointerEvent).pointerId);
  const rect = axisTrack.getBoundingClientRect();
  const onMove = (ev: PointerEvent) => moveScan(xToYear(ev.clientX - rect.left, view.zoom));
  const onUp = () => {
    scanHandle.removeEventListener('pointermove', onMove);
    scanHandle.removeEventListener('pointerup', onUp);
  };
  scanHandle.addEventListener('pointermove', onMove);
  scanHandle.addEventListener('pointerup', onUp);
});

tl.addEventListener(
  'scroll',
  () => {
    if (!centerRaf) centerRaf = requestAnimationFrame(updateCenterYear);
  },
  { passive: true },
);
new ResizeObserver(updateCenterYear).observe(tl);
centerButton.addEventListener('click', () => moveScan(centerYear()));

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') return closePanel();
  if (e.target instanceof HTMLInputElement) return;
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
  if (!selectedId) return;
  const item = byId.get(selectedId)!;
  const list = laneItems.get(item.lane)!;
  const at = list.findIndex((n) => n.id === selectedId);
  const next = list[at + (e.key === 'ArrowRight' ? 1 : -1)];
  if (next) {
    e.preventDefault();
    select(next.id);
  }
});

function applyHash() {
  const hash = decodeURIComponent(location.hash.slice(1));
  if (hash.startsWith('e/')) select(hash.slice(2));
  else if (hash.startsWith('y/')) {
    const year = Number(hash.slice(2));
    if (Number.isFinite(year)) {
      moveScan(year);
      scrollYearToCenter(year, 'instant');
    }
  }
}
window.addEventListener('hashchange', applyHash);

/* ───────── スマホ: 年代順の縦リスト ───────── */

const mlist = $('#mlist')!;
let mobileBuilt = false;

function buildMobileList() {
  if (mobileBuilt) return;
  mobileBuilt = true;
  const sorted = [...items].sort((a, b) => itemSpan(a)[0] - itemSpan(b)[0]);
  const parts: string[] = [];
  let eraAt = -1;
  for (const item of sorted) {
    const year = itemSpan(item)[0];
    const next = ERAS.findIndex((e) => year >= e.from && year < e.to);
    if (next !== eraAt && next >= 0) {
      eraAt = next;
      parts.push(`<div class="mlist__era">${esc(ERAS[next]!.label)}</div>`);
    }
    const cat = categoryById.get(item.category)!;
    const lane = LANES.find((l) => l.id === item.lane)!;
    parts.push(`<button type="button" class="mrow" data-id="${item.id}" data-cat="${item.category}" data-lane="${item.lane}" data-fam="${cat.family}">
        <span class="mrow__year">${esc(formatItemDateShort(item))}</span>
        <span class="mrow__main">
          <span class="ev__dot" data-shape="${cat.shape}"></span>
          <span><span class="mrow__title">${esc(item.title)}</span><span class="mrow__lane">${esc(lane.label)} ・ ${esc(cat.label)}</span></span>
        </span>
      </button>`);
  }
  mlist.innerHTML = parts.join('');
  mlist.addEventListener('click', (e) => {
    const row = (e.target as HTMLElement).closest<HTMLElement>('.mrow');
    if (row?.dataset.id) select(row.dataset.id, { scroll: false });
  });
  applyFilters();
}

const narrow = window.matchMedia('(max-width: 720px)');
function onBreakpoint() {
  if (narrow.matches) buildMobileList();
}
narrow.addEventListener('change', onBreakpoint);

/* ───────── 起動 ───────── */

restore();
$('#zoom-value')!.textContent = `×${view.zoom}`;
if (view.zoom !== 1) relayout();
onBreakpoint();
applyFilters();
applyHash();
