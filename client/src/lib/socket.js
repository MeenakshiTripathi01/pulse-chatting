import { io } from 'socket.io-client';
import { API_BASE_URL } from '../api/client.js';

// Connect to the API's origin when it is configured as an absolute URL; otherwise same origin.
const SOCKET_URL = /^https?:\/\//.test(API_BASE_URL) ? new URL(API_BASE_URL).origin : undefined;

export function createSocket() {
  return io(SOCKET_URL, {
    withCredentials: true, // send the HttpOnly session cookie during the handshake
    autoConnect: false,
    // Socket.IO reconnects automatically with exponential backoff (1s, 2s, 4s… capped at 5s).
    reconnectionDelayMax: 5000,
  });
}
