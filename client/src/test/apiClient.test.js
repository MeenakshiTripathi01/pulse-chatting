import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let api;
let requests;
let csrfTokens;
let rejectNextPostWithCsrfError;

beforeEach(async () => {
  vi.resetModules();
  ({ api } = await import('../api/client.js'));
  requests = [];
  csrfTokens = ['token-1', 'token-2'];
  rejectNextPostWithCsrfError = false;

  // A fake network layer so we can observe exactly what the client sends.
  api.defaults.adapter = async (config) => {
    const request = {
      method: config.method,
      url: config.url,
      csrf: config.headers.get('X-CSRF-Token') ?? null,
      withCredentials: config.withCredentials,
    };
    requests.push(request);

    if (config.url === '/auth/csrf') {
      return { data: { csrfToken: csrfTokens.shift() }, status: 200, headers: {}, config };
    }
    if (config.method === 'post' && rejectNextPostWithCsrfError) {
      rejectNextPostWithCsrfError = false;
      const error = new Error('Request failed with status code 403');
      error.config = config;
      error.response = { status: 403, data: { error: { code: 'CSRF_INVALID' } } };
      throw error;
    }
    return { data: { ok: true }, status: 200, headers: {}, config };
  };
});

afterEach(() => vi.restoreAllMocks());

describe('api client', () => {
  it('sends credentials and no CSRF header on GET requests', async () => {
    await api.get('/users');
    expect(requests).toEqual([{ method: 'get', url: '/users', csrf: null, withCredentials: true }]);
  });

  it('fetches the CSRF token once and attaches it to state-changing requests', async () => {
    await Promise.all([api.post('/a'), api.post('/b')]);
    await api.post('/c');

    expect(requests.filter((request) => request.url === '/auth/csrf')).toHaveLength(1);
    expect(requests.filter((request) => request.method === 'post').map((r) => r.csrf)).toEqual([
      'token-1',
      'token-1',
      'token-1',
    ]);
  });

  it('refreshes a stale CSRF token and retries the request once', async () => {
    await api.post('/warm-up');
    rejectNextPostWithCsrfError = true;

    const response = await api.post('/conversations');

    expect(response.data).toEqual({ ok: true });
    const conversationAttempts = requests.filter((request) => request.url === '/conversations');
    expect(conversationAttempts.map((request) => request.csrf)).toEqual(['token-1', 'token-2']);
  });
});
