import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 50 },
    // Stored lowercase + trimmed so "Ann@Mail.com " and "ann@mail.com" are the same account.
    // `unique` creates a unique index: the database itself rejects duplicates, even under races.
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 254,
      unique: true,
    },
    // Optional so accounts created before usernames existed stay valid.
    username: { type: String, trim: true, lowercase: true, minlength: 3, maxlength: 20 },
    // `select: false` means queries never return the hash unless explicitly requested.
    passwordHash: { type: String, required: true, select: false },
    // Set when the user's last open socket disconnects; shown as "last seen" to chat partners.
    lastSeenAt: { type: Date },
  },
  { timestamps: true },
);

// Supports the alphabetical user directory listing.
userSchema.index({ name: 1 });
// Unique only among users that have one; older accounts without a username don't collide.
userSchema.index(
  { username: 1 },
  { unique: true, partialFilterExpression: { username: { $type: 'string' } } },
);

export const User = mongoose.model('User', userSchema);
