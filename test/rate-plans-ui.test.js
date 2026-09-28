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
  return {
    id: 'RP-1001',
    name: 'Summer Peak 2026',
    startDate: '2026-06-01',
    endDate: '2026-08-31',
    createdAt: '2026-02-10T09:00:00.000Z',
    updatedAt: '2026-02-10T09:00:00.000Z',
    prices: [{ roomType: 'STD-KING', price: 159 }],
    ...overrides,
  };
}

describe('Rate Plans UI', () => {
  beforeEach(() => {
    jest.resetModules();
    document.documentElement.innerHTML = fs.readFileSync(HTML_PATH, 'utf8');
  });

  test('AC1 UI: creating a valid rate plan calls the api and re-renders the list', async () => {
    const created = fixturePlan({ id: 'RP-2001', name: 'Brand New Plan' });
    const api = { create: jest.fn().mockResolvedValue(created) };
    const { initRatePlansApp } = require('../public/js/rate-plans');
    initRatePlansApp(document, [], ROOM_TYPES_FIXTURE, api);

    document.getElementById('new-plan-btn').click();
    document.getElementById('plan-name').value = 'Brand New Plan';
    document.getElementById('plan-start').value = '2026-06-01';
    document.getElementById('plan-end').value = '2026-08-31';
    document.getElementById('price-room-0').value = 'STD-KING';
    document.getElementById('price-room-0').dispatchEvent(new Event('change'));
    document.getElementById('price-amount-0').value = '159';
    document.getElementById('price-amount-0').dispatchEvent(new Event('input'));

    document.getElementById('editor-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await Promise.resolve(); await Promise.resolve();

    expect(api.create).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Brand New Plan', startDate: '2026-06-01', endDate: '2026-08-31',
      prices: [{ roomType: 'STD-KING', price: 159 }],
    }));
    expect(document.getElementById('rp-tbody').textContent).toContain('Brand New Plan');
  });

  test('AC2 UI: editing an existing plan prefills the form and calls api.update with the new values', async () => {
    const plan = fixturePlan();
    const updated = { ...plan, prices: [{ roomType: 'STD-KING', price: 99 }] };
    const api = { update: jest.fn().mockResolvedValue(updated) };
    const { initRatePlansApp } = require('../public/js/rate-plans');
    initRatePlansApp(document, [plan], ROOM_TYPES_FIXTURE, api);

    document.querySelector('[data-action="edit"]').click();
    expect(document.getElementById('plan-name').value).toBe('Summer Peak 2026');
    document.getElementById('price-amount-0').value = '99';
    document.getElementById('price-amount-0').dispatchEvent(new Event('input'));

    document.getElementById('editor-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await Promise.resolve(); await Promise.resolve();

    expect(api.update).toHaveBeenCalledWith(plan.id, expect.objectContaining({
      prices: [{ roomType: 'STD-KING', price: 99 }],
    }));
  });

  test('AC3 UI: removing a price row drops that room type from the saved plan', async () => {
    const plan = fixturePlan({ prices: [{ roomType: 'STD-KING', price: 159 }, { roomType: 'GARDEN', price: 135 }] });
    const api = { update: jest.fn().mockResolvedValue(plan) };
    const { initRatePlansApp } = require('../public/js/rate-plans');
    initRatePlansApp(document, [plan], ROOM_TYPES_FIXTURE, api);

    document.querySelector('[data-action="edit"]').click();
    document.querySelector('.price-row-remove[data-idx="1"]').click();
    document.getElementById('editor-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await Promise.resolve(); await Promise.resolve();

    expect(api.update).toHaveBeenCalledWith(plan.id, expect.objectContaining({
      prices: [{ roomType: 'STD-KING', price: 159 }],
    }));
  });

  test('AC4 UI: overlapping plans render an inline overlap note naming the winning plan', () => {
    const older = fixturePlan({ id: 'RP-1003', name: 'Winter Promo 2026', startDate: '2026-12-01', endDate: '2027-01-15', createdAt: '2026-06-01T10:00:00.000Z', prices: [{ roomType: 'STD-KING', price: 99 }] });
    const newer = fixturePlan({ id: 'RP-1004', name: 'Holiday Flash Sale', startDate: '2026-12-20', endDate: '2026-12-31', createdAt: '2026-09-15T08:00:00.000Z', prices: [{ roomType: 'STD-KING', price: 89 }] });
    const { initRatePlansApp } = require('../public/js/rate-plans');
    initRatePlansApp(document, [older, newer], ROOM_TYPES_FIXTURE, {});
    expect(document.getElementById('rp-tbody').textContent).toContain('overlaps with');
    expect(document.getElementById('rp-tbody').textContent).toContain('Holiday Flash Sale');
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

  test('AC5/AC6 UI: an end date before the start date shows the inline dates error and does not save', () => {
    const api = { create: jest.fn() };
    const { initRatePlansApp } = require('../public/js/rate-plans');
    initRatePlansApp(document, [], ROOM_TYPES_FIXTURE, api);
    document.getElementById('new-plan-btn').click();
    document.getElementById('plan-name').value = 'Bad Range';
    document.getElementById('plan-start').value = '2026-05-10';
    document.getElementById('plan-end').value = '2026-05-01';
    document.getElementById('price-room-0').value = 'GARDEN';
    document.getElementById('price-room-0').dispatchEvent(new Event('change'));
    document.getElementById('price-amount-0').value = '100';
    document.getElementById('price-amount-0').dispatchEvent(new Event('input'));
    document.getElementById('editor-form').dispatchEvent(new Event('submit', { cancelable: true }));
    expect(document.getElementById('error-dates').hidden).toBe(false);
    expect(api.create).not.toHaveBeenCalled();
  });

  test('AC7: an empty rate plan list shows the empty-state prompt', () => {
    const { initRatePlansApp } = require('../public/js/rate-plans');
    initRatePlansApp(document, [], ROOM_TYPES_FIXTURE, {});
    expect(document.getElementById('rp-empty').hidden).toBe(false);
    expect(document.getElementById('rp-table-wrap').hidden).toBe(true);
  });

  test('a non-empty rate plan list shows the table, not the empty state', () => {
    const { initRatePlansApp } = require('../public/js/rate-plans');
    initRatePlansApp(document, [fixturePlan()], ROOM_TYPES_FIXTURE, {});
    expect(document.getElementById('rp-empty').hidden).toBe(true);
    expect(document.getElementById('rp-table-wrap').hidden).toBe(false);
  });

  test('delete confirm modal calls api.remove and removes the row on confirm', async () => {
    const plan = fixturePlan();
    const api = { remove: jest.fn().mockResolvedValue(undefined) };
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

  test('price lookup renders a base-rate result (AC8) with no overlap note', async () => {
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

  test('price lookup renders an overlap note when the result has an overlapping plan (AC4)', async () => {
    const winner = fixturePlan({ id: 'RP-1004', name: 'Holiday Flash Sale', createdAt: '2026-09-15T08:00:00.000Z' });
    const loser = fixturePlan({ id: 'RP-1003', name: 'Winter Promo 2026', createdAt: '2026-06-01T10:00:00.000Z', prices: [{ roomType: 'STD-KING', price: 99 }] });
    const api = {
      priceLookup: jest.fn().mockResolvedValue({
        source: 'plan', roomType: 'STD-KING', price: 89, plan: winner, overlapping: [loser],
      }),
    };
    const { initRatePlansApp } = require('../public/js/rate-plans');
    initRatePlansApp(document, [], ROOM_TYPES_FIXTURE, api);

    document.getElementById('price-lookup-link').click();
    document.querySelector('.preset-btn[data-room="STD-KING"]').click();
    await Promise.resolve(); await Promise.resolve();

    expect(document.getElementById('lookup-overlap-note').hidden).toBe(false);
    expect(document.getElementById('lookup-overlap-text').textContent).toContain('Winter Promo 2026');
  });
});
