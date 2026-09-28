/** @jest-environment jsdom */
const fs = require('fs');
const path = require('path');

const HTML_PATH = path.join(__dirname, '..', 'public', 'rate-plans.html');

function fixtureRoomTypes() {
  return [
    { id: 'rt-queen', name: 'Standard Queen', baseRate: 120 },
    { id: 'rt-king', name: 'Deluxe King', baseRate: 150 },
    { id: 'rt-suite', name: 'Suite', baseRate: 240 },
    { id: 'rt-twin', name: 'Twin', baseRate: 110 },
  ];
}

function fixturePlan(overrides) {
  return {
    id: 'plan-summer',
    name: 'Summer Peak 2026',
    startDate: '2026-06-01',
    endDate: '2026-08-31',
    createdAt: '2026-03-01T10:00:00.000Z',
    prices: { 'rt-queen': 160 },
    ...overrides,
  };
}

describe('Rate Plans UI', () => {
  beforeEach(() => {
    jest.resetModules();
    document.documentElement.innerHTML = fs.readFileSync(HTML_PATH, 'utf8');
  });

  test('AC7 UI: an empty rate plan list shows the empty-state prompt', () => {
    const { initRatePlansApp } = require('../public/js/rate-plans');
    initRatePlansApp(document, fixtureRoomTypes(), [], {});
    expect(document.getElementById('rp-empty').hidden).toBe(false);
    expect(document.getElementById('rp-empty').textContent).toContain('No rate plans yet');
  });

  test('AC1 UI: saving a new plan calls the api and lists it', async () => {
    const created = fixturePlan();
    const api = { create: jest.fn().mockResolvedValue(created) };
    const { initRatePlansApp } = require('../public/js/rate-plans');
    initRatePlansApp(document, fixtureRoomTypes(), [], api);

    document.getElementById('new-plan-btn').click();
    document.getElementById('plan-name').value = 'Summer Peak 2026';
    document.getElementById('plan-start').value = '2026-06-01';
    document.getElementById('plan-end').value = '2026-08-31';
    document.querySelector('.price-row-select').value = 'rt-queen';
    document.querySelector('.price-row-input').value = '160';

    document.getElementById('save-plan-btn').click();
    await Promise.resolve(); await Promise.resolve();

    expect(api.create).toHaveBeenCalledWith(expect.objectContaining({ name: 'Summer Peak 2026', prices: { 'rt-queen': 160 } }));
    expect(document.getElementById('rp-grid').textContent).toContain('Summer Peak 2026');
  });

  test('AC3 UI: removing a price row updates the not-listed hint with that room type', () => {
    const { initRatePlansApp } = require('../public/js/rate-plans');
    initRatePlansApp(document, fixtureRoomTypes(), [], {});
    document.getElementById('new-plan-btn').click();
    document.querySelector('.price-row-remove').click();
    expect(document.getElementById('not-listed-hint').textContent).toContain('Standard Queen');
  });

  test('AC5/AC6 UI: a missing name and an end date before the start date show inline errors and block save', () => {
    const api = { create: jest.fn() };
    const { initRatePlansApp } = require('../public/js/rate-plans');
    initRatePlansApp(document, fixtureRoomTypes(), [], api);
    document.getElementById('new-plan-btn').click();

    document.getElementById('plan-name').value = '';
    document.getElementById('plan-start').value = '2026-08-10';
    document.getElementById('plan-end').value = '2026-08-01';
    document.querySelector('.price-row-select').value = 'rt-queen';
    document.querySelector('.price-row-input').value = '100';

    document.getElementById('save-plan-btn').click();

    expect(document.getElementById('err-name').hidden).toBe(false);
    expect(document.getElementById('err-end').hidden).toBe(false);
    expect(api.create).not.toHaveBeenCalled();
  });

  test('AC8 UI: a base-rate lookup result renders the base-rate badge', async () => {
    const api = { resolvePrice: jest.fn().mockResolvedValue({ price: 110, source: 'base', ratePlanId: null, overlapping: false, otherRatePlanIds: [] }) };
    const { initRatePlansApp } = require('../public/js/rate-plans');
    initRatePlansApp(document, fixtureRoomTypes(), [], api);
    document.getElementById('rate-plans-screen').querySelector('[data-goto="lookup"]').click();
    document.getElementById('lookup-submit-btn').click();
    await Promise.resolve(); await Promise.resolve();
    expect(document.getElementById('lookup-result').textContent).toContain('Base rate');
  });

  test('AC4 UI: an overlapping lookup result names the winning plan and never throws', async () => {
    const winner = fixturePlan({ id: 'plan-laborday', name: 'Labor Day Weekend' });
    const api = { resolvePrice: jest.fn().mockResolvedValue({ price: 205, source: 'rate_plan', ratePlanId: 'plan-laborday', overlapping: true, otherRatePlanIds: ['plan-summer'] }) };
    const { initRatePlansApp } = require('../public/js/rate-plans');
    initRatePlansApp(document, fixtureRoomTypes(), [fixturePlan(), winner], api);
    document.querySelector('[data-goto="lookup"]').click();
    document.getElementById('lookup-submit-btn').click();
    await Promise.resolve(); await Promise.resolve();
    expect(document.getElementById('lookup-result').textContent).toContain('Labor Day Weekend');
    expect(document.getElementById('lookup-result').textContent).toContain('never errors');
  });

  test('AC2 UI: editing an existing plan pre-fills the form and saves via update', async () => {
    const plan = fixturePlan();
    const updated = { ...plan, prices: { 'rt-queen': 175 } };
    const api = { update: jest.fn().mockResolvedValue(updated) };
    const { initRatePlansApp } = require('../public/js/rate-plans');
    initRatePlansApp(document, fixtureRoomTypes(), [plan], api);

    document.querySelector('[data-action="edit"]').click();
    expect(document.getElementById('plan-name').value).toBe('Summer Peak 2026');

    document.querySelector('.price-row-input').value = '175';
    document.getElementById('save-plan-btn').click();
    await Promise.resolve(); await Promise.resolve();

    expect(api.update).toHaveBeenCalledWith(plan.id, expect.objectContaining({ prices: { 'rt-queen': 175 } }));
  });

  test('deleting a plan opens a confirm modal naming the plan, and confirming removes it', async () => {
    const plan = fixturePlan();
    const api = { remove: jest.fn().mockResolvedValue(true) };
    const { initRatePlansApp } = require('../public/js/rate-plans');
    initRatePlansApp(document, fixtureRoomTypes(), [plan], api);

    document.querySelector('[data-action="delete"]').click();
    expect(document.getElementById('delete-modal-wrap').hidden).toBe(false);
    expect(document.getElementById('delete-modal-body').textContent).toContain('Summer Peak 2026');

    document.getElementById('confirm-delete-btn').click();
    await Promise.resolve(); await Promise.resolve();

    expect(api.remove).toHaveBeenCalledWith(plan.id);
    expect(document.getElementById('rp-empty').hidden).toBe(false);
  });
});
