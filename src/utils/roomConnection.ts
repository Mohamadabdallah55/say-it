// Static Render hosting serves the UI, but room sockets belong to the game server.
// Restrict the override to our exact preview origin and same-origin room sockets.
export function resolveRoomSocketUrl(url: string): string {
  if (typeof window === 'undefined' || window.location.hostname !== 'say-it-static-preview-qnd0.onrender.com') return url;
  const target = new URL(url);
  if (target.protocol === 'wss:' && target.host === window.location.host && target.pathname === '/ws') {
    target.host = 'say-it-u1w6.onrender.com';
    return target.toString();
  }
  return url;
}

// A new connection receives a full server snapshot, including any missed commands.
export function subscribeRoom(url: string, receive: (event: MessageEvent) => void) {
  let closed = false;
  let denied = false;
  let attempts = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let socket: WebSocket | undefined;
  const clearRetry = () => { clearTimeout(timer); timer = undefined; };
  const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;
  function schedule() {
    if (closed || denied || isOffline() || timer !== undefined) return;
    const delay = Math.min(500 * 2 ** Math.min(attempts++, 4), 8000);
    // Small jitter avoids reconnecting all audience screens at the same instant.
    timer = setTimeout(() => { timer = undefined; connect(); }, delay + Math.random() * 250);
  }
  function connect() {
    if (closed || denied || isOffline() || socket) return;
    clearRetry();
    let current: WebSocket;
    try {
      current = new WebSocket(resolveRoomSocketUrl(url));
    } catch {
      schedule();
      return;
    }
    socket = current;
    current.onmessage = event => {
      if (!closed && socket === current) { attempts = 0; receive(event); }
    };
    current.onclose = event => {
      if (socket !== current) return;
      socket = undefined;
      if (event.code === 4003) denied = true;
      schedule();
    };
  }
  const online = () => {
    if (closed || denied || socket) return;
    attempts = 0;
    clearRetry();
    connect();
  };
  const offline = () => clearRetry();
  if (typeof window !== 'undefined') {
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
  }
  connect();
  return () => {
    closed = true;
    clearRetry();
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
    }
    const current = socket;
    socket = undefined;
    current?.close();
  };
}
