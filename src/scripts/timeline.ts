/**
 * 年表のクライアント側の挙動。
 * - 選択と右パネル（ハッシュで復元できる）
 * - カテゴリ / 人物 / 地域のフィルタ
 * - ズーム（座標と段組みの計算し直し）
 * - 同時代スナップショット（縦のスキャンライン）
 */
import { LABEL_COL_W, LEADER_STYLE, laneBands, packEvents, packPeriods } from '../lib/layout.ts';
import {
  CATEGORIES,
  LANES,
  LEADER_LAYER,
  categoryById,
  formatItemDate,
  formatItemDateShort,
  formatYear,
  isLeader,
  itemSpan,
  type CategoryId,
  type Item,
  type LaneId,
  type Period,
  type TimelineEvent,
} from '../lib/model.ts';
import { ERAS, ticks, timelineWidth, xToYear, yearToX } from '../lib/scale.ts';

/** ＋−ボタンと ＋− キーが飛ぶ段。ピンチではこの間の値も取る */
const ZOOM_LEVELS = [0.5, 1, 2, 4];
const MIN_ZOOM = ZOOM_LEVELS[0]!;
const MAX_ZOOM = ZOOM_LEVELS[ZOOM_LEVELS.length - 1]!;

/**
 * ズームの効き。入力ごとに届く値の粒が違うので、3つに分けて持つ。
 * 数字を大きくするほど、少ない操作で拡大縮小が進む。
 */
/** トラックパッドのピンチ（ホイール1pxあたりの指数）。ひと掻きで2〜5倍動く */
const PINCH_GAIN = 0.012;
/** マウスのホイール1ノッチぶんの倍率。1ノッチは値が大きいので決め打ちにする */
const WHEEL_STEP = 1.5;
/** ホイール1回の値がこれ以上なら、トラックパッドではなくマウスとみなす */
const WHEEL_NOTCH = 40;
/** タッチのピンチ。指の広がりの何乗か（1 なら指のとおり） */
const PINCH_POWER = 1.4;
const STORE_KEY = 'myworld-timeline:view';

const $ = <T extends Element = HTMLElement>(sel: string) => document.querySelector(sel) as T | null;

const items: Item[] = JSON.parse(document.getElementById('tl-data')!.textContent!);
const byId = new Map(items.map((i) => [i.id, i]));
const laneItems = new Map<LaneId, Item[]>();
const lanePeriods = new Map<LaneId, Period[]>();
const laneLeaders = new Map<LaneId, Period[]>();
const laneEvents = new Map<LaneId, TimelineEvent[]>();
for (const lane of LANES) {
  const mine = items.filter((i) => i.lane === lane.id);
  laneItems.set(
    lane.id,
    [...mine].sort((a, b) => itemSpan(a)[0] - itemSpan(b)[0]),
  );
  // ビルド時（index.astro）と同じ並びでないと、段組みの計算結果が DOM とずれる
  const bars = mine.filter((i): i is Period => i.kind === 'period');
  const byStart = (a: Period, b: Period) => a.start - b.start || a.id.localeCompare(b.id);
  lanePeriods.set(lane.id, bars.filter((p) => !p.leader).sort(byStart));
  laneLeaders.set(lane.id, bars.filter((p) => p.leader).sort(byStart));
  laneEvents.set(lane.id, mine.filter((i): i is TimelineEvent => i.kind === 'event'));
}

/** いま見えている（人物フィルタを反映した）レーンの並び。← → の移動とパネルの前後で使う */
function laneNeighbours(lane: LaneId): Item[] {
  const list = laneItems.get(lane)!;
  return view.leaders ? list : list.filter((i) => !isLeader(i));
}

/** ズームのたびに1000件以上を querySelector し直すと重いので、最初に引けるようにしておく */
const elById = new Map<string, HTMLElement>();

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

type View = { zoom: number; off: CategoryId[]; hiddenLanes: LaneId[]; leaders: boolean };
const view: View = { zoom: 1, off: [], hiddenLanes: [], leaders: true };

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
    if (typeof saved.zoom === 'number' && saved.zoom >= MIN_ZOOM && saved.zoom <= MAX_ZOOM) view.zoom = saved.zoom;
    if (Array.isArray(saved.off)) view.off = saved.off.filter((c) => categoryById.has(c));
    if (Array.isArray(saved.hiddenLanes)) view.hiddenLanes = saved.hiddenLanes.filter((l) => LANES.some((x) => x.id === l));
    if (typeof saved.leaders === 'boolean') view.leaders = saved.leaders;
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
    // 人物を隠しているあいだは段も取らない（レーンがその分だけ縮む）
    const leaders = view.leaders ? laneLeaders.get(lane.id)! : [];
    const events = laneEvents.get(lane.id)!;
    const packedBars = packPeriods(periods, zoom);
    const packedLeaders = packPeriods(leaders, zoom, LEADER_STYLE);
    const packedDots = packEvents(events, zoom);

    const placeBars = (list: Period[], packed: ReturnType<typeof packPeriods>) => {
      list.forEach((p, i) => {
        const el = elById.get(p.id);
        if (!el) return;
        el.style.setProperty('--bx', `${yearToX(itemSpan(p)[0], zoom)}px`);
        el.style.setProperty('--bw', `${packed.widths[i]!}px`);
        el.style.setProperty('--row', String(packed.rows[i]!));
        el.dataset.label = packed.labels[i]!;
      });
    };
    placeBars(periods, packedBars);
    placeBars(leaders, packedLeaders);

    events.forEach((e, i) => {
      const el = elById.get(e.id);
      if (!el) return;
      el.style.setProperty('--ex', `${yearToX(e.year, zoom)}px`);
      el.style.setProperty('--row', String(packedDots.rows[i]!));
    });

    const bands = laneBands(packedBars.rowCount, packedLeaders.rowCount, packedDots.rowCount);
    track.style.setProperty('--h', `${bands.height}px`);
    track.style.setProperty('--ld-top', `${bands.leaderTop}px`);
    track.style.setProperty('--ev-top', `${bands.eventTop}px`);
  }

  if (scanYear !== null) moveScan(scanYear, false);
}

/** ×1 / ×1.4 のように、細かいズームでも短く出す */
function showZoom() {
  $('#zoom-value')!.textContent = `×${Math.round(view.zoom * 10) / 10}`;
}

let saveTimer = 0;
/** ピンチ中に毎フレーム localStorage を叩かないよう、保存だけ遅らせる */
function saveSoon() {
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(save, 400);
}

/**
 * 拡大縮小する。anchorX（画面上の横位置）が指している年をその場に留めるので、
 * カーソルの下の年が動かない。省略すると中央線の年を保つ。
 */
function setZoom(next: number, anchorX?: number) {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next));
  if (Math.abs(zoom - view.zoom) < 0.001) return;
  const rect = tl.getBoundingClientRect();
  const at = (anchorX ?? rect.left + centerOffset()) - rect.left;
  // x座標はズームに正比例する（scale.ts は最後に zoom を掛けているだけ）ので、
  // いったん年に戻さず比で合わせられる。連続で拡大縮小しても丸めでずれない
  const keep = (tl.scrollLeft + at - LABEL_COL_W) * (zoom / view.zoom);
  view.zoom = zoom;
  relayout();
  tl.scrollLeft = Math.max(0, keep + LABEL_COL_W - at);
  updateCenterYear();
  showZoom();
  saveSoon();
}

/** ＋−ボタンとキー: 次の段へ飛ぶ */
function stepZoom(dir: 1 | -1) {
  const next =
    dir > 0
      ? (ZOOM_LEVELS.find((z) => z > view.zoom + 0.001) ?? MAX_ZOOM)
      : ([...ZOOM_LEVELS].reverse().find((z) => z < view.zoom - 0.001) ?? MIN_ZOOM);
  setZoom(next);
}

/* ───────── 年表の上で直接ズームする ───────── */

// ホイールやピンチは1フレームに何度も来るので、次の描画まで目標値をためる
let zoomTarget = 0;
let zoomAnchorX = 0;
let zoomRaf = 0;
function queueZoom(target: number, anchorX: number) {
  zoomTarget = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, target));
  zoomAnchorX = anchorX;
  if (zoomRaf) return;
  zoomRaf = requestAnimationFrame(() => {
    zoomRaf = 0;
    const target = zoomTarget;
    zoomTarget = 0;
    setZoom(target, zoomAnchorX);
  });
}

/** ためている途中の目標値（無ければ現在のズーム） */
function pendingZoom(): number {
  return zoomTarget || view.zoom;
}

// ⌘/Ctrl＋ホイール、およびトラックパッドのピンチ（ブラウザは ctrl 付きホイールとして送る）
tl.addEventListener(
  'wheel',
  (e) => {
    if (!e.ctrlKey && !e.metaKey) return; // 修飾キーなしは今まで通りスクロール
    e.preventDefault();
    // deltaMode が行・ページ単位のこともあるので px に均す
    const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1);
    // マウスは1ノッチで大きな値が1回だけ、トラックパッドは小さな値が連続で来る
    const factor = Math.abs(dy) >= WHEEL_NOTCH ? (dy < 0 ? WHEEL_STEP : 1 / WHEEL_STEP) : Math.exp(-dy * PINCH_GAIN);
    queueZoom(pendingZoom() * factor, e.clientX);
  },
  { passive: false },
);

// タッチのピンチ（タブレット）。2本目が触れた時点の幅を基準に倍率を決める
const touches = new Map<number, { x: number; y: number }>();
let pinch: { dist: number; zoom: number } | null = null;
const spread = () => {
  const [a, b] = [...touches.values()];
  return a && b ? { dist: Math.hypot(a.x - b.x, a.y - b.y), mid: (a.x + b.x) / 2 } : null;
};

tl.addEventListener('pointerdown', (e) => {
  if (e.pointerType !== 'touch') return;
  touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  const s = touches.size === 2 ? spread() : null;
  if (s) {
    pinch = { dist: s.dist, zoom: view.zoom };
    tl.style.touchAction = 'none'; // 2本指のときだけブラウザのスクロールを止める
  }
});

tl.addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'touch' || !touches.has(e.pointerId)) return;
  touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  const s = touches.size === 2 ? spread() : null;
  if (!pinch || !s || !s.dist) return;
  queueZoom(pinch.zoom * Math.pow(s.dist / pinch.dist, PINCH_POWER), s.mid);
});

for (const type of ['pointerup', 'pointercancel', 'pointerleave'] as const) {
  tl.addEventListener(type, (e) => {
    touches.delete(e.pointerId);
    if (touches.size < 2) {
      pinch = null;
      tl.style.touchAction = '';
    }
  });
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

  document.documentElement.dataset.leaders = view.leaders ? 'on' : 'off';
  $('#leader-toggle')!.setAttribute('aria-pressed', String(view.leaders));

  for (const row of mlist.querySelectorAll<HTMLElement>('.mrow')) {
    row.hidden =
      off.has(row.dataset.cat as CategoryId) ||
      view.hiddenLanes.includes(row.dataset.lane as LaneId) ||
      (!view.leaders && row.dataset.leader !== undefined);
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
  const neighbours = laneNeighbours(item.lane);
  const at = neighbours.findIndex((n) => n.id === item.id);
  const prev = neighbours[at - 1];
  const next = neighbours[at + 1];
  const role = isLeader(item) ? `${LEADER_LAYER.label}（${cat.label}）` : cat.label;

  panel.removeAttribute('data-empty');
  panelBody.innerHTML = `
    <button type="button" class="panel__close" id="panel-close" aria-label="閉じる">×</button>
    <div class="panel__kicker" data-fam="${cat.family}">${itemDot(item)} ${esc(lane.label)} ・ ${esc(role)}</div>
    <h2 class="panel__title">${esc(item.title)}</h2>
    <div class="panel__date">${esc(formatItemDate(item))}</div>
    <p class="panel__summary">${esc(item.summary)}</p>
    ${
      item.image
        ? `<figure class="panel__figure">
             <img src="${esc(item.image.url)}" alt="" loading="lazy" decoding="async" />
             <figcaption><a href="${esc(item.image.page)}" target="_blank" rel="noopener">${esc(item.image.credit)}</a></figcaption>
           </figure>`
        : ''
    }
    ${item.detail ? `<p class="panel__detail">${esc(item.detail.trim())}</p>` : ''}
    ${
      item.links.length
        ? `<p class="panel__source">参考: ${item.links
            .map((l) => `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)}</a>`)
            .join(' / ')}</p>`
        : ''
    }
    ${
      item.tags.length
        ? `<h3>タグ</h3><div class="panel__tags">${item.tags.map((t) => `<span>${esc(t)}</span>`).join('')}</div>`
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
    const covers = (p: Period) => !off.has(p.category) && itemSpan(p)[0] <= year && year <= itemSpan(p)[1];
    const active = lanePeriods.get(lane.id)!.filter(covers);
    const rulers = view.leaders ? laneLeaders.get(lane.id)!.filter(covers) : [];
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
      ...rulers.map(
        (p) =>
          `<div class="snapshot__row" data-leader>
             <span class="ev__dot snapshot__person" data-shape="${LEADER_LAYER.shape}"></span>
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
    <div class="panel__date">進行中の王朝・時代${view.leaders ? 'と在位していた人物' : ''}、前後${span}年以内の出来事</div>
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

$('#leader-toggle')!.addEventListener('click', () => {
  view.leaders = !view.leaders;
  applyFilters();
  relayout();
  if (scanYear !== null) renderSnapshot(scanYear);
});

$('#lanepick')!.addEventListener('change', (e) => {
  const box = e.target as HTMLInputElement;
  const lane = box.value as LaneId;
  view.hiddenLanes = box.checked ? view.hiddenLanes.filter((l) => l !== lane) : [...view.hiddenLanes, lane];
  applyFilters();
  if (scanYear !== null) renderSnapshot(scanYear);
});

$('#zoom-in')!.addEventListener('click', () => stepZoom(1));
$('#zoom-out')!.addEventListener('click', () => stepZoom(-1));

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
  if (e.key === '+' || e.key === ';' || (e.key === '=' && !e.shiftKey)) {
    e.preventDefault();
    return stepZoom(1);
  }
  if (e.key === '-') {
    e.preventDefault();
    return stepZoom(-1);
  }
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
  if (!selectedId) return;
  const item = byId.get(selectedId)!;
  const list = laneNeighbours(item.lane);
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
    parts.push(`<button type="button" class="mrow" data-id="${item.id}" data-cat="${item.category}" data-lane="${item.lane}" data-fam="${cat.family}"${isLeader(item) ? ' data-leader' : ''}>
        <span class="mrow__year">${esc(formatItemDateShort(item))}</span>
        <span class="mrow__main">
          <span class="ev__dot" data-shape="${isLeader(item) ? LEADER_LAYER.shape : cat.shape}"></span>
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
for (const el of lanesEl.querySelectorAll<HTMLElement>('.bar, .ev')) elById.set(el.dataset.id!, el);
showZoom();
document.documentElement.dataset.leaders = view.leaders ? 'on' : 'off';
if (view.zoom !== 1 || !view.leaders) relayout();
onBreakpoint();
applyFilters();
applyHash();
