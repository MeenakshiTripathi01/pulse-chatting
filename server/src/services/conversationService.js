import { buildDirectKey, Conversation, getClearedAt } from '../models/Conversation.js';
import { User } from '../models/User.js';
import { AppError } from '../utils/AppError.js';
import { toConversationDto } from '../utils/serializers.js';

const PARTICIPANT_FIELDS = 'name username email';

/** Lists the user's conversations, leaving out chats they deleted that have no newer messages. */
export async function listConversations(userId) {
  const conversations = await Conversation.find({ participants: userId })
    .sort({ lastMessageAt: -1 })
    .populate('participants', PARTICIPANT_FIELDS)
    .lean();

  return conversations
    .filter((conversation) => {
      const clearedAt = getClearedAt(conversation, userId);
      return !clearedAt || conversation.lastMessageAt > clearedAt;
    })
    .map((conversation) => toConversationDto(conversation, userId));
}

/**
 * The single authorization check for conversations, used by REST and Socket.IO alike.
 * Non-members get the same 404 as for a conversation that doesn't exist, so the API
 * never reveals which conversation ids are real.
 */
export async function getConversationForMember(conversationId, userId) {
  const conversation = await Conversation.findOne({ _id: conversationId, participants: userId })
    .populate('participants', PARTICIPANT_FIELDS)
    .lean();

  if (!conversation) {
    throw AppError.notFound('Conversation not found', 'CONVERSATION_NOT_FOUND');
  }
  return conversation;
}

export async function assertConversationMember(conversationId, userId) {
  const isMember = await Conversation.exists({ _id: conversationId, participants: userId });
  if (!isMember) {
    throw AppError.notFound('Conversation not found', 'CONVERSATION_NOT_FOUND');
  }
}

/** Returns the existing 1:1 conversation between two users, or creates it. */
export async function findOrCreateDirectConversation(currentUserId, participantId) {
  if (String(currentUserId) === String(participantId)) {
    throw AppError.badRequest(
      'You cannot start a conversation with yourself',
      'INVALID_PARTICIPANT',
    );
  }
  if (!(await User.exists({ _id: participantId }))) {
    throw AppError.notFound('User not found', 'USER_NOT_FOUND');
  }

  const directKey = buildDirectKey(currentUserId, participantId);
  let conversation = await Conversation.findOne({ directKey });
  let created = false;

  if (!conversation) {
    try {
      conversation = await Conversation.create({
        type: 'direct',
        participants: [currentUserId, participantId],
        directKey,
      });
      created = true;
    } catch (error) {
      // Both users clicked "start chat" at the same moment: the unique index rejected the
      // second insert, so load the conversation the other request just created.
      if (error.code !== 11000) throw error;
      conversation = await Conversation.findOne({ directKey });
    }
  }

  await conversation.populate('participants', PARTICIPANT_FIELDS);
  return { conversation: toConversationDto(conversation, currentUserId), created };
}

/**
 * "Delete chat" for one participant: hides the conversation and its history from them only.
 * The other participant keeps everything, and new messages bring the chat back.
 */
export async function clearConversationForUser(conversationId, userId) {
  await assertConversationMember(conversationId, userId);
  const at = new Date();

  const updated = await Conversation.updateOne(
    { _id: conversationId, 'clearedBy.user': userId },
    { $set: { 'clearedBy.$.at': at } },
  );
  if (updated.matchedCount === 0) {
    await Conversation.updateOne(
      { _id: conversationId, 'clearedBy.user': { $ne: userId } },
      { $push: { clearedBy: { user: userId, at } } },
    );
  }
}

export async function listConversationIdsForUser(userId) {
  const conversations = await Conversation.find({ participants: userId }).select('_id').lean();
  return conversations.map((conversation) => String(conversation._id));
}

/** Ids of everyone the user shares a conversation with (excluding the user). */
export async function listConversationPartnerIds(userId) {
  const conversations = await Conversation.find({ participants: userId })
    .select('participants')
    .lean();
  const partnerIds = new Set(
    conversations.flatMap((conversation) => conversation.participants.map(String)),
  );
  partnerIds.delete(String(userId));
  return partnerIds;
}
