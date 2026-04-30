/**
 * 내부 WebSocket 릴레이 클라이언트. VITE_SYNC_WS_URL / window.SYNC_WS_URL 과 함께 사용합니다.
 */
const WS_OPEN = 1;

function parseJsonMessage(raw) {
  try {
    const body = JSON.parse(raw);
    if (body && typeof body === "object") {
      return body;
    }
  } catch (_e) {
    /* ignore */
  }
  return null;
}

/**
 * @description 재연결 타이머를 계산합니다.
 * @param {number} attempt 재연결 시도 횟수
 * @returns {number} 재연결 타이머
 */
function nextBackoffMs(attempt) {
  const base = 800;
  const cap = 30_000;
  const ms = Math.min(cap, base * 2 ** attempt);
  return ms + Math.floor(ms * 0.1 * Math.random());
}

export function connectSyncRelay(options) {
  const { url, onSocketOpen, onPayload } = options;
  let ws = null; // WebSocket 인스턴스
  let reconnectTimer = null; // 재연결 타이머
  let closedByUser = false; // 사용자에 의해 닫힌 경우
  let attempt = 0; // 재연결 시도 횟수

  /**
   * @description 재연결 타이머를 초기화합니다.
   */
  function clearReconnect() {
    if (!reconnectTimer) {
      return;
    }
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  /**
   * @description 페이로드를 전송합니다.
   * @param {Object} payload
   */
  function sendPayload(payload) {
    if (!ws || ws.readyState !== WS_OPEN) {
      return;
    }
    ws.send(JSON.stringify(payload));
  }

  /**
   * @description 재연결을 예약합니다.
   */
  function scheduleReconnect() {
    if (closedByUser) {
      return;
    }
    clearReconnect();
    const delay = nextBackoffMs(attempt);
    attempt += 1;
    reconnectTimer = setTimeout(connect, delay);
  }

  /**
   * @description WebSocket이 열리면 호출됩니다.
   */
  function onOpenHandler() {
    attempt = 0;
    clearReconnect();
    if (typeof onSocketOpen === "function") {
      onSocketOpen(sendPayload);
    }
  }

  /**
   * @description 메시지를 수신합니다.
   * @param {Event} ev
   */
  function onMessageHandler(ev) {
    if (typeof ev.data !== "string") {
      return;
    }
    const body = parseJsonMessage(ev.data);
    if (!body) {
      return;
    }
    onPayload(sendPayload, body);
  }

  /**
   * @description WebSocket을 연결합니다.
   */
  function connect() {
    if (closedByUser) {
      return;
    }
    ws = new WebSocket(url);
    // 이벤트 리스너 등록
    ws.addEventListener("open", onOpenHandler);
    ws.addEventListener("message", onMessageHandler);
    ws.addEventListener("close", scheduleReconnect);
    ws.addEventListener("error", function () {});
  }

  connect();

  return {
    send: sendPayload,
    close: function () {
      closedByUser = true;
      clearReconnect();
      if (!ws) {
        return;
      }
      ws.close();
      ws = null;
    },
  };
}
