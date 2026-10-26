import { z } from 'zod';

const booleanFromString = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(5000),
    MONGODB_URI: z
      .string({ error: 'is required (copy server/.env.example to server/.env)' })
      .min(1, 'is required'),
    JWT_SECRET: z
      .string({ error: 'is required (copy server/.env.example to server/.env)' })
      .min(32, 'must be at least 32 characters long'),
    JWT_EXPIRES_IN_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .default(60 * 60 * 24 * 7),
    // Comma-separated list of browser origins allowed to call the API and open sockets.
    CLIENT_ORIGIN: z.string().optional(),
    // Set automatically by Render to the service's public URL, e.g. https://app.onrender.com
    RENDER_EXTERNAL_URL: z.string().optional(),
    COOKIE_SAME_SITE: z.enum(['lax', 'strict', 'none']).default('lax'),
    // Number of reverse proxies in front of the app (e.g. 1 on Render/Railway/Heroku).
    TRUST_PROXY: z.coerce.number().int().min(0).default(0),
    // When true, Express also serves the built React app from client/dist.
    SERVE_CLIENT: booleanFromString,
    AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),
  })
  .superRefine((env, ctx) => {
    if (env.COOKIE_SAME_SITE === 'none' && env.NODE_ENV !== 'production') {
      ctx.addIssue({
        code: 'custom',
        path: ['COOKIE_SAME_SITE'],
        message: 'SameSite=None requires Secure cookies, which are only enabled in production',
      });
    }

    const origins = resolveClientOrigins(env);
    if (origins.length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['CLIENT_ORIGIN'],
        message:
          'is required in production: set it to the public URL users open, e.g. https://chat.example.com',
      });
    }
    for (const origin of origins) {
      const problem = describeOriginProblem(origin, env.NODE_ENV === 'production');
      if (problem) ctx.addIssue({ code: 'custom', path: ['CLIENT_ORIGIN'], message: problem });
    }
  });

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * The browser origins allowed to use the API and sockets. On Render the public URL is added
 * automatically, so a forgotten CLIENT_ORIGIN can't silently break real-time chat.
 */
function resolveClientOrigins(env) {
  const configured = (env.CLIENT_ORIGIN ?? '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  if (env.RENDER_EXTERNAL_URL) configured.push(env.RENDER_EXTERNAL_URL.trim().replace(/\/+$/, ''));

  if (configured.length === 0 && env.NODE_ENV !== 'production') {
    return ['http://localhost:5173'];
  }
  return [...new Set(configured)];
}

function describeOriginProblem(origin, isProduction) {
  let url;
  try {
    url = new URL(origin);
  } catch {
    return `"${origin}" is not a valid URL (expected e.g. https://chat.example.com)`;
  }
  if (url.origin !== origin) {
    return `"${origin}" must be an origin only: scheme, host and optional port, no path`;
  }
  // Secure cookies are never sent over plain http (browsers make an exception for localhost).
  if (isProduction && url.protocol !== 'https:' && !LOCAL_HOSTNAMES.has(url.hostname)) {
    return `"${origin}" must use https in production, otherwise login cookies are not sent`;
  }
  return null;
}

export function loadConfig(source = process.env) {
  const result = envSchema.safeParse(source);

  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }

  const env = result.data;

  return Object.freeze({
    nodeEnv: env.NODE_ENV,
    isProduction: env.NODE_ENV === 'production',
    port: env.PORT,
    mongoUri: env.MONGODB_URI,
    jwtSecret: env.JWT_SECRET,
    jwtExpiresInSeconds: env.JWT_EXPIRES_IN_SECONDS,
    clientOrigins: resolveClientOrigins(env),
    cookieSameSite: env.COOKIE_SAME_SITE,
    trustProxy: env.TRUST_PROXY,
    serveClient: env.SERVE_CLIENT,
    authRateLimitMax: env.AUTH_RATE_LIMIT_MAX,
  });
}

export const config = loadConfig();
