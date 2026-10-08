/** @jest-environment jsdom */
const fs = require('fs');
const path = require('path');

const HTML_PATH = path.join(__dirname, '..', 'public', 'approvals.html');
const stored = (id) => JSON.parse(localStorage.getItem('expenses')).find((e) => e.id === id);
const row = (id) => document.querySelector(`tr[data-row-id="${id}"]`);
const setViewer = (name) => {
  const sel = document.getElementById('viewer-select');
  sel.value = name;
  sel.dispatchEvent(new Event('change'));
};
const confirm = () => {
  document.getElementById('modal-confirm-btn').click();
  jest.advanceTimersByTime(350);
};

describe('Approver review & decision queue', () => {
  beforeEach(() => {
    jest.resetModules();
    localStorage.clear();
    document.documentElement.innerHTML = fs.readFileSync(HTML_PATH, 'utf8');
    jest.useFakeTimers();
    require('../public/js/approvals').initApprovalsApp(document);
  });
  afterEach(() => jest.useRealTimers());

  test('AC1 shared queue lists everyone, including resubmissions', () => {
    const ids = Array.from(document.querySelectorAll('#queue-tbody tr[data-row-id]')).map((tr) => tr.dataset.rowId);
    expect(ids).toEqual(expect.arrayContaining(['exp_201', 'exp_202', 'exp_203', 'exp_204', 'exp_205', 'exp_206']));
  });

  test('AC2 filter and sort helpers and UI cover resubmissions', () => {
    const { filterQueue, sortQueue } = require('../public/js/approvals');
    const list = [{ id: 'exp_205', employeeName: 'Morgan Ellis', amount: 58.2 }, { id: 'exp_206', employeeName: 'Morgan Ellis', amount: 41 }, { id: 'exp_202', employeeName: 'Priya Shah', amount: 86.4 }];
    expect(filterQueue(list, { employee: 'Morgan Ellis' }).map((e) => e.id)).toEqual(['exp_205', 'exp_206']);
    expect(sortQueue(list, 'amount', 'asc').map((e) => e.id)).toEqual(['exp_206', 'exp_205', 'exp_202']);
    const sel = document.getElementById('filter-employee');
    sel.value = 'Morgan Ellis';
    sel.dispatchEvent(new Event('change'));
    expect(document.querySelectorAll('#queue-tbody tr[data-row-id]')).toHaveLength(3);
    expect(row('exp_206')).not.toBeNull();
  });

  test('AC3 row shows employee, category, amount, date, description', () => {
    const r = row('exp_201');
    expect(r.querySelector('.employee-cell').textContent).toMatch(/Morgan Ellis/);
    expect(r.querySelector('.chip').textContent).toBe('Travel');
    expect(r.querySelector('.col-amount').textContent).toBe('$412.75');
    expect(r.children[1].textContent).toBe('09/15/2026');
    expect(r.querySelector('.desc-cell').textContent).toMatch(/Flight to Denver/);
  });

  test('AC4 approve with optional note', () => {
    document.getElementById('viewer-select').value = 'Jordan Lee';
    document.querySelector('[data-action="approve"][data-id="exp_202"]').click();
    confirm();
    expect(stored('exp_202').status).toBe('approved');
  });

  test('AC5/AC6 reject needs a note, then transitions', () => {
    document.querySelector('[data-action="reject"][data-id="exp_210"]').click();
    document.getElementById('modal-confirm-btn').click();
    expect(document.getElementById('decision-note-error').hidden).toBe(false);
    expect(stored('exp_210').status).toBe('submitted');
    document.getElementById('decision-note').value = 'Missing itemized receipt.';
    confirm();
    expect(stored('exp_210').status).toBe('rejected');
  });

  test('AC7 own expense has no actions', () => {
    setViewer('Morgan Ellis');
    ['exp_201', 'exp_205', 'exp_206'].forEach((id) => {
      expect(row(id).querySelector('[data-action]')).toBeNull();
    });
    expect(row('exp_201').querySelector('.self-note').textContent).toMatch(/Submitted by you/);
  });

  test('self-approval is blocked by submitter, not last decider', () => {
    document.querySelector('[data-action="approve"][data-id="exp_202"]').click();
    document.getElementById('viewer-select').value = 'Priya Shah';
    confirm();
    expect(stored('exp_202').status).toBe('submitted');
  });

  test('AC8 reverse approval to submitted', () => {
    document.getElementById('viewer-select').value = 'Priya Shah';
    document.querySelector('[data-action="reverse"][data-id="exp_208"]').click();
    confirm();
    expect(stored('exp_208').status).toBe('submitted');
    expect(stored('exp_208').decisions.slice(-1)[0].action).toBe('reversed_to_submitted');
  });

  test('AC9 reverse to rejected requires note and shows consequence', () => {
    document.querySelector('[data-action="reverse"][data-id="exp_211"]').click();
    expect(document.getElementById('reverse-consequence').hidden).toBe(true);
    document.querySelector('input[name="reverse-target"][value="rejected"]').click();
    expect(document.getElementById('reverse-consequence').hidden).toBe(false);
    document.getElementById('modal-confirm-btn').click();
    expect(document.getElementById('decision-note-error').hidden).toBe(false);
    document.getElementById('decision-note').value = 'Reversing — duplicate of exp_207.';
    confirm();
    expect(stored('exp_211').status).toBe('rejected');
    expect(stored('exp_211').decisions.slice(-1)[0].action).toBe('reversed_to_rejected');
  });

  test('AC10 over-limit approval has no block or warning', () => {
    document.getElementById('viewer-select').value = 'Jordan Lee';
    document.querySelector('[data-action="approve"][data-id="exp_203"]').click();
    expect(document.querySelector('#modal-body [class*="block" i], #modal-body [class*="warning" i]')).toBeNull();
    confirm();
    expect(stored('exp_203').status).toBe('approved');
  });

  test('AC11 reimbursed is never actionable', () => {
    ['Morgan Ellis', 'Priya Shah', 'Devon Ruiz', 'Jordan Lee'].forEach((name) => {
      setViewer(name);
      expect(row('exp_209').querySelector('[data-action]')).toBeNull();
      expect(row('exp_209').querySelector('.dash-cell').textContent).toBe('—');
    });
  });

  test('AC12 submitted shows approve and reject', () => {
    expect(row('exp_204').querySelector('[data-action="approve"]')).not.toBeNull();
    expect(row('exp_204').querySelector('[data-action="reject"]')).not.toBeNull();
  });

  test('AC13 decided row shows outcome and reverse only', () => {
    const r = row('exp_207');
    expect(r.querySelector('.status-chip.is-approved')).not.toBeNull();
    expect(r.querySelector('[data-action="reverse"]')).not.toBeNull();
    expect(r.querySelector('[data-action="approve"]')).toBeNull();
  });

  test('AC14 decisions record actor and timestamp', () => {
    document.getElementById('viewer-select').value = 'Devon Ruiz';
    document.querySelector('[data-action="approve"][data-id="exp_204"]').click();
    confirm();
    const decision = stored('exp_204').decisions.slice(-1)[0];
    expect(decision).toMatchObject({ action: 'approved', actor: 'Devon Ruiz' });
    expect(() => new Date(decision.timestamp).toISOString()).not.toThrow();
  });

  test('legacy expenses.js records are normalized and not overwritten', () => {
    jest.resetModules();
    localStorage.setItem('expenses', JSON.stringify([{ id: 'exp_001', date: '2026-09-02', category: 'Travel', description: 'Flight', amount: 482.5, loggedBy: 'Morgan Ellis' }]));
    const { loadQueueExpenses } = require('../public/js/approvals');
    const list = loadQueueExpenses();
    const legacy = list.find((e) => e.id === 'exp_001');
    expect(legacy).toMatchObject({ employeeName: 'Morgan Ellis', status: 'submitted', decisions: [] });
    expect(list).toHaveLength(12);
  });
});
