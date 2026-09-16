export class ConfigValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConfigValidationError';
  }
}
