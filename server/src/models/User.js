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
    // `select: false` means queries never return the hash unless explicitly requested.
    passwordHash: { type: String, required: true, select: false },
  },
  { timestamps: true },
);

// Supports the alphabetical user directory listing.
userSchema.index({ name: 1 });

export const User = mongoose.model('User', userSchema);
