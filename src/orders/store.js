const crypto = require('crypto');

const orders = new Map();

const CANCELLABLE_STATUSES = ['placed', 'pending', 'accepted', 'preparing'];

function createOrder(data) {
  const order = {
    id: data.id || `ORD-${crypto.randomUUID().slice(0, 8)}`,
    restaurant: data.restaurant,
    items: data.items || [],
    total: data.total,
    placedAt: data.placedAt || new Date().toISOString(),
    eta: data.eta || '',
    status: data.status || 'placed',
  };
  orders.set(order.id, order);
  return { ...order };
}

function getOrder(id) {
  const order = orders.get(id);
  return order ? { ...order } : undefined;
}

function listOrders() {
  return Array.from(orders.values()).map((o) => ({ ...o }));
}

// Approved while the order is still in a cancellable status; rejected once it
// has left that window (e.g. a pickup raced the request).
function requestCancellation(orderId) {
  const order = orders.get(orderId);
  if (!order) return undefined;
  if (!CANCELLABLE_STATUSES.includes(order.status)) {
    return { approved: false, order: { ...order } };
  }
  order.status = 'cancelled';
  order.cancelledAt = new Date().toISOString();
  return { approved: true, order: { ...order } };
}

function seedExampleOrders() {
  createOrder({ id: 'ORD-48213', restaurant: 'Green Bowl Kitchen', items: [{ name: 'Harvest grain bowl', qty: 1 }, { name: 'Iced hibiscus tea', qty: 2 }], total: '$24.50', placedAt: '6:42 PM', eta: '7:10 PM', status: 'preparing' });
  createOrder({ id: 'ORD-48198', restaurant: 'Taco Corner', items: [{ name: 'Carne asada tacos', qty: 3 }, { name: 'Horchata', qty: 1 }], total: '$18.20', placedAt: '6:51 PM', eta: '7:20 PM', status: 'accepted' });
  createOrder({ id: 'ORD-48221', restaurant: 'Noodle & Co.', items: [{ name: 'Spicy miso ramen', qty: 1 }], total: '$14.75', placedAt: '7:02 PM', eta: '7:35 PM', status: 'placed' });
  createOrder({ id: 'ORD-48219', restaurant: 'Corner Bakery', items: [{ name: 'Breakfast sandwich', qty: 2 }], total: '$12.00', placedAt: '7:05 PM', eta: '7:30 PM', status: 'pending' });
  createOrder({ id: 'ORD-48176', restaurant: 'Sushi Express', items: [{ name: 'Rainbow roll', qty: 2 }], total: '$32.00', placedAt: '5:50 PM', eta: 'Picked up 6:12 PM', status: 'picked_up' });
  createOrder({ id: 'ORD-48154', restaurant: 'Pasta House', items: [{ name: 'Fettuccine alfredo', qty: 1 }], total: '$21.75', placedAt: '5:10 PM', eta: 'Delivered 5:41 PM', status: 'delivered' });
}

seedExampleOrders();

module.exports = { CANCELLABLE_STATUSES, createOrder, getOrder, listOrders, requestCancellation };
