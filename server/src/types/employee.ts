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

export interface RegisterEmployeeInput {
  firstName: string;
  lastName: string;
  email: string;
  mobile: string;
  department: string;
  designation: string;
  joiningDate: string;
  dob?: string;
  photo?: UploadedFileMeta;
  idProof?: UploadedFileMeta;
}
