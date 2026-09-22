import { describe, expect, it, vi } from 'vitest';
import multer from 'multer';
import type { Request, Response } from 'express';
import { errorHandler } from '../src/middleware/errorHandler';

function mockResponse() {
  const res: Partial<Response> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response;
}

describe('errorHandler', () => {
  it('maps a multer file-size-limit error to 400 VALIDATION_ERROR instead of a raw 500', () => {
    const res = mockResponse();
    const err = new multer.MulterError('LIMIT_FILE_SIZE', 'photo');

    errorHandler(err, {} as Request, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'VALIDATION_ERROR', fieldErrors: expect.any(Object) }),
    );
  });

  it('still maps an unrecognized error to 500', () => {
    const res = mockResponse();
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    errorHandler(new Error('boom'), {} as Request, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(500);
    consoleErrorSpy.mockRestore();
  });
});
