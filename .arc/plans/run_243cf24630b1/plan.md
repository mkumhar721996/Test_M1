summary: |
  There is no Run/Task domain anywhere in the repo today — the backend only has an in-memory
  `employees` resource (`src/employees/{routes,store}.js`, mounted in `src/server.js`, tested
  with Jest + Supertest per `test/employees.test.js`), and the only existing frontend surface is
  the expense tracker under `public/` (`public/index.html` + `public/js/expenses.js` +
  `public/css/expenses.css`). This story creates the Run/Task domain from scratch, following the
  same conventions: an in-memory store module (mirroring `src/employees/store.js`), an Express
  router mounted the same way `employeesRouter` is, and CommonJS modules throughout. The policy
  itself is a small state machine — record a task failure, and either schedule an exponential-
  backoff retry (attempts 1-2) or block the task and its parent Run and notify the assigned HR
  coordinator in-app and by email (attempt 3) — plus an append-only audit log and a manual
  resolve/resume path for blocked tasks. The approved design
  (`.arc/designs/TEST-M1-STORY-048-design.html`) is a self-contained click-through simulation
  (its own inline `<script>` fakes attempts with `setTimeout`, no network calls) built from
  component classes (`.run-card`, `.task-card`, `.backoff-track`, `.banner`, `.audit-table`,
  `.notif-*`, `.modal-*`, `.toast`, `.email-*`) layered on the existing design-system tokens and
  `design-system/prototype-utils.css` utilities. This plan builds real pages that reuse that exact
  markup/CSS but replace the fixture simulation with real HTTP calls to the new API, exactly as
  the design's own screen-1 comment describes the intended behavior (AC1-AC6 annotated inline in
  the design against each simulated step). No design work is added or changed.
scope:
  - description: |
      Pure retry-policy constants/helpers, no I/O. Reproduces the exact backoff values the
      approved design hardcodes (`BACKOFF_LABELS = ['30s', '2m']`) via a `30s * 4^(attempt-1)`
      formula rather than plain doubling, since the design is the source of truth for the
      concrete numbers and no AC specifies a multiplier:
      ```js
      const MAX_ATTEMPTS = 3;
      const BASE_BACKOFF_MS = 30000;

      function computeBackoffMs(attempt) {
        return BASE_BACKOFF_MS * 4 ** (attempt - 1);
      }

      module.exports = { MAX_ATTEMPTS, computeBackoffMs };
      ```
    files:
      - src/runs/retryPolicy.js
    rationale: |
      Isolating the backoff math as a pure function makes AC1's "exponential backoff" concretely
      testable in isolation, and gives `src/runs/store.js` a single source of truth for both the
      retry delay and the 3-attempt limit referenced by AC3.
  - description: |
      Append-only, immutable audit log store. `record()` freezes each entry so nothing already
      written can be mutated in place (no `update`/`delete` export exists at all), satisfying
      AC6's "immutable audit log":
      ```js
      const crypto = require('crypto');
      const events = [];

      function record(event) {
        const entry = Object.freeze({ id: crypto.randomUUID(), ...event });
        events.push(entry);
        return entry;
      }

      function list() { return [...events].reverse(); } // newest first, matches the design's audit table
      function listForRun(runId) { return list().filter((e) => e.runId === runId); }

      module.exports = { record, list, listForRun };
      ```
    files:
      - src/runs/auditLog.js
    rationale: |
      AC6 requires every retry/block event to carry attempt number, failure reason, and
      timestamp, written immutably. A dedicated module keeps that guarantee in one place instead
      of re-implementing "don't allow edits" logic inside the store or routes.
  - description: |
      In-app-alert + email notifier for the assigned HR coordinator. No SMTP/email-provider
      dependency exists anywhere in the repo (`.env` only has `ARC_DEV_PORT`/`ARC_WEB_PORT`), so
      "email" is represented the same way the rest of this minimal app represents state: an
      in-memory record, here a sent-email outbox, rather than a real provider integration:
      ```js
      const inAppAlerts = [];
      const sentEmails = [];

      function notifyHrCoordinator({ coordinator, run, task, reason, timestamp }) {
        const text = `Task blocked: "${task.name}" on ${run.id} (${run.name}) failed ${task.attempts} times and needs your review.`;
        const alert = { id: run.id + ':' + task.id + ':' + timestamp, runId: run.id, taskId: task.id, coordinatorEmail: coordinator.email, text, time: timestamp };
        inAppAlerts.push(alert);

        const email = {
          to: coordinator.email,
          from: 'no-reply@workforce-ops.example',
          subject: `Action needed: Task blocked on ${run.id} (${run.name})`,
          body: `The task "${task.name}" on Run ${run.id} has failed ${task.attempts} times. Last failure: ${reason}.`,
          time: timestamp,
        };
        sentEmails.push(email);
        return { alert, email };
      }

      function listAlertsFor(runId) { return inAppAlerts.filter((a) => a.runId === runId); }
      function listSentEmails() { return [...sentEmails]; }

      module.exports = { notifyHrCoordinator, listAlertsFor, listSentEmails };
      ```
    files:
      - src/runs/notifications.js
    rationale: |
      AC4 requires both channels to fire together on the third failure. Keeping both writes in
      one function call means `src/runs/store.js` can't accidentally send one without the other,
      and `listSentEmails`/`listAlertsFor` give tests a way to assert delivery without a real
      mail server.
  - description: |
      The Run/Task domain store: in-memory `Map`s (mirroring `src/employees/store.js`'s
      `crypto.randomUUID()` + `Map` pattern) plus the state machine itself. Seeds one demo Run at
      module load (`RUN-4821`, "Onboarding: Jordan Lee", tasks "Create IT account" (completed),
      "Provision laptop asset" (in-progress, HR coordinator Priya Nair), "Schedule orientation
      session" (pending)) so `public/runs.html` has real data on first load, the same way
      `public/storage.js`'s `INITIAL_EXPENSES` seeds the expense list.
      ```js
      function recordTaskFailure(runId, taskId, reason) {
        const { run, task } = lookup(runId, taskId); // throws NotFoundError (404) if missing
        task.attempts += 1;
        task.lastFailureReason = reason;
        const timestamp = new Date().toISOString();

        if (task.attempts < MAX_ATTEMPTS) {
          task.state = 'retrying';
          const backoffMs = computeBackoffMs(task.attempts);
          task.nextRetryAt = new Date(Date.now() + backoffMs).toISOString();
          auditLog.record({ runId, taskId, taskName: task.name, event: 'retry_scheduled', attempt: task.attempts, maxAttempts: MAX_ATTEMPTS, reason, backoffMs, timestamp });
        } else {
          task.state = 'blocked';
          task.nextRetryAt = null;
          run.state = 'blocked';
          auditLog.record({ runId, taskId, taskName: task.name, event: 'blocked', attempt: task.attempts, maxAttempts: MAX_ATTEMPTS, reason, timestamp });
          notifications.notifyHrCoordinator({ coordinator: task.hrCoordinator, run, task, reason, timestamp });
        }
        return getRunDetail(runId);
      }

      function resolveTask(runId, taskId, { resolver, note }) {
        const { run, task } = lookup(runId, taskId);
        if (task.state !== 'blocked') throw new ConflictError('task is not blocked');
        task.state = 'in-progress';
        task.attempts = 0;
        task.nextRetryAt = null;
        run.state = 'in-progress';
        const timestamp = new Date().toISOString();
        auditLog.record({ runId, taskId, taskName: task.name, event: 'resolved', attempt: MAX_ATTEMPTS, maxAttempts: MAX_ATTEMPTS, note, resolver, timestamp });
        return getRunDetail(runId);
      }
      ```
      `getRunDetail(runId)` composes the read view used by every response: `{ id, name, state,
      tasks, auditLog: auditLog.listForRun(runId), notifications: notifications.listAlertsFor(runId) }`.
      Resetting `attempts` to 0 on resolve is an inferred behavior — see
      `assumptions_or_open_questions`.
    files:
      - src/runs/store.js
    rationale: |
      This is the actual policy engine: AC1/AC2 (schedule retry, state → retrying), AC3 (block
      task + parent Run on the 3rd failure), AC4 (trigger notification), and AC5 (resolve resumes
      the Run) all live here as one state machine over two entities, exactly mirroring how
      `src/employees/store.js` is the single place that owns entity state today.
  - description: |
      Express router exposing the policy engine over HTTP, mounted the same way
      `employeesRouter` already is:
      ```js
      router.post('/', (req, res) => res.status(201).json(store.createRun(req.body)));
      router.get('/:runId', (req, res) => {
        const run = store.getRunDetail(req.params.runId);
        if (!run) return res.status(404).json({ error: 'run not found' });
        res.status(200).json(run);
      });
      router.post('/:runId/tasks/:taskId/failures', (req, res) => {
        try {
          res.status(200).json(store.recordTaskFailure(req.params.runId, req.params.taskId, req.body.reason));
        } catch (err) { res.status(err.status || 404).json({ error: err.message }); }
      });
      router.post('/:runId/tasks/:taskId/resolution', (req, res) => {
        try {
          res.status(200).json(store.resolveTask(req.params.runId, req.params.taskId, req.body));
        } catch (err) { res.status(err.status || 404).json({ error: err.message }); }
      });
      ```
      A second tiny router (`GET /` → `auditLog.list()`) is mounted at `/audit-log` for the
      standalone Audit Log page. `src/server.js` gains two new `app.use(...)` lines, following
      the existing `app.use('/employees', employeesRouter)` line unchanged.
    files:
      - src/runs/routes.js
      - src/server.js
    rationale: |
      Matches the existing `src/employees/routes.js` → `src/server.js` wiring pattern exactly, so
      the new domain is reachable the same way (`request(app)` in Supertest, `fetch` in the
      browser) without introducing a second server or routing convention.
  - description: |
      Failing-tests-first for the policy engine, written before any of the five files above
      exist, using the project's existing plain-Node Jest style (`test/employees.test.js`'s
      `require`/`module.exports`, no jsdom needed for these):
      - `test/retryPolicy.test.js` — `computeBackoffMs`/`MAX_ATTEMPTS` in isolation.
      - `test/auditLog.test.js` — `record`/`list`/`listForRun`, and that a returned entry's
        fields don't change after `record()` if someone tries to mutate it.
      - `test/notifications.test.js` — `notifyHrCoordinator` writes both an alert and an email.
      - `test/runsStore.test.js` — the full state machine (AC1, AC2, AC3, AC5).
      - `test/runs.routes.test.js` — the same behaviors through Supertest against `src/server.js`
        (AC1-AC6 end to end, including the audit log and notification side effects).
    files:
      - test/retryPolicy.test.js
      - test/auditLog.test.js
      - test/notifications.test.js
      - test/runsStore.test.js
      - test/runs.routes.test.js
    rationale: |
      TDD order: each of these must exist and fail (module-not-found / assertion failure) before
      the corresponding `src/runs/*.js` file above is written, exactly matching how prior stories
      in this repo (`ec80d14`, `62b7dc3`) wrote `test/*.test.js` alongside new `public/*.js`.
  - description: |
      CSS for the Run/Task domain, ported verbatim from the approved design's own inline
      `<style>` block (design lines ~194-450: `.app-topbar`, `.notif-*`, `.page`, `.run-card`,
      `.chip-pending`/`.chip-active`/`.chip-blocked`, `.task-list`/`.task-card`,
      `.backoff-track`/`.backoff-step`, `.banner`, `.audit-card`/`.audit-table`, `.modal-*`,
      `.toast`, `.email-*`), excluding only the `#review-bar` rule (that's the prototype's own
      reviewer-navigation chrome, not part of the shipped page). The design's first `<style>`
      block (utility/component classes: `.btn`, `.card`, `.chip`, `.input`, `.label`) is *not*
      duplicated here because it's already byte-identical to the existing
      `design-system/prototype-utils.css`, which the new pages link directly instead.
    files:
      - public/css/runs.css
    rationale: |
      Keeps the exact visual design (colors/spacing/borders/icons the design already specifies
      via CSS variables like `--color-primary`, `--radius-lg`) without re-deriving it, and keeps
      it in a domain-scoped file the same way `public/css/expenses.css` is scoped to the expense
      pages rather than merged into a shared stylesheet.
  - description: |
      The real "Run Detail" page: `public/runs.html` reuses the design's screen-1 markup exactly
      (topbar with notification bell/dropdown, `.run-card` header, three-task `.task-list` with
      "Create IT account" / "Provision laptop asset" / "Schedule orientation session", the focus
      task's `.backoff-track`, hidden `.banner#blocked-banner`, "Simulate next outcome" /
      "Resolve blocked task" buttons, the resolve `.modal-*`, and the `.toast`), linking
      `design-system/tokens.css`, `design-system/prototype-utils.css`, and the new
      `public/css/runs.css`. `public/js/runs.js` replaces the design's local-fixture
      `setTimeout`-based simulation with real calls:
      ```js
      async function initRunsPage(doc = document, runId = 'RUN-4821') {
        const state = await fetchJson(`/runs/${runId}`);
        render(doc, state);

        doc.getElementById('simulate-btn').addEventListener('click', async () => {
          const focusTaskId = state.tasks.find((t) => t.state !== 'completed' && t.state !== 'pending').id;
          const next = await fetchJson(`/runs/${runId}/tasks/${focusTaskId}/failures`, {
            method: 'POST',
            body: { reason: 'Vendor API timeout (504) — Dell fulfillment gateway did not respond within 30s.' },
          });
          Object.assign(state, next);
          render(doc, state);
        });
        // resolve-form submit → POST `/runs/${runId}/tasks/${focusTaskId}/resolution` with { resolver, note }, then render(doc, next)
      }
      module.exports = { initRunsPage };
      if (typeof window !== 'undefined') window.addEventListener('DOMContentLoaded', () => initRunsPage());
      ```
      `render()` maps `state.tasks[].state` to the design's exact chip/icon/class combinations
      (`retrying` → `↻ Retrying` / `.chip-active`, `blocked` → `⛔ Blocked` / `.chip-blocked` /
      `.is-blocked`, unhides `#blocked-banner`), renders `state.notifications` into the notif
      dropdown/badge, and renders `state.auditLog` into `#audit-tbody` using the same row markup
      the design's `addAuditRow()` builds.
    files:
      - public/runs.html
      - public/js/runs.js
    rationale: |
      This is the only screen in the design with unique interactive behavior tied to the ACs
      (AC1-AC6 are annotated directly against this screen's simulate/resolve flow in the design's
      own comments). Reusing its markup/classes and only swapping the data source from a local
      fixture to `fetch` keeps the shipped page pixel-identical to what was approved.
  - description: |
      The standalone "Audit Log — Full History" page (design screen 4): `public/audit-log.html`
      reuses that screen's topbar/page-header/`.audit-card` markup, and `public/js/audit-log.js`
      fetches `GET /audit-log` and renders rows with the same five columns (Timestamp, Run/Task,
      Event chip, Attempt, Detail) the design hardcodes as static fixture rows.
    files:
      - public/audit-log.html
      - public/js/audit-log.js
    rationale: |
      AC6's audit log needs to be visible independent of any one Run — the design dedicates a
      whole screen to exactly this ("Every retry, block, and resolution event across Runs...
      immutable and append-only"), so it's built as its own route rather than folded into
      `runs.html`.
  - description: |
      Failing-tests-first for both pages, jsdom + `@testing-library/dom` (already a devDependency
      from TEST-M1-STORY-031, per `package.json`), mocking `global.fetch` rather than hitting a
      real server, the same jsdom-opt-in style `test/app.test.js` uses
      (`/** @jest-environment jsdom */`).
    files:
      - test/runsPage.test.js
      - test/auditLogPage.test.js
    rationale: |
      Covers AC1-AC5's visible states (retrying/backoff track, blocked banner + notif badge,
      resolve modal → back to in-progress) and AC6's rendered audit rows, written before
      `public/js/runs.js` / `public/js/audit-log.js` exist so they fail for the right reason
      first (module not found).
tests:
  - |
    AC1 — `test/runsStore.test.js` and `test/retryPolicy.test.js`, first failure schedules a
    retry with exponential backoff:
    ```js
    const { computeBackoffMs } = require('../src/runs/retryPolicy');
    test('backoff matches the approved design (30s, then 2m)', () => {
      expect(computeBackoffMs(1)).toBe(30000);
      expect(computeBackoffMs(2)).toBe(120000);
    });

    const { createRun, recordTaskFailure } = require('../src/runs/store');
    test('first failure schedules nextRetryAt ~30s out', () => {
      const run = createRun({ name: 'Onboarding: Test User', tasks: [{ name: 'Provision laptop asset', hrCoordinator: { name: 'Priya Nair', email: 'priya.nair@northlake-hr.example' } }] });
      const { task } = recordTaskFailure(run.id, run.tasks[0].id, 'Vendor API timeout (504)');
      expect(new Date(task.nextRetryAt).getTime() - Date.now()).toBeGreaterThan(29000);
    });
    ```
    Minimal code to pass: `computeBackoffMs`/`MAX_ATTEMPTS` in `src/runs/retryPolicy.js`, and the
    `attempts < MAX_ATTEMPTS` branch of `recordTaskFailure` in `src/runs/store.js`.
  - |
    AC2 — `test/runs.routes.test.js`, task state is `'retrying'` after the 1st and 2nd failures:
    ```js
    const request = require('supertest');
    const app = require('../src/server');

    test('task state is retrying after attempt 1 and attempt 2', async () => {
      const create = await request(app).post('/runs').send({ name: 'Onboarding: Jamie Fox', tasks: [{ name: 'Provision laptop asset', hrCoordinator: { name: 'Priya Nair', email: 'priya.nair@northlake-hr.example' } }] });
      const { id: runId, tasks } = create.body;
      const taskId = tasks[0].id;

      const res1 = await request(app).post(`/runs/${runId}/tasks/${taskId}/failures`).send({ reason: 'x' });
      expect(res1.body.task.state).toBe('retrying');
      const res2 = await request(app).post(`/runs/${runId}/tasks/${taskId}/failures`).send({ reason: 'x' });
      expect(res2.body.task.state).toBe('retrying');
      expect(res2.body.run.state).toBe('in-progress');
    });
    ```
  - |
    AC3 — `test/runs.routes.test.js`, the third failure blocks both task and Run:
    ```js
    test('third failure blocks the task and its parent Run', async () => {
      const create = await request(app).post('/runs').send({ name: 'Onboarding: Jamie Fox', tasks: [{ name: 'Provision laptop asset', hrCoordinator: { name: 'Priya Nair', email: 'priya.nair@northlake-hr.example' } }] });
      const { id: runId, tasks } = create.body;
      const taskId = tasks[0].id;
      await request(app).post(`/runs/${runId}/tasks/${taskId}/failures`).send({ reason: 'x' });
      await request(app).post(`/runs/${runId}/tasks/${taskId}/failures`).send({ reason: 'x' });
      const res = await request(app).post(`/runs/${runId}/tasks/${taskId}/failures`).send({ reason: 'x' });
      expect(res.body.task.state).toBe('blocked');
      expect(res.body.run.state).toBe('blocked');
    });
    ```
  - |
    AC4 — `test/notifications.test.js` (unit) and `test/runs.routes.test.js` (integration), the
    HR coordinator gets both an in-app alert and an email on the 3rd failure:
    ```js
    const notifications = require('../src/runs/notifications');
    test('notifyHrCoordinator records an alert and an email for the run', () => {
      const run = { id: 'RUN-TEST-4', name: 'Onboarding: Test' };
      const task = { id: 'TASK-1', name: 'Provision laptop asset', attempts: 3, hrCoordinator: { email: 'priya.nair@northlake-hr.example' } };
      notifications.notifyHrCoordinator({ coordinator: task.hrCoordinator, run, task, reason: 'x', timestamp: '2026-09-23T09:07:41.000Z' });
      expect(notifications.listAlertsFor('RUN-TEST-4')).toHaveLength(1);
      expect(notifications.listSentEmails().some((e) => e.to === 'priya.nair@northlake-hr.example')).toBe(true);
    });
    ```
    Integration assertion in `test/runs.routes.test.js` after the 3rd failure:
    ```js
    expect(res.body.notifications.some((n) => n.text.includes('Provision laptop asset'))).toBe(true);
    expect(notifications.listSentEmails().some((e) => e.to === 'priya.nair@northlake-hr.example')).toBe(true);
    ```
  - |
    AC5 — `test/runsStore.test.js`/`test/runs.routes.test.js` for the resume, and
    `test/runsPage.test.js` for the UI:
    ```js
    const { resolveTask } = require('../src/runs/store');
    test('resolving a blocked task returns it and its Run to in-progress', () => {
      // ...create run, fail 3x to reach blocked, as in the AC3 test above...
      const { task, run } = resolveTask(runId, taskId, { resolver: 'Priya Nair — HR Coordinator', note: 'Fixed manually' });
      expect(task.state).toBe('in-progress');
      expect(run.state).toBe('in-progress');
    });
    test('resolving a non-blocked task is rejected', () => {
      expect(() => resolveTask(runId, taskId, { resolver: 'x', note: 'y' })).toThrow();
    });
    ```
  - |
    AC6 — `test/auditLog.test.js` (immutability) and `test/runs.routes.test.js` (content):
    ```js
    const auditLog = require('../src/runs/auditLog');
    test('a recorded entry cannot be changed after the fact', () => {
      const entry = auditLog.record({ runId: 'r', taskId: 't', taskName: 'n', event: 'retry_scheduled', attempt: 1, maxAttempts: 3, reason: 'x', timestamp: 'now' });
      entry.attempt = 99;
      expect(entry.attempt).toBe(1);
    });
    ```
    ```js
    test('GET /audit-log records attempt, reason, and timestamp for a retry event', async () => {
      // ...create run, fail once...
      const res = await request(app).get('/audit-log');
      const entry = res.body.find((e) => e.runId === runId);
      expect(entry.attempt).toBe(1);
      expect(entry.reason).toBe('Vendor API timeout (504)');
      expect(entry.timestamp).toBeDefined();
    });
    ```
assumptions_or_open_questions:
  - |
    No Run/Task domain, task executor, or workflow engine exists anywhere in the repo yet (this
    story is the first piece of the parent "Employee & Onboarding Workflow Core" epic). This plan
    treats `POST /runs/:runId/tasks/:taskId/failures` as the integration point that a future
    task-execution system (or, for now, the design's own "Simulate next outcome" button) calls
    when an attempt fails — building that execution system itself is out of scope for this story.
  - |
    The exponential-backoff multiplier (`30s * 4^(attempt-1)`, giving 30s then 2m) is inferred
    from the approved design's own hardcoded `BACKOFF_LABELS = ['30s', '2m']`, since no AC states
    an exact formula. A plain-doubling formula (30s/60s) would not reproduce the design's numbers.
  - |
    AC4's "email" is not sent via a real SMTP/email provider — no such dependency or credential
    exists in the repo (`.env` only defines `ARC_DEV_PORT`/`ARC_WEB_PORT`). It is represented as
    an in-memory sent-email record in `src/runs/notifications.js`, matching how the rest of this
    minimal app (no database, no external services) represents state. Wiring a real provider is a
    separate, later concern.
  - |
    AC6's literal wording only calls out "a task retry or block event," but the approved design's
    own annotations explicitly extend audit logging to resolution events too (Run Detail screen:
    "logs the resolution to the audit log (AC6)"; Audit Log screen: "Every retry, block, and
    resolution event across Runs"). This plan follows the design and logs `'resolved'` audit
    events as well, flagging the gap between the strict AC text and the wider design scope.
  - |
    On resolve (AC5), the task's attempt counter is reset to 0 so a subsequent failure gets a
    fresh 3-attempt cycle rather than immediately re-blocking on the very next failure. The ACs
    don't specify this either way; it's inferred from the design's "Resolved & resumed" reference
    state, which shows the task back to a plain "In progress" chip with no attempt count.
  - |
    Only the design's screens 1 ("Run Detail — Live Simulation") and 4 ("Audit Log — Full
    History") are built as real, routable pages. Screens 2 ("Retry & Blocked — Reference States")
    and 3 ("HR Coordinator Notifications") are static, reviewer-only illustrations of states
    already reachable live on screen 1 (the same `.task-card`/`.banner`/notif-dropdown in
    different data states) and are not given separate routes.
  - |
    There is no authentication/authorization system anywhere in this repo. AC5's "HR coordinator
    or platform admin" restriction is therefore not enforced server-side; the resolve endpoint
    accepts a free-text `resolver` field, matching the design's own `<select>` of two named
    people with no login step. Real role-based access control would need an auth system that
    doesn't exist yet.
  - |
    The Run/Task store is in-memory only (`Map`s inside `src/runs/store.js`, like
    `src/employees/store.js`), seeded with one demo Run (`RUN-4821`) at module load so
    `public/runs.html` has real data without a run-creation UI, which no AC in this story asks
    for. State is lost on server restart, matching the existing employees/expenses behavior.
package_dependencies: []
notes: |
  `git log` shows the backend (`src/server.js`, `src/employees/*`) landed in an earlier chore/
  story and the two most recent frontend stories (`ec80d14` edit-modal, `62b7dc3` create-modal)
  established the `public/js/<feature>.js` + `public/css/<feature>.css` + `test/<feature>.test.js`
  pattern this plan follows for `runs`/`audit-log`. `src/employees/routes.js` is shown below as
  existing, untouched context to make the layering clear: the new `/runs` and `/audit-log`
  mounts sit alongside it in `src/server.js` without changing it.

  ```mermaid
  flowchart TD
    Server["src/server.js"] -->|new: app.use('/runs', ...) + app.use('/audit-log', ...)| RunsRoutes["src/runs/routes.js"]
    Server -->|unchanged| EmployeesRoutes["src/employees/routes.js"]
    RunsRoutes -->|createRun / recordTaskFailure / resolveTask / getRunDetail| RunsStore["src/runs/store.js"]
    RunsStore -->|computeBackoffMs, MAX_ATTEMPTS| RetryPolicy["src/runs/retryPolicy.js"]
    RunsStore -->|record / list / listForRun| AuditLog["src/runs/auditLog.js"]
    RunsStore -->|notifyHrCoordinator on 3rd failure| Notifications["src/runs/notifications.js"]
    RunsRoutes -->|GET / -- full history| AuditLog
    RunsHtml["public/runs.html"] -->|script tag| RunsJs["public/js/runs.js"]
    RunsJs -->|fetch GET/POST| RunsRoutes
    RunsHtml -->|link rel=stylesheet, new| RunsCss["public/css/runs.css"]
    RunsCss -->|var references, unchanged| Tokens["design-system/tokens.css"]
    AuditHtml["public/audit-log.html"] -->|script tag| AuditJs["public/js/audit-log.js"]
    AuditJs -->|fetch GET /audit-log| RunsRoutes
    TestStore["test/runsStore.test.js"] --> RunsStore
    TestRoutes["test/runs.routes.test.js"] -->|supertest| Server
    TestRunsPage["test/runsPage.test.js"] -->|jsdom, mocked fetch| RunsJs

    classDef touched fill:#f96,color:#000
    class Server,RunsRoutes,RunsStore,RetryPolicy,AuditLog,Notifications,RunsHtml,RunsJs,RunsCss,AuditHtml,AuditJs,TestStore,TestRoutes,TestRunsPage touched
  ```

  Layering rationale: `src/runs/store.js` is the single place that owns Run/Task state and
  delegates the two orthogonal concerns (backoff math, audit writes) to pure/append-only helper
  modules, exactly mirroring how `public/app.js` delegates to `public/validation.js` and
  `public/currency.js` in the expense feature. `src/runs/routes.js` never touches
  `retryPolicy.js`/`auditLog.js`/`notifications.js` directly — only through `store.js` — so the
  HTTP layer stays a thin translation of store results to status codes/JSON, matching
  `src/employees/routes.js`.
