export class ValidationError extends Error {
  fieldErrors: Record<string, string>;

  constructor(fieldErrors: Record<string, string>) {
    super('VALIDATION_ERROR');
    this.name = 'ValidationError';
    this.fieldErrors = fieldErrors;
  }
}

export class DuplicateEmailError extends Error {
  existingEmployeeId: string;
  existingName: string;

  constructor(existingEmployeeId: string, existingName: string) {
    super('DUPLICATE_EMAIL');
    this.name = 'DuplicateEmailError';
    this.existingEmployeeId = existingEmployeeId;
    this.existingName = existingName;
  }
}
