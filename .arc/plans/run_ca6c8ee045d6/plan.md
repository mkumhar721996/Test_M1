summary: |
  Add manual HR/Manager-only deactivate/reactivate actions for an Employee record (the record
  `src/runs/store.js`'s `completeRun` already creates via `createEmployee` when onboarding
  finishes), plus the two screens the approved prototype shows for it: an "Employee directory"
  list and an "Employee profile" detail page. The backend reuses the existing
  `enforceOnboardingRole` middleware (`src/runs/auth.js`) — already scoped to exactly
  `hr`/`manager` — the same way `src/hires/routes.js` already gates its own
  `deactivate`/`reactivate` routes, so no new authorization code is written. Viewing an employee
  (`GET /employees/:id`, already in the codebase) stays ungated so a deactivated record remains
  fully visible (AC6). The two new pages mirror the already-shipped `hire-profiles.html` /
  `hire-profile.html` pair: a role-switcher drives which `x-staff-role` header the page sends,
  and `employee.html?employeeId=<id>` is deep-linkable exactly like `run-detail.html?runId=<id>`.

scope:
  - description: |
      Add `listEmployees()`, `deactivateEmployee(id, actor)`, and `reactivateEmployee(id, actor)`
      to the employees store, mirroring the existing `deactivateRoom`/`reactivateRoom` pair in
      `src/rooms/store.js`. Each setter writes `employmentStatus` and appends a `{ status, actor,
      at }` entry to a lazily-created `employee.history` array:
      ```js
      function deactivateEmployee(id, actor) {
        const employee = employees.get(id);
        if (!employee) return undefined;
        employee.employmentStatus = 'deactivated';
        employee.history = employee.history || [];
        employee.history.push({ status: 'deactivated', actor, at: new Date().toISOString() });
        return employee;
      }
      ```
      `reactivateEmployee` is the mirror image, setting `employmentStatus = 'active'`. `history`
      is only created the first time either function runs, so it never appears on a freshly
      created employee — `test/runs-completion.test.js`'s `expect(rest).toEqual(fullPayload)`
      (which destructures only `id`/`employmentStatus` off the created record) keeps passing
      untouched.
    files:
      - src/employees/store.js
    rationale: |
      This is the exact pattern already proven for rooms (`deactivateRoom`/`reactivateRoom`) and
      for hires (`deactivateHire`/`reactivateHire`), so the store stays consistent with the rest
      of the codebase rather than inventing a new convention.

  - description: |
      Add `GET /` (ungated — list, backs the directory screen), `POST /:id/deactivate`, and
      `POST /:id/reactivate` to the employees router, gated with the already-existing
      `enforceOnboardingRole` from `src/runs/auth.js` — the same middleware
      `src/hires/routes.js` already uses for its own deactivate/reactivate routes:
      ```js
      const { enforceOnboardingRole } = require('../runs/auth');
      router.post('/:id/deactivate', enforceOnboardingRole, (req, res) => {
        const employee = deactivateEmployee(req.params.id, req.actor);
        if (!employee) return res.status(404).json({ error: 'employee not found' });
        res.status(200).json(employee);
      });
      ```
      `req.actor` is set by `enforceOnboardingRole` to `'HR'` or `'Manager'` from the
      `x-staff-role` header, so it becomes the `history` entry's `actor` with no extra code.
      `GET /:id` (already present) and the new `GET /` are left completely ungated, since
      viewing is never role-restricted (AC6) — only the two mutating routes are gated.
    files:
      - src/employees/routes.js
    rationale: |
      Reusing `enforceOnboardingRole` means a bare `x-staff-role` header missing entirely is a
      401, any role string other than `hr`/`manager` (including `employee`, matching the design's
      role-switcher) is a 403, and `hr`/`manager` both succeed — this is exactly AC1–AC4's
      required behavior with zero new auth logic to get wrong.

  - description: |
      Backend tests for AC1, AC2, AC3, AC4, AC5, AC6 covering the store and the new routes.
    files:
      - test/employees-status.test.js
    rationale: |
      A dedicated file (rather than appending to `test/employees.test.js`) matches the existing
      convention of splitting role-enforcement tests into their own file, e.g.
      `test/hires-role-enforcement.test.js` and `test/rooms-role-enforcement.test.js`.

  - description: |
      "Employee directory" page: built from the prototype's first screen (`.page-header` "Employee
      directory" / "Deactivate an employee when they leave..."; `.role-switcher` "Signed in as"
      select with `hr`/`manager`/`employee` options; a hidden `.role-banner` shown only for the
      `employee` role; a `.filter-bar` with the `status-filter` (All/Active only/Deactivated
      only) select; a `.card.table-card` > `table.directory-table` with Name / Department-Role /
      Start date / Status / Actions columns, where Name renders as a `.person-name-link` button
      plus an `.person-id` line and Actions renders a `.action-link.btn-sm` toggling
      "Deactivate"/"Reactivate" by current status; a `.status-chip`/`.status-chip--active`/
      `.status-chip--deactivated` icon+label chip, never color alone; the deactivate/reactivate
      confirm `.modal-panel` with a `.consequence-box` naming the exact consequence; and the
      bottom `.no-controls-note` explaining what's out of scope). `initEmployeesListApp` mirrors
      `public/js/hire-profiles.js`'s structure (`escapeHtml`/`formatDateDisplay` local helpers,
      a `$`-shorthand `doc.getElementById` lookup table, `renderList`, event delegation on the
      tbody). Clicking a person's name link navigates to `employee.html?employeeId=<id>`,
      mirroring `public/js/runs.js`'s `window.location.href =
      'run-detail.html?runId=' + encodeURIComponent(id)` pattern.
    files:
      - public/employees.html
      - public/css/employees.css
      - public/js/employees.js
    rationale: |
      Builds the approved, already-designed "Employee Directory" screen using the same
      component/CSS classes it defines (ported from the prototype's third `<style>` block —
      `role-banner`, `filter-bar`, `directory-table`, `status-chip`, `action-link`,
      `no-controls-note`, etc. — since the generic `.btn`/`.card`/`.modal-*`/`.toast`/
      `.app-topbar`/`.page` classes already live in `design-system/prototype-utils.css` and don't
      need to be redefined).

  - description: |
      "Employee profile" page: built from the prototype's second screen (`.back-link` "← Back to
      directory"; `.profile-header` with `<h1>` name, `.sub` role/department line, a status chip,
      and a single `#profile-lifecycle-btn` toggling Deactivate/Reactivate; a hidden
      `.role-banner` for the `employee` role; a details `.card` with a `.kv-list`/`.kv-row` for
      Employee ID / Email / Department / Role / Start date; and a "Status history" `.card` with a
      `.history-list`/`.history-item`/`.history-dot` timeline). Deep-linkable via
      `employee.html?employeeId=<id>`, read with `new URLSearchParams(location.search)` exactly
      like `public/js/run-detail.js` reads `?runId=`; an unknown/missing id renders a not-found
      empty state (new `#profile-empty-state` card) instead of throwing, mirroring
      `run-detail.js`'s exported `showRunNotFound`.
    files:
      - public/employee.html
      - public/css/employee.css
      - public/js/employee.js
    rationale: |
      Builds the approved "Employee Profile" screen, and gives AC6 ("navigates directly to that
      employee's record") a real, working deep link the same way `run-detail.html?runId=` already
      works for runs, rather than only being reachable by clicking through the directory.

  - description: |
      Frontend (jsdom) tests for both new pages: directory rendering/filtering/role-banner/
      rejection-toast behavior, and profile rendering/deep-link-not-found/immediate status update.
    files:
      - test/employees-list-ui.test.js
      - test/employee-profile-ui.test.js
    rationale: |
      Matches the existing jsdom UI test convention (`test/hire-profile.test.js`,
      `test/runs-list-ui.test.js`, `test/rooms-ui.test.js`) of testing the exported
      `init*App(doc, data, api)` function directly against the real page HTML via
      `document.documentElement.innerHTML = fs.readFileSync(...)`.

tests:
  - |
    AC1 (`test/employees-status.test.js`): `test.each(['hr', 'manager'])` — deactivating an
    active employee as HR or Manager succeeds and persists:
    ```js
    const res = await request(app).post(`/employees/${employee.id}/deactivate`).set('x-staff-role', role).send({});
    expect(res.status).toBe(200);
    expect(res.body.employmentStatus).toBe('deactivated');
    expect(getEmployee(employee.id).employmentStatus).toBe('deactivated');
    ```
  - |
    AC2 (`test/employees-status.test.js`): `test.each(['hr', 'manager'])` — reactivating a
    deactivated employee as HR or Manager succeeds and persists:
    ```js
    const res = await request(app).post(`/employees/${employee.id}/reactivate`).set('x-staff-role', role).send({});
    expect(res.status).toBe(200);
    expect(res.body.employmentStatus).toBe('active');
    expect(getEmployee(employee.id).employmentStatus).toBe('active');
    ```
  - |
    AC3 (`test/employees-status.test.js`): `test.each(['deactivate', 'reactivate'])` — a role
    other than HR/Manager is rejected, and a missing header is rejected too:
    ```js
    const res = await request(app).post(`/employees/${employee.id}/${action}`).set('x-staff-role', 'employee').send({});
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'forbidden' });

    const noHeaderRes = await request(app).post(`/employees/${employee.id}/${action}`).send({});
    expect(noHeaderRes.status).toBe(401);
    ```
  - |
    AC4 (`test/employees-status.test.js`): after each AC3 rejection above, the employee's status
    is provably unchanged:
    ```js
    expect(getEmployee(employee.id).employmentStatus).toBe(originalStatus);
    ```
  - |
    AC5 (`test/employees-status.test.js`): no other route can write `employmentStatus` directly —
    there is no generic update route, only the two dedicated lifecycle actions:
    ```js
    const res = await request(app).patch(`/employees/${employee.id}`).set('x-staff-role', 'hr').send({ employmentStatus: 'deactivated' });
    expect(res.status).toBe(404);
    expect(getEmployee(employee.id).employmentStatus).toBe('active');
    ```
  - |
    AC6 (`test/employees-status.test.js`): a deactivated employee's record is still fully
    viewable with no role header at all:
    ```js
    await deactivateEmployee(employee.id, 'HR');
    const res = await request(app).get(`/employees/${employee.id}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: 'Marcus Chen', email: employee.email, employmentStatus: 'deactivated' });
    ```
  - |
    AC6 (`test/employee-profile-ui.test.js`): `employee.html?employeeId=<unknown>` shows a
    not-found state instead of throwing:
    ```js
    const { showEmployeeNotFound } = require('../public/js/employee');
    showEmployeeNotFound(document);
    expect(document.getElementById('profile-empty-state').hidden).toBe(false);
    expect(document.getElementById('profile-fieldset').hidden).toBe(true);
    ```
  - |
    AC7 (`test/employee-profile-ui.test.js`): confirming a status change on the profile page
    updates the chip immediately, with no reload:
    ```js
    let resolveDeactivate;
    const api = { deactivate: () => new Promise((resolve) => { resolveDeactivate = resolve; }) };
    initEmployeeProfileApp(document, fixtureEmployee(), api);
    document.getElementById('profile-lifecycle-btn').click();
    document.getElementById('confirm-action-btn').click();
    resolveDeactivate({ ...fixtureEmployee(), employmentStatus: 'deactivated' });
    await Promise.resolve(); await Promise.resolve();
    expect(document.getElementById('profile-status-chip').textContent).toContain('Deactivated');
    ```
  - |
    AC1/AC2/AC3 (`test/employees-list-ui.test.js`): the directory row's action button label
    toggles with status, and a rejected request (mocked 403) leaves the row's chip unchanged and
    shows the rejection toast:
    ```js
    const api = { deactivate: jest.fn().mockRejectedValue({ status: 403 }) };
    initEmployeesListApp(document, [fixtureActiveEmployee()], api, () => 'employee');
    document.querySelector('[data-lifecycle-id]').click();
    document.getElementById('confirm-action-btn').click();
    await Promise.resolve(); await Promise.resolve();
    expect(document.querySelector('.status-chip').textContent).toContain('Active');
    expect(document.getElementById('toast-message').textContent).toMatch(/Request rejected/i);
    ```
  - |
    AC6 (`test/employees-list-ui.test.js`): clicking a person's name link navigates to that
    employee's profile page:
    ```js
    const onViewEmployee = jest.fn();
    initEmployeesListApp(document, [fixtureActiveEmployee()], api, () => 'manager', onViewEmployee);
    document.querySelector('[data-view-id]').click();
    expect(onViewEmployee).toHaveBeenCalledWith('emp_c001');
    ```

assumptions_or_open_questions:
  - |
    The prototype's fixture data seeds one automatic "System — onboarding completed" history
    entry per employee before any manual change. This plan does not reproduce that in
    `createEmployee`/`completeRun`, because doing so would add a `history` field to every newly
    created employee and break `test/runs-completion.test.js`'s existing
    `expect(rest).toEqual(fullPayload)` assertion (which destructures only `id`/`employmentStatus`
    off the record). Instead, `history` starts absent/empty and gains an entry only on the first
    manual deactivate/reactivate — which still proves AC5 (nothing but the manual action path
    ever writes a history entry or `employmentStatus`), just without the seeded narrative line.
  - |
    Conflict with the prototype's exact interaction sequence: in the static prototype,
    `onLifecycleClick` checks the selected role client-side and, for the `employee` role, skips
    the confirm dialog entirely and shows the rejection toast immediately — because the prototype
    has no real backend to call. This plan instead always opens the confirm dialog regardless of
    role and performs the real `POST .../deactivate|reactivate` request on confirm, relying on the
    server's genuine 401/403 (via `enforceOnboardingRole`) to drive the "Request rejected" toast —
    the same approach already shipped in `public/js/hire-profile.js`. The end state required by
    AC3/AC4 (status never changes, user sees a rejection) is identical either way; the only
    visible difference is that the confirm dialog now appears briefly for every role instead of
    being suppressed up front for a known-non-HR/Manager viewer.
  - |
    `employees.html` is a new, standalone entry point not yet linked from any other page's nav bar
    (e.g. `expenses.html` has an inert "Employees" link with `onclick="return false;"`). Wiring
    that cross-link is left out since no acceptance criterion covers app-wide navigation, matching
    how `run-detail.html` also isn't linked from unrelated pages.
  - |
    The prototype's "Role Permissions" and "Acceptance Criteria Checklist" screens are reviewer-
    facing documentation screens built into the prototype file itself, not product screens to
    ship — only "Employee Directory" and "Employee Profile" are built here.
  - |
    `GET /employees` (list) and `GET /employees/:id` (detail) are left completely ungated,
    including the new list route, since no acceptance criterion restricts who may view the
    directory or a record — only the two status-changing actions are role-gated.

package_dependencies: []

notes: |
  Existing precedent this plan leans on heavily:
  - `src/rooms/store.js`'s `deactivateRoom`/`reactivateRoom` — the exact shape for the new
    `deactivateEmployee`/`reactivateEmployee`.
  - `src/hires/routes.js`'s `POST /:id/deactivate` / `POST /:id/reactivate`, both gated with
    `enforceOnboardingRole` from `src/runs/auth.js` — the exact shape for the new employees
    routes, and the reason no new authorization code is needed (the role set HR/Manager this
    story requires is already encoded as `ROLE_ACTORS = { manager: 'Manager', hr: 'HR' }`).
  - `public/js/hire-profile.js` / `public/hire-profile.html` — the exact shape for
    `employee.html`/`employee.js` (role-switcher, confirm-modal-then-API-call lifecycle actions,
    `isAccessDenied(err)` catch handling, `kv-list` detail rendering).
  - `public/js/runs.js` + `public/run-detail.html` + `public/js/run-detail.js` — the exact shape
    for the directory-links-to-detail-page navigation and the `?employeeId=`-style deep link
    (mirroring `?runId=`), including the not-found empty state.

  ```mermaid
  flowchart TD
    runsStore["src/runs/store.js<br/>completeRun() -> createEmployee()"] -->|existing, unchanged| employeesStore["src/employees/store.js<br/>+listEmployees +deactivateEmployee +reactivateEmployee"]
    employeesRoutes["src/employees/routes.js<br/>+GET / +POST /:id/deactivate +POST /:id/reactivate"] -->|calls| employeesStore
    employeesRoutes -->|reuses role gate, unchanged| runsAuth["src/runs/auth.js<br/>enforceOnboardingRole"]
    server["src/server.js<br/>app.use('/employees', ...)"] -->|existing mount, unchanged| employeesRoutes
    employeesJs["public/js/employees.js<br/>initEmployeesListApp"] -->|fetch GET/POST| employeesRoutes
    employeeJs["public/js/employee.js<br/>initEmployeeProfileApp"] -->|fetch GET/POST| employeesRoutes
    employeesJs -->|"navigate ?employeeId="| employeeJs

    classDef touched fill:#f96,color:#000;
    class employeesStore,employeesRoutes,employeesJs,employeeJs touched;
  ```

review_focus: |
  In scope: the employees store's two new lifecycle functions, the two new role-gated routes
  (reusing `enforceOnboardingRole` verbatim — do not flag a "new" auth mechanism, it's the same
  one `hires/routes.js` already uses), and the two new pages/pages' JS. Out of scope, deliberately:
  any system/access-control change, any automatic status trigger from another workflow, a generic
  PATCH for employees, and cross-linking `employees.html` from other pages' nav bars. The riskiest
  area is the frontend's deactivate/reactivate confirm flow intentionally diverging from the
  prototype's literal client-side role pre-check (see assumptions) — reviewers should check the
  *outcome* (status unchanged + rejection toast on 403) rather than expecting the dialog to be
  suppressed for the `employee` role. Also check that `history` is genuinely absent/lazy on a
  freshly created employee so `test/runs-completion.test.js` still passes unmodified.
