// 비즈가든 케어카드 빌드 스크립트
// plants/*.md → dist/<슬러그>/index.html + dist/qr/<슬러그>.png|.svg
//             + dist/index.html(목록) + print/price-tags.html(가격표 시트)
// 빌드 후 QR을 디코딩해 URL 일치를 검증한다 (CLAUDE.md 규칙).
//
// 사용법:
//   node src/build.js              전체 빌드 (가격표 시트 = 전체 식물)
//   node src/build.js 슬러그...     가격표 시트를 지정 식물만으로 생성

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import { marked } from 'marked';
import QRCode from 'qrcode';
import { PNG } from 'pngjs';
import jsQR from 'jsqr';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const PRINT = path.join(ROOT, 'print');

const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'shop.config.json'), 'utf8'));
const baseUrl = String(config.baseUrl || '').replace(/\/+$/, '');
if (!baseUrl) fail('shop.config.json 의 baseUrl 이 비어 있습니다.');

const plantTpl = fs.readFileSync(path.join(ROOT, 'templates', 'plant.html'), 'utf8');
const tagTpl = fs.readFileSync(path.join(ROOT, 'templates', 'price-tag.html'), 'utf8');

const LIGHT_LABELS = { 1: '그늘져도 괜찮아요', 2: '반음지', 3: '밝은 간접광', 4: '밝은 곳이 좋아요', 5: '직사광 가득' };
const WATER_LABELS = { 1: '아주 가끔', 2: '마르면 듬뿍', 3: '적당히 촉촉하게', 4: '자주 촉촉하게', 5: '물을 좋아해요' };
const DIFF_LABELS = { 1: '쉬움', 2: '무난해요', 3: '보통', 4: '조금 까다로워요', 5: '어려움' };
const SECTION_EMOJI = {
  '물 주기': '💧', '빛': '☀️', '이런 신호가 오면': '🚨', '사장님 한마디': '💬',
  '온도': '🌡️', '분갈이': '🪴', '비료': '🥄',
};
const DOT_COLORS = ['#FF6FA8', '#5DC8F5', '#FFD93D', '#8B6CF6'];

const warnings = [];
const warn = (m) => warnings.push(m);
function fail(m) { console.error('✗ ' + m); process.exit(1); }
const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// {{{key}}} = HTML 그대로, {{key}} = 이스케이프
function render(tpl, data) {
  return tpl
    .replace(/\{\{\{(\w+)\}\}\}/g, (_, k) => data[k] ?? '')
    .replace(/\{\{(\w+)\}\}/g, (_, k) => esc(data[k] ?? ''));
}

function beadRow(key, nameKo, value, labels, customLabel) {
  const v = Math.round(Number(value));
  if (!v || v < 1) return '';
  const color = { light: 'sky', water: 'pink', difficulty: 'lemon' }[key];
  let beads = '';
  for (let i = 1; i <= 5; i++) {
    beads += `<span class="bead ${color}${i <= v ? ' fill' : ''}" style="--i:${i}"></span>`;
  }
  const label = customLabel || labels[Math.min(5, v)] || '';
  return `<div class="gauge">`
    + `<span class="beads" role="img" aria-label="${esc(nameKo)} 5점 만점에 ${Math.min(5, v)}점">${beads}</span>`
    + `<span class="gauge-name">${esc(nameKo)}</span>`
    + `<span class="gauge-label">${esc(label)}</span></div>`;
}

// "## 제목" 기준으로 본문을 섹션으로 분리
function parseSections(md) {
  const parts = md.split(/^##\s+/m);
  const intro = parts[0].trim();
  const sections = parts.slice(1).map((chunk) => {
    const nl = chunk.indexOf('\n');
    const title = (nl === -1 ? chunk : chunk.slice(0, nl)).trim();
    const body = nl === -1 ? '' : chunk.slice(nl + 1);
    return { title, html: marked.parse(body) };
  });
  return { intro, sections };
}

// ── 사진: plants/photos/<슬러그>.jpg|png|webp ────
const PHOTOS_DIR = path.join(ROOT, 'plants', 'photos');
const creditsPath = path.join(PHOTOS_DIR, 'credits.json');
const credits = fs.existsSync(creditsPath)
  ? JSON.parse(fs.readFileSync(creditsPath, 'utf8').replace(/^﻿/, '')) // BOM 허용
  : {};
function findPhoto(slug) {
  for (const ext of ['jpg', 'jpeg', 'png', 'webp']) {
    const f = path.join(PHOTOS_DIR, `${slug}.${ext}`);
    if (fs.existsSync(f)) return f;
  }
  return null;
}

// ── 식물 파일 읽기 ──────────────────────────────
const plantFiles = fs.readdirSync(path.join(ROOT, 'plants')).filter((f) => f.endsWith('.md'));
if (plantFiles.length === 0) fail('plants/ 에 식물 파일(.md)이 없습니다.');

const plants = [];
const seenSlugs = new Set();
for (const file of plantFiles.sort()) {
  const raw = fs.readFileSync(path.join(ROOT, 'plants', file), 'utf8');
  const { data, content } = matter(raw);
  if (!data.name) fail(`${file}: frontmatter 에 name 이 없습니다.`);
  if (!data.slug || !/^[a-z0-9-]+$/.test(data.slug)) {
    fail(`${file}: 영문 슬러그가 필요합니다 (frontmatter 에 "slug: monstera" 처럼 소문자 a-z, 숫자, 하이픈만). ` +
      `슬러그는 QR URL이 되므로 한 번 정하면 절대 바꾸지 마세요.`);
  }
  if (seenSlugs.has(data.slug)) fail(`${file}: 슬러그 "${data.slug}" 가 다른 식물과 중복됩니다.`);
  seenSlugs.add(data.slug);
  plants.push({ file, data, content, url: `${baseUrl}/${data.slug}/` });
}

// ── dist 초기화 ────────────────────────────────
fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(path.join(DIST, 'qr'), { recursive: true });
fs.mkdirSync(PRINT, { recursive: true });
fs.copyFileSync(path.join(ROOT, 'src', 'style.css'), path.join(DIST, 'style.css'));
fs.writeFileSync(path.join(DIST, '.nojekyll'), '');
if (config.customDomain) fs.writeFileSync(path.join(DIST, 'CNAME'), config.customDomain + '\n');

// ── 식물별 페이지 + QR ─────────────────────────
for (const p of plants) {
  const d = p.data;
  const slug = d.slug;

  const priceText = d.price != null ? '₩' + Number(d.price).toLocaleString('ko-KR') : '';

  let petText;
  if (d.pet_safe === true) petText = '🐶 반려동물에게 비교적 안전해요';
  else if (d.pet_safe === false) petText = '🐾 반려동물이 먹지 않게 주의하세요';
  else {
    petText = '🐾 반려동물 안전 여부는 확인 중이에요';
    warn(`${p.file}: pet_safe 값이 없습니다 — 안전 관련이니 사장님 확인 필요.`);
  }

  const tagsHtml = (Array.isArray(d.tags) ? d.tags : [])
    .map((t) => `<span class="tag-chip">${esc(t)}</span>`).join('');

  const gaugesHtml = [
    beadRow('light', '빛', d.light, LIGHT_LABELS, d.light_label),
    beadRow('water', '물', d.water, WATER_LABELS, d.water_label),
    beadRow('difficulty', '난이도', d.difficulty, DIFF_LABELS, d.difficulty_label),
  ].join('\n    ');

  const { intro, sections } = parseSections(p.content);
  let sectionsHtml = '';
  if (intro) sectionsHtml += `<section class="sec">${marked.parse(intro)}</section>\n`;
  for (const s of sections) {
    const emoji = SECTION_EMOJI[s.title] || '🌱';
    const body = s.title.includes('사장님') ? `<div class="bubble">${s.html}</div>` : s.html;
    sectionsHtml += `<section class="sec"><h2>${emoji} ${esc(s.title)}</h2>${body}</section>\n`;
  }

  const actionsHtml = config.instagram
    ? `<a class="btn" href="${esc(config.instagram)}">📍 ${esc(config.shopName)} 인스타그램</a>`
    : '';

  fs.mkdirSync(path.join(DIST, slug), { recursive: true });

  // 사진이 있으면 화분 헤더에 사진, 없으면 이모지 (자동 리사이즈로 200KB 이하 유지)
  const photoSrc = findPhoto(slug);
  let potInner = `<span class="pot-emoji">${esc(d.emoji || '🌱')}</span>`;
  p.hasPhoto = false;
  if (photoSrc) {
    await sharp(photoSrc).rotate()
      .resize({ width: 640, height: 640, fit: 'cover' })
      .jpeg({ quality: 78 })
      .toFile(path.join(DIST, slug, 'photo.jpg'));
    potInner = `<img class="pot-photo" src="photo.jpg" alt="${esc(d.name)} 사진">`;
    p.hasPhoto = true;
  }
  const footExtra = (p.hasPhoto && credits[slug]) ? ' · <a href="../credits/">사진 출처</a>' : '';

  const html = render(plantTpl, {
    name: d.name, english: d.english || '',
    shopName: config.shopName, city: config.city || '',
    priceText, petText, tagsHtml, gaugesHtml, sectionsHtml, actionsHtml, potInner, footExtra,
  });
  fs.writeFileSync(path.join(DIST, slug, 'index.html'), html);

  // QR 생성 (오류정정 H — 코팅·오염 대비) + 디코딩 검증
  const pngPath = path.join(DIST, 'qr', `${slug}.png`);
  await QRCode.toFile(pngPath, p.url, { errorCorrectionLevel: 'H', width: 512, margin: 2 });
  const svg = await QRCode.toString(p.url, { type: 'svg', errorCorrectionLevel: 'H', margin: 2 });
  fs.writeFileSync(path.join(DIST, 'qr', `${slug}.svg`), svg);

  const png = PNG.sync.read(fs.readFileSync(pngPath));
  const decoded = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
  if (!decoded) fail(`QR 검증 실패 (${slug}): 디코딩할 수 없습니다.`);
  if (decoded.data !== p.url) fail(`QR 검증 실패 (${slug}): "${decoded.data}" ≠ "${p.url}"`);

  p.priceText = priceText;
  p.qrPng = pngPath;
  console.log(`✓ ${d.name}  →  ${p.url}  (QR 디코딩 검증 통과)`);
}

// ── 전체 목록 페이지 ───────────────────────────
const listCards = plants.map((p) => {
  const d = p.data;
  const tags = (Array.isArray(d.tags) ? d.tags : []).map((t) => '#' + t).join(' ');
  const face = p.hasPhoto
    ? `<img class="thumb" src="${d.slug}/photo.jpg" alt="" loading="lazy">`
    : `<span class="em">${d.emoji || '🌱'}</span>`;
  return `<a class="plant-card" href="${d.slug}/">`
    + face
    + `<span><div class="nm">${esc(d.name)}</div><div class="tg">${esc(tags)}</div></span>`
    + `<span class="pr">${esc(p.priceText)}</span></a>`;
}).join('\n    ');

fs.writeFileSync(path.join(DIST, 'index.html'), `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(config.shopName)} 식물 목록</title>
<meta name="theme-color" content="#FFFBEA">
<link rel="stylesheet" href="style.css">
</head>
<body>
<main class="card">
  <header class="topbar"><span class="logo">🫧 ${esc(config.shopName)}</span></header>
  <h1 class="plant-name list-title">우리 가게 식물들</h1>
  <div class="bead-line" role="separator" aria-hidden="true"></div>
  <div class="plant-list">
    ${listCards}
  </div>
  <footer class="foot">${esc(config.shopName)} · ${esc(config.city || '')}</footer>
</main>
</body>
</html>
`);

// ── 사진 출처 페이지 (위키미디어 사진 사용 시 라이선스 표기) ──
const credited = plants.filter((p) => p.hasPhoto && credits[p.data.slug]);
if (credited.length) {
  const rows = credited.map((p) => {
    const c = credits[p.data.slug];
    return `<li><strong>${esc(p.data.name)}</strong><br>` +
      `<a href="${esc(c.page)}">${esc(String(c.file).replace(/^File:/, ''))}</a><br>` +
      `<span class="muted">${esc(c.author)} · ${esc(c.license)} · Wikimedia Commons</span></li>`;
  }).join('\n    ');
  fs.mkdirSync(path.join(DIST, 'credits'), { recursive: true });
  fs.writeFileSync(path.join(DIST, 'credits', 'index.html'), `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>사진 출처 · ${esc(config.shopName)}</title>
<link rel="stylesheet" href="../style.css">
</head>
<body>
<main class="card">
  <header class="topbar"><a class="logo" href="../">🫧 ${esc(config.shopName)}</a></header>
  <h1 class="plant-name list-title">사진 출처</h1>
  <p class="plant-english">아래 사진은 자유 라이선스로 공개된 것을 사용했어요.</p>
  <ul class="credits-list">
    ${rows}
  </ul>
  <footer class="foot">${esc(config.shopName)} · ${esc(config.city || '')}</footer>
</main>
</body>
</html>
`);
}

// ── QR 시트 (A4 6분할, 55×90mm) — 요청할 때만 생성 ──
// 기본 빌드는 시트를 만들지 않는다. `node src/build.js all` 또는 슬러그 지정 시 생성.
const rawArgs = process.argv.slice(2);
// --per=N : A4 한 장에 넣을 카드 수 (기본 6, 1이면 식물당 한 페이지)
const perArg = rawArgs.find((a) => a.startsWith('--per='));
const PER_SHEET = Math.min(6, Math.max(1, perArg ? parseInt(perArg.split('=')[1], 10) || 6 : 6));
const wanted = rawArgs.filter((a) => !a.startsWith('--'));
let tagPlants = [];
if (wanted.length > 0) {
  if (wanted.length === 1 && wanted[0] === 'all') {
    tagPlants = plants;
  } else {
    const unknown = wanted.filter((s) => !plants.some((p) => p.data.slug === s));
    if (unknown.length) fail(`시트 대상 슬러그를 찾을 수 없습니다: ${unknown.join(', ')}`);
    tagPlants = plants.filter((p) => wanted.includes(p.data.slug));
  }
}

const cards = tagPlants.map((p, i) => {
  const d = p.data;
  const qrDataUri = 'data:image/png;base64,' + fs.readFileSync(p.qrPng).toString('base64');
  return `<div class="tag">
  <span class="dot" style="background:${DOT_COLORS[i % DOT_COLORS.length]}"></span>
  <div class="t-emoji">${d.emoji || '🌱'}</div>
  <div class="t-name">${esc(d.name)}</div>
  <div class="t-eng">${esc(d.english || '')}</div>
${p.priceText ? `  <div class="t-price">${esc(p.priceText)}</div>\n` : ''}  <img class="t-qr" src="${qrDataUri}" alt="QR — ${esc(p.url)}">
  <div class="t-hint">📷 찍으면 키우는 법이 나와요</div>
  <div class="t-shop">🫧 ${esc(config.shopName)}</div>
</div>`;
});

if (tagPlants.length > 0) {
  let sheetsHtml = '';
  const sheetClass = PER_SHEET === 1 ? 'sheet one' : 'sheet';
  for (let i = 0; i < cards.length; i += PER_SHEET) {
    sheetsHtml += `<section class="${sheetClass}">\n${cards.slice(i, i + PER_SHEET).join('\n')}\n</section>\n`;
  }
  fs.writeFileSync(path.join(PRINT, 'price-tags.html'), render(tagTpl, { shopName: config.shopName, sheetsHtml }));
}

// ── 요약 ──────────────────────────────────────
console.log(`\n빌드 완료: 식물 ${plants.length}개` + (tagPlants.length ? `, 시트 카드 ${tagPlants.length}장` : ''));
console.log(`  dist/            → 배포용 (GitHub Pages), QR은 dist/qr/`);
if (tagPlants.length) console.log(`  print/price-tags.html → 브라우저에서 열어 인쇄하거나 npm run pdf`);
if (baseUrl.includes('example')) {
  warn('shop.config.json 의 baseUrl 이 아직 예시 도메인입니다. 실제 도메인 확정 전에는 QR을 인쇄하지 마세요!');
}
if (warnings.length) {
  console.log('\n⚠ 확인 필요:');
  for (const w of warnings) console.log('  - ' + w);
}
