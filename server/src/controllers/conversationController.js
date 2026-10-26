import {
  clearConversationForUser,
  findOrCreateDirectConversation,
  getConversationForMember,
  listConversations,
} from '../services/conversationService.js';
import { deleteMessage, listMessages } from '../services/messageService.js';
import { announceNewConversation, conversationRoom, userRoom } from '../socket/rooms.js';
import { toConversationDto } from '../utils/serializers.js';

export async function getConversations(req, res) {
  const conversations = await listConversations(req.user._id);
  res.json({ conversations });
}

export async function createConversation(req, res) {
  const { conversation, created } = await findOrCreateDirectConversation(
    req.user._id,
    req.valid.body.participantId,
  );

  const io = req.app.get('io');
  if (created && io) announceNewConversation(io, conversation);

  res.status(created ? 201 : 200).json({ conversation });
}

export async function getConversation(req, res) {
  const conversation = await getConversationForMember(
    req.valid.params.conversationId,
    req.user._id,
  );
  res.json({ conversation: toConversationDto(conversation, req.user._id) });
}

/** Deletes the chat from the current user's list only (their other tabs are told too). */
export async function deleteConversation(req, res) {
  const { conversationId } = req.valid.params;
  await clearConversationForUser(conversationId, req.user._id);

  req.app
    .get('io')
    ?.to(userRoom(String(req.user._id)))
    .emit('conversation:deleted', { conversationId });

  res.status(204).end();
}

export async function getMessages(req, res) {
  const { before, limit } = req.valid.query;
  const result = await listMessages({
    conversationId: req.valid.params.conversationId,
    userId: req.user._id,
    before,
    limit,
  });
  res.json(result);
}

/** Deletes one of the user's own messages for everyone in the conversation. */
export async function deleteConversationMessage(req, res) {
  const { conversationId, messageId } = req.valid.params;
  const message = await deleteMessage({ conversationId, messageId, userId: req.user._id });

  req.app.get('io')?.to(conversationRoom(conversationId)).emit('message:deleted', { message });

  res.json({ message });
}
