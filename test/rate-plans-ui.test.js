/** @jest-environment jsdom */
const fs = require('fs');
const path = require('path');

const HTML_PATH = path.join(__dirname, '..', 'public', 'rate-plans.html');

const ROOM_TYPES_FIXTURE = [
  { code: 'STD-KING', name: 'Standard King', baseRate: 129 },
  { code: 'GARDEN', name: 'Garden Room', baseRate: 149 },
  { code: 'OCEAN', name: 'Ocean View Suite', baseRate: 189 },
  { code: 'POOLSIDE', name: 'Poolside Cabana Suite', baseRate: 219 },
];

function fixturePlan(overrides) {
  return Object.assign({
    id: 'RP-1001',
    name: 'Summer Peak 2026',
    startDate: '2026-06-01',
    endDate: '2026-08-31',
    createdAt: '2026-02-10T09:00:00.000Z',
    updatedAt: '2026-02-10T09:00:00.000Z',
    prices: [{ roomType: 'STD-KING', price: 159 }],
  }, overrides);
}

describe('Rate Plans UI', () => {
  beforeEach(() => {
    jest.resetModules();
    document.documentElement.innerHTML = fs.readFileSync(HTML_PATH, 'utf8');
  });

  test('AC7: an empty rate plan list shows the empty-state prompt', () => {
    const { initRatePlansApp } = require('../public/js/rate-plans');
    initRatePlansApp(document, [], ROOM_TYPES_FIXTURE, {});
    expect(document.getElementById('rp-empty').hidden).toBe(false);
    expect(document.getElementById('rp-table-wrap').hidden).toBe(true);
  });

  test('a non-empty rate plan list shows the table, not the empty state', () => {
    const plan = fixturePlan();
    const { initRatePlansApp } = require('../public/js/rate-plans');
    initRatePlansApp(document, [plan], ROOM_TYPES_FIXTURE, {});
    expect(document.getElementById('rp-table-wrap').hidden).toBe(false);
    expect(document.getElementById('rp-empty').hidden).toBe(true);
    expect(document.getElementById('rp-tbody').textContent).toContain('Summer Peak 2026');
  });

  test('a plan name containing HTML is rendered as text, not executed as markup', () => {
    const plan = fixturePlan({ name: '<img src=x onerror="window.__xss=true">' });
    const { initRatePlansApp } = require('../public/js/rate-plans');
    initRatePlansApp(document, [plan], ROOM_TYPES_FIXTURE, {});
    expect(document.getElementById('rp-tbody').querySelector('img')).toBeNull();
    expect(document.getElementById('rp-tbody').textContent).toContain('<img src=x onerror="window.__xss=true">');
    expect(window.__xss).toBeUndefined();
  });

  test('AC5/AC6 UI: submitting the editor with a blank name shows the inline error and adds nothing to the list', () => {
    const api = { create: jest.fn() };
    const { initRatePlansApp } = require('../public/js/rate-plans');
    initRatePlansApp(document, [], ROOM_TYPES_FIXTURE, api);
    document.getElementById('new-plan-btn').click();
    document.getElementById('editor-form').dispatchEvent(new Event('submit', { cancelable: true }));
    expect(document.getElementById('error-name').hidden).toBe(false);
    expect(api.create).not.toHaveBeenCalled();
  });

  test('AC5/AC6 UI: an end date before the start date shows the inline dates error', () => {
    const api = { create: jest.fn() };
    const { initRatePlansApp } = require('../public/js/rate-plans');
    initRatePlansApp(document, [], ROOM_TYPES_FIXTURE, api);
    document.getElementById('new-plan-btn').click();
    document.getElementById('plan-name').value = 'Bad Range';
    document.getElementById('plan-start').value = '2026-05-10';
    document.getElementById('plan-end').value = '2026-05-01';
    document.getElementById('add-price-row-btn').click();
    const roomSelect = document.querySelector('[data-role="room-select"]');
    roomSelect.value = 'GARDEN';
    roomSelect.dispatchEvent(new Event('change'));
    const priceInput = document.querySelector('[data-role="price-input"]');
    priceInput.value = '100';
    priceInput.dispatchEvent(new Event('input'));
    document.getElementById('editor-form').dispatchEvent(new Event('submit', { cancelable: true }));
    expect(document.getElementById('error-dates').hidden).toBe(false);
    expect(api.create).not.toHaveBeenCalled();
  });

  test('AC1 UI: creating a valid plan calls api.create and adds it to the list', async () => {
    const created = fixturePlan({ id: 'RP-2001', name: 'New Plan' });
    const api = { create: jest.fn().mockResolvedValue(created) };
    const { initRatePlansApp } = require('../public/js/rate-plans');
    initRatePlansApp(document, [], ROOM_TYPES_FIXTURE, api);
    document.getElementById('new-plan-btn').click();
    document.getElementById('plan-name').value = 'New Plan';
    document.getElementById('plan-start').value = '2026-06-01';
    document.getElementById('plan-end').value = '2026-08-31';
    document.getElementById('add-price-row-btn').click();
    const roomSelect = document.querySelector('[data-role="room-select"]');
    roomSelect.value = 'STD-KING';
    roomSelect.dispatchEvent(new Event('change'));
    const priceInput = document.querySelector('[data-role="price-input"]');
    priceInput.value = '159';
    priceInput.dispatchEvent(new Event('input'));
    document.getElementById('editor-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await Promise.resolve(); await Promise.resolve();
    expect(api.create).toHaveBeenCalledWith(expect.objectContaining({ name: 'New Plan' }));
    expect(document.getElementById('rp-tbody').textContent).toContain('New Plan');
  });

  test('AC9/AC8 UI: a base-rate price lookup result renders the base rate, no overlap note', async () => {
    const api = { priceLookup: jest.fn().mockResolvedValue({ source: 'base', roomType: 'GARDEN', price: 149 }) };
    const { initRatePlansApp } = require('../public/js/rate-plans');
    initRatePlansApp(document, [], ROOM_TYPES_FIXTURE, api);
    document.getElementById('price-lookup-link').click();
    document.getElementById('lookup-room').value = 'GARDEN';
    document.getElementById('lookup-date').value = '2026-03-01';
    document.getElementById('lookup-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await Promise.resolve(); await Promise.resolve();
    expect(document.getElementById('lookup-price').textContent).toBe('$149/night');
    expect(document.getElementById('lookup-overlap-note').hidden).toBe(true);
  });

  test('AC4/AC5 UI: an overlapping price lookup result renders the overlap note', async () => {
    const winner = fixturePlan({ id: 'RP-1004', name: 'Holiday Flash Sale', createdAt: '2026-09-15T08:00:00.000Z', prices: [{ roomType: 'STD-KING', price: 89 }] });
    const older = fixturePlan({ id: 'RP-1003', name: 'Winter Promo 2026', createdAt: '2026-06-01T10:00:00.000Z', prices: [{ roomType: 'STD-KING', price: 99 }] });
    const result = { source: 'plan', roomType: 'STD-KING', price: 89, plan: winner, overlapping: [older] };
    const api = { priceLookup: jest.fn().mockResolvedValue(result) };
    const { initRatePlansApp } = require('../public/js/rate-plans');
    initRatePlansApp(document, [], ROOM_TYPES_FIXTURE, api);
    document.getElementById('price-lookup-link').click();
    document.getElementById('lookup-room').value = 'STD-KING';
    document.getElementById('lookup-date').value = '2026-12-25';
    document.getElementById('lookup-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await Promise.resolve(); await Promise.resolve();
    expect(document.getElementById('lookup-price').textContent).toBe('$89/night');
    expect(document.getElementById('lookup-overlap-note').hidden).toBe(false);
    expect(document.getElementById('lookup-overlap-text').textContent).toContain('Winter Promo 2026');
  });

  test('computeOverlapsForPlan reports the deterministic tie-break (most-recently-created wins)', () => {
    const older = fixturePlan({ id: 'RP-1003', name: 'Winter Promo 2026', startDate: '2026-12-01', endDate: '2027-01-15', createdAt: '2026-06-01T10:00:00.000Z', prices: [{ roomType: 'STD-KING', price: 99 }] });
    const newer = fixturePlan({ id: 'RP-1004', name: 'Holiday Flash Sale', startDate: '2026-12-20', endDate: '2026-12-31', createdAt: '2026-09-15T08:00:00.000Z', prices: [{ roomType: 'STD-KING', price: 89 }] });
    const { computeOverlapsForPlan } = require('../public/js/rate-plans');
    const overlapsForNewer = computeOverlapsForPlan(newer, [older, newer]);
    expect(overlapsForNewer).toHaveLength(1);
    expect(overlapsForNewer[0].winnerIsThis).toBe(true);
    expect(overlapsForNewer[0].other.id).toBe(older.id);
  });

  test('a failed create shows an error toast and does not add the plan to the list', async () => {
    const api = { create: jest.fn().mockRejectedValue(new Error('network error')) };
    const { initRatePlansApp } = require('../public/js/rate-plans');
    initRatePlansApp(document, [], ROOM_TYPES_FIXTURE, api);
    document.getElementById('new-plan-btn').click();
    document.getElementById('plan-name').value = 'Will Fail';
    document.getElementById('plan-start').value = '2026-06-01';
    document.getElementById('plan-end').value = '2026-08-31';
    document.getElementById('add-price-row-btn').click();
    const roomSelect = document.querySelector('[data-role="room-select"]');
    roomSelect.value = 'STD-KING';
    roomSelect.dispatchEvent(new Event('change'));
    const priceInput = document.querySelector('[data-role="price-input"]');
    priceInput.value = '159';
    priceInput.dispatchEvent(new Event('input'));
    document.getElementById('editor-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await Promise.resolve(); await Promise.resolve();
    expect(document.getElementById('toast').hidden).toBe(false);
    expect(document.getElementById('rp-tbody').textContent).not.toContain('Will Fail');
  });

  test('deleting a plan opens the confirm modal and removes it from the list on confirm', async () => {
    const plan = fixturePlan();
    const api = { remove: jest.fn().mockResolvedValue(null) };
    const { initRatePlansApp } = require('../public/js/rate-plans');
    initRatePlansApp(document, [plan], ROOM_TYPES_FIXTURE, api);
    document.querySelector('[data-action="delete"]').click();
    expect(document.getElementById('delete-modal').hidden).toBe(false);
    expect(document.getElementById('delete-plan-name').textContent).toBe('Summer Peak 2026');
    document.getElementById('confirm-delete-btn').click();
    await Promise.resolve(); await Promise.resolve();
    expect(api.remove).toHaveBeenCalledWith(plan.id);
    expect(document.getElementById('rp-empty').hidden).toBe(false);
  });
});
