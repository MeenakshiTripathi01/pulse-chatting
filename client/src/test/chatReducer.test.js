import { describe, expect, it } from 'vitest';
import { chatReducer, initialChatState, mergeMessages } from '../state/chatReducer.js';

const msg = (id, createdAt, extra = {}) => ({
  id,
  conversationId: 'c1',
  senderId: 'u1',
  content: `content ${id}`,
  clientMessageId: null,
  createdAt,
  ...extra,
});

const pending = (clientMessageId) => ({
  id: `pending-${clientMessageId}`,
  clientMessageId,
  conversationId: 'c1',
  senderId: 'u1',
  content: 'pending',
  createdAt: '2026-01-01T00:00:09.000Z',
  status: 'sending',
});

function stateWithThread(messages, conversations = []) {
  return {
    ...initialChatState,
    conversations: { status: 'success', error: null, items: conversations },
    threads: {
      c1: {
        status: 'success',
        error: null,
        notFound: false,
        messages,
        hasMore: false,
        nextCursor: null,
        olderStatus: 'idle',
        olderError: null,
        stale: false,
      },
    },
  };
}

describe('mergeMessages', () => {
  it('keeps one copy of a message received twice and sorts chronologically', () => {
    const a = msg('a', '2026-01-01T00:00:01.000Z');
    const b = msg('b', '2026-01-01T00:00:02.000Z');

    const merged = mergeMessages([b], [a, b]);

    expect(merged.map((m) => m.id)).toEqual(['a', 'b']);
  });

  it('replaces an optimistic message once the server copy arrives', () => {
    const confirmed = msg('real', '2026-01-01T00:00:05.000Z', { clientMessageId: 'cid-1' });

    const merged = mergeMessages([pending('cid-1'), pending('cid-2')], [confirmed]);

    expect(merged.map((m) => m.id)).toEqual(['real', 'pending-cid-2']);
    expect(merged[0].status).toBe('sent');
  });
});

describe('chatReducer', () => {
  it('handles the ack and broadcast for the same message in either order', () => {
    const confirmed = msg('real', '2026-01-01T00:00:05.000Z', { clientMessageId: 'cid-1' });
    const start = stateWithThread([pending('cid-1')]);

    for (const order of [
      ['message/confirmed', 'message/received'],
      ['message/received', 'message/confirmed'],
    ]) {
      const end = order.reduce(
        (state, type) => chatReducer(state, { type, message: confirmed }),
        start,
      );
      expect(end.threads.c1.messages.map((m) => m.id)).toEqual(['real']);
    }
  });

  it('ignores a late failure for a message that was already confirmed', () => {
    const confirmed = msg('real', '2026-01-01T00:00:05.000Z', { clientMessageId: 'cid-1' });
    let state = stateWithThread([pending('cid-1')]);
    state = chatReducer(state, { type: 'message/received', message: confirmed });
    state = chatReducer(state, {
      type: 'message/failed',
      conversationId: 'c1',
      clientMessageId: 'cid-1',
      error: 'timeout',
    });

    expect(state.threads.c1.messages).toEqual([expect.objectContaining({ id: 'real', status: 'sent' })]);
  });

  it('moves the conversation with the newest message to the top and updates its preview', () => {
    const older = { id: 'c1', lastMessage: null, lastMessageAt: '2026-01-01T00:00:00.000Z' };
    const newer = { id: 'c2', lastMessage: null, lastMessageAt: '2026-01-02T00:00:00.000Z' };
    const state = stateWithThread([], [newer, older]);

    const next = chatReducer(state, {
      type: 'message/received',
      message: msg('m1', '2026-01-03T00:00:00.000Z'),
    });

    expect(next.conversations.items.map((c) => c.id)).toEqual(['c1', 'c2']);
    expect(next.conversations.items[0].lastMessage.content).toBe('content m1');
  });

  it('does not let an older message overwrite a newer preview', () => {
    const conversation = {
      id: 'c1',
      lastMessage: { id: 'new', content: 'newest', createdAt: '2026-01-05T00:00:00.000Z' },
      lastMessageAt: '2026-01-05T00:00:00.000Z',
    };
    const state = stateWithThread([], [conversation]);

    const next = chatReducer(state, {
      type: 'message/received',
      message: msg('old', '2026-01-01T00:00:00.000Z'),
    });

    expect(next.conversations.items[0].lastMessage.content).toBe('newest');
  });

  it('does not create message lists for conversations that were never opened', () => {
    const next = chatReducer(
      { ...initialChatState, conversations: { status: 'success', error: null, items: [] } },
      { type: 'message/received', message: msg('m1', '2026-01-01T00:00:00.000Z') },
    );
    expect(next.threads).toEqual({});
  });

  it('starts over after a resync that does not overlap with the messages we have', () => {
    const state = stateWithThread([msg('a', '2026-01-01T00:00:01.000Z'), pending('cid-1')]);

    const next = chatReducer(state, {
      type: 'thread/loaded',
      conversationId: 'c1',
      mode: 'resync',
      page: {
        messages: [msg('y', '2026-01-02T00:00:01.000Z'), msg('z', '2026-01-02T00:00:02.000Z')],
        hasMore: true,
        nextCursor: 'y',
      },
    });

    expect(next.threads.c1.messages.map((m) => m.id)).toEqual(['y', 'z', 'pending-cid-1']);
    expect(next.threads.c1.nextCursor).toBe('y');
  });
});
