#!/usr/bin/env node
/**
 * 各項目に対応する ja.wikipedia の記事を探して、候補と冒頭文を書き出す。
 * ここでは貼らない（判断材料を集めるだけ）。結果は scripts/.cache/wiki-match.json。
 *
 * 記事名の当て方:
 *   1. 項目名そのもの / 括弧を外した形 / 空白で割った各部分
 *   2. 出来事は文なので、助詞や「〜の設立」を削って固有名詞を取り出す
 *   3. それでも無ければ検索 API にかける
 * 当たったら冒頭文に年代が出てくるかを見て、確からしさを段階で返す。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAll } from '../src/lib/load-fs.ts';

const UA = 'myworld-timeline/0.1 (https://github.com/ando-and-ando; personal history timeline; ando@fuenn.co.jp)';
const API = 'https://ja.wikipedia.org/w/api.php';
const OUT = fileURLToPath(new URL('.cache/wiki-match.json', import.meta.url));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(params) {
  const url = `${API}?${new URLSearchParams({ format: 'json', formatversion: '2', ...params })}`;
  for (let tries = 0; ; tries++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } });
      if (res.ok) return await res.json();
      if (res.status === 429) await sleep(3000);
      else if (tries >= 3) throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      if (tries >= 3) throw e;
    }
    await sleep(1000 * (tries + 1));
  }
}

/** 項目名から記事名の候補を作る（前のものほど確からしい順） */
export function titleCandidates(item) {
  const out = [];
  const push = (x) => {
    const v = (x ?? '').trim().replace(/^[「『]|[」』]$/g, '');
    if (v.length >= 2 && !out.includes(v)) out.push(v);
  };
  const t = item.title.trim();
  push(t);
  const noParen = t.replace(/[（(][^）)]*[）)]/g, '').trim();
  push(noParen);
  const pope = noParen.match(/^教皇(.+)$/);
  if (pope) {
    push(`${pope[1]} (ローマ教皇)`);
    push(pope[1]);
  }
  for (const part of noParen.split(/[ 　]+/)) push(part);
  if (item.kind === 'event') {
    // 「オランダ東インド会社の設立」→「オランダ東インド会社」
    push(noParen.replace(/の(設立|成立|建設|建国|創設|滅亡|発売|即位|開始|完成|廃止|公布|制定|発明|発見|開通|締結|勃発)(開始)?$/, ''));
    // 「秦の始皇帝が中国を統一」→「秦の始皇帝」
    push(noParen.split(/[がはをにでと、]/)[0]);
  }
  return out.slice(0, 5);
}

function yearHints(item) {
  const ys = item.kind === 'event' ? [item.year] : [item.start, item.end].filter((y) => y !== undefined);
  return ys.filter((y) => y !== undefined).map((y) => (y < 0 ? `紀元前${-y}` : String(y)));
}

/** 存在と曖昧さ回避だけを見る（extract 無しなら50件ずつ引ける） */
async function probeTitles(titles) {
  const found = new Map();
  for (let i = 0; i < titles.length; i += 50) {
    const chunk = titles.slice(i, i + 50);
    const data = await api({
      action: 'query', prop: 'pageprops|info', inprop: 'url', redirects: '1', titles: chunk.join('|'),
    });
    const alias = new Map();
    for (const n of data.query?.normalized ?? []) alias.set(n.from, n.to);
    for (const r of data.query?.redirects ?? []) alias.set(r.from, r.to);
    const byTitle = new Map();
    for (const p of data.query?.pages ?? []) byTitle.set(p.title, p);
    for (const asked of chunk) {
      let name = asked;
      for (let hop = 0; hop < 3 && alias.has(name); hop++) name = alias.get(name);
      const p = byTitle.get(name);
      if (p && !p.missing) {
        found.set(asked, { title: p.title, url: p.fullurl, dab: Boolean(p.pageprops?.disambiguation) });
      }
    }
    process.stderr.write(`\r記事の有無を確認 ${Math.min(i + 50, titles.length)}/${titles.length}`);
    await sleep(120);
  }
  process.stderr.write('\n');
  return found;
}

/** 選んだ記事の冒頭文をまとめて取る */
async function fetchExtracts(titles) {
  const out = new Map();
  for (let i = 0; i < titles.length; i += 20) {
    const data = await api({
      action: 'query', prop: 'extracts', exintro: '1', explaintext: '1', exlimit: '20',
      redirects: '1', titles: titles.slice(i, i + 20).join('|'),
    });
    for (const p of data.query?.pages ?? []) if (p.extract) out.set(p.title, p.extract);
    process.stderr.write(`\r冒頭文を取得 ${Math.min(i + 20, titles.length)}/${titles.length}`);
    await sleep(120);
  }
  process.stderr.write('\n');
  return out;
}

async function main() {
  const { items } = loadAll();
  console.error(`${items.length} 項目`);

  // 1) 名前から引ける記事を洗い出す
  const wanted = new Map(); // 項目id -> 候補名の配列
  for (const item of items) wanted.set(item.id, titleCandidates(item));
  const found = await probeTitles([...new Set([...wanted.values()].flat())]);

  // 2) 名前で当たらなかった項目は検索にかける
  const needSearch = items.filter((i) => !wanted.get(i.id).some((c) => found.get(c) && !found.get(c).dab));
  console.error(`名前で当たらない ${needSearch.length} 件を検索します`);
  const searchHits = new Map();
  for (const [n, item] of needSearch.entries()) {
    const data = await api({ action: 'query', list: 'search', srsearch: item.title, srlimit: '4', srnamespace: '0' });
    searchHits.set(item.id, (data.query?.search ?? []).map((s) => s.title));
    if (n % 25 === 0) process.stderr.write(`\r検索 ${n}/${needSearch.length}`);
    await sleep(140);
  }
  process.stderr.write('\n');
  const extra = [...new Set([...searchHits.values()].flat())].filter((t) => !found.has(t));
  for (const [k, v] of await probeTitles(extra)) found.set(k, v);

  // 3) 候補それぞれの冒頭文を取って、年代が合うかを見る
  const perItem = new Map();
  for (const item of items) {
    const names = [...wanted.get(item.id), ...(searchHits.get(item.id) ?? [])];
    const cands = [];
    for (const n of names) {
      const f = found.get(n);
      if (f && !f.dab && !cands.some((c) => c.title === f.title)) cands.push({ ...f, via: n });
    }
    perItem.set(item.id, cands.slice(0, 4));
  }
  const extracts = await fetchExtracts([...new Set([...perItem.values()].flat().map((c) => c.title))]);

  const rows = items.map((item) => {
    const hints = yearHints(item);
    const mine = item.title.replace(/[（(][^）)]*[）)]/g, '');
    const cands = perItem.get(item.id).map((c) => {
      const extract = extracts.get(c.title) ?? '';
      const yearOk = hints.some((h) => extract.includes(h));
      const bare = c.title.replace(/\s*[（(][^）)]*[）)]/g, '');
      const nameOk = mine.includes(bare) || bare.includes(mine);
      return { ...c, yearOk, nameOk, lead: extract.replace(/\s+/g, ' ').slice(0, 160) };
    });
    cands.sort((a, b) => (b.yearOk * 3 + b.nameOk * 2) - (a.yearOk * 3 + a.nameOk * 2));
    const best = cands[0];
    const level = !best ? 'none' : best.yearOk && best.nameOk ? 'sure' : best.yearOk || best.nameOk ? 'maybe' : 'weak';
    return {
      id: item.id, kind: item.kind === 'event' ? 'event' : item.leader ? 'leader' : 'period',
      lane: item.lane, title: item.title, years: hints.join('-'), level, cands,
    };
  });

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(rows, null, 1));
  const tally = rows.reduce((a, r) => ((a[r.level] = (a[r.level] ?? 0) + 1), a), {});
  console.error(`\n書き出し: ${path.relative(process.cwd(), OUT)}`, tally);
}

await main();
