import { act } from '@testing-library/react';
import { vi } from 'vitest';

/** Minimal stand-in for a socket.io-client Socket that tests can drive from the "server" side. */
export class FakeSocket {
  constructor() {
    this.handlers = new Map();
    this.connected = false;
    this.emit = vi.fn();
    this.emitWithAck = vi.fn();
    this.io = { on: vi.fn(), off: vi.fn() };
  }

  on(event, handler) {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event).add(handler);
    return this;
  }

  off(event, handler) {
    this.handlers.get(event)?.delete(handler);
    return this;
  }

  removeAllListeners() {
    this.handlers.clear();
    return this;
  }

  timeout() {
    return this;
  }

  connect() {
    return this;
  }

  disconnect() {
    this.connected = false;
    return this;
  }

  /** Simulates an event pushed by the server. */
  async serverEmit(event, ...args) {
    await act(async () => {
      for (const handler of [...(this.handlers.get(event) ?? [])]) handler(...args);
    });
  }

  /** Simulates a successful connection where the server has joined us to our rooms. */
  async becomeReady() {
    this.connected = true;
    await this.serverEmit('session:ready', {});
  }

  async dropConnection(reason = 'transport close') {
    this.connected = false;
    await this.serverEmit('disconnect', reason);
  }
}
