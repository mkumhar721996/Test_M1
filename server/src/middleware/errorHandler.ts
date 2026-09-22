import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { DuplicateEmailError, ValidationError } from '../errors';

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ValidationError) {
    res.status(400).json({ error: 'VALIDATION_ERROR', fieldErrors: err.fieldErrors });
    return;
  }

  if (err instanceof multer.MulterError) {
    const field = err.field ?? 'file';
    res.status(400).json({
      error: 'VALIDATION_ERROR',
      fieldErrors: { [field]: 'The selected file exceeds the maximum allowed upload size.' },
    });
    return;
  }

  if (err instanceof DuplicateEmailError) {
    res.status(409).json({
      error: 'DUPLICATE_EMAIL',
      message: `An employee with this email is already on file (Employee ID: ${err.existingEmployeeId}, ${err.existingName}). Registration blocked — use a different email address.`,
      existingEmployeeId: err.existingEmployeeId,
    });
    return;
  }

  // eslint-disable-next-line no-console
  console.error(err);
  res.status(500).json({ error: 'INTERNAL_ERROR' });
}
