summary: |
  Introduce the minimal Task entity/store needed to support a last-write-wins update
  endpoint, and expose PUT /tasks/:id. No Task entity, store, or routes exist anywhere in
  the codebase yet (confirmed via search) — this is the first story landed from the
  "Task CRUD Core" epic. Because AC1/AC3/AC6 all require an existing Task record to update
  against, the store needs a small seeding primitive (`seedTask`) to let tests set up
  fixtures directly, mirroring the existing `seedFixtureGuest` pattern in
  src/guests/store.js. Only PUT is in scope: no POST/GET/LIST/DELETE routes are added here
  — those belong to sibling stories in the same epic and are intentionally left for them to
  define (including any real creation validation). The update semantics are deliberately
  permissive: any field in the request body (except `id`/`createdAt`) is merged onto the
  Task, `status` is accepted as any value with no transition checks, and no version/etag
  concept is introduced at all, matching the story's explicit last-write-wins, no-optimistic-
  concurrency requirement.
scope:
  - description: |
      Create the Task store module with an in-memory Map, a `seedTask` helper for test
      fixtures (not routed — analogous to `seedFixtureGuest` in src/guests/store.js), a
      `getTask` lookup, and an `updateTask` merge function implementing last-write-wins with
      no field allowlist and no transition-rule checks on `status`.

      Signature:
      ```js
      function updateTask(id, changes) {
        const task = tasks.get(id);
        if (!task) return undefined;
        const { id: _ignoredId, createdAt: _ignoredCreatedAt, ...rest } = changes;
        Object.assign(task, rest);
        task.updatedAt = new Date().toISOString();
        return task;
      }
      ```
    files:
      - src/tasks/store.js
    rationale: |
      No Task entity exists in the codebase today (`grep -r "Task" src/` and `test/` found
      nothing). Update needs something to update, so this story must scaffold the minimal
      shape (id, name, status, createdAt, updatedAt) rather than invent unrelated CRUD. `id`
      and `createdAt` are excluded from merge to protect record identity/history; every other
      field — including `status` — passes through untouched, satisfying AC1 and AC3 without
      any business-rule validation, per the story's explicit "no transition-rule enforcement"
      requirement.
  - description: |
      Add a Task router exposing only `PUT /:id`. Validate that the request body is a plain
      JSON object (not an array, primitive, or null) before merging; return 400 with a
      descriptive error otherwise. Return 404 when the task id doesn't exist. Never read or
      write any version/etag field.

      Route body:
      ```js
      router.put('/:id', (req, res, next) => {
        try {
          assertValidBody(req.body);
          const task = updateTask(req.params.id, req.body);
          if (!task) {
            return res.status(404).json({ error: 'task not found' });
          }
          res.status(200).json(task);
        } catch (err) {
          if (err instanceof TaskValidationError) {
            return res.status(400).json({ error: 'validation_error', message: err.message });
          }
          next(err);
        }
      });
      ```
    files:
      - src/tasks/routes.js
    rationale: |
      Mirrors the try/catch + custom-error-class pattern already used in
      src/rooms/routes.js and src/guests/store.js (`RoomValidationError`,
      `GuestValidationError`) so a malformed body (AC4) short-circuits to 400 before ever
      touching the store, while unexpected errors still fall through to the app's generic
      500 handler via `next(err)`. No `x-staff-role` permission gate is added — unlike
      rooms/guests, nothing in these ACs or the epic description calls for role enforcement
      on Task routes, and sibling modules (runs, workflows, hires) are also unguarded, so
      guarding here would be scope creep.
  - description: |
      Wire the new router into the app at `/tasks`.
    files:
      - src/server.js
    rationale: |
      Every other resource router (rooms, guests, hires, runs, workflows) is mounted in
      src/server.js the same way; Task routes need the same wiring to be reachable over
      HTTP for the supertest-based tests.
  - description: |
      Add the test-first HTTP-level test suite for the PUT endpoint, seeding fixtures via
      `tasksStore.seedTask` (never via a route, since none exists yet for creation).
    files:
      - test/tasks.test.js
    rationale: |
      Matches the existing convention (test/rooms.test.js, test/hires.test.js) of one test
      file per resource, driving the router through supertest against the real `src/server`
      app, with direct store imports used only to seed fixtures and assert persisted state.
tests:
  - |
    AC1 — PUT /tasks/:id with a valid body updates the record and returns 200 with the
    updated Task:
    ```js
    test('AC1: PUT /tasks/:id updates the task and returns 200 with the updated Task', async () => {
      const task = tasksStore.seedTask({ name: 'Provision laptop', status: 'pending' });
      const res = await request(app)
        .put(`/tasks/${task.id}`)
        .send({ name: 'Provision laptop - updated', status: 'in_progress' });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ id: task.id, name: 'Provision laptop - updated', status: 'in_progress' });
    });
    ```
  - |
    AC2 — PUT /tasks/:id for a nonexistent id returns 404 and performs no update:
    ```js
    test('AC2: PUT /tasks/:id returns 404 and does not update when the task does not exist', async () => {
      const res = await request(app).put('/tasks/does-not-exist').send({ name: 'x', status: 'done' });
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('task not found');
      expect(tasksStore.getTask('does-not-exist')).toBeUndefined();
    });
    ```
  - |
    AC3 — an arbitrary/backwards status transition is accepted with no rule enforcement:
    ```js
    test('AC3: PUT /tasks/:id accepts any status value without enforcing transition rules', async () => {
      const task = tasksStore.seedTask({ name: 'Send welcome email', status: 'done' });
      const res = await request(app).put(`/tasks/${task.id}`).send({ status: 'pending' });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('pending');
      expect(tasksStore.getTask(task.id).status).toBe('pending');
    });
    ```
  - |
    AC4 — a malformed request body (a JSON value that isn't an object) returns 400 with a
    descriptive error:
    ```js
    test('AC4: PUT /tasks/:id returns 400 with a descriptive error for a malformed request body', async () => {
      const task = tasksStore.seedTask({ name: 'Order badge', status: 'pending' });
      const res = await request(app)
        .put(`/tasks/${task.id}`)
        .set('Content-Type', 'application/json')
        .send('"just-a-string"');
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('validation_error');
      expect(typeof res.body.message).toBe('string');
      expect(res.body.message.length).toBeGreaterThan(0);
    });
    ```
  - |
    AC5 — no version/etag is required or returned:
    ```js
    test('AC5: PUT /tasks/:id succeeds without a version/etag field and does not return one', async () => {
      const task = tasksStore.seedTask({ name: 'Set up desk', status: 'pending' });
      const res = await request(app).put(`/tasks/${task.id}`).send({ status: 'in_progress' });
      expect(res.status).toBe(200);
      expect(res.body.version).toBeUndefined();
      expect(res.body.etag).toBeUndefined();
    });
    ```
  - |
    AC6 — two sequential updates to the same Task leave the later values in place with no
    conflict error:
    ```js
    test('AC6: two sequential PUT /tasks/:id requests result in the later values with no conflict error', async () => {
      const task = tasksStore.seedTask({ name: 'Grant system access', status: 'pending' });
      const first = await request(app).put(`/tasks/${task.id}`).send({ status: 'in_progress' });
      const second = await request(app).put(`/tasks/${task.id}`).send({ status: 'done' });
      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expect(tasksStore.getTask(task.id).status).toBe('done');
    });
    ```
assumptions_or_open_questions:
  - |
    No prior story in this codebase has created the Task entity, store, or any route yet
    (confirmed by grepping src/ and test/ for "Task" — no hits outside unrelated
    workflow-graph "taskGraph" fields in src/runs and src/workflows). This plan therefore
    scaffolds the minimal Task shape (id, name, status, createdAt, updatedAt) needed to
    exercise update semantics, but does NOT implement create/list/get/delete — those are
    assumed to be separate stories in the "Task CRUD Core" epic and are left for them to
    define, including the real validation rules for creating a Task.
  - |
    `seedTask` is a test-fixture-only seam (mirrors `seedFixtureGuest` in
    src/guests/store.js) and is not routed. A later "Create Task" story may introduce its
    own `createTask` with its own validation; this plan does not assume or constrain what
    that validation will look like.
  - |
    "Malformed request body" (AC4) is interpreted as the parsed JSON body not being a plain
    object (e.g. a string, number, array, or null) — the simplest structural check that
    doesn't require guessing at required Task fields no story has defined yet. It does not
    attempt to type-check individual fields like `status`, since AC3 explicitly says any
    status value must be accepted.
  - |
    No `x-staff-role` permission gate is added to the Task routes, since neither the ACs nor
    the epic description mention role enforcement for Task routes, and sibling modules
    (runs, workflows, hires) follow the same unguarded pattern.
  - |
    `updatedAt` is set on every successful update as a natural extension of the existing
    store conventions (guests, rooms) even though no AC requires it; it is not exposed as
    a concurrency-control mechanism (no AC references it, and AC5/AC6 confirm no such
    mechanism should exist).
package_dependencies: []
notes: |
  Verified via `Grep` across `src/` and `test/` that no file currently references a Task
  entity, store, or route — the only "Task" hits in the repo are the unrelated
  `taskGraph`/workflow-graph concept in `src/runs/store.js` and `src/workflows/store.js`,
  which is a different concept (a workflow's DAG of step definitions) from the per-run Task
  execution-tracking entity this epic introduces. This plan follows the closest existing
  precedent for a small, single-router resource: `src/rooms/store.js` +
  `src/rooms/routes.js` for the validation-error/try-catch shape, and
  `src/guests/store.js`'s `seedFixtureGuest` for how to seed fixtures for a resource whose
  full creation flow isn't part of the current story.

  ```mermaid
  flowchart TD
    server[src/server.js]
    tasksRoutes[src/tasks/routes.js]
    tasksStore[src/tasks/store.js]
    tasksTest[test/tasks.test.js]
    roomsRoutes[src/rooms/routes.js untouched reference pattern]
    guestsStore[src/guests/store.js untouched reference pattern]

    server -->|mounts new router at /tasks| tasksRoutes
    tasksRoutes -->|calls getTask/updateTask| tasksStore
    tasksTest -->|drives HTTP via supertest against server| server
    tasksTest -->|seeds fixtures + asserts persisted state| tasksStore
    roomsRoutes -.mirrors validation-error try/catch shape.-> tasksRoutes
    guestsStore -.mirrors seedFixtureGuest pattern.-> tasksStore

    classDef touched fill:#f96,color:#000
    class server,tasksRoutes,tasksStore,tasksTest touched
  ```
review_focus: |
  In scope: only `PUT /tasks/:id` plus the minimal store scaffolding (seed/get/update)
  needed to exercise it — no create/list/delete routes or business validation for those
  are included, and that's deliberate, not an oversight. The riskiest area is the "malformed
  body" check in `assertValidBody`: it only rejects non-object JSON payloads (string/array/
  null), it does not validate individual field types/values, since AC3 requires arbitrary
  `status` values to be accepted with zero transition-rule enforcement. Also deliberate: no
  version/etag field anywhere (AC5), no permission/role gate on the route (unlike
  rooms/guests, nothing in this story's ACs calls for one), and `id`/`createdAt` are the only
  fields excluded from the update merge — every other body field, including ones not part of
  today's minimal Task shape, passes straight through.
