import express from 'express';
import { errorHandler } from './middleware/errorHandler';
import { EmployeeRepository } from './repository/employeeRepository';
import { createEmployeesRouter } from './routes/employees';

export function createApp() {
  const app = express();
  const repo = new EmployeeRepository();

  app.use(express.json());
  app.use('/api/employees', createEmployeesRouter(repo));
  app.use(errorHandler);

  return app;
}
