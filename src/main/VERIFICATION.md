# Electron 검증 체크리스트

## 개발 실행

1. `npm run dev`로 렌더러 빌드 후 Electron이 기동되는지 확인합니다.
2. 컨트롤 창이 열리고, 연결된 모니터 수만큼 디스플레이 창이 생성되는지 확인합니다.
3. 컨트롤 편집이 선택한 `displayId`에만 반영되는지 확인합니다.
4. 디스플레이 창을 닫았다가 다시 열었을 때 `REQUEST_LIVE`로 상태가 복구되는지 확인합니다.
5. `MODE_CHANGE`, `SHOOT_TRIGGER`가 모든 디스플레이에 동기화되는지 확인합니다.
6. `npm run start` / `npm run dev`에서는 `app.isPackaged`가 false이므로 자동 업데이트가 실행되지 않는지 확인합니다.

## 프로덕션 실행

1. `npm run build` 후 `npm run start`로 `dist/`(렌더러 빌드 산출물) 정적 서빙과 내장 릴레이가 동작하는지 확인합니다.
2. 셰이더(`shader.vert`, `shader.frag`)가 로드되고 WebGL 캔버스가 렌더링되는지 확인합니다.

## 패키징

1. `npm run dist:mac` / `npm run dist:win` / `npm run dist:linux`를 각 OS에서 실행합니다 (`--publish never`, 로컬 `release/`만 생성).
2. 산출물(`release/`)에서 앱을 실행해 컨트롤·디스플레이·동기화·종료 시 프로세스/포트 잔존이 없는지 확인합니다.
3. 모니터 해상도/DPI 변경 후 디스플레이 창 배치와 `windowResized` 동작을 확인합니다.

## GitHub Release / 자동 업데이트

1. `package.json`의 `version`을 올린 뒤 `git tag vX.Y.Z`를 만들고 태그를 push합니다 (`v` 접두 + semver 본문 일치).
2. GitHub Actions `Release` 워크플로가 macOS / Windows / Linux job을 완료하고, Release에 OS별 설치 파일과 `latest*.yml` 메타데이터가 올라가는지 확인합니다.
3. 이전 버전 패키징 앱을 실행해 업데이트 감지·다운로드·재시작 설치(`quitAndInstall`)가 동작하는지 확인합니다.
4. Linux는 AppImage를 자동 업데이트 1차 대상으로 보고, `deb`는 수동 설치용으로 취급합니다. Windows `portable`은 updater 비대상입니다.

## 미서명 MVP 한계

1. macOS / Windows 미서명 빌드는 Gatekeeper·SmartScreen 경고가 날 수 있습니다.
2. macOS 공증·Windows Authenticode는 후속 CI 시크릿(`CSC_*`, notarize) 작업이 필요합니다.
3. private 저장소이거나 cross-repo 배포가 필요하면 `GH_TOKEN` PAT 시크릿 연동을 검토합니다.
