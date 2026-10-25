import { useEffect, useMemo, useState } from 'react';
import { createSocket } from '../lib/socket.js';
import { useAuth } from './authContext.js';
import { SocketContext } from './socketContext.js';

/**
 * Owns the single Socket.IO connection for the logged-in user. It is mounted only inside
 * the protected area, so logging out unmounts it and closes the connection.
 *
 * connection: "connecting" | "connected" | "reconnecting" | "offline"
 * readyCount: increments every time the server confirms the socket joined its rooms
 *             (first connect and every reconnect). Consumers refetch data when it changes,
 *             which fills any gap of messages missed while disconnected.
 */
export function SocketProvider({ children }) {
  const { expireSession } = useAuth();
  const [socket] = useState(createSocket);
  const [connection, setConnection] = useState('connecting');
  const [readyCount, setReadyCount] = useState(0);

  useEffect(() => {
    const handleReady = () => {
      setConnection('connected');
      setReadyCount((count) => count + 1);
    };

    const handleDisconnect = (reason) => {
      if (reason === 'io client disconnect') return;
      setConnection(navigator.onLine === false ? 'offline' : 'reconnecting');
      // The server closed the socket on purpose (e.g. session expired). Socket.IO does not
      // retry in that case; try once more so an expired session surfaces as an auth error.
      if (reason === 'io server disconnect') socket.connect();
    };

    const handleConnectError = (error) => {
      if (error.data?.code === 'UNAUTHENTICATED') {
        expireSession();
        return;
      }
      setConnection(navigator.onLine === false ? 'offline' : 'reconnecting');
    };

    const handleOffline = () => setConnection('offline');
    const handleOnline = () => {
      setConnection((current) => (current === 'connected' ? current : 'reconnecting'));
      if (!socket.connected) socket.connect();
    };

    socket.on('session:ready', handleReady);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect_error', handleConnectError);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    socket.connect();

    return () => {
      socket.off('session:ready', handleReady);
      socket.off('disconnect', handleDisconnect);
      socket.off('connect_error', handleConnectError);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
      socket.disconnect();
    };
  }, [socket, expireSession]);

  const value = useMemo(
    () => ({ socket, connection, readyCount }),
    [socket, connection, readyCount],
  );

  return <SocketContext value={value}>{children}</SocketContext>;
}
