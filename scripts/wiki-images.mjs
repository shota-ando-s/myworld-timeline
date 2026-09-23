#!/usr/bin/env node
/**
 * リンク先の記事の代表画像（冒頭に出ている画像）と、その出所・ライセンスを取る。
 *   node scripts/wiki-images.mjs [レーンid]
 *
 * 画像はウィキメディアのものをそのまま参照する（再配布はしない）。
 * CC BY-SA などは表示義務があるので、作者・ライセンス・ファイルページを必ず一緒に取る。
 * 取れなかった場合は画像なしでよい（無理に別の画像を当てない）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAll } from '../src/lib/load-fs.ts';

const UA = 'myworld-timeline/0.1 (personal history timeline; ando@fuenn.co.jp)';
const API = 'https://ja.wikipedia.org/w/api.php';
const OUT = fileURLToPath(new URL('.cache/wiki-images.json', import.meta.url));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// ウィキメディアは決まった幅のサムネイルしか配らない（330/500/960…）。
// 要求した値に近いものが返るので、返ってきた URL をそのまま使う。パネルの幅は380px。
const THUMB = 500;

async function api(params) {
  const url = `${API}?${new URLSearchParams({ format: 'json', formatversion: '2', ...params })}`;
  for (let t = 0; ; t++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } });
      if (res.ok) return res.json();
      if (t >= 2) throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      if (t >= 2) throw e;
    }
    await sleep(800);
  }
}

const strip = (html) =>
  (html ?? '')
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const lane = process.argv[2];
const { items } = loadAll();
const targets = items.filter((i) => (!lane || i.lane === lane) && i.links.some((l) => l.url.includes('ja.wikipedia.org/wiki/')));
const articleOf = (i) => decodeURIComponent(i.links.find((l) => l.url.includes('ja.wikipedia.org/wiki/')).url.split('/wiki/')[1]).replace(/_/g, ' ');

// 1) 記事 → 代表画像のファイル名とサムネイルURL
const byArticle = new Map();
for (const i of targets) byArticle.set(articleOf(i), null);
const titles = [...byArticle.keys()];
console.error(`${targets.length} 項目 / ${titles.length} 記事の代表画像を探します`);

for (let i = 0; i < titles.length; i += 40) {
  const data = await api({
    action: 'query', prop: 'pageimages', piprop: 'name|thumbnail', pithumbsize: String(THUMB),
    pilimit: '50', redirects: '1', titles: titles.slice(i, i + 40).join('|'),
  });
  const alias = new Map();
  for (const n of data.query?.normalized ?? []) alias.set(n.from, n.to);
  for (const r of data.query?.redirects ?? []) alias.set(r.from, r.to);
  const got = new Map((data.query?.pages ?? []).map((p) => [p.title, p]));
  for (const asked of titles.slice(i, i + 40)) {
    let name = asked;
    for (let h = 0; h < 3 && alias.has(name); h++) name = alias.get(name);
    const p = got.get(name);
    if (p?.pageimage && p.thumbnail?.source) {
      byArticle.set(asked, { file: p.pageimage, thumb: p.thumbnail.source.split('?')[0], w: p.thumbnail.width, h: p.thumbnail.height });
    }
  }
  process.stderr.write(`\r代表画像 ${Math.min(i + 40, titles.length)}/${titles.length}`);
  await sleep(130);
}
process.stderr.write('\n');

// 2) ファイル → 作者とライセンス（表示義務があるので必ず取る）
const files = [...new Set([...byArticle.values()].filter(Boolean).map((v) => `File:${v.file}`))];
const meta = new Map();
for (let i = 0; i < files.length; i += 20) {
  const data = await api({
    action: 'query', prop: 'imageinfo', iiprop: 'extmetadata|url', iiextmetadatafilter: 'Artist|LicenseShortName|LicenseUrl|AttributionRequired',
    titles: files.slice(i, i + 20).join('|'),
  });
  for (const p of data.query?.pages ?? []) {
    const info = p.imageinfo?.[0];
    if (!info) continue;
    const em = info.extmetadata ?? {};
    meta.set(p.title.slice(p.title.indexOf(':') + 1).replace(/_/g, ' '), {
      artist: /不明|[Uu]nknown/.test(strip(em.Artist?.value)) ? '作者不明' : strip(em.Artist?.value) || '作者不明',
      license: strip(em.LicenseShortName?.value) || 'ライセンス不明',
      licenseUrl: strip(em.LicenseUrl?.value) || '',
      page: info.descriptionurl ?? '',
    });
  }
  process.stderr.write(`\rライセンス ${Math.min(i + 20, files.length)}/${files.length}`);
  await sleep(130);
}
process.stderr.write('\n');

const out = {};
let ok = 0;
for (const item of targets) {
  const img = byArticle.get(articleOf(item));
  if (!img) continue;
  const m = meta.get(img.file.replace(/_/g, ' '));
  if (!m || !m.page) continue; // 出所が分からない画像は使わない
  out[item.id] = {
    url: img.thumb,
    credit: `${m.artist} / ${m.license}`,
    page: m.page,
    article: articleOf(item),
    title: item.title,
  };
  ok++;
}
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
console.error(`画像が見つかったのは ${ok}/${targets.length} 項目。${path.relative(process.cwd(), OUT)} に書きました`);
