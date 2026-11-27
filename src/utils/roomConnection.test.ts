import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveRoomSocketUrl, subscribeRoom } from './roomConnection';

test('static preview routes only its own room socket to the backend', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const host = 'say-it-static-preview-qnd0.onrender.com';
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { location: { hostname: host, host } } });
  try {
    assert.equal(resolveRoomSocketUrl('wss://' + host + '/ws?room=ABC&role=host&token=test'), 'wss://say-it-u1w6.onrender.com/ws?room=ABC&role=host&token=test');
    assert.equal(resolveRoomSocketUrl('wss://' + host + '/other'), 'wss://' + host + '/other');
    assert.equal(resolveRoomSocketUrl('wss://example.com/ws'), 'wss://example.com/ws');
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { location: { hostname: 'say-it-u1w6.onrender.com', host: 'say-it-u1w6.onrender.com' } } });
    assert.equal(resolveRoomSocketUrl('wss://say-it-u1w6.onrender.com/ws'), 'wss://say-it-u1w6.onrender.com/ws');
  } finally {
    if (original) Object.defineProperty(globalThis, 'window', original);
    else Reflect.deleteProperty(globalThis, 'window');
  }
});

test('room reconnect avoids duplicate sockets, ignores old events and stops after denial', () => {
  const saved = new Map(['window', 'navigator', 'WebSocket'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const network = { onLine: false };
  const host = Object.assign(new EventTarget(), { location: { hostname: 'example.org', host: 'example.org' } });
  class FakeSocket {
    static created: FakeSocket[] = [];
    onmessage?: (event: MessageEvent) => void;
    onclose?: (event: { code: number }) => void;
    constructor(_url: string) { FakeSocket.created.push(this); }
    close() { this.onclose?.({ code: 1000 }); }
  }
  let disconnect: (() => void) | undefined;
  const seen: string[] = [];
  try {
    Object.defineProperty(globalThis, 'window', { configurable: true, value: host });
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: network });
    Object.defineProperty(globalThis, 'WebSocket', { configurable: true, value: FakeSocket });
    disconnect = subscribeRoom('wss://example.org/ws', event => seen.push(event.data));
    assert.equal(FakeSocket.created.length, 0);
    network.onLine = true;
    host.dispatchEvent(new Event('online'));
    host.dispatchEvent(new Event('online'));
    assert.equal(FakeSocket.created.length, 1);
    const first = FakeSocket.created[0];
    first.onmessage?.({ data: 'first' } as MessageEvent);
    first.onclose?.({ code: 1006 });
    host.dispatchEvent(new Event('online'));
    assert.equal(FakeSocket.created.length, 2);
    const second = FakeSocket.created[1];
    first.onmessage?.({ data: 'obsolete' } as MessageEvent);
    second.onmessage?.({ data: 'new' } as MessageEvent);
    second.onclose?.({ code: 4003 });
    host.dispatchEvent(new Event('online'));
    assert.equal(FakeSocket.created.length, 2);
    assert.deepEqual(seen, ['first', 'new']);
    disconnect();
    second.onmessage?.({ data: 'after close' } as MessageEvent);
    assert.deepEqual(seen, ['first', 'new']);
  } finally {
    disconnect?.();
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
