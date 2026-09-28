const { triggerRun } = require('../src/onboarding/engineClient');

test("triggerRun issues an arc run URL derived from the run's own id", async () => {
  const run = await triggerRun({ hireId: 'hire_1', department: 'Engineering', role: 'SWE II' });
  expect(run.arcRunUrl).toBe(`https://arc.example.com/runs/${run.id}/eval`);
});
