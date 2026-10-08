summary: |
  Add customer self-service cancel/edit for a repair request while it is still waiting to be
  assigned (AC1/AC2), and enforce + demonstrate that this stops being possible once a technician
  has been committed (AC3) or the request belongs to a different customer (AC4). This requires
  three things that don't exist yet: (1) `src/repairRequests/store.js` currently never records
  *who* submitted a request, so ownership-gating is impossible today — this plan adds a
  `customerId` captured from the same `x-user-id` dev-identity header already used by
  `src/jobs/auth.js` and `src/defects/auth.js`; (2) three new ownership- and status-gated routes
  (`GET /repair-requests/mine`, `GET /repair-requests/:id`, `PATCH /repair-requests/:id`,
  `POST /repair-requests/:id/cancel`); (3) a new customer-facing "My requests" page
  (`public/my-requests.html` + `public/js/my-requests.js` + `public/css/my-requests.css`) built
  from the approved prototype at
  `.arc/designs/TEST-M1-STORY-203-design.html`, following the exact same page/css/js-per-feature
  structure already used by `public/jobs.html`/`public/js/jobs.js` (story 205) and
  `public/defects.html`/`public/js/defects.js`.

scope:
  - description: |
      Extend `src/repairRequests/store.js` to track ownership and support the two new
      transitions, reusing the existing field-validation rules from `createRequest` instead of
      duplicating them.

      - `createRequest(data)`: accept and store `customerId: typeof data.customerId === 'string' ? data.customerId : ''`
        (defaults to `''` for the pre-existing anonymous path — see assumption below).
      - Extract the existing category/description/time-window/address validation block out of
        `createRequest` into a shared `validateRequestFields(data)` helper that returns `fields`,
        so both `createRequest` and the new `updateRequestDetails` enforce identical rules.
      - Add `function findOwned(id, customerId) { const r = requests.get(id); return (r && r.customerId === customerId) ? r : null; }`
        — used by every new route so "doesn't exist" and "exists but isn't yours" are always
        indistinguishable (same pattern as `src/defects/routes.js`'s `isVisibleTo` + single 404
        branch).
      - Add `class RepairRequestLockedError extends Error { constructor(record) { super('locked'); this.statusCode = 409; this.record = record; } }`.
      - Add `function listMine(customerId) { return Array.from(requests.values()).filter(r => r.customerId === customerId).sort((a,b) => new Date(b.submittedAt) - new Date(a.submittedAt)); }`.
      - Add `function cancelRequest(id, customerId) { const r = findOwned(id, customerId); if (!r) return null; if (r.status !== 'Pending') throw new RepairRequestLockedError(r); r.status = 'Cancelled'; r.cancelledAt = new Date().toISOString(); return r; }`.
      - Add `function updateRequestDetails(id, customerId, data) { const r = findOwned(id, customerId); if (!r) return null; if (r.status !== 'Pending') throw new RepairRequestLockedError(r); const fields = validateRequestFields(data); if (Object.keys(fields).length) throw new RepairRequestValidationError(fields); const category = getCategory(data.categoryId); const timeWindow = getTimeWindow(data.timeWindowId); r.categoryId = category.id; r.categoryName = category.name; r.description = text(data.description); r.preferredDate = text(data.preferredDate); r.timeWindowId = timeWindow.id; r.timeWindowLabel = timeWindow.label; r.address = { street: text(data.address.street), unit: text(data.address.unit), city: text(data.address.city), state: text(data.address.state), zip: text(data.address.zip) }; return r; }`
        — deliberately does **not** touch `r.categoryDetails` or `r.photos`: the Edit Request
        screen in the design has no "About the job" dynamic-fields section and no photo grid, so
        editing must never silently wipe those out.
      - Export `findOwned, listMine, cancelRequest, updateRequestDetails, RepairRequestLockedError`
        alongside the existing exports.
    files:
      - src/repairRequests/store.js
    rationale: |
      This is the only place repair-request state lives. AC3/AC4 both hinge on a correct,
      reusable notion of "found AND owned AND still Pending", so that logic belongs once in the
      store, not duplicated per-route.

  - description: |
      Add a second gate to `src/repairRequests/auth.js`, copied from the existing
      `src/jobs/auth.js` / `src/defects/auth.js` pattern (client-asserted `x-user-id`, fails
      closed in production, 401 if absent) — this repo duplicates this exact gate per-domain
      rather than sharing a lib, so this plan follows that convention:
      ```js
      function requireAuthenticatedUser(req, res, next) {
        const userId = req.headers['x-user-id'];
        if (process.env.NODE_ENV === 'production' || !userId) {
          return res.status(401).json({ error: 'unauthorized' });
        }
        req.userId = userId;
        next();
      }
      ```
      Export it alongside the existing `requireDispatcherRole`.
    files:
      - src/repairRequests/auth.js
    rationale: |
      The new `/mine`, `/:id`, PATCH and cancel routes all need a customer identity to check
      ownership against; this is the project's established (admittedly dev-only) seam for that.

  - description: |
      Wire the new store functions into `src/repairRequests/routes.js`:
      - `POST /` (existing, unchanged behavior otherwise): now builds
        `createRequest({ ...req.body, customerId: req.headers['x-user-id'] || '' })` so a request
        submitted by an identified customer is owned by them; anonymous submissions (no header)
        keep working exactly as the existing test `'customers can still submit without any role
        header'` requires, just with `customerId: ''`.
      - `GET /mine` (new, **registered before** `GET /:id` so Express doesn't swallow it as an
        id) — `requireAuthenticatedUser`, returns `listMine(req.userId)`.
      - `GET /:id` (new) — `requireAuthenticatedUser`; `findOwned(req.params.id, req.userId)`;
        404 `{ error: 'repair_request_not_found' }` if null; else 200 with the record.
      - `PATCH /:id` (new) — `requireAuthenticatedUser`; calls `updateRequestDetails`; 404 if
        null; catches `RepairRequestValidationError` → 400 `{ error: 'validation_error', fields }`;
        catches `RepairRequestLockedError` → 409
        `{ error: 'repair_request_locked', message: "A technician has already been assigned, so changes now go through support." }`.
      - `POST /:id/cancel` (new) — `requireAuthenticatedUser`; calls `cancelRequest`; same 404 /
        409 handling as PATCH (no validation-error case).
      - `GET /` (existing, dispatcher-only full list) is untouched.
    files:
      - src/repairRequests/routes.js
    rationale: |
      Mirrors the existing `POST /:id/deactivate` / `POST /:id/reactivate` action-route shape
      already used in `src/hires/routes.js` and `src/rooms/routes.js`, and the existing 409
      pattern (`RoomMaintenanceBlockedError` → 409) from `src/rooms/routes.js`.

  - description: |
      `public/js/services.js`'s `createDefaultApi().createRequest()` currently sends no identity
      header at all, so every repair request submitted through the shipped Browse Services flow
      (story 199) is created with `customerId: ''` and could never be found by the new
      ownership-gated routes. Add a `DEMO_CUSTOMER_ID = 'cust-204'` constant (same value used by
      the new My Requests page, see below — this repo simulates one signed-in customer, matching
      how `jobs.js`/`defects.js` each simulate one signed-in technician/reporter) and send
      `'x-user-id': DEMO_CUSTOMER_ID` on the `createRequest` fetch call only (not on
      `getCatalog`/`listQueue`, which are unaffected).
    files:
      - public/js/services.js
    rationale: |
      Without this one-line change, this story's feature would be unreachable end-to-end: no
      request created through the real app would ever be editable/cancellable, because none
      would have a `customerId` matching the My Requests page's demo identity.

  - description: |
      New customer-facing page built from the approved prototype
      `.arc/designs/TEST-M1-STORY-203-design.html`, following the same
      `public/<feature>.html` + `public/css/<feature>.css` + `public/js/<feature>.js` structure as
      `public/jobs.html` (story 205) and `public/defects.html`. Three screens, taken directly from
      the prototype's three `.screen` blocks (reviewer-only elements — `#review-bar`, the inline
      `#fixture-requests` JSON, and every `.demo-note` block — are dropped; they are explicitly
      marked "not part of the shipped app" in the prototype itself):

      1. **My Requests** (`data-name="My Requests"` in the prototype) — topbar with "Fixly" brand,
         "My requests" nav link, "Signed in as Jordan Avery" session line; page header "My
         requests" + subtitle; `#request-list` of cards built from `requestCardHTML` in the
         prototype — each card shows category icon+name, "Submitted {date}", status chip,
         time/address meta line, description, and ONLY for a `Pending` (customer-facing label
         "Submitted") request, `Edit` and `Cancel request` buttons alongside `View details`
         (prototype lines 893-919). Loading (skeleton cards), error (state-banner + Retry), and
         empty (`🗒️` empty-state) baseline states are carried over 1:1 from the prototype — these
         match every other list screen already shipped (`jobs.html`, `defects.html`) and aren't
         reviewer-only scaffolding.
      2. **Request Detail** (`data-name="Request Detail"`) — `#detail-denied` empty-state (AC4:
         "This repair request isn't associated with your account.") vs `#detail-content` card
         (`confirm-grid` dl of Request ID / Submitted / Preferred time / Service address /
         Description, a status chip, and one of: Edit+Cancel buttons (`Pending`), a `.notice`
         locked message naming the technician (`Assigned`), or a `.notice` cancelled message
         (`Cancelled`)) — exactly the prototype's `renderDetail()` branches (lines 996-1036), minus
         the reviewer-only `#detail-demo-note` / "Simulate: technician assigned" button (see
         assumption on how AC3's race condition is instead proven for real, without that button).
         `#detail-rejection-banner` renders the `.state-banner` shown by `showRejectionBanner()`
         when a real Edit/Cancel attempt is rejected by the server (AC3).
      3. **Edit Request** (`data-name="Edit Request"`) — reuses the prototype's exact field set
         (service category select, description textarea, date + time-window row, street/unit/city/
         state/zip address rows) pre-filled from the current record, `Save changes` / `Discard
         changes` buttons, and the same inline `.field-error` + error-summary pattern as
         `public/services.html`'s booking form.

      Plus the shared cancel-confirmation modal (`#cancel-modal-overlay`/`#cancel-modal-wrap`,
      title "Cancel this repair request?", body "This can't be undone. You'll need to submit a new
      request if you still need service.", `Keep request` / `Cancel request` buttons) and the
      `#toast` success-feedback element, both copied verbatim from the prototype
      (lines 805-825).

      Routing: hash-based, following `public/js/defects.js`'s `DETAIL_HASH` convention —
      `#/requests/:id` opens Request Detail, `#/requests/:id/edit` opens Edit Request, any other
      hash (or none) shows the My Requests list.
    files:
      - public/my-requests.html
    rationale: |
      The design is the only record of this UI and must be built as approved; reusing the
      existing per-feature file layout keeps this page consistent with every other screen in the
      app instead of introducing a new structural pattern.

  - description: |
      New feature stylesheet containing exactly the non-reviewer-only rules from the prototype's
      third `<style>` block (lines 337-459): `.status-chip` + its `.status-submitted` /
      `.status-assigned` / `.status-cancelled` variants (icon+shape+label, never color alone —
      same accessibility rule already documented in `public/css/jobs.css`), `#request-list` /
      `.request-card` / `.request-card-head` / `.request-card-title` / `.request-submitted-line` /
      `.request-meta` / `.request-description` / `.request-actions`, `.confirm-grid` /
      `.confirm-field` (shared detail-screen layout), `.notice` (neutral info box) and
      `.state-banner` (blocking rejection banner) — both already-established patterns reused
      verbatim, `.empty-state`, `.skeleton-card` / `.skeleton-block` (+ keyframes), and the shared
      edit-form layout: `.form-section`, `.form-row`/`.two-col`, `.required-mark`, `.input.invalid`,
      `.field-error`, `.submit-bar`. Deliberately excludes `.demo-note*` and `#review-bar` (review
      tooling, not shipped) and the `.stale-note` / `.status-stale` rules (see assumption on the
      "partial/stale status" baseline being out of this story's scope).
    files:
      - public/css/my-requests.css
    rationale: |
      Matches the established one-stylesheet-per-feature convention (`jobs.css`, `services.css`,
      `defects.css`), building only from existing design tokens as the prototype's own comment
      block requires ("Design-system gap note").

  - description: |
      New `initMyRequestsApp(doc, api)` + `createDefaultApi()` client module, mirroring
      `public/js/defects.js`'s shape (hash router, `show(index)` screen switcher, a
      `DEMO_CUSTOMER_ID = 'cust-204'` constant sent as `x-user-id` on every call — matching
      `public/js/services.js`'s new constant and the design's fixture `cust-204` / "Jordan
      Avery").

      API surface:
      ```js
      function createDefaultApi() {
        function request(url, method, body) {
          const opts = { method, headers: { 'Content-Type': 'application/json', 'x-user-id': DEMO_CUSTOMER_ID } };
          if (body !== undefined) opts.body = JSON.stringify(body);
          return fetch(url, opts).then((res) => res.json().catch(() => ({})).then((data) => (
            res.ok ? data : Promise.reject({ status: res.status, ...data })
          )));
        }
        return {
          listMine: () => request('/repair-requests/mine', 'GET'),
          get: (id) => request(`/repair-requests/${encodeURIComponent(id)}`, 'GET'),
          update: (id, payload) => request(`/repair-requests/${encodeURIComponent(id)}`, 'PATCH', payload),
          cancel: (id) => request(`/repair-requests/${encodeURIComponent(id)}/cancel`, 'POST'),
        };
      }
      ```

      Behavior, directly from the prototype's inline `<script>` (adapted from its one in-memory
      `REQUESTS` array to real `api` calls):
      - List: `renderRequestList` builds each card from `requestCardHTML`; only `Pending` cards
        get `data-edit`/`data-cancel` buttons (AC1/AC2, plus the preventive half of AC3 — an
        action is never *offered* once a request isn't Pending).
      - Cancel (AC1): clicking `data-cancel` opens the confirm modal (focus moves to `Keep
        request`, matching the prototype's `openCancelModal`); confirming calls
        `api.cancel(id)`. On success: close modal, `showToast('Request cancelled.')`, re-render
        the list/detail from the returned record.
      - Edit (AC2): clicking `data-edit` navigates to `#/requests/:id/edit`, pre-fills every field
        from the currently-loaded record (never re-fetches, same as the prototype's `openEdit`),
        client-side validates required fields exactly like `public/js/services.js`'s
        `validateForm`, then on submit calls `api.update(id, payload)`. On success:
        `showToast('Request updated.')`, navigate back to `#/requests/:id` with the updated
        record. `Discard changes` just navigates back without calling the API.
      - AC3, proven as a real rejection (not just a hidden button): because every Edit/Cancel
        attempt goes through `api.update`/`api.cancel` against the live server, if the request's
        status changed to `Assigned` after the page loaded (e.g. another device), the server
        rejects with `{ status: 409 }`. The client catches this on both the modal-confirm and
        form-submit paths, closes any open modal, re-fetches the record via `api.get(id)`,
        re-renders Request Detail in its now-locked state, and shows
        `#detail-rejection-banner` with the prototype's exact copy: `"Can't " + verb + " this
        request. A technician has already been assigned, so changes now go through support."`
        This reproduces the prototype's "Simulate: technician assigned just now" demo scenario
        without needing a fake simulate button in the shipped app — the real server is the one
        that flips the status and rejects the attempt.
      - AC4: `api.get(id)` rejecting with `{ status: 404 }` shows `#detail-denied` with the
        prototype's exact copy and hides `#detail-content`. Because the ownership check happens
        server-side, this covers both "never appeared in my list to begin with" and "I navigated
        to someone else's id directly".
      - List baseline states: loading skeleton while `api.listMine()` is pending, `.state-banner`
        + `Retry` button on rejection, empty-state when the resolved array is empty — same
        pattern as `public/js/jobs.js`'s `setListState`.
    files:
      - public/js/my-requests.js
    rationale: |
      Keeps this page's client architecture identical to its two closest siblings
      (`defects.js` for hash-routed list/detail/form, `jobs.js` for the list state machine) so a
      future reader doesn't have to learn a one-off pattern for this one page.

  - description: |
      New backend integration test file (supertest against `src/server.js`), one test per AC plus
      the identity/ownership plumbing they depend on:

      - AC1: `POST /repair-requests/:id/cancel` on a `Pending` request →
        `expect(res.status).toBe(200); expect(res.body.status).toBe('Cancelled'); expect(res.body.cancelledAt).toEqual(expect.any(String));`
      - AC2: `PATCH /repair-requests/:id` on a `Pending` request with new description/address →
        `expect(res.status).toBe(200); expect(res.body.description).toBe('Now leaking badly'); expect(res.body.address.city).toBe('Round Rock');`
      - AC3: force a request's status to `'Assigned'` by mutating the object returned from
        `store.getRequest(id)` directly (same direct-store-mutation pattern as
        `test/defects-view.test.js`'s `defectsStore.updateDefect(...)`), then
        `expect((await cancelAttempt).status).toBe(409); expect((await editAttempt).status).toBe(409); expect(store.getRequest(id).status).toBe('Assigned');`
        (original data is provably untouched by the rejected attempts).
      - AC4: create a request as `cust-204`, then attempt `GET`/`PATCH`/`cancel` as `cust-317` →
        `expect(getRes.status).toBe(404); expect(patchRes.status).toBe(404); expect(cancelRes.status).toBe(404); expect(store.getRequest(id).status).toBe('Pending');`
      - Identity gate: `GET /mine`, `GET /:id`, `PATCH /:id`, `POST /:id/cancel` all 401 without
        an `x-user-id` header, matching `test/jobs.test.js`'s `'rejects requests without an
        identity'` test.
      - `GET /repair-requests/mine` only returns the calling customer's own requests:
        `expect(res.body.find((r) => r.id === mineId)).toBeDefined(); expect(res.body.some((r) => r.customerId !== 'cust-204')).toBe(false);`
      - `services.js`'s real `createDefaultApi().createRequest()` tags the submission with
        `cust-204`, using the same ephemeral-`app.listen(0)` + real-`fetch` technique already in
        `test/repair-requests.test.js`'s `listQueue()` test:
        `expect(created.customerId).toBe('cust-204');`
    files:
      - test/repair-requests-self-service.test.js
    rationale: |
      Keeps story 199's already-merged `test/repair-requests.test.js` untouched (lower risk)
      while giving story 203 its own dedicated, fully test-first file.

  - description: |
      New jsdom UI test file for `public/my-requests.html` + `public/js/my-requests.js`, following
      the exact `document.documentElement.innerHTML = fs.readFileSync(...)` + mocked-`api`
      convention used by `test/jobs-list-ui.test.js` / `test/defects-list-detail-ui.test.js`:

      - Preventive AC3: a `Pending` card exposes `[data-edit]`/`[data-cancel]`; `Assigned` and
        `Cancelled` cards expose neither —
        `expect(submittedCard.querySelector('[data-edit]')).not.toBeNull(); expect(assignedCard.querySelector('[data-edit]')).toBeNull();`
      - AC1: click `[data-cancel="REQ-1"]` → modal visible → click `#cancel-modal-confirm` →
        `expect(api.cancel).toHaveBeenCalledWith('REQ-1'); expect(document.getElementById('toast').textContent).toBe('Request cancelled.');`
      - AC2: open edit, change description, submit →
        `expect(api.update).toHaveBeenCalledWith('REQ-1', expect.objectContaining({ description: 'New description' })); expect(document.getElementById('detail-description').textContent).toBe('New description');`
      - AC3 (real rejection): `api.cancel` rejects with `{ status: 409 }` →
        `expect(document.querySelector('#detail-rejection-banner [role="alert"]')).not.toBeNull(); expect(document.querySelector('[data-cancel="REQ-1"]')).toBeNull();`
        (screen re-renders locked, action no longer offered)
      - AC4: `api.get` rejects with `{ status: 404 }` for a direct `#/requests/REQ-9001` hash →
        `expect(document.getElementById('detail-denied').hidden).toBe(false); expect(document.getElementById('detail-content').hidden).toBe(true);`
      - Baseline: loading skeleton while `api.listMine()` is pending, `.state-banner` + Retry on
        rejection, empty-state when resolved to `[]`.
    files:
      - test/my-requests-ui.test.js
    rationale: |
      UI behavior (which buttons render, modal flow, rejection banner, denied state) isn't
      exercised by the supertest-only backend tests above, and this project consistently ships a
      dedicated jsdom test file per customer-facing screen.

tests:
  - |
    AC1 (backend): `POST /repair-requests/:id/cancel` on a Pending request returns 200 with
    `status: 'Cancelled'` and a `cancelledAt` timestamp:
    `expect(res.status).toBe(200); expect(res.body.status).toBe('Cancelled'); expect(res.body.cancelledAt).toEqual(expect.any(String));`
  - |
    AC1 (UI): confirming the cancel modal calls `api.cancel(id)` and shows the success toast:
    `expect(api.cancel).toHaveBeenCalledWith('REQ-1'); expect(document.getElementById('toast').textContent).toBe('Request cancelled.');`
  - |
    AC2 (backend): `PATCH /repair-requests/:id` on a Pending request updates its fields:
    `expect(res.status).toBe(200); expect(res.body.description).toBe('Now leaking badly'); expect(res.body.address.city).toBe('Round Rock');`
  - |
    AC2 (UI): saving the edit form submits the new values and the detail view reflects them:
    `expect(api.update).toHaveBeenCalledWith('REQ-1', expect.objectContaining({ description: 'New description' })); expect(document.getElementById('detail-description').textContent).toBe('New description');`
  - |
    AC3 (backend): once a request's status is `'Assigned'` (set directly via the store, same
    precondition-seeding technique as `test/defects-view.test.js`), both cancel and edit are
    rejected and the record is untouched:
    `expect(cancelRes.status).toBe(409); expect(editRes.status).toBe(409); expect(store.getRequest(id).status).toBe('Assigned');`
  - |
    AC3 (UI): a cancel/edit attempt the server rejects with 409 (status changed since the page
    loaded) shows the blocking rejection banner and the screen re-renders so the action is no
    longer offered:
    `expect(document.querySelector('#detail-rejection-banner [role="alert"]')).not.toBeNull(); expect(document.querySelector('[data-cancel="REQ-1"]')).toBeNull();`
  - |
    AC4 (backend): a different customer's `GET`/`PATCH`/cancel attempts on someone else's request
    all 404, and the request is untouched:
    `expect(getRes.status).toBe(404); expect(patchRes.status).toBe(404); expect(cancelRes.status).toBe(404); expect(store.getRequest(id).status).toBe('Pending');`
  - |
    AC4 (UI): opening a request id that 404s shows the denied state and reveals no request
    details:
    `expect(document.getElementById('detail-denied').hidden).toBe(false); expect(document.getElementById('detail-content').hidden).toBe(true);`

assumptions_or_open_questions:
  - |
    **Status-vocabulary conflict between the already-shipped backend and this story's AC/design
    wording.** `src/repairRequests/store.js` (story 199, already merged) stores the initial state
    as `status: 'Pending'`, and `test/repair-requests.test.js` already asserts
    `res.body.status === 'Pending'`. The AC text says "Submitted status" and the approved
    prototype's status chip literally renders the label `"Submitted"`
    (`{ 'Submitted': {...}, 'Assigned': {...}, 'Cancelled': {...} }[status]` at prototype line
    870). Renaming the stored value to `'Submitted'` would break story 199's already-merged test
    and would also change the copy the dispatcher-facing Admin Dispatch Queue screen shows
    (`public/js/services.js` renders `r.status` verbatim as "Pending" there, by design). This
    plan resolves the conflict by **keeping the stored value `'Pending'` unchanged** and only
    translating it to the customer-facing label "Submitted" in the new My Requests / Request
    Detail UI's `statusChipHTML` — i.e. "Submitted" in the AC/design is the customer-facing name
    for the same state the rest of the system already calls `'Pending'`. Flagging this explicitly
    per instructions, since it's a real conflict and not an invented assumption.
  - |
    The prototype's "partial" list baseline (one card's status shown as stale with a dashed chip
    + inline "Refresh status" retry, lines 625-629/902-904/955-963 of the prototype) doesn't map
    to any of this story's four ACs — there is no polling or live-refresh AC here (unlike story
    195's defects list, which has an explicit AC3 for that). Treated as out of this story's scope
    along with the reviewer-only `#review-bar` / `.demo-note` elements; not implemented.
  - |
    Anonymous repair-request submissions (no `x-user-id` header) continue to be accepted per
    story 199's existing test, now simply recorded with `customerId: ''`. Such a request can
    never subsequently be found by the new ownership-gated routes (no identity can ever equal
    `''`), which is intentional — self-service requires knowing who submitted it.
  - |
    This repo has no real authentication; every new route reuses the project's existing
    client-asserted `x-user-id` convention (`src/jobs/auth.js`, `src/defects/auth.js`), which
    fails closed in production. The demo identity `cust-204` ("Jordan Avery") is hard-coded into
    both `public/js/services.js` (on create) and `public/js/my-requests.js` (on every call),
    matching the prototype's fixture data, so a submission made through the shipped booking flow
    is visible and actionable in My Requests in this demo environment.
  - |
    `GET /repair-requests/:id` and `PATCH /repair-requests/:id` are new routes distinct from the
    existing dispatcher-only `GET /repair-requests` (plural list) — no route-shape conflict, but
    `GET /mine` must be registered before `GET /:id` or Express would treat `mine` as an id.

package_dependencies: []

notes: |
  Read `.arc/designs/TEST-M1-STORY-203-design.html` in full, including its fixture data, inline
  `<script>` behavior, and the HTML comment block at lines 461-504 documenting the design's own
  reasoning (no destructive-red token exists, so Cancel stays on the shared primary button style;
  AC3 is demonstrated as a genuine rejected attempt via a "simulate technician assigned" reviewer
  button; AC4 is demonstrated via a denied-detail screen reachable by direct id). That reviewer
  tooling (the race-condition simulate button, the list's "partial/stale" preview, the whole
  `#review-bar`) is explicitly marked "not part of the shipped app" in the prototype itself and is
  excluded here; this plan's AC3 UI test reproduces the same scenario for real, by having the
  mocked `api.cancel`/`api.update` reject with 409 as the live server would once another device
  changed the status.

  Also read the existing codebase conventions this plan follows:
  - `src/jobs/auth.js` / `src/defects/auth.js` for the `x-user-id` → `req.userId` dev-identity
    gate (duplicated per-domain in this repo, not shared).
  - `src/defects/routes.js`'s `isVisibleTo` + single 404 branch for indistinguishable
    missing-vs-not-yours responses (reused for AC4).
  - `src/hires/routes.js` / `src/rooms/routes.js`'s `POST /:id/deactivate` action-route shape
    (reused for `POST /:id/cancel`) and `src/rooms/store.js`'s `RoomMaintenanceBlockedError` → 409
    pattern (reused for `RepairRequestLockedError`).
  - `test/defects-view.test.js`'s direct `store.updateDefect(id, { status: ... })` precondition
    seeding (reused to force a request into `'Assigned'` for AC3 tests, via direct mutation of the
    object `store.getRequest(id)` returns).
  - `public/js/defects.js` (hash routing: list/detail) and `public/js/jobs.js` (list
    loading/error/empty state machine) as the two structural templates for
    `public/js/my-requests.js`.

  ```mermaid
  flowchart TD
    html[public/my-requests.html] -->|loads script| js[public/js/my-requests.js]
    js -->|GET /mine, GET/PATCH /:id, POST /:id/cancel, x-user-id header| routes[src/repairRequests/routes.js]
    svc[public/js/services.js] -->|POST / now sends x-user-id| routes
    routes -->|requireAuthenticatedUser| auth[src/repairRequests/auth.js]
    routes --> store[src/repairRequests/store.js]
    store -->|getCategory/getTimeWindow, unchanged| catalog[src/serviceCatalog/store.js]

    classDef touched fill:#f96,color:#000
    class html,js,svc,routes,auth,store touched
  ```

review_focus: |
  In scope: the four ACs only — cancel/edit while Pending, rejection once Assigned, rejection for
  a non-owning customer — plus the minimal wiring (customerId capture on create) needed to make
  ownership checks meaningful at all. Out of scope, deliberately: any real "assign a technician"
  flow (nothing in this codebase transitions a repair request to Assigned yet, so AC3's
  precondition is seeded directly via the store in tests, same as `test/defects-view.test.js`
  already does for defect status), the prototype's "partial/stale status" list state, and real
  authentication (the `x-user-id` header convention is pre-existing and intentionally
  dev-only/fail-closed-in-production, not something this plan introduces or hardens).
  Riskiest area: the 404-for-missing-vs-not-owned indistinguishability (AC4) and the 409 "locked"
  path (AC3) both depend on `findOwned`/`cancelRequest`/`updateRequestDetails` being the *only*
  way routes touch a request's ownership/status — a reviewer should check no route accidentally
  uses the old unguarded `getRequest`/direct map access for these new endpoints. Also worth double
  checking: the explicit decision to keep the backend's stored status as `'Pending'` rather than
  renaming it to `'Submitted'` (see assumptions) — this is deliberate, not an oversight, to avoid
  breaking story 199's already-merged contract and dispatcher-facing copy.
