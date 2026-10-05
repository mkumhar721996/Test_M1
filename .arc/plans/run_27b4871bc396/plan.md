summary: |
  Introduce the Task entity's read surface as the first slice of the "Task CRUD Core" epic:
  a new `src/tasks/store.js` in-memory store holding Task records (each carrying at minimum
  an `id` and a `runId`), plus `src/tasks/routes.js` exposing `GET /tasks` (optionally filtered
  by `?runId=`) and `GET /tasks/:id`. Creation/update/delete routes are explicitly out of scope
  for this story and are left for later stories in the same epic; the store exposes a minimal
  `createTask` purely so tests (and later stories) can seed/produce Task records without a public
  POST route existing yet. The new router is mounted on the existing Express app at `/tasks`,
  following the same store/routes/mount pattern already used by `employees`, `rooms`, `guests`,
  and `runs`.
scope:
  - description: |
      Create `src/tasks/store.js`: an in-memory `Map`-backed store for Task records, following
      the same shape as `src/employees/store.js` / `src/rooms/store.js`.

      Functions:
      ```js
      function createTask(data = {}) {
        const task = { ...data, id: crypto.randomUUID() };
        tasks.set(task.id, task);
        return task;
      }

      function getTask(id) {
        return tasks.get(id);
      }

      function listTasks({ runId } = {}) {
        const all = Array.from(tasks.values());
        if (!runId) return all;
        return all.filter((task) => task.runId === runId);
      }

      module.exports = { createTask, getTask, listTasks };
      ```
    files:
      - src/tasks/store.js
    rationale: |
      No Task entity exists anywhere in the codebase yet (confirmed via grep — only unrelated
      `taskGraph`/workflow "task" usages exist in `src/runs/store.js` and `src/workflows/*`).
      `createTask` is needed because this story's own tests must be able to populate the store
      with Task records to list/get against, even though POST /tasks is not part of this story's
      acceptance criteria. `listTasks` takes an options object (mirroring the `{ email, phone }`
      destructuring style in `src/guests/store.js`'s `findGuestMatch`) so a later story can extend
      filtering without changing the call signature.
  - description: |
      Create `src/tasks/routes.js`: an Express router exposing the two read endpoints.
      ```js
      router.get('/', (req, res) => {
        res.status(200).json(listTasks({ runId: req.query.runId }));
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
      Matches the thin-router style of `src/employees/routes.js` and the `/:id` 404 handling of
      `src/runs/routes.js` / `src/employees/routes.js` (`res.status(404).json({ error: '<entity>
      not found' })`). No role/permission gate is added because none of the five ACs mention
      authorization, and sibling list/get endpoints (`employees`, `runs`) are also ungated — only
      `rooms`/`guests` gate on `x-staff-role`, and only because their own stories required it.
  - description: |
      Mount the new router on the app: add
      ```js
      const tasksRouter = require('./tasks/routes');
      ...
      app.use('/tasks', tasksRouter);
      ```
      alongside the existing `app.use('/employees', ...)` / `app.use('/rooms', ...)` lines.
    files:
      - src/server.js
    rationale: |
      `src/server.js` is the single place every other entity's router gets wired in; Task routes
      follow the identical pattern.
  - description: |
      Create `test/tasks.test.js` using `supertest` against `../src/server`, seeding Task records
      via `require('../src/tasks/store').createTask(...)` directly (there is no POST route to
      seed through in this story).
    files:
      - test/tasks.test.js
    rationale: |
      Matches the existing `test/employees.test.js` / `test/rooms.test.js` convention of driving
      the real Express app with `supertest` rather than unit-testing the store in isolation.
tests:
  - |
    AC1 — GET /tasks with no query parameters returns all Task records with HTTP 200:
    ```js
    const t1 = tasksStore.createTask({ runId: 'run_aaa', name: 'Step 1' });
    const t2 = tasksStore.createTask({ runId: 'run_bbb', name: 'Step 2' });
    const res = await request(app).get('/tasks');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: t1.id }),
      expect.objectContaining({ id: t2.id }),
    ]));
    ```
    This fails first because `src/tasks/store.js` and `src/tasks/routes.js` do not exist yet
    (GET /tasks currently 404s with no router mounted).
  - |
    AC2 — a valid ?runId= filter returns only matching Task records with HTTP 200:
    ```js
    const runId = `run_${Date.now()}`;
    const match = tasksStore.createTask({ runId, name: 'Matching task' });
    tasksStore.createTask({ runId: 'run_other', name: 'Other task' });
    const res = await request(app).get('/tasks').query({ runId });
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ id: match.id, runId });
    ```
  - |
    AC3 — a ?runId= matching no Tasks returns an empty list with HTTP 200:
    ```js
    const res = await request(app).get('/tasks').query({ runId: 'run_does_not_exist' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
    ```
  - |
    AC4 — GET /tasks/:id with a valid id returns the matching Task record with HTTP 200:
    ```js
    const task = tasksStore.createTask({ runId: 'run_ccc', name: 'Lookup task' });
    const res = await request(app).get(`/tasks/${task.id}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(task);
    ```
  - |
    AC5 — GET /tasks/:id with a nonexistent id returns HTTP 404:
    ```js
    const res = await request(app).get('/tasks/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'task not found' });
    ```
assumptions_or_open_questions:
  - |
    No Task record shape (fields beyond `id`/`runId`) is specified by the story or exists
    elsewhere in the code, so `createTask` is treated as an open bag of fields (`{ ...data, id }`)
    with no required-field validation — validation is assumed to belong to the later "create Task"
    story in this epic, not this one.
  - |
    Assumed no authorization/role gate applies to these two GET endpoints, since neither the
    story nor its ACs mention one and the comparable `employees`/`runs` list/get endpoints are
    also ungated (only `rooms`/`guests` gate reads, per their own stories).
  - |
    Assumed `?runId=` is the only supported filter for this story (per AC2/AC3's literal wording)
    — no filtering by status, name, etc. is added.
  - |
    Assumed Task records should NOT be seeded with example/fixture data at module load (unlike
    `src/guests/store.js`'s `seedFixtureGuest` calls), since no AC requires pre-existing Tasks
    and the epic's create-route story has not landed yet to define realistic fixture fields.
package_dependencies: []
notes: |
  This mirrors the existing `employees` / `rooms` / `guests` / `runs` entities: a `Map`-backed
  store module paired with a thin Express router, mounted once in `src/server.js`. Confirmed via
  grep that no `src/tasks/` directory or Task entity exists today — this story is the first slice
  of the "Task CRUD Core" epic, scoped strictly to the two read endpoints in its ACs.

  ```mermaid
  flowchart TD
    server[src/server.js]
    tasksRoutes[src/tasks/routes.js]
    tasksStore[src/tasks/store.js]
    testFile[test/tasks.test.js]

    server -->|"app.use('/tasks', tasksRouter) — new mount"| tasksRoutes
    tasksRoutes -->|"listTasks(), getTask()"| tasksStore
    testFile -->|"supertest(app).get('/tasks'...)"| server
    testFile -->|"createTask() to seed fixtures"| tasksStore

    classDef touched fill:#f96,color:#000
    class server,tasksRoutes,tasksStore,testFile touched
  ```
review_focus: |
  Scope is strictly GET /tasks and GET /tasks/:id (list + get, with optional ?runId= filtering) —
  no POST/PATCH/DELETE routes, no validation, and no auth gating are in scope, even though the
  parent epic eventually wants full CRUD. The riskiest/most judgment-laden part is `createTask`
  in the store: it's unvalidated and not route-exposed, existing only so this story's own tests
  can seed Task records — a reviewer should not expect it to anticipate the shape the later
  "create Task" story settles on. Also deliberate: no role/permission check on the new GET routes,
  matching `employees`/`runs` (not `rooms`/`guests`, which gate for unrelated reasons specific to
  their own stories).
