import { ValidationError } from '../errors';
import { EmployeeRepository } from '../repository/employeeRepository';
import type { Employee, RegisterEmployeeInput } from '../types/employee';
import { validateEmployeeFields } from '../validation/employeeValidation';
import { validateIdProof, validatePhoto } from '../validation/fileValidation';

export function registerEmployee(input: RegisterEmployeeInput, repo: EmployeeRepository): Employee {
  const fieldErrors = validateEmployeeFields(input);

  if (input.photo) {
    const photoError = validatePhoto(input.photo);
    if (photoError) fieldErrors.photo = photoError;
  }

  if (input.idProof) {
    const idProofError = validateIdProof(input.idProof);
    if (idProofError) fieldErrors.idProof = idProofError;
  }

  if (Object.keys(fieldErrors).length > 0) {
    throw new ValidationError(fieldErrors);
  }

  return repo.create({
    firstName: input.firstName,
    lastName: input.lastName,
    email: input.email,
    mobile: input.mobile.trim(),
    department: input.department,
    designation: input.designation.trim(),
    joiningDate: input.joiningDate,
    dob: input.dob || null,
    photo: input.photo ?? null,
    idProof: input.idProof ?? null,
  });
}
