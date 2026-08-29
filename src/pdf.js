// print/price-tags.html → print/price-tags.pdf (puppeteer 필요)
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let puppeteer;
try {
  ({ default: puppeteer } = await import('puppeteer'));
} catch {
  console.error(
    'puppeteer 가 설치되어 있지 않습니다. 설치하려면:\n' +
    '  npm i -D puppeteer\n' +
    '그 전까지는 print/price-tags.html 을 브라우저에서 열고 "인쇄 → PDF로 저장"(여백 없음, 배경 그래픽 켜기)으로 만들 수 있어요.'
  );
  process.exit(1);
}

const browser = await puppeteer.launch();
const page = await browser.newPage();
await page.goto(pathToFileURL(path.join(ROOT, 'print', 'price-tags.html')).href, {
  waitUntil: 'networkidle0', // 웹폰트 로딩 대기
});
await page.pdf({
  path: path.join(ROOT, 'print', 'price-tags.pdf'),
  format: 'A4',
  printBackground: true,
});
await browser.close();
console.log('✓ print/price-tags.pdf 생성 완료');
