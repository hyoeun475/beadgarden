// QR 코드만 모은 인쇄 시트 생성: print/qr-only.html (+ pdf.js 스타일로 PDF)
// 사용법: node src/qr-only.js [슬러그...]  (없으면 전체)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import matter from 'gray-matter';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const wanted = process.argv.slice(2);

const plants = fs.readdirSync(path.join(ROOT, 'plants')).filter((f) => f.endsWith('.md'))
  .map((f) => matter(fs.readFileSync(path.join(ROOT, 'plants', f), 'utf8')).data)
  .filter((d) => d.slug && (wanted.length === 0 || wanted.includes(d.slug)))
  .sort((a, b) => String(a.name).localeCompare(String(b.name), 'ko'));

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const cells = plants.map((d) => {
  const png = path.join(ROOT, 'dist', 'qr', `${d.slug}.png`);
  if (!fs.existsSync(png)) { console.error(`✗ QR 없음: ${d.slug} — 먼저 npm run build 를 실행하세요.`); process.exit(1); }
  const b64 = fs.readFileSync(png).toString('base64');
  return `<figure class="q"><img src="data:image/png;base64,${b64}" alt="QR"><figcaption>${esc(d.name)}</figcaption></figure>`;
});

// A4 한 장에 4×5 = 20개
let sheets = '';
for (let i = 0; i < cells.length; i += 20) {
  sheets += `<section class="sheet">\n${cells.slice(i, i + 20).join('\n')}\n</section>\n`;
}

fs.mkdirSync(path.join(ROOT, 'print'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'print', 'qr-only.html'), `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<title>QR 시트 (코드만)</title>
<style>
@import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css');
* { box-sizing: border-box; }
@page { size: A4; margin: 0; }
body { margin: 0; font-family: 'Pretendard Variable', Pretendard, sans-serif; }
.sheet {
  width: 210mm; height: 297mm;
  display: grid;
  grid-template-columns: repeat(4, 45mm);
  grid-auto-rows: 52mm;
  gap: 4mm;
  justify-content: center; align-content: center;
  background: #fff;
  page-break-after: always;
}
.q {
  margin: 0; text-align: center;
  border: 0.3mm dashed rgba(0,0,0,.35); /* 가위선 */
  border-radius: 2mm;
  padding: 2mm;
}
.q img { width: 38mm; height: 38mm; display: block; margin: 0 auto; }
.q figcaption { font-size: 3mm; font-weight: 700; margin-top: 1mm; }
</style>
</head>
<body>
${sheets}
</body>
</html>
`);
console.log(`✓ print/qr-only.html 생성 (QR ${plants.length}개)`);

// puppeteer 로 PDF 까지
try {
  const { default: puppeteer } = await import('puppeteer');
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.goto(pathToFileURL(path.join(ROOT, 'print', 'qr-only.html')).href, { waitUntil: 'networkidle0' });
  await page.pdf({ path: path.join(ROOT, 'print', 'qr-only.pdf'), format: 'A4', printBackground: true });
  await browser.close();
  console.log('✓ print/qr-only.pdf 생성 완료');
} catch {
  console.log('puppeteer 없음 — print/qr-only.html 을 브라우저에서 PDF로 저장하세요.');
}
