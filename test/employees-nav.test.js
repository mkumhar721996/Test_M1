/** @jest-environment jsdom */
const fs = require('fs');
const path = require('path');

const HTML_PATH = path.join(__dirname, '..', 'public', 'index.html');

describe('Employees Nav Placeholder Routing', () => {
  beforeEach(() => {
    jest.resetModules();
    localStorage.clear();
    window.location.hash = '';
    document.documentElement.innerHTML = fs.readFileSync(HTML_PATH, 'utf8');
    const { initExpensesApp } = require('../public/js/expenses');
    const { initNav } = require('../public/js/nav');
    initExpensesApp(document);
    initNav(document);
  });

  test('clicking the Employees nav link navigates without throwing a JS error', () => {
    expect(() => {
      document.querySelector('[data-nav="employees"]').click();
    }).not.toThrow();
    expect(window.location.hash).toBe('#/employees');
  });

  test('the Employees section renders inside the same topbar and nav as Expenses', () => {
    document.querySelector('[data-nav="employees"]').click();
    expect(document.querySelectorAll('.app-topbar').length).toBe(1);
    expect(document.querySelector('.app-nav [data-nav="expenses"]')).not.toBeNull();
  });

  test('the Employees placeholder shows a coming-soon heading', () => {
    document.querySelector('[data-nav="employees"]').click();
    const heading = document.querySelector('#section-employees .placeholder-title');
    expect(heading.textContent).toMatch(/coming soon/i);
  });

  test('the Employees section renders no expense table or expense-specific controls', () => {
    document.querySelector('[data-nav="employees"]').click();
    const section = document.getElementById('section-employees');
    expect(section.querySelector('table.expense-table')).toBeNull();
    expect(section.querySelector('#add-expense-btn')).toBeNull();
  });

  test('the Expenses nav link remains visible while viewing the Employees placeholder', () => {
    document.querySelector('[data-nav="employees"]').click();
    const expensesLink = document.querySelector('[data-nav="expenses"]');
    expect(expensesLink).not.toBeNull();
    expect(expensesLink.hidden).toBe(false);
  });

  test('clicking Expenses from the placeholder navigates back to the expense table', () => {
    document.querySelector('[data-nav="employees"]').click();
    document.querySelector('[data-nav="expenses"]').click();
    expect(document.getElementById('section-expenses').hidden).toBe(false);
    expect(document.getElementById('section-employees').hidden).toBe(true);
    expect(document.querySelector('#section-expenses table.expense-table')).not.toBeNull();
  });
});
