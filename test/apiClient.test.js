/** @jest-environment jsdom */
const fs = require('fs');
const path = require('path');

describe('Shared API client module', () => {
  beforeEach(() => {
    jest.resetModules();
    localStorage.clear();
  });

  test('AC1: expenses.js does not access localStorage directly', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'expenses.js'), 'utf8');
    expect(src).not.toMatch(/localStorage/);
  });

  test('AC1: hire-profile.js does not perform inline fetch calls', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'hire-profile.js'), 'utf8');
    expect(src).not.toMatch(/\bfetch\(/);
  });

  test('AC2: the client exposes create/read/update/delete for the Expense domain', () => {
    const apiClient = require('../public/js/apiClient');
    expect(typeof apiClient.expenses.create).toBe('function');
    expect(typeof apiClient.expenses.read).toBe('function');
    expect(typeof apiClient.expenses.update).toBe('function');
    expect(typeof apiClient.expenses.remove).toBe('function');
  });

  test('AC2: the client exposes create/read/update/delete for the Employee domain', () => {
    const apiClient = require('../public/js/apiClient');
    expect(typeof apiClient.employees.create).toBe('function');
    expect(typeof apiClient.employees.read).toBe('function');
    expect(typeof apiClient.employees.update).toBe('function');
    expect(typeof apiClient.employees.remove).toBe('function');
  });

  test('AC3: a failed expense save rejects with a structured error', async () => {
    const apiClient = require('../public/js/apiClient');
    const setItemSpy = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    await expect(apiClient.expenses.create({ amount: 1, date: '2026-09-20', category: 'Travel', description: 'x' }))
      .rejects.toMatchObject({ message: expect.any(String) });
    setItemSpy.mockRestore();
  });

  test('AC3: a failed employee request rejects with a structured error including the HTTP status', async () => {
    const apiClient = require('../public/js/apiClient');
    global.fetch = jest.fn(() => Promise.resolve({
      ok: false,
      status: 404,
      json: () => Promise.resolve({ error: 'hire not found' }),
    }));
    await expect(apiClient.employees.read('missing')).rejects.toMatchObject({
      status: 404,
      message: 'hire not found',
    });
  });

  test('removing a non-existent expense rejects with a structured 404 error, consistent with update', async () => {
    const apiClient = require('../public/js/apiClient');
    await expect(apiClient.expenses.remove('exp_does_not_exist')).rejects.toMatchObject({
      status: 404,
      message: expect.any(String),
    });
  });
});
