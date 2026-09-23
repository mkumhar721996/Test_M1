const request = require('supertest');
const app = require('../src/server');

test('AC7: overlapping branch conditions are rejected on save', async () => {
  const res = await request(app)
    .post('/workflows')
    .send({
      name: 'Bad Workflow',
      hireAttributeSchema: ['hireType'],
      branches: [
        {
          id: 'a',
          condition: { attribute: 'hireType', operator: 'equals', value: 'remote-contractor' },
          taskIds: ['t1'],
        },
        {
          id: 'b',
          condition: { attribute: 'hireType', operator: 'in', value: ['remote-contractor', 'employee'] },
          taskIds: ['t2'],
        },
      ],
      defaultTaskIds: [],
    });

  expect(res.status).toBe(400);
  expect(res.body.error).toMatch(/can both be satisfied/);
});
