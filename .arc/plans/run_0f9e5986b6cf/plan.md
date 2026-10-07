summary: |
  Implements the create-defect flow for TEST-M1-STORY-194: a Reporter can log a new defect
  through a "Log a defect" form and have it persist exactly what they typed, starting in
  "New" status. This follows the codebase's per-domain pattern (src/<domain>/store.js +
  routes.js, public/<domain>.html + public/js/<domain>.js, test/<domain>*.test.js) already
  used by employees/hires/guests/rooms. The approved prototype at
  .arc/designs/TEST-M1-STORY-194-design.html is a single-page app with three screens
  (Defects List, Log a Defect, Defect Details) toggled by client-side JS, not three separate
  pages or a modal — that screen-switching shape is carried straight into
  public/defects.html + public/js/defects.js, minus the prototype's reviewer-bar and
  "demo-note" tooling (explicitly reviewer-only, not shipped UI). Only Title is required to
  submit; Description, Steps to reproduce, Environment and Severity are optional, per the
  design's own "Pending product decision" callout addressing the work item's open scope
  question. No authentication/role system is introduced — the design hardcodes "Reporting as
  Jordan Lee" with no role selector, so the Reporter identity is client-supplied the same way
  public/js/expenses.js already sends a client-supplied `loggedBy`.
scope:
  - description: |
      Add `src/defects/store.js`: an in-memory Map-backed store with `createDefect(data)`,
      `getDefect(id)`, `listDefects()`, and a `DefectValidationError` class, mirroring
      `src/hires/store.js`'s `HireValidationError` pattern.

      `createDefect` validates only `title` (non-empty after trim); every other field is
      optional and is persisted exactly as entered (trimmed of outer whitespace only),
      defaulting to `''` when omitted — never a placeholder or guessed value. `status` is
      always forced to `'New'` and `id`/`reportedAt` are always server-generated, so a
      caller cannot override them by including `status`, `id`, or `reportedAt` in the
      request body:

      ```js
      class DefectValidationError extends Error {
        constructor(message, fields = {}) {
          super(message);
          this.statusCode = 400;
          this.fields = fields;
        }
      }

      function createDefect(data) {
        const title = (data.title || '').trim();
        if (!title) {
          throw new DefectValidationError('validation_error', { title: 'Add a title before submitting.' });
        }
        const defect = {
          id: `DEF-${nextDefectNumber++}`,
          title,
          description: (data.description || '').trim(),
          steps: (data.steps || '').trim(),
          environment: (data.environment || '').trim(),
          severity: data.severity || '',
          status: 'New',
          reportedBy: data.reportedBy || '',
          reportedAt: new Date().toISOString().slice(0, 10),
        };
        defects.set(defect.id, defect);
        return defect;
      }
      ```
    files:
      - src/defects/store.js
    rationale: |
      Matches the existing store-module shape (`src/employees/store.js`, `src/hires/store.js`)
      so the new domain fits the codebase's conventions, and isolates the one piece of real
      business logic (what counts as "no details entered") so it's unit-testable without HTTP.
  - description: |
      Add `src/defects/routes.js`: an Express router with `GET /`, `POST /`, `GET /:id`,
      mirroring `src/hires/routes.js`'s try/catch + `DefectValidationError` → 400 mapping:

      ```js
      router.post('/', (req, res, next) => {
        try {
          res.status(201).json(createDefect(req.body));
        } catch (err) {
          if (err instanceof DefectValidationError) {
            return res.status(400).json({ error: 'validation_error', fields: err.fields });
          }
          next(err);
        }
      });
      ```

      No role/permission middleware is added (unlike `enforceOnboardingRole` on
      employees/hires) — neither the acceptance criteria nor the design describe any access
      restriction for logging a defect.
    files:
      - src/defects/routes.js
    rationale: |
      Keeps the HTTP layer thin and consistent with every other domain's routes.js; `GET /`
      and `GET /:id` exist so the List and Details screens have something to call, even
      though this story's ACs are scoped to creation.
  - description: |
      Mount the new router in `src/server.js`, next to the other domain routers:

      ```js
      const defectsRouter = require('./defects/routes');
      ...
      app.use('/defects', defectsRouter);
      ```
    files:
      - src/server.js
    rationale: |
      Without this, `public/js/defects.js`'s fetch calls to `/defects` have nothing to hit.
  - description: |
      Add `public/defects.html`: a single page with three `.screen` sections (Defects List,
      Log a Defect, Defect Details) toggled by JS, taken directly from the approved prototype
      (`.arc/designs/TEST-M1-STORY-194-design.html`), reusing shared components already in
      `design-system/prototype-utils.css` (`.app-topbar`, `.page`, `.card`, `.btn`, `.field`,
      `.input`, `.label`) and bringing in only the domain-specific markup/classes the
      prototype introduces in its third `<style>` block (`.status-chip`, `.defect-row`,
      `.empty-state`, `.form-banner`, `.field-error`, `.pending-callout`, `.detail-grid`,
      `.detail-field`). Concrete elements carried over 1:1 (ids included, so tests can target
      them directly):
        - List screen: page header "Defects" + "Log a defect" button (`#go-to-form`), a card
          with `#defect-list` and an `#defect-list-empty` empty state with its own
          `#go-to-form-from-empty` button.
        - Form screen: `#defect-form` with `#field-title` (required, `aria-describedby`
          pointing at `#title-error`), `#field-description`, `#field-steps`,
          `#field-environment`, `#field-severity` (select: Not set/Low/Medium/High/Critical),
          the "Pending product decision" callout about Severity, a `#form-error-banner`
          (`role="alert"`, hidden by default), and `#submit-defect` / `#cancel-defect`
          buttons.
        - Details screen: `#detail-id`, `#detail-title`, `#detail-status-chip`,
          `#detail-meta`, and a `dl.detail-grid` with `#detail-description`, `#detail-steps`,
          `#detail-environment`, `#detail-severity`, plus `#back-to-list` /
          `#log-another` buttons.
      The prototype's reviewer bar (`#review-bar`, prev/next screen controls) and
      "demo-note" preview-empty-list/preview-full-list tooling are reviewer-only scaffolding
      per the prototype's own comments and are NOT carried into this file.
    files:
      - public/defects.html
    rationale: |
      This is the only recorded design for this story; reproducing its concrete ids/classes
      (rather than re-deriving new ones) keeps the shipped page visually and structurally
      identical to what was approved, and lets the UI tests below assert against the same
      ids the design already demonstrates working end-to-end.
  - description: |
      Add `public/css/defects.css` with the domain-specific rules from the prototype's third
      `<style>` block (status chip, defect row, empty state, form banner/field error,
      pending callout, detail grid) — NOT the reviewer-bar/demo-note rules, which are
      prototype-only. Follows the same "app shell lives in prototype-utils.css" header
      convention as `public/css/employees.css`.
    files:
      - public/css/defects.css
    rationale: |
      Keeps domain-specific styling out of the shared design-system file, matching how every
      other domain (employees, guests, rooms) layers its own CSS on top of the shared tokens
      and utility classes.
  - description: |
      Add `public/js/defects.js` exporting `initDefectsApp(doc, initialDefects, api)` and
      `createDefaultApi()`, following the `initEmployeesListApp`/`createDefaultApi` shape in
      `public/js/employees.js`:
        - List rendering: `.defect-row` per defect with title button, `DEF-id · Reported by
          X on Y` meta line (`reportedAt` shown as the raw `YYYY-MM-DD` the server returns,
          not reformatted — the prototype doesn't reformat it either), and a status chip;
          empty state shown when the list is empty.
        - Form submit handler: client-side validates `title.trim()` first — if blank, adds
          `.has-error` to the title input, unhides `#title-error` and `#form-error-banner`,
          focuses the title field, and returns WITHOUT calling `api.create` (AC3). If any
          field has content, it disables/relabels the submit button, awaits
          `api.create({ title, description, steps, environment, severity, reportedBy:
          'Jordan Lee' })`, prepends the result to the in-memory list, re-renders the List
          screen's data, and switches to the Details screen for the new defect (AC1).
        - Details rendering: `fieldValueHTML(value)` renders the escaped value, or
          `<em>Not provided</em>` (text content `"Not provided"`) when the value is falsy —
          this is what makes AC2 observable: blank optional fields never get a fabricated
          value, they render as "Not provided" the same way whether the defect was just
          created or came from the initial fixture list.
        - `createDefaultApi()`'s `create(payload)` does `fetch('/defects', { method: 'POST',
          headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload) })`
          and rejects with `{ status, ...body }` on a non-2xx response, matching
          `employees.js`'s `createDefaultApi` error shape.
      Reuses `escapeHtml` from `public/js/utils.js` (same dual CJS/`window.EmployeeUtils`
      export already used by `employees.js`); does not need `trapTab`/focus-trap helpers
      since this design uses full-screen views, not a modal.
    files:
      - public/js/defects.js
    rationale: |
      Keeping `initDefectsApp` as a pure function of `(doc, initialDefects, api)` — rather
      than reaching for `window`/`fetch` directly — is what makes it unit-testable under
      jsdom with a fake `api`, matching every other UI test file in this repo
      (`employees-list-ui.test.js`, etc.).
  - description: |
      Add `test/defects.test.js` (supertest, backend): failing-first tests for AC1–AC3 at the
      HTTP layer (see `tests` below for the literal assertions).
    files:
      - test/defects.test.js
    rationale: |
      Backend validation must be independently correct and tested without depending on the
      UI, since a client could call `POST /defects` directly.
  - description: |
      Add `test/defects-ui.test.js` (jsdom, frontend): failing-first tests for AC1–AC3 at the
      UI layer against `public/defects.html` + `public/js/defects.js` (see `tests` below for
      the literal assertions), following the `employees-list-ui.test.js` pattern of loading
      the real HTML into `document.documentElement.innerHTML` and requiring the real JS module
      fresh per test via `jest.resetModules()`.
    files:
      - test/defects-ui.test.js
    rationale: |
      The acceptance criteria describe a Reporter's end-to-end interaction with the form, not
      just an API contract — client-side validation (AC3) and "exactly what was entered"
      rendering (AC2) only exist in the UI layer and need their own coverage.
tests:
  - |
    AC1 (backend), test/defects.test.js:
    test('creating a defect with any details sets status to New', async () => {
      const res = await request(app).post('/defects').send({ title: 'Checkout button unresponsive on Safari' });
      expect(res.status).toBe(201);
      expect(res.body.status).toBe('New');
    });
  - |
    AC2 (backend), test/defects.test.js — persisted record matches exactly what was sent,
    blank/omitted optional fields stay blank, and client-supplied status/id/reportedAt are
    ignored:
    test('the persisted defect contains exactly what was entered', async () => {
      const payload = { title: 'Bug', description: 'Desc', steps: 'Steps', environment: 'Env', severity: 'High', reportedBy: 'Jordan Lee' };
      const res = await request(app).post('/defects').send(payload);
      expect(res.body).toMatchObject(payload);

      const minimal = await request(app).post('/defects').send({ title: 'Minimal' });
      expect(minimal.body).toMatchObject({ title: 'Minimal', description: '', steps: '', environment: '', severity: '' });

      const spoofed = await request(app).post('/defects').send({ title: 'X', status: 'Resolved', id: 'DEF-9999' });
      expect(spoofed.body.status).toBe('New');
      expect(spoofed.body.id).not.toBe('DEF-9999');
    });
  - |
    AC3 (backend), test/defects.test.js:
    test('submitting with no details is rejected and creates nothing', async () => {
      const before = listDefects().length;
      const res = await request(app).post('/defects').send({});
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'validation_error', fields: { title: 'Add a title before submitting.' } });
      expect(listDefects().length).toBe(before);
    });
  - |
    AC1 (UI), test/defects-ui.test.js:
    test('submitting the form with any details creates a defect with status New', async () => {
      const created = { id: 'DEF-1043', title: 'Checkout button unresponsive', description: '', steps: '', environment: '', severity: '', status: 'New', reportedBy: 'Jordan Lee', reportedAt: '2026-10-07' };
      const api = { create: jest.fn().mockResolvedValue(created) };
      initDefectsApp(document, [], api);
      document.getElementById('go-to-form').click();
      document.getElementById('field-title').value = 'Checkout button unresponsive';
      document.getElementById('defect-form').dispatchEvent(new Event('submit', { cancelable: true }));
      await Promise.resolve(); await Promise.resolve();
      expect(api.create).toHaveBeenCalled();
      expect(document.getElementById('detail-status-chip').textContent).toContain('New');
    });
  - |
    AC2 (UI), test/defects-ui.test.js — exactly what was entered is shown, blanks read "Not provided":
    test('Details screen shows exactly what was entered; blank optional fields read Not provided', async () => {
      const created = { id: 'DEF-1044', title: 'Bug', description: 'Desc here', steps: '', environment: '', severity: '', status: 'New', reportedBy: 'Jordan Lee', reportedAt: '2026-10-07' };
      const api = { create: jest.fn().mockResolvedValue(created) };
      initDefectsApp(document, [], api);
      document.getElementById('go-to-form').click();
      document.getElementById('field-title').value = 'Bug';
      document.getElementById('field-description').value = 'Desc here';
      document.getElementById('defect-form').dispatchEvent(new Event('submit', { cancelable: true }));
      await Promise.resolve(); await Promise.resolve();
      expect(document.getElementById('detail-description').textContent).toBe('Desc here');
      expect(document.getElementById('detail-steps').textContent).toBe('Not provided');
    });
  - |
    AC3 (UI), test/defects-ui.test.js:
    test('submitting a completely blank form is rejected client-side and creates nothing', () => {
      const api = { create: jest.fn() };
      initDefectsApp(document, [], api);
      document.getElementById('go-to-form').click();
      document.getElementById('defect-form').dispatchEvent(new Event('submit', { cancelable: true }));
      expect(api.create).not.toHaveBeenCalled();
      expect(document.getElementById('form-error-banner').hidden).toBe(false);
      expect(document.getElementById('title-error').hidden).toBe(false);
      expect(document.activeElement).toBe(document.getElementById('field-title'));
    });
assumptions_or_open_questions:
  - |
    The work item leaves exact required/optional fields (and whether Severity is captured at
    all) pending the product owner. The approved design already resolves this for now: only
    Title is required; Description, Steps to reproduce, Environment and Severity are optional,
    with a "Pending product decision" callout on the form. This plan implements that design
    as-is; if the PO later changes which fields are required, the validation in
    `src/defects/store.js` and the form markup will need a follow-up change.
  - |
    "No details entered" (AC3) is satisfied purely by the Title-required rule: a completely
    blank form has a blank Title and is rejected; a form with only Title filled in is accepted
    (AC1), since per the design, Title alone counts as "details entered."
  - |
    `reportedBy` is client-supplied (hardcoded `'Jordan Lee'` in the UI, matching the design's
    static "Reporting as Jordan Lee" text) rather than coming from a real authentication
    system — there isn't one in this codebase yet. This mirrors the existing client-supplied
    `loggedBy` field in `public/js/expenses.js`. No role/permission check gates defect
    creation, since neither the ACs nor the design describe one.
  - |
    Defect ids use the design's `DEF-####` display format but are plain in-memory sequence
    numbers with no real persistence (a `Map`, like every other domain store in this
    codebase) — restarting the server resets all logged defects.
  - |
    The prototype's reviewer bar and "Preview: empty/full list" demo tooling are explicitly
    reviewer-only per the prototype's own comments and are not carried into the shipped
    `public/defects.html`.
package_dependencies: []
notes: |
  Research: this codebase has no existing `defects` domain — the closest structural analogs
  are `src/hires/{store,routes}.js` (validation-error-to-400 pattern, via `HireValidationError`)
  and `public/js/employees.js` + `test/employees-list-ui.test.js` (the `init<X>App(doc,
  initialData, api, ...)` UI-testing shape). Shared visual primitives (`.btn`, `.card`,
  `.modal-*`, `.input`, `.app-topbar`, `.page`) already live in
  `design-system/prototype-utils.css` + `tokens.css`; only the defect-specific classes the
  prototype introduces in its own `<style>` block are new and go in `public/css/defects.css`.

  ```mermaid
  flowchart TD
    server[src/server.js]
    routes[src/defects/routes.js]
    store[src/defects/store.js]
    html[public/defects.html]
    js[public/js/defects.js]
    utils[public/js/utils.js]

    server -->|mounts /defects| routes
    routes -->|createDefect / getDefect / listDefects| store
    html -->|loads| js
    js -->|escapeHtml| utils
    js -->|POST /defects, GET /defects| routes

    classDef touched fill:#f96,color:#000
    class server,routes,store,html,js touched
  ```
review_focus: |
  In scope: creating a defect via the form/API (AC1–AC3) and just enough list/detail
  rendering to observe the created record's status and field values. Out of scope
  (deliberately not built here): editing a defect, any status transition beyond the initial
  "New", triage/assignment, and any authentication or role-based access control — the design
  itself has no role selector or permission-denied state for this story, unlike
  employees/hires.

  Riskiest area: the exact semantics of "exactly what was entered" (AC2) — `store.js` trims
  only outer whitespace (so multi-line "Steps to reproduce" content is preserved) and
  defaults omitted fields to `''`, never `undefined` or a placeholder; the UI's
  `fieldValueHTML` helper is what turns `''` into the visible "Not provided" text. A reviewer
  should check that no fallback/default text leaks into the stored record itself, only into
  its rendering.

  Deliberate, non-obvious decisions: (1) `reportedBy` is trusted client input with no auth
  behind it, matching the existing `loggedBy` pattern in `public/js/expenses.js` — this is not
  a security gap introduced by this plan, it's the codebase's existing convention for
  "who did this" fields; (2) Severity is included as optional per the approved design despite
  the work item flagging it as a pending product decision — see
  `assumptions_or_open_questions`.
