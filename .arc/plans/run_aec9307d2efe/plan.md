summary: |
  Adds time-off request submission and cancellation on top of the existing `src/leave`
  domain (leave types + per-employee balances, already shipped). An onboarded employee can
  submit a request for a leave type and a whole-day date range (created as `pending`); a
  pending request can be cancelled with no balance impact, and an approved request that
  consumed balance can be cancelled to restore it; the submitter or an HR/Manager can view
  the list of requests with leave type, date range, and status. The story carries two
  explicit, still-unresolved product blockers (who is the submitting actor; whether an
  over-balance request is blocked or allowed). Following the precedent already shipped in
  `public/leave-balances.html` (an open-decision story behind a narrowest-safe-default plus
  an in-page decision banner), this plan resolves ONLY the actor blocker, and only to the
  minimum needed to make the four ACs implementable: employee self-service only, no
  HR/Manager-on-behalf submission. It does NOT resolve or implement anything for the
  over-balance blocker, since no AC exercises that path. While verifying the design's
  balance-display elements against the real code, I found that `GET /leave/balances/:id`
  and `GET /employees` are both gated to HR/Manager only today (`enforceOnboardingRole`) —
  with no self-view path for an ordinary employee. Since the actor blocker is resolved to
  "employee self-service," the design's own balance-grid and `#balance-hint` can't render
  for that employee without a narrow, additive self-access path on the balance route, so
  this plan adds one (see scope item 3/4) rather than silently dropping those design
  elements or silently widening who the existing admin routes trust.

scope:
  - description: |
      Add the time-off request domain store: `src/leave/requestsStore.js` (new file).
      Exports `TimeOffRequestError`, `createRequest`, `getRequest`, `listRequests`,
      `approveRequest`, `cancelRequest`.

      ```js
      function createRequest({ employeeId, leaveTypeId, start, end } = {}) { /* ... */ }
      function listRequests(employeeId) { /* employeeId omitted => every request */ }
      function approveRequest(id) { /* pending -> approved, consumes balance */ }
      function cancelRequest(id) { /* pending|approved -> cancelled, restores if consumed */ }
      ```

      `createRequest` validates: the employee is onboarded (`getEmployee` from
      `../employees/store`, confirmed exported there), `leaveTypeId` is one of
      `LEAVE_TYPES` from `./store`, and `start`/`end` are `YYYY-MM-DD` with `end >= start`
      (whole-day only, no time-of-day). Days are computed inclusively:
      `Math.round((end - start) / 86400000) + 1` (same formula the design itself uses at
      its `daysBetween()`, line 761-765). A created record is `{ id, employeeId,
      leaveTypeId, start, end, days, status: 'pending', consumedDays: 0, createdAt }`.

      `approveRequest(id)` is a domain operation with NO route in this plan — it exists
      only so AC3's "approved request that consumed balance" precondition can be
      constructed (by tests today, and by a future approve/deny story's route tomorrow).
      It requires the request to be `pending`, requires a balance record to exist for the
      employee, calls the new `consumeBalance` (scope item 2), and sets
      `status: 'approved'`, `consumedDays: <days>`.

      `cancelRequest(id)` rejects an already-`cancelled` request (409). If the request is
      `approved` with `consumedDays > 0` it calls `restoreBalance` before flipping
      `status: 'cancelled'` and zeroing `consumedDays`; a `pending` cancellation only
      flips status — no balance call at all, which is how AC2's "balance is unchanged"
      is guaranteed by construction, not merely asserted after the fact.
    files:
      - src/leave/requestsStore.js
    rationale: |
      Mirrors the existing sibling stores' shape exactly — confirmed by reading
      `src/repairRequests/store.js` and `src/defects/auth.js`'s sibling `store.js`: a
      `Map`, a custom `*Error` class carrying `statusCode`, plain CRUD-style functions,
      `module.exports` at the bottom. Keeping it as its own file (not folded into
      `src/leave/store.js`, which already owns leave types + balances) matches how this
      codebase already separates concerns within one conceptual domain (e.g.
      `src/repairRequests` reads from `src/serviceCatalog/store` rather than merging
      into one file).

  - description: |
      Add balance-mutation helpers to `src/leave/store.js` so `requestsStore.js` never
      reaches into another module's internal map directly:

      ```js
      function consumeBalance(employeeId, leaveTypeId, amount) {
        const record = balancesByEmployee.get(employeeId);
        if (!record) return undefined;
        record.balances[leaveTypeId] -= amount;
        return record;
      }
      function restoreBalance(employeeId, leaveTypeId, amount) {
        const record = balancesByEmployee.get(employeeId);
        if (!record) return undefined;
        record.balances[leaveTypeId] += amount;
        return record;
      }
      ```

      Both are added to `module.exports` alongside the existing `getBalances`/
      `getAllBalances`.
    files:
      - src/leave/store.js
    rationale: |
      Read `src/leave/store.js` in full: `balancesByEmployee` is a private module-level
      `Map` today, only touched through `initializeBalances`/`getBalances`/
      `getAllBalances`. Consuming/restoring balance is a balance-domain responsibility,
      not a time-off-request-domain one, so it belongs here — the alternative (mutating
      the object returned by `getBalances()` from inside `requestsStore.js`) would work
      only by accident (relies on `getBalances` returning a live reference rather than a
      copy, which it currently does, but that's an implementation detail this plan
      shouldn't depend on from another module) and leaks ownership across modules.

  - description: |
      Add three auth middlewares to `src/leave/auth.js`, alongside the existing
      `requireHrRole`:

      ```js
      function identifyTimeOffSelf(req, res, next) {
        const employeeId = req.headers['x-employee-id'];
        if (!employeeId) return res.status(401).json({ error: 'unauthorized' });
        req.employeeId = employeeId;
        next();
      }
      function identifyTimeOffViewer(req, res, next) {
        const role = req.headers['x-staff-role'];
        if (role === 'hr' || role === 'manager') { req.viewScope = 'all'; return next(); }
        const employeeId = req.headers['x-employee-id'];
        if (!employeeId) return res.status(401).json({ error: 'unauthorized' });
        req.viewScope = 'self';
        req.employeeId = employeeId;
        next();
      }
      ```

      Plus a third, narrower middleware applied ONLY to the existing
      `GET /leave/balances/:employeeId` route (see scope item 4), added because that
      route is currently HR/Manager-only and the design's balance-grid/`#balance-hint`
      need the signed-in employee to read their OWN balance:

      ```js
      function identifyBalanceViewer(req, res, next) {
        const role = req.headers['x-staff-role'];
        if (role === 'hr' || role === 'manager') return next();
        const employeeId = req.headers['x-employee-id'];
        if (employeeId) {
          if (employeeId === req.params.employeeId) return next();
          return res.status(403).json({ error: 'forbidden' });
        }
        if (!role) return res.status(401).json({ error: 'unauthorized' });
        return res.status(403).json({ error: 'forbidden' });
      }
      ```
    files:
      - src/leave/auth.js
    rationale: |
      Read `src/leave/auth.js` (only `requireHrRole` exists today, `role !== 'hr'` is
      403 — Manager is NOT allowed through it) and `src/runs/auth.js`
      (`enforceOnboardingRole`, which treats both `hr` and `manager` as valid staff
      roles via `ROLE_ACTORS = { manager: 'Manager', hr: 'HR' }`). `identifyTimeOffSelf`/
      `identifyTimeOffViewer` reuse `enforceOnboardingRole`'s exact role vocabulary
      (`hr`/`manager`) rather than `requireHrRole`'s narrower one, since AC4 explicitly
      says "the submitter OR an HR/Manager." Creation is gated to an identified employee
      only (no field in the request body can create a request "for" a different
      employee) — this is where the actor blocker is resolved to its narrowest safe
      default.

      `identifyBalanceViewer` is a deliberately narrow, additive change: I read
      `test/leave.test.js`'s existing authorization tests for
      `GET /leave/balances/:employeeId` line by line before writing it, specifically
      because a naive self-access rule breaks one of them. The existing test
      `'GET /leave/balances/:employeeId as an unrecognized role is forbidden'` sends
      `x-staff-role: employee` with NO `x-employee-id` and asserts 403 (not 401). The
      shape above preserves that exact behavior (role present-but-wrong still 403, no
      role at all still 401) and ONLY adds a new allowance: a caller presenting
      `x-employee-id` equal to the `:employeeId` route param is let through regardless
      of `x-staff-role`. `POST /leave/balances/:employeeId` (set/adjust) and the bulk
      `GET /leave/balances` stay exactly as they are (`requireHrRole` /
      `enforceOnboardingRole`, respectively) — only the single-employee GET gets the new
      self path, since that's the only one this story's own design needs.

  - description: |
      Add three new routes to `src/leave/routes.js` (which already handles `/types` and
      `/balances*` for this same `/leave` mount), and swap the auth middleware on the
      one existing route the self-balance-view fix touches:

      ```js
      router.post('/requests', identifyTimeOffSelf, (req, res, next) => { /* uses req.employeeId, never body.employeeId */ });
      router.get('/requests', identifyTimeOffViewer, (req, res) => { /* viewScope 'all' | 'self' */ });
      router.post('/requests/:id/cancel', identifyTimeOffViewer, (req, res, next) => { /* 403 if self and not the owner */ });

      // existing route, middleware swapped from enforceOnboardingRole to identifyBalanceViewer:
      router.get('/balances/:employeeId', identifyBalanceViewer, (req, res) => { /* unchanged body */ });
      ```

      Every `/requests*` response is "presented" through a small local helper that adds
      the leave type's display name:

      ```js
      function presentRequest(record) {
        const type = LEAVE_TYPES.find((t) => t.id === record.leaveTypeId);
        return { ...record, leaveTypeName: type ? type.name : record.leaveTypeId };
      }
      ```

      `POST /requests` returns 201 with the presented record, or the mapped status from
      a thrown `TimeOffRequestError` (400 for a bad leave type/date range, 404 for an
      unrecognized employee). `GET /requests` returns 200 with
      `listRequests(viewScope === 'all' ? undefined : req.employeeId).map(presentRequest)`.
      `POST /requests/:id/cancel` returns 404 if the id doesn't exist, 403 if
      `viewScope === 'self'` and the caller isn't the request's own employee, otherwise
      200 with the presented, now-cancelled record (or the `TimeOffRequestError`'s
      status, e.g. 409 for an already-cancelled request).
    files:
      - src/leave/routes.js
    rationale: |
      Keeps the same single-router-per-mount shape the `/leave` mount already has
      (`/types`, `/balances`, `/balances/:employeeId` all live in this one file today,
      confirmed by reading it) rather than introducing a new top-level Express mount —
      `app.use('/leave', requestMetrics, leaveRouter)` in `src/server.js` already wraps
      whatever this router exposes with metrics, so no server.js change is needed. The
      middleware swap on `GET /balances/:employeeId` is a one-line change to an existing
      route, not a new route, and is scoped exactly to the self-access need described in
      scope item 3's rationale.

  - description: |
      Backend API tests for all four ACs, the actor safe-default, and the new
      self-balance-view path, in a new `test/time-off-requests.test.js`, following the
      exact `supertest` + helper-function shape already used in `test/leave.test.js`
      (`newEmployee()`, `asHr(req)`).

      ```js
      test('AC1: creating a request for a leave type and whole-day range returns status pending', async () => {
        const employeeId = await withBalance('Jordan Avery');
        const res = await asEmployee(request(app).post('/leave/requests'), employeeId)
          .send({ leaveTypeId: 'annual', start: '2026-12-22', end: '2026-12-26' });
        expect(res.status).toBe(201);
        expect(res.body.status).toBe('pending');
        expect(res.body.days).toBe(5);
      });
      ```

      ```js
      test('AC3: cancelling an approved request restores the consumed balance', async () => {
        const employeeId = await withBalance('Jordan Avery');
        const created = await asEmployee(request(app).post('/leave/requests'), employeeId)
          .send({ leaveTypeId: 'annual', start: '2026-12-22', end: '2026-12-23' });
        require('../src/leave/requestsStore').approveRequest(created.body.id);
        const before = await asEmployee(request(app).get(`/leave/balances/${employeeId}`), employeeId);
        expect(before.body.balances.annual).toBe(13);
        const res = await asEmployee(request(app).post(`/leave/requests/${created.body.id}/cancel`), employeeId);
        expect(res.body.status).toBe('cancelled');
        const after = await asEmployee(request(app).get(`/leave/balances/${employeeId}`), employeeId);
        expect(after.body.balances.annual).toBe(15);
      });
      ```

      Plus two tests for the new self-balance-view path (`identifyBalanceViewer`):
      an employee reading their own balance via `x-employee-id` succeeds (200), and the
      same employee reading a DIFFERENT employee's balance via `x-employee-id` gets 403.
    files:
      - test/time-off-requests.test.js
    rationale: |
      Matches `test/leave.test.js`'s pattern of reaching into the store directly
      (`require('../src/leave/requestsStore')`) for setup that has no route of its own
      — here, that's `approveRequest`, since there is deliberately no approve/deny
      route in this plan. `asEmployee(req, employeeId)` is a new local helper (mirrors
      the existing `asHr(req)` in `test/leave.test.js`) that does
      `req.set('x-employee-id', employeeId)`.

  - description: |
      Add two tests to the EXISTING `test/leave.test.js` for the `identifyBalanceViewer`
      middleware swap on `GET /leave/balances/:employeeId`, since that file already owns
      coverage of that exact route's authorization and its existing tests must keep
      passing unmodified:

      ```js
      test('GET /leave/balances/:employeeId: an employee may read their own balance via x-employee-id', async () => {
        const employeeId = await newEmployee();
        await asHr(request(app).post(`/leave/balances/${employeeId}`)).send({ annual: 15, sick: 10, unpaid: 5 });
        const res = await request(app).get(`/leave/balances/${employeeId}`).set('x-employee-id', employeeId);
        expect(res.status).toBe(200);
        expect(res.body.balances.annual).toBe(15);
      });
      ```

      I verified by reading the file that the pre-existing test
      `'GET /leave/balances/:employeeId as an unrecognized role is forbidden'` (sends
      `x-staff-role: employee`, no `x-employee-id`, expects 403) and
      `'GET /leave/balances/:employeeId with no x-staff-role header is unauthorized'`
      (expects 401) both still pass unchanged against `identifyBalanceViewer` as written
      in scope item 3 — no edits to those two tests are needed.
    files:
      - test/leave.test.js
    rationale: |
      Keeps authorization-boundary coverage for a given route colocated with that
      route's other authorization tests (this codebase's existing convention, seen in
      `test/leave.test.js`'s own `describe('access control: ...')` block), rather than
      duplicating that coverage in the new `time-off-requests.test.js` file.

  - description: |
      Build the approved design's "Time Off Requests" list screen and "New Time Off
      Request" form as one production page, `public/time-off-requests.html`, with
      `public/css/time-off-requests.css` for page-specific rules (reusing
      `public/css/leave-common.css`'s shared `.page`, `.empty-state`/`.error-state`,
      `.skeleton*` classes the way `public/leave-balances.html` already does) and
      `public/js/time-off-requests.js` for behavior — following the single-HTML,
      multiple-`.screen`-divs-toggled-by-JS pattern already used by `public/defects.html`
      / `public/js/defects.js` (the design file's own `screens`/`show(i)` JS at its lines
      1049-1058 confirms this is how it was built, distinct from its separate
      prototype-only "reviewer bar").

      From the design (`.arc/designs/TEST-M1-STORY-174-design.html`), built as real
      content:
      - The `.decision-banner` with its two `.decision-item`s (lines 585-599) — NOT
        inside `.demo-controls`, so treated as shipped content, matching the real
        (non-demo-labelled) decision banner already shipped in
        `public/leave-balances.html`. Decision-item 1's copy is updated to state the
        actual resolved default: "Until this is decided, only employee self-service
        submission is available; an HR/Manager may view every employee's requests but
        cannot submit one on another employee's behalf." Decision-item 2's copy states
        the actual (non-)behavior: "This isn't implemented in either direction yet — a
        request that exceeds the remaining balance isn't validated until this is
        decided."
      - The `balance-grid` (style lines 409-416, markup lines 823-827) showing each
        leave type's `balance`/`total` — built ONLY in the employee (self) view, backed
        by the real `GET /leave/balances/:employeeId` call for the signed-in employee
        (see the API client below). Omitted in the HR/Manager view, where there is no
        single employee in context (see assumptions).
      - The `requests-table` (style lines 434-448, markup lines 874-899) with
        `status-chip` variants (lines 450-462: dashed border + "Pending", primary border
        + "Approved", struck-through + "Cancelled") and the `col-actions` Cancel button,
        shown only for `pending`/`approved` rows.
      - The cancel confirmation modal (lines 641-658) whose `#cancel-consequence` text
        is status-aware exactly as scripted at lines 909-914: "won't change" for
        pending, "restore N days" for approved.
      - The "New Time Off Request" form (lines 681-744): leave type select with an
        inline `#balance-hint` (line 710, "Available balance: X of Y days"), the
        `form-row` start/end date inputs (lines 713-722) with the "Whole days only"
        `inline-note` (line 723), and the success panel (lines 732-742) with a
        `status-chip--pending` confirmation.
      - `.inline-note`, `.inline-error`, `.inline-warning`, `.summary-panel`,
        `.back-link` styles (lines 495-507) ported into `time-off-requests.css` as
        written.

      Deliberately NOT built (prototype-only, explicitly labelled "Demo controls (not
      part of the real product)" at lines 601-627, or pure review tooling):
      - `.demo-controls` and its three selects (`role-select`, `policy-select`,
        `liststate-select`) and `#review-bar` (lines 537-546) — loading/error/empty list
        states are instead driven by real `fetch` promise state, the same way
        `public/js/leave-balances.js`'s `renderLoading`/`renderError`/`renderList`
        already work.
      - The HR/Manager "on-behalf" variant of the New Request screen (the
        `#employee-field` at lines 698-705, "Log time off for an employee" title/button
        text at lines 954-957) — this directly implements the undecided actor, so it is
        not built; when the page is in the HR/Manager view, the "Request time off"
        button and the New Request screen are not reachable at all. Called out here
        because it conflicts with that screen state in the literal design.

      Adapted from the design rather than copied literally:
      - The design's two-option `role-select` (backed by one fixture `currentUser`) is
        replaced with a real `id="viewer-select"` populated from `GET /employees` (each
        real onboarded employee, by id) plus a trailing "HR / Manager" option — because
        this app's employees are real, dynamically-created records
        (`src/employees/store.js`'s `crypto.randomUUID()`), and `createRequest` 404s on
        an employee id that doesn't exist, so a hardcoded fixture id (as the design and
        `public/js/defects.js`'s `DEMO_USER_ID` both use) cannot stand in here.
      - `GET /employees` is itself gated by `enforceOnboardingRole` (HR/Manager only,
        confirmed by reading `src/employees/routes.js`). To populate the `viewer-select`
        picker BEFORE any viewer is chosen, the client makes that one bootstrap call
        with a fixed `x-staff-role: hr` header, independent of whichever viewer is later
        selected. This is the same self-asserted-header convention already in play
        everywhere in this app (there is no real auth), and mirrors
        `public/js/leave-balances.js`'s `createLeaveBalancesApi(getRole)`, which already
        calls `listEmployees` with `x-staff-role: getRole()` defaulting to `'hr'` for the
        exact same reason (a picker needs the list before an identity is chosen).

      ```js
      function initTimeOffRequestsApp(doc, api) { /* load(), render, wire listeners, return the initial load() promise */ }

      function createTimeOffRequestsApi(getViewer) {
        function headersFor() {
          return getViewer() === 'hrmanager' ? { 'x-staff-role': 'hr' } : { 'x-employee-id': getViewer() };
        }
        return {
          listEmployees: () => request('/employees', 'GET', undefined, { 'x-staff-role': 'hr' }),
          listLeaveTypes: () => request('/leave/types', 'GET'),
          getBalance: (employeeId) => request(`/leave/balances/${encodeURIComponent(employeeId)}`, 'GET', undefined, { 'x-employee-id': employeeId }),
          listRequests: () => request('/leave/requests', 'GET', undefined, headersFor()),
          createRequest: (employeeId, data) => request('/leave/requests', 'POST', data, { 'x-employee-id': employeeId }),
          cancelRequest: (id) => request(`/leave/requests/${encodeURIComponent(id)}/cancel`, 'POST', undefined, headersFor()),
        };
      }
      ```
    files:
      - public/time-off-requests.html
      - public/css/time-off-requests.css
      - public/js/time-off-requests.js
    rationale: |
      Builds exactly the screens/elements the approved design shows for the four ACs,
      while keeping the prototype's reviewer-only scaffolding and its open-decision
      preview toggles out of the shipped page — matching how `public/leave-balances.html`
      already shipped past its own open-decision blocker (narrowest safe default plus a
      real, non-demo decision banner) rather than leaving the whole page unbuilt. The
      `getBalance`/`listEmployees` header choices are a direct, necessary consequence of
      re-verifying `src/employees/routes.js` and `src/leave/routes.js` against the design
      rather than assuming both were open reads.

  - description: |
      UI tests in a new `test/time-off-requests-ui.test.js`, using the same
      `initXApp(doc, fakeApi)` dependency-injection pattern as
      `test/leave-balances-ui.test.js` (no real `fetch`).

      ```js
      test('AC1: submitting the new request form creates a pending request for the signed-in employee', async () => {
        const api = makeApi();
        const { initTimeOffRequestsApp } = require('../public/js/time-off-requests');
        await initTimeOffRequestsApp(document, api);
        $('new-request-btn').click();
        $('leavetype-select').value = 'annual';
        $('start-date').value = '2026-12-22';
        $('end-date').value = '2026-12-26';
        $('submit-btn').click();
        await flush();
        expect(api.createRequest).toHaveBeenCalledWith('emp_1', { leaveTypeId: 'annual', start: '2026-12-22', end: '2026-12-26' });
        expect(document.querySelector('.status-chip--pending')).not.toBeNull();
      });
      ```

      ```js
      test('AC2: cancelling a pending request shows the unchanged-balance consequence', async () => {
        const api = makeApi({ listRequests: jest.fn().mockResolvedValue([
          { id: 'TOR-1', employeeId: 'emp_1', leaveTypeId: 'annual', leaveTypeName: 'Annual leave', start: '2026-12-22', end: '2026-12-23', days: 2, status: 'pending' },
        ]) });
        const { initTimeOffRequestsApp } = require('../public/js/time-off-requests');
        await initTimeOffRequestsApp(document, api);
        document.querySelector('[data-cancel-id="TOR-1"]').click();
        expect($('cancel-consequence').textContent).toMatch(/won't change/i);
        $('confirm-cancel-btn').click();
        await flush();
        expect(api.cancelRequest).toHaveBeenCalledWith('TOR-1');
        expect(document.querySelector('.status-chip--cancelled')).not.toBeNull();
      });
      ```

      Plus: an AC3 test asserting the modal names the days to be restored for an
      `approved`, `consumedDays: 1` row (`/restore 1 day/i`); an AC4 test asserting a
      rendered row's `textContent` contains the leave type name and formatted date range
      and has the right `status-chip` class; and an AC4 test asserting that switching
      `#viewer-select` to `'hrmanager'` re-fetches
      (`expect(api.listRequests).toHaveBeenCalledTimes(2)`) and renders an Employee
      column in the table header.
    files:
      - test/time-off-requests-ui.test.js
    rationale: |
      Keeps balance arithmetic verification in the backend test file (where the real
      balance store lives) and keeps this file focused on DOM behavior: form submission
      wiring, modal copy, status rendering, and the self/HR view switch — consistent with
      how `test/leave-balances-ui.test.js` only checks what it renders/calls, not store
      internals. The fake `api` object's shape matches the corrected client from scope
      item 6 (`getBalance`, not a bulk `listBalances`).

tests:
  - |
    AC1 (backend): `POST /leave/requests` with `x-employee-id` set to an onboarded
    employee with a balance, body
    `{ leaveTypeId: 'annual', start: '2026-12-22', end: '2026-12-26' }`:
    `expect(res.status).toBe(201)`, `expect(res.body.status).toBe('pending')`,
    `expect(res.body.days).toBe(5)`.
  - |
    AC1 (UI): submitting the New Time Off Request form calls
    `expect(api.createRequest).toHaveBeenCalledWith('emp_1', { leaveTypeId: 'annual', start: '2026-12-22', end: '2026-12-26' })`
    and the resulting row/success panel shows
    `document.querySelector('.status-chip--pending')` not null.
  - |
    AC2 (backend): create a request, cancel it while `pending`:
    `expect(res.body.status).toBe('cancelled')`, then reading the balance back via
    `GET /leave/balances/:employeeId` as the same employee (self-access path),
    `expect(balanceRes.body.balances.sick).toBe(10)` (unchanged from the seeded value).
  - |
    AC2 (UI): opening the cancel modal on a `pending` row asserts
    `expect($('cancel-consequence').textContent).toMatch(/won't change/i)`, and
    confirming calls `expect(api.cancelRequest).toHaveBeenCalledWith('TOR-1')` and leaves
    `.status-chip--cancelled` in the DOM with the Cancel button gone for that row.
  - |
    AC3 (backend): create a request, call `approveRequest(id)` directly from
    `src/leave/requestsStore.js` to reach the "approved, consumed balance" precondition,
    confirm the balance dropped (`expect(before.body.balances.annual).toBe(13)` for a
    2-day request against a 15-day balance), cancel it via the route, then
    `expect(after.body.balances.annual).toBe(15)`.
  - |
    AC3 (UI): opening the cancel modal on an `approved`, `consumedDays: 1` row asserts
    `expect($('cancel-consequence').textContent).toMatch(/restore 1 day/i)`.
  - |
    AC4 (backend, submitter): after creating one request, `GET /leave/requests` as the
    same `x-employee-id` returns `expect(res.body).toHaveLength(1)` and
    `expect(res.body[0]).toMatchObject({ leaveTypeId: 'annual', start: '2026-12-22', end: '2026-12-26', status: 'pending' })`.
  - |
    AC4 (backend, HR/Manager): after two different employees each create one request,
    `GET /leave/requests` with `x-staff-role: hr` returns both:
    `expect(res.body.map((r) => r.employeeId).sort()).toEqual([empA, empB].sort())`.
  - |
    AC4 (UI): a rendered table row's `textContent` contains the leave type name and
    formatted date range, and `row.querySelector('.status-chip--pending')` (or the
    matching variant) is present; switching `#viewer-select` to `'hrmanager'` and
    dispatching `change` results in
    `expect(api.listRequests).toHaveBeenCalledTimes(2)` (initial self load + the HR
    re-fetch) and an Employee column appearing in the table header.
  - |
    Actor safe-default (backend): `POST /leave/requests` with no `x-employee-id` header
    returns `expect(res.status).toBe(401)`; an employee cancelling another employee's
    request via `POST /leave/requests/:id/cancel` with their own `x-employee-id` returns
    `expect(res.status).toBe(403)`.
  - |
    Self-balance-view addition (backend, regression-safe): an employee reading their own
    balance via `x-employee-id` on `GET /leave/balances/:employeeId` returns
    `expect(res.status).toBe(200)`; the same employee reading a DIFFERENT employee's
    balance via `x-employee-id` returns `expect(res.status).toBe(403)`; the pre-existing
    `test/leave.test.js` tests for that route (401 with no header, 403 for
    `x-staff-role: employee` with no `x-employee-id`, 200/404 for HR) are re-run
    unmodified to confirm no regression.

assumptions_or_open_questions:
  - |
    Both story blockers are genuinely unresolved by the product owner. This plan resolves
    the actor blocker ONLY to the minimum needed to make the four ACs implementable with a
    real identity boundary: employee self-service only (no HR/Manager-on-behalf submission
    UI or route), matching the narrowest-safe-default precedent already shipped in
    `public/leave-balances.html` for its own open-decision story.
  - |
    The over-balance blocker is NOT resolved and NOT implemented in either direction,
    because no AC exercises that path (AC1 is the happy path with an available balance).
    The practical consequence is that today a request exceeding the remaining balance
    would still succeed with no warning (equivalent to "allow") — flagged here explicitly
    rather than silently decided, per the design's own refusal to commit to either answer.
  - |
    `approveRequest` in `src/leave/requestsStore.js` has no HTTP route in this plan. It
    exists solely so AC3's "approved request that consumed balance" precondition is
    constructible (by this story's tests, and later by a dedicated approve/deny story).
    It is not reachable from the UI.
  - |
    The design's `.demo-controls` block and `#review-bar` are explicitly prototype-only
    (the file itself labels `.demo-controls` "not part of the real product"); they are
    not built. The `.decision-banner` sits outside `.demo-controls` in the design and is
    treated as real, shipped content, matching `public/leave-balances.html`'s precedent.
  - |
    The design's binary `role-select` (Employee vs HR/Manager-on-behalf, backed by one
    fixture `currentUser`) is replaced with a real employee picker populated from
    `GET /employees` plus an "HR / Manager" option, because this app's employees are real
    records and the backend 404s on a nonexistent employee id — a hardcoded fixture id (as
    the design uses) would not pass `createRequest`'s onboarding check.
  - |
    `GET /employees` and (previously) `GET /leave/balances/:employeeId` are both gated to
    HR/Manager only by existing code (`enforceOnboardingRole`). This plan (a) always
    bootstraps the `viewer-select` employee list with a fixed `x-staff-role: hr` header,
    independent of the later chosen viewer, mirroring the same pattern already used by
    `public/js/leave-balances.js`'s `createLeaveBalancesApi(getRole)`; and (b) adds a
    narrow, additive self-access path (`identifyBalanceViewer`) to the single-employee
    balance GET route only, so the design's own balance-grid/`#balance-hint` can render
    for a self-service employee. Neither of these is stated by an AC, but both are
    necessary side-effects of resolving the actor blocker to "employee self-service" while
    still building the approved design's balance-displaying elements.
  - |
    When the page is viewed as "HR / Manager," the "Request time off" button and the New
    Request screen are not shown at all (no on-behalf creation exists), and the
    balance-grid section is omitted entirely (there is no single employee in context in
    that view). Both are deliberate narrowings of the literal design (which shows an
    Employee field/relabelled button for HR/Manager, and shows the same fixture-backed
    balance-grid regardless of role) — called out here because they conflict with what
    the design's HR/Manager-view markup shows.
  - |
    Cancelling an already-`cancelled` request is rejected with 409. This isn't stated by
    an AC but is needed to keep `cancelRequest` safe to call once per request given AC2
    and AC3 both exercise the same endpoint.
  - |
    No approve/deny HTTP workflow, no in-place editing of a submitted request, and no
    partial/half-day requests are built — all explicitly out of this story's scope.
  - |
    If `GET /leave/balances/:employeeId` 404s (no starting balance recorded yet for the
    signed-in employee), the UI treats that as "no balance information available" for the
    balance-grid/`#balance-hint` rather than blocking the rest of the page — this mirrors
    this app's general pattern of not letting one failed data source block an otherwise
    working page, but is not itself under dedicated test since no AC requires that
    specific degraded state.

package_dependencies: []

notes: |
  `src/leave` already exists (leave types + per-employee starting balances, from a prior
  story) with `src/leave/store.js`, `src/leave/routes.js`, `src/leave/auth.js`, all mounted
  at `/leave` in `src/server.js` with `requestMetrics` already wrapping the whole router —
  no server.js change is needed. This plan adds request submission/cancellation on top of
  that same domain rather than starting a new top-level module.

  The most directly relevant precedent for "how this codebase already ships a story with
  an unresolved product blocker" is `public/leave-balances.html` / its decision banner
  (HR-only default, Manager/Employee still selectable for testing the 401/403 boundary) —
  this plan follows that shape for the actor blocker, and explicitly does NOT follow it
  for the over-balance blocker since no AC needs that resolved.

  While re-verifying the draft of this plan against the actual code (not just the story
  text), I confirmed two things the original draft had assumed without checking: (1)
  `requireHrRole` in `src/leave/auth.js` only accepts `'hr'`, NOT `'manager'` — but this
  plan's new middlewares deliberately do NOT reuse `requireHrRole`; they reuse
  `enforceOnboardingRole`'s role vocabulary (`hr`/`manager`) instead, which is correct per
  AC4. (2) `GET /leave/balances/:employeeId` and `GET /employees` are both gated to
  HR/Manager only — this has a real, non-obvious consequence for an employee-self-service
  UI that needs to show its own balance and a picker of employees, addressed by the new
  `identifyBalanceViewer` middleware and the fixed-`'hr'`-header bootstrap call
  respectively (see scope items 3, 4, 6 and the assumptions above).

  ```mermaid
  flowchart TD
    server[src/server.js] -->|mounts /leave, already wraps requestMetrics| leaveRoutes[src/leave/routes.js]
    empRoutes[src/employees/routes.js] -->|enforceOnboardingRole, unchanged| empStore[src/employees/store.js]
    leaveRoutes -->|identifyTimeOffSelf / identifyTimeOffViewer / identifyBalanceViewer| leaveAuth[src/leave/auth.js]
    leaveRoutes -->|LEAVE_TYPES, presentRequest, consumeBalance/restoreBalance callers| leaveStore[src/leave/store.js]
    leaveRoutes -->|createRequest/listRequests/cancelRequest| reqStore[src/leave/requestsStore.js]
    reqStore -->|consumeBalance/restoreBalance, new exports| leaveStore
    reqStore -->|getEmployee onboarding check| empStore
    uiHtml[public/time-off-requests.html] --> uiJs[public/js/time-off-requests.js]
    uiJs -->|fetch /leave/requests*, /leave/balances/:id self, /leave/types| leaveRoutes
    uiJs -->|fetch /employees, fixed x-staff-role: hr bootstrap| empRoutes

    classDef touched fill:#f96,color:#000
    class leaveAuth,leaveStore,reqStore,leaveRoutes,uiHtml,uiJs touched
  ```

review_focus: |
  In scope: the four ACs (create → pending; cancel pending → no balance change; cancel
  approved → balance restored; submitter-or-HR/Manager list view), the minimum actor
  identity boundary needed to implement them, and a narrow self-access addition to the
  pre-existing `GET /leave/balances/:employeeId` route (needed so the self-service
  employee's own balance can render at all). Out of scope, by design: any
  HR/Manager-on-behalf submission, any over-/under-balance validation, approve/deny,
  in-place editing, and partial-day requests — don't flag their absence as a bug. The
  riskiest area is the balance arithmetic in `src/leave/requestsStore.js` +
  `consumeBalance`/`restoreBalance` in `src/leave/store.js`: a pending cancellation must
  never touch balance, while an approved cancellation must restore exactly the `days`
  consumed at approval (tracked via `consumedDays`, not recomputed from dates). The second
  riskiest area is `identifyBalanceViewer`'s interaction with the PRE-EXISTING
  `test/leave.test.js` authorization tests for that same route — verify the self-access
  addition doesn't silently change the 401/403 split for HR/Manager-only or unrecognized-
  role callers who send no `x-employee-id`. Finally, note that the UI's bootstrap
  `GET /employees` call always sends a fixed `x-staff-role: hr` header regardless of the
  viewer later selected on the page — this is deliberate (mirrors
  `public/js/leave-balances.js`'s existing pattern, and this app has no real
  authentication to begin with), not an accidental privilege leak.
