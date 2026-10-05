summary: |
  Build the new-hire profile create/edit surface shown in the approved TEST-M1-STORY-155
  prototype: a "New-hire profiles" list screen with a "+ New hire profile" button and a
  shared create/edit modal (name, contact info, department/role, start date, hire stage).
  The backend `/hires` API and in-memory store already exist (built for the separate
  run-triggering story, TEST-M1-STORY-137/140-ish work), so this plan (a) adds the missing
  required-field validation (name, department, role, start date required; email/phone
  optional) to `createHire`/`updateHire` and threads it through the routes as a 400
  `validation_error` response, and (b) builds the new list+modal page against that existing
  API. It also covers the rehire shortcut, which opens the create form pre-filled from a
  completed profile's name/department/role but saves as a fully independent record with no
  linkage field. The single-profile detail page (`public/hire-profile.html`) and its
  Run-pending/active-deactivated behavior belong to other stories and are untouched here.
scope:
  - description: |
      Add required-field validation to the hires store. Add a `HireValidationError` class
      (mirrors `GuestValidationError` in `src/guests/store.js`: `statusCode = 400`,
      `fields` map) and an `assertValidHire(name, department, role, startDate)` helper:

      ```js
      function assertValidHire(name, department, role, startDate) {
        const fields = {};
        if (!name || !String(name).trim()) fields.name = 'Full name is required.';
        if (!department) fields.department = 'Department is required.';
        if (!role || !String(role).trim()) fields.role = 'Role is required.';
        if (!startDate) fields.startDate = 'Start date is required.';
        if (Object.keys(fields).length > 0) {
          throw new HireValidationError('validation_error', fields);
        }
      }
      ```

      Call it at the top of `createHire(data)` with the raw submitted values, before the
      existing `offer_accepted` → `engineClient.triggerRun` side effect, so an invalid
      submission never creates a profile AND never triggers a Run. In `updateHire(id,
      changes)`, compute the merged next values for all four required fields (reusing the
      existing `nextDepartment`/`nextRole` locals already computed for the role/department
      run-restart check, and adding `nextName`/`nextStartDate`) and call
      `assertValidHire(nextName, nextDepartment, nextRole, nextStartDate)` before any of the
      existing run-trigger/cancel branches, so clearing a required field on an edit is
      rejected before any Run side effect runs and before `Object.assign` mutates the
      stored hire. Export `HireValidationError` alongside the existing exports.
    files:
      - src/hires/store.js
    rationale: |
      AC3/AC4/AC5 require blocking an invalid create AND an invalid edit (the design's
      "Required-field validation" reference screen states the rule "applies identically
      whether creating or editing"), with an error that names the specific missing field.
      Today neither `createHire` nor `updateHire` validates anything. `src/guests/store.js`
      already has this exact pattern (`GuestValidationError` + `assertValid` + fields map)
      for a sibling profile type, so this plan mirrors it instead of inventing a new shape.
  - description: |
      Wire the new `HireValidationError` into the routes so a blocked submission reaches
      the client as `400 { error: 'validation_error', fields: {...} }`, matching
      `src/guests/routes.js`'s existing catch blocks exactly:

      ```js
      } catch (err) {
        if (err instanceof HireValidationError) {
          return res.status(400).json({ error: 'validation_error', fields: err.fields });
        }
        next(err);
      }
      ```

      Apply this in both the `POST /` and `PATCH /:id` handlers.
    files:
      - src/hires/routes.js
    rationale: |
      Without this, a thrown `HireValidationError` would fall through to the generic 500
      handler in `src/server.js` instead of the 400 the UI's error path expects.
  - description: |
      Build the new "New-hire profiles" list + create/edit modal page per the approved
      prototype's first screen (`data-name="New-Hire Profiles"`): a page header ("New-hire
      profiles" / "Create a profile when someone is hired, and keep it updated as their
      info and hire stage change.") with a "+ New hire profile" primary button; a
      `table.profile-table` card with columns Name, Contact, Department / Role, Start date,
      Hire stage, Actions; a shared create/edit `modal-panel` form with fieldsets Identity
      (Full name, required), Contact info (Email/Phone, optional, no error elements),
      Department & role (Department `<select>` with the fixed options Engineering/
      Product/Sales/People Ops/Finance, required; Role text input, required), and Start
      date & hire stage (Start date, required; Hire stage `<select>` with
      draft/offer_accepted/onboarding_in_progress/completed, not required); a
      `rehire-banner` shown only in the rehire flow ("This creates a brand-new, standalone
      profile. It will not be linked back to the prior profile in any way."); and a
      `no-controls-note` below the table stating that Run-triggering and active/deactivated
      status are out of scope here. New files: `public/hire-profiles.html` (structure,
      copied field-for-field from the prototype's form markup and ids: `field-name`,
      `field-email`, `field-phone`, `field-department`, `field-role`, `field-start-date`,
      `field-hire-stage`, `error-name`, `error-department`, `error-role`,
      `error-start-date`, `new-profile-btn`, `profile-tbody`, `modal-wrap`, `rehire-banner`,
      `toast`), `public/css/hire-profiles.css` (only the prototype's page-specific rules —
      `.profile-table`, `.stage-chip` + its 4 state modifiers, `.rehire-banner`,
      `.field-error`/`.input-invalid`, `.no-controls-note`, `.edit-link`/`.btn-sm`,
      `.form-fieldset`/`.fieldset-legend`/`.field-row`/`.optional-tag` — the app shell,
      `.card`, `.btn`, `.input`, `.label`, `.modal-*`, and `.toast` primitives already live
      in `design-system/prototype-utils.css` and are reused via the existing `<link>`
      pattern, same as `public/css/guest-profiles.css`'s header comment documents), and
      `public/js/hire-profiles.js` exposing:

      ```js
      function initHireProfilesApp(doc, initialHires, api) { /* ... */ }
      function createDefaultApi() { /* fetch('/hires', ...) wrapper */ }
      module.exports = { initHireProfilesApp, createDefaultApi };
      ```

      `initHireProfilesApp` renders the table from `initialHires`; wires `new-profile-btn`
      → create mode (blank form, hire stage defaulted to `draft`); wires each row's `Edit`
      button → edit mode (form pre-filled with that profile's current values, including
      `email`/`phone` defaulting to `''` when absent); wires a `Create rehire profile`
      button — rendered only when `hireStage === 'completed'` — that opens CREATE mode
      pre-filled with the prior profile's `name`/`department`/`role` but a blank
      `field-start-date` and `field-hire-stage` reset to `draft`, and shows the
      rehire-banner. On submit, client-side validation checks the four required fields
      (mirroring the inline-error pattern already used in `public/js/expenses.js` and
      `public/js/guest-profiles.js`: set `.input-invalid` + un-hide the matching
      `.field-error`, focus the first invalid field, return before calling the API) before
      calling `api.create(...)` or `api.update(id, changes)`; on success it unshifts/updates
      the row and shows a toast ("Profile created" / "Profile updated"); on API rejection
      (covers a race where the server's own validation in scope item 1/2 rejects a payload
      the client-side check let through) it shows an error toast and leaves the table
      unchanged. `createDefaultApi()` backs onto the existing `/hires` endpoints
      (`GET /hires`, `POST /hires`, `PATCH /hires/:id`) — the prototype's standalone
      `localStorage` persistence was only there so the HTML file could be previewed in
      isolation; this app already has a real, persistent `/hires` store and routes
      (`src/hires/store.js`, `src/hires/routes.js`) backing the sibling
      `public/hire-profile.html` detail page, so this screen reads/writes through that same
      API instead of localStorage.
    files:
      - public/hire-profiles.html
      - public/css/hire-profiles.css
      - public/js/hire-profiles.js
    rationale: |
      This is the only interactive screen in the prototype (the "Required-Field
      Validation", "Rehire — Standalone Profiles", and "Acceptance Criteria Checklist"
      screens are static reference/documentation screens for the reviewer, explicitly
      labelled "non-interactive reference" in the prototype's own screen comments — they
      are not additional app surfaces to build). The out-of-scope exclusions (no
      active/deactivated control, no Run-start/cancel simulation) are the prototype's own
      explicit design decision, called out in its "no-controls-note" copy and the file's
      top-level HTML comment, and match this story's stated scope boundary exactly.
  - description: |
      Backend tests for the new validation (store layer + route layer), new file so the
      run-triggering story's existing `test/hires-store.test.js`/`test/hires.test.js`
      (which already cover a different set of ACs under those same AC numbers for a
      different story) aren't repurposed or renumbered.
    files:
      - test/hires-validation.test.js
    rationale: |
      Keeps this story's test assertions isolated and traceable to its own ACs, consistent
      with how this repo already splits guest-profile tests by concern (
      `test/guests-store.test.js`, `test/guests-role-enforcement.test.js`,
      `test/guests-directory-filter.test.js`, etc.) rather than appending unrelated
      concerns into one growing file.
  - description: |
      Frontend jsdom tests for the new list + create/edit modal page.
    files:
      - test/hire-profiles.test.js
    rationale: |
      Mirrors the existing `/** @jest-environment jsdom */` + `fs.readFileSync(HTML_PATH)` +
      `initXApp(document, data, api)` pattern used by `test/guest-profiles.test.js` and
      `test/hire-profile.test.js`.
tests:
  - |
    // test/hires-validation.test.js — AC1 (store): all required fields present persists
    test('AC1: createHire persists a profile when name, department, role, and start date are present', async () => {
      const hire = await createHire({ name: 'Jamie Lee', department: 'Engineering', role: 'QA Engineer', startDate: '2026-12-01' });
      expect(getHire(hire.id)).toMatchObject({ name: 'Jamie Lee', department: 'Engineering', role: 'QA Engineer', startDate: '2026-12-01' });
    });
  - |
    // test/hires-validation.test.js — AC3/AC4 (store), one per required field
    test.each([
      ['name', { department: 'Sales', role: 'AE', startDate: '2026-10-05' }, 'Full name is required.'],
      ['department', { name: 'A', role: 'AE', startDate: '2026-10-05' }, 'Department is required.'],
      ['role', { name: 'A', department: 'Sales', startDate: '2026-10-05' }, 'Role is required.'],
      ['startDate', { name: 'A', department: 'Sales', role: 'AE' }, 'Start date is required.'],
    ])('AC3/AC4: createHire rejects a submission missing %s and names that field', async (field, payload, message) => {
      await expect(createHire(payload)).rejects.toMatchObject({ statusCode: 400, fields: { [field]: message } });
    });
  - |
    // test/hires-validation.test.js — AC5 (store): optional fields blank still succeeds
    test('AC5: createHire succeeds with email and phone left blank when every required field is present', async () => {
      const hire = await createHire({ name: 'Robin Tran', department: 'Finance', role: 'Analyst', startDate: '2026-12-10' });
      expect(hire.id).toBeTruthy();
      expect(getHire(hire.id).name).toBe('Robin Tran');
    });
  - |
    // test/hires-validation.test.js — AC2 (store): edit persists contact/dept/role/start date/hire stage
    test('AC2: updateHire persists edits to contact info, department/role, start date, and hire stage', async () => {
      const hire = await createHire({ name: 'A', department: 'Engineering', role: 'Engineer II', startDate: '2026-10-05' });
      const updated = await updateHire(hire.id, { email: 'a@x.com', phone: '555-1212', department: 'Product', role: 'PM', startDate: '2026-11-01', hireStage: 'offer_accepted' });
      expect(updated).toMatchObject({ email: 'a@x.com', phone: '555-1212', department: 'Product', role: 'PM', startDate: '2026-11-01', hireStage: 'offer_accepted' });
    });
  - |
    // test/hires-validation.test.js — AC3/AC4 (store): clearing a required field on edit is blocked and the stored record is untouched
    test('AC3/AC4: updateHire rejects clearing department and leaves the stored profile unchanged', async () => {
      const hire = await createHire({ name: 'A', department: 'Engineering', role: 'Engineer II', startDate: '2026-10-05' });
      await expect(updateHire(hire.id, { department: '' })).rejects.toMatchObject({ fields: { department: 'Department is required.' } });
      expect(getHire(hire.id).department).toBe('Engineering');
    });
  - |
    // test/hires-validation.test.js — AC6 (store): a rehire is a standalone record
    test('AC6: a new profile created for a person with a prior profile has its own id and no link field', async () => {
      const prior = await createHire({ name: 'Sam Okafor', department: 'Sales', role: 'Account Executive', startDate: '2025-03-10', hireStage: 'completed' });
      const rehire = await createHire({ name: 'Sam Okafor', department: 'Product', role: 'Senior Product Manager', startDate: '2026-11-16', hireStage: 'draft' });
      expect(rehire.id).not.toBe(prior.id);
      expect(rehire).not.toHaveProperty('priorProfileId');
      expect(rehire).not.toHaveProperty('linkedProfileId');
    });
  - |
    // test/hires-validation.test.js — AC3/AC4 (route): the HTTP layer returns 400 validation_error
    test('POST /hires with a missing required field returns 400 validation_error naming the field', async () => {
      const res = await request(app).post('/hires').send({ department: 'Sales', role: 'AE', startDate: '2026-10-05' });
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ error: 'validation_error', fields: { name: 'Full name is required.' } });
    });
  - |
    // test/hire-profiles.test.js — AC1 (UI): create with all required fields adds the row and calls the API
    test('AC1: creating a profile with all required fields adds it to the table', async () => {
      const created = { id: 'hire_900', name: 'Jamie Lee', email: '', phone: '', department: 'Engineering', role: 'QA Engineer', startDate: '2026-12-01', hireStage: 'draft' };
      const api = { create: jest.fn().mockResolvedValue(created) };
      const { initHireProfilesApp } = require('../public/js/hire-profiles');
      initHireProfilesApp(document, [], api);
      document.getElementById('new-profile-btn').click();
      document.getElementById('field-name').value = 'Jamie Lee';
      document.getElementById('field-department').value = 'Engineering';
      document.getElementById('field-role').value = 'QA Engineer';
      document.getElementById('field-start-date').value = '2026-12-01';
      document.getElementById('profile-form').dispatchEvent(new Event('submit', { cancelable: true }));
      await Promise.resolve(); await Promise.resolve();
      expect(api.create).toHaveBeenCalledWith(expect.objectContaining({ name: 'Jamie Lee', department: 'Engineering', role: 'QA Engineer', startDate: '2026-12-01' }));
      expect(document.getElementById('profile-tbody').textContent).toContain('Jamie Lee');
      expect(document.getElementById('modal-wrap').hidden).toBe(true);
    });
  - |
    // test/hire-profiles.test.js — AC2 (UI): edit persists contact/dept/role/start date/hire stage and updates the row in place
    test('AC2: editing a profile updates the row in place', async () => {
      const existing = { id: 'hire_3112', name: 'Devon Ruiz', email: 'devon.ruiz@example.com', phone: '', department: 'Engineering', role: 'IT Support Specialist', startDate: '2026-10-20', hireStage: 'offer_accepted' };
      const updated = { ...existing, phone: '555-1212', department: 'Product', role: 'Product Analyst', startDate: '2026-11-01', hireStage: 'onboarding_in_progress' };
      const api = { update: jest.fn().mockResolvedValue(updated) };
      const { initHireProfilesApp } = require('../public/js/hire-profiles');
      initHireProfilesApp(document, [existing], api);
      document.querySelector('[data-edit-id="hire_3112"]').click();
      document.getElementById('field-phone').value = '555-1212';
      document.getElementById('field-department').value = 'Product';
      document.getElementById('field-role').value = 'Product Analyst';
      document.getElementById('field-start-date').value = '2026-11-01';
      document.getElementById('field-hire-stage').value = 'onboarding_in_progress';
      document.getElementById('profile-form').dispatchEvent(new Event('submit', { cancelable: true }));
      await Promise.resolve(); await Promise.resolve();
      expect(api.update).toHaveBeenCalledWith('hire_3112', expect.objectContaining({ phone: '555-1212', department: 'Product', role: 'Product Analyst', startDate: '2026-11-01', hireStage: 'onboarding_in_progress' }));
      expect(document.getElementById('profile-tbody').textContent).toContain('Product Analyst');
    });
  - |
    // test/hire-profiles.test.js — AC3/AC4 (UI): each required field blocks save and names itself
    test.each([
      ['field-name', 'error-name', 'Full name is required.'],
      ['field-department', 'error-department', 'Department is required.'],
      ['field-role', 'error-role', 'Role is required.'],
      ['field-start-date', 'error-start-date', 'Start date is required.'],
    ])('AC3/AC4: leaving %s blank blocks the save and shows its own error', async (fieldId, errorId, message) => {
      const api = { create: jest.fn() };
      const { initHireProfilesApp } = require('../public/js/hire-profiles');
      initHireProfilesApp(document, [], api);
      document.getElementById('new-profile-btn').click();
      document.getElementById('field-name').value = 'Jamie Lee';
      document.getElementById('field-department').value = 'Engineering';
      document.getElementById('field-role').value = 'QA Engineer';
      document.getElementById('field-start-date').value = '2026-12-01';
      document.getElementById(fieldId).value = '';
      document.getElementById('profile-form').dispatchEvent(new Event('submit', { cancelable: true }));
      expect(document.getElementById(errorId).hidden).toBe(false);
      expect(document.getElementById(errorId).textContent).toContain(message);
      expect(api.create).not.toHaveBeenCalled();
      expect(document.getElementById('modal-wrap').hidden).toBe(false);
    });
  - |
    // test/hire-profiles.test.js — AC5 (UI): blank email/phone still succeeds
    test('AC5: leaving email and phone blank with every required field present creates successfully', async () => {
      const created = { id: 'hire_901', name: 'Robin Tran', email: '', phone: '', department: 'Finance', role: 'Analyst', startDate: '2026-12-10', hireStage: 'draft' };
      const api = { create: jest.fn().mockResolvedValue(created) };
      const { initHireProfilesApp } = require('../public/js/hire-profiles');
      initHireProfilesApp(document, [], api);
      document.getElementById('new-profile-btn').click();
      document.getElementById('field-name').value = 'Robin Tran';
      document.getElementById('field-department').value = 'Finance';
      document.getElementById('field-role').value = 'Analyst';
      document.getElementById('field-start-date').value = '2026-12-10';
      document.getElementById('profile-form').dispatchEvent(new Event('submit', { cancelable: true }));
      await Promise.resolve(); await Promise.resolve();
      expect(api.create).toHaveBeenCalled();
      expect(document.getElementById('toast-message').textContent).toBe('Profile created');
    });
  - |
    // test/hire-profiles.test.js — AC6 (UI): rehire shortcut saves a standalone profile
    test('AC6: "Create rehire profile" pre-fills name/department/role, resets start date and stage, and saves a standalone record', async () => {
      const prior = { id: 'hire_3101', name: 'Sam Okafor', email: 'sam.okafor@example.com', phone: '', department: 'Sales', role: 'Account Executive', startDate: '2025-03-10', hireStage: 'completed' };
      const created = { id: 'hire_3140', name: 'Sam Okafor', email: '', phone: '', department: 'Product', role: 'Senior Product Manager', startDate: '2026-11-16', hireStage: 'draft' };
      const api = { create: jest.fn().mockResolvedValue(created) };
      const { initHireProfilesApp } = require('../public/js/hire-profiles');
      initHireProfilesApp(document, [prior], api);
      document.querySelector('[data-rehire-id="hire_3101"]').click();
      expect(document.getElementById('field-name').value).toBe('Sam Okafor');
      expect(document.getElementById('field-start-date').value).toBe('');
      expect(document.getElementById('field-hire-stage').value).toBe('draft');
      document.getElementById('field-department').value = 'Product';
      document.getElementById('field-role').value = 'Senior Product Manager';
      document.getElementById('field-start-date').value = '2026-11-16';
      document.getElementById('profile-form').dispatchEvent(new Event('submit', { cancelable: true }));
      await Promise.resolve(); await Promise.resolve();
      const [sentPayload] = api.create.mock.calls[0];
      expect(sentPayload).not.toHaveProperty('priorProfileId');
      const rows = document.getElementById('profile-tbody').textContent;
      expect(rows).toContain('hire_3101');
      expect(rows).toContain('hire_3140');
    });
assumptions_or_open_questions:
  - |
    The prototype's first screen persists to `localStorage` so the HTML file can be
    previewed standalone, but this app already has a real, persistent `/hires` Express API
    (`src/hires/store.js` + `src/hires/routes.js`) backing the sibling single-profile
    detail page. This plan treats that as the real persistence layer for the new screen and
    does not add a second, parallel localStorage store — flagging this adaptation since the
    prototype itself doesn't call out the backend explicitly.
  - |
    AC3/AC4/AC5 only say "a new-hire profile submission" without saying whether the
    required-field rule applies to edits too. The prototype's own "Required-field
    validation" reference screen states explicitly "Applies identically whether creating or
    editing an existing one," so this plan enforces the same validation on `updateHire` as
    on `createHire` (e.g., clearing Department on an existing profile is blocked the same
    way). Flagging in case the reviewer intended edits to be exempt.
  - |
    Department is a fixed 5-option `<select>` (Engineering, Product, Sales, People Ops,
    Finance) per the prototype, with no "add a department" affordance — carried through
    as-is; no backend department-management endpoint exists or is added here.
  - |
    `GET /hires` returns every hire regardless of `profileStatus` (active/deactivated) — a
    field that exists on the backend hire record for a separate story. This screen's table
    does not filter or display that field at all, per the prototype's own
    "no-controls-note" ("an active/deactivated status toggle... a separate story"), so a
    deactivated profile (from that other story) would still appear in this list unmodified.
  - |
    Only the prototype's first screen ("New-Hire Profiles") is built as real, interactive
    UI. Its other three screens ("Required-Field Validation", "Rehire — Standalone
    Profiles", "Acceptance Criteria Checklist") are explicitly labelled
    "non-interactive reference" in the prototype's own comments and exist only to document
    the rule for a human reviewer walking through the prototype — they are not additional
    app surfaces for this plan to implement.
package_dependencies: []
notes: |
  Research notes:
  - `src/hires/store.js` and `src/hires/routes.js` already exist and are fully exercised by
    `test/hires-store.test.js`/`test/hires.test.js`, but those tests belong to a different,
    already-merged story (run-triggering/cancelling on hire-stage and role/department
    changes — explicitly out of scope here per this story's own description). Neither
    `createHire` nor `updateHire` currently validates anything, so this plan adds
    validation without touching that story's existing behavior or its tests.
  - `src/guests/store.js` (`GuestValidationError`, `assertValid`) and `src/guests/routes.js`
    are the closest existing precedent for exactly this shape of validation in this repo,
    down to the `{ error: 'validation_error', fields }` response shape, and this plan
    reuses that shape verbatim for hires.
  - The approved prototype's first screen is the only new UI surface; its other three
    screens are reviewer-facing reference material (see
    `assumptions_or_open_questions`).

  ```mermaid
  flowchart TD
    HTML["public/hire-profiles.html (new)"] --> UI["public/js/hire-profiles.js (new)"]
    UI -->|"fetch GET/POST/PATCH"| ROUTES["src/hires/routes.js (modified)"]
    ROUTES --> STORE["src/hires/store.js (modified)"]
    STORE --> ENGINE["src/onboarding/engineClient.js (existing, untouched)"]
    TEST1["test/hire-profiles.test.js (new)"] --> UI
    TEST2["test/hires-validation.test.js (new)"] --> ROUTES
    TEST2 --> STORE

    classDef touched fill:#f96,color:#000
    class HTML,UI,ROUTES,STORE,TEST1,TEST2 touched
  ```
review_focus: |
  In scope: required-field validation (name/department/role/startDate) added to
  `createHire`/`updateHire` and surfaced as `400 { error: 'validation_error', fields }`;
  and a brand-new list+create/edit-modal page (`public/hire-profiles.html` /
  `hire-profiles.js` / `hire-profiles.css`) built from the prototype's first screen only.
  Out of scope, deliberately: Run-start/cancel side effects of a hire-stage or
  role/department change, and active/deactivated status — neither is rendered or
  controlled on this new screen, even though the underlying `/hires` store still has that
  behavior for the separate stories that own it. The riskiest area is `updateHire`'s
  validation placement relative to its existing run-trigger/cancel branches — validation
  must run against the *merged* next values and reject before any `engineClient` call or
  `Object.assign`, otherwise a blocked edit could still cancel/restart a Run or
  partially mutate the stored hire. Also worth checking: the rehire flow never sends or
  stores any field linking the new profile back to the prior one (AC6) — this was verified
  by reading the prototype's own script, which creates the new record from a fresh object
  literal with no prior-id reference.
