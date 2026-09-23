summary: |
  This repo has no Workflow or Run concept at all yet — only an unrelated `employees` Express
  module (in-memory `Map` store, thin router, no persistence layer) that establishes the
  project's convention for a backend feature: `src/<feature>/store.js` for in-memory domain
  logic plus `src/<feature>/routes.js` for a thin Express router, wired into `src/server.js`,
  and tested end-to-end with `supertest` in `test/<feature>.test.js` (see
  `test/employees.test.js`). This plan introduces two new modules following that exact shape —
  `src/workflows` (create/validate a Workflow definition containing conditional branches and a
  default path) and `src/runs` (start a Run for a hire's attributes, route it down the matching
  branch or the default path, record every task as executed/skipped, and block+notify when a
  branch's condition can't be safely evaluated) — so a Workflow's task graph can adapt to hire
  type (e.g. skip on-site IT provisioning for a remote contractor) without manual intervention
  at Run time.

scope:
  - description: |
      Add `src/workflows/conditions.js`, the shared condition-evaluation logic used both to
      route a Run and to validate a Workflow definition on save:
      ```js
      function valuesOf(condition) {
        return condition.operator === 'in' ? condition.value : [condition.value];
      }

      function conditionsOverlap(a, b) {
        if (a.attribute !== b.attribute) return false;
        return valuesOf(a).some((v) => valuesOf(b).includes(v));
      }

      function evaluateCondition(condition, hireAttributes, schema) {
        const { attribute } = condition;
        const value = hireAttributes[attribute];
        if (schema.includes(attribute) && (value === undefined || value === null)) {
          return 'missing';
        }
        return valuesOf(condition).includes(value) ? 'match' : 'no-match';
      }

      module.exports = { conditionsOverlap, evaluateCondition };
      ```
      Only two operators are supported — `equals` (single `value`) and `in` (array `value`) —
      which is enough to express "hire type is remote-contractor" style branches and to make
      AC7's overlap check deterministic.
    files:
      - src/workflows/conditions.js
    rationale: |
      Both the save-time validation (AC7) and the run-time routing (AC1/AC3/AC5) need the same
      notion of "could this condition match/could two conditions both match", so this is
      factored out once rather than duplicated between `workflows/store.js` and `runs/store.js`.

  - description: |
      Add `src/workflows/store.js`: an in-memory Workflow store mirroring
      `src/employees/store.js`'s `Map` + `crypto.randomUUID()` pattern, but rejecting the save
      when any two branches' conditions overlap:
      ```js
      const crypto = require('crypto');
      const { conditionsOverlap } = require('./conditions');

      const workflows = new Map();

      function createWorkflow(data) {
        const branches = data.branches || [];
        for (let i = 0; i < branches.length; i += 1) {
          for (let j = i + 1; j < branches.length; j += 1) {
            if (conditionsOverlap(branches[i].condition, branches[j].condition)) {
              const error = new Error(
                `Branch conditions "${branches[i].id}" and "${branches[j].id}" can both be satisfied by the same hire record`
              );
              error.code = 'VALIDATION_ERROR';
              throw error;
            }
          }
        }
        const workflow = { ...data, id: crypto.randomUUID() };
        workflows.set(workflow.id, workflow);
        return workflow;
      }

      function getWorkflow(id) {
        return workflows.get(id);
      }

      module.exports = { createWorkflow, getWorkflow };
      ```
      A Workflow definition is `{ name, hireAttributeSchema: string[], branches: [{ id,
      condition, taskIds }], defaultTaskIds }` — the definition IS the partition of task ids
      across branches plus the default path; there is no separate top-level `tasks` list, since
      no AC requires one and every task id already lives in exactly one `branches[].taskIds` or
      `defaultTaskIds`.
    files:
      - src/workflows/store.js
    rationale: |
      Matches the existing `employees` module's storage convention exactly (in-memory `Map`,
      caller supplies the domain payload, store assigns the `id`). The overlap check runs here,
      at save time, so AC7 is enforced before a bad Workflow can ever be used to start a Run.

  - description: |
      Add `src/workflows/routes.js`: a thin router, same shape as `src/employees/routes.js`,
      that maps the store's validation error to a 400:
      ```js
      const express = require('express');
      const { createWorkflow } = require('./store');

      const router = express.Router();

      router.post('/', (req, res) => {
        try {
          const workflow = createWorkflow(req.body);
          res.status(201).json(workflow);
        } catch (err) {
          if (err.code === 'VALIDATION_ERROR') {
            return res.status(400).json({ error: err.message });
          }
          throw err;
        }
      });

      module.exports = router;
      ```
    files:
      - src/workflows/routes.js
    rationale: |
      Gives AC7 an HTTP surface to assert against (`POST /workflows` returning 400), matching
      how `test/employees.test.js` drives the employees store through `supertest` rather than
      calling store functions directly.

  - description: |
      Add `src/runs/notifications.js`: an in-memory notification record, since no email/Slack/
      HR-coordinator-directory integration exists anywhere in this codebase today:
      ```js
      const crypto = require('crypto');

      const notifications = [];

      function notifyHrCoordinator(coordinatorId, runId, message) {
        const notification = { id: crypto.randomUUID(), coordinatorId, runId, message };
        notifications.push(notification);
        return notification;
      }

      function getNotificationsForCoordinator(coordinatorId) {
        return notifications.filter((n) => n.coordinatorId === coordinatorId);
      }

      module.exports = { notifyHrCoordinator, getNotificationsForCoordinator };
      ```
    files:
      - src/runs/notifications.js
    rationale: |
      AC6 only requires that the assigned HR coordinator "is notified" — there is no outbound
      channel in this project to actually send anything through, so the minimal, testable
      contract is an in-memory record the test suite can query directly by `coordinatorId`.

  - description: |
      Add `src/runs/store.js`: starts a Run for a Workflow + a hire's attributes, evaluating
      every branch's condition to decide routing, blocking, and per-task status:
      ```js
      const crypto = require('crypto');
      const { getWorkflow } = require('../workflows/store');
      const { evaluateCondition } = require('../workflows/conditions');
      const { notifyHrCoordinator } = require('./notifications');

      const runs = new Map();

      function startRun({ workflowId, coordinatorId, hireAttributes }) {
        const workflow = getWorkflow(workflowId);
        if (!workflow) return null;

        const evaluations = workflow.branches.map((branch) => ({
          branch,
          result: evaluateCondition(branch.condition, hireAttributes, workflow.hireAttributeSchema || []),
        }));

        const blocked = evaluations.find((e) => e.result === 'missing');
        if (blocked) {
          const reason = `Branch "${blocked.branch.id}" condition references "${blocked.branch.condition.attribute}", which is missing on this hire record`;
          const run = {
            id: crypto.randomUUID(), workflowId, coordinatorId, hireAttributes,
            status: 'blocked', blockedReason: reason, taskStatuses: {},
          };
          runs.set(run.id, run);
          notifyHrCoordinator(coordinatorId, run.id, reason);
          return run;
        }

        const matched = evaluations.find((e) => e.result === 'match');
        const taskStatuses = {};
        workflow.branches.forEach(({ id, taskIds }) => {
          const status = matched && matched.branch.id === id ? 'executed' : 'skipped';
          taskIds.forEach((taskId) => { taskStatuses[taskId] = status; });
        });
        (workflow.defaultTaskIds || []).forEach((taskId) => {
          taskStatuses[taskId] = matched ? 'skipped' : 'executed';
        });

        const run = {
          id: crypto.randomUUID(), workflowId, coordinatorId, hireAttributes,
          status: 'completed', taskStatuses,
        };
        runs.set(run.id, run);
        return run;
      }

      function getRun(id) {
        return runs.get(id);
      }

      module.exports = { startRun, getRun };
      ```
      Blocking rule: if ANY branch's condition attribute is listed in `hireAttributeSchema` but
      is `undefined`/`null` on `hireAttributes`, the Run blocks immediately (we cannot safely
      prove that branch wouldn't have matched) and no task statuses are assigned. Otherwise, at
      most one branch should match (AC7 prevents two branches from being simultaneously
      satisfiable at save time) and every task id across all branches plus `defaultTaskIds` gets
      exactly one status, so AC4's "none omitted" holds by construction.
    files:
      - src/runs/store.js
    rationale: |
      This is the actual conditional-branching behavior the story asks for: given the same
      Workflow, different hire attributes must produce different, fully-accounted-for task
      status maps, or a blocked Run with a coordinator notification.

  - description: |
      Add `src/runs/routes.js`:
      ```js
      const express = require('express');
      const { startRun } = require('./store');

      const router = express.Router();

      router.post('/', (req, res) => {
        const run = startRun(req.body);
        if (!run) {
          return res.status(404).json({ error: 'workflow not found' });
        }
        res.status(201).json(run);
      });

      module.exports = router;
      ```
    files:
      - src/runs/routes.js
    rationale: |
      Gives every AC (1-6) an HTTP surface (`POST /runs`) to assert against via `supertest`,
      consistent with how the existing `employees` suite drives its module.

  - description: |
      Modify `src/server.js` to mount both new routers, following the existing
      `app.use('/employees', employeesRouter)` line:
      ```js
      const workflowsRouter = require('./workflows/routes');
      const runsRouter = require('./runs/routes');
      // ...
      app.use('/workflows', workflowsRouter);
      app.use('/runs', runsRouter);
      ```
    files:
      - src/server.js
    rationale: |
      Without this the new routes are unreachable through the running app, mirroring exactly
      how the `employees` router is wired in today.

  - description: |
      Add `test/workflows.test.js` (AC7) and `test/runs.test.js` (AC1-AC6), both using
      `supertest` against `require('../src/server')` exactly like `test/employees.test.js`, one
      test per acceptance criterion. Both files share a single two-branch, default-path fixture
      Workflow payload so AC1/AC2/AC3/AC4 can be demonstrated against one definition:
      ```js
      const workflowPayload = {
        name: 'New Hire Onboarding',
        hireAttributeSchema: ['hireType'],
        branches: [
          { id: 'remote', condition: { attribute: 'hireType', operator: 'equals', value: 'remote-contractor' }, taskIds: ['ship-equipment', 'remote-it-setup'] },
          { id: 'onsite', condition: { attribute: 'hireType', operator: 'equals', value: 'employee' }, taskIds: ['badge-provisioning', 'onsite-it-setup'] },
        ],
        defaultTaskIds: ['send-welcome-email', 'assign-buddy'],
      };
      ```
    files:
      - test/workflows.test.js
      - test/runs.test.js
    rationale: |
      These are the test-first artifacts for all 7 ACs; hitting the real `POST /workflows` and
      `POST /runs` endpoints (rather than calling store functions directly) verifies the whole
      slice — validation, routing, blocking, and notification — through the same path a real
      caller would use.

tests:
  - |
    AC1 — a hire matching the "remote" branch executes only that branch's tasks:
    ```js
    test('AC1: a run for a remote-contractor hire executes the matching branch tasks', async () => {
      const wfRes = await request(app).post('/workflows').send(workflowPayload);
      const runRes = await request(app).post('/runs').send({
        workflowId: wfRes.body.id, coordinatorId: 'coord-1',
        hireAttributes: { hireType: 'remote-contractor' },
      });
      expect(runRes.status).toBe(201);
      expect(runRes.body.taskStatuses['ship-equipment']).toBe('executed');
      expect(runRes.body.taskStatuses['remote-it-setup']).toBe('executed');
    });
    ```
    Fails until `startRun` matches the "remote" branch's condition and marks its `taskIds`
    `'executed'`.
  - |
    AC2 — the same run records the non-matching "onsite" branch's tasks as skipped:
    ```js
    test('AC2: the non-matching branch tasks are recorded as skipped', async () => {
      const wfRes = await request(app).post('/workflows').send(workflowPayload);
      const runRes = await request(app).post('/runs').send({
        workflowId: wfRes.body.id, coordinatorId: 'coord-1',
        hireAttributes: { hireType: 'remote-contractor' },
      });
      expect(runRes.body.taskStatuses['badge-provisioning']).toBe('skipped');
      expect(runRes.body.taskStatuses['onsite-it-setup']).toBe('skipped');
    });
    ```
    Fails until `startRun` marks every branch other than the matched one `'skipped'`.
  - |
    AC3 — a hire matching no branch condition executes the default path:
    ```js
    test('AC3: a run for a hire matching no branch executes the default path tasks', async () => {
      const wfRes = await request(app).post('/workflows').send(workflowPayload);
      const runRes = await request(app).post('/runs').send({
        workflowId: wfRes.body.id, coordinatorId: 'coord-1',
        hireAttributes: { hireType: 'intern' },
      });
      expect(runRes.body.taskStatuses['send-welcome-email']).toBe('executed');
      expect(runRes.body.taskStatuses['assign-buddy']).toBe('executed');
    });
    ```
    Fails until `startRun` falls back to marking `defaultTaskIds` `'executed'` when no branch
    matched.
  - |
    AC4 — every task in the Workflow is accounted for exactly once when the default path runs:
    ```js
    test('AC4: every defined task is executed or skipped, none omitted', async () => {
      const wfRes = await request(app).post('/workflows').send(workflowPayload);
      const runRes = await request(app).post('/runs').send({
        workflowId: wfRes.body.id, coordinatorId: 'coord-1',
        hireAttributes: { hireType: 'intern' },
      });
      const allTaskIds = ['ship-equipment', 'remote-it-setup', 'badge-provisioning', 'onsite-it-setup', 'send-welcome-email', 'assign-buddy'];
      allTaskIds.forEach((taskId) => {
        expect(['executed', 'skipped']).toContain(runRes.body.taskStatuses[taskId]);
      });
      expect(Object.keys(runRes.body.taskStatuses)).toHaveLength(allTaskIds.length);
    });
    ```
    Fails until `startRun` assigns a status to both non-matching branches' tasks AND the
    executed default tasks in the same run.
  - |
    AC5 — a branch condition referencing a schema attribute that is absent on the hire record
    blocks the Run:
    ```js
    test('AC5: a missing schema-referenced attribute blocks the run', async () => {
      const wfRes = await request(app).post('/workflows').send(workflowPayload);
      const runRes = await request(app).post('/runs').send({
        workflowId: wfRes.body.id, coordinatorId: 'coord-1', hireAttributes: {},
      });
      expect(runRes.status).toBe(201);
      expect(runRes.body.status).toBe('blocked');
    });
    ```
    Fails until `startRun` detects `evaluateCondition(...) === 'missing'` for `hireType` and
    sets `status: 'blocked'` instead of routing the run.
  - |
    AC6 — the assigned HR coordinator is notified when the run blocks:
    ```js
    const { getNotificationsForCoordinator } = require('../src/runs/notifications');

    test('AC6: the assigned HR coordinator is notified when the run blocks', async () => {
      const wfRes = await request(app).post('/workflows').send(workflowPayload);
      const runRes = await request(app).post('/runs').send({
        workflowId: wfRes.body.id, coordinatorId: 'coord-1', hireAttributes: {},
      });
      const notifications = getNotificationsForCoordinator('coord-1');
      expect(notifications.some((n) => n.runId === runRes.body.id)).toBe(true);
    });
    ```
    Fails until `startRun` calls `notifyHrCoordinator(coordinatorId, run.id, reason)` on the
    blocked path.
  - |
    AC7 — saving a Workflow with two branch conditions that could both be satisfied by the same
    hire record is rejected:
    ```js
    test('AC7: overlapping branch conditions are rejected on save', async () => {
      const res = await request(app).post('/workflows').send({
        name: 'Bad Workflow',
        hireAttributeSchema: ['hireType'],
        branches: [
          { id: 'a', condition: { attribute: 'hireType', operator: 'equals', value: 'remote-contractor' }, taskIds: ['t1'] },
          { id: 'b', condition: { attribute: 'hireType', operator: 'in', value: ['remote-contractor', 'employee'] }, taskIds: ['t2'] },
        ],
        defaultTaskIds: [],
      });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/can both be satisfied/);
    });
    ```
    Fails until `createWorkflow` runs `conditionsOverlap` over every branch pair and throws a
    `VALIDATION_ERROR` that the route maps to a 400.

assumptions_or_open_questions:
  - |
    No hire/employee attribute schema exists anywhere in this codebase (the `employees` module
    stores arbitrary `req.body` with no schema at all). This plan defines
    `hireAttributeSchema: string[]` as a field on the Workflow definition itself, scoped to that
    Workflow, rather than inventing a separate global hire-schema service the story doesn't ask
    for.
  - |
    The condition language supports only `equals` (single `value`) and `in` (array `value`)
    operators. This is enough to express the story's own example ("skip IT provisioning for
    remote contractors") and to make AC7's overlap detection exact and deterministic; general
    boolean expressions (AND/OR across attributes, numeric comparisons) are out of scope.
  - |
    "The assigned HR coordinator" (AC6) is modeled as an opaque `coordinatorId` string passed in
    the `POST /runs` request body, since no coordinator/employee directory or assignment concept
    exists in this codebase yet. Notification delivery is an in-memory record queryable by
    `coordinatorId`, not an actual email/Slack send, since no such integration exists to hook
    into.
  - |
    AC7's overlap check only compares branch-vs-branch pairs, not branch-vs-default: the default
    path is defined as "whatever no branch matched," so it can never overlap with an explicit
    branch by construction.
  - |
    A Workflow definition's task ids live only inside `branches[].taskIds` and
    `defaultTaskIds` — there is no separate top-level `tasks` array — since every AC only ever
    refers to tasks in terms of which branch or the default path they belong to.
  - |
    No `GET /workflows/:id` or `GET /runs/:id` endpoints are added: every AC is verifiable from
    the `POST /workflows` / `POST /runs` response bodies directly (or, for AC6, by importing
    `getNotificationsForCoordinator` directly in the test, matching how `notifications.js` is a
    plain in-memory module with no route of its own).

package_dependencies: []

notes: |
  This plan adds two new feature modules and wires both into the existing server, so the shape
  is worth diagramming:

  ```mermaid
  flowchart TD
    Server["src/server.js"] -->|app.use /workflows| WFRoutes["src/workflows/routes.js"]
    Server -->|app.use /runs| RunRoutes["src/runs/routes.js"]
    WFRoutes -->|createWorkflow, AC7| WFStore["src/workflows/store.js"]
    WFStore -->|conditionsOverlap, AC7| Conditions["src/workflows/conditions.js"]
    RunRoutes -->|startRun, AC1-AC6| RunStore["src/runs/store.js"]
    RunStore -->|getWorkflow| WFStore
    RunStore -->|evaluateCondition, AC1/AC3/AC5| Conditions
    RunStore -->|notifyHrCoordinator, AC6| Notify["src/runs/notifications.js"]
    TestWF["test/workflows.test.js"] -->|supertest| Server
    TestRun["test/runs.test.js"] -->|supertest| Server
    TestRun -.->|getNotificationsForCoordinator| Notify

    classDef touched fill:#f96,color:#000
    class Server,WFRoutes,WFStore,Conditions,RunRoutes,RunStore,Notify,TestWF,TestRun touched
  ```

  `src/employees/*` (`store.js`, `routes.js`) was read and confirmed untouched and is omitted
  from the diagram — it only served as the reference pattern (in-memory `Map` store + thin
  router + `supertest` test in `test/employees.test.js`) that this plan's two new modules
  follow exactly. `src/server.js` currently only mounts `express.json()`, two static
  middlewares, and the `employees` router — confirmed by reading the file — so mounting
  `/workflows` and `/runs` follows the same one-line-per-router convention already there.
  No new third-party dependency is needed: `express` (`^4.22.3`), `jest` (`^29.7.0`), and
  `supertest` (`^6.3.4`) are already installed per `package.json` and are all this plan uses.
