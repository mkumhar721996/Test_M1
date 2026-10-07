summary: |
  Add a dedicated signal-intake path so the Workflow engine can react to pass/not-pass outcomes
  emitted by external gate and document-check services, without the engine owning (or evaluating)
  the logic behind those outcomes. A task in a Run's taskGraph gains an optional
  `requirement.checkType` ('gate' | 'document-check') to declare that it depends on such an
  external check. A new store function `applyCheckSignal(runId, taskId, outcome, actor)` and a
  new route `POST /runs/:id/tasks/:taskId/signal` apply exactly two outcomes: 'pass' marks the
  task done and advances the Run to the next task (or completes the Run if it was the last task),
  and 'not-pass' moves the task to 'blocked'. The audit entry records only the literal outcome
  string — the engine never inspects or stores any "reason"/"details" the caller might also send,
  which is the concrete mechanism behind "does not evaluate the underlying check logic" (AC4/AC5).
scope:
  - description: |
      Extend `buildSteps` in `src/runs/store.js` so a task's optional `requirement.checkType`
      ('gate' | 'document-check') metadata is carried onto the resulting run step as a new
      `checkType` field, alongside the existing `requirementLabel`/`requirementMet`/`blockReason`
      fields already derived from `requirement`. A step without `requirement.checkType` gets
      `checkType: undefined`, exactly like the existing optional fields.
    files:
      - src/runs/store.js
    rationale: |
      This is the only way for a taskGraph to declare "this task depends on a gate or document
      check" (AC1-AC3 precondition). It is purely additive to the existing `requirement` object
      used today for the manual I-9-style blocking flow (`resolveStepRequirement`/`advanceStep`),
      so it does not change any existing behavior or test for that flow.
  - description: |
      Add `applyCheckSignal(runId, taskId, outcome, actor = 'System')` to `src/runs/store.js`:

      ```js
      function applyCheckSignal(runId, taskId, outcome, actor = 'System') {
        const run = runs.get(runId);
        if (!run) return undefined;
        if (run.status === 'completed') return run;

        const idx = run.steps.findIndex((s) => s.id === taskId);
        if (idx === -1) return run;
        const step = run.steps[idx];
        if (!step.checkType) return run;

        if (outcome === 'pass') {
          step.status = 'done';
          const action = `${step.checkType} check signal received for step ${idx + 1} of ${run.steps.length} (${step.name}): pass.`;
          run.auditLog.push({ ts: new Date().toISOString(), actor, action });
          if (idx === run.steps.length - 1) {
            run.status = 'completed';
            if (run.hireId) appendOnboardingAuditEntry(run.hireId, actor, action, { completed: true });
          } else if (idx === run.currentIndex) {
            run.currentIndex = idx + 1;
            run.steps[run.currentIndex].status = 'current';
            run.status = 'active';
          }
        } else if (outcome === 'not-pass') {
          step.status = 'blocked';
          if (idx === run.currentIndex) run.status = 'blocked';
          run.auditLog.push({
            ts: new Date().toISOString(),
            actor,
            action: `${step.checkType} check signal received for step ${idx + 1} of ${run.steps.length} (${step.name}): not-pass.`,
          });
        }
        return run;
      }
      ```

      Export it alongside the existing store functions.
    files:
      - src/runs/store.js
    rationale: |
      This is the engine-side implementation of AC1-AC5. It branches ONLY on the literal
      `outcome` string ('pass' / 'not-pass') and never receives or reads any other field about
      *why* the external check passed or failed — that is the concrete, testable form of
      "the Workflow engine does not evaluate the underlying check logic" (AC5) and "records only
      the signal outcome" (AC4). It mirrors `advanceStep`'s existing final-step-completes and
      next-step-becomes-current transitions for the 'pass' case so Run lifecycle semantics stay
      consistent across both the manual (`advanceStep`/`resolveStepRequirement`) and
      signal-driven paths, but intentionally uses its own audit-message wording so the two paths
      remain independently testable.
  - description: |
      Add `POST /runs/:id/tasks/:taskId/signal` to `src/runs/routes.js`:

      ```js
      router.post('/:id/tasks/:taskId/signal', (req, res) => {
        const { outcome } = req.body;
        if (outcome !== 'pass' && outcome !== 'not-pass') {
          return res.status(400).json({ error: 'outcome must be "pass" or "not-pass"' });
        }
        const run = applyCheckSignal(req.params.id, req.params.taskId, outcome);
        if (!run) return res.status(404).json({ error: 'run not found' });
        res.status(200).json(withHire(run));
      });
      ```

      Import `applyCheckSignal` from `./store` at the top of the file alongside the existing
      imports.
    files:
      - src/runs/routes.js
    rationale: |
      This is the HTTP surface the external gate/document-check services call. It is
      intentionally NOT wrapped in `enforceOnboardingRole` (that middleware is for staff
      member actions identified by `x-staff-role`), mirroring the existing unauthenticated
      `POST /runs/:id/complete` route, which is likewise invoked by a non-staff caller. The
      handler reads only `outcome` from the body and discards everything else, which is what
      keeps any "reason"/"details" a vendor might send from ever reaching engine logic.
  - description: |
      New test file `test/runs-gate-document-signal.test.js` covering AC1-AC5 plus the
      supporting route validation (unknown run -> 404, invalid outcome -> 400, and a task with
      no `checkType` being a no-op) needed to safely implement the above.
    files:
      - test/runs-gate-document-signal.test.js
    rationale: |
      Follows the existing per-feature test file convention (e.g. `runs-step-progression.test.js`,
      `runs-completion.test.js`) rather than growing an existing file with an unrelated concern.
tests:
  - |
    AC1 — a pass signal marks the depending task complete:
    ```js
    test('AC1: a pass signal marks the depending task complete', () => {
      const wf = createWorkflow({ tasks: [
        { id: 't1', name: 'Background check', next: ['t2'], requirement: { label: 'Background check', checkType: 'gate' } },
        { id: 't2', name: 'Step Two', next: [] },
      ] });
      const run = startRun(wf.workflowId);

      const updated = applyCheckSignal(run.id, 't1', 'pass');

      expect(updated.steps[0].status).toBe('done');
    });
    ```
  - |
    AC2 — a pass signal advances the Run to the next task:
    ```js
    test('AC2: a pass signal advances the run to the next task', () => {
      const wf = createWorkflow({ tasks: [
        { id: 't1', name: 'Background check', next: ['t2'], requirement: { label: 'Background check', checkType: 'gate' } },
        { id: 't2', name: 'Step Two', next: [] },
      ] });
      const run = startRun(wf.workflowId);

      const updated = applyCheckSignal(run.id, 't1', 'pass');

      expect(updated.currentIndex).toBe(1);
      expect(updated.steps[1].status).toBe('current');
      expect(updated.status).toBe('active');
    });
    ```
    Also covers the final-task edge case so a pass signal never leaves the run stuck active past
    its last step:
    ```js
    test('AC2 (final task): a pass signal on the last task completes the run', () => {
      const wf = createWorkflow({ tasks: [
        { id: 't1', name: 'Final gate', next: [], requirement: { label: 'Final gate', checkType: 'gate' } },
      ] });
      const run = startRun(wf.workflowId);

      const updated = applyCheckSignal(run.id, 't1', 'pass');

      expect(updated.status).toBe('completed');
      expect(updated.steps[0].status).toBe('done');
    });
    ```
  - |
    AC3 — a not-pass signal moves the depending task to blocked:
    ```js
    test('AC3: a not-pass signal moves the depending task to blocked', () => {
      const wf = createWorkflow({ tasks: [
        { id: 't1', name: 'I-9 document check', next: [], requirement: { label: 'I-9', checkType: 'document-check' } },
      ] });
      const run = startRun(wf.workflowId);

      const updated = applyCheckSignal(run.id, 't1', 'not-pass');

      expect(updated.steps[0].status).toBe('blocked');
      expect(updated.status).toBe('blocked');
      expect(updated.currentIndex).toBe(0);
    });
    ```
  - |
    AC4 — the engine records only the signal outcome:
    ```js
    test('AC4: the audit entry records only the pass/not-pass outcome', () => {
      const wf = createWorkflow({ tasks: [
        { id: 't1', name: 'Background check', next: [], requirement: { label: 'Background check', checkType: 'gate' } },
      ] });
      const run = startRun(wf.workflowId);

      const updated = applyCheckSignal(run.id, 't1', 'not-pass');
      const entry = updated.auditLog[updated.auditLog.length - 1];

      expect(entry.action).toBe('gate check signal received for step 1 of 1 (Background check): not-pass.');
    });
    ```
  - |
    AC5 — the engine does not evaluate the underlying check logic, proven by showing any extra
    fields a caller sends alongside `outcome` are ignored entirely:
    ```js
    test('AC5: extra check-detail fields sent with the signal are ignored', async () => {
      const wf = createWorkflow({ tasks: [
        { id: 't1', name: 'Background check', next: [], requirement: { label: 'Background check', checkType: 'gate' } },
      ] });
      const run = startRun(wf.workflowId);

      const res = await request(app)
        .post(`/runs/${run.id}/tasks/t1/signal`)
        .send({ outcome: 'not-pass', reason: 'candidate failed credit check', evaluatedBy: 'external-vendor', score: 42 });

      expect(res.status).toBe(200);
      expect(res.body.steps[0].status).toBe('blocked');
      const entry = res.body.auditLog[res.body.auditLog.length - 1];
      expect(entry.action).toBe('gate check signal received for step 1 of 1 (Background check): not-pass.');
      expect(entry.action).not.toMatch(/credit check|external-vendor/);
    });
    ```
  - |
    Supporting route-validation tests needed to implement the endpoint safely (not separately
    enumerated as ACs, but required to ship the route):
    ```js
    test('unknown run id is 404', async () => {
      const res = await request(app).post('/runs/does-not-exist/tasks/t1/signal').send({ outcome: 'pass' });
      expect(res.status).toBe(404);
    });

    test('an invalid outcome value is 400', async () => {
      const wf = createWorkflow({ tasks: [{ id: 't1', next: [], requirement: { label: 'X', checkType: 'gate' } }] });
      const run = startRun(wf.workflowId);
      const res = await request(app).post(`/runs/${run.id}/tasks/t1/signal`).send({ outcome: 'maybe' });
      expect(res.status).toBe(400);
    });

    test('a signal for a task with no configured checkType is a no-op', () => {
      const wf = createWorkflow({ tasks: [{ id: 't1', name: 'Manual step', next: [] }] });
      const run = startRun(wf.workflowId);
      const updated = applyCheckSignal(run.id, 't1', 'pass');
      expect(updated.steps[0].status).toBe('current');
    });
    ```
assumptions_or_open_questions:
  - |
    No service-to-service auth/identity scheme exists anywhere in this codebase today (confirmed
    by searching for api-key/bearer/service-token patterns — none found). The new signal endpoint
    is left unauthenticated like the existing `POST /runs/:id/complete` route, which is also
    called by a non-staff caller. If gate/document-check services need to be authenticated,
    that's a separate, broader concern spanning more than this one story.
  - |
    "Depends on a gate or document check" is modeled as a new optional `requirement.checkType`
    field ('gate' | 'document-check') on a taskGraph task. A task with no `checkType` is outside
    this story's scope, so a signal naming such a task is a no-op rather than an error — no AC
    describes error behavior for that case, and silently ignoring it is safer than mutating a
    task the caller may have mis-addressed.
  - |
    AC1-AC3's examples all describe the task that is currently blocking the run (the "current"
    step). This plan generalizes: a pass signal only advances `run.currentIndex` when the
    signaled task IS the current step (marking a non-current/upcoming task done without moving
    the run pointer past earlier incomplete tasks); a not-pass signal only flips the aggregate
    `run.status` to 'blocked' when the signaled task is the current step, though the individual
    task's own `status` always becomes 'blocked'. No AC covers signals on non-current tasks, so
    this is an inference, not a tested requirement beyond the no-op/edge cases listed in `tests`.
  - |
    A pass signal on the final task completes the Run (mirrors `advanceStep`'s existing
    final-step behavior, including calling `appendOnboardingAuditEntry(..., { completed: true })`
    when `hireId` is set) so the run never gets stuck 'active' past its last task. This isn't
    separately named by an AC but is required for AC2's "Run advances" to have a sane terminal
    case.
  - |
    This plan adds a new route and store function; it does not modify the existing manual
    `resolveStepRequirement`/`advanceStep` flow or any of its existing tests/behavior.
package_dependencies: []
notes: |
  Existing `requirement` object today only supports a manual, HR-driven flow: a blocked step's
  `requirementMet` flag is flipped by `POST /runs/:id/resolve-requirement`, and the run only
  re-evaluates it on the *next* `POST /runs/:id/advance` call. That manual path is unrelated to
  (and untouched by) this story's signal-driven path — this story adds a second, independent way
  for a task to resolve, triggered directly by an external system's outcome rather than a staff
  member's action.

  ```mermaid
  flowchart TD
    ext[External gate / document-check service] -->|"POST /runs/:id/tasks/:taskId/signal {outcome}"| routes[src/runs/routes.js]
    routes -->|applyCheckSignal runId, taskId, outcome| store[src/runs/store.js]
    store -->|appendOnboardingAuditEntry on final-task pass, hireId set| hiresStore[src/hires/store.js]
    store --> runsMap[(in-memory runs Map)]

    classDef touched fill:#f96,color:#000
    class routes,store touched
  ```
review_focus: |
  In scope: a new `requirement.checkType` taskGraph field, a new `applyCheckSignal` store
  function, and a new unauthenticated `POST /runs/:id/tasks/:taskId/signal` route — all isolated
  to `src/runs/`. Out of scope: anything that determines WHETHER a gate or document check passes
  (no such logic is added or called), the existing manual `resolveStepRequirement`/`advanceStep`
  flow (untouched), and any UI (no design file exists for this story and none of the ACs are
  UI-facing).

  Riskiest area: the decision of when a signal on a task that is NOT the run's current step
  should (or shouldn't) move `run.currentIndex` / `run.status` — the ACs only ever exercise the
  current-step case, so this plan's handling of the non-current case is an inference documented
  under `assumptions_or_open_questions`, not a literal reading of an AC. Also worth double-checking:
  the endpoint is deliberately left without `enforceOnboardingRole`, since the caller is an
  external service rather than a staff member — this is intentional, not a missed auth check.
