summary: |
  When an onboarding run's final step is completed via `advanceStep`, the system
  will automatically create the hire's permanent employee record directly from
  the linked hire profile's own fields (name, email, department, role,
  startDate, and phone if present) — no separate manual completion call and no
  re-entry of data. A hire profile missing a required field (in practice, only
  `email` can be missing, since `name`/`department`/`role`/`startDate` are
  already enforced at hire-creation time) still gets an employee record
  created, with that field flagged incomplete rather than blocking creation;
  `phone` is never required or flagged. The record never carries
  hiring-process fields (`hireStage`, `runHistory`, `auditLog`). The existing
  manual `POST /runs/:id/complete` route, which used to accept an ad-hoc
  payload and build the employee from it, is retired: it now always responds
  with an error indicating the action is no longer available, and the
  `completeRun` store function is removed entirely in favor of automatic
  creation inside `advanceStep`'s existing final-step branch.
scope:
  - description: |
      In `src/runs/store.js`, replace the manual `completeRun(runId, payload)`
      function with automatic employee creation inside `advanceStep`'s
      existing final-step branch (the `if (idx === run.steps.length - 1)`
      block, currently only sets `run.status = 'completed'` and appends audit
      entries).

      Add a helper that builds employee data strictly from the hire's own
      fields (never spreading the whole hire object, so hiring-process fields
      like `hireStage`/`runHistory`/`auditLog` are structurally excluded):

      ```js
      const STAFF_FIELDS = ['name', 'email', 'department', 'role', 'startDate'];

      function buildEmployeeDataFromHire(hire) {
        const data = {};
        const incompleteFields = [];
        STAFF_FIELDS.forEach((field) => {
          data[field] = hire[field] || null;
          if (!hire[field]) incompleteFields.push(field);
        });
        if (hire.phone) data.phone = hire.phone;
        if (incompleteFields.length > 0) data.incompleteFields = incompleteFields;
        return data;
      }
      ```

      In the final-step branch of `advanceStep`, after the existing
      `run.status = 'completed'` / audit-log / `appendOnboardingAuditEntry`
      lines, add (only reachable the first time a given run completes, since
      `advanceStep` already early-returns `if (run.status === 'completed')`
      on every subsequent call, which is what makes AC7/AC8 hold without
      extra dedup code):

      ```js
      if (run.hireId) {
        const hire = getHire(run.hireId);
        if (hire) {
          const employee = createEmployee({ ...buildEmployeeDataFromHire(hire), employmentStatus: 'active' });
          run.employeeId = employee.id;
        }
      }
      ```

      Import `getHire` alongside the already-imported `appendOnboardingAuditEntry`
      from `../hires/store`. Delete the `completeRun` function, the
      `REQUIRED_STAFF_FIELDS` constant/export, and remove both from
      `module.exports`.
    files:
      - src/runs/store.js
    rationale: |
      This is the one place a run already knows it just finished its final
      step, so it is the natural, minimal trigger point (AC1, AC5). Pulling
      only named fields off `hire` (never `{ ...hire }`) is what guarantees
      AC4 without needing an explicit denylist of hiring-process keys.
  - description: |
      In `src/runs/routes.js`, remove the `completeRun` import and replace the
      `POST /:id/complete` handler body so it no longer looks up or mutates
      any run — it unconditionally responds that the action has been retired:

      ```js
      router.post('/:id/complete', (req, res) => {
        res.status(410).json({ error: "This action is no longer available. Employee records are created automatically when a run's final step is completed." });
      });
      ```
    files:
      - src/runs/routes.js
    rationale: |
      AC6 requires the old manual action to error rather than disappear
      (a plain 404 from an unregistered route wouldn't communicate that the
      action was intentionally retired vs. never existed). 410 Gone is the
      standard HTTP status for "this used to exist here and won't come back,"
      which matches "retire" more precisely than a generic 400/404.
  - description: |
      Rewrite `test/runs-completion.test.js` from scratch: it currently drives
      the old `completeRun(runId, payload)` function directly with ad-hoc
      payloads, which no longer exists. Replace it with tests that drive the
      real flow — `startRun` + `advanceStep`, with hires created via
      `createHire` — covering AC1-AC10 of this story (see `tests` below for
      the concrete assertions).
    files:
      - test/runs-completion.test.js
    rationale: |
      Test-first: the new file must fail against current code (because
      `createEmployee` is never called from `advanceStep` yet, and
      `/complete` still works the old way) before the `src/runs/store.js` and
      `src/runs/routes.js` changes make it pass.
tests:
  - |
    AC1 — completing a linked run's only/final step creates an employee with
    no separate action:
    ```js
    const hire = await createHire(fullHireData);
    const run = startRun(oneStepWorkflow().workflowId, hire.id);
    const completed = advanceStep(run.id);
    expect(completed.status).toBe('completed');
    expect(completed.employeeId).toBeTruthy();
    expect(getEmployee(completed.employeeId)).toBeDefined();
    ```
  - |
    AC2 — a fully-populated hire profile (name, email, department, role,
    startDate, phone) produces a matching employee record:
    ```js
    const completed = advanceStep(run.id);
    const employee = getEmployee(completed.employeeId);
    expect(employee).toMatchObject({
      name: fullHireData.name, email: fullHireData.email,
      department: fullHireData.department, role: fullHireData.role,
      startDate: fullHireData.startDate, phone: fullHireData.phone,
    });
    expect(employee.incompleteFields).toBeUndefined();
    ```
  - |
    AC3 — a hire profile missing `email` (the only required employee field
    that a hire can legally lack, since `assertValidHire` already requires
    name/department/role/startDate) still gets an employee created, with
    `email` flagged incomplete:
    ```js
    const hire = await createHire({ ...fullHireData, email: undefined });
    const run = startRun(oneStepWorkflow().workflowId, hire.id);
    const completed = advanceStep(run.id);
    const employee = getEmployee(completed.employeeId);
    expect(employee).toBeDefined();
    expect(employee.incompleteFields).toContain('email');
    ```
  - |
    AC4 — the created employee record excludes hiring-process data:
    ```js
    const employee = getEmployee(completed.employeeId);
    expect(employee.hireStage).toBeUndefined();
    expect(employee.runHistory).toBeUndefined();
    expect(employee.auditLog).toBeUndefined();
    ```
  - |
    AC5 — completing a non-final step of a multi-step run creates no
    employee record:
    ```js
    const run = startRun(twoStepWorkflow().workflowId, hire.id);
    const advanced = advanceStep(run.id);
    expect(advanced.status).toBe('active');
    expect(advanced.employeeId).toBeFalsy();
    ```
  - |
    AC6 — the retired manual `/complete` endpoint now errors instead of
    completing anything:
    ```js
    const res = await request(app).post(`/runs/${run.id}/complete`).send({});
    expect(res.status).toBe(410);
    expect(res.body.error).toMatch(/no longer available/i);
    expect(getRun(run.id).status).not.toBe('completed');
    ```
  - |
    AC7 — re-invoking the final-step completion on an already-completed run
    does not create a second employee record (covered by `advanceStep`'s
    existing `if (run.status === 'completed') return run;` early return):
    ```js
    const first = advanceStep(run.id);
    const employeeCountBefore = listRuns().filter((r) => r.employeeId === first.employeeId).length;
    const second = advanceStep(run.id);
    expect(second.employeeId).toBe(first.employeeId);
    expect(second).toEqual(first);
    expect(employeeCountBefore).toBe(1);
    ```
  - |
    AC8 — the existing employee record is unchanged after that repeat
    completion:
    ```js
    const before = getEmployee(first.employeeId);
    advanceStep(run.id);
    const after = getEmployee(first.employeeId);
    expect(after).toEqual(before);
    ```
  - |
    AC9 — a hire profile missing only `phone` is created without `phone`
    flagged incomplete:
    ```js
    const hire = await createHire({ ...fullHireData, phone: undefined });
    const run = startRun(oneStepWorkflow().workflowId, hire.id);
    const completed = advanceStep(run.id);
    const employee = getEmployee(completed.employeeId);
    expect(employee.incompleteFields || []).not.toContain('phone');
    expect(employee.phone).toBeUndefined();
    ```
  - |
    AC10 — creating an employee record with a field flagged incomplete sends
    no HR notification. The codebase has no notification subsystem at all
    today, so this is verified as "no new side-channel call and no error/warn
    noise," which is the only observable proxy available:
    ```js
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const hire = await createHire({ ...fullHireData, email: undefined });
    const run = startRun(oneStepWorkflow().workflowId, hire.id);
    advanceStep(run.id);
    expect(consoleErrorSpy).not.toHaveBeenCalled();
    expect(consoleWarnSpy).not.toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    ```
assumptions_or_open_questions:
  - |
    Only `email` can realistically be the "missing required field" in AC3,
    because `src/hires/store.js`'s `assertValidHire` already requires
    `name`, `department`, `role`, and `startDate` at hire-creation/update
    time — a hire profile can never be saved without those four. The plan
    treats AC3's scenario as the `email`-missing case specifically; if a
    reviewer intends a different field to be reachably missing, that would
    require loosening `assertValidHire` too, which is out of this story's
    scope (it only covers the completion trigger, not hire-profile
    validation rules).
  - |
    For a run with no `hireId` (an unlinked run, used today only by
    workflow-versioning and step-progression tests), this plan does NOT
    create any employee record on final-step completion, since there is no
    hire profile to source data from. The existing `if (run.hireId)` guard
    already used for `appendOnboardingAuditEntry` is reused for this purpose,
    so pre-existing tests that complete unlinked runs (e.g. in
    `test/runs.test.js`, `test/runs-step-progression.test.js`) are
    unaffected.
  - |
    `incompleteFields` (an array of field names on the created employee
    record) is this plan's chosen representation of "flagged incomplete."
    No existing UI reads the employee record's shape (the directory/profile
    view is explicitly out of this story's scope), so there is no existing
    convention to match; a reviewer who wants a different shape (e.g.
    per-field `{ value, incomplete }` objects) should flag it before
    implementation starts.
  - |
    AC10 cannot be tested against a real notification call because no
    notification subsystem exists anywhere in this codebase (confirmed via
    search for notif/sendEmail/mailer/sendAlert). The test instead asserts
    the absence of the `console.error` the OLD `completeRun` used to emit
    for missing fields, and the absence of any new `console.warn`. This is a
    proxy, not a direct assertion that "no notification was sent."
  - |
    HTTP 410 Gone is used for the retired `/runs/:id/complete` route rather
    than 400/404/501, since no prior deprecation precedent exists elsewhere
    in this codebase. 410 was chosen because it is the standard HTTP
    semantic for "this resource/action existed and is intentionally no
    longer available" as opposed to "never existed" (404) or "malformed
    request" (400).
package_dependencies: []
notes: |
  This mirrors the structure the previous manual-completion story
  (`run_705379ef978e`, TEST-M1-STORY-138) used for `completeRun`, but moves
  the trigger from a separate HTTP action to the existing step-advancement
  path, and switches the data source from an arbitrary request payload to
  the linked hire's own profile fields — directly implementing this story's
  "no separate manual completion action or re-entry of data" requirement.

  ```mermaid
  flowchart TD
    classDef touched fill:#f96,color:#000

    runsRoutes["src/runs/routes.js<br/>POST /:id/complete"]:::touched
    runsStore["src/runs/store.js<br/>advanceStep, buildEmployeeDataFromHire"]:::touched
    hiresStore["src/hires/store.js<br/>getHire"]
    employeesStore["src/employees/store.js<br/>createEmployee"]
    runDetailUI["public/js/run-detail.js<br/>(calls /advance only, never /complete)"]

    runDetailUI -->|"POST /:id/advance — unaffected, already the only caller"| runsRoutes
    runsRoutes -->|"/:id/complete now always 410 (AC6)"| runsRoutes
    runsRoutes -->|"/:id/advance -> advanceStep (unchanged route wiring)"| runsStore
    runsStore -->|"getHire(run.hireId) to source employee fields (AC2/AC3/AC9)"| hiresStore
    runsStore -->|"createEmployee(...) on final-step completion (AC1/AC4/AC5)"| employeesStore
  ```
review_focus: |
  In scope: moving employee creation from the retired manual `/complete`
  payload-driven flow into `advanceStep`'s existing final-step branch,
  sourcing fields only from the linked hire profile, flagging missing
  required fields as incomplete instead of blocking creation, and turning
  `/runs/:id/complete` into an always-410 stub. Out of scope: any
  directory/profile UI, later edits to created employee records, and any
  change to hire-profile validation rules (`assertValidHire` is untouched).
  The riskiest area is the interaction between `advanceStep`'s pre-existing
  `if (run.status === 'completed') return run;` early return and AC7/AC8 —
  this plan relies on that existing guard for duplicate-completion safety
  rather than adding a second, redundant `employeeId` check inside the
  final-step branch, so a reviewer should confirm that reliance is sound
  rather than expect an additional explicit guard. Also note AC10 has no
  real notification system to assert against in this codebase today, so its
  test is a best-effort proxy (absence of console noise), not a direct
  negative assertion — flag if a stronger test is wanted before this is
  considered fully verified.
