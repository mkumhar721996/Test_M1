/** @jest-environment jsdom */
const fs = require('fs');
const path = require('path');

const HTML_PATH = path.join(__dirname, '..', 'public', 'categories.html');

describe('Category List View — Accessible Spend Summary', () => {
  beforeEach(() => {
    jest.resetModules();
    document.documentElement.innerHTML = fs.readFileSync(HTML_PATH, 'utf8');
  });

  afterEach(() => {
    delete global.fetch;
  });

  test('AC1: a standard in-progress indicator is shown while categories are being fetched', () => {
    global.fetch = jest.fn(() => new Promise(() => {}));
    const { initCategoriesApp } = require('../public/js/categories');
    initCategoriesApp(document);
    expect(document.getElementById('state-loading').hidden).toBe(false);
    expect(document.getElementById('state-success').hidden).toBe(true);
    expect(document.getElementById('state-error').hidden).toBe(true);
  });

  test('AC2: each row\'s controls are real, focusable buttons reachable via Tab', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([{ id: 'cat-1', name: 'Groceries', totalSpend: 482.13, spendLimit: 600 }]),
    });
    const { initCategoriesApp } = require('../public/js/categories');
    await initCategoriesApp(document);
    const buttons = document.querySelectorAll('#category-tbody .action-btn');
    expect(buttons.length).toBe(3);
    buttons.forEach((btn) => {
      expect(btn.tagName).toBe('BUTTON');
      expect(btn.tabIndex).not.toBe(-1);
      btn.focus();
      expect(document.activeElement).toBe(btn);
    });
  });

  test('AC2: activating a focused control (native button click) works without a pointer device', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([{ id: 'cat-1', name: 'Groceries', totalSpend: 482.13, spendLimit: 600 }]),
    });
    const { initCategoriesApp } = require('../public/js/categories');
    await initCategoriesApp(document);
    const editBtn = document.querySelector('[data-action="edit"]');
    editBtn.focus();
    editBtn.click();
    expect(document.getElementById('toast').hidden).toBe(false);
    expect(document.getElementById('toast-message').textContent).toMatch(/Edit Groceries/);
  });

  test('AC3: each row exposes name, total spend, and spend limit as distinct labelled table fields', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([{ id: 'cat-1', name: 'Groceries', totalSpend: 482.13, spendLimit: 600 }]),
    });
    const { initCategoriesApp } = require('../public/js/categories');
    await initCategoriesApp(document);
    const headers = Array.from(document.querySelectorAll('.category-table thead th')).map((th) => th.textContent);
    expect(headers).toEqual(['Category', 'Total spend', 'Spend limit', 'Actions']);
    const row = document.querySelector('#category-tbody tr');
    expect(row.querySelector('th[scope="row"]').textContent).toBe('Groceries');
    expect(row.children[1].tagName).toBe('TD');
    expect(row.children[2].tagName).toBe('TD');
  });

  test('AC4: an over-limit category announces the warning state alongside its spend figures', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([{ id: 'cat-2', name: 'Dining Out', totalSpend: 310, spendLimit: 250 }]),
    });
    const { initCategoriesApp } = require('../public/js/categories');
    await initCategoriesApp(document);
    const row = document.querySelector('#category-tbody tr');
    expect(row.classList.contains('is-warning')).toBe(true);
    const spendCell = row.children[1];
    expect(spendCell.querySelector('.warning-badge').textContent).toMatch(/Over limit/);
    expect(spendCell.textContent).toMatch(/\$310\.00/);
  });

  test('AC5: a loaded row visibly shows the category\'s name, total spend, and spend limit', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([{ id: 'cat-1', name: 'Groceries', totalSpend: 482.13, spendLimit: 600 }]),
    });
    const { initCategoriesApp } = require('../public/js/categories');
    await initCategoriesApp(document);
    const row = document.querySelector('#category-tbody tr');
    expect(row.querySelector('.cat-name').textContent).toBe('Groceries');
    expect(row.children[1].textContent).toMatch(/\$482\.13/);
    expect(row.children[2].textContent).toMatch(/\$600\.00/);
  });

  test('AC6: a category with no spend limit displays no spend limit value', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([{ id: 'cat-3', name: 'Transportation', totalSpend: 128.50, spendLimit: null }]),
    });
    const { initCategoriesApp } = require('../public/js/categories');
    await initCategoriesApp(document);
    const limitCell = document.querySelector('#category-tbody tr').children[2];
    expect(limitCell.textContent).toMatch(/No limit set/);
    expect(limitCell.textContent).not.toMatch(/\$/);
  });

  test('AC7: an over-limit row displays a warning icon/badge on the spend value', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([{ id: 'cat-4', name: 'Entertainment', totalSpend: 75, spendLimit: 75 }]),
    });
    const { initCategoriesApp } = require('../public/js/categories');
    await initCategoriesApp(document);
    const badge = document.querySelector('#category-tbody .warning-badge');
    expect(badge).not.toBeNull();
    expect(badge.textContent).toContain('⚠');
    expect(badge.textContent).toContain('Over limit');
  });

  test('AC8: an over-limit row carries the is-warning class that drives the distinct warning color', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([{ id: 'cat-4', name: 'Entertainment', totalSpend: 75, spendLimit: 75 }]),
    });
    const { initCategoriesApp } = require('../public/js/categories');
    await initCategoriesApp(document);
    expect(document.querySelector('#category-tbody tr').classList.contains('is-warning')).toBe(true);
  });

  test('security: a malicious category name cannot break out of an HTML attribute to inject a handler', async () => {
    const maliciousName = '"><img src=x onerror="window.__pwned = true">';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([{ id: 'cat-1', name: maliciousName, totalSpend: 10, spendLimit: null }]),
    });
    const { initCategoriesApp, escapeHtml } = require('../public/js/categories');
    await initCategoriesApp(document);
    expect(window.__pwned).toBeUndefined();
    expect(document.querySelectorAll('#category-tbody img').length).toBe(0);
    expect(document.getElementById('category-tbody').innerHTML).not.toContain('<img');
    const editBtn = document.querySelector('[data-action="edit"]');
    expect(editBtn.getAttribute('aria-label')).toBe(`Edit ${escapeHtml(maliciousName)}`);
  });

  test('AC9: a failed fetch displays an inline error message in place of the category list', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 });
    const { loadCategories } = require('../public/js/categories');
    await loadCategories(document);
    expect(document.getElementById('state-error').hidden).toBe(false);
    expect(document.getElementById('state-success').hidden).toBe(true);
    expect(document.getElementById('state-error').querySelector('.error-body').textContent)
      .toMatch(/problem fetching/i);
  });

  test('AC10: activating Retry re-attempts the fetch and shows the list on success', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([{ id: 'cat-1', name: 'Groceries', totalSpend: 482.13, spendLimit: 600 }]),
      });
    const { initCategoriesApp } = require('../public/js/categories');
    await initCategoriesApp(document);
    expect(document.getElementById('state-error').hidden).toBe(false);
    document.getElementById('retry-btn').click();
    await new Promise((resolve) => setImmediate(resolve));
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(document.getElementById('state-success').hidden).toBe(false);
  });
});
