import { describe, expect, it } from 'vitest';
import { validateEmployeeFields } from '../src/validation/employeeValidation';
import type { RegisterEmployeeInput } from '../src/types/employee';

const valid: RegisterEmployeeInput = {
  firstName: 'Meera',
  lastName: 'Nair',
  email: 'meera.nair@acmecorp.com',
  mobile: '9845123670',
  department: 'IT',
  designation: 'IT Support Engineer',
  joiningDate: '2026-09-21',
};

describe('validateEmployeeFields', () => {
  it('returns no errors for a fully valid input', () => {
    expect(validateEmployeeFields(valid)).toEqual({});
  });

  it('AC7: reports each required field left blank', () => {
    const errors = validateEmployeeFields({ ...valid, firstName: '' });
    expect(errors.firstName).toBe('First name is required.');
  });

  it('AC7 edge case: whitespace-only value is treated as blank', () => {
    const errors = validateEmployeeFields({ ...valid, firstName: '   ' });
    expect(errors.firstName).toBe('First name is required.');
  });

  it('AC7: reports every blank required field at once', () => {
    const errors = validateEmployeeFields({
      ...valid,
      firstName: '',
      lastName: '',
      email: '',
      mobile: '',
    });
    expect(errors.firstName).toBe('First name is required.');
    expect(errors.lastName).toBe('Last name is required.');
    expect(errors.email).toBe('Email is required.');
    expect(errors.mobile).toBe('Mobile number is required.');
  });

  it('AC8: rejects a malformed email address', () => {
    const errors = validateEmployeeFields({ ...valid, email: 'not-an-email' });
    expect(errors.email).toBe('Enter a valid email address, e.g. name@company.com.');
  });

  it('AC8 edge case: rejects email missing a domain/TLD', () => {
    expect(validateEmployeeFields({ ...valid, email: 'a@b' }).email).toBeDefined();
  });

  it('AC8 edge case: rejects email with a double @', () => {
    expect(validateEmployeeFields({ ...valid, email: 'a@@b.com' }).email).toBeDefined();
  });

  it('AC8: rejects a mobile number that is not exactly 10 digits', () => {
    const errors = validateEmployeeFields({ ...valid, mobile: '987654321' });
    expect(errors.mobile).toBe('Mobile number must be exactly 10 numeric digits.');
  });

  it('AC8 edge case: rejects mobile number with dashes', () => {
    expect(validateEmployeeFields({ ...valid, mobile: '98765-4321' }).mobile).toBe(
      'Mobile number must be exactly 10 numeric digits.',
    );
  });

  it('AC8 edge case: rejects mobile number with a country-code prefix', () => {
    expect(validateEmployeeFields({ ...valid, mobile: '+919876543210' }).mobile).toBe(
      'Mobile number must be exactly 10 numeric digits.',
    );
  });

  it('edge case: rejects a department outside the fixed allow-list', () => {
    expect(validateEmployeeFields({ ...valid, department: 'Not A Real Dept' }).department).toBe(
      'Select a valid department.',
    );
  });
});
