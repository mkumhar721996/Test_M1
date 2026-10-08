summary: |
  Build the customer-facing "Track Repair Request Status" feature exactly as shown in the approved
  prototype (`TEST-M1-STORY-200-design.html`): a "My requests" list screen split into "Open
  requests" (Submitted/Assigned/In Progress) and "Past requests" (Completed/Cancelled) sections,
  and a read-only "Request Detail" screen with a 4-step lifecycle tracker (or a cancelled banner),
  the assigned technician (or a "not yet assigned" line), and zero controls that could change a
  request's status. The existing `repairRequests` module (from TEST-M1-STORY-199) has no concept
  of a customer, no technician/assignment field, and only ever sets status to `'Pending'` — none of
  which matches this story's 5-value status vocabulary or its per-customer filtering requirement.
  This plan extends that module's store/routes/auth minimally (customerId, technician,
  scheduledWindow fields; a customer-facing status mapping; customer-scoped read routes; and an
  internal, dispatcher-gated status-mutation hook that stands in for the not-yet-built Scheduling &
  Dispatch / Technician Job Management integration) and adds a new customer-facing list+detail page
  that consumes only the new read-only routes.
scope:
  - description: |
      Extend `src/repairRequests/store.js` so a request record can carry a customer, a technician,
      and a scheduled window, and can be read back in the customer-facing status vocabulary.
      - `createRequest(data)` additionally stores `customerId: data.customerId || null`,
        `technician: null`, and `scheduledWindow: null` on the new record. The existing `status:
        'Pending'` initial value and all other fields are unchanged (STORY-199's
        `test/repair-requests.test.js` asserts `res.body.status === 'Pending'` and must keep
        passing unmodified).
      - Add a `CUSTOMER_STATUS_MAP` and `toCustomerView(record)` that maps the internal status to
        the customer-facing one of `Submitted | Assigned | In Progress | Completed | Cancelled`
        (`Pending` -> `Submitted`, the other four pass through unchanged) and picks the fields the
        customer is allowed to see: `{ id, category, description, address, submittedAt, status,
        technician, scheduledWindow, completedAt, cancelledAt, cancelReason }`.
      - Add `listRequestsForCustomer(customerId)` (filters by `customerId`, newest first, mapped
        through `toCustomerView`) and `getRequestForCustomer(id, customerId)` (returns `null` if
        the request doesn't exist or belongs to a different customer).
      - Add `updateRequestStatus(id, { status, technician, scheduledWindow, cancelReason })`: looks
        up the record, throws `RepairRequestValidationError({ status: '...' })` unless `status` is
        one of `['Assigned', 'In Progress', 'Completed', 'Cancelled']` (a request can only reach
        `Submitted` via creation, never via this function), otherwise mutates `status`, optionally
        `technician`/`scheduledWindow`, and stamps `completedAt`/`cancelledAt`
        (+`cancelReason`) when the new status is `Completed`/`Cancelled`. Returns the raw (internal)
        record or `null` if the id doesn't exist. This is the hook a future Scheduling & Dispatch /
        Technician Job Management story would call; it is deliberately not exposed to any
        customer-reachable code path.
    files:
      - src/repairRequests/store.js
    rationale: |
      This is the one in-memory source of truth for repair requests (`src/repairRequests/store.js`,
      read by `routes.js`); every other change in this plan is built on top of the fields and
      functions added here. Preserving the existing `'Pending'` internal value avoids touching
      STORY-199's already-passing `test/repair-requests.test.js`.
  - description: |
      Add a customer identity gate to `src/repairRequests/auth.js`, mirroring the existing
      `requireDispatcherRole` in the same file and `requireAuthenticatedUser` in
      `src/jobs/auth.js`:
      ```js
      function requireAuthenticatedCustomer(req, res, next) {
        const customerId = req.headers['x-customer-id'];
        if (process.env.NODE_ENV === 'production' || !customerId) {
          return res.status(401).json({ error: 'unauthorized' });
        }
        req.customerId = customerId;
        next();
      }
      ```
      Exported alongside the existing `requireDispatcherRole`.
    files:
      - src/repairRequests/auth.js
    rationale: |
      Matches the codebase's established pattern for an unverified, client-asserted identity
      header that fails closed in production (`src/jobs/auth.js`, `src/repairRequests/auth.js`'s
      existing dispatcher gate) rather than inventing a new auth scheme for this story.
  - description: |
      Add three routes to `src/repairRequests/routes.js`:
      - `GET /repair-requests/mine` (behind `requireAuthenticatedCustomer`) ->
        `res.status(200).json(listRequestsForCustomer(req.customerId))`.
      - `GET /repair-requests/mine/:id` (behind `requireAuthenticatedCustomer`) -> looks up
        `getRequestForCustomer(req.params.id, req.customerId)`; `404 { error: 'not_found' }` if
        `null`, otherwise `200` with the record. A request that exists but belongs to a different
        customer 404s the same way as one that doesn't exist at all (no existence leak).
      - `PATCH /repair-requests/:id/status` (behind the existing `requireDispatcherRole`) -> calls
        `updateRequestStatus(req.params.id, req.body)`; `404` if the id doesn't exist, `400` with
        `{ error: 'validation_error', fields }` on an invalid status (same
        `RepairRequestValidationError` handling already used by `POST /`), otherwise `200` with the
        updated record. This route exists only so Scheduling & Dispatch / Technician Job Management
        (and this plan's own tests) have a way to change a request's status; the customer app never
        calls it.
      Also update the existing `POST /` handler to read `req.headers['x-customer-id']` (optional,
      no gate) and pass it through as `customerId` on the create payload, so a signed-in customer's
      own new submissions show up in their "mine" list:
      ```js
      router.post('/', (req, res, next) => {
        try {
          const customerId = req.headers['x-customer-id'] || null;
          res.status(201).json(createRequest({ ...req.body, customerId }));
        } catch (err) { /* unchanged */ }
      });
      ```
    files:
      - src/repairRequests/routes.js
    rationale: |
      Keeps the customer-facing read surface (`/mine`, `/mine/:id`) and the dispatcher-only
      mutation surface (`/:id/status`) under the same `requireDispatcherRole`/
      `requireAuthenticatedCustomer` gates already proven out by STORY-199, and keeps `POST /`'s
      existing required-fields contract (and STORY-199's tests) unchanged — `customerId` is purely
      additive and optional.
  - description: |
      Add the "My requests" list screen and "Request Detail" screen as one new page, following the
      same single-HTML-multi-`.screen` pattern as `public/defects.html` /
      `public/js/defects.js` (hash-routed, no polling needed since AC9 only requires the *next*
      view to be fresh, not a live background refresh):
      - `public/my-requests.html`: two `.screen` divs, `data-name="My Requests"` and
        `data-name="Request Detail"`, structurally matching the design's two screens (app-topbar
        with brand "Fixly" and a single "My requests" nav item + session line; page-header with
        request count; loading skeleton / error banner+retry / empty state / success with
        `#open-section`/`#request-list` and `#past-section`/`#past-request-list`; detail screen
        with `#detail-status-chip`, `#detail-tracker`, `#detail-cancelled-banner`,
        `#detail-tech-slot`, `#detail-window-section`, description/address/submitted sections, and
        the read-only note). Links `tokens.css`, `prototype-utils.css`, `css/my-requests.css`,
        and scripts `js/utils.js`, `js/my-requests.js`.
      - `public/css/my-requests.css`: adapted from the design's third `<style>` block (status-chip
        + its 5 status variants, section-heading, request-card/-head/-title/-id/-desc/-meta,
        tech-line/no-tech-line, empty-state, state-banner, skeleton-card/-block, detail-head/-id,
        status-track/-step/-dot/-label/-connector, cancelled-banner, detail-section/-label/-value,
        tech-card/-avatar/-name/-role, no-tech-card, readonly-note, app-topbar-right, session-line,
        page-header-row, request-count). The design's `.demo-note*`/`#review-bar` reviewer-tooling
        classes and the `.inline-unavailable`/`.retry-link`/"partial" per-card sync-failure classes
        are deliberately NOT ported (see assumptions).
      - `public/js/my-requests.js`: `initMyRequestsApp(doc, api)` + `createDefaultApi()`,
        exported like every sibling module (`public/js/jobs.js`, `public/js/defects.js`). `api`
        shape: `{ list: () => Promise<RequestSummary[]>, get: (id) => Promise<RequestDetail> }`.
        `createDefaultApi()` sends a demo customer id header on every call, mirroring
        `public/js/jobs.js`'s `DEMO_TECHNICIAN_ID`:
        ```js
        const DEMO_CUSTOMER_ID = 'cust_jordan';
        function createDefaultApi() {
          return {
            list: () => fetch('/repair-requests/mine', { headers: { 'x-customer-id': DEMO_CUSTOMER_ID } })
              .then((res) => res.json().catch(() => ([])).then((d) => (res.ok ? d : Promise.reject({ status: res.status })))),
            get: (id) => fetch(`/repair-requests/mine/${id}`, { headers: { 'x-customer-id': DEMO_CUSTOMER_ID } })
              .then((res) => res.json().catch(() => ({})).then((d) => (res.ok ? d : Promise.reject({ status: res.status })))),
          };
        }
        ```
        Status chip icons/classes copy the design's `STATUS_META` table exactly (Submitted ○,
        Assigned ◐, In Progress ◉, Completed ✓, Cancelled ✕). List grouping uses the design's
        `OPEN_STATUSES`/`PAST_STATUSES` arrays; the detail tracker uses the design's `TRACK_STEPS`
        array and `done`/`current` step classes, with the dashed `.cancelled-banner` replacing the
        tracker for `Cancelled` requests. Clicking a `[data-view-request]` card calls `api.get(id)`
        fresh (no caching) and navigates via `location.hash = '#/requests/' + id`; "← My requests"
        navigates back to the list, which re-renders from the data already loaded by `api.list()`.
    files:
      - public/my-requests.html
      - public/css/my-requests.css
      - public/js/my-requests.js
    rationale: |
      Reuses the exact screen/markup structure, status-chip/tracker/tech-card visuals, and copy
      already approved in `TEST-M1-STORY-200-design.html`, and the same init(doc, api)/
      createDefaultApi() module shape every other customer/technician screen in this codebase uses
      (`public/js/jobs.js`, `public/js/services.js`, `public/js/defects.js`), so it is testable with
      the same jsdom-HTML-fixture pattern as those modules.
  - description: |
      Backend tests for the store/route/auth changes above, in one new file.
    files:
      - test/repair-request-status-tracking.test.js
    rationale: |
      Mirrors the existing `test/repair-requests.test.js` / `test/hires-role-enforcement.test.js`
      style: `supertest` against the real `src/server.js` app plus direct calls into
      `src/repairRequests/store.js` to simulate what a future Scheduling & Dispatch /
      Technician Job Management caller would do (there is no such caller in this codebase yet).
  - description: |
      Frontend jsdom tests for the new list + detail screen, in one new file.
    files:
      - test/my-requests-ui.test.js
    rationale: |
      Mirrors `test/jobs-list-ui.test.js` / `test/defects-list-detail-ui.test.js`: loads the real
      HTML fixture into `document.documentElement.innerHTML`, injects a mock `api`, and asserts on
      rendered DOM.
tests:
  - |
    AC1 (backend, test/repair-request-status-tracking.test.js): create 5 requests for the same
    customer, drive 4 of them through `updateRequestStatus` to Assigned/In Progress/Completed/
    Cancelled (leave one untouched), then:
    ```js
    const res = await request(app).get('/repair-requests/mine').set('x-customer-id', 'cust_jordan');
    const statusById = Object.fromEntries(res.body.map((r) => [r.id, r.status]));
    expect(statusById[submitted.id]).toBe('Submitted');
    expect(statusById[assigned.id]).toBe('Assigned');
    expect(statusById[inProgress.id]).toBe('In Progress');
    expect(statusById[completed.id]).toBe('Completed');
    expect(statusById[cancelled.id]).toBe('Cancelled');
    ```
    AC1 (frontend, test/my-requests-ui.test.js): render list items with all 5 statuses and assert
    `document.querySelectorAll('.status-chip')` contains each of the five label strings.
  - |
    AC2 (backend): one open + one past request for the same customer both come back from
    `GET /repair-requests/mine`:
    ```js
    const ids = res.body.map((r) => r.id);
    expect(ids).toEqual(expect.arrayContaining([open.id, past.id]));
    ```
    AC2 (frontend): with one Assigned and one Completed item, assert
    `document.getElementById('open-heading').hidden === false`,
    `document.getElementById('past-heading').hidden === false`, and each card renders inside its
    matching list (`#request-list` vs `#past-request-list`).
  - |
    AC3 (backend): after `updateRequestStatus(r.id, { status: 'Assigned', technician: 'Marcus Webb' })`,
    `GET /repair-requests/mine/:id` returns `technician: 'Marcus Webb'`.
    AC3 (frontend): `expect(document.querySelector('.tech-line').textContent).toContain('Marcus Webb')`.
  - |
    AC4 (backend): a freshly created request's detail response has `technician: null`.
    AC4 (frontend):
    ```js
    expect(document.querySelector('.tech-line')).toBeNull();
    expect(document.querySelector('.no-tech-line').textContent).toContain('Not yet assigned');
    ```
  - |
    AC5 (backend + frontend, combined assertion): a freshly created, never-updated request's
    detail response has BOTH `status: 'Submitted'` AND `technician: null` at once — i.e. the
    pending-assignment status and the absent technician are asserted together, not just each in
    isolation:
    ```js
    expect(res.body.status).toBe('Submitted');
    expect(res.body.technician).toBeNull();
    ```
  - |
    AC6 (backend): two requests for the same customer; call `updateRequestStatus` on only one;
    assert the other is untouched:
    ```js
    const byId = Object.fromEntries((await request(app).get('/repair-requests/mine').set('x-customer-id', 'cust_jordan')).body.map((r) => [r.id, r]));
    expect(byId[a.id].status).toBe('Assigned');
    expect(byId[b.id].status).toBe('Submitted');
    expect(byId[b.id].technician).toBeNull();
    ```
  - |
    AC7 (frontend): mock `api.list`/`api.get` for one request, click its `[data-view-request]`
    card, and assert the detail screen is shown with that request's data:
    ```js
    document.querySelector('[data-view-request="REQ-77"]').click();
    await flush();
    expect(api.get).toHaveBeenCalledWith('REQ-77');
    expect(document.querySelector('.screen[data-name="Request Detail"]').style.display).toBe('block');
    expect(document.getElementById('detail-status-chip').textContent).toContain('In Progress');
    expect(document.getElementById('detail-tech-slot').textContent).toContain('Dana Whitfield');
    ```
  - |
    AC8 (backend, isolation): two customers each with a request; `GET /repair-requests/mine` for
    customer A never contains customer B's request id, and `GET /repair-requests/mine/:id` for
    customer B's id while authenticated as customer A returns 404:
    ```js
    expect(res.body.map((r) => r.id)).not.toContain(rileyReq.id);
    expect((await request(app).get(`/repair-requests/mine/${rileyReq.id}`).set('x-customer-id', 'cust_jordan')).status).toBe(404);
    ```
    AC8 (backend, identity gate): no `x-customer-id` header is 401; `NODE_ENV=production` is 401
    even with the header (same fail-closed pattern as `src/jobs/auth.js`).
    AC8 (frontend, supporting check): `createDefaultApi().list()` sends an identifying header —
    `expect(global.fetch).toHaveBeenCalledWith('/repair-requests/mine', expect.objectContaining({ headers: expect.objectContaining({ 'x-customer-id': expect.any(String) }) }))`.
  - |
    AC9 (backend): fetch a request's detail, then call `updateRequestStatus` directly (simulating
    Scheduling & Dispatch acting elsewhere), then fetch detail again and assert the new status/
    technician are reflected:
    ```js
    updateRequestStatus(r.id, { status: 'Assigned', technician: 'Marcus Webb' });
    const res2 = await request(app).get(`/repair-requests/mine/${r.id}`).set('x-customer-id', 'cust_jordan');
    expect(res2.body.status).toBe('Assigned');
    expect(res2.body.technician).toBe('Marcus Webb');
    ```
    AC9 (frontend): open a request's detail (api.get resolves v1), navigate back to the list, open
    the same request again (api.get's second call resolves v2) and assert the re-rendered detail
    shows v2's status/technician, proving the view is never served from a stale cache.
  - |
    AC10 (frontend): render a populated list, assert every button on the "My Requests" screen is
    either the card itself (`[data-view-request]`, a navigation control) or `#list-retry` (network
    retry) — nothing else:
    ```js
    const listButtons = [...document.querySelectorAll('.screen[data-name="My Requests"] button')]
      .filter((b) => !b.hasAttribute('data-view-request') && b.id !== 'list-retry');
    expect(listButtons).toHaveLength(0);
    ```
    Then open the detail screen and assert it has zero `<button>` elements at all (its only
    navigation is the "← My requests" `<a>` link):
    ```js
    expect(document.querySelectorAll('.screen[data-name="Request Detail"] button')).toHaveLength(0);
    ```
    AC10 (backend, supporting check): `PATCH /repair-requests/:id/status` with only an
    `x-customer-id` header (no `x-staff-role`) is 401 — a customer identity alone cannot reach the
    status-mutation route.
assumptions_or_open_questions:
  - |
    Conflict between the ACs/design and the already-shipped STORY-199 code: the ACs require the
    exact status string "Submitted", and the design's fixtures/status-chip CSS use "Submitted" as
    the initial status, but `src/repairRequests/store.js`'s `createRequest` (STORY-199, already
    merged) sets `status: 'Pending'`, and STORY-199's `test/repair-requests.test.js` asserts that
    literal value. I did not rename the internal status (that would break a merged, passing test
    suite for a different, already-finalized story) and instead introduced a customer-facing-only
    mapping (`Pending` -> `Submitted`) applied in `toCustomerView`/the new `/mine*` routes. The
    internal dispatcher-facing `GET /repair-requests` queue route still shows "Pending" unchanged.
    Flagging this explicitly in case the reviewer would rather rename the shared internal value
    instead (which would require updating STORY-199's test file too).
  - |
    There is no "Scheduling & Dispatch" module/epic in this codebase yet, and `src/jobs/store.js`
    (Technician Job Management) has no field linking a `job` record back to a `repairRequests`
    record (different id spaces: `JOB-xxxx` vs `REQ-xxxx`). Building that real integration is out
    of scope for a read-only tracking story. This plan instead adds a minimal, dispatcher-gated
    `updateRequestStatus` store function + `PATCH /repair-requests/:id/status` route as the stand-in
    hook a future Scheduling & Dispatch / Technician Job Management story would call, and this
    plan's own tests call it directly to simulate "a status change made elsewhere" for AC6/AC9.
  - |
    `customerId` is sourced from an optional, unauthenticated `x-customer-id` request header (same
    unverified, fail-closed-in-production pattern as `src/jobs/auth.js`'s `x-user-id`), since there
    is no real authentication system anywhere in this codebase. Requests created without that
    header (including every existing STORY-199 test, which never sets it) simply have
    `customerId: null` and never appear in anyone's "my requests" view.
  - |
    The design's "partial — one status failed to sync" preview state and its per-card
    `.inline-unavailable`/`.retry-link` affordance are NOT built. No acceptance criterion backs a
    per-item dispatch-sync failure, there is no real sync mechanism in this codebase to fail, and
    that state is only reachable in the prototype via the panel the design itself labels "Reviewer
    tooling — not part of the shipped app". Loading / error (whole-list) / empty states ARE built,
    matching every sibling list screen in this codebase (`public/js/jobs.js`, `public/js/defects.js`).
  - |
    `scheduledWindow` is carried through `updateRequestStatus`/`toCustomerView` and rendered on the
    detail screen when present, purely because the approved design's detail screen shows it
    (`#detail-window-section`). No acceptance criterion requires it; it is hidden when absent and
    has no dedicated test beyond being passed through untouched by the AC-driven tests above.
  - |
    The design's "Preview as customer" and "Simulate dispatch update" reviewer-tooling controls,
    and the top `#review-bar` prev/next screen switcher, are prototype scaffolding only (the design
    itself labels them "not part of the shipped app") and are not built into `my-requests.html`.
package_dependencies: []
notes: |
  No existing route in this codebase links a `repairRequests` record to a `jobs` record or to any
  concept of "the customer who submitted it" — this plan's auth/store changes are the minimum
  needed to make that linkage readable by the customer without inventing the not-yet-built
  Scheduling & Dispatch epic.

  ```mermaid
  flowchart TD
    UI["public/js/my-requests.js<br/>(new)"] -->|"fetch /repair-requests/mine*<br/>x-customer-id header"| ROUTES["src/repairRequests/routes.js<br/>(modified: +mine, +mine/:id, +:id/status)"]
    HTML["public/my-requests.html<br/>(new)"] --- UI
    ROUTES -->|"requireAuthenticatedCustomer"| AUTH["src/repairRequests/auth.js<br/>(modified: +requireAuthenticatedCustomer)"]
    ROUTES -->|"requireDispatcherRole (existing, reused for PATCH :id/status)"| AUTH
    ROUTES --> STORE["src/repairRequests/store.js<br/>(modified: +customerId/technician/scheduledWindow,<br/>+toCustomerView, +listRequestsForCustomer,<br/>+getRequestForCustomer, +updateRequestStatus)"]
    LEGACY_JS["public/js/services.js<br/>(unchanged, STORY-199)"] -->|"POST / , GET / (dispatcher queue)"| ROUTES
    SERVER["src/server.js<br/>(unchanged — already mounts repairRequestsRouter)"] --> ROUTES

    classDef touched fill:#f96,color:#000
    class UI,HTML,ROUTES,AUTH,STORE touched
  ```
review_focus: |
  In scope: the new `/repair-requests/mine`, `/repair-requests/mine/:id` customer-read routes, the
  dispatcher-gated `/repair-requests/:id/status` mutation hook, and the new `my-requests`
  list+detail screen consuming only the read routes. Out of scope, deliberately: any real
  Scheduling & Dispatch or Technician Job Management integration (none exists in this codebase —
  see assumptions), and the design's "partial sync failure" preview state. The riskiest/most
  judgment-laden decision is the `Pending`->`Submitted` customer-facing status mapping instead of
  renaming the shared internal status value — please confirm that's the right call rather than
  updating STORY-199's status string too. Also deliberate: `x-customer-id` is an unverified,
  client-asserted header (consistent with every other identity check in this codebase) and the
  detail/list screens have zero status-changing controls by design (AC10) — a reviewer should not
  expect a "cancel request" or similar button anywhere in this story's UI.
