summary: |
  This repo currently has no Workflow/Run domain model anywhere (confirmed by grepping for
  "workflow"/"Run" across the codebase: zero matches). It only has an unrelated Express
  "employees" API (`src/employees/{store,routes}.js`, in-memory `Map`-backed) and a client-side
  "expenses" frontend under `public/`, both from prior stories. TEST-M1-STORY-050 is the first
  story to touch the Workflow/Run domain, and its ACs are narrowly about version pinning, not
  the full task-graph engine the parent epic eventually needs. This plan therefore builds the
  minimal slice: an in-memory, versioned Workflow definition store (each update appends a new
  version rather than mutating the prior one), and a Run store that captures the workflow's
  latest definition version and task graph at the moment a run is created and never re-reads it
  afterward. No task-execution engine, branching evaluator, or authoring UI is built here — only
  the data model and HTTP surface needed to prove a Run stays pinned to the version it started
  with while new Runs pick up the latest version. The implementation mirrors the existing
  `src/employees/*` module shape (in-memory `Map` store + Express router + `crypto.randomUUID()`
  ids) since that is the only established backend convention in this repo.
scope:
  - description: |
      Add the versioned Workflow definition store. Each workflow has an id and a list of
      immutable versions; creating a workflow starts it at version 1, and updating it appends a
      new version rather than mutating any existing one — this immutability is what guarantees
      AC1 ("no change to its task graph or branching logic") holds even after later updates.
      Every read/write deep-clones the `taskGraph` value (`JSON.parse(JSON.stringify(...))`) so
      no caller can mutate a stored version, or a value handed back to a caller, through a
      shared object reference.

      ```js
      // src/workflows/store.js
      const crypto = require('crypto');

      const workflows = new Map(); // id -> { id, versions: [{ version, taskGraph }] }

      function clone(value) {
        return JSON.parse(JSON.stringify(value));
      }

      function createWorkflow(taskGraph) {
        const id = crypto.randomUUID();
        workflows.set(id, { id, versions: [{ version: 1, taskGraph: clone(taskGraph) }] });
        return getVersion(id, 1);
      }

      function updateWorkflow(workflowId, taskGraph) {
        const workflow = workflows.get(workflowId);
        if (!workflow) return undefined;
        const version = workflow.versions.length + 1;
        workflow.versions.push({ version, taskGraph: clone(taskGraph) });
        return getVersion(workflowId, version);
      }

      function getLatestVersion(workflowId) {
        const workflow = workflows.get(workflowId);
        if (!workflow) return undefined;
        return getVersion(workflowId, workflow.versions.length);
      }

      function getVersion(workflowId, version) {
        const workflow = workflows.get(workflowId);
        if (!workflow) return undefined;
        const found = workflow.versions.find((v) => v.version === version);
        return found ? { workflowId, version: found.version, taskGraph: clone(found.taskGraph) } : undefined;
      }

      module.exports = { createWorkflow, updateWorkflow, getLatestVersion, getVersion };
      ```
    files:
      - src/workflows/store.js
      - test/workflows.test.js
    rationale: |
      This is the foundation both ACs depend on: AC1 needs old versions to be genuinely
      immutable once superseded, and AC2 needs a reliable "latest version" read. Cloning on
      every read/write (not just on write) closes a subtle aliasing hole: without it, a caller
      holding a reference returned by `getLatestVersion` could mutate it and corrupt the
      store's internal version record, silently breaking AC1's "no change" guarantee for any
      run that later reads the same version.
  - description: |
      Add the Run store. Starting a run reads the workflow's *current* latest version once,
      at creation time, and copies its version number and task graph onto the run record. The
      run is never re-linked to the workflow afterward, so later workflow updates cannot affect
      it — this is what AC1 requires structurally, since there is no task-execution engine in
      this codebase to observe "still executing" more literally.

      ```js
      // src/runs/store.js
      const crypto = require('crypto');
      const { getLatestVersion } = require('../workflows/store');

      const runs = new Map();

      function startRun(workflowId) {
        const definition = getLatestVersion(workflowId);
        if (!definition) return undefined;
        const run = {
          id: crypto.randomUUID(),
          workflowId,
          definitionVersion: definition.version,
          taskGraph: definition.taskGraph,
        };
        runs.set(run.id, run);
        return run;
      }

      function getRun(runId) {
        return runs.get(runId);
      }

      module.exports = { startRun, getRun };
      ```
    files:
      - src/runs/store.js
      - test/runs.test.js
    rationale: |
      `startRun` reading `getLatestVersion` exactly once, at creation, and never again is the
      entire pinning mechanism: AC1 falls out of the run record simply never being updated when
      the workflow changes, and AC2 falls out of `getLatestVersion` reflecting whatever the most
      recent `createWorkflow`/`updateWorkflow` call left behind. Because
      `workflows/store.js#getVersion` already returns a fresh clone on every call, `run.taskGraph`
      is already an independent copy — no further cloning is needed here.
  - description: |
      Add the HTTP surface for both domains, mounted the same way `src/employees/routes.js` is
      mounted today (`app.use('/employees', employeesRouter)` in `src/server.js`).

      ```js
      // src/workflows/routes.js
      const express = require('express');
      const { createWorkflow, updateWorkflow } = require('./store');
      const { startRun } = require('../runs/store');

      const router = express.Router();

      router.post('/', (req, res) => {
        const definition = createWorkflow(req.body.taskGraph);
        res.status(201).json({ id: definition.workflowId, version: definition.version, taskGraph: definition.taskGraph });
      });

      router.post('/:id/versions', (req, res) => {
        const definition = updateWorkflow(req.params.id, req.body.taskGraph);
        if (!definition) return res.status(404).json({ error: 'workflow not found' });
        res.status(201).json({ id: definition.workflowId, version: definition.version, taskGraph: definition.taskGraph });
      });

      router.post('/:id/runs', (req, res) => {
        const run = startRun(req.params.id);
        if (!run) return res.status(404).json({ error: 'workflow not found' });
        res.status(201).json(run);
      });

      module.exports = router;
      ```

      ```js
      // src/runs/routes.js
      const express = require('express');
      const { getRun } = require('./store');

      const router = express.Router();

      router.get('/:id', (req, res) => {
        const run = getRun(req.params.id);
        if (!run) return res.status(404).json({ error: 'run not found' });
        res.status(200).json(run);
      });

      module.exports = router;
      ```

      `src/server.js` gains two mount lines alongside the existing employees mount:
      ```js
      app.use('/workflows', workflowsRouter);
      app.use('/runs', runsRouter);
      ```
    files:
      - src/workflows/routes.js
      - src/runs/routes.js
      - src/server.js
    rationale: |
      An HTTP surface is needed so the ACs can be exercised end-to-end the same way
      `test/employees.test.js` drives the employees API through `supertest`, rather than only at
      the store layer. `POST /workflows/:id/runs` (nested under the workflow) and
      `GET /runs/:id` (flat, since a run is looked up by its own id thereafter) mirror how the
      run is conceptually scoped at creation but independent afterward.
tests:
  - |
    AC1 (store level) — `test/runs.test.js`: a run keeps its original version/task graph after
    the workflow it was started from is updated.
    ```js
    const { createWorkflow, updateWorkflow } = require('../src/workflows/store');
    const { startRun, getRun } = require('../src/runs/store');

    test('AC1: a run stays pinned to its original version and task graph after a later update', () => {
      const created = createWorkflow({ tasks: [{ id: 't1', next: [] }] });
      const run = startRun(created.workflowId);

      updateWorkflow(created.workflowId, { tasks: [{ id: 't1', next: ['t2'] }, { id: 't2', next: [] }] });

      const reloaded = getRun(run.id);
      expect(reloaded.definitionVersion).toBe(1);
      expect(reloaded.taskGraph).toEqual({ tasks: [{ id: 't1', next: [] }] });
    });
    ```
    Fails until `src/workflows/store.js` and `src/runs/store.js` exist and `startRun` copies
    (rather than references-and-re-reads) the workflow's definition at creation time.
  - |
    AC2 (store level) — `test/runs.test.js`: a run started after an update pins to the latest
    version.
    ```js
    test('AC2: a run started after a definition update pins to the latest version at creation', () => {
      const created = createWorkflow({ tasks: [{ id: 't1', next: [] }] });
      updateWorkflow(created.workflowId, { tasks: [{ id: 't1', next: ['t2'] }, { id: 't2', next: [] }] });

      const run = startRun(created.workflowId);
      expect(run.definitionVersion).toBe(2);
      expect(run.taskGraph).toEqual({ tasks: [{ id: 't1', next: ['t2'] }, { id: 't2', next: [] }] });
    });
    ```
    Fails until `updateWorkflow` appends a new version and `startRun` reads
    `getLatestVersion` rather than a fixed/cached version.
  - |
    AC1 (HTTP level, end to end through `src/server.js`) — `test/runs.test.js`:
    ```js
    const request = require('supertest');
    const app = require('../src/server');

    test('AC1 (HTTP): an in-flight run is unaffected by a later definition update', async () => {
      const createRes = await request(app).post('/workflows').send({ taskGraph: { tasks: [{ id: 't1', next: [] }] } });
      const workflowId = createRes.body.id;

      const runRes = await request(app).post(`/workflows/${workflowId}/runs`).send();
      expect(runRes.status).toBe(201);
      expect(runRes.body.definitionVersion).toBe(1);

      await request(app)
        .post(`/workflows/${workflowId}/versions`)
        .send({ taskGraph: { tasks: [{ id: 't1', next: ['t2'] }, { id: 't2', next: [] }] } });

      const getRes = await request(app).get(`/runs/${runRes.body.id}`);
      expect(getRes.body.definitionVersion).toBe(1);
      expect(getRes.body.taskGraph).toEqual({ tasks: [{ id: 't1', next: [] }] });
    });
    ```
  - |
    AC2 (HTTP level) — `test/runs.test.js`:
    ```js
    test('AC2 (HTTP): a run created after an update is pinned to the new latest version', async () => {
      const createRes = await request(app).post('/workflows').send({ taskGraph: { tasks: [{ id: 't1', next: [] }] } });
      const workflowId = createRes.body.id;

      const updateRes = await request(app)
        .post(`/workflows/${workflowId}/versions`)
        .send({ taskGraph: { tasks: [{ id: 't1', next: ['t2'] }, { id: 't2', next: [] }] } });
      expect(updateRes.body.version).toBe(2);

      const runRes = await request(app).post(`/workflows/${workflowId}/runs`).send();
      expect(runRes.body.definitionVersion).toBe(2);
      expect(runRes.body.taskGraph).toEqual(updateRes.body.taskGraph);
    });
    ```
assumptions_or_open_questions:
  - |
    No Workflow or Run concept exists anywhere in this repo today (verified by grepping for
    "workflow"/"Run" — zero matches outside this plan). This plan builds only the version-pinning
    slice the two ACs describe: a versioned definition store and a Run record that snapshots its
    version at creation. It deliberately does not build a task-execution engine, branching
    evaluator, or workflow-authoring UI — those belong to other stories under the parent epic and
    aren't implied by either AC here.
  - |
    The task graph's concrete shape is not specified by any story or ADR, so it is treated as an
    opaque, caller-supplied JSON value (illustrated in tests as `{ tasks: [{ id, next }] }`). This
    plan's store only versions and pins that value unchanged; it never interprets, validates, or
    executes it.
  - |
    "The in-flight Run continues executing against version N... without any change to its task
    graph or branching logic" (AC1) is verified structurally — the run's persisted
    `definitionVersion`/`taskGraph` are asserted identical before and after a workflow update —
    since there is no task executor in this codebase to observe "still executing" any more
    literally. If a future story adds an actual executor, it should read a run's task graph from
    the run record itself (never re-derive it from the workflow by id), which is exactly the
    contract this plan establishes.
  - |
    Starting a run against an unknown workflow id, or posting a new version to an unknown
    workflow id, returns `404`. Neither AC covers this, but it's the minimal well-defined
    behavior, mirroring the existing `GET /employees/:id` 404 pattern in
    `src/employees/routes.js`.
  - |
    Versioning and run storage are in-memory (`Map`s scoped to the running process), matching the
    only existing backend persistence convention in this repo (`src/employees/store.js`). Data
    does not survive a process restart; this is the same limitation already accepted for the
    employees resource, not a new gap introduced here.
  - |
    `POST /workflows/:id/versions` was chosen (over `PUT /workflows/:id`) to make explicit that
    an update appends a new version rather than replacing the resource in place — worth
    confirming this naming is acceptable since no prior story establishes a versioning-endpoint
    convention to follow.
package_dependencies: []
notes: |
  This plan's scope crosses two new domain directories (`src/workflows/`, `src/runs/`) plus the
  shared `src/server.js` mount point, and one router depends on the other domain's store
  (`src/workflows/routes.js` calls `src/runs/store.js#startRun` for the nested
  `POST /workflows/:id/runs` route), so the shape is worth diagramming:

  ```mermaid
  flowchart TD
    Server["src/server.js"] -->|mounts /workflows, new| WFRoutes["src/workflows/routes.js"]
    Server -->|mounts /runs, new| RunRoutes["src/runs/routes.js"]
    Server -->|unchanged| EmployeesRouter["src/employees/routes.js"]
    WFRoutes -->|createWorkflow/updateWorkflow| WFStore["src/workflows/store.js"]
    WFRoutes -->|"startRun (nested POST /workflows/:id/runs)"| RunStore["src/runs/store.js"]
    RunRoutes -->|getRun| RunStore
    RunStore -->|"getLatestVersion, read once at run creation"| WFStore
    TestWF["test/workflows.test.js"] -->|unit tests| WFStore
    TestRuns["test/runs.test.js"] -->|"store tests + supertest against app"| RunStore
    TestRuns -->|supertest| Server

    classDef touched fill:#f96,color:#000
    class Server,WFRoutes,RunRoutes,WFStore,RunStore,TestWF,TestRuns touched
  ```

  `src/employees/*` and the `public/` expenses frontend are untouched by this plan and are shown
  only for context (no `touched` styling). The critical edge is `RunStore -> WFStore`: it is
  read exactly once, at `startRun` time, which is the entire mechanism behind both ACs — AC1
  because that edge is never traversed again for an existing run, and AC2 because it always
  resolves to whatever `WFStore` currently considers the latest version.
