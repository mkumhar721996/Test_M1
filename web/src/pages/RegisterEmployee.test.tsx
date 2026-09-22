import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RegisterEmployee } from './RegisterEmployee';
import { ApiDuplicateEmailError, createEmployee } from '../api/employeesApi';

vi.mock('../api/employeesApi', async () => {
  const actual = await vi.importActual<typeof import('../api/employeesApi')>('../api/employeesApi');
  return { ...actual, createEmployee: vi.fn() };
});

const mockCreateEmployee = vi.mocked(createEmployee);

async function fillValidRequiredFields() {
  await userEvent.type(screen.getByLabelText(/^first name/i), 'Meera');
  await userEvent.type(screen.getByLabelText(/^last name/i), 'Nair');
  await userEvent.type(screen.getByLabelText(/^email/i), 'meera.nair@acmecorp.com');
  await userEvent.type(screen.getByLabelText(/^mobile number/i), '9845123670');
  await userEvent.selectOptions(screen.getByLabelText(/^department/i), 'IT');
  await userEvent.type(screen.getByLabelText(/^designation/i), 'IT Support Engineer');
  const joiningDate = screen.getByLabelText(/^joining date/i) as HTMLInputElement;
  await userEvent.type(joiningDate, '2026-09-21');
}

describe('RegisterEmployee', () => {
  beforeEach(() => {
    mockCreateEmployee.mockReset();
  });

  it('AC7: blocks submission and shows an inline error for every blank required field', async () => {
    render(<RegisterEmployee onRegistered={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /register employee/i }));

    expect(screen.getByText('First name is required.')).toBeInTheDocument();
    expect(screen.getByText('Last name is required.')).toBeInTheDocument();
    expect(screen.getByText('Email is required.')).toBeInTheDocument();
    expect(screen.getByText('Mobile number is required.')).toBeInTheDocument();
    expect(mockCreateEmployee).not.toHaveBeenCalled();
  });

  it('AC8: shows an inline error for an invalid email format and blocks submission', async () => {
    render(<RegisterEmployee onRegistered={() => {}} />);
    await userEvent.type(screen.getByLabelText(/^email/i), 'not-an-email');
    await userEvent.click(screen.getByRole('button', { name: /register employee/i }));

    expect(screen.getByText('Enter a valid email address, e.g. name@company.com.')).toBeInTheDocument();
    expect(mockCreateEmployee).not.toHaveBeenCalled();
  });

  it('AC8: shows an inline error for an invalid mobile format and blocks submission', async () => {
    render(<RegisterEmployee onRegistered={() => {}} />);
    await userEvent.type(screen.getByLabelText(/^mobile number/i), '98765');
    await userEvent.click(screen.getByRole('button', { name: /register employee/i }));

    expect(screen.getByText('Mobile number must be exactly 10 numeric digits.')).toBeInTheDocument();
    expect(mockCreateEmployee).not.toHaveBeenCalled();
  });

  it('AC9: rejects a non-JPG/PNG photo upload with a file-type error', async () => {
    render(<RegisterEmployee onRegistered={() => {}} />);
    const badFile = new File(['x'], 'scan.pdf', { type: 'application/pdf' });
    await userEvent.setup({ applyAccept: false }).upload(screen.getByLabelText(/^photo/i), badFile);

    expect(await screen.findByText(/Photo must be a JPG or PNG file/)).toBeInTheDocument();
  });

  it('AC10: rejects an oversized photo upload with a file-size error', async () => {
    render(<RegisterEmployee onRegistered={() => {}} />);
    const bigFile = new File([new ArrayBuffer(3 * 1024 * 1024)], 'big.jpg', { type: 'image/jpeg' });
    await userEvent.upload(screen.getByLabelText(/^photo/i), bigFile);

    expect(await screen.findByText(/Photo exceeds the maximum size of 2MB/)).toBeInTheDocument();
  });

  it('AC9: rejects a non-PDF/JPG/PNG ID proof upload with a file-type error', async () => {
    render(<RegisterEmployee onRegistered={() => {}} />);
    const badFile = new File(['x'], 'aadhaar.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    await userEvent.setup({ applyAccept: false }).upload(screen.getByLabelText(/^id proof/i), badFile);

    expect(await screen.findByText(/ID proof must be a PDF, JPG, or PNG file/)).toBeInTheDocument();
  });

  it('AC4/AC11: shows a duplicate-email banner and blocks success when the server rejects the email', async () => {
    mockCreateEmployee.mockRejectedValueOnce(
      new ApiDuplicateEmailError(
        'An employee with this email is already on file (Employee ID: EMP00003, John Kumar). Registration blocked — use a different email address.',
        'EMP00003',
      ),
    );
    render(<RegisterEmployee onRegistered={() => {}} />);
    await fillValidRequiredFields();
    await userEvent.click(screen.getByRole('button', { name: /register employee/i }));

    await waitFor(() => expect(screen.getByText('Duplicate email')).toBeInTheDocument());
    expect(screen.getByText(/already on file \(Employee ID: EMP00003/)).toBeInTheDocument();
  });

  it('AC1/AC5: creates the record when optional fields are left blank and shows the success view', async () => {
    mockCreateEmployee.mockResolvedValueOnce({
      id: 'EMP00006',
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
    });
    render(<RegisterEmployee onRegistered={() => {}} />);
    await fillValidRequiredFields();
    await userEvent.click(screen.getByRole('button', { name: /register employee/i }));

    expect(await screen.findByText('EMP00006')).toBeInTheDocument();
    expect(screen.getByText('Employee registered successfully')).toBeInTheDocument();
    expect(screen.getAllByText('Not provided')).toHaveLength(3);
  });
});
