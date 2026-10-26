import { z } from 'zod';
import { MESSAGE_MAX_LENGTH } from '../models/Message.js';

// Keep these rules in sync with client/src/lib/validation.js.

export const objectIdSchema = z
  .string({ error: 'Id is required' })
  .regex(/^[a-f\d]{24}$/i, 'Invalid id');

const emailSchema = z
  .string({ error: 'Email is required' })
  .trim()
  .toLowerCase()
  .pipe(z.email('Enter a valid email address').max(254, 'Email is too long'));

const nameSchema = z
  .string({ error: 'Name is required' })
  .trim()
  .min(2, 'Name must be at least 2 characters')
  .max(50, 'Name must be at most 50 characters');

export const usernameSchema = z
  .string({ error: 'Username is required' })
  .trim()
  .toLowerCase()
  .min(3, 'Username must be at least 3 characters')
  .max(20, 'Username must be at most 20 characters')
  .regex(/^[a-z0-9._]+$/, 'Username can only use letters, numbers, dots and underscores');

// bcrypt only uses the first 72 bytes of a password, so longer input is rejected rather than
// silently truncated.
export const newPasswordSchema = z
  .string({ error: 'Password is required' })
  .min(8, 'Password must be at least 8 characters')
  .refine((value) => Buffer.byteLength(value, 'utf8') <= 72, 'Password is too long')
  .refine(
    (value) => /[A-Za-z]/.test(value) && /\d/.test(value),
    'Password must contain at least one letter and one number',
  );

export const registerSchema = z.object({
  name: nameSchema,
  username: usernameSchema,
  email: emailSchema,
  password: newPasswordSchema,
});

// `username` is only needed when the login creates an account (or the account has none yet).
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string({ error: 'Password is required' }).min(1, 'Password is required').max(200),
  username: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    usernameSchema.optional(),
  ),
});

export const userSearchQuerySchema = z.object({
  search: z.string().trim().max(100, 'Search is too long').default(''),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const createConversationSchema = z.object({
  participantId: objectIdSchema,
});

export const conversationParamsSchema = z.object({
  conversationId: objectIdSchema,
});

export const messageHistoryQuerySchema = z.object({
  before: objectIdSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export const messageContentSchema = z
  .string({ error: 'Message is required' })
  .trim()
  .min(1, 'Message cannot be empty')
  .max(MESSAGE_MAX_LENGTH, `Message must be at most ${MESSAGE_MAX_LENGTH} characters`);

export const typingSchema = z.object({
  conversationId: objectIdSchema,
  isTyping: z.boolean(),
});

export const presenceQuerySchema = z.object({
  userIds: z.array(objectIdSchema).max(200),
});

export const sendMessageSchema = z.object({
  conversationId: objectIdSchema,
  content: messageContentSchema,
  clientMessageId: z
    .string()
    .trim()
    .min(8)
    .max(64)
    .regex(/^[\w-]+$/, 'Invalid client message id')
    .optional(),
});
