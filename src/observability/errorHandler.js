function logUnexpectedError(err, req) {
  console.error({
    message: err.message,
    stack: err.stack,
    route: req.route ? `${req.baseUrl}${req.route.path}` : req.path,
    method: req.method,
    params: req.params,
    requestId: req.headers['x-request-id'],
  });
}

function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  logUnexpectedError(err, req);
  res.status(500).json({ error: 'internal server error' });
}

module.exports = { errorHandler, logUnexpectedError };
