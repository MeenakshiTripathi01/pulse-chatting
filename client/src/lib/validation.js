import { z } from 'zod';

// Mirrors server/src/validation/schemas.js. Client-side checks give instant feedback;
// the server re-validates everything because client code can be bypassed.

export const MESSAGE_MAX_LENGTH = 2000;

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, 'Email is required')
  .pipe(z.email('Enter a valid email address').max(254, 'Email is too long'));

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
});

export const registerSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'Name is required')
      .min(2, 'Name must be at least 2 characters')
      .max(50, 'Name must be at most 50 characters'),
    email: emailSchema,
    password: z
      .string()
      .min(1, 'Password is required')
      .min(8, 'Password must be at least 8 characters')
      .refine((value) => new TextEncoder().encode(value).length <= 72, 'Password is too long')
      .refine(
        (value) => /[A-Za-z]/.test(value) && /\d/.test(value),
        'Password must contain at least one letter and one number',
      ),
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  });

/** Returns `{ data }` on success or `{ errors: { field: message } }` on failure. */
export function validateForm(schema, values) {
  const result = schema.safeParse(values);
  if (result.success) return { data: result.data, errors: null };

  const errors = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0] ?? 'form';
    errors[field] ??= issue.message;
  }
  return { data: null, errors };
}
