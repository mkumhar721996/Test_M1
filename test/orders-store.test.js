const { createOrder, requestCancellation, CANCELLABLE_STATUSES } = require('../src/orders/store');

describe('orders store cancellation', () => {
  test('AC1: cancellable statuses are exactly the four named', () => {
    expect(CANCELLABLE_STATUSES).toEqual(['placed', 'pending', 'accepted', 'preparing']);
  });

  test('AC3/AC4: approves and cancels an order in a cancellable status', () => {
    const order = createOrder({ restaurant: 'Noodle & Co.', items: [{ name: 'Ramen', qty: 1 }], total: '$14.75', status: 'placed' });
    const result = requestCancellation(order.id);
    expect(result.approved).toBe(true);
    expect(result.order.status).toBe('cancelled');
    expect(typeof result.order.cancelledAt).toBe('string');
  });

  test('AC5: rejects a request for an order past the cancellable window', () => {
    const order = createOrder({ restaurant: 'Sushi Express', items: [{ name: 'Rainbow roll', qty: 2 }], total: '$32.00', status: 'picked_up' });
    const result = requestCancellation(order.id);
    expect(result.approved).toBe(false);
    expect(result.order.status).toBe('picked_up');
  });

  test('returns undefined for an unknown order', () => {
    expect(requestCancellation('nope')).toBeUndefined();
  });
});
