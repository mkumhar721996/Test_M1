import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { App } from './App';
import { listEmployees } from './api/employeesApi';

vi.mock('./api/employeesApi', async () => {
  const actual = await vi.importActual<typeof import('./api/employeesApi')>('./api/employeesApi');
  return { ...actual, listEmployees: vi.fn() };
});

const mockListEmployees = vi.mocked(listEmployees);

describe('App', () => {
  beforeEach(() => {
    mockListEmployees.mockReset();
  });

  it('shows an error message when the initial employee directory fails to load', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockListEmployees.mockRejectedValueOnce(new Error('Network error'));

    render(<App />);

    expect(await screen.findByText(/Failed to load the employee directory/i)).toBeInTheDocument();
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });
});
