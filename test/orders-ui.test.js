/** @jest-environment jsdom */
const fs = require('fs');
const path = require('path');

const HTML_PATH = path.join(__dirname, '..', 'public', 'orders.html');

function fixtureOrder(overrides) {
  return Object.assign({
    id: 'ORD-48213',
    restaurant: 'Green Bowl Kitchen',
    items: [{ name: 'Harvest grain bowl', qty: 1 }],
    total: '$24.50',
    placedAt: '6:42 PM',
    eta: '7:10 PM',
    status: 'preparing',
  }, overrides);
}

const flush = async () => { await Promise.resolve(); await Promise.resolve(); };

describe('Order tracking cancellation UI', () => {
  beforeEach(() => {
    jest.resetModules();
    document.documentElement.innerHTML = fs.readFileSync(HTML_PATH, 'utf8');
  });

  test.each(['placed', 'pending', 'accepted', 'preparing'])(
    'AC1: a %s order shows an actionable Request cancellation control',
    (status) => {
      const order = fixtureOrder({ id: `ORD-${status}`, status });
      const { initOrdersApp } = require('../public/js/orders');
      initOrdersApp(document, [order], {});
      document.querySelector(`[data-track="ORD-${status}"]`).click();
      const btn = document.getElementById('tracking-cancel-btn');
      expect(btn.disabled).toBe(false);
      btn.click();
      expect(document.getElementById('cancel-modal-wrap').hidden).toBe(false);
    }
  );

  test.each(['picked_up', 'delivered'])(
    'AC2: a %s order shows no cancellation control',
    (status) => {
      const order = fixtureOrder({ id: `ORD-${status}`, status });
      const { initOrdersApp } = require('../public/js/orders');
      initOrdersApp(document, [order], {});
      document.querySelector(`[data-track="ORD-${status}"]`).click();
      expect(document.getElementById('tracking-cancel-btn')).toBeNull();
    }
  );

  test('AC3/AC4: approved cancellation shows success and flips the status chip', async () => {
    const order = fixtureOrder();
    const api = { cancel: jest.fn().mockResolvedValue({ approved: true, order: { ...order, status: 'cancelled', cancelledAt: 'just now' } }) };
    const { initOrdersApp } = require('../public/js/orders');
    initOrdersApp(document, [order], api);
    document.querySelector('[data-track="ORD-48213"]').click();
    document.getElementById('tracking-cancel-btn').click();
    document.getElementById('cancel-confirm-btn').click();
    await flush();
    expect(api.cancel).toHaveBeenCalledWith('ORD-48213');
    expect(document.getElementById('outcome-banner-success').hidden).toBe(false);
    expect(document.getElementById('tracking-status-chip').textContent).toContain('Cancelled');
    expect(document.getElementById('tracking-cancel-btn')).toBeNull();
  });

  test('AC5: rejected cancellation shows the failure message and keeps the control', async () => {
    const order = fixtureOrder({ id: 'ORD-48198', status: 'accepted' });
    const api = { cancel: jest.fn().mockResolvedValue({ approved: false, order: { ...order } }) };
    const { initOrdersApp } = require('../public/js/orders');
    initOrdersApp(document, [order], api);
    document.querySelector('[data-track="ORD-48198"]').click();
    document.getElementById('tracking-cancel-btn').click();
    document.getElementById('cancel-confirm-btn').click();
    await flush();
    expect(document.getElementById('outcome-banner-danger').hidden).toBe(false);
    expect(document.getElementById('tracking-cancel-btn')).not.toBeNull();
  });

  test('a failed request shows an accurate error, not the "already started" copy', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const api = { cancel: jest.fn().mockRejectedValue(new Error('network')) };
    const { initOrdersApp } = require('../public/js/orders');
    initOrdersApp(document, [fixtureOrder()], api);
    document.querySelector('[data-track="ORD-48213"]').click();
    document.getElementById('tracking-cancel-btn').click();
    document.getElementById('cancel-confirm-btn').click();
    await flush();
    expect(spy).toHaveBeenCalled();
    expect(document.getElementById('outcome-banner-danger').hidden).toBe(false);
    expect(document.getElementById('outcome-fail-copy').textContent).toContain("couldn't reach the server");
    spy.mockRestore();
  });

  test('Escape closes the modal without cancelling', () => {
    const api = { cancel: jest.fn() };
    const { initOrdersApp } = require('../public/js/orders');
    initOrdersApp(document, [fixtureOrder()], api);
    document.querySelector('[data-track="ORD-48213"]').click();
    document.getElementById('tracking-cancel-btn').click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(document.getElementById('cancel-modal-wrap').hidden).toBe(true);
    expect(api.cancel).not.toHaveBeenCalled();
  });
});
