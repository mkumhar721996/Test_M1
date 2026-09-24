function createApiError(message, status) {
  const err = new Error(message);
  err.status = typeof status === 'number' ? status : null;
  return err;
}

function requestJson(url, options) {
  return fetch(url, options).then((res) => {
    if (!res.ok) {
      return res.json().catch(() => ({})).then((body) => {
        throw createApiError(body.error || `Request to ${url} failed with status ${res.status}`, res.status);
      });
    }
    if (res.status === 204) return null;
    return res.json();
  });
}

const EXPENSES_STORAGE_KEY = 'expenses';
const EXPENSES_SEED = [
  { id: 'exp_001', date: '2026-09-02', category: 'Travel', description: 'Flight to Chicago client site', amount: 482.50 },
  { id: 'exp_002', date: '2026-09-05', category: 'Meals', description: 'Team lunch — Q3 kickoff', amount: 96.18 },
  { id: 'exp_003', date: '2026-09-10', category: 'Software', description: 'Figma seat renewal', amount: 15.00 },
];

function readExpenses() {
  try {
    const raw = localStorage.getItem(EXPENSES_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* fall through to reseed */ }
  try {
    localStorage.setItem(EXPENSES_STORAGE_KEY, JSON.stringify(EXPENSES_SEED));
  } catch (e) { /* storage unavailable — fall back to in-memory defaults */ }
  return EXPENSES_SEED.map((e) => ({ ...e }));
}

function writeExpenses(list) {
  localStorage.setItem(EXPENSES_STORAGE_KEY, JSON.stringify(list));
}

const expenses = {
  list: () => readExpenses(),
  read: (id) => readExpenses().find((e) => e.id === id),
  create: (fields) => new Promise((resolve, reject) => {
    try {
      const current = readExpenses();
      const created = { ...fields, id: 'exp_' + String(current.length + 1).padStart(3, '0') };
      writeExpenses([created, ...current]);
      resolve(created);
    } catch (e) {
      reject(createApiError('Expense could not be saved.', null));
    }
  }),
  update: (id, changes) => new Promise((resolve, reject) => {
    try {
      const current = readExpenses();
      const idx = current.findIndex((e) => e.id === id);
      if (idx === -1) { reject(createApiError(`Expense ${id} not found.`, 404)); return; }
      const updated = { ...current[idx], ...changes };
      writeExpenses([...current.slice(0, idx), updated, ...current.slice(idx + 1)]);
      resolve(updated);
    } catch (e) {
      reject(createApiError('Expense could not be saved.', null));
    }
  }),
  remove: (id) => new Promise((resolve, reject) => {
    try {
      const current = readExpenses();
      writeExpenses(current.filter((e) => e.id !== id));
      resolve(null);
    } catch (e) {
      reject(createApiError('Expense could not be deleted.', null));
    }
  }),
};

const employees = {
  list: () => requestJson('/hires'),
  read: (id) => requestJson(`/hires/${id}`),
  create: (data) => requestJson('/hires', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }),
  update: (id, changes) => requestJson(`/hires/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(changes),
  }),
  remove: (id) => requestJson(`/hires/${id}/deactivate`, { method: 'POST' }),
  reactivate: (id) => requestJson(`/hires/${id}/reactivate`, { method: 'POST' }),
};

module.exports = { expenses, employees, createApiError };
