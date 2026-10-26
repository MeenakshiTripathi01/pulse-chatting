import http from 'node:http';
import { io as connectClient } from 'socket.io-client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { connectTestDatabase, disconnectTestDatabase } from './helpers/db.js';

// Simulate a Render deployment. These must be set before the app modules are imported,
// because configuration is read once at import time.
const PUBLIC_ORIGIN = 'https://pulse-chat.onrender.com';
vi.stubEnv('NODE_ENV', 'production');
vi.stubEnv('RENDER_EXTERNAL_URL', PUBLIC_ORIGIN);
vi.stubEnv('CLIENT_ORIGIN', '');
vi.stubEnv('TRUST_PROXY', '1');
vi.stubEnv('AUTH_RATE_LIMIT_MAX', '3');

let app;
let io;
let httpServer;
let baseUrl;

beforeAll(async () => {
  await connectTestDatabase();
  const { createApp } = await import('../src/app.js');
  const { createSocketServer } = await import('../src/socket/index.js');
  app = createApp();
  httpServer = http.createServer(app);
  io = createSocketServer(httpServer);
  await new Promise((resolve) => httpServer.listen(0, resolve));
  baseUrl = `http://localhost:${httpServer.address().port}`;
});

afterAll(async () => {
  io.close();
  await new Promise((resolve) => httpServer.close(resolve));
  await disconnectTestDatabase();
  vi.unstubAllEnvs();
});

const cookiePair = (setCookie) => setCookie.split(';')[0];

/**
 * Secure cookies are not replayed by supertest over plain http, so this helper manages the
 * Cookie header by hand, the way a browser would over https.
 */
async function browserSession(ip = '203.0.113.10') {
  const csrf = await request(app).get('/api/auth/csrf').set('X-Forwarded-For', ip);
  const cookies = new Map([['csrf', cookiePair(csrf.headers['set-cookie'][0])]]);
  const send = (method, url, body) =>
    request(app)
      [method](url)
      .set('X-Forwarded-For', ip)
      .set('Origin', PUBLIC_ORIGIN)
      .set('X-CSRF-Token', csrf.body.csrfToken)
      .set('Cookie', [...cookies.values()].join('; '))
      .send(body);

  return {
    post: async (url, body) => {
      const res = await send('post', url, body);
      const auth = (res.headers['set-cookie'] ?? []).find((c) => c.startsWith('chat_token='));
      if (auth) cookies.set('auth', cookiePair(auth));
      return res;
    },
    get: (url) => send('get', url),
    cookieHeader: () => [...cookies.values()].join('; '),
  };
}

describe('production mode (simulated Render deployment)', () => {
  it('issues Secure, HttpOnly, SameSite=Lax session and CSRF cookies', async () => {
    const session = await browserSession();
    const res = await session.post('/api/auth/register', {
      name: 'Prod User',
      email: 'prod@example.com',
      password: 'Password123',
    });

    expect(res.status).toBe(201);
    const authCookie = res.headers['set-cookie'].find((c) => c.startsWith('chat_token='));
    expect(authCookie).toMatch(/; Secure/);
    expect(authCookie).toMatch(/; HttpOnly/);
    expect(authCookie).toMatch(/SameSite=Lax/);

    const csrf = await request(app).get('/api/auth/csrf');
    expect(csrf.headers['set-cookie'][0]).toMatch(/; Secure/);
    expect((await session.get('/api/auth/me')).status).toBe(200);
  });

  it('allows CORS only for the public Render origin', async () => {
    const allowed = await request(app).get('/api/health').set('Origin', PUBLIC_ORIGIN);
    expect(allowed.headers['access-control-allow-origin']).toBe(PUBLIC_ORIGIN);

    const localDev = await request(app).get('/api/health').set('Origin', 'http://localhost:5173');
    expect(localDev.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('accepts sockets from the public origin and rejects other origins', async () => {
    const session = await browserSession('203.0.113.20');
    await session.post('/api/auth/register', {
      name: 'Socket User',
      email: 'socket-prod@example.com',
      password: 'Password123',
    });

    const connect = (origin) =>
      new Promise((resolve) => {
        const socket = connectClient(baseUrl, {
          transports: ['websocket'],
          reconnection: false,
          forceNew: true,
          extraHeaders: { cookie: session.cookieHeader(), origin },
        });
        socket.once('session:ready', () => {
          socket.disconnect();
          resolve('ready');
        });
        socket.once('connect_error', () => {
          socket.disconnect();
          resolve('rejected');
        });
      });

    expect(await connect(PUBLIC_ORIGIN)).toBe('ready');
    expect(await connect('https://evil.example')).toBe('rejected');
    expect(await connect('http://localhost:5173')).toBe('rejected');
  });

  it('rate-limits login attempts per client IP behind the proxy', async () => {
    const attacker = await browserSession('198.51.100.1');
    const credentials = { email: 'nobody@example.com', password: 'WrongPassword1' };

    const statuses = [];
    for (let i = 0; i < 4; i += 1) {
      statuses.push((await attacker.post('/api/auth/login', credentials)).status);
    }
    expect(statuses).toEqual([401, 401, 401, 429]);

    // A different visitor (different X-Forwarded-For IP) is not affected.
    const someoneElse = await browserSession('198.51.100.2');
    expect((await someoneElse.post('/api/auth/login', credentials)).status).toBe(401);
  });

  it('refuses to run the demo seed script', async () => {
    const { seedDemoData } = await import('../scripts/seed.js');
    await expect(seedDemoData()).rejects.toThrow(/Refusing to seed/);
  });
});
