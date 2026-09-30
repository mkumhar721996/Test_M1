summary: |
  Scaffold a new `tasks` module (store + routes) and expose `POST /tasks`, which creates a Task
  record tied to a valid `Run`. This is the first slice of the "Task CRUD Core" epic — only create
  is in scope here; list/get/update/delete are separate stories. The store follows the existing
  `GuestValidationError` convention (`src/guests/store.js`) of a typed validation-error class
  thrown by the store and mapped to a status code in the router, adapted to return 422 (per this
  story's ACs) instead of the guests module's 400. Malformed-JSON handling requires a small,
  narrowly-scoped fix to the shared app-level error middleware in `src/server.js`, which today
  unconditionally returns 500 for every error reaching it.

scope:
  - description: |
      Create `src/tasks/store.js`: an in-memory `Map`-backed store mirroring the shape of
      `src/guests/store.js` and `src/runs/store.js`.

      - `class TaskValidationError extends Error` with a `fields` object and `statusCode = 422`.
      - `createTask(data)`: requires `data.runId` to be present and to resolve via
        `getRun(runId)` (imported from `../runs/store`); throws `TaskValidationError` otherwise;
        on success stores and returns `{ id: crypto.randomUUID(), runId }`.
      - `listTasks()`: exported for test-only verification that nothing was persisted on
        rejection (mirrors `listGuests` in `src/guests/store.js`, used the same way in
        `test/guests-store.test.js`).

      Signature:
      ```js
      function createTask(data) {
        const runId = data && data.runId;
        if (!runId) {
          throw new TaskValidationError('validation_error', { runId: 'runId is required.' });
        }
        if (!getRun(runId)) {
          throw new TaskValidationError('validation_error', { runId: 'runId does not correspond to an existing run.' });
        }
        const task = { id: crypto.randomUUID(), runId };
        tasks.set(task.id, task);
        return task;
      }
      ```
    files:
      - src/tasks/store.js
    rationale: |
      Mirrors the two existing store conventions already in the codebase: `runs/store.js` for a
      minimal `Map`-backed entity, and `guests/store.js` for the typed-validation-error pattern
      (`GuestValidationError`) that a route layer catches and maps to a status code. Reusing
      `getRun` from `runs/store.js` (already used the same way by `workflows/store.js`'s
      `startRun`) is the only way to check "does this runId correspond to an existing run"
      without duplicating run lookup logic.
  - description: |
      Create `src/tasks/routes.js`: an Express router exposing `POST /`.

      ```js
      router.post('/', (req, res, next) => {
        try {
          const task = createTask(req.body);
          res.status(201).json(task);
        } catch (err) {
          if (err instanceof TaskValidationError) {
            return res.status(422).json({ error: 'validation_error', fields: err.fields });
          }
          next(err);
        }
      });
      ```
    files:
      - src/tasks/routes.js
    rationale: |
      Matches the `try/catch` + `next(err)` shape used by every other router in this codebase
      (`guests/routes.js`, `hires/routes.js`), so an unexpected store error still falls through
      to the shared 500 handler instead of being swallowed here — this is what keeps
      `test/guests-inline.test.js`'s "unexpected store error returns 500" precedent true for
      tasks too, since the same shared error middleware is reused.
  - description: |
      Mount the new router in `src/server.js` (`app.use('/tasks', tasksRouter)`, alongside the
      other `app.use('/x', xRouter)` lines) and narrowly special-case JSON body-parse failures in
      the existing catch-all error middleware so they return a 4xx instead of falling into the
      unconditional 500 branch:

      ```js
      app.use((err, req, res, next) => {
        if (err.type === 'entity.parse.failed' || (err instanceof SyntaxError && 'body' in err)) {
          return res.status(400).json({ error: 'malformed JSON in request body' });
        }
        res.status(500).json({ error: 'internal server error' });
      });
      ```
    files:
      - src/server.js
    rationale: |
      `express.json()` (already mounted globally in `server.js`) calls `next(err)` with a
      `SyntaxError` carrying `err.type === 'entity.parse.failed'` when the body can't be parsed,
      and that error currently falls straight into the catch-all's unconditional
      `res.status(500)`. This is a shared, app-level file touched by a "just create the tasks
      route" story only because AC5 requires malformed JSON to come back as 4xx, not 500. The
      fix is intentionally narrow (checks the specific body-parser marker, falls through to the
      existing 500 otherwise) so it does not change behavior for the already-covered case in
      `test/guests-inline.test.js` ("an unexpected store error returns 500").
  - description: |
      Create `test/tasks.test.js` covering the store unit behavior and the HTTP endpoint,
      following the same dual-level pattern as `test/runs.test.js` and
      `test/guests-store.test.js` (helper creates a real workflow + run via
      `createWorkflow`/`startRun` to get a valid `runId` to test against, exactly like
      `test/runs.test.js` already does).
    files:
      - test/tasks.test.js
    rationale: |
      Test-first: every test below is written before the corresponding store/route code and
      must fail against the current (nonexistent) `src/tasks/*` before scope items 1-3 are
      implemented.

tests:
  - |
    AC1 (store + HTTP): a valid runId produces a Task with a system-generated id and that runId.
    ```js
    test('AC1: POST /tasks with a valid runId returns 201 with an id and the provided runId', async () => {
      const workflow = createWorkflow({ tasks: [{ id: 't1', next: [] }] });
      const run = startRun(workflow.workflowId);
      const res = await request(app).post('/tasks').send({ runId: run.id });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ runId: run.id });
      expect(res.body.id).toBeTruthy();
    });
    ```
  - |
    AC2: a missing runId returns 422.
    ```js
    test('AC2: POST /tasks with no runId returns 422', async () => {
      const res = await request(app).post('/tasks').send({});
      expect(res.status).toBe(422);
    });
    ```
  - |
    AC3: a runId that does not resolve to any existing run returns 422.
    ```js
    test('AC3: POST /tasks with an unknown runId returns 422', async () => {
      const res = await request(app).post('/tasks').send({ runId: 'does-not-exist' });
      expect(res.status).toBe(422);
    });
    ```
  - |
    AC4: neither of the two rejection paths above persists a Task record.
    ```js
    test('AC4: a rejected POST /tasks (missing or unknown runId) persists nothing', async () => {
      const before = listTasks().length;
      await request(app).post('/tasks').send({});
      await request(app).post('/tasks').send({ runId: 'does-not-exist' });
      expect(listTasks().length).toBe(before);
    });
    ```
  - |
    AC5: a malformed JSON body returns a 4xx with an error message in the body. Note the
    explicit `Content-Type` header — superagent's `.send(string)` defaults to `text/plain`
    unless told otherwise, and the body must be routed through `express.json()` to trigger its
    parse-failure path.
    ```js
    test('AC5: malformed JSON body returns a 4xx with an error message', async () => {
      const res = await request(app)
        .post('/tasks')
        .set('Content-Type', 'application/json')
        .send('{ this is not valid json');
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
      expect(res.body.error).toEqual(expect.any(String));
    });
    ```

assumptions_or_open_questions:
  - |
    The story only specifies `runId` as a required/validated field on Task; the record shape is
    kept to `{ id, runId }` since no other fields are named in the ACs and the parent epic frames
    list/get/update/delete (where a richer shape would presumably show up) as separate stories.
  - |
    This story's ACs explicitly require 422 for validation failures (AC2/AC3), which differs from
    the existing `GuestValidationError` precedent (400). Treated as intentional per-story
    wording rather than a codebase-wide convention to reconcile — `TaskValidationError` uses 422
    only.
  - |
    No role/auth enforcement (e.g. the `x-staff-role` header gate used by `guests/routes.js`) is
    added to `POST /tasks`, since none of the five ACs mention authorization for this endpoint.
  - |
    The `src/server.js` error-middleware change is scoped as narrowly as possible (checks for the
    body-parser's `entity.parse.failed` marker / a `SyntaxError` with a `body` property) so the
    existing "unexpected store error returns 500" behavior asserted in
    `test/guests-inline.test.js` is unaffected.

package_dependencies: []

notes: |
  Verified against current code (this is a first-pass plan, but the referenced files were read
  directly, not assumed): `src/runs/store.js` exports `getRun`/`startRun`; `src/guests/store.js`
  establishes the `XValidationError` (`statusCode` + `fields`) thrown-by-store /
  caught-by-router pattern also used by `hires/routes.js` and `guests/routes.js`; `src/server.js`
  currently ends with an unconditional `res.status(500)` catch-all with no JSON-parse special
  case, and `test/guests-inline.test.js:104-116` locks in that unexpected store errors must stay
  500 — the new error-middleware branch must not break that test.

  ```mermaid
  flowchart TD
    server[server.js]
    tasksRoutes[tasks/routes.js]
    tasksStore[tasks/store.js]
    runsStore[runs/store.js - getRun]
    errMw[server.js error middleware]

    server -->|mounts POST handler| tasksRoutes
    tasksRoutes -->|createTask, TaskValidationError| tasksStore
    tasksStore -->|"getRun(runId) existence check"| runsStore
    server -->|"add entity.parse.failed branch"| errMw

    classDef touched fill:#f96,color:#000
    classDef context fill:#eee,color:#000
    class server,tasksRoutes,tasksStore,errMw touched
    class runsStore context
  ```

review_focus: |
  In scope: only `POST /tasks` (create), a minimal `{ id, runId }` Task record, runId
  presence/existence validation returning 422, and a malformed-JSON body returning 4xx. Out of
  scope: list/get/update/delete Task endpoints, any Task field beyond `id`/`runId`, and any
  auth/role enforcement on the route — none of these are asked for by this story's ACs even
  though the parent epic mentions the fuller CRUD surface. The riskiest part of this change is
  the edit to the shared, app-level error middleware in `src/server.js` for AC5 — it must only
  special-case body-parser JSON-syntax failures and must leave the existing unconditional 500
  fallback (covered by `test/guests-inline.test.js`'s "unexpected store error returns 500" case)
  behaving exactly as before. `TaskValidationError` deliberately returns 422 rather than the 400
  used by the existing `GuestValidationError` precedent — that's intentional per this story's ACs,
  not an inconsistency to flag.
