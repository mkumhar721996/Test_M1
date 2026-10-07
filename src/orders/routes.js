const express = require('express');
const ordersStore = require('./store');
const { requireCustomer } = require('./auth');

const router = express.Router();

router.use(requireCustomer);

router.get('/', (req, res) => {
  res.status(200).json(ordersStore.listOrders(req.customerId));
});

router.get('/:id', (req, res) => {
  const order = ordersStore.getOrder(req.params.id, req.customerId);
  if (!order) return res.status(404).json({ error: 'order not found' });
  res.status(200).json(order);
});

router.post('/:id/cancel', (req, res) => {
  const result = ordersStore.requestCancellation(req.params.id, req.customerId);
  if (!result) return res.status(404).json({ error: 'order not found' });
  res.status(200).json(result);
});

module.exports = router;
