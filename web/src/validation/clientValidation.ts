export interface EmployeeFormValues {
  firstName: string;
  lastName: string;
  email: string;
  mobile: string;
  department: string;
  designation: string;
  joiningDate: string;
}

const ALLOWED_DEPARTMENTS = [
  'Engineering',
  'Sales',
  'Marketing',
  'Finance',
  'HR',
  'Operations',
  'IT',
  'Customer Support',
  'Legal',
];

const REQUIRED_FIELDS: [keyof EmployeeFormValues, string][] = [
  ['firstName', 'First name'],
  ['lastName', 'Last name'],
  ['email', 'Email'],
  ['mobile', 'Mobile number'],
  ['department', 'Department'],
  ['designation', 'Designation'],
  ['joiningDate', 'Joining date'],
];

export function validateEmployeeFields(input: EmployeeFormValues): Record<string, string> {
  const errors: Record<string, string> = {};

  for (const [key, label] of REQUIRED_FIELDS) {
    const value = input[key];
    if (!value || !String(value).trim()) {
      errors[key] = `${label} is required.`;
    }
  }

  if (!errors.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) {
    errors.email = 'Enter a valid email address, e.g. name@company.com.';
  }

  if (!errors.mobile && !/^\d{10}$/.test(input.mobile.trim())) {
    errors.mobile = 'Mobile number must be exactly 10 numeric digits.';
  }

  if (!errors.department && !ALLOWED_DEPARTMENTS.includes(input.department)) {
    errors.department = 'Select a valid department.';
  }

  return errors;
}
