/**
 * An expected, client-facing error. Anything thrown that is NOT an AppError is treated
 * as an unexpected bug and reported to the client as a generic 500.
 */
export class AppError extends Error {
  constructor(statusCode, message, code = 'ERROR', details = undefined) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }

  static badRequest(message, code = 'BAD_REQUEST', details) {
    return new AppError(400, message, code, details);
  }

  static unauthorized(message = 'Authentication required', code = 'UNAUTHORIZED') {
    return new AppError(401, message, code);
  }

  static forbidden(message = 'You do not have access to this resource', code = 'FORBIDDEN') {
    return new AppError(403, message, code);
  }

  static notFound(message = 'Resource not found', code = 'NOT_FOUND') {
    return new AppError(404, message, code);
  }

  static conflict(message, code = 'CONFLICT') {
    return new AppError(409, message, code);
  }
}
