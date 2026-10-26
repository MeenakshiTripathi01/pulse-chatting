import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as authApi from '../api/auth.js';
import * as conversationsApi from '../api/conversations.js';
import * as usersApi from '../api/users.js';
import { createSocket } from '../lib/socket.js';
import { FakeSocket } from './fakeSocket.js';
import { apiError, renderApp } from './utils.jsx';

vi.mock('../api/auth.js', () => ({
  getCurrentUser: vi.fn(),
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
}));
vi.mock('../api/conversations.js', () => ({
  listConversations: vi.fn(),
  getConversation: vi.fn(),
  createConversation: vi.fn(),
  listMessages: vi.fn(),
  deleteConversation: vi.fn(),
  deleteMessage: vi.fn(),
}));
vi.mock('../api/users.js', () => ({ searchUsers: vi.fn() }));
vi.mock('../lib/socket.js', () => ({ createSocket: vi.fn() }));

const ada = { id: 'u-ada', name: 'Ada Lovelace', email: 'ada@example.com' };
const bob = { id: 'u-bob', name: 'Bob Builder', email: 'bob@example.com' };
const carol = {
  id: 'u-carol',
  name: 'Carol Danvers',
  username: 'carol',
  email: 'carol@example.com',
};

const now = Date.now();
const iso = (minutesAgo) => new Date(now - minutesAgo * 60_000).toISOString();

function message(id, senderId, content, minutesAgo, extra = {}) {
  return {
    id,
    conversationId: 'conv-1',
    senderId,
    content,
    clientMessageId: null,
    createdAt: iso(minutesAgo),
    ...extra,
  };
}

const conversationWithBob = {
  id: 'conv-1',
  type: 'direct',
  participants: [ada, bob],
  lastMessage: { id: 'm2', senderId: bob.id, content: 'See you soon', createdAt: iso(5) },
  lastMessageAt: iso(5),
  createdAt: iso(60),
};

let socket;

beforeEach(() => {
  vi.clearAllMocks();
  socket = new FakeSocket();
  createSocket.mockReturnValue(socket);
  authApi.getCurrentUser.mockResolvedValue(ada);
  conversationsApi.listConversations.mockResolvedValue([conversationWithBob]);
  conversationsApi.listMessages.mockResolvedValue({
    messages: [message('m1', ada.id, 'Hello Bob', 10), message('m2', bob.id, 'See you soon', 5)],
    hasMore: false,
    nextCursor: null,
  });
  usersApi.searchUsers.mockResolvedValue([carol]);
});

function deferred() {
  let resolve;
  const promise = new Promise((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

async function openConversationWithBob() {
  renderApp('/c/conv-1');
  await screen.findByRole('heading', { name: 'Bob Builder' });
  await screen.findByText('Hello Bob', { selector: 'ol *' });
  await socket.becomeReady();
}

const messageLog = () => screen.getByRole('log', { name: 'Messages' });
const sidebarList = () => screen.getByRole('list', { name: 'Conversations' });

describe('conversation list', () => {
  it('shows conversations with the latest message preview', async () => {
    renderApp('/');

    const list = await screen.findByRole('list', { name: 'Conversations' });
    expect(within(list).getByText('Bob Builder')).toBeInTheDocument();
    expect(within(list).getByText('See you soon')).toBeInTheDocument();
    expect(screen.getByText('Select a conversation')).toBeInTheDocument();
  });

  it('shows an empty state that leads to the people search', async () => {
    conversationsApi.listConversations.mockResolvedValue([]);
    renderApp('/');

    await userEvent.click(await screen.findByRole('button', { name: 'Find people' }));
    expect(screen.getByText('Find people by username')).toBeInTheDocument();

    await userEvent.type(screen.getByRole('searchbox'), '@car');
    expect(
      await screen.findByRole('button', { name: 'Message Carol Danvers' }),
    ).toBeInTheDocument();
    expect(usersApi.searchUsers).toHaveBeenLastCalledWith('car', expect.anything());
  });

  it('shows an error with a working retry', async () => {
    conversationsApi.listConversations
      .mockRejectedValueOnce(
        apiError(500, { message: 'Something went wrong. Please try again later.' }),
      )
      .mockResolvedValueOnce([conversationWithBob]);
    renderApp('/');

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong');
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('list', { name: 'Conversations' })).toBeInTheDocument();
  });

  it('filters conversations by search text', async () => {
    renderApp('/');
    await screen.findByRole('list', { name: 'Conversations' });

    await userEvent.type(screen.getByRole('searchbox'), 'zzz');
    expect(screen.getByText('No matching conversations')).toBeInTheDocument();

    await userEvent.clear(screen.getByRole('searchbox'));
    await userEvent.type(screen.getByRole('searchbox'), 'bob');
    expect(within(sidebarList()).getByText('Bob Builder')).toBeInTheDocument();
  });
});

describe('conversation view', () => {
  it('loads history with distinct outgoing and incoming messages', async () => {
    await openConversationWithBob();

    const log = messageLog();
    expect(within(log).getByText('Hello Bob').closest('li')).toHaveClass('justify-end');
    expect(within(log).getByText('See you soon', { selector: 'div' }).closest('li')).toHaveClass(
      'justify-start',
    );
    expect(conversationsApi.listMessages).toHaveBeenCalledWith('conv-1');
  });

  it('loads older messages on request', async () => {
    conversationsApi.listMessages
      .mockResolvedValueOnce({
        messages: [message('m2', bob.id, 'See you soon', 5)],
        hasMore: true,
        nextCursor: 'm2',
      })
      .mockResolvedValueOnce({
        messages: [message('m0', bob.id, 'An older message', 30)],
        hasMore: false,
        nextCursor: null,
      });
    renderApp('/c/conv-1');

    await userEvent.click(await screen.findByRole('button', { name: 'Load older messages' }));

    expect(await within(messageLog()).findByText('An older message')).toBeInTheDocument();
    expect(conversationsApi.listMessages).toHaveBeenLastCalledWith('conv-1', { before: 'm2' });
    expect(screen.queryByRole('button', { name: 'Load older messages' })).not.toBeInTheDocument();
  });

  it('shows a not-found state for conversations the user cannot access', async () => {
    conversationsApi.listMessages.mockRejectedValue(
      apiError(404, { code: 'CONVERSATION_NOT_FOUND', message: 'Conversation not found' }),
    );
    conversationsApi.getConversation.mockRejectedValue(apiError(404));
    renderApp('/c/someone-elses');

    expect(await screen.findByText('Conversation not found')).toBeInTheDocument();
  });
});

describe('sending messages', () => {
  it('sends on Enter, shows a sending indicator, then the confirmed message', async () => {
    const ack = deferred();
    socket.emitWithAck.mockReturnValue(ack.promise);
    await openConversationWithBob();

    const input = screen.getByRole('textbox', { name: 'Message Bob Builder' });
    await userEvent.type(input, '  Are you free today?  {Enter}');

    expect(input).toHaveValue('');
    expect(socket.emitWithAck).toHaveBeenCalledWith('message:send', {
      conversationId: 'conv-1',
      content: 'Are you free today?',
      clientMessageId: expect.any(String),
    });
    expect(within(messageLog()).getByText('Sending…')).toBeInTheDocument();

    const { clientMessageId } = socket.emitWithAck.mock.calls[0][1];
    ack.resolve({
      ok: true,
      message: message('m3', ada.id, 'Are you free today?', 0, { clientMessageId }),
    });

    await waitFor(() =>
      expect(within(messageLog()).queryByText('Sending…')).not.toBeInTheDocument(),
    );
    expect(within(messageLog()).getAllByText('Are you free today?')).toHaveLength(1);
    expect(within(sidebarList()).getByText('You: Are you free today?')).toBeInTheDocument();
  });

  it('does not send empty messages, and Shift+Enter inserts a new line', async () => {
    await openConversationWithBob();
    const input = screen.getByRole('textbox', { name: 'Message Bob Builder' });

    await userEvent.type(input, '   {Enter}');
    expect(socket.emitWithAck).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled();

    await userEvent.clear(input);
    await userEvent.type(input, 'line one{Shift>}{Enter}{/Shift}line two');
    expect(input).toHaveValue('line one\nline two');
    expect(socket.emitWithAck).not.toHaveBeenCalled();
  });

  it('marks a failed send and retries it with the same clientMessageId', async () => {
    socket.emitWithAck
      .mockResolvedValueOnce({
        ok: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Your message could not be sent. Please try again.',
        },
      })
      .mockImplementationOnce(async (_event, payload) => ({
        ok: true,
        message: message('m9', ada.id, 'Retry me', 0, { clientMessageId: payload.clientMessageId }),
      }));
    await openConversationWithBob();

    await userEvent.type(
      screen.getByRole('textbox', { name: 'Message Bob Builder' }),
      'Retry me{Enter}',
    );
    expect(await within(messageLog()).findByText(/Not sent\./)).toBeInTheDocument();

    await userEvent.click(within(messageLog()).getByRole('button', { name: 'Retry' }));

    await waitFor(() =>
      expect(within(messageLog()).queryByText(/Not sent\./)).not.toBeInTheDocument(),
    );
    const [first, second] = socket.emitWithAck.mock.calls.map(([, payload]) => payload);
    expect(second.clientMessageId).toBe(first.clientMessageId);
    expect(within(messageLog()).getAllByText('Retry me')).toHaveLength(1);
  });

  it('treats a missing acknowledgement as a failure', async () => {
    socket.emitWithAck.mockRejectedValue(new Error('operation has timed out'));
    await openConversationWithBob();

    await userEvent.type(
      screen.getByRole('textbox', { name: 'Message Bob Builder' }),
      'Hello?{Enter}',
    );

    expect(await within(messageLog()).findByText(/did not respond in time/)).toBeInTheDocument();
  });
});

describe('real-time updates', () => {
  it('shows incoming messages live, updates the preview, and ignores duplicate events', async () => {
    await openConversationWithBob();
    const incoming = message('m10', bob.id, 'Breaking news!', 0);

    await socket.serverEmit('message:new', { message: incoming });
    await socket.serverEmit('message:new', { message: incoming });

    expect(within(messageLog()).getAllByText('Breaking news!')).toHaveLength(1);
    expect(within(sidebarList()).getByText('Breaking news!')).toBeInTheDocument();
  });

  it('adds a conversation started by someone else to the sidebar', async () => {
    renderApp('/');
    await screen.findByRole('list', { name: 'Conversations' });
    await socket.becomeReady();

    await socket.serverEmit('conversation:new', {
      conversation: {
        id: 'conv-2',
        type: 'direct',
        participants: [carol, ada],
        lastMessage: null,
        lastMessageAt: iso(0),
        createdAt: iso(0),
      },
    });

    expect(within(sidebarList()).getByText('Carol Danvers')).toBeInTheDocument();
  });

  it('starts a new conversation from the people directory', async () => {
    conversationsApi.createConversation.mockResolvedValue({
      id: 'conv-2',
      type: 'direct',
      participants: [ada, carol],
      lastMessage: null,
      lastMessageAt: iso(0),
      createdAt: iso(0),
    });
    conversationsApi.listMessages.mockResolvedValue({
      messages: [],
      hasMore: false,
      nextCursor: null,
    });
    renderApp('/');

    await userEvent.click(await screen.findByRole('tab', { name: 'People' }));
    await userEvent.type(screen.getByRole('searchbox'), 'carol');
    await userEvent.click(await screen.findByRole('button', { name: 'Message Carol Danvers' }));

    expect(conversationsApi.createConversation).toHaveBeenCalledWith(carol.id);
    expect(await screen.findByRole('heading', { name: 'Carol Danvers' })).toBeInTheDocument();
    const chatPanel = screen.getByRole('region', { name: 'Chat with Carol Danvers' });
    expect(await within(chatPanel).findByText('No messages yet')).toBeInTheDocument();
  });
});

describe('connection state', () => {
  it('shows the real connection state and disables sending while disconnected', async () => {
    await openConversationWithBob();
    expect(screen.queryByText(/Reconnecting/)).not.toBeInTheDocument();

    await socket.dropConnection();

    expect(screen.getByText('Connection lost. Reconnecting…')).toBeInTheDocument();
    await userEvent.type(screen.getByRole('textbox', { name: 'Message Bob Builder' }), 'Hi');
    expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled();

    await socket.becomeReady();
    expect(screen.queryByText('Connection lost. Reconnecting…')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send message' })).toBeEnabled();
  });

  it('refetches conversations and the open thread after reconnecting', async () => {
    await openConversationWithBob();
    const callsBefore = conversationsApi.listMessages.mock.calls.length;
    conversationsApi.listMessages.mockResolvedValue({
      messages: [
        message('m1', ada.id, 'Hello Bob', 10),
        message('m2', bob.id, 'See you soon', 5),
        message('m11', bob.id, 'Sent while you were away', 1),
      ],
      hasMore: false,
      nextCursor: null,
    });

    await socket.dropConnection();
    await socket.becomeReady();

    expect(await within(messageLog()).findByText('Sent while you were away')).toBeInTheDocument();
    expect(conversationsApi.listMessages.mock.calls.length).toBeGreaterThan(callsBefore);
  });

  it('returns to login when the socket reports the session is no longer valid', async () => {
    await openConversationWithBob();

    await socket.serverEmit('connect_error', { data: { code: 'UNAUTHENTICATED' } });

    expect(await screen.findByRole('heading', { name: 'Welcome to Pulse' })).toBeInTheDocument();
    expect(screen.getByText('Your session has ended. Please log in again.')).toBeInTheDocument();
  });
});

describe('emojis', () => {
  it('inserts emojis from the picker at the cursor and sends them', async () => {
    socket.emitWithAck.mockReturnValue(deferred().promise);
    await openConversationWithBob();
    const input = screen.getByRole('textbox', { name: 'Message Bob Builder' });

    await userEvent.type(input, 'Great job');
    await userEvent.click(screen.getByRole('button', { name: 'Add emoji' }));
    const picker = screen.getByRole('dialog', { name: 'Emoji picker' });
    await userEvent.click(within(picker).getByRole('button', { name: 'thumbs up' }));
    await userEvent.click(within(picker).getByRole('button', { name: 'party popper' }));
    expect(input).toHaveValue('Great job👍🎉');

    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Emoji picker' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Send message' }));
    expect(socket.emitWithAck).toHaveBeenCalledWith('message:send', {
      conversationId: 'conv-1',
      content: 'Great job👍🎉',
      clientMessageId: expect.any(String),
    });
  });
});

describe('people search', () => {
  it('does not list anyone until a username is typed', async () => {
    renderApp('/');
    await userEvent.click(await screen.findByRole('tab', { name: 'People' }));

    expect(screen.getByText('Find people by username')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'People' })).not.toBeInTheDocument();
    expect(usersApi.searchUsers).not.toHaveBeenCalled();
  });

  it('explains when no username matches', async () => {
    usersApi.searchUsers.mockResolvedValue([]);
    renderApp('/');
    await userEvent.click(await screen.findByRole('tab', { name: 'People' }));

    await userEvent.type(screen.getByRole('searchbox'), 'zed');
    expect(await screen.findByText('No people found')).toBeInTheDocument();
    expect(screen.getByText(/No username starts with "zed"/)).toBeInTheDocument();
  });
});

/** Drags an element to the right by `distance` pixels with a mouse or finger. */
function swipeRight(element, distance = 100) {
  const at = (clientX) => ({ pointerId: 1, button: 0, clientX, clientY: 20 });
  fireEvent.pointerDown(element, at(10));
  fireEvent.pointerMove(element, at(10 + distance / 2));
  fireEvent.pointerMove(element, at(10 + distance));
  fireEvent.pointerUp(element, at(10 + distance));
}

const bubble = (text) => within(messageLog()).getByText(text, { selector: 'div' });

describe('replies', () => {
  it('replies to a message swiped to the right and shows the quote', async () => {
    socket.emitWithAck.mockReturnValue(deferred().promise);
    await openConversationWithBob();

    swipeRight(bubble('See you soon'));
    const input = screen.getByRole('textbox', { name: 'Message Bob Builder' });
    expect(input).toHaveFocus();
    expect(screen.getByText('Replying to Bob Builder')).toBeInTheDocument();

    await userEvent.type(input, 'Me too!{Enter}');

    expect(socket.emitWithAck).toHaveBeenCalledWith('message:send', {
      conversationId: 'conv-1',
      content: 'Me too!',
      clientMessageId: expect.any(String),
      replyToId: 'm2',
    });
    expect(screen.queryByText('Replying to Bob Builder')).not.toBeInTheDocument();
    const sent = within(messageLog()).getByText('Me too!', { selector: 'div' });
    expect(within(sent).getByText('Bob Builder')).toBeInTheDocument();
    expect(within(sent).getByText('See you soon')).toBeInTheDocument();
  });

  it('ignores short swipes and swipes to the left', async () => {
    await openConversationWithBob();

    swipeRight(bubble('See you soon'), 30);
    swipeRight(bubble('See you soon'), -100);

    expect(screen.queryByText(/^Replying to/)).not.toBeInTheDocument();
  });

  it('does not open the delete option when my own message is swiped', async () => {
    await openConversationWithBob();

    swipeRight(bubble('Hello Bob'));
    fireEvent.click(bubble('Hello Bob'));

    expect(screen.getByText('Replying to yourself')).toBeInTheDocument();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('starts a reply with the right arrow key and can cancel with the button or Escape', async () => {
    await openConversationWithBob();

    bubble('Hello Bob').focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByText('Replying to yourself')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel reply' }));
    expect(screen.queryByText('Replying to yourself')).not.toBeInTheDocument();

    swipeRight(bubble('Hello Bob'));
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByText('Replying to yourself')).not.toBeInTheDocument();
  });
});

describe('deleting', () => {
  it('deletes my own message for everyone after confirming', async () => {
    conversationsApi.deleteMessage.mockResolvedValue(
      message('m1', ada.id, '', 10, { deleted: true }),
    );
    await openConversationWithBob();

    await userEvent.click(bubble('See you soon'));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    await userEvent.click(bubble('Hello Bob'));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Delete message' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Delete message?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete for everyone' }));

    expect(conversationsApi.deleteMessage).toHaveBeenCalledWith('conv-1', 'm1');
    expect(await within(messageLog()).findByText('This message was deleted')).toBeInTheDocument();
    expect(within(messageLog()).queryByText('Hello Bob')).not.toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('keeps the message and shows the error when deleting fails', async () => {
    conversationsApi.deleteMessage.mockRejectedValue(
      apiError(403, { message: 'You can only delete your own messages' }),
    );
    await openConversationWithBob();

    await userEvent.click(bubble('Hello Bob'));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Delete message' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete for everyone' }));

    const dialog = await screen.findByRole('alertdialog');
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'You can only delete your own messages',
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(within(messageLog()).getByText('Hello Bob')).toBeInTheDocument();
  });

  it('shows messages deleted by the other person in real time', async () => {
    await openConversationWithBob();

    await socket.serverEmit('message:deleted', {
      message: message('m2', bob.id, '', 5, { deleted: true }),
    });

    expect(within(messageLog()).getByText('This message was deleted')).toBeInTheDocument();
    expect(within(sidebarList()).getByText('This message was deleted')).toBeInTheDocument();
    expect(screen.queryByText('See you soon')).not.toBeInTheDocument();
  });

  it('deletes the chat from my list after confirming', async () => {
    conversationsApi.deleteConversation.mockResolvedValue();
    await openConversationWithBob();

    await userEvent.click(screen.getByRole('button', { name: 'Delete chat' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Delete this chat?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete chat' }));

    expect(conversationsApi.deleteConversation).toHaveBeenCalledWith('conv-1');
    expect(await screen.findByText('Select a conversation')).toBeInTheDocument();
    expect(screen.getByText('No conversations yet')).toBeInTheDocument();
    expect(conversationsApi.getConversation).not.toHaveBeenCalled();
  });

  it('removes a chat deleted in another tab', async () => {
    await openConversationWithBob();

    await socket.serverEmit('conversation:deleted', { conversationId: 'conv-1' });

    expect(await screen.findByText('Select a conversation')).toBeInTheDocument();
    expect(screen.getByText('No conversations yet')).toBeInTheDocument();
  });
});

describe('presence and typing', () => {
  const chatHeader = () => screen.getByRole('heading', { name: 'Bob Builder' }).closest('header');

  it("asks for chat partners' status and shows online, then last seen", async () => {
    await openConversationWithBob();
    expect(socket.emit).toHaveBeenCalledWith('presence:get', { userIds: [bob.id] });

    await socket.serverEmit('presence:snapshot', {
      presence: { [bob.id]: { online: true, lastSeenAt: null } },
    });
    expect(within(chatHeader()).getByText('Online')).toBeInTheDocument();
    expect(within(sidebarList()).getByText('(online)')).toBeInTheDocument();

    await socket.serverEmit('presence:update', {
      userId: bob.id,
      online: false,
      lastSeenAt: new Date().toISOString(),
    });
    expect(within(chatHeader()).getByText(/^last seen today at/)).toBeInTheDocument();
    expect(within(sidebarList()).queryByText('(online)')).not.toBeInTheDocument();
  });

  it('shows when the other person is typing until their message arrives', async () => {
    await openConversationWithBob();

    await socket.serverEmit('typing', { conversationId: 'conv-1', userId: bob.id, isTyping: true });
    expect(within(chatHeader()).getByText('typing…')).toBeInTheDocument();
    expect(within(sidebarList()).getByText('typing…')).toBeInTheDocument();

    await socket.serverEmit('message:new', { message: message('m9', bob.id, 'Done!', 0) });
    expect(screen.queryByText('typing…')).not.toBeInTheDocument();
  });

  it('ignores typing echoes of our own typing', async () => {
    await openConversationWithBob();
    await socket.serverEmit('typing', { conversationId: 'conv-1', userId: ada.id, isTyping: true });
    expect(screen.queryByText('typing…')).not.toBeInTheDocument();
  });

  it('announces our typing, and stops when the message box is cleared', async () => {
    await openConversationWithBob();
    const input = screen.getByRole('textbox', { name: 'Message Bob Builder' });

    await userEvent.type(input, 'Hel');
    const typingEvents = () => socket.emit.mock.calls.filter(([event]) => event === 'typing');
    expect(typingEvents()).toEqual([['typing', { conversationId: 'conv-1', isTyping: true }]]);

    await userEvent.clear(input);
    expect(typingEvents().at(-1)).toEqual([
      'typing',
      { conversationId: 'conv-1', isTyping: false },
    ]);
  });
});
