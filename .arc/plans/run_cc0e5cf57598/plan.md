summary: |
  Adds HR/Manager-gated viewing and editing of a post-onboarding employee profile
  (name, email, department, role, startDate, employmentStatus) on top of the existing
  `src/employees` module, with the employee's locked identifier never changeable once
  set. Backend: `GET /employees/:id` gains the same `enforceOnboardingRole` role gate
  already used by `/hires`, `/guests`, and `/rooms`, and a new `PATCH /employees/:id`
  route whitelists exactly the six editable fields (mirroring `src/hires/routes.js`'s
  `PATCHABLE_FIELDS`/`pickPatchableFields` pattern) so the identifier field can never be
  overwritten even if submitted. Frontend: a new `employee-profile.html` page (reusing
  the "Onboarding" app shell from `hire-profile.html`) implements the approved
  TEST-M1-STORY-170 prototype's "Employee Profile" screen — profile card, locked
  Employee-ID line, edit modal with a read-only ID field, and a permission-denied
  notice for non-HR/Manager roles — wired to the real API instead of the prototype's
  localStorage demo.

scope:
  - description: |
      Add `updateEmployee(id, changes)` to `src/employees/store.js`. It merges only the
      caller-provided `changes` onto the stored record and returns the updated employee
      (or `undefined` if the id is unknown):
      ```js
      function updateEmployee(id, changes) {
        const employee = employees.get(id);
        if (!employee) return undefined;
        Object.assign(employee, changes);
        return employee;
      }
      ```
      `changes` is always pre-filtered by the route layer (see next scope item) to the
      six onboarding-captured fields, so `id` is never a key of `changes` and the
      identifier is never touched here — this is how AC5 is satisfied, with no
      special-case "reject id" branch needed.
    files:
      - src/employees/store.js
    rationale: |
      There is currently no update path for an employee record at all (only
      `createEmployee`/`getEmployee`); AC3 requires one.
  - description: |
      In `src/employees/routes.js`: import `enforceOnboardingRole` from `../runs/auth`
      (the same middleware already used by `src/hires/routes.js`, `src/guests/routes.js`,
      and `src/rooms/routes.js` — maps `x-staff-role: hr`/`manager` to allowed, any other
      value to 403 `{ error: 'forbidden' }`, a missing header to 401 `{ error:
      'unauthorized' }`). Add it to the existing `GET /:id` route (AC1/AC2) and add a new
      gated `PATCH /:id` route (AC3/AC4) that whitelists fields exactly like
      `src/hires/routes.js` does:
      ```js
      const PATCHABLE_FIELDS = ['name', 'email', 'department', 'role', 'startDate', 'employmentStatus'];
      function pickPatchableFields(body) {
        return PATCHABLE_FIELDS.reduce((changes, field) => {
          if (field in body) changes[field] = body[field];
          return changes;
        }, {});
      }
      router.patch('/:id', enforceOnboardingRole, (req, res) => {
        const employee = updateEmployee(req.params.id, pickPatchableFields(req.body));
        if (!employee) return res.status(404).json({ error: 'employee not found' });
        res.status(200).json(employee);
      });
      ```
      `id` is deliberately absent from `PATCHABLE_FIELDS`, so a payload containing
      `id`/`employeeId` silently has that key dropped before it ever reaches the store —
      this is the concrete mechanism behind AC5.
    files:
      - src/employees/routes.js
    rationale: |
      This is the HTTP surface the five acceptance criteria are written against,
      and it reuses an already-established, already-tested authorization pattern
      rather than inventing a new one.
  - description: |
      Update the pre-existing `GET /employees/:id` test in `test/employees.test.js` to
      send `.set('x-staff-role', 'hr')` — it currently calls the route with no role
      header at all, which the new gate on that route will now reject with 401. This is
      a required adjustment to keep that test meaningful (it predates this story's role
      requirement), not a new feature.
    files:
      - test/employees.test.js
    rationale: |
      Without this the pre-existing test starts failing for an unrelated reason
      (missing header) the moment AC1/AC2's gate is added to the route it exercises.
  - description: |
      New `test/employees-profile-editing.test.js` covering AC1–AC5 at the HTTP layer
      (see `tests` below for the literal assertions).
    files:
      - test/employees-profile-editing.test.js
    rationale: |
      Keeps the new acceptance-criteria-driven backend tests in one file separate from
      the pre-existing, unrelated `test/employees.test.js` CRUD smoke tests.
  - description: |
      New `public/employee-profile.html` — the real-app version of the approved
      prototype's "Employee Profile" screen (design lines 742–907). Reuses the
      "Onboarding" app-topbar/nav shell from `public/hire-profile.html` (brand
      "Onboarding"; nav `Profiles · Runs · Employees · Settings`, with `Employees` now
      the active tab) plus the design's "Signed in as" role-select
      (`hr`/`manager`/`team_member`, exact option values and copy from the prototype).
      Below that: a `.card.profile-area` div (`id="profile-area"`, rendered by JS — the
      prototype's success/partial/empty/denied/error states) and an edit-profile modal
      copied field-for-field from the design (`#modal-overlay`/`#modal-wrap`, a
      `.notice--deny` permission-denied panel for `#form-deny-notice`, a
      `.save-error-banner`, and the four fieldsets — Identity with the read-only
      `🔒`-locked `#field-employee-id` plus `#field-name`; Contact with `#field-email`;
      "Department & role" with `#field-department`/`#field-role`; "Employment" with
      `#field-start-date`/`#field-employment-status`) and a toast. Does NOT include the
      prototype's "Viewing" employee-switcher dropdown or its two
      "Simulate load/save failure (demo only)" checkboxes — see
      `assumptions_or_open_questions` for why.
    files:
      - public/employee-profile.html
    rationale: |
      This is the screen the design approves and AC1–AC5 describe; the page needs real
      markup to attach real event listeners and a real fetch-backed API to, mirroring
      how `public/hire-profile.html` + `public/js/hire-profile.js` are split.
  - description: |
      New `public/css/employee-profile.css` — page-specific styles not already covered
      by `design-system/prototype-utils.css` (which already supplies `.app-topbar`,
      `.app-nav`, `.card`, `.modal-*`, `.toast`, `.input`, `.btn-*`, `.field`): the
      profile-id-line lock icon, `.kv-grid`/`.kv-item`/`.kv-label`/`.kv-value` (incl.
      `.is-not-set` and the `.field-changed` flash animation), `.status-chip` and its
      `--active`/`--leave`/`--terminated` variants, `.notice--deny`, `.field-readonly`
      (the locked ID input), `.save-error-banner`, `.partial-note`, and the
      `.picker-field`/role-banner styles — all transcribed from the design's third
      `<style>` block (lines 337–649), using the same `--color-fg`/`--color-primary`/
      `--space-*` tokens already defined in `design-system/tokens.css` (confirmed
      identical token names/values to the ones the prototype's `<style>` block defines
      inline). Keeps the same "Design-system gap note" comment already used verbatim in
      `public/css/hire-profile.css` (no dedicated success/danger color token exists yet,
      so status/deny/lock states are signalled by icon + border weight, never hue alone).
    files:
      - public/css/employee-profile.css
    rationale: |
      Matches this codebase's existing one-CSS-file-per-page convention
      (`hire-profile.css`, `expenses.css`, `guest-profiles.css`, etc.) and keeps the
      design's exact visual spec (colors, spacing, radii) rather than approximating it.
  - description: |
      New `public/js/employee-profile.js` exporting `initEmployeeProfileApp(doc,
      employeeId, api, getRole)` and `createDefaultApi(employeeId, getRole)`, following
      the exact shape of `public/js/hire-profile.js`'s
      `initHireProfileApp`/`createDefaultApi` split (dependency-injected `doc` and `api`
      so tests can run under jsdom without real `fetch`). `createDefaultApi` builds:
      ```js
      const api = {
        getProfile: () => request(`/employees/${employeeId}`, 'GET'),
        updateProfile: (changes) => request(`/employees/${employeeId}`, 'PATCH', changes),
      };
      ```
      sending `x-staff-role: getRole()` on every call (same header convention as
      `createDefaultApi` in `hire-profile.js`), and rejecting with `{ status, ...body }`
      on a non-2xx response. `initEmployeeProfileApp` renders, per the design's JS
      (lines 1101–1433, adapted): `renderEmptyState()` (no `employeeId` at all — kept for
      the no-id-in-URL case, see assumptions), `renderDeniedState()` when `getProfile()`
      rejects with status 401/403 (AC2 — profile fields are never rendered),
      `renderProfile(emp, changedKeys)` showing all six fields plus the locked
      `Employee ID: <id> (locked)` line (AC1), with the same partial-data "Not set"
      treatment for a falsy `department`. The edit modal mirrors the design's
      `onEditClick`/submit handler: denied role -> `#form-deny-notice` shown and
      `#profile-form` hidden, `updateProfile` never called (AC4); allowed role -> form
      pre-filled from the in-memory profile, `#field-employee-id` rendered `readonly`
      and excluded from the submitted payload entirely (AC5); same client-side required-
      field + email-format validation as the design (`name`, `email`, `department`,
      `role`, `startDate` required; email regex `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`); on
      submit, calls `api.updateProfile({ name, email, department, role, startDate,
      employmentStatus })` (no `id` key) and on success re-renders the profile with the
      server's returned record and shows the toast "Profile updated" (AC3); on a
      rejected save shows `#save-error-banner` inside the still-open form, changing
      nothing, matching the design's save-error state.
    files:
      - public/js/employee-profile.js
    rationale: |
      Keeps the HTML/CSS/behavior split and dependency-injection testing style already
      established by `hire-profile.html`/`hire-profile.js`/`hire-profile.test.js`.
  - description: |
      New `test/employee-profile.test.js` (`@jest-environment jsdom`, loading
      `public/employee-profile.html` into `document.documentElement.innerHTML` the same
      way `test/hire-profile.test.js` does) exercising AC1–AC5 against the rendered DOM
      with a fake `api` object (see `tests` below for the literal assertions).
    files:
      - test/employee-profile.test.js
    rationale: |
      AC1–AC5 are written in request/response language that the backend tests already
      cover at the HTTP layer; this file additionally proves the screen the design
      approves actually renders/hides the right things and wires the right payload,
      the same division of labor `hire-profile.test.js` already uses for `/hires`.

tests:
  - |
    AC1 (backend): `test/employees-profile-editing.test.js` —
    ```js
    test.each(['hr', 'manager'])('AC1: %s can view a completed employee profile with all captured fields', async (role) => {
      const employee = createEmployee({ name: 'Jordan Reyes', email: 'jordan.reyes@example.com', department: 'Engineering', role: 'Software Engineer II', startDate: '2026-09-20', employmentStatus: 'active' });
      const res = await request(app).get(`/employees/${employee.id}`).set('x-staff-role', role);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ name: 'Jordan Reyes', email: 'jordan.reyes@example.com', department: 'Engineering', role: 'Software Engineer II', startDate: '2026-09-20', employmentStatus: 'active' });
    });
    ```
  - |
    AC2 (backend): `test/employees-profile-editing.test.js` —
    ```js
    test('AC2: a non-HR/Manager role requesting a profile is rejected and gets no profile data', async () => {
      const employee = createEmployee({ name: 'Jordan Reyes', email: 'j@example.com', department: 'Engineering', role: 'Engineer', startDate: '2026-09-20', employmentStatus: 'active' });
      const res = await request(app).get(`/employees/${employee.id}`).set('x-staff-role', 'team_member');
      expect(res.status).toBe(403);
      expect(res.body).toEqual({ error: 'forbidden' });
    });
    test('AC2: no x-staff-role header at all is rejected with 401', async () => {
      const employee = createEmployee({ name: 'Jordan Reyes', email: 'j@example.com', department: 'Engineering', role: 'Engineer', startDate: '2026-09-20', employmentStatus: 'active' });
      const res = await request(app).get(`/employees/${employee.id}`);
      expect(res.status).toBe(401);
    });
    ```
  - |
    AC3 (backend): `test/employees-profile-editing.test.js` —
    ```js
    test.each(['hr', 'manager'])('AC3: %s can update all six editable fields', async (role) => {
      const employee = createEmployee({ name: 'Jordan Reyes', email: 'j@example.com', department: 'Engineering', role: 'Engineer', startDate: '2026-09-20', employmentStatus: 'active' });
      const res = await request(app).patch(`/employees/${employee.id}`).set('x-staff-role', role).send({ name: 'J. Reyes', email: 'new@example.com', department: 'Product', role: 'Senior Engineer', startDate: '2026-10-01', employmentStatus: 'on_leave' });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ name: 'J. Reyes', email: 'new@example.com', department: 'Product', role: 'Senior Engineer', startDate: '2026-10-01', employmentStatus: 'on_leave' });
      expect(getEmployee(employee.id).role).toBe('Senior Engineer');
    });
    ```
  - |
    AC4 (backend): `test/employees-profile-editing.test.js` —
    ```js
    test('AC4: a non-HR/Manager role submitting an update is rejected and the profile is unchanged', async () => {
      const employee = createEmployee({ name: 'Jordan Reyes', email: 'j@example.com', department: 'Engineering', role: 'Engineer', startDate: '2026-09-20', employmentStatus: 'active' });
      const res = await request(app).patch(`/employees/${employee.id}`).set('x-staff-role', 'team_member').send({ name: 'Changed' });
      expect(res.status).toBe(403);
      expect(getEmployee(employee.id).name).toBe('Jordan Reyes');
    });
    ```
  - |
    AC5 (backend): `test/employees-profile-editing.test.js` —
    ```js
    test('AC5: submitting a different id alongside an update leaves the employee id unchanged', async () => {
      const employee = createEmployee({ name: 'Jordan Reyes', email: 'j@example.com', department: 'Engineering', role: 'Engineer', startDate: '2026-09-20', employmentStatus: 'active' });
      const res = await request(app).patch(`/employees/${employee.id}`).set('x-staff-role', 'hr').send({ id: 'emp_9999', role: 'Senior Engineer' });
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(employee.id);
      expect(res.body.role).toBe('Senior Engineer');
      expect(getEmployee(employee.id).id).toBe(employee.id);
    });
    ```
  - |
    AC1 (frontend): `test/employee-profile.test.js` —
    ```js
    test('AC1: HR sees all six fields plus the locked employee ID line', async () => {
      const api = { getProfile: () => Promise.resolve(fixtureEmployee()) };
      const { initEmployeeProfileApp } = require('../public/js/employee-profile');
      initEmployeeProfileApp(document, 'emp_2031', api, () => 'hr');
      await Promise.resolve(); await Promise.resolve();
      const text = document.getElementById('profile-area').textContent;
      expect(text).toContain('Jordan Reyes');
      expect(text).toContain('jordan.reyes@example.com');
      expect(text).toContain('Engineering');
      expect(text).toContain('Software Engineer II');
      expect(text).toContain('emp_2031');
    });
    ```
  - |
    AC2 (frontend): `test/employee-profile.test.js` —
    ```js
    test('AC2: a Team member never sees profile fields — a permission-denied panel renders instead', async () => {
      const api = { getProfile: () => Promise.reject({ status: 403, error: 'forbidden' }) };
      const { initEmployeeProfileApp } = require('../public/js/employee-profile');
      initEmployeeProfileApp(document, 'emp_2031', api, () => 'team_member');
      await Promise.resolve(); await Promise.resolve();
      const text = document.getElementById('profile-area').textContent;
      expect(text).toContain("don't have permission");
      expect(text).not.toContain('jordan.reyes@example.com');
    });
    ```
  - |
    AC3 (frontend): `test/employee-profile.test.js` —
    ```js
    test('AC3: editing and saving updates the displayed profile with the new value', async () => {
      const updated = { ...fixtureEmployee(), role: 'Senior Software Engineer' };
      const api = { getProfile: () => Promise.resolve(fixtureEmployee()), updateProfile: () => Promise.resolve(updated) };
      const { initEmployeeProfileApp } = require('../public/js/employee-profile');
      initEmployeeProfileApp(document, 'emp_2031', api, () => 'hr');
      await Promise.resolve(); await Promise.resolve();
      document.getElementById('edit-profile-btn').click();
      document.getElementById('field-role').value = 'Senior Software Engineer';
      document.getElementById('profile-form').dispatchEvent(new Event('submit', { cancelable: true }));
      await Promise.resolve(); await Promise.resolve();
      expect(document.getElementById('profile-area').textContent).toContain('Senior Software Engineer');
    });
    ```
  - |
    AC4 (frontend): `test/employee-profile.test.js` —
    ```js
    test('AC4: a Team member cannot submit a profile update — updateProfile is never called', async () => {
      const updateProfile = jest.fn();
      const api = { getProfile: () => Promise.reject({ status: 403 }), updateProfile };
      const { initEmployeeProfileApp } = require('../public/js/employee-profile');
      initEmployeeProfileApp(document, 'emp_2031', api, () => 'team_member');
      await Promise.resolve(); await Promise.resolve();
      document.getElementById('edit-profile-btn').click();
      expect(document.getElementById('form-deny-notice').hidden).toBe(false);
      expect(document.getElementById('profile-form').hidden).toBe(true);
      expect(updateProfile).not.toHaveBeenCalled();
    });
    ```
  - |
    AC5 (frontend): `test/employee-profile.test.js` —
    ```js
    test('AC5: the Employee ID field is readonly and never appears in the save payload', async () => {
      let sentPayload;
      const api = {
        getProfile: () => Promise.resolve(fixtureEmployee()),
        updateProfile: (changes) => { sentPayload = changes; return Promise.resolve({ ...fixtureEmployee(), ...changes }); },
      };
      const { initEmployeeProfileApp } = require('../public/js/employee-profile');
      initEmployeeProfileApp(document, 'emp_2031', api, () => 'hr');
      await Promise.resolve(); await Promise.resolve();
      document.getElementById('edit-profile-btn').click();
      expect(document.getElementById('field-employee-id').readOnly).toBe(true);
      document.getElementById('profile-form').dispatchEvent(new Event('submit', { cancelable: true }));
      await Promise.resolve(); await Promise.resolve();
      expect(sentPayload.id).toBeUndefined();
      expect(sentPayload.employeeId).toBeUndefined();
    });
    ```

assumptions_or_open_questions:
  - |
    The design's fixture data names the locked identifier field `employeeId` (e.g.
    `"employeeId": "emp_2031"`), but every piece of real production code that already
    exists (`src/employees/store.js`'s `createEmployee`, `src/runs/store.js`'s
    `run.employeeId = employee.id`, and `test/runs-completion.test.js`) already names
    this same field `id` on the employee record itself. This plan keeps the existing
    `id` field name and locks that, rather than renaming it to `employeeId` or adding a
    second redundant field — renaming would break `src/runs/store.js` and
    `test/runs-completion.test.js`, which no AC in this story asks to touch. The
    frontend still *displays* the value under the label "Employee ID" exactly as the
    design shows, so the discrepancy is invisible to a user — it's an internal field-
    name mismatch between the design's mock data and this codebase's real schema only.
  - |
    The design's "Viewing" dropdown (switching between three fixture employees) is
    explicitly called out in the design's own HTML comment as "a demo convenience for
    switching between fixture employees, not a search feature," and this story's scope
    explicitly excludes directory/search. There is also no existing `GET /employees`
    (list) route, and adding one isn't asked for by any AC. The real
    `employee-profile.html` therefore loads a single employee via an `?id=` query-string
    parameter instead of a picker; with no `id` present it shows the design's existing
    empty state ("Select an employee ... to see their profile"). How a user actually
    navigates to a given employee's `?id=...` URL (e.g., a future link from the
    hire-profile or a directory page) is out of scope for this story and not decided here.
  - |
    The design's two "Simulate load/save failure (demo only)" checkboxes are explicitly
    labeled demo-only prototype aids for reviewers, not product requirements. The real
    page surfaces genuine fetch failures instead (a rejected `getProfile()`/
    `updateProfile()` promise), the same pattern `public/js/hire-profile.js` already
    uses for its own error toasts — no fake-failure toggle is built.
  - |
    `employmentStatus` validation: AC3 only requires that submitted values are saved, so
    no enum/format validation is added for this field beyond what the design's `<select>`
    already constrains client-side (Active / On leave / Terminated). This plan does not
    reconcile that display casing with the lowercase `'active'` value
    `src/runs/store.js` currently writes when onboarding completes — that mismatch
    predates this story and no AC asks to fix it.
  - |
    No existing page's nav is updated to link to the new `employee-profile.html` (the
    design shows the same `Profiles · Runs · Employees · Settings` nav on all of its
    reference screens, but `hire-profiles.html`/`hire-profile.html`/`runs.html` currently
    render `Employees` as an inert `href="#" onclick="return false;"` stub). Wiring that
    navigation is not required by any AC and is left as a follow-up.

package_dependencies: []

notes: |
  This mirrors `src/hires/routes.js`'s existing `enforceOnboardingRole` +
  `PATCHABLE_FIELDS`/`pickPatchableFields` pattern almost exactly, and the frontend
  mirrors `public/hire-profile.html`/`public/js/hire-profile.js`'s dependency-injected
  `initXApp(doc, ..., api)` + `createDefaultApi` split — both already proven,
  already-tested shapes in this codebase, just applied to the `employees` resource.

  ```mermaid
  flowchart TD
    classDef touched fill:#f96,color:#000

    AUTH[src/runs/auth.js enforceOnboardingRole]
    ROUTES[src/employees/routes.js]:::touched
    STORE[src/employees/store.js]:::touched
    RUNSSTORE[src/runs/store.js completeRun]
    HTML[public/employee-profile.html]:::touched
    JS[public/js/employee-profile.js]:::touched
    CSS[public/css/employee-profile.css]:::touched
    SERVER[src/server.js]

    SERVER -->|mounts /employees| ROUTES
    AUTH -->|"gates GET/PATCH :id (new)"| ROUTES
    ROUTES -->|"getEmployee / updateEmployee (new)"| STORE
    RUNSSTORE -->|"createEmployee (unchanged call site)"| STORE
    HTML --> JS
    JS -->|"fetch GET/PATCH /employees/:id"| ROUTES
    HTML --> CSS
  ```

review_focus: |
  In scope: role-gating `GET`/`PATCH /employees/:id` with the existing
  `enforceOnboardingRole` middleware, a whitelist-based PATCH that makes the
  employee's `id` un-overwritable by construction (not a special-cased check), and a
  real (non-demo) `employee-profile.html`/`.js`/`.css` implementing the approved
  prototype's single-employee view/edit screen. Out of scope, and should not be flagged
  as missing: deactivate/reactivate status-transition flows (belongs to
  `hires`/hire-profile, not this employee record), any directory/search/list-all-
  employees endpoint or UI, and wiring other pages' nav links to the new page. The
  riskiest area is the PATCH whitelist in `src/employees/routes.js` — confirm
  `PATCHABLE_FIELDS` is exactly the six onboarding-captured fields and that `id` (or any
  other key, like a stray `employeeId`) in the request body is silently dropped rather
  than erroring, since AC5 depends on that silence rather than an explicit rejection.
  Also worth noting deliberately: the frontend intentionally diverges from the literal
  prototype by dropping its multi-employee picker and "simulate failure" checkboxes
  (both explicitly marked demo-only in the design itself) in favor of a real `?id=`
  bootstrap and real fetch-error handling — this is not a missed requirement.
