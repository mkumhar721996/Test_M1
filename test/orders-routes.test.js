const request = require('supertest');
const app = require('../src/server');
const { createOrder } = require('../src/orders/store');

const ME = { 'x-customer-id': 'cust-a' };
const OTHER = { 'x-customer-id': 'cust-b' };

function make(status, customerId = 'cust-a') {
  return createOrder({ customerId, restaurant: 'Taco Corner', items: [{ name: 'Tacos', qty: 3 }], total: '$18.20', status });
}

describe('orders routes', () => {
  test('AC3/AC4: POST /orders/:id/cancel approves and cancels', async () => {
    const order = make('accepted');
    const res = await request(app).post(`/orders/${order.id}/cancel`).set(ME).send({});
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ approved: true, order: { status: 'cancelled' } });
  });

  test('AC5: rejected cancellation returns approved false', async () => {
    const order = make('delivered');
    const res = await request(app).post(`/orders/${order.id}/cancel`).set(ME).send({});
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ approved: false, order: { status: 'delivered' } });
  });

  test('unknown order id returns 404', async () => {
    const res = await request(app).post('/orders/not-a-real-id/cancel').set(ME).send({});
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('order not found');
  });

  test('GET /orders lists only the caller\'s orders; GET /orders/:id fetches', async () => {
    const mine = make('placed');
    const theirs = make('placed', 'cust-b');
    const list = await request(app).get('/orders').set(ME);
    expect(list.status).toBe(200);
    const ids = list.body.map((o) => o.id);
    expect(ids).toContain(mine.id);
    expect(ids).not.toContain(theirs.id);
    expect((await request(app).get(`/orders/${mine.id}`).set(ME)).body.id).toBe(mine.id);
    expect((await request(app).get('/orders/zzz').set(ME)).status).toBe(404);
  });

  test.each([
    ['get', '/orders'],
    ['get', '/orders/ORD-48213'],
    ['post', '/orders/ORD-48213/cancel'],
  ])('%s %s without a customer identity is 401', async (method, url) => {
    const res = await request(app)[method](url);
    expect(res.status).toBe(401);
  });

  test("another customer's order is a 404 and is not cancelled", async () => {
    const order = make('placed');
    const get = await request(app).get(`/orders/${order.id}`).set(OTHER);
    expect(get.status).toBe(404);
    const cancel = await request(app).post(`/orders/${order.id}/cancel`).set(OTHER).send({});
    expect(cancel.status).toBe(404);
    const still = await request(app).get(`/orders/${order.id}`).set(ME);
    expect(still.body.status).toBe('placed');
  });
});
