export interface UploadedFileMeta {
  originalName: string;
  mimeType: string;
  size: number;
}

export interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  mobile: string;
  department: string;
  designation: string;
  joiningDate: string;
  dob: string | null;
  photo: UploadedFileMeta | null;
  idProof: UploadedFileMeta | null;
}

export class ApiValidationError extends Error {
  fieldErrors: Record<string, string>;

  constructor(fieldErrors: Record<string, string>) {
    super('VALIDATION_ERROR');
    this.fieldErrors = fieldErrors;
  }
}

export class ApiDuplicateEmailError extends Error {
  existingEmployeeId: string;

  constructor(message: string, existingEmployeeId: string) {
    super(message);
    this.existingEmployeeId = existingEmployeeId;
  }
}

export async function createEmployee(formData: FormData): Promise<Employee> {
  const res = await fetch('/api/employees', { method: 'POST', body: formData });
  const body = await res.json();

  if (res.status === 400) {
    throw new ApiValidationError(body.fieldErrors);
  }
  if (res.status === 409) {
    throw new ApiDuplicateEmailError(body.message, body.existingEmployeeId);
  }
  if (!res.ok) {
    throw new Error('Failed to register employee.');
  }

  return body as Employee;
}

export async function listEmployees(): Promise<Employee[]> {
  const res = await fetch('/api/employees');
  if (!res.ok) {
    throw new Error('Failed to load employees.');
  }
  return (await res.json()) as Employee[];
}
