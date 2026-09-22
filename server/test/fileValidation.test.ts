import { describe, expect, it } from 'vitest';
import { validatePhoto, validateIdProof } from '../src/validation/fileValidation';
import type { UploadedFileMeta } from '../src/types/employee';

describe('validatePhoto', () => {
  it('AC9: rejects a file type that is not JPG or PNG', () => {
    const file: UploadedFileMeta = { originalName: 'scan.pdf', mimeType: 'application/pdf', size: 1000 };
    expect(validatePhoto(file)).toBe('Photo must be a JPG or PNG file. "scan.pdf" was rejected.');
  });

  it('AC10: rejects a file larger than 2MB', () => {
    const file: UploadedFileMeta = {
      originalName: 'big.jpg',
      mimeType: 'image/jpeg',
      size: 3 * 1024 * 1024,
    };
    expect(validatePhoto(file)).toBe('Photo exceeds the maximum size of 2MB (file is 3.0MB).');
  });

  it('accepts a valid JPG under 2MB', () => {
    const file: UploadedFileMeta = { originalName: 'p.jpg', mimeType: 'image/jpeg', size: 1024 };
    expect(validatePhoto(file)).toBeNull();
  });

  it('accepts a valid PNG under 2MB', () => {
    const file: UploadedFileMeta = { originalName: 'p.png', mimeType: 'image/png', size: 1024 };
    expect(validatePhoto(file)).toBeNull();
  });
});

describe('validateIdProof', () => {
  it('AC9: rejects a file type that is not PDF, JPG, or PNG', () => {
    const file: UploadedFileMeta = {
      originalName: 'aadhaar-card.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      size: 1000,
    };
    expect(validateIdProof(file)).toBe(
      'ID proof must be a PDF, JPG, or PNG file. "aadhaar-card.docx" was rejected.',
    );
  });

  it('AC10: rejects a file larger than 5MB', () => {
    const file: UploadedFileMeta = {
      originalName: 'passport-scan.pdf',
      mimeType: 'application/pdf',
      size: 6 * 1024 * 1024,
    };
    expect(validateIdProof(file)).toBe('ID proof exceeds the maximum size of 5MB (file is 6.0MB).');
  });

  it('accepts a valid PDF under 5MB', () => {
    const file: UploadedFileMeta = { originalName: 'id.pdf', mimeType: 'application/pdf', size: 1024 };
    expect(validateIdProof(file)).toBeNull();
  });
});
