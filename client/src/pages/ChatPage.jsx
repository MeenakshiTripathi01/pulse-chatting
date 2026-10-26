import { useMatch, useNavigate } from 'react-router';
import { ChatPanel } from '../components/chat/ChatPanel.jsx';
import { ConnectionBanner } from '../components/chat/ConnectionBanner.jsx';
import { Sidebar } from '../components/chat/Sidebar.jsx';
import { useAuth } from '../context/authContext.js';
import { useSocket } from '../context/socketContext.js';
import { useChat } from '../hooks/useChat.js';
import { usePresence } from '../hooks/usePresence.js';
import { getOtherParticipant } from '../lib/format.js';

export default function ChatPage() {
  const { user, logout } = useAuth();
  const { connection } = useSocket();
  const navigate = useNavigate();
  const match = useMatch('/c/:conversationId');
  const conversationId = match?.params.conversationId ?? null;

  const chat = useChat(conversationId);
  const { presence, typingIn, startTyping, stopTyping } = usePresence(
    chat.conversations.items.map((conversation) => getOtherParticipant(conversation, user.id).id),
  );

  async function handleStartConversation(participantId) {
    const conversation = await chat.startConversation(participantId);
    navigate(`/c/${conversation.id}`);
  }

  // On small screens only one pane is visible: the list, or the open conversation.
  const showChatOnMobile = Boolean(conversationId);

  return (
    <div className="flex h-dvh flex-col">
      <ConnectionBanner connection={connection} />
      <div className="flex min-h-0 flex-1">
        <Sidebar
          user={user}
          onLogout={logout}
          conversations={chat.conversations}
          activeConversationId={conversationId}
          presence={connection === 'connected' ? presence : {}}
          typingIn={connection === 'connected' ? typingIn : {}}
          onRetryConversations={chat.reloadConversations}
          onStartConversation={handleStartConversation}
          className={`${showChatOnMobile ? 'hidden' : 'flex'} w-full md:flex md:w-80 lg:w-96`}
        />
        <ChatPanel
          conversationId={conversationId}
          conversation={chat.activeConversation}
          thread={chat.activeThread}
          currentUserId={user.id}
          connection={connection}
          presence={presence}
          typingIn={typingIn}
          onSend={(content) => chat.sendMessage(conversationId, content)}
          onTyping={() => startTyping(conversationId)}
          onStopTyping={stopTyping}
          onRetryMessage={chat.retryMessage}
          onLoadOlder={() => chat.loadOlderMessages(conversationId)}
          onReloadThread={() => chat.reloadThread(conversationId)}
          className={`${showChatOnMobile ? 'flex' : 'hidden'} min-w-0 flex-1 md:flex`}
        />
      </div>
    </div>
  );
}
