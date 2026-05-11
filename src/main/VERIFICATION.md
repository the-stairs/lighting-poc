# Electron 검증 체크리스트

## 개발 실행

1. `npm run dev`로 Vite(5173)와 Electron이 함께 기동되는지 확인합니다.
2. 컨트롤 창이 열리고, 연결된 모니터 수만큼 디스플레이 창이 생성되는지 확인합니다.
3. 컨트롤 편집이 선택한 `displayId`에만 반영되는지 확인합니다.
4. 디스플레이 창을 닫았다가 다시 열었을 때 `REQUEST_LIVE`로 상태가 복구되는지 확인합니다.
5. `MODE_CHANGE`, `SHOOT_TRIGGER`가 모든 디스플레이에 동기화되는지 확인합니다.

## 프로덕션 실행

1. `npm run build` 후 `npm run electron`으로 `dist/`(렌더러 빌드 산출물) 정적 서빙과 내장 릴레이가 동작하는지 확인합니다.
2. 셰이더(`shader.vert`, `shader.frag`)가 로드되고 WebGL 캔버스가 렌더링되는지 확인합니다.

## 패키징

1. `npm run dist:mac` / `npm run dist:win` / `npm run dist:linux`를 각 OS에서 실행합니다.
2. 산출물(`release/`)에서 앱을 실행해 컨트롤·디스플레이·동기화·종료 시 프로세스/포트 잔존이 없는지 확인합니다.
3. 모니터 해상도/DPI 변경 후 디스플레이 창 배치와 `windowResized` 동작을 확인합니다.
