import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveRoomSocketUrl } from './roomConnection';

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
