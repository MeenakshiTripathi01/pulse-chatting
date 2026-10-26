import { User } from '../models/User.js';
import { toPublicUser } from '../utils/serializers.js';

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Finds other users whose username starts with the search text (a leading "@" is ignored).
 * Nobody is listed for an empty search, so the directory can't be browsed.
 */
export async function searchUsers({ currentUserId, search, limit }) {
  const prefix = search.replace(/^@/, '').toLowerCase();
  if (!prefix) return [];

  // Escaping turns user input like "a.*" into a literal match instead of a regex pattern.
  // Usernames are stored lowercase, so an anchored, case-sensitive regex can use the index.
  const users = await User.find({
    _id: { $ne: currentUserId },
    username: new RegExp(`^${escapeRegex(prefix)}`),
  })
    .sort({ username: 1 })
    .limit(limit)
    .lean();
  return users.map(toPublicUser);
}
