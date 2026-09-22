import { describe, expect, it } from 'vitest';
import { validatePhotoFile, validateIdProofFile } from './clientFileValidation';

function makeFile(name: string, type: string, size: number): File {
  return new File([new ArrayBuffer(size)], name, { type });
}

describe('validatePhotoFile', () => {
  it('AC9: rejects a file type that is not JPG or PNG', () => {
    const file = makeFile('scan.pdf', 'application/pdf', 1000);
    expect(validatePhotoFile(file)).toBe('Photo must be a JPG or PNG file. "scan.pdf" was rejected.');
  });

  it('AC10: rejects a file larger than 2MB', () => {
    const file = makeFile('big.jpg', 'image/jpeg', 3 * 1024 * 1024);
    expect(validatePhotoFile(file)).toBe('Photo exceeds the maximum size of 2MB (file is 3.0MB).');
  });

  it('accepts a valid JPG under 2MB', () => {
    const file = makeFile('p.jpg', 'image/jpeg', 1024);
    expect(validatePhotoFile(file)).toBeNull();
  });
});

describe('validateIdProofFile', () => {
  it('AC9: rejects a file type that is not PDF, JPG, or PNG', () => {
    const file = makeFile(
      'aadhaar-card.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      1000,
    );
    expect(validateIdProofFile(file)).toBe(
      'ID proof must be a PDF, JPG, or PNG file. "aadhaar-card.docx" was rejected.',
    );
  });

  it('AC10: rejects a file larger than 5MB', () => {
    const file = makeFile('passport-scan.pdf', 'application/pdf', 6 * 1024 * 1024);
    expect(validateIdProofFile(file)).toBe('ID proof exceeds the maximum size of 5MB (file is 6.0MB).');
  });

  it('accepts a valid PDF under 5MB', () => {
    const file = makeFile('id.pdf', 'application/pdf', 1024);
    expect(validateIdProofFile(file)).toBeNull();
  });
});
