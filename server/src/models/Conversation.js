import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;

// Denormalised copy of the newest message so the sidebar can render previews
// without a second query per conversation.
const lastMessageSchema = new mongoose.Schema(
  {
    messageId: { type: ObjectId, ref: 'Message', required: true },
    sender: { type: ObjectId, ref: 'User', required: true },
    // Empty once the message is deleted for everyone.
    content: { type: String, default: '' },
    deleted: { type: Boolean, default: false },
    createdAt: { type: Date, required: true },
  },
  { _id: false },
);

// When a participant deletes the chat from their list. Messages up to `at` stay hidden from
// them; a newer message brings the conversation back with only the new history.
const clearedSchema = new mongoose.Schema(
  {
    user: { type: ObjectId, ref: 'User', required: true },
    at: { type: Date, required: true },
  },
  { _id: false },
);

const conversationSchema = new mongoose.Schema(
  {
    // Only "direct" (1:1) exists today; the field lets group chats be added later
    // without migrating existing documents.
    type: { type: String, enum: ['direct'], default: 'direct', required: true },
    participants: {
      type: [{ type: ObjectId, ref: 'User', required: true }],
      validate: {
        validator(participants) {
          return this.type !== 'direct' || participants.length === 2;
        },
        message: 'A direct conversation must have exactly two participants',
      },
    },
    // Sorted participant ids joined with ":". A unique index on it guarantees there is only
    // ever one direct conversation between the same two people, even if both click at once.
    directKey: {
      type: String,
      required() {
        return this.type === 'direct';
      },
    },
    lastMessage: { type: lastMessageSchema, default: null },
    // Used for sorting the sidebar; starts at creation time and moves with each new message.
    lastMessageAt: { type: Date, default: Date.now },
    clearedBy: { type: [clearedSchema], default: [] },
  },
  { timestamps: true },
);

conversationSchema.index(
  { directKey: 1 },
  { unique: true, partialFilterExpression: { directKey: { $type: 'string' } } },
);
// "All conversations I'm in, newest activity first" is the most frequent query.
// participants is an array, so this is a multikey index: one entry per participant.
conversationSchema.index({ participants: 1, lastMessageAt: -1 });

export function buildDirectKey(userIdA, userIdB) {
  return [String(userIdA), String(userIdB)].sort().join(':');
}

/** When the user last deleted this chat from their list, or null if they never did. */
export function getClearedAt(conversation, userId) {
  const entry = conversation.clearedBy?.find((cleared) => String(cleared.user) === String(userId));
  return entry?.at ?? null;
}

export const Conversation = mongoose.model('Conversation', conversationSchema);
