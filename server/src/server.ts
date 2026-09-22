import { createApp } from './app';

const port = Number(process.env.ARC_DEV_PORT ?? 4000);
const app = createApp();

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Register New Employee API listening on port ${port}`);
});
