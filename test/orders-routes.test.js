const request = require('supertest');
const app = require('../src/server');
const { createOrder } = require('../src/orders/store');

describe('orders routes', () => {
  test('AC3/AC4: POST /orders/:id/cancel approves and cancels', async () => {
    const order = createOrder({ restaurant: 'Taco Corner', items: [{ name: 'Tacos', qty: 3 }], total: '$18.20', status: 'accepted' });
    const res = await request(app).post(`/orders/${order.id}/cancel`).send({});
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ approved: true, order: { status: 'cancelled' } });
  });

  test('AC5: rejected cancellation returns approved false', async () => {
    const order = createOrder({ restaurant: 'Pasta House', items: [], total: '$1.00', status: 'delivered' });
    const res = await request(app).post(`/orders/${order.id}/cancel`).send({});
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ approved: false, order: { status: 'delivered' } });
  });

  test('unknown order id returns 404', async () => {
    const res = await request(app).post('/orders/not-a-real-id/cancel').send({});
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('order not found');
  });

  test('GET /orders lists and GET /orders/:id fetches', async () => {
    const order = createOrder({ restaurant: 'X', items: [], total: '$1.00', status: 'placed' });
    const list = await request(app).get('/orders');
    expect(list.status).toBe(200);
    expect(list.body.some((o) => o.id === order.id)).toBe(true);
    expect((await request(app).get(`/orders/${order.id}`)).body.id).toBe(order.id);
    expect((await request(app).get('/orders/zzz')).status).toBe(404);
  });
});
