const fs = require('fs');
const os = require('os');
const path = require('path');

let dbPath;

beforeEach(() => {
  dbPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sqlite-test-')), 'app.db');
  process.env.SQLITE_DB_PATH = dbPath;
  jest.resetModules();
});

afterEach(() => {
  try { require('../src/db/connection').closeDb(); } catch (e) { /* already closed */ }
  delete process.env.SQLITE_DB_PATH;
  jest.resetModules();
});

test('AC1: an employee created before "restart" is still readable after the module reloads', () => {
  const { createEmployee } = require('../src/employees/store');
  const employee = createEmployee({ name: 'Ada Lovelace', email: 'ada@example.com', jobTitle: 'Engineer' });

  require('../src/db/connection').closeDb();
  jest.resetModules();
  process.env.SQLITE_DB_PATH = dbPath;

  const { getEmployee } = require('../src/employees/store');
  expect(getEmployee(employee.id)).toEqual(employee);
});

test('AC1: an expense created before "restart" is still readable after the module reloads', () => {
  const { createExpense } = require('../src/expenses/store');
  const expense = createExpense({ date: '2026-09-20', category: 'Travel', description: 'Taxi', amount: 24.5 });

  require('../src/db/connection').closeDb();
  jest.resetModules();
  process.env.SQLITE_DB_PATH = dbPath;

  const { listExpenses } = require('../src/expenses/store');
  expect(listExpenses()).toContainEqual(expense);
});
