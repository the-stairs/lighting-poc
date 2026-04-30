/**
 * 내부망 WebSocket 릴레이: 같은 room에 연결된 모든 클라이언트에게 JSON 텍스트를 브로드캐스트합니다.
 * 실행: RELAY_PORT=8787 npm run relay (또는 node relay/index.js)
 * 클라이언트는 ws://호스트:포트/?room=poc-light-sync 와 같이 room 쿼리로 연결합니다.
 */
"use strict";

const { WebSocketServer } = require("ws");
const { URL } = require("url");

const PORT = Number(process.env.RELAY_PORT) || 8787;
const MAX_PAYLOAD_BYTES = 512 * 1024;
const DEFAULT_ROOM = "poc-light-sync";

/** @type {Map<string, Set<import('ws').WebSocket>>} */
const rooms = new Map();

function getRoomFromReq(req) {
  try {
    const base = `http://127.0.0.1${req.url || "/"}`;
    const u = new URL(base);
    const r = u.searchParams.get("room");
    if (r && r.trim()) {
      return r.trim().slice(0, 128);
    }
  } catch (_) {
    /* ignore */
  }
  return DEFAULT_ROOM;
}

function addToRoom(room, ws) {
  if (!rooms.has(room)) {
    rooms.set(room, new Set());
  }
  rooms.get(room).add(ws);
  ws._relayRoom = room;
}

function removeFromRoom(ws) {
  const room = ws._relayRoom;
  if (!room || !rooms.has(room)) {
    return;
  }
  const set = rooms.get(room);
  set.delete(ws);
  if (set.size === 0) {
    rooms.delete(room);
  }
}

function broadcastRoom(room, text) {
  const set = rooms.get(room);
  if (!set) {
    return;
  }
  for (const peer of set) {
    if (peer.readyState === peer.OPEN) {
      peer.send(text);
    }
  }
}

const wss = new WebSocketServer({ port: PORT, host: "0.0.0.0" }); // 모든 네트워크 인터페이스에서 수신

wss.on("connection", function (ws, req) {
  // 연결 요청이 들어오면 방 정보를 추출하여 방에 추가
  const room = getRoomFromReq(req);
  addToRoom(room, ws);

  // 메시지를 수신하면 방에 있는 모든 피어에게 브로드캐스트
  ws.on("message", function (data, isBinary) {
    if (isBinary) {
      return;
    }
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
    if (buf.length > MAX_PAYLOAD_BYTES) {
      return;
    }
    const text = buf.toString("utf8");
    broadcastRoom(ws._relayRoom, text);
  });

  // 연결이 끊어지면 방에서 제거
  ws.on("close", function () {
    removeFromRoom(ws);
  });
});

// eslint-disable-next-line no-console
console.log(
  "[relay] listening ws://0.0.0.0:" +
    PORT +
    "/ (query ?room=..., default " +
    DEFAULT_ROOM +
    ")",
);
