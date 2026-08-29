# 🫧 비즈가든 케어카드

식물 이름과 관리법을 마크다운 한 장에 적으면 → 안내 웹페이지 + QR + 인쇄용 가격표가 자동으로 만들어집니다.

## 사장님이 하는 일 (이게 전부예요)

1. `plants/` 폴더에 식물 파일 하나 만들기 — `plants/몬스테라.md` 를 복사해서 내용만 바꾸면 됩니다.
   - 또는 Claude Code에 **"스투키 추가해줘, 15000원, 물은 한 달에 한 번"** 이라고 말하면 됩니다.
2. `npm run build` (또는 Claude Code에 "빌드해줘")
3. `print/price-tags.html` 을 브라우저로 열어 인쇄 (또는 `npm run pdf` 로 PDF 생성) → 코팅 → 화분에 부착

## 명령어

| 명령 | 하는 일 |
|---|---|
| `npm install` | 처음 한 번만 |
| `npm run build` | 페이지 + QR + 가격표 생성 (QR 검증 포함) |
| `npm run build -- monstera stuckyi` | 가격표 시트를 지정 식물만으로 |
| `npm run pdf` | 가격표 PDF 생성 (`npm i -D puppeteer` 필요) |
| `npm run preview` | 로컬에서 미리보기 (http://localhost:3000) |

## 사진 바꾸기

`plants/photos/슬러그.jpg` 파일을 덮어쓰고 빌드하면 끝. 휴대폰 사진 그대로 넣어도 자동으로 줄여줍니다.
지금 들어 있는 사진은 위키미디어 무료 사진(placeholder)이라, 실제 상품 사진으로 바꾸는 걸 추천해요.
바꾼 뒤에는 `plants/photos/credits.json` 에서 그 식물 항목을 지워주세요 (출처 표기가 사라집니다).

## ⚠️ 인쇄 전에 꼭

- `shop.config.json` 의 `baseUrl` 을 **실제 도메인으로 확정**하세요. 지금은 예시값입니다.
  QR에는 URL이 그대로 들어가므로, 도메인을 나중에 바꾸면 **인쇄한 QR을 전부 폐기**해야 합니다.
- 커스텀 도메인을 쓰면 `shop.config.json` 의 `customDomain` 에도 적으세요 (빌드 시 `dist/CNAME` 자동 생성).
- 코팅 후 어두운 조명에서 QR 스캔을 다시 테스트하세요.

## 배포 (GitHub Pages, 무료)

1. GitHub에 저장소 만들고 이 폴더를 push (`main` 브랜치)
2. 저장소 Settings → Pages → Source 를 **GitHub Actions** 로 설정
3. 이후엔 push할 때마다 자동 배포 (`.github/workflows/deploy.yml`)
