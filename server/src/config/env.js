import { z } from 'zod';

const booleanFromString = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(5000),
    MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
    JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters long'),
    JWT_EXPIRES_IN_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .default(60 * 60 * 24 * 7),
    // Comma-separated list of browser origins allowed to call the API and open sockets.
    CLIENT_ORIGIN: z.string().default('http://localhost:5173'),
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
  });

function loadConfig(source = process.env) {
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
    clientOrigins: env.CLIENT_ORIGIN.split(',')
      .map((origin) => origin.trim().replace(/\/$/, ''))
      .filter(Boolean),
    cookieSameSite: env.COOKIE_SAME_SITE,
    trustProxy: env.TRUST_PROXY,
    serveClient: env.SERVE_CLIENT,
    authRateLimitMax: env.AUTH_RATE_LIMIT_MAX,
  });
}

export const config = loadConfig();
