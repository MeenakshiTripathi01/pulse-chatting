import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config/env.js';

const base = {
  MONGODB_URI: 'mongodb://localhost/test',
  JWT_SECRET: 'x'.repeat(48),
};

describe('loadConfig', () => {
  it('defaults to the Vite dev server origin in development', () => {
    const config = loadConfig({ ...base, NODE_ENV: 'development' });
    expect(config.clientOrigins).toEqual(['http://localhost:5173']);
    expect(config.isProduction).toBe(false);
  });

  it('refuses to start in production without a public origin', () => {
    expect(() => loadConfig({ ...base, NODE_ENV: 'production' })).toThrow(
      /CLIENT_ORIGIN: is required in production/,
    );
  });

  it("uses Render's public URL automatically and merges it with CLIENT_ORIGIN", () => {
    const onRender = loadConfig({
      ...base,
      NODE_ENV: 'production',
      RENDER_EXTERNAL_URL: 'https://pulse-chat.onrender.com',
    });
    expect(onRender.clientOrigins).toEqual(['https://pulse-chat.onrender.com']);

    const withCustomDomain = loadConfig({
      ...base,
      NODE_ENV: 'production',
      CLIENT_ORIGIN: 'https://chat.example.com/, https://pulse-chat.onrender.com',
      RENDER_EXTERNAL_URL: 'https://pulse-chat.onrender.com',
    });
    expect(withCustomDomain.clientOrigins).toEqual([
      'https://chat.example.com',
      'https://pulse-chat.onrender.com',
    ]);
  });

  it('rejects plain-http public origins in production but allows localhost', () => {
    expect(() =>
      loadConfig({ ...base, NODE_ENV: 'production', CLIENT_ORIGIN: 'http://chat.example.com' }),
    ).toThrow(/must use https in production/);

    expect(
      loadConfig({ ...base, NODE_ENV: 'production', CLIENT_ORIGIN: 'http://localhost:5050' })
        .clientOrigins,
    ).toEqual(['http://localhost:5050']);
  });

  it('rejects origins that include a path or are not URLs', () => {
    expect(() => loadConfig({ ...base, CLIENT_ORIGIN: 'https://chat.example.com/app' })).toThrow(
      /must be an origin only/,
    );
    expect(() => loadConfig({ ...base, CLIENT_ORIGIN: 'chat.example.com' })).toThrow(
      /not a valid URL/,
    );
  });

  it('only allows SameSite=None in production, and requires secrets', () => {
    expect(() => loadConfig({ ...base, COOKIE_SAME_SITE: 'none' })).toThrow(/SameSite=None/);
    expect(() => loadConfig({ MONGODB_URI: base.MONGODB_URI })).toThrow(/JWT_SECRET: is required/);
    expect(() => loadConfig({ ...base, JWT_SECRET: 'short' })).toThrow(/at least 32 characters/);
  });
});
