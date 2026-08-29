---
name: build-and-deploy
description: 빌드 → 링크 깨짐 검사 → QR 검증 → git push 로 GitHub Pages 배포까지 한 번에.
---

# build-and-deploy

1. `npm run build` 실행. QR 디코딩 검증이 빌드에 포함되어 있다 — 실패하면 여기서 중단하고 원인을 보고한다.
2. 링크 검사: `dist/` 안의 모든 `href`/`src` 가 실제 존재하는 파일이거나 유효한 절대 URL인지 확인한다. `dist/index.html` 의 각 식물 링크가 `dist/<슬러그>/index.html` 과 일치하는지 본다.
3. `shop.config.json` 의 `baseUrl` 이 예시 도메인(`example`)이면 push 전에 사용자에게 경고한다.
4. `git add -A` → 변경된 식물 이름 기준으로 커밋 → `git push` (main). 원격 저장소가 없으면 GitHub 저장소 연결 방법을 안내하고 중단한다.
5. push 후 GitHub Actions 배포가 자동으로 도는 것을 안내하고, 배포될 URL 목록을 보고한다.
