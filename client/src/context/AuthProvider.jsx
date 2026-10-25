import { useCallback, useEffect, useMemo, useState } from 'react';
import * as authApi from '../api/auth.js';
import { getErrorMessage, setUnauthorizedHandler } from '../api/client.js';
import { AuthContext } from './authContext.js';

/**
 * status:
 *  - "loading":         checking for an existing session (page load / refresh)
 *  - "authenticated":   `user` is set
 *  - "unauthenticated": no valid session
 *  - "error":           the server couldn't be reached to check the session
 */
export function AuthProvider({ children }) {
  const [state, setState] = useState({ status: 'loading', user: null, error: null, notice: null });

  // The session lives in an HttpOnly cookie that JavaScript cannot read, so on every page load
  // we ask the server who we are. This is what keeps users logged in after a refresh.
  const restoreSession = useCallback(async () => {
    setState((previous) => ({ ...previous, status: 'loading', error: null }));
    try {
      const user = await authApi.getCurrentUser();
      setState({ status: 'authenticated', user, error: null, notice: null });
    } catch (error) {
      if (error.response?.status === 401) {
        setState({ status: 'unauthenticated', user: null, error: null, notice: null });
      } else {
        setState({ status: 'error', user: null, error: getErrorMessage(error), notice: null });
      }
    }
  }, []);

  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setState((previous) =>
        previous.status === 'authenticated'
          ? {
              status: 'unauthenticated',
              user: null,
              error: null,
              notice: 'Your session has ended. Please log in again.',
            }
          : previous,
      );
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  const login = useCallback(async (credentials) => {
    const user = await authApi.login(credentials);
    setState({ status: 'authenticated', user, error: null, notice: null });
    return user;
  }, []);

  const register = useCallback(async (details) => {
    const user = await authApi.register(details);
    setState({ status: 'authenticated', user, error: null, notice: null });
    return user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      // Even if the request fails, forget the user locally so the UI can't stay "logged in".
      setState({ status: 'unauthenticated', user: null, error: null, notice: null });
    }
  }, []);

  const value = useMemo(
    () => ({ ...state, login, register, logout, retry: restoreSession }),
    [state, login, register, logout, restoreSession],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}
