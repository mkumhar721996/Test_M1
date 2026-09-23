summary: |
  This repo has no Run/Workflow concept at all yet — only an unrelated `employees` CRUD API
  (`src/employees/*`) and a client-only `expenses` UI (`public/js/expenses.js`, localStorage).
  There is also no authentication/session system anywhere. TEST-M1-STORY-047 adds the first Run
  lifecycle primitives: an in-memory Run store, a lifecycle module implementing pause/resume/
  cancel with permission checks (assigned HR coordinator or platform admin only), an in-memory
  notification "outbox" (in-app alerts + email) fired on pause, an append-only/immutable audit
  log entry per transition, and the minimal HTTP surface (`POST /runs/:id/pause|resume|cancel`,
  `GET /runs/:id`) plus a small detail page so the "visual in-progress indicator" (AC5) has
  somewhere to live. Everything follows the existing conventions exactly: CommonJS modules,
  in-memory `Map`-backed stores, Express routers mounted in `src/server.js`, Jest + Supertest for
  the backend, and the same "disable button + swap its label while a request is in flight"
  pattern already used by `public/js/expenses.js`'s save button. No task-dispatch engine or
  task-graph exists elsewhere in the repo (that's separate, future work per the parent epic), so
  "no new tasks are dispatched" / "continues from where it was paused" (AC1/AC2) are modeled as a
  pure guard function over a minimal `{ id, state }` task shape already attached to a Run, not a
  real async dispatcher. Per reviewer feedback, this revision widens test coverage beyond the six
  literal acceptance criteria to a set of edge cases each ACs' own guard logic already implies
  but the first pass didn't pin down with a test: repeated/invalid state transitions, unknown
  Run ids, malformed actor payloads, double-submission and network-failure handling on the two
  buttons AC5 covers, multi-transition audit ordering, and a no-op cancel (no in-progress tasks).
  These are called out explicitly as edge-case extensions, not new formal ACs, everywhere they
  appear below.
scope:
  - description: |
      Add the in-memory Run store, mirroring `src/employees/store.js`'s shape:
      ```js
      const crypto = require('crypto');
      const runs = new Map();

      function createRun({ assignedCoordinatorId, state = 'started', tasks = [] }) {
        const run = {
          id: crypto.randomUUID(),
          state,
          assignedCoordinatorId,
          tasks: tasks.map((t) => ({ ...t })),
          auditLog: [],
        };
        runs.set(run.id, run);
        return run;
      }

      function getRun(id) {
        return runs.get(id);
      }

      module.exports = { createRun, getRun };
      ```
      `createRun` is used both internally (future "start a Run" work) and directly by this
      story's tests as fixture setup, since no "create Run via HTTP" AC exists in this story.
    files:
      - src/runs/store.js
    rationale: |
      Every transition needs a Run to mutate; isolating storage the same way
      `src/employees/store.js` does keeps it independently testable and consistent with the
      codebase's one existing precedent for a domain store.
  - description: |
      Add the in-memory notification outbox fired when a Run is paused (AC1):
      ```js
      const inAppAlerts = [];
      const emailQueue = [];

      function notifyCoordinatorPaused(run) {
        const sentAt = new Date().toISOString();
        inAppAlerts.push({ recipientId: run.assignedCoordinatorId, type: 'run_paused', runId: run.id, sentAt });
        emailQueue.push({ to: run.assignedCoordinatorId, subject: `Run ${run.id} paused`, runId: run.id, sentAt });
      }

      function getInAppAlertsFor(recipientId) {
        return inAppAlerts.filter((a) => a.recipientId === recipientId);
      }

      function getEmailQueueFor(recipientId) {
        return emailQueue.filter((e) => e.to === recipientId);
      }

      module.exports = { notifyCoordinatorPaused, getInAppAlertsFor, getEmailQueueFor };
      ```
    files:
      - src/runs/notifications.js
    rationale: |
      AC1 requires both an in-app alert and an email to the assigned coordinator on pause. No
      email provider (nodemailer, SMTP, etc.) is configured anywhere in the repo, so this is an
      in-memory outbox — the same persistence strategy as every other store in this codebase —
      rather than a real send, which is flagged below as an open question.
  - description: |
      Add the lifecycle module: permission checks, the three state transitions, audit-log
      writes, and the dispatch guard. The state-guard `if` checks below are what also make the
      edge-case tests possible (pausing an already-paused run, resuming a non-paused run, and
      cancelling an already-cancelled run all fall through to the same `RunTransitionError`
      without mutating state or notifying, since the guard runs before any mutation).
      ```js
      const { notifyCoordinatorPaused } = require('./notifications');

      class RunTransitionError extends Error {
        constructor(code, message) {
          super(message);
          this.code = code;
        }
      }

      function assertAuthorized(run, actor) {
        const isAssignedCoordinator = Boolean(actor.id) && actor.id === run.assignedCoordinatorId;
        const isPlatformAdmin = actor.role === 'platform_admin';
        if (!isAssignedCoordinator && !isPlatformAdmin) {
          throw new RunTransitionError('FORBIDDEN', 'actor is not authorized to manage this run');
        }
      }

      function recordAudit(run, actor, priorState, newState) {
        run.auditLog.push(Object.freeze({
          actor: actor.id,
          timestamp: new Date().toISOString(),
          priorState,
          newState,
        }));
      }

      function pauseRun(run, actor) {
        assertAuthorized(run, actor);
        if (!['started', 'blocked'].includes(run.state)) {
          throw new RunTransitionError('INVALID_STATE', `cannot pause a run in state '${run.state}'`);
        }
        const priorState = run.state;
        run.state = 'paused';
        recordAudit(run, actor, priorState, 'paused');
        notifyCoordinatorPaused(run);
        return run;
      }

      function resumeRun(run, actor) {
        assertAuthorized(run, actor);
        if (run.state !== 'paused') {
          throw new RunTransitionError('INVALID_STATE', `cannot resume a run in state '${run.state}'`);
        }
        const priorState = run.state;
        run.state = 'started';
        recordAudit(run, actor, priorState, 'started');
        return run;
      }

      function cancelRun(run, actor) {
        assertAuthorized(run, actor);
        if (!['started', 'blocked', 'paused'].includes(run.state)) {
          throw new RunTransitionError('INVALID_STATE', `cannot cancel a run in state '${run.state}'`);
        }
        const priorState = run.state;
        run.tasks.forEach((task) => {
          if (task.state === 'in_progress') {
            task.flaggedForManualCleanup = true;
            task.cancellationSnapshot = { state: task.state, progress: task.progress ?? null, capturedAt: new Date().toISOString() };
          }
        });
        run.state = 'cancelled';
        recordAudit(run, actor, priorState, 'cancelled');
        return run;
      }

      function getNextDispatchableTask(run) {
        if (run.state !== 'started') return null;
        return run.tasks.find((t) => t.state === 'pending') || null;
      }

      module.exports = { pauseRun, resumeRun, cancelRun, getNextDispatchableTask, RunTransitionError };
      ```
    files:
      - src/runs/lifecycle.js
    rationale: |
      This is the single module all six formal ACs exercise: AC1 (pause + no-dispatch + notify),
      AC2 (resume + continue-from-same-task), AC3 (cancel + flag partially completed tasks with a
      snapshot), AC4 (permission rejection, shared by all three actions via `assertAuthorized`),
      AC6 (audit entry per transition, frozen so it can't be mutated after the fact). No new code
      is needed for the invalid-state-transition or empty-task-list edge cases below — the guards
      already written for the happy path cover them; the edge-case work is purely in `tests`.
  - description: |
      Add the HTTP surface: an Express router mounted at `/runs` with the three transition
      endpoints plus a minimal read endpoint the UI needs to hydrate a run's current state
      (no AC in this story calls for listing/creating Runs over HTTP, so only `GET /:id` is
      added, matching the existing `GET /employees/:id` shape). The 404 branch in
      `handleTransition` also covers the edge case of a transition attempted against an id that
      doesn't exist.
      ```js
      const express = require('express');
      const { getRun } = require('./store');
      const { pauseRun, resumeRun, cancelRun, RunTransitionError } = require('./lifecycle');

      const router = express.Router();

      function handleTransition(action) {
        return (req, res) => {
          const run = getRun(req.params.id);
          if (!run) return res.status(404).json({ error: 'run not found' });
          const actor = { id: req.body.actorId, role: req.body.actorRole };
          try {
            res.status(200).json(action(run, actor));
          } catch (err) {
            if (err instanceof RunTransitionError) {
              const status = err.code === 'FORBIDDEN' ? 403 : 409;
              return res.status(status).json({ error: err.message });
            }
            throw err;
          }
        };
      }

      router.get('/:id', (req, res) => {
        const run = getRun(req.params.id);
        if (!run) return res.status(404).json({ error: 'run not found' });
        res.status(200).json(run);
      });

      router.post('/:id/pause', handleTransition(pauseRun));
      router.post('/:id/resume', handleTransition(resumeRun));
      router.post('/:id/cancel', handleTransition(cancelRun));

      module.exports = router;
      ```
      `src/server.js` gains one require and one `app.use('/runs', runsRouter)` line, mirroring
      how `employeesRouter` is already mounted.
    files:
      - src/runs/routes.js
      - src/server.js
    rationale: |
      Translates `RunTransitionError` codes into the HTTP statuses AC4 requires (403 for
      permission failures, 409 for invalid-state edge cases) without leaking domain error
      objects to callers, exactly like `src/employees/routes.js` translates a missing employee
      into a 404 — the same 404 branch handles the "unknown Run id" edge case for free.
  - description: |
      Add the Run detail page and its JS: `public/run.html` (Pause/Resume/Cancel buttons, a
      `#run-state` label, and a hidden `#run-error` paragraph for surfacing a failed request —
      new in this revision — reusing `.btn`/`.btn-primary`/`.btn-secondary` from
      `design-system/prototype-utils.css`, verified present) and `public/js/run.js`. Two
      behaviors were added to `handle()` specifically to cover edge cases: an early
      `if (btn.disabled) return;` guard so a second click fired while a request is already in
      flight is a no-op (belt-and-suspenders alongside the `disabled` attribute itself, since
      AC5's own wording — "to prevent duplicate submissions" — is about the request, not just
      the button's visual state), and a `try/catch` around the `fetch` so a rejected promise
      (network failure) re-enables the button and shows an inline error instead of leaving the
      button permanently stuck showing "Pausing…"/"Cancelling…":
      ```js
      async function postTransition(runId, action, actor) {
        const res = await fetch(`/runs/${runId}/${action}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ actorId: actor.actorId, actorRole: actor.actorRole }),
        });
        return res.json();
      }

      function initRunApp(doc = document, { run, actor }) {
        const pauseBtn = doc.getElementById('pause-btn');
        const resumeBtn = doc.getElementById('resume-btn');
        const cancelBtn = doc.getElementById('cancel-btn');
        const stateLabel = doc.getElementById('run-state');
        const errorEl = doc.getElementById('run-error');

        function render() {
          stateLabel.textContent = run.state;
          pauseBtn.disabled = !['started', 'blocked'].includes(run.state);
          resumeBtn.disabled = run.state !== 'paused';
          cancelBtn.disabled = run.state === 'cancelled';
        }

        async function handle(btn, action, pendingLabel, idleLabel) {
          if (btn.disabled) return;
          btn.disabled = true;
          btn.textContent = pendingLabel;
          errorEl.hidden = true;
          try {
            run = await postTransition(run.id, action, actor);
          } catch (err) {
            errorEl.hidden = false;
            errorEl.textContent = `${idleLabel} failed — please try again.`;
          } finally {
            btn.textContent = idleLabel;
            render();
          }
        }

        pauseBtn.addEventListener('click', () => handle(pauseBtn, 'pause', 'Pausing…', 'Pause'));
        cancelBtn.addEventListener('click', () => handle(cancelBtn, 'cancel', 'Cancelling…', 'Cancel'));
        resumeBtn.addEventListener('click', () => handle(resumeBtn, 'resume', 'Resuming…', 'Resume'));

        render();
      }

      module.exports = { initRunApp };
      ```
      Loaded by `public/run.html` via `<script src="./js/run.js" defer>`, with a small inline
      bootstrap script that reads `?id=` from the URL, `fetch`es `GET /runs/:id`, and calls
      `initRunApp(document, { run, actor })` (actor is a placeholder read from a `data-actor-id`/
      `data-actor-role` attribute on `#root`, since there is no session to derive it from — see
      assumptions).
    files:
      - public/run.html
      - public/js/run.js
      - public/css/run.css
    rationale: |
      AC5 requires a visual in-progress indicator specifically for pause and cancel (not
      resume), matching the existing "disable + relabel the button" pattern already shipped in
      `public/js/expenses.js`'s save button. The disabled-guard and error-recovery additions
      above are this revision's edge-case coverage for that same AC's "prevent duplicate
      submissions" clause and for a request that never successfully resolves.
  - description: |
      Failing-tests-first for the pure lifecycle rules (AC1, AC2, AC3, AC6) plus their edge
      cases, calling `src/runs/store.js` and `src/runs/lifecycle.js` directly — no HTTP layer,
      fastest feedback on the actual state-machine/audit/notification logic.
    files:
      - test/runs-lifecycle.test.js
    rationale: |
      See `tests` below for the concrete assertions this file contains, including the
      invalid-state, audit-sequencing, and no-op-cancel edge cases added in this revision.
  - description: |
      Failing-tests-first for the HTTP surface (AC4's permission rejection end-to-end, a smoke
      check that a successful pause returns 200 with the updated state) plus the unknown-run-id
      and malformed-actor-payload edge cases, using `supertest` against the exported `app`,
      matching `test/employees.test.js`'s style.
    files:
      - test/runs.test.js
    rationale: |
      Confirms `RunTransitionError` codes are actually translated into the right HTTP statuses,
      and that missing/garbage request bodies degrade to a 403 rather than a 500 — neither of
      which the lifecycle-only unit tests can observe.
  - description: |
      Failing-tests-first for the visual in-progress indicator (AC5) plus its double-submission
      and network-failure edge cases, jsdom-based, loading the real `public/run.html` markup the
      same way `test/expenses.test.js` loads `public/index.html`.
    files:
      - test/run-ui.test.js
    rationale: |
      This is the only test file that can actually observe "a visual in-progress indicator is
      displayed" and "duplicate submissions are prevented" as DOM/network-call state, rather
      than just a backend response.
tests:
  - |
    AC1 — pausing a started run moves it to 'paused', blocks new dispatch, and notifies the
    assigned coordinator in-app and by email:
    ```js
    const { createRun } = require('../src/runs/store');
    const { pauseRun, getNextDispatchableTask } = require('../src/runs/lifecycle');
    const { getInAppAlertsFor, getEmailQueueFor } = require('../src/runs/notifications');

    test('pausing a started run moves it to paused, blocks dispatch, and notifies the coordinator', () => {
      const run = createRun({ assignedCoordinatorId: 'coord_1', state: 'started', tasks: [{ id: 't1', state: 'pending' }] });
      const updated = pauseRun(run, { id: 'coord_1', role: 'hr_coordinator' });

      expect(updated.state).toBe('paused');
      expect(getNextDispatchableTask(updated)).toBeNull();
      expect(getInAppAlertsFor('coord_1')).toHaveLength(1);
      expect(getEmailQueueFor('coord_1')).toHaveLength(1);
    });
    ```
    Fails until `store.js`, `lifecycle.js`, and `notifications.js` all exist and are wired
    together as shown above. A second test in the same file repeats this starting from
    `state: 'blocked'` to cover the AC's other named source state.
  - |
    AC2 — resuming a paused run returns it to 'started' and dispatch continues from the same
    pending task, not a reset one:
    ```js
    test('resuming a paused run returns to started and continues dispatching the same pending task', () => {
      const run = createRun({ assignedCoordinatorId: 'coord_1', state: 'started', tasks: [{ id: 't1', state: 'pending' }] });
      pauseRun(run, { id: 'coord_1', role: 'hr_coordinator' });
      expect(getNextDispatchableTask(run)).toBeNull();

      const updated = resumeRun(run, { id: 'coord_1', role: 'hr_coordinator' });

      expect(updated.state).toBe('started');
      expect(getNextDispatchableTask(updated).id).toBe('t1');
    });
    ```
    Fails until `resumeRun` exists and `getNextDispatchableTask` re-derives from unchanged task
    state rather than any pause-time snapshot being discarded.
  - |
    AC3 — cancelling leaves in-flight tasks as-is but flags each partially completed one for
    manual cleanup with a record of its completion state at cancellation:
    ```js
    test('cancelling flags in-flight tasks for manual cleanup with a snapshot of their completion state', () => {
      const run = createRun({
        assignedCoordinatorId: 'coord_1',
        state: 'started',
        tasks: [
          { id: 't1', state: 'in_progress', progress: 0.6 },
          { id: 't2', state: 'completed' },
        ],
      });

      const updated = cancelRun(run, { id: 'coord_1', role: 'hr_coordinator' });

      expect(updated.state).toBe('cancelled');
      const t1 = updated.tasks.find((t) => t.id === 't1');
      expect(t1.state).toBe('in_progress');
      expect(t1.flaggedForManualCleanup).toBe(true);
      expect(t1.cancellationSnapshot).toMatchObject({ state: 'in_progress', progress: 0.6 });
      const t2 = updated.tasks.find((t) => t.id === 't2');
      expect(t2.flaggedForManualCleanup).toBeUndefined();
    });
    ```
    Fails until `cancelRun` exists and only mutates flag/snapshot fields on `in_progress` tasks,
    leaving their `state` untouched ("left as-is").
  - |
    AC4 — pause, resume, and cancel are each rejected with a permission error for an actor who
    is neither the assigned coordinator nor a platform admin, exercised at the HTTP layer:
    ```js
    const request = require('supertest');
    const app = require('../src/server');
    const { createRun } = require('../src/runs/store');

    test('pause is rejected with a 403 permission error for a non-coordinator, non-admin actor', async () => {
      const run = createRun({ assignedCoordinatorId: 'coord_1', state: 'started', tasks: [] });
      const res = await request(app)
        .post(`/runs/${run.id}/pause`)
        .send({ actorId: 'someone_else', actorRole: 'employee' });
      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/not authorized/i);
    });
    ```
    Fails until `assertAuthorized` and the route's `RunTransitionError` → 403 mapping both
    exist. Two more tests in the same file repeat this for `/resume` (on a paused fixture) and
    `/cancel`.
  - |
    AC5 — clicking Pause disables the button and shows an in-progress label until the request
    resolves, then reflects the new state:
    ```js
    /** @jest-environment jsdom */
    const fs = require('fs');
    const path = require('path');
    const HTML_PATH = path.join(__dirname, '..', 'public', 'run.html');

    test('clicking Pause disables the button and shows an in-progress indicator until the request resolves', async () => {
      document.documentElement.innerHTML = fs.readFileSync(HTML_PATH, 'utf8');
      const { initRunApp } = require('../public/js/run');
      let resolveFetch;
      global.fetch = jest.fn(() => new Promise((resolve) => { resolveFetch = resolve; }));

      initRunApp(document, { run: { id: 'run_1', state: 'started' }, actor: { actorId: 'coord_1', actorRole: 'hr_coordinator' } });
      document.getElementById('pause-btn').click();

      expect(document.getElementById('pause-btn').disabled).toBe(true);
      expect(document.getElementById('pause-btn').textContent).toBe('Pausing…');

      resolveFetch({ json: async () => ({ id: 'run_1', state: 'paused' }) });
      await Promise.resolve();
      await Promise.resolve();

      expect(document.getElementById('run-state').textContent).toBe('paused');
    });
    ```
    Fails until `run.html`/`run.js` exist and `handle()` disables/relabels the button
    synchronously before awaiting the fetch response. A parallel test covers the Cancel button.
  - |
    AC6 — every lifecycle transition appends an immutable entry (actor, timestamp, prior state,
    new state) to the Run's audit log:
    ```js
    test('every lifecycle transition appends an immutable entry to the audit log', () => {
      const run = createRun({ assignedCoordinatorId: 'coord_1', state: 'started', tasks: [] });
      const actor = { id: 'coord_1', role: 'hr_coordinator' };

      pauseRun(run, actor);
      const entry = run.auditLog[0];
      expect(entry).toMatchObject({ actor: 'coord_1', priorState: 'started', newState: 'paused' });
      expect(typeof entry.timestamp).toBe('string');

      entry.newState = 'tampered';
      expect(run.auditLog[0].newState).toBe('paused');
    });
    ```
    Fails until `recordAudit` pushes a frozen entry with all four required fields; the tamper
    assertion fails unless the entry is actually `Object.freeze`d, not just a plain object.
  - |
    Edge case (extends AC1/AC2/AC3) — repeated/invalid state transitions are rejected and never
    mutate state or write an audit entry:
    ```js
    test('pausing an already-paused run is rejected and leaves state and audit log unchanged', () => {
      const run = createRun({ assignedCoordinatorId: 'coord_1', state: 'paused', tasks: [] });
      const actor = { id: 'coord_1', role: 'hr_coordinator' };
      expect(() => pauseRun(run, actor)).toThrow(RunTransitionError);
      expect(run.state).toBe('paused');
      expect(run.auditLog).toHaveLength(0);
    });

    test('resuming a run that is not paused is rejected', () => {
      const run = createRun({ assignedCoordinatorId: 'coord_1', state: 'started', tasks: [] });
      expect(() => resumeRun(run, { id: 'coord_1', role: 'hr_coordinator' })).toThrow(RunTransitionError);
    });

    test('cancelling an already-cancelled run is rejected', () => {
      const run = createRun({ assignedCoordinatorId: 'coord_1', state: 'cancelled', tasks: [] });
      expect(() => cancelRun(run, { id: 'coord_1', role: 'hr_coordinator' })).toThrow(RunTransitionError);
    });
    ```
    Locks in that the state guards in `pauseRun`/`resumeRun`/`cancelRun` run before any mutation
    or audit write, not just before the return value is built.
  - |
    Edge case (extends AC3) — cancelling a run with no in-progress tasks succeeds and flags
    nothing:
    ```js
    test('cancelling a run with no in-progress tasks succeeds without flagging anything', () => {
      const run = createRun({
        assignedCoordinatorId: 'coord_1',
        state: 'started',
        tasks: [{ id: 't1', state: 'pending' }, { id: 't2', state: 'completed' }],
      });
      const updated = cancelRun(run, { id: 'coord_1', role: 'hr_coordinator' });
      expect(updated.state).toBe('cancelled');
      expect(updated.tasks.every((t) => !t.flaggedForManualCleanup)).toBe(true);
    });
    ```
  - |
    Edge case (extends AC4) — a platform_admin actor is permitted even when their id differs
    from the assigned coordinator, confirming the two authorization paths are independent:
    ```js
    test('a platform_admin actor is permitted even when their id differs from the assigned coordinator', () => {
      const run = createRun({ assignedCoordinatorId: 'coord_1', state: 'started', tasks: [] });
      const updated = pauseRun(run, { id: 'admin_9', role: 'platform_admin' });
      expect(updated.state).toBe('paused');
    });
    ```
  - |
    Edge case (extends AC4) — a request with a missing/malformed actor payload is rejected as
    unauthorized rather than throwing a server error, exercised at the HTTP layer:
    ```js
    test('a request missing actorId and actorRole is rejected as unauthorized, not a server error', async () => {
      const run = createRun({ assignedCoordinatorId: 'coord_1', state: 'started', tasks: [] });
      const res = await request(app).post(`/runs/${run.id}/pause`).send({});
      expect(res.status).toBe(403);
    });
    ```
  - |
    Edge case (extends AC1/AC2/AC3) — a transition attempted against an unknown Run id returns
    404 instead of throwing:
    ```js
    test('pausing a nonexistent run returns 404', async () => {
      const res = await request(app)
        .post('/runs/does-not-exist/pause')
        .send({ actorId: 'coord_1', actorRole: 'hr_coordinator' });
      expect(res.status).toBe(404);
    });
    ```
    A parallel test in the same file covers `/resume` and `/cancel` against the same missing id.
  - |
    Edge case (extends AC6) — the audit log records the correct actor/state sequence across
    multiple sequential transitions on the same Run:
    ```js
    test('the audit log records the correct sequence across pause, resume, and cancel', () => {
      const run = createRun({ assignedCoordinatorId: 'coord_1', state: 'started', tasks: [] });
      const actor = { id: 'coord_1', role: 'hr_coordinator' };

      pauseRun(run, actor);
      resumeRun(run, actor);
      cancelRun(run, actor);

      expect(run.auditLog.map((e) => [e.priorState, e.newState])).toEqual([
        ['started', 'paused'],
        ['paused', 'started'],
        ['started', 'cancelled'],
      ]);
    });
    ```
  - |
    Edge case (extends AC5) — clicking Pause twice before the first request resolves sends only
    one network request:
    ```js
    test('clicking Pause twice before the first request resolves sends only one network request', () => {
      document.documentElement.innerHTML = fs.readFileSync(HTML_PATH, 'utf8');
      const { initRunApp } = require('../public/js/run');
      global.fetch = jest.fn(() => new Promise(() => {}));

      initRunApp(document, { run: { id: 'run_1', state: 'started' }, actor: { actorId: 'coord_1', actorRole: 'hr_coordinator' } });
      const pauseBtn = document.getElementById('pause-btn');
      pauseBtn.click();
      pauseBtn.click();

      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
    ```
    Fails until the `if (btn.disabled) return;` guard exists in `handle()` — without it, a
    second click issued before `btn.disabled = true` on the first call's microtask boundary
    could still fire a second `fetch`. A parallel test covers the Cancel button.
  - |
    Edge case (extends AC5) — a failed pause request re-enables the button and surfaces an
    inline error instead of leaving it stuck on the in-progress label:
    ```js
    test('a failed pause request re-enables the button and shows an inline error', async () => {
      document.documentElement.innerHTML = fs.readFileSync(HTML_PATH, 'utf8');
      const { initRunApp } = require('../public/js/run');
      global.fetch = jest.fn(() => Promise.reject(new Error('network error')));

      initRunApp(document, { run: { id: 'run_1', state: 'started' }, actor: { actorId: 'coord_1', actorRole: 'hr_coordinator' } });
      document.getElementById('pause-btn').click();
      await Promise.resolve();
      await Promise.resolve();

      expect(document.getElementById('pause-btn').disabled).toBe(false);
      expect(document.getElementById('run-error').hidden).toBe(false);
    });
    ```
assumptions_or_open_questions:
  - |
    No authentication/session system exists anywhere in this repo. Actor identity (`actorId`,
    `actorRole`) is passed explicitly in each transition request's JSON body (backend) or via a
    `data-actor-id`/`data-actor-role` placeholder on the page (frontend), mirroring the existing
    `employees` API's request-body-only style rather than deriving identity from a session/JWT
    that doesn't exist in this codebase.
  - |
    No "create Run" or "list Runs" story/endpoint exists yet. This plan adds `store.createRun`
    (used directly by this story's tests as fixture setup, and available for future "start a
    Run" work) and a minimal `GET /runs/:id` read endpoint purely as supporting plumbing so the
    detail page and its tests can hydrate a run's current state — no AC in this story calls for
    either directly.
  - |
    No task-graph/dispatch engine exists anywhere in the repo (that's separate, future work per
    the parent epic's "task graph, sequencing rules" language). Tasks are modeled minimally as
    `{ id, state: 'pending' | 'in_progress' | 'completed', progress? }` records already attached
    to a Run. "No new tasks are dispatched" (AC1) and "continues from where it was paused" (AC2)
    are represented via the pure `getNextDispatchableTask(run)` guard rather than a real async
    dispatcher, since there is no dispatcher in the codebase to integrate with.
  - |
    "Partially completed" (AC3) is interpreted as `task.state === 'in_progress'` — started but
    not yet `completed`. Tasks still `pending` or already `completed` at cancellation time are
    left untouched (no flag, no snapshot); a run whose tasks are all `pending`/`completed`
    (edge case above) still transitions to `cancelled` successfully with nothing flagged.
  - |
    Email delivery (AC1) has no real provider configured anywhere in the repo (no
    nodemailer/SMTP dependency exists). It's implemented as an in-memory "outbox" queue
    (`src/runs/notifications.js`), consistent with every other piece of persistence in this
    codebase being in-memory; wiring a real provider is follow-up work outside this story.
  - |
    AC5's wording ("a pause or cancel action ... to prevent duplicate submissions") is read as
    requiring both the visual indicator and an actual guard against a second in-flight request,
    not just a cosmetic label change — hence the `if (btn.disabled) return;` guard and its
    dedicated edge-case test, rather than trusting the disabled attribute alone to stop a second
    `fetch`. The Resume button gets the same guard for consistency in the code, but per the AC's
    literal wording only Pause/Cancel have a dedicated test for it.
  - |
    "Immutable audit log" (AC6) is implemented by `Object.freeze`-ing each entry at write time
    and only ever appending to `run.auditLog` — there is no separate persistent audit-log store
    elsewhere in the repo to delegate to, so this in-process guarantee is the practical ceiling
    for this story.
  - |
    Cancel (AC3) is permitted from `started`, `blocked`, or `paused` — i.e. any non-terminal
    state — since the AC says "an active Run" without enumerating source states the way AC1
    does for pause. A second cancel attempt on an already-`cancelled` run is the edge case that
    exercises the opposite, terminal side of that same guard.
  - |
    The `platform_admin` role check is an exact, case-sensitive string match (`'platform_admin'`)
    against `actorRole`; no role-name normalization/aliasing is implemented since no AC or
    existing code in the repo defines a role taxonomy to normalize against.
  - |
    This revision's edge-case tests are additions the reviewer asked for beyond the six literal
    acceptance criteria; they're implemented as extra `test(...)` cases in the same three files
    rather than new formal ACs, since none of them changes what "done" means for this story —
    they just pin down behavior the existing guards already produce (or, for the two AC5
    additions, required two small new lines in `handle()`).
package_dependencies: []
notes: |
  This plan's scope crosses from the HTTP layer down into domain logic, an in-memory
  notification outbox, and a new frontend page/script, plus the tests driving each layer — worth
  diagramming:

  ```mermaid
  flowchart TD
    Server["src/server.js"] -->|new: app.use('/runs', ...)| Routes["src/runs/routes.js"]
    Routes -->|getRun| Store["src/runs/store.js"]
    Routes -->|pauseRun/resumeRun/cancelRun| Lifecycle["src/runs/lifecycle.js"]
    Lifecycle -->|notifyCoordinatorPaused| Notify["src/runs/notifications.js"]
    HTML["public/run.html"] -->|script defer| RunJS["public/js/run.js"]
    RunJS -->|fetch POST /runs/:id/pause|resume|cancel, GET /runs/:id| Routes
    TestLifecycle["test/runs-lifecycle.test.js"] --> Lifecycle
    TestLifecycle --> Store
    TestLifecycle --> Notify
    TestHttp["test/runs.test.js"] -->|supertest| Server
    TestUi["test/run-ui.test.js"] -->|jsdom, mocked fetch| RunJS

    classDef touched fill:#f96,color:#000
    class Server,Routes,Store,Lifecycle,Notify,HTML,RunJS,TestLifecycle,TestHttp,TestUi touched
  ```

  Layering rationale: `routes.js` only translates HTTP concerns (params, body, status codes),
  exactly like `src/employees/routes.js` already does; all state-machine/permission/audit rules
  live in `lifecycle.js` so they're unit-testable without an HTTP round trip; `notifications.js`
  is a separate module so the "notify on pause" side effect can be asserted independently of the
  state transition itself. `src/employees/*` and `public/js/expenses.js` are untouched by this
  plan — neither the ACs nor the parent epic's Run-lifecycle scope involves them.

  Edge cases added in this revision, at a glance: invalid/repeated state transitions (double
  pause, resume-when-not-paused, double cancel), cancel with nothing to flag, an admin actor
  whose id doesn't match the coordinator, a malformed actor payload, an unknown Run id,
  multi-transition audit ordering, double-clicking Pause/Cancel, and a failed/rejected fetch on
  Pause/Cancel. None of these required new backend logic beyond what the happy-path guards
  already do, except the two small additions to `handle()` in `public/js/run.js` (the
  disabled-guard and the try/catch) called out in that scope item.
