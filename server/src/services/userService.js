import { User } from '../models/User.js';
import { toPublicUser } from '../utils/serializers.js';

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Lists other registered users, optionally filtered by a name/email substring. */
export async function searchUsers({ currentUserId, search, limit }) {
  const filter = { _id: { $ne: currentUserId } };

  if (search) {
    // Escaping turns user input like "a.*" into a literal match instead of a regex pattern.
    const pattern = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ name: pattern }, { email: pattern }];
  }

  const users = await User.find(filter).sort({ name: 1, _id: 1 }).limit(limit).lean();
  return users.map(toPublicUser);
}
