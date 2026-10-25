import { Server } from 'socket.io';
import { config } from '../config/env.js';
import { listConversationIdsForUser } from '../services/conversationService.js';
import { authenticateSocket } from './auth.js';
import { registerMessageHandlers } from './messageHandlers.js';
import { conversationRoom, userRoom } from './rooms.js';

export function createSocketServer(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: config.clientOrigins, credentials: true },
    // The CORS option above only covers HTTP long-polling. WebSocket upgrades are not subject
    // to CORS, so check the Origin header here too; otherwise any website could open an
    // authenticated socket using the visitor's cookie (cross-site WebSocket hijacking).
    allowRequest(req, callback) {
      const { origin } = req.headers;
      callback(null, !origin || config.clientOrigins.includes(origin));
    },
  });

  io.use(authenticateSocket);
  io.on('connection', (socket) => handleConnection(io, socket));

  return io;
}

async function handleConnection(io, socket) {
  const { user } = socket.data;

  registerMessageHandlers(io, socket);

  try {
    const conversationIds = await listConversationIdsForUser(user.id);
    socket.join([userRoom(user.id), ...conversationIds.map(conversationRoom)]);
    // Tells the client it is now subscribed to all its rooms, so it can safely refetch
    // anything it may have missed while disconnected.
    socket.emit('session:ready', { user });
  } catch (error) {
    console.error('[socket] Failed to join rooms:', error.message);
    socket.emit('session:error', { message: 'Could not load your conversations' });
    socket.disconnect(true);
  }
}
