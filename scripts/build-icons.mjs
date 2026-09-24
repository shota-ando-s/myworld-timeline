/**
 * カテゴリの印を Font Awesome Free（Solid）のアイコンから生成する。
 *
 * 点イベントは1000件規模になるので、SVG 要素を項目ごとに置かず
 * CSS の mask-image（data URI）として1回だけ定義する。
 * アイコンを変えたいときは下の ICONS を編集して `npm run icons` を実行する。
 *
 * 出典: Font Awesome Free 7 / アイコンは CC BY 4.0
 * https://fontawesome.com/license/free
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * src/lib/model.ts の CATEGORIES[].shape と LEADER_LAYER.shape に一致させること。
 * headphones だけはカテゴリではなく、パネルの「聴く」の行頭に使う印。
 */
const ICONS = {
  crown: '政治・王朝',
  'scale-balanced': '社会・制度',
  'shield-halved': '戦争・征服',
  'triangle-exclamation': '災害・疫病',
  lightbulb: '科学・技術',
  coins: '経済・交易',
  'place-of-worship': '宗教・思想',
  palette: '文化・芸術',
  'user-tie': '人物（王朝の帯の下に並ぶ治世）',
  headphones: 'ポッドキャスト（パネルの「聴く」）',
};

const root = fileURLToPath(new URL('..', import.meta.url));
const svgDir = path.join(root, 'node_modules/@fortawesome/fontawesome-free/svgs/solid');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'node_modules/@fortawesome/fontawesome-free/package.json'), 'utf8'));

/** data URI に入れられる最小限のエスケープ（引用符とマークアップ文字だけ） */
const encode = (svg) =>
  svg
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/"/g, "'")
    .replace(/#/g, '%23')
    .replace(/</g, '%3C')
    .replace(/>/g, '%3E');

const rules = Object.entries(ICONS).map(([name, label]) => {
  const file = path.join(svgDir, `${name}.svg`);
  if (!fs.existsSync(file)) throw new Error(`${name}.svg が Font Awesome に見つかりません`);
  return `/* ${label} */
[data-shape='${name}'] {
  -webkit-mask-image: url("data:image/svg+xml,${encode(fs.readFileSync(file, 'utf8'))}");
  mask-image: url("data:image/svg+xml,${encode(fs.readFileSync(file, 'utf8'))}");
}`;
});

const out = `/* このファイルは scripts/build-icons.mjs が生成する。直接編集しないこと。
   アイコン: Font Awesome Free ${pkg.version}（Solid）/ CC BY 4.0
   https://fontawesome.com/license/free */

.ev__dot {
  -webkit-mask-position: center;
  mask-position: center;
  -webkit-mask-size: contain;
  mask-size: contain;
  -webkit-mask-repeat: no-repeat;
  mask-repeat: no-repeat;
}

${rules.join('\n\n')}
`;

const dest = path.join(root, 'src/styles/icons.css');
fs.writeFileSync(dest, out);
console.log(`✓ ${Object.keys(ICONS).length} 個のアイコンを ${path.relative(root, dest)} に書き出しました（Font Awesome Free ${pkg.version}）`);
