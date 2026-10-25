import mongoose from 'mongoose';
import { AppError } from '../utils/AppError.js';

export function notFoundHandler(req, _res, next) {
  next(AppError.notFound(`Route ${req.method} ${req.originalUrl} not found`, 'ROUTE_NOT_FOUND'));
}

// Express recognises error-handling middleware by its four arguments.
export function errorHandler(err, req, res, _next) {
  const error = normalizeError(err);

  if (error.statusCode >= 500) {
    // Log the original error server-side only; never send stack traces to clients.
    console.error(`[error] ${req.method} ${req.originalUrl}`, err);
  }

  res.status(error.statusCode).json({
    error: {
      message: error.message,
      code: error.code,
      ...(error.details ? { details: error.details } : {}),
    },
  });
}

function normalizeError(err) {
  if (err instanceof AppError) return err;

  // Malformed JSON body or oversized payload from express.json().
  if (err?.type === 'entity.parse.failed') {
    return AppError.badRequest('Request body is not valid JSON', 'INVALID_JSON');
  }
  if (err?.type === 'entity.too.large') {
    return new AppError(413, 'Request body is too large', 'PAYLOAD_TOO_LARGE');
  }

  if (err instanceof mongoose.Error.CastError) {
    return AppError.badRequest(`Invalid value for ${err.path}`, 'INVALID_ID');
  }

  if (err?.code === 11000) {
    return AppError.conflict('A record with these details already exists', 'DUPLICATE');
  }

  return new AppError(500, 'Something went wrong. Please try again later.', 'INTERNAL_ERROR');
}
