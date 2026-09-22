import { describe, expect, it } from 'vitest';
import { EmployeeRepository } from '../src/repository/employeeRepository';
import { DuplicateEmailError } from '../src/errors';
import type { Employee } from '../src/types/employee';

function validInput(overrides: Partial<Omit<Employee, 'id'>> = {}): Omit<Employee, 'id'> {
  return {
    firstName: 'Meera',
    lastName: 'Nair',
    email: 'meera.nair@acmecorp.com',
    mobile: '9845123670',
    department: 'IT',
    designation: 'IT Support Engineer',
    joiningDate: '2026-09-21',
    dob: null,
    photo: null,
    idProof: null,
    ...overrides,
  };
}

describe('EmployeeRepository', () => {
  it('AC2: assigns EMP00001 to the first employee created', () => {
    const repo = new EmployeeRepository();
    const emp = repo.create(validInput());
    expect(emp.id).toBe('EMP00001');
  });

  it('AC3: assigns distinct, sequential IDs across multiple creations', () => {
    const repo = new EmployeeRepository();
    const ids = [
      repo.create(validInput({ email: 'a@x.com' })),
      repo.create(validInput({ email: 'b@x.com' })),
      repo.create(validInput({ email: 'c@x.com' })),
    ].map((e) => e.id);
    expect(ids).toEqual(['EMP00001', 'EMP00002', 'EMP00003']);
    expect(new Set(ids).size).toBe(3);
  });

  it('AC4: rejects a second registration with an email already on file', () => {
    const repo = new EmployeeRepository();
    repo.create(validInput({ email: 'john@co.com' }));
    expect(() => repo.create(validInput({ email: 'john@co.com' }))).toThrow(DuplicateEmailError);
  });

  it('AC11: treats an email differing only by case/whitespace as a duplicate', () => {
    const repo = new EmployeeRepository();
    repo.create(validInput({ email: 'john@co.com' }));
    expect(() => repo.create(validInput({ email: '  John@Co.com  ' }))).toThrow(DuplicateEmailError);
  });

  it('trims leading/trailing whitespace from first/last name before storage', () => {
    const repo = new EmployeeRepository();
    const emp = repo.create(validInput({ firstName: '  Meera  ', lastName: '  Nair ' }));
    expect(emp.firstName).toBe('Meera');
    expect(emp.lastName).toBe('Nair');
  });

  it('list() returns records in creation order', () => {
    const repo = new EmployeeRepository();
    repo.create(validInput({ email: 'a@x.com' }));
    repo.create(validInput({ email: 'b@x.com' }));
    expect(repo.list().map((e) => e.email)).toEqual(['a@x.com', 'b@x.com']);
  });
});
