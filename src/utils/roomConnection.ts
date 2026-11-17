// A new connection receives a full server snapshot, including any missed commands.
export function subscribeRoom(url: string, receive: (event: MessageEvent) => void) {
  let closed = false;
  let attempts = 0;
  let timer: ReturnType<typeof setTimeout>;
  let socket: WebSocket;
  function connect() {
    socket = new WebSocket(url);
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
