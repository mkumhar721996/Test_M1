function requireCustomer(req, res, next) {
  const customerId = req.headers['x-customer-id'];
  if (!customerId) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  req.customerId = customerId;
  return next();
}

module.exports = { requireCustomer };
