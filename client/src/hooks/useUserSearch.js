import { useCallback, useEffect, useState } from 'react';
import { getErrorMessage } from '../api/client.js';
import { searchUsers } from '../api/users.js';

const DEBOUNCE_MS = 300;

/** Searches the user directory, waiting until typing pauses and cancelling stale requests. */
export function useUserSearch(search) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState({ key: null, users: [], error: null });

  const query = search.trim();
  const key = `${attempt}:${query}`;

  useEffect(() => {
    const controller = new AbortController();

    const timer = setTimeout(async () => {
      try {
        const users = await searchUsers(query, { signal: controller.signal });
        setResult({ key, users, error: null });
      } catch (error) {
        if (controller.signal.aborted) return;
        setResult({ key, users: [], error: getErrorMessage(error) });
      }
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [key, query]);

  const retry = useCallback(() => setAttempt((count) => count + 1), []);

  // The result is "loading" until a response for the current query has arrived.
  let status = 'success';
  if (result.key !== key) status = 'loading';
  else if (result.error) status = 'error';

  return { status, users: result.users, error: result.error, retry };
}
