import { describe, expect, it } from 'vitest';
import { validateEmployeeFields } from './clientValidation';

const valid = {
  firstName: 'Meera',
  lastName: 'Nair',
  email: 'meera.nair@acmecorp.com',
  mobile: '9845123670',
  department: 'IT',
  designation: 'IT Support Engineer',
  joiningDate: '2026-09-21',
};

describe('client validateEmployeeFields', () => {
  it('returns no errors for a fully valid input', () => {
    expect(validateEmployeeFields(valid)).toEqual({});
  });

  it('AC7: reports a blank required field', () => {
    expect(validateEmployeeFields({ ...valid, firstName: '' }).firstName).toBe(
      'First name is required.',
    );
  });

  it('AC7 edge case: whitespace-only value is treated as blank', () => {
    expect(validateEmployeeFields({ ...valid, lastName: '   ' }).lastName).toBe(
      'Last name is required.',
    );
  });

  it('AC8: rejects a malformed email', () => {
    expect(validateEmployeeFields({ ...valid, email: 'not-an-email' }).email).toBe(
      'Enter a valid email address, e.g. name@company.com.',
    );
  });

  it('AC8: rejects a mobile number that is not exactly 10 digits', () => {
    expect(validateEmployeeFields({ ...valid, mobile: '987654321' }).mobile).toBe(
      'Mobile number must be exactly 10 numeric digits.',
    );
  });
});
