summary: |
  Add a new "hires" domain to the backend that keeps an onboarding Run in sync with a
  new-hire profile's lifecycle (offer-accepted trigger, role/department restart,
  deactivate/reactivate), fronted by a stub "onboarding engine" client that stands in
  for the real external engine (there is no such integration in this codebase today).
  Expose the domain via Express routes mirroring the existing `src/employees` pattern
  (plain in-memory Map-backed store + thin router, tested with supertest), and build
  the already-approved "Hire Profile" screen read from
  `.arc/designs/TEST-M1-STORY-055-design.html` (the first `data-name="Hire Profile"`
  screen only — its "Reference States" and "Edge Cases" screens are reviewer-only
  documentation per the design's own comments) — profile card, Run card with status
  chip/progress bar, pending banner + fieldset lock, role/department and
  contact/start-date edit modals, deactivate/reactivate confirm modals, and the Run
  history list — wired to the new backend endpoints instead of the prototype's
  local-storage simulation, since the acceptance criteria describe real trigger/cancel
  behavior against an onboarding engine, not a UI-only demo.

scope:
  - description: |
      Add `src/onboarding/engineClient.js`, a stand-in for the external onboarding
      engine (there is no real integration in this codebase yet). Exposes:
      ```js
      async function triggerRun({ hireId, department, role })
      // -> { id, hireId, department, role, status: 'active', startedAt, tasksDone: 0 }
      async function cancelRun(runId)
      // -> { id: runId, status: 'cancelled' }
      ```
      Run ids are generated with an internal counter (`run_${7200 + seq}`) to match the
      id shape shown in the design's Run card (`run_7241`, `run_7318`, `run_7402`, etc.,
      confirmed in the "Reference States" screen).
    files:
      - src/onboarding/engineClient.js
    rationale: |
      AC1-AC8 all hinge on "an onboarding Run is triggered/cancelled in the onboarding
      engine". Isolating that call behind one small module gives the sync logic in
      `src/hires/store.js` a single seam to depend on, and is the minimal shape needed
      to satisfy the ACs without inventing a real external integration that doesn't
      exist in this project.

  - description: |
      Add `src/hires/store.js`: the new-hire profile + Run domain model and the sync
      rules between them.
      ```js
      async function createHire(data)
      // -> hire { id, name, email, phone, startDate, department, role, hireStage,
      //           profileStatus, run, runHistory }
      function getHire(id)
      async function updateHire(id, changes) // -> updated hire | undefined
      async function deactivateHire(id) // -> updated hire | undefined
      async function reactivateHire(id) // -> updated hire | undefined
      ```
      `updateHire` diffs `changes` against the stored hire before applying them:
      - if `hireStage` transitions into `'offer_accepted'` and there is no active run
        yet, call `engineClient.triggerRun` (AC1).
      - else if there is an active run and `department` and/or `role` is changing,
        cancel the current run via `engineClient.cancelRun`, push it onto
        `runHistory` with `reason: 'role_or_department_changed'` (AC2), then call
        `engineClient.triggerRun` again with the *new* department/role so the new run
        reflects the update (AC3).
      - otherwise (only `name`, `email`, `phone`, `startDate` changing) the run object
        is left byte-for-byte untouched while the profile fields are applied
        (AC4, AC5).
      `deactivateHire` cancels any active run with `reason: 'profile_deactivated'` and
      sets `profileStatus: 'deactivated'` (AC6). `reactivateHire` sets
      `profileStatus: 'active'` and always calls `engineClient.triggerRun` fresh
      (`tasksDone: 0`, a new run id, tagged `freshStart: true`) — it never reads from
      `runHistory`, so the previously cancelled run can never be resumed (AC7, AC8).
    files:
      - src/hires/store.js
    rationale: |
      This is the actual behavior under test for AC1-AC8. Keeping it as a plain module
      of async functions (no HTTP concerns) mirrors `src/employees/store.js` (verified:
      a `Map`-backed `createEmployee`/`getEmployee` pair) and makes the sync rules
      directly unit testable without going through Express.

  - description: |
      Add `src/hires/routes.js` (mirrors the verified shape of
      `src/employees/routes.js`) and mount it in `src/server.js`:
      ```js
      router.post('/', async (req, res) => { ... })            // create
      router.get('/:id', (req, res) => { ... })
      router.patch('/:id', async (req, res) => { ... })         // stage/role/dept/contact changes
      router.post('/:id/deactivate', async (req, res) => { ... })
      router.post('/:id/reactivate', async (req, res) => { ... })
      ```
      `src/server.js` gains one line, alongside the existing
      `app.use('/employees', employeesRouter);`:
      ```js
      app.use('/hires', hiresRouter);
      ```
    files:
      - src/hires/routes.js
      - src/server.js
    rationale: |
      The frontend needs a real HTTP surface to call — the design's own local-storage
      simulation is a prototype convenience, not something to ship. This is the
      minimal Express wiring needed for the AC9 pending-UI flow to have something real
      to await, and it follows the one existing backend-domain convention in the repo
      (`employees`, verified in `src/employees/routes.js` and `src/server.js`) exactly.

  - description: |
      Build the approved "Hire Profile" screen markup and styling from the design.
      `public/hire-profile.html` reproduces (only) the first screen of the prototype
      (`data-name="Hire Profile"`, `.arc/designs/TEST-M1-STORY-055-design.html` lines
      ~693-876) — the "Reference States" and "Edge Cases" screens are reviewer-only
      documentation per the design's own HTML comments and are not real app screens to
      ship. Carried over verbatim (ids, structure, classes), as read from the design:
      the `.app-topbar`/`.app-nav`, `.page-header` with `#top-actions`, `#pending-banner`
      (with `.spin` icon and `aria-live="polite"`), the two-column `.layout-grid` with
      the profile `.card` (`#profile-status-chip`, `#profile-fieldset`, `#kv-list` rows
      for name/email/phone/start date/department/role/hire stage), the Run `.card`
      (`#run-status-chip` with `.status-chip--none/pending/active/cancelled` variants,
      `.run-meta`, `.progress-track`/`.progress-fill`, `.fresh-start-tag`,
      `#history-toggle-btn`/`#history-list`/`.not-resumed-note`), the role-and-department
      modal's two-step `#role-form` → `#role-confirm-step` → confirm flow, the
      `#contact-form` modal, the `#deactivate-modal` and `#reactivate-modal` confirm
      dialogs, and the `#toast`. `public/css/hire-profile.css` carries the corresponding
      rules from the design's inline `<style>` block (following the existing per-page
      pattern in `public/css/expenses.css`, verified to duplicate modal/toast rules
      rather than share them), built only from tokens already in
      `design-system/tokens.css` (verified identical token set to the design's own
      `:root` block — no new tokens invented).
    files:
      - public/hire-profile.html
      - public/css/hire-profile.css
    rationale: |
      Per instructions the design is already approved and must not be re-authored —
      this step only transcribes the one real screen's markup and token-based styles
      into the app's actual static-file layout (`public/*.html` + `public/css/*.css`,
      per the verified `public/index.html` / `public/css/expenses.css` pair).

  - description: |
      Add `public/js/hire-profile.js` implementing the page's behavior:
      ```js
      function initHireProfileApp(doc, hire, api) { ... }
      ```
      `api` is an injected object with one async method per mutating action
      (`saveStage`, `updateRoleDepartment`, `updateContact`, `deactivate`,
      `reactivate`), each returning a Promise of the updated hire; a default
      implementation (used by the real `DOMContentLoaded` bootstrap) calls `fetch`
      against the `/hires/:id` endpoints from scope item 3. Wiring per design element
      (ids read from the design): `#save-stage-btn` -> `api.saveStage`; the role
      modal's `#role-confirm-btn` (after the `#role-form` -> `#role-confirm-step`
      two-step flow) -> `api.updateRoleDepartment`; `#contact-form` submit ->
      `api.updateContact`; `#deactivate-confirm-btn` -> `api.deactivate`;
      `#reactivate-confirm-btn` -> `api.reactivate`.

      Pending state (AC9) applies only to the four Run-affecting actions — save-stage,
      role/department confirm, deactivate, reactivate — never to the contact/start-date
      save, since that action never touches the Run (AC4/AC5). While one of those four
      Promises is in flight: `pending-banner.hidden = false`, its text set to an
      action-specific label (matching the design's own copy, e.g. "Starting onboarding
      Run…", "Cancelling current Run and starting a new one…"), and
      `profile-fieldset.disabled = true` (which, per the design's own CSS rule
      `fieldset.profile-fieldset[disabled] .kv-actions button, ... .top-actions button
      { opacity: 0.5; cursor: not-allowed; }`, also visually dims/disables the
      top-actions and kv-actions buttons nested inside it). Both are reverted once the
      Promise settles, and the profile/Run cards are re-rendered from the resolved hire.
    files:
      - public/js/hire-profile.js
    rationale: |
      Separating an injected `api` from the render/wiring logic keeps the module
      testable under jsdom without a real network layer (tests inject a fake api with
      a manually-resolved Promise to assert the pending state precisely), while the
      default fetch-backed implementation is what actually ships. This mirrors the
      verified testing approach in `public/js/expenses.js` /
      `test/expenses.test.js` (load the real HTML into jsdom via
      `document.documentElement.innerHTML = fs.readFileSync(...)`, then call
      `initExpensesApp(document)`), swapping expenses.js's local-storage simulation for
      an injectable `api` since this story's ACs are about real backend/engine sync.

tests:
  - |
    AC1 — `test/hires-store.test.js`:
    ```js
    const { createHire, getHire, updateHire } = require('../src/hires/store');

    test('AC1: creating a profile with hireStage "offer_accepted" triggers an onboarding Run', async () => {
      const hire = await createHire({
        name: 'Jordan Reyes', email: 'jordan.reyes@example.com', phone: '(312) 555-0148',
        startDate: '2026-10-05', department: 'Engineering', role: 'Software Engineer II',
        hireStage: 'offer_accepted',
      });
      expect(getHire(hire.id).run).toMatchObject({ status: 'active', department: 'Engineering', role: 'Software Engineer II' });
      expect(getHire(hire.id).run.id).toBeTruthy();
    });

    test('AC1: updating a draft profile to "offer_accepted" triggers an onboarding Run', async () => {
      const hire = await createHire({ name: 'A', email: 'a@x.com', phone: '1', startDate: '2026-10-05', department: 'Sales', role: 'AE', hireStage: 'draft' });
      expect(getHire(hire.id).run).toBeNull();
      const updated = await updateHire(hire.id, { hireStage: 'offer_accepted' });
      expect(updated.run).toMatchObject({ status: 'active', department: 'Sales', role: 'AE' });
    });
    ```
  - |
    AC2 — `test/hires-store.test.js`:
    ```js
    test('AC2: changing role or department on an active Run cancels the existing Run', async () => {
      const hire = await createHire({ name: 'A', email: 'a@x.com', phone: '1', startDate: '2026-10-05', department: 'Engineering', role: 'Engineer II', hireStage: 'offer_accepted' });
      const originalRunId = getHire(hire.id).run.id;
      const updated = await updateHire(hire.id, { department: 'Product', role: 'Product Manager' });
      expect(updated.runHistory).toContainEqual(expect.objectContaining({ id: originalRunId, status: 'cancelled', reason: 'role_or_department_changed' }));
    });
    ```
  - |
    AC3 — `test/hires-store.test.js`:
    ```js
    test('AC3: changing role or department starts a new Run reflecting the update', async () => {
      const hire = await createHire({ name: 'A', email: 'a@x.com', phone: '1', startDate: '2026-10-05', department: 'Engineering', role: 'Engineer II', hireStage: 'offer_accepted' });
      const originalRunId = getHire(hire.id).run.id;
      const updated = await updateHire(hire.id, { department: 'Product', role: 'Product Manager' });
      expect(updated.run.id).not.toBe(originalRunId);
      expect(updated.run).toMatchObject({ status: 'active', department: 'Product', role: 'Product Manager' });
    });
    ```
  - |
    AC4 — `test/hires-store.test.js`:
    ```js
    test('AC4: changing start date, name, or contact details leaves the active Run unaffected', async () => {
      const hire = await createHire({ name: 'A', email: 'a@x.com', phone: '1', startDate: '2026-10-05', department: 'Engineering', role: 'Engineer II', hireStage: 'offer_accepted' });
      const before = getHire(hire.id).run;
      const updated = await updateHire(hire.id, { name: 'A B', email: 'ab@x.com', phone: '2', startDate: '2026-11-01' });
      expect(updated.run).toEqual(before);
    });
    ```
  - |
    AC5 — `test/hires-store.test.js`:
    ```js
    test('AC5: the profile reflects updated start date, name, and contact values', async () => {
      const hire = await createHire({ name: 'A', email: 'a@x.com', phone: '1', startDate: '2026-10-05', department: 'Engineering', role: 'Engineer II', hireStage: 'offer_accepted' });
      const updated = await updateHire(hire.id, { name: 'A B', email: 'ab@x.com', phone: '2', startDate: '2026-11-01' });
      expect(updated).toMatchObject({ name: 'A B', email: 'ab@x.com', phone: '2', startDate: '2026-11-01' });
    });
    ```
  - |
    AC6 — `test/hires-store.test.js`:
    ```js
    test('AC6: deactivating a profile cancels its active Run', async () => {
      const hire = await createHire({ name: 'A', email: 'a@x.com', phone: '1', startDate: '2026-10-05', department: 'Engineering', role: 'Engineer II', hireStage: 'offer_accepted' });
      const runId = getHire(hire.id).run.id;
      const updated = await deactivateHire(hire.id);
      expect(updated.run).toBeNull();
      expect(updated.profileStatus).toBe('deactivated');
      expect(updated.runHistory).toContainEqual(expect.objectContaining({ id: runId, status: 'cancelled', reason: 'profile_deactivated' }));
    });
    ```
  - |
    AC7 — `test/hires-store.test.js`:
    ```js
    test('AC7: reactivating a deactivated profile starts a fresh Run from the beginning', async () => {
      const hire = await createHire({ name: 'A', email: 'a@x.com', phone: '1', startDate: '2026-10-05', department: 'Engineering', role: 'Engineer II', hireStage: 'offer_accepted' });
      await deactivateHire(hire.id);
      const updated = await reactivateHire(hire.id);
      expect(updated.run).toMatchObject({ status: 'active', tasksDone: 0, freshStart: true });
    });
    ```
  - |
    AC8 — `test/hires-store.test.js`:
    ```js
    test('AC8: the previously cancelled Run is not resumed on reactivation', async () => {
      const hire = await createHire({ name: 'A', email: 'a@x.com', phone: '1', startDate: '2026-10-05', department: 'Engineering', role: 'Engineer II', hireStage: 'offer_accepted' });
      const cancelledRunId = getHire(hire.id).run.id;
      await deactivateHire(hire.id);
      const updated = await reactivateHire(hire.id);
      expect(updated.run.id).not.toBe(cancelledRunId);
      expect(updated.runHistory.find((r) => r.id === cancelledRunId)).toMatchObject({ status: 'cancelled' });
    });
    ```
  - |
    AC9 — `test/hire-profile.test.js` (jsdom, reads `public/hire-profile.html` the way
    `test/expenses.test.js` reads `public/index.html`):
    ```js
    test('AC9: confirming a role/department change shows a pending state and locks the profile until it resolves', async () => {
      let resolveUpdate;
      const api = { updateRoleDepartment: () => new Promise((resolve) => { resolveUpdate = resolve; }) };
      const { initHireProfileApp } = require('../public/js/hire-profile');
      initHireProfileApp(document, fixtureHire(), api);

      document.getElementById('edit-role-btn').click();
      document.getElementById('field-department').value = 'Product';
      document.getElementById('field-role').value = 'Product Manager';
      document.getElementById('role-form').dispatchEvent(new Event('submit', { cancelable: true }));
      document.getElementById('role-confirm-btn').click();

      expect(document.getElementById('pending-banner').hidden).toBe(false);
      expect(document.getElementById('profile-fieldset').disabled).toBe(true);

      resolveUpdate({ ...fixtureHire(), department: 'Product', role: 'Product Manager', run: { id: 'run_9', status: 'active', department: 'Product', role: 'Product Manager', tasksDone: 0 } });
      await Promise.resolve(); await Promise.resolve();

      expect(document.getElementById('pending-banner').hidden).toBe(true);
      expect(document.getElementById('profile-fieldset').disabled).toBe(false);
    });

    test('AC9 (contrast case): saving a contact/start-date change never shows the Run pending banner', async () => {
      let resolveUpdate;
      const api = { updateContact: () => new Promise((resolve) => { resolveUpdate = resolve; }) };
      const { initHireProfileApp } = require('../public/js/hire-profile');
      initHireProfileApp(document, fixtureHire(), api);

      document.getElementById('edit-contact-btn').click();
      document.getElementById('contact-form').dispatchEvent(new Event('submit', { cancelable: true }));

      expect(document.getElementById('pending-banner').hidden).toBe(true);
      resolveUpdate(fixtureHire());
      await Promise.resolve(); await Promise.resolve();
    });
    ```

assumptions_or_open_questions:
  - |
    The design prototype's own script is a self-contained demo (localStorage +
    setTimeout, no real backend). This plan wires the shipped frontend to real
    `/hires/*` endpoints instead, since AC1-AC8 describe verifiable trigger/cancel
    behavior against an onboarding engine, not a UI-only simulation. Flagging this as a
    deliberate departure from the prototype's *implementation* (not its
    markup/styling/layout, which are carried over as-is) for reviewer sign-off.
  - |
    The design's "Reference States" and "Edge Cases" screens are explicitly
    reviewer-only documentation (per the design's own HTML comments) and have no
    corresponding acceptance criterion — trigger-failed, cancel-failed,
    blocked-concurrent-edit, and validation-error handling are treated as out of scope
    for this story rather than silently built or silently dropped.
  - |
    Only one hardcoded hire profile page is built (mirroring the design's single demo
    hire, "Jordan Reyes"/`hire_2031`). A hire list / routing between multiple hires'
    profile pages is not implied by any AC and is out of scope.
  - |
    A "role or department change" is detected as any diff between the incoming
    `changes.department`/`changes.role` and the stored value; submitting the same
    value is treated as a no-op (no cancel/restart), since ACs 2/3 only describe a
    change.
  - |
    `hireStage` is assumed to be exactly `'draft' | 'offer_accepted'` and
    `profileStatus` exactly `'active' | 'deactivated'`, matching the design's fixture
    (`INITIAL_STATE.profile` in the design's script) — no other intermediate stages
    are modeled.
  - |
    AC1's "created or updated to offer-accepted status" is read as covering both
    `createHire` with `hireStage: 'offer_accepted'` directly and `updateHire`
    transitioning an existing draft profile into that stage; both paths are tested.

package_dependencies: []

notes: |
  This is the first story to introduce an "onboarding"/"hire" concept into this
  codebase — there is no existing hire, profile, or Run model to reuse. Verified
  precedents: `src/employees/store.js` + `src/employees/routes.js` (a plain in-memory
  `Map`-backed store + Express router, mounted in `src/server.js` and tested with
  `supertest` in `test/employees.test.js`), which this plan's `src/hires/` module
  follows exactly, and `public/js/expenses.js` + `public/index.html` +
  `public/css/expenses.css` (an imperative, ids-driven frontend module tested by
  loading the real HTML file into jsdom in `test/expenses.test.js`), which
  `public/js/hire-profile.js` follows for its testing approach, though it swaps
  expenses.js's local-storage simulation for a real (but test-injectable) `api` layer
  since this story's ACs are about real backend/engine sync, not local persistence.
  `package.json` already includes `express`, `jest`, `jest-environment-jsdom`, and
  `supertest` — no new package dependencies are needed for this plan.

  ```mermaid
  flowchart TD
    HPHTML[public/hire-profile.html]:::touched
    HPCSS[public/css/hire-profile.css]:::touched
    HPJS[public/js/hire-profile.js]:::touched
    SERVER[src/server.js]:::touched
    HROUTES[src/hires/routes.js]:::touched
    HSTORE[src/hires/store.js]:::touched
    ENGINE[src/onboarding/engineClient.js]:::touched
    EMPROUTES[src/employees/routes.js]
    EMPSTORE[src/employees/store.js]

    HPHTML -- "script tag, mirrors index.html" --> HPJS
    HPJS -- "injected api / default fetch" --> HROUTES
    SERVER -- "app.use('/hires', ...) new" --> HROUTES
    SERVER -. "existing mount, unchanged" .-> EMPROUTES
    HROUTES -- "create/get/patch/deactivate/reactivate" --> HSTORE
    HSTORE -- "triggerRun / cancelRun, AC1-AC8" --> ENGINE
    EMPROUTES --> EMPSTORE

    classDef touched fill:#f96,color:#000
    class HPHTML,HPCSS,HPJS,SERVER,HROUTES,HSTORE,ENGINE touched
  ```
