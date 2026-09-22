import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EmployeeDirectory } from './EmployeeDirectory';
import type { Employee } from '../api/employeesApi';

const employees: Employee[] = [
  {
    id: 'EMP00001',
    firstName: 'Priya',
    lastName: 'Sharma',
    email: 'priya.sharma@acmecorp.com',
    mobile: '9876543210',
    department: 'Engineering',
    designation: 'Software Engineer',
    joiningDate: '2023-01-15',
    dob: '1996-04-12',
    photo: { originalName: 'priya_photo.jpg', mimeType: 'image/jpeg', size: 1000 },
    idProof: { originalName: 'priya_aadhaar.pdf', mimeType: 'application/pdf', size: 1000 },
  },
  {
    id: 'EMP00002',
    firstName: 'Rahul',
    lastName: 'Verma',
    email: 'rahul.verma@acmecorp.com',
    mobile: '9123456780',
    department: 'Sales',
    designation: 'Sales Executive',
    joiningDate: '2023-03-01',
    dob: null,
    photo: null,
    idProof: null,
  },
];

describe('EmployeeDirectory', () => {
  it('renders every employee row with its Employee ID chip', () => {
    render(<EmployeeDirectory employees={employees} newlyCreatedId={null} />);
    expect(screen.getByText('EMP00001')).toBeInTheDocument();
    expect(screen.getByText('EMP00002')).toBeInTheDocument();
    expect(screen.getByText('Priya Sharma')).toBeInTheDocument();
  });

  it('renders blank optional fields as an em dash', () => {
    render(<EmployeeDirectory employees={employees} newlyCreatedId={null} />);
    const rahulRow = screen.getByText('Rahul Verma').closest('tr')!;
    expect(rahulRow.querySelectorAll('.muted-dash')).toHaveLength(3);
  });

  it('highlights the newly-created employee row', () => {
    render(<EmployeeDirectory employees={employees} newlyCreatedId="EMP00002" />);
    const rahulRow = screen.getByText('Rahul Verma').closest('tr')!;
    expect(rahulRow.className).toContain('is-new');
  });
});
