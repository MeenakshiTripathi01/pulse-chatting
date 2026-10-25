import { api } from './client.js';

export async function searchUsers(search, { signal } = {}) {
  const { data } = await api.get('/users', { params: { search: search || undefined }, signal });
  return data.users;
}
