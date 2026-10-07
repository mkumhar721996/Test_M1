const express = require('express');
const ordersStore = require('./store');

const router = express.Router();

router.get('/', (req, res) => {
  res.status(200).json(ordersStore.listOrders());
});

router.get('/:id', (req, res) => {
  const order = ordersStore.getOrder(req.params.id);
  if (!order) return res.status(404).json({ error: 'order not found' });
  res.status(200).json(order);
});

router.post('/:id/cancel', (req, res) => {
  const result = ordersStore.requestCancellation(req.params.id);
  if (!result) return res.status(404).json({ error: 'order not found' });
  res.status(200).json(result);
});

module.exports = router;
