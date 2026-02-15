/**
 * Base class for all authentication-related errors.
 */
export class AuthenticationError extends Error {
  override name: string = "AuthenticationError";

  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, AuthenticationError.prototype);
  }
}

/**
 * Thrown when the user's session has expired and needs to re-authenticate.
 */
export class SessionExpiredError extends AuthenticationError {
  override name = "SessionExpiredError";

  constructor(message = "Session has expired") {
    super(message);
    Object.setPrototypeOf(this, SessionExpiredError.prototype);
  }
}

/**
 * Thrown when no valid JWT token is available.
 */
export class InvalidJwtError extends AuthenticationError {
  override name = "InvalidJwtError";

  constructor(message = "No valid JWT token") {
    super(message);
    Object.setPrototypeOf(this, InvalidJwtError.prototype);
  }
}
