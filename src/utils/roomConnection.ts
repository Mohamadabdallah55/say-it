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
  let attempts = 0;
  let timer: ReturnType<typeof setTimeout>;
  let socket: WebSocket;
  function connect() {
    socket = new WebSocket(resolveRoomSocketUrl(url));
    socket.onmessage = event => {
      if (!closed) { attempts = 0; receive(event); }
    };
    socket.onclose = event => {
      if (!closed && event.code !== 4003) {
        timer = setTimeout(connect, Math.min(500 * 2 ** attempts++, 8000));
      }
    };
  }
  connect();
  return () => { closed = true; clearTimeout(timer); socket.close(); };
}
