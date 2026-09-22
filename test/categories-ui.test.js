/** @jest-environment jsdom */

const fs = require('fs');
const path = require('path');

const html = fs
  .readFileSync(path.join(__dirname, '../public/categories/index.html'), 'utf8')
  .replace(/<script src="\/app\/categories\/app\.js"><\/script>/, '');

function flushPromises() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function loadPage() {
  document.documentElement.innerHTML = html;
  jest.resetModules();
  require('../public/categories/app.js');
}

afterEach(() => {
  jest.restoreAllMocks();
});

test('shows the empty-state message when no categories exist', async () => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ categories: [], uncategorisedCount: 0 }),
  });
  loadPage();
  await flushPromises();
  expect(document.getElementById('empty-state-block').hidden).toBe(false);
  expect(document.getElementById('category-list-card').hidden).toBe(true);
});

test('shows an inline error for a case-insensitive duplicate on create', async () => {
  global.fetch = jest
    .fn()
    .mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          categories: [{ id: 'c1', name: 'Groceries', expenseCount: 2 }],
          uncategorisedCount: 0,
        }),
    })
    .mockResolvedValueOnce({
      ok: false,
      status: 422,
      json: () =>
        Promise.resolve({
          error: 'duplicate_name',
          message: 'A category named "groceries" already exists. Try a different name.',
        }),
    });
  loadPage();
  await flushPromises();
  document.getElementById('create-input').value = 'groceries';
  document.getElementById('create-form').dispatchEvent(new Event('submit', { cancelable: true }));
  await flushPromises();
  const error = document.getElementById('create-error');
  expect(error.hidden).toBe(false);
  expect(error.querySelector('span:last-child').textContent).toBe(
    'A category named "groceries" already exists. Try a different name.'
  );
});

test('shows an inline error for a case-insensitive duplicate on rename', async () => {
  global.fetch = jest
    .fn()
    .mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          categories: [
            { id: 'c1', name: 'Rent', expenseCount: 0 },
            { id: 'c2', name: 'Insurance', expenseCount: 0 },
          ],
          uncategorisedCount: 0,
        }),
    })
    .mockResolvedValueOnce({
      ok: false,
      status: 422,
      json: () =>
        Promise.resolve({
          error: 'duplicate_name',
          message: 'A category named "insurance" already exists. Try a different name.',
        }),
    });
  loadPage();
  await flushPromises();

  const row = document.querySelector('.category-row[data-id="c1"]');
  row.querySelector('[data-action="rename"]').click();
  const input = row.querySelector('input');
  input.value = 'insurance';
  row.querySelector('[data-action="save-rename"]').click();
  await flushPromises();

  const error = row.querySelector('.field-error');
  expect(error.hidden).toBe(false);
  expect(error.querySelector('span:last-child').textContent).toBe(
    'A category named "insurance" already exists. Try a different name.'
  );
});

test('shows an inline error when the create request fails due to a network error', async () => {
  global.fetch = jest
    .fn()
    .mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ categories: [], uncategorisedCount: 0 }),
    })
    .mockRejectedValueOnce(new Error('network down'));
  loadPage();
  await flushPromises();
  document.getElementById('create-input').value = 'Travel';
  document.getElementById('create-form').dispatchEvent(new Event('submit', { cancelable: true }));
  await flushPromises();
  const error = document.getElementById('create-error');
  expect(error.hidden).toBe(false);
  expect(error.querySelector('span:last-child').textContent).toBe(
    'Something went wrong. Please try again.'
  );
  expect(document.getElementById('create-submit').disabled).toBe(false);
});

test('shows an inline error when the rename request fails due to a network error', async () => {
  global.fetch = jest
    .fn()
    .mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          categories: [{ id: 'c1', name: 'Rent', expenseCount: 0 }],
          uncategorisedCount: 0,
        }),
    })
    .mockRejectedValueOnce(new Error('network down'));
  loadPage();
  await flushPromises();

  const row = document.querySelector('.category-row[data-id="c1"]');
  row.querySelector('[data-action="rename"]').click();
  row.querySelector('input').value = 'Rentals';
  row.querySelector('[data-action="save-rename"]').click();
  await flushPromises();

  const error = row.querySelector('.field-error');
  expect(error.hidden).toBe(false);
  expect(error.querySelector('span:last-child').textContent).toBe(
    'Something went wrong. Please try again.'
  );
});

test('shows an error toast and keeps the dialog open when a no-expense delete fails due to a network error', async () => {
  global.fetch = jest
    .fn()
    .mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          categories: [{ id: 'c1', name: 'Office Supplies', expenseCount: 0 }],
          uncategorisedCount: 0,
        }),
    })
    .mockRejectedValueOnce(new Error('network down'));
  loadPage();
  await flushPromises();

  const row = document.querySelector('.category-row[data-id="c1"]');
  row.querySelector('[data-action="delete"]').click();
  document.getElementById('delete-simple-confirm').click();
  await flushPromises();

  const toast = document.getElementById('toast');
  expect(toast.hidden).toBe(false);
  expect(toast.textContent).toBe('Something went wrong. Please try again.');
  expect(document.getElementById('delete-simple-backdrop').hidden).toBe(false);
});

test('shows an error toast and keeps the dialog open when a reassign delete fails due to a network error', async () => {
  global.fetch = jest
    .fn()
    .mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          categories: [
            { id: 'c1', name: 'Groceries', expenseCount: 2 },
            { id: 'c2', name: 'Food', expenseCount: 0 },
          ],
          uncategorisedCount: 0,
        }),
    })
    .mockRejectedValueOnce(new Error('network down'));
  loadPage();
  await flushPromises();

  const row = document.querySelector('.category-row[data-id="c1"]');
  row.querySelector('[data-action="delete"]').click();
  document.getElementById('delete-reassign-confirm').click();
  await flushPromises();

  const toast = document.getElementById('toast');
  expect(toast.hidden).toBe(false);
  expect(toast.textContent).toBe('Something went wrong. Please try again.');
  expect(document.getElementById('delete-reassign-backdrop').hidden).toBe(false);
});

test('shows a spinner and disables the button while creating', async () => {
  let resolveCreate;
  global.fetch = jest
    .fn()
    .mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ categories: [], uncategorisedCount: 0 }),
    })
    .mockReturnValueOnce(
      new Promise((resolve) => {
        resolveCreate = resolve;
      })
    )
    .mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          categories: [{ id: 'x', name: 'Travel', expenseCount: 0 }],
          uncategorisedCount: 0,
        }),
    });
  loadPage();
  await flushPromises();
  document.getElementById('create-input').value = 'Travel';
  document.getElementById('create-form').dispatchEvent(new Event('submit', { cancelable: true }));
  const submitBtn = document.getElementById('create-submit');
  expect(submitBtn.disabled).toBe(true);
  expect(submitBtn.querySelector('.spinner').hidden).toBe(false);
  resolveCreate({
    ok: true,
    json: () => Promise.resolve({ id: 'x', name: 'Travel', expenseCount: 0 }),
  });
  await flushPromises();
});

test('ignores a second submit while the first is still saving', async () => {
  let resolveCreate;
  global.fetch = jest
    .fn()
    .mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ categories: [], uncategorisedCount: 0 }),
    })
    .mockReturnValueOnce(
      new Promise((resolve) => {
        resolveCreate = resolve;
      })
    )
    .mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          categories: [{ id: 'x', name: 'Travel', expenseCount: 0 }],
          uncategorisedCount: 0,
        }),
    });
  loadPage();
  await flushPromises();
  document.getElementById('create-input').value = 'Travel';
  const form = document.getElementById('create-form');
  form.dispatchEvent(new Event('submit', { cancelable: true }));
  form.dispatchEvent(new Event('submit', { cancelable: true }));
  expect(global.fetch).toHaveBeenCalledTimes(2); // 1 initial GET on load + exactly 1 POST
  resolveCreate({
    ok: true,
    json: () => Promise.resolve({ id: 'x', name: 'Travel', expenseCount: 0 }),
  });
  await flushPromises();
});
