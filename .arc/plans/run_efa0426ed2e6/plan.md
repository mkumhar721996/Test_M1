summary: |
  Add server-owned Rate Plan Management: a named-plan domain store with date ranges and
  per-room-type flat per-night prices, a deterministic price-resolution function (most-recently-
  created plan wins on overlap, base rate as the ultimate fallback), REST endpoints for CRUD plus
  a price-lookup query, and the three interactive screens shown in the approved prototype
  (`.arc/designs/TEST-M1-STORY-098-design.html`): the Rate Plans list (table + empty state +
  delete-confirm modal), the Rate Plan Editor (shared create/edit form with inline validation),
  and the Price Lookup screen (preset scenarios, skeleton loading state, result + overlap note).
  This follows the existing per-domain store+routes pattern (`src/guests`, `src/hires`) rather
  than the localStorage-only pattern used by the Expense Tracker, because rate plans must be a
  server-side "reliable source of truth" per the parent epic, and because AC4's determinism has
  to hold no matter which client asks.

scope:
  - description: |
      Create the rate-plan domain store: an in-memory `Map` of plans, a static, read-only
      `ROOM_TYPES` seed (room code, display name, base rate) mirroring the four room types in the
      approved design's fixture data (Standard King $129, Garden Room $149, Ocean View Suite $189,
      Poolside Cabana Suite $219 — confirmed against the design's `fixture-data` JSON block), a
      `RatePlanValidationError` (400-mapped, mirrors `GuestValidationError` in
      `src/guests/store.js`), and the core functions:

      ```js
      function createRatePlan(data) { /* validates, assigns id/createdAt/updatedAt */ }
      function getRatePlan(id) {}
      function listRatePlans() {}
      function updateRatePlan(id, changes) { /* re-validates merged result */ }
      function deleteRatePlan(id) { /* returns boolean */ }
      function listRoomTypes() { return ROOM_TYPES; }
      function resolvePrice(roomType, dateStr) {
        // candidates = plans whose prices[] cover roomType AND dateStr is within [startDate,endDate]
        // no candidates -> { source: 'base', roomType, price: baseRateOf(roomType) }
        // else -> sort candidates by createdAt DESC, winner = candidates[0]
        //   -> { source: 'plan', roomType, price, plan: {...}, overlapping: candidates.slice(1) }
      }
      ```

      Validation rules (`assertValidPlan`): name required (non-blank), startDate and endDate
      required with `endDate >= startDate`, at least one price row, each price row references a
      known `ROOM_TYPES` code exactly once (no duplicates within a plan), and each price is a
      number greater than 0. This is the single place AC1/AC2/AC3/AC5/AC6/AC8 are enforced.
    files:
      - src/ratePlans/store.js
    rationale: |
      Mirrors `src/guests/store.js` and `src/hires/store.js` (Map-backed store, a
      `*ValidationError` with `statusCode`, plain functions re-exported to routes and to tests) —
      both files read and confirmed to follow this exact shape. `resolvePrice`'s tie-break
      (`createdAt` descending) is exactly the rule the approved design already implements in its
      inline `resolvePrice`/`findOverlaps` functions (confirmed by reading the design's embedded
      `<script>`) and demonstrates on both the list screen (inline "⚠ overlaps with…" note) and
      the Price Lookup screen, so AC4 is satisfied identically wherever it's invoked from.

  - description: |
      Create the Express router for rate plans, mounted at `/rate-plans`:

      ```js
      router.get('/', ...)                 // listRatePlans()
      router.get('/room-types', ...)       // listRoomTypes() — registered BEFORE '/:id'
      router.get('/price-lookup', ...)     // resolvePrice(req.query.roomType, req.query.date)
      router.post('/', ...)                // createRatePlan(req.body) -> 201
      router.get('/:id', ...)              // getRatePlan(id) -> 404 if missing
      router.patch('/:id', ...)            // updateRatePlan(id, req.body) -> 404 if missing
      router.delete('/:id', ...)           // deleteRatePlan(id) -> 204, or 404 if missing
      ```

      `/room-types` and `/price-lookup` must be registered ahead of the `/:id` route so they are
      not swallowed by the id matcher (same ordering hazard as any Express router with a
      catch-all `:id` segment). `price-lookup` returns 400 if `roomType` or `date` is missing.
      `RatePlanValidationError` is caught and mapped to `res.status(400).json({ error: ... })`,
      identical to how `guests/routes.js` handles `GuestValidationError`.
    files:
      - src/ratePlans/routes.js
    rationale: |
      Matches the existing `guests`/`hires` router shape (`router.get('/')`,
      `router.post('/')`, `router.get('/:id')`, error-instance mapping to 400, as read directly
      in `src/guests/routes.js`) so the new domain is consistent with the rest of the codebase.

  - description: |
      Mount the new router in the Express app, next to the other domain routers:
      `const ratePlansRouter = require('./ratePlans/routes');` plus
      `app.use('/rate-plans', ratePlansRouter);`.
    files:
      - src/server.js
    rationale: |
      One-line addition, same pattern as the existing `guestsRouter`/`hiresRouter` mounts already
      confirmed present in this file (`app.use('/guests', guestsRouter);` etc.).

  - description: |
      Build the three product screens from the approved design, as their own static page
      (this codebase's convention: each domain gets its own HTML entry point — confirmed via
      `public/guest-profiles.html`, `public/hire-profile.html` — rather than being folded into
      `public/index.html`, which is the unrelated Expense Tracker page).

      **Rate Plans (list)** — ported from the design's `data-name="Rate Plans"` screen: the
      `.app-topbar` (Rates/Room Types/Bookings nav, "Rates" active, other two links inert exactly
      as in the design), the `toolbar-row` with `#rp-count-summary` and `#new-plan-btn`
      ("+ New rate plan"), the `.card.table-card` with `table.rp-table` (`Plan | Date range |
      Status | Per-room-type prices | Actions` columns, `#rp-tbody`), the `#rp-empty` empty-state
      card (AC7: "No rate plans yet" + "+ Add a rate plan" button), and the delete-confirm modal
      (`#delete-overlay`/`#delete-modal`/`#delete-plan-name`/`#confirm-delete-btn`) with its
      consequence copy about falling back to base rate or another overlapping plan.

      **Rate Plan Editor** — ported from the design's `data-name="Rate Plan Editor"` screen: the
      `#editor-form` with `#plan-name`/`#error-name`, the `.date-range-fields` grid
      (`#plan-start`/`#plan-end`/`#error-dates`), the dynamic `#price-rows` container (one
      `.rp-price-row` per price with a room-type `<select>` restricted to not-yet-used room
      types, a `$`-prefixed price `<input type=number min=0>`, and a remove button),
      `#error-price-rows`, and `#add-price-row-btn`. Reused for both create and edit exactly as
      the design's own comment describes ("Reused for both '+ New rate plan' ... and 'Edit' ...
      prefilled").

      **Price Lookup** — ported from the design's `data-name="Price Lookup"` screen: the
      `.preset-row` of three `.preset-btn` scenario buttons (`data-room`/`data-date` exactly as
      in the design — STD-KING/2026-12-25 overlap, GARDEN/2026-03-01 base rate, OCEAN/2026-07-10
      plan match), the `#lookup-form` (`#lookup-room` select, `#lookup-date` input), the
      `#lookup-loading` skeleton state, and the `#lookup-result` card
      (`#lookup-price`/`#lookup-source-text`/`#lookup-overlap-note`/`#lookup-overlap-text`).

      Two deliberate deviations from the literal prototype, both called out for reviewer
      sign-off in `assumptions_or_open_questions`: (1) the design's fourth screen
      ("Reference: key states") is a static reviewer aid, not a product screen, and is not built;
      (2) the design has no in-product control for reaching Price Lookup from the list (only the
      reviewer prev/next bar) — a "Price lookup" link is added to the list's `toolbar-row` and a
      `.back-link` ("← Back to rate plans", the same component the Editor already uses) is added
      to the Price Lookup screen.
    files:
      - public/rate-plans.html
    rationale: |
      The design is the only record of this UI; every id/class referenced above was read
      directly out of `.arc/designs/TEST-M1-STORY-098-design.html` so the shipped markup matches
      what was reviewed and approved.

  - description: |
      Page-specific styles, ported verbatim from the approved design's inlined `<style>` rules
      that are specific to this page (`.rp-table` and friends, `.status-chip` variants,
      `.rp-price-row`/`.price-input-wrap`/`.price-row-remove`, `.card-section-header`,
      `.consequence-note`, `.lookup-form`/`.preset-row`/`.preset-btn`/`.lookup-skeleton`/
      `.lookup-result-price`/`.lookup-source`/`.lookup-overlap-note`, `.empty-state`/
      `.not-found-panel`, `.field-error-text`/`.input-error`/`.field-hint`/`.date-range-fields`,
      `.back-link`/`.toolbar-row`/`.reset-link`/`.signed-in-as`/`.topbar-actions`). Shared
      primitives (`.app-topbar`, `.modal-*`, `.toast`, `.btn`, `.card`, `.input`, `.field`,
      `.label`, `.chip`) are NOT duplicated here — confirmed by reading
      `design-system/prototype-utils.css` directly, which already defines all of
      `.app-topbar`, `.btn`, `.card`, `.chip`, `.input`, `.label`, `.modal-overlay`, `.field`,
      and `.toast` — and are linked in the new page the same way `public/css/guest-profiles.css`
      does (confirmed: its own top comment reads "App shell ... live in
      design-system/prototype-utils.css").
    files:
      - public/css/rate-plans.css
    rationale: |
      Every existing page (`guest-profiles.css`, `expenses.css`, `hire-profile.css`) keeps its
      own page-specific classes in its own file rather than editing the shared
      `prototype-utils.css`, which was verified to contain only the generic primitives; following
      that exact split keeps this change low blast-radius (no risk of altering other stories'
      already-shipped pages) and matches the plain-CSS design tokens already used throughout.

  - description: |
      Client app logic, mirroring the shape of `public/js/guest-profiles.js`
      (`initXApp(doc, initialData, ..., api)` + `createDefaultApi()` + a `DOMContentLoaded`
      bootstrap, confirmed by reading that file's `initGuestProfilesApp(doc, initialGuests, api)`
      signature):

      ```js
      function initRatePlansApp(doc, initialPlans, roomTypes, api) { ... }
      function createDefaultApi() { ... } // fetch wrappers for /rate-plans endpoints
      function computeOverlapsForPlan(plan, allPlans) { ... } // pure, for the list's inline note
      module.exports = { initRatePlansApp, createDefaultApi, computeOverlapsForPlan };
      ```

      Responsibilities: render the plans table (status chip computed from today's date vs.
      `[startDate,endDate]`, price chips per room, the AC3 fallback note when
      `prices.length < roomTypes.length`, and the AC4 overlap note via `computeOverlapsForPlan`,
      which reimplements the design's own `findOverlaps` tie-break — `createdAt` descending —
      client-side over the already-fetched plans array, exactly as the design does); open/close
      the create-or-edit editor and run the same field validation as the design's inline submit
      handler (blank name, missing/inverted dates, empty or duplicate/incomplete price rows); call
      `api.create`/`api.update`/`api.remove` and re-render on success, showing the toast copy the
      design specifies; and drive the Price Lookup screen (`api.priceLookup(roomType, date)`
      against the server's `resolvePrice`, loading skeleton, result panel, overlap note).
    files:
      - public/js/rate-plans.js
    rationale: |
      Following `guest-profiles.js`'s `init*App(doc, ..., api)` shape keeps this page testable
      the same way — tests construct a fake `api` object and drive the DOM, with no real network
      calls, exactly like `test/guest-profiles.test.js` already does.

  - description: |
      Backend/API tests (supertest against the real Express `app`), one file per this codebase's
      existing convention (confirmed via `test/guests.test.js`, `test/hires.test.js`).
    files:
      - test/rate-plans.test.js
    rationale: |
      Exercises the full stack (routes -> store) the same way `test/guests.test.js` exercises
      `src/guests`, catching wiring mistakes (route ordering, JSON body parsing, status codes)
      that a store-only unit test can't.

  - description: |
      Store-level unit tests (direct `require('../src/ratePlans/store')`, no HTTP), one file per
      this codebase's existing convention (confirmed via `test/hires-store.test.js`, which unit-
      tests `src/hires/store.js` directly). Covers the price-resolution and validation edge cases
      precisely, including the exact overlap/tie-break scenario the approved design uses as its
      own worked example (Winter Promo 2026 vs. Holiday Flash Sale, both pricing Standard King,
      overlapping Dec 20–31, 2026).
    files:
      - test/rate-plans-store.test.js
    rationale: |
      `resolvePrice`'s branching (no candidates / one candidate / multiple overlapping
      candidates) is easiest to pin down precisely at the unit level, matching how
      `hires-store.test.js` unit-tests `src/hires/store.js`'s branchier `updateHire`/
      `reactivateHire` logic directly rather than only through the API.

  - description: |
      UI tests (jsdom, following `test/guest-profiles.test.js`'s pattern: load the real HTML file
      into `document.documentElement.innerHTML`, `require` the page's JS module, call
      `initRatePlansApp(document, fixturePlans, fixtureRoomTypes, fakeApi)`, then interact via
      DOM events).
    files:
      - test/rate-plans-ui.test.js
    rationale: |
      Verifies the screens ported from the design actually render and wire up correctly
      (empty state, inline validation, price-row add/remove, delete-confirm modal, price-lookup
      result/overlap rendering) independent of the backend, matching this repo's established
      split between API tests and UI tests.

tests:
  - |
    // AC1 (test/rate-plans.test.js) — create with name, date range, and one price is saved and listed
    test('AC1: creating a rate plan with a name, date range, and one price is saved and listed', async () => {
      const res = await request(app).post('/rate-plans').send({
        name: 'Summer Peak 2026', startDate: '2026-06-01', endDate: '2026-08-31',
        prices: [{ roomType: 'STD-KING', price: 159 }],
      });
      expect(res.status).toBe(201);
      expect(typeof res.body.id).toBe('string');
      const listRes = await request(app).get('/rate-plans');
      expect(listRes.body.some((p) => p.id === res.body.id)).toBe(true);
    });
  - |
    // AC2 (test/rate-plans-store.test.js) — editing name/dates/prices takes effect on future lookups
    test("AC2: editing a plan's price changes future price lookups", () => {
      const plan = createRatePlan({ name: 'Autumn', startDate: '2026-09-01', endDate: '2026-11-30', prices: [{ roomType: 'GARDEN', price: 135 }] });
      updateRatePlan(plan.id, { prices: [{ roomType: 'GARDEN', price: 99 }] });
      expect(resolvePrice('GARDEN', '2026-10-01')).toMatchObject({ source: 'plan', price: 99 });
    });
  - |
    // AC3 (test/rate-plans-store.test.js) — a room type not listed on a plan falls back to base rate
    test("AC3: a room type not listed on a plan falls back to its base rate", () => {
      createRatePlan({ name: 'Autumn Weekday Rate', startDate: '2026-09-01', endDate: '2026-11-30', prices: [{ roomType: 'GARDEN', price: 135 }] });
      expect(resolvePrice('STD-KING', '2026-10-01')).toEqual({ source: 'base', roomType: 'STD-KING', price: 129 });
    });
  - |
    // AC4 (test/rate-plans-store.test.js) — overlapping plans resolve deterministically, no throw
    test('AC4: two overlapping plans resolve deterministically to the most-recently-created plan, without erroring', () => {
      const older = createRatePlan({ name: 'Winter Promo 2026', startDate: '2026-12-01', endDate: '2027-01-15', prices: [{ roomType: 'STD-KING', price: 99 }] });
      const newer = createRatePlan({ name: 'Holiday Flash Sale', startDate: '2026-12-20', endDate: '2026-12-31', prices: [{ roomType: 'STD-KING', price: 89 }] });
      expect(() => resolvePrice('STD-KING', '2026-12-25')).not.toThrow();
      const result = resolvePrice('STD-KING', '2026-12-25');
      expect(result.plan.id).toBe(newer.id);
      expect(result.price).toBe(89);
      expect(result.overlapping[0].id).toBe(older.id);
    });
  - |
    // AC5/AC6 (test/rate-plans-store.test.js) — missing name is rejected and not saved
    test('AC5/AC6: a missing name is rejected and not saved', () => {
      const before = listRatePlans().length;
      expect(() => createRatePlan({ name: '', startDate: '2026-01-01', endDate: '2026-01-10', prices: [{ roomType: 'GARDEN', price: 100 }] }))
        .toThrow(RatePlanValidationError);
      expect(listRatePlans().length).toBe(before);
    });
  - |
    // AC5/AC6 (test/rate-plans-store.test.js) — end date before start date is rejected and not saved
    test('AC5/AC6: an end date before the start date is rejected and not saved', () => {
      const before = listRatePlans().length;
      expect(() => createRatePlan({ name: 'Bad Range', startDate: '2026-05-10', endDate: '2026-05-01', prices: [{ roomType: 'GARDEN', price: 100 }] }))
        .toThrow(RatePlanValidationError);
      expect(listRatePlans().length).toBe(before);
    });
  - |
    // AC5/AC6 UI (test/rate-plans-ui.test.js) — inline errors shown, no row added, matches design's error copy
    test('AC5/AC6 UI: submitting the editor with a blank name shows the inline error and adds nothing to the list', () => {
      const api = { create: jest.fn() };
      const { initRatePlansApp } = require('../public/js/rate-plans');
      initRatePlansApp(document, [], ROOM_TYPES_FIXTURE, api);
      document.getElementById('new-plan-btn').click();
      document.getElementById('editor-form').dispatchEvent(new Event('submit', { cancelable: true }));
      expect(document.getElementById('error-name').hidden).toBe(false);
      expect(api.create).not.toHaveBeenCalled();
    });
  - |
    // AC7 (test/rate-plans-ui.test.js) — empty list shows the empty-state prompt, not a blank table
    test('AC7: an empty rate plan list shows the empty-state prompt', () => {
      const { initRatePlansApp } = require('../public/js/rate-plans');
      initRatePlansApp(document, [], ROOM_TYPES_FIXTURE, {});
      expect(document.getElementById('rp-empty').hidden).toBe(false);
      expect(document.getElementById('rp-table-wrap').hidden).toBe(true);
    });
  - |
    // AC8 (test/rate-plans.test.js) — no rate plan covers this room type/date, so base rate is returned
    test('AC8: no rate plan covers this room type/date, so the base rate is returned', async () => {
      const res = await request(app).get('/rate-plans/price-lookup').query({ roomType: 'GARDEN', date: '2026-03-01' });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ source: 'base', price: 149 });
    });

assumptions_or_open_questions:
  - |
    Room types and their base rates aren't owned by any existing module in this codebase. A
    minimal, read-only `ROOM_TYPES` seed (code/name/baseRate) is added inside the rate-plan store
    itself, matching the four room types in the approved design's fixture data exactly (Standard
    King $129, Garden Room $149, Ocean View Suite $189, Poolside Cabana Suite $219), since AC3 and
    AC8 both require a base rate to fall back to. Full Room Type management (the design's inert
    "Room Types" nav link) is a separate, out-of-scope story per the parent epic's own listing of
    "room types, individual rooms, rate plans, and availability" as distinct concerns.
  - |
    The design's "Reset demo data" button and its four pre-seeded rate plans (Summer Peak 2026,
    Autumn Weekday Rate, Winter Promo 2026, Holiday Flash Sale) are reviewer/demo affordances for
    replaying fixture states in the standalone prototype, not a real product feature. Production
    starts with an empty rate-plan list — which is also what makes AC7's empty state reachable on
    first load without any manual deletion.
  - |
    The approved design has no in-product control for moving from the Rate Plans list to the
    Price Lookup screen — only the reviewer's prev/next bar switches between all four screens.
    A "Price lookup" link was added to the list's `toolbar-row` and a `.back-link` ("← Back to
    rate plans") to the Price Lookup screen, reusing components the design already defines
    elsewhere (the Editor's back-link). Flagging for explicit reviewer sign-off since it's new
    layout the prototype itself doesn't show.
  - |
    The design's fourth screen, "Reference: key states", is explicitly authored as a static
    reviewer cross-reference ("static reference for reviewers scanning quickly") rather than a
    product screen, and is intentionally not built.
  - |
    Deleting an entire rate plan has no dedicated acceptance criterion, but is included because
    (a) the approved design builds full delete UI (confirm modal + consequence copy) as the
    mechanism for reaching AC7's empty state, and (b) the parent epic frames this story as owning
    the full "management" of rate plans, not creation/edit only.
  - |
    "Most-recently-created plan wins" is treated as the deterministic tie-break rule for AC4
    (ties broken by `createdAt` descending), exactly matching the approved design's own
    `resolvePrice`/`findOverlaps` implementation and its worked example (Winter Promo 2026 created
    2026-06-01 vs. Holiday Flash Sale created 2026-09-15, both overlapping Dec 20–31, 2026 for
    Standard King) — no other tie-break rule was specified in the acceptance criteria.

package_dependencies: []

notes: |
  All required libraries (`express`, `jest`, `jest-environment-jsdom`, `supertest`,
  `@testing-library/dom`) are already in `package.json`; nothing new to install.

  This is a revision/verification pass: the current codebase was re-read file-by-file against
  every path and claim in this plan (`src/guests/store.js`, `src/guests/routes.js`,
  `src/server.js`, `public/css/guest-profiles.css`, `public/js/guest-profiles.js`,
  `test/hires-store.test.js`, and the design's shared-primitive claims in
  `design-system/prototype-utils.css`) plus the full design HTML itself (element ids/classes,
  fixture data, `resolvePrice`/`findOverlaps` tie-break). No drift was found — every referenced
  file, function, id, and class still exists exactly as cited — and there was no new reviewer
  feedback to apply, so the plan is unchanged in substance from the prior draft.

  ```mermaid
  flowchart TD
    server[src/server.js]
    routes[src/ratePlans/routes.js]
    store[src/ratePlans/store.js]
    html[public/rate-plans.html]
    js[public/js/rate-plans.js]
    css[public/css/rate-plans.css]
    proto[design-system/prototype-utils.css]

    server -->|mounts app.use of rate-plans| routes
    routes -->|createRatePlan / updateRatePlan / listRatePlans / deleteRatePlan / resolvePrice / listRoomTypes| store
    js -->|fetch rate-plans, rate-plans price-lookup, rate-plans room-types| routes
    html -->|script src rate-plans.js defer| js
    js -->|renders rows, editor, lookup result into| html
    html -.->|link rel stylesheet, shared primitives| proto
    css -.->|link rel stylesheet, page-specific rules| html

    classDef touched fill:#f96,color:#000
    class server,routes,store,html,js,css touched
  ```

  `src/index.js` (the HTTP listener) and the other domain routers already mounted in
  `src/server.js` (`employees`, `workflows`, `runs`, `hires`, `guests`) are unaffected — this
  adds one new sibling router, it doesn't touch existing ones.

review_focus: |
  In scope: the `src/ratePlans` store+routes pair, the three product screens from the approved
  design (list, editor, price lookup), and their tests. Out of scope: any Room Type management UI
  (the design's inert "Room Types" nav link), and the design's fourth "Reference" screen (a
  reviewer-only aid, not a product screen). The riskiest area is `resolvePrice`'s overlap
  tie-break (`createdAt` descending) — it must stay deterministic across repeated calls with
  identical inputs (AC5) and must be implemented identically in the store (server truth) and in
  the client's `computeOverlapsForPlan` (display-only annotation), so a reviewer should check both
  sides agree rather than assuming client-side overlap text is decorative. Two additions are
  deliberate deviations from the literal prototype needing explicit sign-off: a "Price lookup"
  link and a `.back-link` were added since the design has no in-product navigation between those
  screens — do not flag these as unapproved scope creep, they're called out in
  `assumptions_or_open_questions`.
