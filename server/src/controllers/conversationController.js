import {
  findOrCreateDirectConversation,
  getConversationForMember,
  listConversations,
} from '../services/conversationService.js';
import { listMessages } from '../services/messageService.js';
import { announceNewConversation } from '../socket/rooms.js';
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
  res.json({ conversation: toConversationDto(conversation) });
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
