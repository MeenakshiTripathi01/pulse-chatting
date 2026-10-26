import { useState } from 'react';
import { getErrorMessage } from '../../api/client.js';
import { useUserSearch } from '../../hooks/useUserSearch.js';
import { formatUserHandle } from '../../lib/format.js';
import { Alert } from '../ui/Alert.jsx';
import { Avatar } from '../ui/Avatar.jsx';
import { Button } from '../ui/Button.jsx';
import { Spinner } from '../ui/Spinner.jsx';
import { EmptyState } from './EmptyState.jsx';

export function PeopleList({ search, onStartConversation }) {
  const { status, users, error, retry } = useUserSearch(search);
  const [startingUserId, setStartingUserId] = useState(null);
  const [startError, setStartError] = useState(null);

  async function handleStart(user) {
    setStartingUserId(user.id);
    setStartError(null);
    try {
      await onStartConversation(user.id);
    } catch (err) {
      setStartError(getErrorMessage(err, `Couldn't start a conversation with ${user.name}.`));
      setStartingUserId(null);
    }
  }

  if (status === 'idle') {
    return (
      <EmptyState
        title="Find people by username"
        description="Type the start of someone's username, like @alice, to find them."
      />
    );
  }

  if (status === 'loading' && users.length === 0) {
    return (
      <div className="flex items-center justify-center gap-2 p-6 text-sm text-slate-600">
        <Spinner className="size-4" />
        <span role="status">Searching people…</span>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="p-3">
        <Alert
          action={
            <Button variant="secondary" className="px-3 py-1.5" onClick={retry}>
              Retry
            </Button>
          }
        >
          {error}
        </Alert>
      </div>
    );
  }

  if (users.length === 0) {
    return (
      <EmptyState
        title="No people found"
        description={`No username starts with "${search.trim().replace(/^@/, '')}". Check the spelling and try again.`}
      />
    );
  }

  return (
    <div className="p-2">
      {startError && (
        <div className="mb-2 px-1">
          <Alert>{startError}</Alert>
        </div>
      )}
      <ul className="space-y-0.5" aria-label="People">
        {users.map((user) => (
          <li key={user.id}>
            <button
              type="button"
              onClick={() => handleStart(user)}
              disabled={startingUserId !== null}
              aria-label={`Message ${user.name}`}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-slate-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-600 disabled:cursor-wait"
            >
              <Avatar name={user.name} seed={user.id} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-slate-900">{user.name}</span>
                <span className="block truncate text-sm text-slate-600">
                  {formatUserHandle(user)}
                </span>
              </span>
              {startingUserId === user.id ? (
                <Spinner
                  className="size-4 text-brand-600"
                  label={`Opening chat with ${user.name}`}
                />
              ) : (
                <span className="text-sm font-medium text-brand-700">Message</span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
