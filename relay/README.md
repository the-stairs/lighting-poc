# WebSocket 릴레이

프론트 앱이 `VITE_SYNC_WS_URL`(또는 `window.SYNC_WS_URL`)로 접속하는 내부 동기화 허브입니다.

## 실행

루트에서:

```bash
npm install
npm run relay
```

기본 포트는 `8787`입니다. `RELAY_PORT` 환경 변수로 변경할 수 있습니다.

## 클라이언트 URL

`ws://<릴레이호스트>:8787/?room=poc-light-sync` — `room`은 컨트롤·디스플레이가 동일해야 같은 세션으로 묶입니다.

개발 시 루트 `.env.development`에 예: `VITE_SYNC_WS_URL=ws://127.0.0.1:8787` (room 쿼리는 앱이 채널명에 맞춰 자동 추가)

Vite `server.proxy`로 `/__lighting_sync` → `ws://127.0.0.1:8787` 가 설정되어 있으므로, 릴레이를 8787에서 띄운 뒤 `VITE_SYNC_WS_URL=ws://localhost:5173/__lighting_sync` 로 같은 오리진 WebSocket을 쓸 수 있습니다.
