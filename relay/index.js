/**
 * 내부망 WebSocket 릴레이: 같은 room에 연결된 모든 클라이언트에게 JSON 텍스트를 브로드캐스트합니다.
 * 실행: RELAY_PORT=8787 npm run relay (또는 node relay/index.js)
 * 클라이언트는 ws://호스트:포트/?room=poc-light-sync 와 같이 room 쿼리로 연결합니다.
 */
"use strict";

const { startRelayServer } = require("./server");

const PORT = Number(process.env.RELAY_PORT) || 8787;

startRelayServer({ host: "0.0.0.0", port: PORT })
  .then(function (relay) {
    // eslint-disable-next-line no-console
    console.log(
      "[relay] listening ws://" +
        relay.host +
        ":" +
        relay.port +
        "/ (query ?room=..., default poc-light-sync)",
    );
  })
  .catch(function (err) {
    // eslint-disable-next-line no-console
    console.error("[relay] failed to start", err);
    process.exit(1);
  });
