summary: |
  Add onboarding-completion handling to the existing workflow-run engine
  (`src/runs/store.js` / `src/runs/routes.js`) so that when a run transitions
  to `completed`, an active employee record is automatically created from the
  staff-data payload carried on the completion event. The run gains a
  `status` (`in_progress` -> `completed`) and an `employeeId` field so that
  completion, idempotency, and linkage back to the created employee can all
  be verified. Validation of required staff fields happens inside the store
  layer so a bad/incomplete completion event never produces an API-facing
  error (AC8) -- it only logs and skips employee creation.

scope:
  - description: |
      Extend `startRun` in `src/runs/store.js` to initialize new lifecycle
      fields on every run: `status: 'in_progress'` and `employeeId: null`.
      These are the fields `completeRun` (below) will transition.
    files:
      - src/runs/store.js
    rationale: |
      Today a run is just `{ id, workflowId, definitionVersion, taskGraph }`
      with no notion of lifecycle state. AC1/AC4 require a `completed` state
      to transition into and out of, so the run needs an explicit starting
      state to transition from.

  - description: |
      Add `completeRun(runId, payload)` to `src/runs/store.js`. It looks up
      the run, and:
        1. If the run is missing, returns `undefined` (caller maps to 404).
        2. If `run.employeeId` is already set (a prior successful
           completion), returns the run unchanged -- no second employee is
           created (AC5).
        3. Otherwise validates `payload` against `REQUIRED_STAFF_FIELDS`
           (`['name', 'email', 'department', 'role', 'startDate']`, exported
           from the module). If any are missing, logs
           `console.error('[runs] run <id> completion missing required staff fields: <list>')`
           (AC7), sets `run.status = 'completed'`, and returns the run with
           `employeeId` left `null` -- no employee record is created (AC6)
           and nothing is thrown, so the route layer has nothing to turn
           into an error response (AC8).
        4. If validation passes, calls `createEmployee({ ...payload, employmentStatus: 'active' })`
           from `src/employees/store.js`, sets `run.status = 'completed'`
           and `run.employeeId = employee.id`, and returns the run (AC1,
           AC2, AC3).
      Signature: `function completeRun(runId, payload = {})` returning the
      mutated run object or `undefined`.
    files:
      - src/runs/store.js
    rationale: |
      This is the core of the story: the single place where "a run reaches
      completed" and "an employee record is produced" are connected, with
      the required-fields guard and duplicate guard both enforced before any
      employee is created. Reusing `createEmployee` from the existing
      employees store (`src/employees/store.js:5`) keeps employee creation
      itself unchanged -- this plan only adds a new caller of it.

  - description: |
      Add a `POST /:id/complete` route to `src/runs/routes.js` that accepts
      the completion payload as the request body, calls `completeRun`, and
      responds `200` with the updated run on both the success and
      missing-fields paths (never a 4xx/5xx for a missing-fields payload),
      and `404` only when the run itself does not exist.
    files:
      - src/runs/routes.js
    rationale: |
      Gives AC8 ("no API-facing error response") something concrete to
      assert over HTTP, and mirrors the existing `GET /:id` route's
      not-found handling already in this file.

tests:
  - |
    AC1 + AC2 (unit, `test/runs-completion.test.js`): starting a run and
    completing it with a full staff payload creates a linked, active
    employee.
    ```js
    const created = createWorkflow({ tasks: [{ id: 't1', next: [] }] });
    const run = startRun(created.workflowId);
    const payload = { name: 'Ada Lovelace', email: 'ada@example.com', department: 'Engineering', role: 'Software Engineer', startDate: '2026-01-01' };

    const completed = completeRun(run.id, payload);

    expect(completed.status).toBe('completed');
    expect(completed.employeeId).toBeTruthy();
    const employee = getEmployee(completed.employeeId);
    expect(employee.employmentStatus).toBe('active');
    ```
  - |
    AC3 (unit, `test/runs-completion.test.js`): the created employee's own
    fields equal exactly the payload's fields -- no extra, none missing.
    ```js
    const { id, employmentStatus, ...rest } = employee;
    expect(rest).toEqual(payload);
    ```
  - |
    AC4 (unit, `test/runs-completion.test.js`): a run that is only started,
    never completed, never gets an employee.
    ```js
    const run = startRun(created.workflowId);
    expect(run.status).toBe('in_progress');
    expect(run.employeeId).toBeFalsy();
    ```
  - |
    AC5 (unit, `test/runs-completion.test.js`): a second completion of the
    same run does not create a second employee, even with a different
    payload.
    ```js
    const first = completeRun(run.id, payload);
    const second = completeRun(run.id, { ...payload, name: 'Changed Name' });
    expect(second.employeeId).toBe(first.employeeId);
    expect(getEmployee(first.employeeId).name).toBe('Ada Lovelace');
    ```
  - |
    AC6 (unit, `test/runs-completion.test.js`): a completion payload missing
    a required field (e.g. no `email`) creates no employee.
    ```js
    const incomplete = { name: 'No Email', department: 'Engineering', role: 'Engineer', startDate: '2026-01-01' };
    const result = completeRun(run.id, incomplete);
    expect(result.employeeId).toBeFalsy();
    ```
  - |
    AC7 (unit, `test/runs-completion.test.js`): the same missing-field
    completion logs an error.
    ```js
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    completeRun(run.id, incomplete);
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
    ```
  - |
    AC8 (HTTP, `test/runs-completion.test.js`): hitting the completion
    endpoint with a missing-fields payload still returns a clean 200, not an
    error status.
    ```js
    const res = await request(app).post(`/runs/${runRes.body.id}/complete`).send({ name: 'Incomplete' });
    expect(res.status).toBe(200);
    expect(res.body.error).toBeUndefined();
    ```

assumptions_or_open_questions:
  - |
    The codebase has two different things that could plausibly be "the
    onboarding workflow run" referenced by the acceptance criteria:
    (a) `src/runs/store.js`'s `Run` entity, created via
    `POST /workflows/:id/runs` and keyed off versioned task graphs, and
    (b) the `run` object embedded on a hire in `src/hires/store.js`,
    triggered through `src/onboarding/engineClient.js` and already carrying
    a `status` of `active`/`cancelled`. This plan builds on (a) because it
    is the entity actually named "run" with its own store/routes and ACs
    describe it transitioning through states independent of any other
    domain object; (b) already has hiring-specific status semantics
    (cancel-on-role-change, deactivate/reactivate flows) that a `completed`
    state tied to employee creation would sit awkwardly alongside. If the
    intent was actually (b), this plan needs to be redirected there instead.
  - |
    "Required staff data fields" is not enumerated by the story. This plan
    assumes `['name', 'email', 'department', 'role', 'startDate']`, mirroring
    the fields already used for staff/hire data elsewhere in the codebase
    (e.g. `src/hires/store.js`'s seeded hire and `createHire` payloads).
  - |
    AC3 ("includes exactly the fields present on the payload") is read as:
    the employee's own data fields (excluding the system-assigned `id` and
    the defaulted `employmentStatus`) equal the payload's fields exactly --
    not that `employmentStatus`/`id` are absent from the stored record.
  - |
    On a missing-fields completion, this plan still sets `run.status` to
    `completed` (the completion event was processed; it is the employee
    creation step specifically that was skipped), rather than leaving the
    run `in_progress`. The ACs don't say which is correct; this is the
    interpretation that makes "the completion is processed" literally true
    while AC6 ("no employee record is created") stays satisfied.
  - |
    No existing endpoint delivers "completion events" into this system; this
    plan assumes a new `POST /runs/:id/complete` endpoint is the delivery
    mechanism (analogous to the existing `POST /workflows/:id/runs` pattern
    for starting a run), rather than e.g. a webhook from an external engine.

package_dependencies: []

notes: |
  No new third-party dependencies are needed -- `crypto.randomUUID` (already
  used in `src/runs/store.js:1` and `src/employees/store.js:1`) and
  `console.error` cover everything this plan requires.

  ```mermaid
  flowchart TD
    workflowsRoutes[workflows/routes.js]
    runsStore[runs/store.js]
    runsRoutes[runs/routes.js]
    employeesStore[employees/store.js]
    workflowsStore[workflows/store.js]

    workflowsRoutes -->|startRun existing call| runsStore
    runsRoutes -->|"new: POST /:id/complete -> completeRun"| runsStore
    runsStore -->|"new: createEmployee(...) on valid completion"| employeesStore
    runsStore -->|getLatestVersion existing call| workflowsStore

    classDef touched fill:#f96,color:#000
    class runsStore,runsRoutes,employeesStore touched
  ```

review_focus: |
  In scope: `src/runs/store.js` gains `status`/`employeeId` fields and a
  `completeRun` function; `src/runs/routes.js` gains one new route. Employee
  creation itself (`src/employees/store.js`) is reused unchanged. Out of
  scope: the hires/onboarding-engine domain (`src/hires/store.js`,
  `src/onboarding/engineClient.js`) is untouched -- see the first
  assumption above, which is the single biggest judgment call in this plan
  and worth confirming before merge. The riskiest area is the
  missing-required-fields path (AC6/7/8): it must log via `console.error`
  and return a normal 200, never throw, since the global error handler in
  `src/server.js` would otherwise turn any thrown error into a generic 500
  and violate AC8. The required-field list itself is an assumption, not
  something stated in the story -- flag if a different set of fields was
  intended.
