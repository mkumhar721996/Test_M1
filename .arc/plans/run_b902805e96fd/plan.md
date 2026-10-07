summary: |
  Add manual, HR/Manager-only deactivate/reactivate actions for an Employee record (the record
  `src/runs/store.js`'s `completeRun` already creates via `createEmployee` when onboarding
  finishes), plus the two screens the approved prototype
  (`.arc/designs/TEST-M1-STORY-171-design.html`) shows for it: an "Employee directory" list and
  an "Employee profile" detail page. The backend reuses the existing `enforceOnboardingRole`
  middleware (`src/runs/auth.js`) — already scoped to exactly `hr`/`manager` — the same way
  `src/hires/routes.js` already gates its own `deactivate`/`reactivate` routes, so no new
  authorization code is written. Viewing an employee (`GET /employees/:id`, already in the
  codebase) stays ungated so a deactivated record remains fully visible (AC6). The two new pages
  are built from the prototype's "Employee Directory" and "Employee Profile" screens (its "Role
  Permissions" and "Acceptance Criteria Checklist" screens are reviewer-facing documentation
  baked into the prototype file itself, not product screens to ship) and structurally mirror the
  already-shipped `hire-profiles.html`/`hire-profile.html` pair: a role-switcher drives which
  `x-staff-role` header the page sends, and `employee.html?employeeId=<id>` is deep-linkable
  exactly like `run-detail.html?runId=<id>`.
scope:
  - description: |
      Add `listEmployees()`, `deactivateEmployee(id, actor)`, and `reactivateEmployee(id, actor)`
      to the employees store. Each setter writes `employmentStatus` and appends a
      `{ status, actor, at }` entry to a lazily-created `employee.history` array:
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
      created employee — `test/runs-completion.test.js`'s
      `expect(rest).toEqual(fullPayload)` (which destructures only `id`/`employmentStatus` off
      the created record) keeps passing untouched.
    files:
      - src/employees/store.js
    rationale: |
      Verified `src/employees/store.js` currently only exports `createEmployee`/`getEmployee`
      with no lifecycle functions. The two-function deactivate/reactivate shape (role-gated at
      the route layer, not the store) matches `src/rooms/store.js`'s `deactivateRoom`/
      `reactivateRoom` pair. The per-call history entry does NOT mirror rooms (which only flips
      a boolean `active` + `deactivatedAt`) or `src/hires/store.js`'s `deactivateHire`/
      `reactivateHire` (which mutate `profileStatus` with no history log at all) — it's new to
      this store, patterned instead after the `{ ts, actor, action }` shape already used by
      `runs.auditLog` (`src/runs/store.js`) and `hires.auditLog`
      (`appendOnboardingAuditEntry`), since AC5 and AC7 both need a provable, timestamped record
      of exactly which action changed the status and when.
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
      Verified `src/runs/auth.js`'s `enforceOnboardingRole`: missing `x-staff-role` header is a
      401 `{ error: 'unauthorized' }`, a role string other than `hr`/`manager` is a 403
      `{ error: 'forbidden' }`, and `hr`/`manager` both set `req.actor` to `'HR'`/`'Manager'` and
      call `next()`. Verified `src/hires/routes.js` already imports and applies this exact
      middleware to its own `POST /:id/deactivate` and `POST /:id/reactivate`. Reusing it here
      means AC1–AC4's required behavior needs zero new auth logic to get wrong, and `src/server.js`
      already mounts `app.use('/employees', employeesRouter)` so no new mount point is needed.
  - description: |
      Backend tests for AC1–AC6 covering the store and the new routes, in a dedicated file.
    files:
      - test/employees-status.test.js
    rationale: |
      Verified the existing convention of splitting role-enforcement tests into their own file
      rather than appending to the general CRUD test file — `test/hires-role-enforcement.test.js`
      and `test/rooms-role-enforcement.test.js` both exist alongside `test/hires.test.js`/
      `test/rooms.test.js`, and `test/employees.test.js` currently only covers plain create/get.
  - description: |
      "Employee directory" page: built from the prototype's first screen
      (`data-name="Employee Directory"`): `.page-header` "Employee directory" /
      "Deactivate an employee when they leave or go on extended leave, and reactivate them when
      they return."; a `.role-switcher` "Signed in as" `#role-select` with
      HR / Manager / "Employee (no HR/Manager access)" options; a hidden `#role-banner`
      (`.role-banner`) shown only for the employee role, reading "Viewing as Employee. Only HR
      or Manager can change an employee's status. The buttons below are still clickable so you
      can see the request get rejected."; a `.filter-bar` with `#status-filter`
      (All employees / Active only / Deactivated only); a `.card.table-card` >
      `table.directory-table` with Name / Department / Role / Start date / Status / Actions
      columns, where Name renders as a `.person-name-link` button (`data-view-id="<id>"`) plus a
      `.person-id` line, and Actions renders an `.action-link.btn-sm`
      (`data-lifecycle-id="<id>"`) toggling "Deactivate"/"Reactivate" by current status; a
      `.status-chip`/`.status-chip--active` ("✓ Active") /`.status-chip--deactivated` ("⏸
      Deactivated") icon+label chip, never color alone; the deactivate/reactivate confirm
      `.modal-panel` (`#confirm-overlay`/`#confirm-wrap`) with a `.consequence-box` naming the
      exact consequence ("Their record stays fully viewable to anyone who opens it — nothing is
      deleted." / "...visible the moment this dialog closes."); and the bottom
      `.no-controls-note` explaining system/access-control and automatic-trigger changes are out
      of scope. `initEmployeesListApp(doc, employees, api, getRole, onViewEmployee)` mirrors
      `public/js/hire-profiles.js`'s structure (local `escapeHtml`/`formatDateDisplay` helpers, a
      `$`-shorthand `doc.getElementById` lookup table, a `renderList`-style function, event
      delegation on the tbody). Clicking a person's name link calls `onViewEmployee(id)`, which
      the page's bottom-of-file bootstrap wires to
      `window.location.href = 'employee.html?employeeId=' + encodeURIComponent(id)`, mirroring
      `public/js/runs.js`'s identical pattern for `run-detail.html?runId=`.
    files:
      - public/employees.html
      - public/css/employees.css
      - public/js/employees.js
    rationale: |
      Read `.arc/designs/TEST-M1-STORY-171-design.html` directly (lines 590–686 for markup,
      929–1131 for behavior) — every class/id/copy string above is taken verbatim from it, not
      invented. `public/hire-profiles.html` confirms the real page convention this follows:
      `<link rel="stylesheet" href="../design-system/tokens.css">` +
      `<link rel="stylesheet" href="../design-system/prototype-utils.css">` + a page-specific
      CSS file, plus a `defer`red page-specific JS file — `.btn`/`.card`/`.modal-*`/`.toast`/
      `.app-topbar`/`.page` already live in `design-system/prototype-utils.css` and don't need
      redefining; `employees.css` only needs the prototype's third `<style>` block's
      page-specific classes (`role-banner`, `filter-bar`, `directory-table`, `status-chip`,
      `action-link`, `no-controls-note`, etc).
  - description: |
      "Employee profile" page: built from the prototype's second screen
      (`data-name="Employee Profile"`): a `.back-link` `#profile-back-btn` "← Back to directory";
      a `.profile-header` with `<h1 id="profile-name">`, `.sub` `#profile-role-line` ("<role> ·
      <department>"), `#profile-status-chip`, and a single `#profile-lifecycle-btn` toggling
      "Deactivate"/"Reactivate"; a hidden `#profile-role-banner` (`.role-banner`) for the
      employee role reading "...The record below is still fully viewable."; a details `.card`
      "Employee details" with a `.kv-list`/`.kv-row` for Employee ID / Email / Department / Role
      / Start date; and a "Status history" `.card` with a `.history-list`/`.history-item`/
      `.history-dot` timeline. Deep-linkable via `employee.html?employeeId=<id>`, read with
      `new URLSearchParams(location.search).get('employeeId')` exactly like `run-detail.js` reads
      `?runId=`; an unknown/missing id renders a not-found empty state (new
      `#profile-empty-state` card, with `#profile-fieldset` hidden) instead of throwing,
      mirroring `run-detail.js`'s exported `showRunNotFound`. Because the backend's `history`
      entries only carry `{ status, actor, at }` (no free-text `note`, no `system` flag — see
      assumptions), each rendered history item shows a generic headline ("Deactivated"/
      "Reactivated — status set to Active") plus `actor · date`, and no entry ever renders in the
      prototype's dimmer "is-system" style since no automatic entry is ever seeded.
    files:
      - public/employee.html
      - public/css/employee.css
      - public/js/employee.js
    rationale: |
      Read the same design file (lines 708–754 for markup, 1012–1056 for behavior). Gives AC6
      ("navigates directly to that employee's record") a real, working deep link the same way
      `run-detail.html?runId=` already works for runs (verified in `public/js/run-detail.js`),
      rather than only being reachable by clicking through the directory, and AC7 ("the updated
      status is displayed immediately") a real in-page re-render on confirm with no page reload,
      the same approach already shipped in `public/js/hire-profile.js`'s deactivate/reactivate
      handlers.
  - description: |
      Frontend (jsdom) tests for both new pages: directory rendering/filtering/role-banner/
      rejection-toast behavior, and profile rendering/deep-link-not-found/immediate status
      update.
    files:
      - test/employees-list-ui.test.js
      - test/employee-profile-ui.test.js
    rationale: |
      Matches the existing jsdom UI test convention verified in `test/hire-profile.test.js` and
      `test/runs-list-ui.test.js`: `/** @jest-environment jsdom */`,
      `document.documentElement.innerHTML = fs.readFileSync(realHtmlPath, 'utf8')` in
      `beforeEach`, then `require`-ing the page's JS module and calling its exported
      `init*App(doc, data, api, ...)` function directly against the real page markup.
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
    entry per employee before any manual change, each carrying a free-text `note` and `system`
    flag that style the entry's dot and headline differently. This plan does not reproduce the
    seeded system entry in `createEmployee`/`completeRun`, because doing so would add a
    `history` field to every newly created employee and break
    `test/runs-completion.test.js`'s existing `expect(rest).toEqual(fullPayload)` assertion
    (which destructures only `id`/`employmentStatus` off the record). It also does not reproduce
    the `note`/`system` fields on manual entries, since there's no source of free-text narration
    for a manual deactivate/reactivate call and no AC requires one — rendered history items show
    only a generic headline, `actor`, and date. `history` starts absent and gains an entry only
    on the first manual deactivate/reactivate, which still proves AC5 (nothing but the manual
    action path ever writes a history entry or `employmentStatus`), just without the seeded
    narrative line or its distinct "is-system" styling.
  - |
    Conflict with the prototype's exact interaction sequence: in the static prototype,
    `onLifecycleClick` checks the selected role client-side first (`if (!hasAccess()) { showToast(...); return; }`)
    and, for the employee role, skips the confirm dialog entirely and shows the rejection toast
    immediately — because the prototype has no real backend to call. This plan instead always
    opens the confirm dialog regardless of role and performs the real
    `POST .../deactivate|reactivate` request on confirm, relying on the server's genuine 401/403
    (via `enforceOnboardingRole`) to drive the "Request rejected" toast — the same approach
    already shipped in `public/js/hire-profile.js`'s deactivate/reactivate/role-change handlers,
    none of which pre-check role client-side either. The end state required by AC3/AC4 (status
    never changes, user sees a rejection) is identical either way; the only visible difference is
    that the confirm dialog now appears briefly for every role instead of being suppressed up
    front for a known-non-HR/Manager viewer.
  - |
    `employees.html` is a new, standalone entry point not yet linked from any other page's nav
    bar (e.g. `hire-profiles.html`'s own "Runs"/"Settings" nav links are inert placeholders with
    `onclick="return false;"`, and the prototype's own "Org chart"/"Settings" links are inert the
    same way). Wiring a cross-link from other pages is left out since no acceptance criterion
    covers app-wide navigation, matching how `run-detail.html` also isn't linked from unrelated
    pages today.
  - |
    `GET /employees` (list) and `GET /employees/:id` (detail) are left completely ungated,
    including the new list route, since no acceptance criterion restricts who may view the
    directory or a record — only the two status-changing actions are role-gated, matching the
    prototype's "Role permissions" reference screen which marks viewing as allowed for every
    role.
  - |
    The prototype's "Reset demo data" button and its real-`localStorage` persistence are
    prototype-only scaffolding for the standalone HTML file (it has no backend to persist to) —
    this plan's pages instead persist through the real `/employees` API and have no reset
    control, since no AC calls for one.
package_dependencies: []
notes: |
  Existing precedent this plan leans on, all verified by reading the current code:
  - `src/rooms/store.js`'s `deactivateRoom`/`reactivateRoom` — the shape for a role-gated,
    two-function lifecycle pair on a store (though not its history-free, boolean-flag
    persistence — see the first scope item's rationale for why `employee.history` instead
    follows the `runs.auditLog`/`hires.auditLog` entry shape).
  - `src/hires/routes.js`'s `POST /:id/deactivate` / `POST /:id/reactivate`, both gated with
    `enforceOnboardingRole` from `src/runs/auth.js` — the exact shape for the new employees
    routes, and the reason no new authorization code is needed (the role set HR/Manager this
    story requires is already encoded as `ROLE_ACTORS = { manager: 'Manager', hr: 'HR' }`).
  - `public/js/hire-profile.js` / `public/hire-profile.html` — the exact shape for
    `employee.js`/`employee.html` (role-switcher, confirm-modal-then-API-call lifecycle actions,
    `isAccessDenied(err)`-style catch handling, `kv-list` detail rendering).
  - `public/js/runs.js` + `public/run-detail.html` + `public/js/run-detail.js` — the exact shape
    for the directory-links-to-detail-page navigation and the `?employeeId=`-style deep link
    (mirroring `?runId=`), including the not-found empty state (`showRunNotFound`).

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
  In scope: the employees store's two new lifecycle functions and its new `history` array, the
  two new role-gated routes (reusing `enforceOnboardingRole` verbatim — do not flag this as a
  "new" auth mechanism, it's the same one `hires/routes.js` already uses), and the two new
  pages/pages' JS. Deliberately out of scope: any system/access-control change, any automatic
  status trigger from another workflow, a generic PATCH for employees, and cross-linking
  `employees.html` from other pages' nav bars. The riskiest area is the frontend's
  deactivate/reactivate confirm flow intentionally diverging from the prototype's literal
  client-side role pre-check (see assumptions) — reviewers should check the *outcome* (status
  unchanged + rejection toast on 403) rather than expecting the dialog to be suppressed for the
  `employee` role. Also check that `history` is genuinely absent/lazy on a freshly created
  employee so `test/runs-completion.test.js` still passes unmodified, and that rendered status
  history entries don't reference a `note`/`system` field the backend never produces.
