"use strict";

const { startRelayServer } = require("./relay/server");

const DEFAULT_PORT = 8787;

async function startEmbeddedRelay(options) {
  const host = options && options.host ? options.host : "127.0.0.1";
  const preferredPort =
    options && options.port ? options.port : DEFAULT_PORT;

  try {
  const relay = await startRelayServer({ host, port: preferredPort });
  return relay;
  } catch (_err) {
    return startRelayServer({ host, port: 0 });
  }
}

function getRelayWsUrl(relay) {
  return `ws://${relay.host}:${relay.port}`;
}

module.exports = {
  startEmbeddedRelay,
  getRelayWsUrl,
};
