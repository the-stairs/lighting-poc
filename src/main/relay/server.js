"use strict";

const { WebSocketServer } = require("ws");
const { URL } = require("url");

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

function attachRelayHandlers(wss) {
  wss.on("connection", function (ws, req) {
    const room = getRoomFromReq(req);
    addToRoom(room, ws);

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

    ws.on("close", function () {
      removeFromRoom(ws);
    });
  });
}

function startRelayServer(options) {
  const host = options && options.host ? options.host : "127.0.0.1";
  const port = options && options.port ? options.port : 0;
  const wss = new WebSocketServer({ port, host });
  attachRelayHandlers(wss);

  return new Promise(function (resolve, reject) {
    wss.on("listening", function () {
      const address = wss.address();
      const actualPort =
        address && typeof address === "object" ? address.port : port;
      resolve({
        host,
        port: actualPort,
        close: function () {
          return new Promise(function (resolveClose) {
            for (const set of rooms.values()) {
              for (const peer of set) {
                if (peer.readyState === peer.OPEN) {
                  peer.close();
                }
              }
            }
            rooms.clear();
            wss.close(function () {
              resolveClose();
            });
          });
        },
      });
    });
    wss.on("error", reject);
  });
}

module.exports = {
  startRelayServer,
  DEFAULT_ROOM,
};
