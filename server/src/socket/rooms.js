// Room names are built only on the server from database ids; clients never choose a room.

export const userRoom = (userId) => `user:${userId}`;
export const conversationRoom = (conversationId) => `conversation:${conversationId}`;

/**
 * Called after a conversation is created over REST: subscribes every connected socket of each
 * participant to the new room and tells their sidebars about it.
 */
export function announceNewConversation(io, conversation) {
  const participantRooms = conversation.participants.map((participant) => userRoom(participant.id));

  io.in(participantRooms).socketsJoin(conversationRoom(conversation.id));
  io.to(participantRooms).emit('conversation:new', { conversation });
}
