const app = require('./server');

const port = process.env.ARC_DEV_PORT || 8036;

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
