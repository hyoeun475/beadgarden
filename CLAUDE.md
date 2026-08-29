# 비즈가든 케어카드

비즈 화분 가게의 식물 안내 QR 서비스. `plants/*.md` 하나가 식물 하나 → 안내 페이지 + QR + 가격표 시트가 자동 생성된다.

## 절대 규칙
- `plants/*.md` 가 유일한 데이터 소스. `dist/` 는 빌드 산출물이므로 직접 수정 금지.
- **슬러그(frontmatter `slug`)는 한 번 정하면 절대 바꾸지 않는다** — QR이 이미 인쇄되어 화분에 붙어 있다.
- `shop.config.json` 의 `baseUrl` 변경 = 인쇄된 QR 전부 무효. 바꾸기 전 반드시 사용자에게 경고하고 확인받는다.
- 디자인 토큰은 `src/style.css` 상단의 8개 색 토큰만 사용. 토큰 밖 색 금지 (흰/검 하이라이트·그림자 계열만 예외). 상호명(Pick & Piece)은 `--brand-red` 로 표시.
- 글은 손님(식물 초보) 기준: 전문용어 금지, 다정한 존댓말, 한 문단 3줄 이내.
- 빌드는 생성된 QR을 자동 디코딩해 URL 일치를 검증한다. 검증 실패 시 배포 금지.
- 새 식물 추가 시 `pet_safe` 값이 없으면 추측하지 말고 반드시 사용자에게 묻는다 (반려동물 안전 — 오정보 시 위험).

## 명령
- `npm run build` — 전체 빌드 (페이지 + QR + 목록 + 가격표 HTML). QR 검증 포함.
- `npm run build -- <슬러그...>` — 가격표 시트를 지정한 식물만으로 생성 (페이지는 전체 빌드됨).
- `npm run pdf` — 빌드 후 `print/price-tags.pdf` 생성 (puppeteer 필요; 없으면 `print/price-tags.html` 을 브라우저에서 PDF로 저장).

## 구조
- `plants/` 식물 마크다운 (주인이 쓰는 곳, 파일명은 한글 이름)
- `templates/plant.html`, `templates/price-tag.html` 템플릿
- `src/build.js` 빌드 스크립트, `src/style.css` 디자인 토큰 + 스타일
- `dist/` GitHub Pages 배포 폴더 (`dist/<슬러그>/index.html`, `dist/qr/<슬러그>.png|.svg`)
- `print/price-tags.html|.pdf` A4 6분할(55×90mm) 가격표 시트
