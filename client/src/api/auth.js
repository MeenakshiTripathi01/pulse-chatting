import { api } from './client.js';

// Auth endpoints handle 401s themselves (e.g. "wrong password"), so they opt out of the
// global "session ended" handler.
const authRequestConfig = { skipUnauthorizedHandler: true };

export async function register(details) {
  const { data } = await api.post('/auth/register', details, authRequestConfig);
  return data.user;
}

export async function login(credentials) {
  const { data } = await api.post('/auth/login', credentials, authRequestConfig);
  return data.user;
}

export async function logout() {
  await api.post('/auth/logout', null, authRequestConfig);
}

export async function getCurrentUser() {
  const { data } = await api.get('/auth/me', authRequestConfig);
  return data.user;
}
