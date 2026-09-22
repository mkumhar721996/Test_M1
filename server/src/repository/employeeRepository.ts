import { DuplicateEmailError } from '../errors';
import type { Employee } from '../types/employee';

export class EmployeeRepository {
  private employees: Employee[] = [];
  private emailIndex = new Map<string, string>();
  private nextIdNumber = 1;

  create(input: Omit<Employee, 'id'>): Employee {
    const normalizedEmail = input.email.trim().toLowerCase();
    const existingId = this.emailIndex.get(normalizedEmail);
    if (existingId) {
      const existing = this.employees.find((e) => e.id === existingId)!;
      throw new DuplicateEmailError(existing.id, `${existing.firstName} ${existing.lastName}`);
    }

    const id = `EMP${String(this.nextIdNumber).padStart(5, '0')}`;
    this.nextIdNumber += 1;

    const employee: Employee = {
      ...input,
      id,
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      email: input.email.trim(),
    };

    this.employees.push(employee);
    this.emailIndex.set(normalizedEmail, id);
    return employee;
  }

  list(): Employee[] {
    return this.employees.slice();
  }
}
