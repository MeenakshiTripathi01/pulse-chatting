import { searchUsers } from '../services/userService.js';

export async function listUsers(req, res) {
  const { search, limit } = req.valid.query;
  const users = await searchUsers({ currentUserId: req.user._id, search, limit });
  res.json({ users });
}
