summary: |
  Introduce the Task entity's in-memory store and the two read-only REST endpoints this story
  covers: `GET /tasks` (optionally filtered by `?runId=`) and `GET /tasks/:id`. Nothing in the
  codebase currently references Tasks, so this plan creates the `src/tasks/` module from scratch,
  mirroring the existing `src/runs/` and `src/employees/` modules (plain `Map`-backed store,
  `crypto.randomUUID()` ids, a thin Express router, mounted in `src/server.js`). Task creation,
  update, and delete are explicitly out of scope per the parent epic's story split — this plan
  only adds a `createTask` store function as a test-seeding helper (not wired to any HTTP route),
  the same way `test/runs.test.js` seeds via `startRun`/`createWorkflow` directly rather than
  through an HTTP POST.
scope:
  - description: |
      Create the Task store: an in-memory `Map` keyed by id, with `createTask(data)` (seeding
      helper only — no POST route in this story), `getTask(id)`, and `listTasks(filter)` where
      `filter.runId`, if present, restricts results to tasks whose `runId` strictly equals it.

      ```js
      function listTasks(filter = {}) {
        const all = Array.from(tasks.values());
        if (!filter.runId) return all;
        return all.filter((task) => task.runId === filter.runId);
      }
      ```
    files:
      - src/tasks/store.js
    rationale: |
      Mirrors src/runs/store.js and src/employees/store.js exactly (same crypto.randomUUID id
      pattern, same plain-object spread on create, no class hierarchy needed since there's no
      validation logic required by this story's ACs).
  - description: |
      Create the Task router with exactly two routes, both read-only:

      ```js
      router.get('/', (req, res) => {
        const { runId } = req.query;
        res.status(200).json(listTasks({ runId }));
      });

      router.get('/:id', (req, res) => {
        const task = getTask(req.params.id);
        if (!task) {
          return res.status(404).json({ error: 'task not found' });
        }
        res.status(200).json(task);
      });
      ```
    files:
      - src/tasks/routes.js
    rationale: |
      Matches the shape and error-body convention of src/runs/routes.js (`{ error: '<entity>
      not found' }` on 404) and src/rooms/routes.js's `GET /` handler. No auth/role gate is
      applied because no AC or existing Task-adjacent route mentions one (unlike rooms/guests,
      which have explicit role-enforcement stories).
  - description: |
      Mount the new router: add `const tasksRouter = require('./tasks/routes');` alongside the
      other router requires, and `app.use('/tasks', tasksRouter);` alongside the other
      `app.use('/<entity>', ...)` lines, before the error-handling middleware at the bottom of
      the file.
    files:
      - src/server.js
    rationale: |
      Every existing entity router (employees, workflows, runs, hires, guests, rooms) is wired
      up the same way in src/server.js; Tasks must follow the same convention to be reachable.
  - description: |
      Add the test-first suite covering all 5 ACs, following the request(app) + direct-store-seed
      style used in test/runs.test.js and test/employees.test.js. Each test uses a unique runId
      per test case (no store reset between tests, matching how test/rooms.test.js avoids
      cross-test collisions by using unique room numbers).
    files:
      - test/tasks.test.js
    rationale: |
      Test-first: these tests must exist and fail against an empty src/tasks/ module before the
      store/routes/mount scope items above are written.
tests:
  - |
    AC1 — GET /tasks with no query params returns all Task records with 200:
    ```js
    test('AC1: GET /tasks with no query params returns all Task records with 200', async () => {
      createTask({ runId: 'run-ac1-a', name: 'Send welcome email' });
      createTask({ runId: 'run-ac1-b', name: 'Charge deposit' });
      const res = await request(app).get('/tasks');
      expect(res.status).toBe(200);
      expect(res.body).toEqual(expect.arrayContaining([
        expect.objectContaining({ runId: 'run-ac1-a' }),
        expect.objectContaining({ runId: 'run-ac1-b' }),
      ]));
    });
    ```
  - |
    AC2 — GET /tasks?runId= returns only matching Task records with 200:
    ```js
    test('AC2: GET /tasks?runId= filters to only matching Task records with 200', async () => {
      const match = createTask({ runId: 'run-ac2-match', name: 'Book room' });
      createTask({ runId: 'run-ac2-other', name: 'Unrelated task' });
      const res = await request(app).get('/tasks').query({ runId: 'run-ac2-match' });
      expect(res.status).toBe(200);
      expect(res.body).toEqual([expect.objectContaining({ id: match.id, runId: 'run-ac2-match' })]);
    });
    ```
  - |
    AC3 — GET /tasks?runId= with no matches returns an empty list with 200:
    ```js
    test('AC3: GET /tasks?runId= with no matches returns an empty list with 200', async () => {
      const res = await request(app).get('/tasks').query({ runId: 'run-does-not-exist' });
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
    ```
  - |
    AC4 — GET /tasks/:id returns the matching Task record with 200:
    ```js
    test('AC4: GET /tasks/:id returns the matching Task record with 200', async () => {
      const task = createTask({ runId: 'run-ac4', name: 'Verify identity' });
      const res = await request(app).get(`/tasks/${task.id}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual(task);
    });
    ```
  - |
    AC5 — GET /tasks/:id with a non-existent id returns 404:
    ```js
    test('AC5: GET /tasks/:id with a non-existent id returns 404', async () => {
      const res = await request(app).get('/tasks/00000000-0000-0000-0000-000000000000');
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('task not found');
    });
    ```
assumptions_or_open_questions:
  - |
    Task creation/update/delete are out of scope for this story (per the epic's explicit
    create/list/get/update/delete split across stories). `createTask` is added to the store as
    a plain seeding helper for tests only, with no HTTP route — mirroring how test/runs.test.js
    seeds runs via `startRun`/`createWorkflow` called directly rather than through an HTTP POST.
    If a POST /tasks story lands first in implementation order, this plan's `createTask` should
    be reconciled with (not duplicated against) that one.
  - |
    Task's field shape beyond `id` and `runId` is not specified by any AC, so the store treats
    the rest of the object passed to `createTask` as an opaque payload (spread onto the record),
    exactly like `src/employees/store.js`'s `createEmployee`. No field validation is added since
    no AC requires it.
  - |
    `?runId=` filtering is a strict string-equality match against the stored `runId` and does
    not verify the run actually exists (no existing route in the codebase cross-validates a
    filter param against another entity's store, e.g. rooms/guests filters behave the same way),
    so an unknown `runId` yields an empty list (AC3) rather than a 404.
  - |
    No role/permission gate is applied to either route, since neither the ACs nor any existing
    Task-related code establishes one (unlike rooms/guests, which had dedicated role-enforcement
    stories layered on afterward).
package_dependencies: []
notes: |
  This mirrors `src/runs/store.js` + `src/runs/routes.js` almost exactly (single-field filter
  aside), which is the closest existing precedent for a small, dependency-free, run-scoped
  entity. No new npm packages are needed — `express`, `jest`, and `supertest` are already in
  `package.json` and used identically by every other entity test file in `test/`.

  ```mermaid
  flowchart TD
    server[src/server.js]
    routes[src/tasks/routes.js]
    store[src/tasks/store.js]
    tests[test/tasks.test.js]

    server -->|mounts /tasks router| routes
    routes -->|listTasks / getTask| store
    tests -->|request app: GET /tasks, GET /tasks/:id| server
    tests -->|seeds records via createTask| store

    classDef touched fill:#f96,color:#000
    class server,routes,store,tests touched
  ```
review_focus: |
  In scope: `GET /tasks` (with optional `?runId=` filter) and `GET /tasks/:id` only, plus the
  minimal store needed to back them. `createTask` exists solely as a test-seeding helper — it is
  intentionally NOT exposed via any HTTP route in this change; do not flag its absence from
  `src/tasks/routes.js` as a gap. Riskiest area: the `runId` filter semantics (strict equality,
  no existence validation, empty list rather than an error for an unmatched filter) — confirm
  this matches AC2/AC3 exactly rather than treating an unknown `runId` as a 404. No auth/role
  check is applied to either route, matching the absence of any such requirement in this story's
  ACs.
