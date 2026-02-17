// nzbdav2 WebSocket client — subscribes to HistoryItemAdded events for instant completion detection
const WebSocket = require('ws');

const NZBDAV_WS_API_KEY = (process.env.NZBDAV_WS_API_KEY || '').trim();
const LOG_PREFIX = '[NZBDAV-WS]';

let ws = null;
let connected = false;
let authenticated = false;
let reconnectTimer = null;
let reconnectDelay = 1000;
const MAX_RECONNECT_DELAY = 30000;

// Map<nzoId, {resolve, reject, timer}>
const waiters = new Map();

function getWsUrl() {
  const httpUrl = (process.env.NZBDAV_URL || '').trim();
  if (!httpUrl) return null;
  return httpUrl.replace(/^http/i, 'ws').replace(/\/+$/, '') + '/ws';
}

function isConnected() {
  return connected && authenticated;
}

function isConfigured() {
  return Boolean(NZBDAV_WS_API_KEY) && Boolean(getWsUrl());
}

function handleMessage(raw) {
  let outer;
  try {
    outer = JSON.parse(raw);
  } catch {
    return;
  }

  if (outer.Topic !== 'ha') return;

  let slot;
  try {
    slot = typeof outer.Message === 'string' ? JSON.parse(outer.Message) : outer.Message;
  } catch {
    return;
  }

  const nzoId = slot?.nzo_id || slot?.nzoId || slot?.NzoId;
  if (!nzoId) return;

  const status = (slot.status || slot.Status || '').toString().toLowerCase();
  console.log(`${LOG_PREFIX} HistoryItemAdded: nzoId=${nzoId} status=${status}`);

  const waiter = waiters.get(nzoId);
  if (!waiter) return;

  clearTimeout(waiter.timer);
  waiters.delete(nzoId);

  if (status === 'completed') {
    waiter.resolve(slot);
  } else if (status === 'failed') {
    const failMessage = slot.fail_message || slot.failMessage || slot.FailMessage || 'Unknown NZBDav error';
    const err = new Error(`[NZBDAV] NZB failed: ${failMessage}`);
    err.isNzbdavFailure = true;
    err.failureMessage = failMessage;
    err.nzoId = nzoId;
    waiter.reject(err);
  }
  // Other statuses (e.g. extracting) — ignore, keep waiting via polling
}

function connect() {
  const url = getWsUrl();
  if (!url || !NZBDAV_WS_API_KEY) return;

  cleanup();

  console.log(`${LOG_PREFIX} Connecting to ${url}`);
  ws = new WebSocket(url);

  ws.on('open', () => {
    connected = true;
    reconnectDelay = 1000;
    console.log(`${LOG_PREFIX} Connected`);
    // Authenticate by sending the API key as the first message
    ws.send(NZBDAV_WS_API_KEY);
  });

  ws.on('message', (data) => {
    const msg = data.toString();

    // nzbdav2 sends no explicit auth confirmation — after accepting the key it
    // immediately streams current-state topics. The first message we receive
    // therefore proves authentication succeeded.
    if (!authenticated) {
      authenticated = true;
      console.log(`${LOG_PREFIX} Authenticated (received first state message)`);
    }

    handleMessage(msg);
  });

  ws.on('close', (code, reason) => {
    const wasAuthenticated = authenticated;
    connected = false;
    authenticated = false;
    ws = null;

    if (wasAuthenticated) {
      console.log(`${LOG_PREFIX} Disconnected (code=${code})`);
    }

    scheduleReconnect();
  });

  ws.on('error', (err) => {
    console.error(`${LOG_PREFIX} Error: ${err.message}`);
    // 'close' event will fire after this, triggering reconnect
  });
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  console.log(`${LOG_PREFIX} Reconnecting in ${reconnectDelay}ms`);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, reconnectDelay);
  reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY);
}

function cleanup() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (ws) {
    try { ws.removeAllListeners(); ws.close(); } catch {}
    ws = null;
  }
  connected = false;
  authenticated = false;
}

/**
 * Wait for a HistoryItemAdded WebSocket event for the given nzoId.
 * Returns a Promise that resolves with the history slot data, or rejects on failure/timeout.
 */
function waitForHistoryEvent(nzoId, timeoutMs = 80000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      waiters.delete(nzoId);
      reject(new Error(`${LOG_PREFIX} Timeout waiting for WS event for ${nzoId}`));
    }, timeoutMs);

    waiters.set(nzoId, { resolve, reject, timer });
  });
}

/**
 * Cancel a pending waiter (used when polling wins the race).
 */
function cancelWaiter(nzoId) {
  const waiter = waiters.get(nzoId);
  if (waiter) {
    clearTimeout(waiter.timer);
    waiters.delete(nzoId);
  }
}

function init() {
  if (!isConfigured()) {
    console.log(`${LOG_PREFIX} Not configured (NZBDAV_WS_API_KEY not set), WebSocket disabled`);
    return;
  }
  connect();
}

module.exports = {
  init,
  isConnected,
  isConfigured,
  waitForHistoryEvent,
  cancelWaiter,
};
