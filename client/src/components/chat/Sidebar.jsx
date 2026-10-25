import { useState } from 'react';
import { Avatar } from '../ui/Avatar.jsx';
import { Logo } from '../ui/Logo.jsx';
import { ConversationList } from './ConversationList.jsx';
import { PeopleList } from './PeopleList.jsx';

const TABS = [
  { id: 'chats', label: 'Chats' },
  { id: 'people', label: 'People' },
];

export function Sidebar({
  user,
  onLogout,
  conversations,
  activeConversationId,
  onRetryConversations,
  onStartConversation,
  className = '',
}) {
  const [tab, setTab] = useState('chats');
  const [search, setSearch] = useState('');
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    await onLogout();
  }

  async function handleStartConversation(participantId) {
    await onStartConversation(participantId);
    setTab('chats');
    setSearch('');
  }

  function handleTabKeyDown(event) {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    const next = tab === 'chats' ? 'people' : 'chats';
    setTab(next);
    document.getElementById(`tab-${next}`)?.focus();
  }

  return (
    <aside
      aria-label="Conversations and people"
      className={`min-h-0 flex-col border-r border-slate-200 bg-white ${className}`}
    >
      <header className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
        <Logo />
        <button
          type="button"
          onClick={handleLogout}
          disabled={loggingOut}
          className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-brand-600 disabled:text-slate-400"
        >
          {loggingOut ? 'Logging out…' : 'Log out'}
        </button>
      </header>

      <div className="flex items-center gap-3 px-4 py-3">
        <Avatar name={user.name} seed={user.id} size="sm" />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-slate-900">{user.name}</p>
          <p className="truncate text-xs text-slate-600">{user.email}</p>
        </div>
      </div>

      <div className="space-y-3 px-4 pb-3">
        <div role="tablist" aria-label="Sidebar sections" className="grid grid-cols-2 rounded-lg bg-slate-100 p-1">
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              id={`tab-${id}`}
              type="button"
              role="tab"
              aria-selected={tab === id}
              aria-controls={`panel-${id}`}
              tabIndex={tab === id ? 0 : -1}
              onClick={() => setTab(id)}
              onKeyDown={handleTabKeyDown}
              className={`rounded-md py-1.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-brand-600 ${
                tab === id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <label className="relative block">
          <span className="sr-only">{tab === 'chats' ? 'Search conversations' : 'Search people'}</span>
          <svg
            aria-hidden="true"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400"
          >
            <path
              fillRule="evenodd"
              d="M9 3.5a5.5 5.5 0 1 0 3.4 9.83l3.13 3.14a.75.75 0 1 0 1.06-1.06l-3.13-3.14A5.5 5.5 0 0 0 9 3.5ZM5 9a4 4 0 1 1 8 0 4 4 0 0 1-8 0Z"
              clipRule="evenodd"
            />
          </svg>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={tab === 'chats' ? 'Search conversations' : 'Search people by name or email'}
            className="block w-full rounded-lg border border-slate-300 bg-white py-2 pr-3 pl-9 text-sm placeholder:text-slate-500 focus:border-brand-500 focus:outline-2 focus:outline-brand-500"
          />
        </label>
      </div>

      <div
        id={`panel-${tab}`}
        role="tabpanel"
        aria-labelledby={`tab-${tab}`}
        className="min-h-0 flex-1 overflow-y-auto border-t border-slate-100"
      >
        {tab === 'chats' ? (
          <ConversationList
            conversations={conversations}
            currentUserId={user.id}
            activeConversationId={activeConversationId}
            search={search}
            onRetry={onRetryConversations}
            onFindPeople={() => setTab('people')}
          />
        ) : (
          <PeopleList search={search} onStartConversation={handleStartConversation} />
        )}
      </div>
    </aside>
  );
}
