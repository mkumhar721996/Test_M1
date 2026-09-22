const PHOTO_ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png'];
const PHOTO_MAX_BYTES = 2 * 1024 * 1024;

const ID_PROOF_ALLOWED_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
const ID_PROOF_MAX_BYTES = 5 * 1024 * 1024;

function humanSize(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export function validatePhotoFile(file: File): string | null {
  if (!PHOTO_ALLOWED_MIME_TYPES.includes(file.type)) {
    return `Photo must be a JPG or PNG file. "${file.name}" was rejected.`;
  }
  if (file.size > PHOTO_MAX_BYTES) {
    return `Photo exceeds the maximum size of 2MB (file is ${humanSize(file.size)}).`;
  }
  return null;
}

export function validateIdProofFile(file: File): string | null {
  if (!ID_PROOF_ALLOWED_MIME_TYPES.includes(file.type)) {
    return `ID proof must be a PDF, JPG, or PNG file. "${file.name}" was rejected.`;
  }
  if (file.size > ID_PROOF_MAX_BYTES) {
    return `ID proof exceeds the maximum size of 5MB (file is ${humanSize(file.size)}).`;
  }
  return null;
}
