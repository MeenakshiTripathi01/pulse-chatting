import { AppError } from '../utils/AppError.js';
import { formatZodError } from '../validation/formatZodError.js';

/**
 * Validates request parts against zod schemas and stores the parsed (trimmed, coerced)
 * values on `req.valid`. Controllers read only from `req.valid`, never from raw input.
 *
 * Usage: validate({ body: registerSchema, params: conversationParamsSchema })
 */
export function validate(schemas) {
  return (req, _res, next) => {
    req.valid = req.valid ?? {};

    for (const part of ['params', 'query', 'body']) {
      const schema = schemas[part];
      if (!schema) continue;

      const result = schema.safeParse(req[part] ?? {});
      if (!result.success) {
        throw AppError.badRequest(
          'Please correct the highlighted fields',
          'VALIDATION_ERROR',
          formatZodError(result.error),
        );
      }
      req.valid[part] = result.data;
    }

    next();
  };
}
