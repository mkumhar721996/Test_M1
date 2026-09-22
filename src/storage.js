export const STORAGE_KEY = 'expenses';

export function loadExpenses() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    const list = Array.isArray(parsed) ? parsed : [];
    return list.slice().sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
  } catch {
    return [];
  }
}
