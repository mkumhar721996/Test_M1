summary: |
  Hires and employees already have a GET /:id endpoint that returns the full stored record, and a
  `hire.auditLog` array already exists and is correctly populated for onboarding workflow-stage
  transitions (via `appendOnboardingAuditEntry` in `src/hires/store.js`, driven by
  `src/runs/store.js`). What's missing is that the other hire lifecycle actions named in the
  acceptance criteria — create, update, deactivate, reactivate — never push anything onto
  `auditLog` today, and `src/employees/store.js` has no `auditLog` field or create-time entry at
  all. This plan closes that gap by having `createHire`/`updateHire`/`deactivateHire`/
  `reactivateHire` and `createEmployee` append a `{ ts, actor, action }` entry for every action
  they perform, threading an `actor` through from the HTTP layer (mirroring the existing
  `src/guests/store.js` / `src/guests/routes.js` convention, which already does exactly this for
  guest profiles and is covered by `test/guests.test.js`'s AC9). Retrieval itself needs no new
  code: `GET /hires/:id` and `GET /employees/:id` already return the full record, including
  `auditLog`, in the order entries were appended — which is chronological by construction since
  entries are only ever pushed, never reordered.

scope:
  - description: |
      Make `createHire`, `updateHire`, `deactivateHire`, and `reactivateHire` in
      `src/hires/store.js` append an audit entry for the action they perform, and accept an
      `actor` parameter to attribute it. `createHire` already initializes `auditLog: []`; change
      it to seed that array with the create entry instead, and strip a stray `actor` key out of
      the spread so it doesn't leak onto the hire record itself (the existing code does
      `{ ...data, id, ... }`, spreading the whole request body):

      ```js
      async function createHire(data, actor) {
        const { actor: _bodyActor, ...hireData } = data;
        const hire = {
          ...hireData,
          id: crypto.randomUUID(),
          profileStatus: 'active',
          run: null,
          runHistory: [],
          onboardingStatus: null,
          auditLog: [{ ts: new Date().toISOString(), actor, action: 'created hire record' }],
        };
        ...
      }
      ```

      `updateHire` needs to compute which patchable fields actually changed (before the existing
      branching mutates them) and push one combined entry only when something changed — mirroring
      `updateGuest` in `src/guests/store.js`:

      ```js
      async function updateHire(id, changes, actor) {
        const hire = hires.get(id);
        if (!hire) return undefined;
        const changedFields = Object.keys(changes).filter((key) => changes[key] !== hire[key]);
        // ...existing offer_accepted / role-or-dept / default branches, unchanged...
        if (changedFields.length > 0) {
          hire.auditLog.push({ ts: new Date().toISOString(), actor, action: `updated ${changedFields.join(', ')}` });
        }
        return hire;
      }
      ```

      `deactivateHire(id, actor)` pushes `{ ts, actor, action: 'deactivated hire record' }` right
      before its final `return hire;`. `reactivateHire(id, actor)` pushes
      `{ ts, actor, action: 'reactivated hire record' }` right before its final `return hire;` —
      but NOT on the existing early-return no-op path (`if (hire.profileStatus !== 'deactivated'
      || ...) return hire;`), since no action actually occurred there.
    files:
      - src/hires/store.js
    rationale: |
      These are exactly the "create, update, deactivate, reactivate" action types AC2/AC3 require
      to be audited for hires. "Workflow-stage transition" entries already exist today via
      `appendOnboardingAuditEntry` (called from `src/runs/store.js`'s `startRun`/`advanceStep`) and
      are already covered by `test/runs-step-progression.test.js`'s AC2 — no change needed there.

  - description: |
      Thread `actor` from the request body through to the store calls in `src/hires/routes.js`,
      mirroring `src/guests/routes.js` (which reads `req.body.actor` directly, with no new
      middleware or role gate):

      ```js
      router.post('/', async (req, res, next) => {
        const hire = await createHire(req.body, req.body.actor);
        ...
      });
      router.patch('/:id', async (req, res, next) => {
        const hire = await updateHire(req.params.id, pickPatchableFields(req.body), req.body.actor);
        ...
      });
      router.post('/:id/deactivate', async (req, res, next) => {
        const hire = await deactivateHire(req.params.id, req.body.actor);
        ...
      });
      router.post('/:id/reactivate', async (req, res, next) => {
        const hire = await reactivateHire(req.params.id, req.body.actor);
        ...
      });
      ```
    files:
      - src/hires/routes.js
    rationale: |
      Without this, the store-level `actor` parameter added above would never be populated by real
      HTTP traffic. `GET /hires/:id` and `GET /hires` need no changes — they already return the
      full stored hire object (including `auditLog`) unmodified.

  - description: |
      Give employees an `auditLog`, populated on create, mirroring the hire/guest pattern. Change
      `createEmployee` in `src/employees/store.js`:

      ```js
      function createEmployee(data, actor) {
        const { actor: _bodyActor, ...employeeData } = data;
        const employee = {
          ...employeeData,
          id: crypto.randomUUID(),
          auditLog: [{ ts: new Date().toISOString(), actor, action: 'created employee record' }],
        };
        employees.set(employee.id, employee);
        return employee;
      }
      ```

      Update `src/employees/routes.js`'s `POST /` handler to pass the actor through:
      `const employee = createEmployee(req.body, req.body.actor);`
    files:
      - src/employees/store.js
      - src/employees/routes.js
    rationale: |
      Employee records currently have no `auditLog` at all, so AC1 and AC4 can't hold for them.
      Only "create" is implemented here — there is no employee "update" action anywhere in the
      codebase today (no PATCH /employees/:id route or store function exists), so that part of
      AC2/AC3's employee clause has nothing to audit yet; see the open question below rather than
      speculatively adding a new update endpoint.

  - description: |
      Attribute the employee record auto-created when an onboarding run completes
      (`completeRun` in `src/runs/store.js`) to a `'System'` actor, consistent with how
      `startRun`/`advanceStep` already attribute hire-side onboarding audit entries to `'System'`
      when there's no human actor in the call path:

      `const employee = createEmployee({ ...payload, employmentStatus: 'active' }, 'System');`
    files:
      - src/runs/store.js
    rationale: |
      `completeRun` is invoked from `POST /runs/:id/complete`, which has no actor/role concept
      today (unlike `/advance` and `/resolve-requirement`, which go through
      `enforceOnboardingRole`). Rather than inventing a new auth requirement on that route, this
      follows the existing `'System'` convention used elsewhere for automated transitions.

  - description: |
      Update the one existing test that destructures a full employee object and asserts exact
      equality against the input payload, since it will now also contain `auditLog`:
      `test/runs-completion.test.js`'s "AC3: the created employee data fields equal exactly the
      payload fields" test must become
      `const { id, employmentStatus, auditLog, ...rest } = employee;` (adding `auditLog` to the
      destructure) so `rest` still equals `fullPayload` exactly.
    files:
      - test/runs-completion.test.js
    rationale: |
      This is a direct, minimal consequence of adding `auditLog` to employee records — without it,
      a previously-passing test breaks for a reason unrelated to its own intent.

tests:
  - |
    New `test/hires-audit-log.test.js`, AC4: a hire with no actions beyond creation has exactly
    one entry.
    ```js
    test('AC4: a hire with no actions beyond creation has exactly one auditLog entry for create', async () => {
      const hire = await createHire({ name: 'A', email: 'a@x.com', phone: '1', startDate: '2026-10-05', department: 'Engineering', role: 'Engineer', hireStage: 'draft' }, 'Morgan Ellis');
      expect(hire.auditLog).toHaveLength(1);
      expect(hire.auditLog[0]).toMatchObject({ actor: 'Morgan Ellis' });
      expect(typeof hire.auditLog[0].action).toBe('string');
    });
    ```
  - |
    New `test/hires-audit-log.test.js`, AC2 + AC3: one entry per create/update/
    deactivate/reactivate/workflow-stage-transition action, each identifying actor and action,
    with none omitted (and no spurious entry on a reactivate no-op):
    ```js
    test('AC2 + AC3: one audit entry per hire action, each with actor and action, none omitted', async () => {
      const hire = await createHire({ name: 'A', email: 'a@x.com', phone: '1', startDate: '2026-10-05', department: 'Engineering', role: 'Engineer', hireStage: 'draft' }, 'Morgan Ellis');
      await updateHire(hire.id, { phone: '2' }, 'Morgan Ellis');
      const wf = createWorkflow({ tasks: [{ id: 't1', name: 'Only step', next: [] }] });
      startRun(wf.workflowId, hire.id);
      await deactivateHire(hire.id, 'Morgan Ellis');
      await reactivateHire(hire.id, 'Morgan Ellis');

      const reloaded = getHire(hire.id);
      expect(reloaded.auditLog).toHaveLength(5);
      reloaded.auditLog.forEach((entry) => {
        expect(typeof entry.actor).toBe('string');
        expect(entry.actor.length).toBeGreaterThan(0);
        expect(typeof entry.action).toBe('string');
        expect(entry.action.length).toBeGreaterThan(0);
      });
    });

    test('reactivating an already-active hire is a no-op and appends no extra entry', async () => {
      const hire = await createHire({ name: 'A', email: 'a@x.com', phone: '1', startDate: '2026-10-05', department: 'Engineering', role: 'Engineer', hireStage: 'draft' }, 'Morgan Ellis');
      const result = await reactivateHire(hire.id, 'Morgan Ellis');
      expect(result.auditLog).toHaveLength(1);
    });
    ```
  - |
    New `test/hires-audit-log.test.js`, AC1: `GET /hires/:id` returns the full `auditLog` in
    chronological order, with the actor from the HTTP body round-tripped and not leaked onto the
    hire record itself:
    ```js
    test('AC1: GET /hires/:id returns the full auditLog in chronological order', async () => {
      const createRes = await request(app).post('/hires').send({ name: 'A', email: 'a@x.com', phone: '1', startDate: '2026-10-05', department: 'Engineering', role: 'Engineer', hireStage: 'draft', actor: 'Morgan Ellis' });
      const { id } = createRes.body;
      await request(app).patch(`/hires/${id}`).send({ phone: '2', actor: 'Morgan Ellis' });
      await request(app).post(`/hires/${id}/deactivate`).send({ actor: 'Morgan Ellis' });
      await request(app).post(`/hires/${id}/reactivate`).send({ actor: 'Morgan Ellis' });

      const res = await request(app).get(`/hires/${id}`);
      expect(res.status).toBe(200);
      expect(res.body.auditLog).toHaveLength(4);
      const timestamps = res.body.auditLog.map((e) => e.ts);
      expect(timestamps).toEqual([...timestamps].sort());
      res.body.auditLog.forEach((entry) => expect(entry.actor).toBe('Morgan Ellis'));
      expect(res.body.actor).toBeUndefined();
    });
    ```
  - |
    New `test/employees-audit-log.test.js`, AC4 + AC2: an employee with no actions beyond
    creation has exactly one entry, identifying actor and action, and the `actor` argument never
    leaks onto the employee record itself:
    ```js
    test('AC4 + AC2: an employee has exactly one create auditLog entry identifying actor and action', () => {
      const employee = createEmployee({ name: 'Ada Lovelace', email: 'ada@example.com', jobTitle: 'Engineer', actor: 'should-not-leak' }, 'Priya Shah');
      expect(employee.auditLog).toHaveLength(1);
      expect(employee.auditLog[0]).toMatchObject({ actor: 'Priya Shah' });
      expect(typeof employee.auditLog[0].action).toBe('string');
      expect(employee.actor).toBeUndefined();
    });
    ```
  - |
    New `test/employees-audit-log.test.js`, AC1: `GET /employees/:id` returns the full
    `auditLog`:
    ```js
    test('AC1: GET /employees/:id returns the full auditLog', async () => {
      const createRes = await request(app).post('/employees').send({ name: 'Ada Lovelace', email: 'ada@example.com', jobTitle: 'Engineer', actor: 'Priya Shah' });
      const getRes = await request(app).get(`/employees/${createRes.body.id}`);
      expect(getRes.status).toBe(200);
      expect(getRes.body.auditLog).toHaveLength(1);
      expect(getRes.body.auditLog[0]).toMatchObject({ actor: 'Priya Shah' });
    });
    ```
  - |
    New `test/employees-audit-log.test.js`, AC3: an employee auto-created via onboarding run
    completion gets exactly one create entry, attributed to `'System'`:
    ```js
    test('AC3: a run-completion-created employee has exactly one create entry attributed to System', () => {
      const wf = createWorkflow({ tasks: [{ id: 't1', next: [] }] });
      const run = startRun(wf.workflowId);
      const completed = completeRun(run.id, { name: 'Ada Lovelace', email: 'ada@example.com', department: 'Engineering', role: 'Software Engineer', startDate: '2026-01-01' });
      const employee = getEmployee(completed.employeeId);
      expect(employee.auditLog).toHaveLength(1);
      expect(employee.auditLog[0]).toMatchObject({ actor: 'System' });
    });
    ```
  - |
    Update existing `test/runs-completion.test.js` "AC3: the created employee data fields equal
    exactly the payload fields" so it still passes now that employees carry an `auditLog`:
    ```js
    const { id, employmentStatus, auditLog, ...rest } = employee;
    expect(rest).toEqual(fullPayload);
    ```

assumptions_or_open_questions:
  - |
    Employees have no "update" action anywhere in the codebase today (no PATCH /employees/:id
    route or store function). AC2/AC3 name "create or update" as the employee action types to
    audit; this plan implements only "create" and treats "update" as not-yet-applicable rather
    than adding a new, speculative employee-update endpoint. If a manager-facing employee update
    capability is expected to land as part of this story, that's a larger addition the reviewer
    should call out explicitly.
  - |
    Neither `GET /hires/:id` nor `GET /employees/:id` currently has any role/manager gate (unlike
    `src/guests/routes.js`'s `enforceFrontDeskRole`). AC1's "WHEN a manager retrieves the record"
    is treated as descriptive of who performs the retrieval, not as a new authorization
    requirement to add — consistent with these two GET endpoints having no role gate today.
  - |
    The seeded fixture hire `hire_2031` in `src/hires/store.js` is inserted directly via
    `hires.set(...)` with `auditLog: []`, bypassing `createHire`, so it won't get a synthetic
    "created hire record" entry under this plan. It immediately gets workflow-stage entries from
    `seedExampleRun()`, so it will never satisfy AC4's "exactly one entry" shape in its seeded
    state — this is pre-existing fixture data, not a real create action, and is left unchanged.
  - |
    "Chronological order by timestamp" is satisfied by construction (entries are only ever
    `.push()`-ed in the order actions occur, never reordered or removed), so no sort step is added
    at read time — the new tests assert this property rather than any new sorting code.

package_dependencies: []

notes: |
  This mirrors `src/guests/store.js` + `src/guests/routes.js` end to end: `actor` is passed as a
  request-body field (`req.body.actor`), threaded as a plain function parameter into the store,
  and pushed as `{ ts, actor, action }` onto `auditLog` only when an action actually occurs. That
  exact pattern is already implemented and tested for guests (`test/guests.test.js`'s AC9); this
  plan brings hires and employees up to the same shape, plus wires the one automated call site
  (`completeRun` in `src/runs/store.js`, with no HTTP actor available) to a `'System'` actor,
  matching the precedent already set by `appendOnboardingAuditEntry(hireId, 'System', ...)` in
  `src/hires/store.js`/`src/runs/store.js`.

  ```mermaid
  flowchart TD
    Server[src/server.js] --> HiresRoutes[src/hires/routes.js]
    Server --> EmployeesRoutes[src/employees/routes.js]
    HiresRoutes --> HiresStore[src/hires/store.js]
    EmployeesRoutes --> EmployeesStore[src/employees/store.js]
    RunsRoutes[src/runs/routes.js] --> RunsStore[src/runs/store.js]
    RunsStore -->|"completeRun: createEmployee(..., 'System')"| EmployeesStore
    RunsStore -->|"startRun/advanceStep: appendOnboardingAuditEntry (unchanged)"| HiresStore
    HiresStore --> EngineClient[src/onboarding/engineClient.js]

    classDef touched fill:#f96,color:#000
    class HiresRoutes,HiresStore,EmployeesRoutes,EmployeesStore,RunsStore touched
  ```

review_focus: |
  In scope: appending `{ ts, actor, action }` audit entries for hire create/update/deactivate/
  reactivate and employee create, threading `actor` from `req.body.actor` through to the store
  layer, and the one-line fix to `test/runs-completion.test.js` that the new `auditLog` field
  forces. Out of scope: any new employee-update capability, any new authorization/role gate on the
  hire or employee GET/retrieval endpoints, and any change to the already-working hire
  workflow-stage-transition audit entries (`appendOnboardingAuditEntry`) — those are left
  untouched and re-verified by existing tests, not re-implemented. The riskiest spot is
  `updateHire`'s `changedFields` diff: it must be computed from the pre-mutation `hire` values
  before any of the three existing branches (offer_accepted trigger / role-or-dept run-restart /
  plain assign) run, or the comparison will always see "no change" since `Object.assign` will
  already have applied the new values. Also worth double-checking: both `createHire` and
  `createEmployee` now destructure `actor` out of the incoming `data` object before spreading the
  rest onto the new record — intentional, to stop the client-supplied `actor` field from leaking
  onto the hire/employee record itself as a stray top-level property.
