summary: |
  Implement staff-facing Rate Plan Management: named rate plans with a date range and
  per-room-type flat nightly prices, plus the deterministic price-resolution rule that lets any
  other epic ask "what does room type X cost on date Y" and get a single, non-erroring answer
  (a rate-plan override when one applies, else the room type's base rate). The backend adds a
  small read-only room-types seed (base rates only — full room-type CRUD is explicitly out of
  scope per the design's inert "Room types" nav link) and a new rate-plans module (store +
  routes) that owns validation, CRUD, and the resolution algorithm as the single source of
  truth. The frontend builds the three screens already approved in
  `.arc/designs/TEST-M1-STORY-098-design.html` — Rate plans list, Rate plan editor, and Price
  lookup — reusing that file's exact class names, IDs, and copy, following this repo's existing
  `public/*.html` + `public/js/*.js` + `initXApp(doc, ...data, api)` convention seen in
  `guest-profiles.html`/`guest-profiles.js`.
scope:
  - description: |
      Add a minimal, read-only room-types seed module so rate plans have base rates to fall
      back to (AC3, AC8) and so the editor/list/lookup screens can populate room-type options.
      Seed data matches the fixture already baked into the approved design's
      `#fixture-data` script block exactly (`rt-queen` Standard Queen $120, `rt-king` Deluxe
      King $150, `rt-suite` Suite $240, `rt-twin` Twin $110):

      ```js
      // src/roomTypes/store.js
      const ROOM_TYPES = [
        { id: 'rt-queen', name: 'Standard Queen', baseRate: 120 },
        { id: 'rt-king', name: 'Deluxe King', baseRate: 150 },
        { id: 'rt-suite', name: 'Suite', baseRate: 240 },
        { id: 'rt-twin', name: 'Twin', baseRate: 110 },
      ];

      function listRoomTypes() { return ROOM_TYPES.map((rt) => ({ ...rt })); }
      function getRoomType(id) { return ROOM_TYPES.find((rt) => rt.id === id); }

      module.exports = { listRoomTypes, getRoomType };
      ```

      `src/roomTypes/routes.js` exposes only `GET /` (no create/update/delete — management is
      out of scope), mirroring the router shape of `src/guests/routes.js`. Mount it in
      `src/server.js` as `app.use('/room-types', roomTypesRouter)` next to the existing
      `app.use('/guests', guestsRouter)` line.
    files:
      - src/roomTypes/store.js
      - src/roomTypes/routes.js
      - src/server.js
    rationale: |
      AC3 ("room types not listed fall back to their base rate") and AC8 ("no active rate plan
      returns the base rate") both require a base rate per room type. No room-types module
      exists anywhere in the codebase today (confirmed via grep), and the design itself marks
      full room-type management as out of scope (inert "Room types" nav link, commented
      "out of scope for this story" in the design's screen-1 notes) — so this is deliberately a
      seed, not a CRUD feature.
  - description: |
      Add `src/ratePlans/store.js`: an in-memory `Map`-backed store (matching
      `src/guests/store.js`'s pattern) owning validation, CRUD, and the deterministic
      price-resolution algorithm — the actual source-of-truth logic the parent epic calls out.

      ```js
      // src/ratePlans/store.js
      class RatePlanValidationError extends Error {
        constructor(message) { super(message); this.statusCode = 400; }
      }

      function assertValidPlan(name, startDate, endDate, prices) {
        if (!name) throw new RatePlanValidationError('name is required');
        if (!startDate || !endDate) throw new RatePlanValidationError('start and end dates are required');
        if (new Date(endDate) < new Date(startDate)) {
          throw new RatePlanValidationError('end date must be on or after the start date');
        }
        if (!prices || Object.keys(prices).length === 0) {
          throw new RatePlanValidationError('at least one room type price is required');
        }
      }

      function createRatePlan(data, actor) { /* validates via assertValidPlan, assigns id/createdAt/_seq */ }
      function updateRatePlan(id, changes, actor) { /* re-validates merged result before writing */ }
      function listRatePlans() { /* returns public shape, strips internal _seq */ }
      function getRatePlan(id) { /* returns one plan or undefined */ }
      function deleteRatePlan(id) { /* removes a plan; returns true/false */ }

      function resolveRate(roomTypeId, dateStr) {
        const roomType = getRoomType(roomTypeId);
        if (!roomType) throw new RatePlanValidationError(`unknown room type: ${roomTypeId}`);
        const matches = allRatePlansInternal()
          .filter((p) => p.prices[roomTypeId] !== undefined && dateInRange(dateStr, p.startDate, p.endDate))
          .sort((a, b) => b._seq - a._seq); // most-recently-created wins, deterministic even within the same millisecond
        if (matches.length === 0) {
          return { price: roomType.baseRate, source: 'base', ratePlanId: null, overlapping: false, otherRatePlanIds: [] };
        }
        return {
          price: matches[0].prices[roomTypeId],
          source: 'rate_plan',
          ratePlanId: matches[0].id,
          overlapping: matches.length > 1,
          otherRatePlanIds: matches.slice(1).map((p) => p.id),
        };
      }
      ```

      `resolveRate` is a plain exported function (not just an HTTP handler) so other backend
      modules can call it directly later, per the parent epic's "reliable source of truth" goal.
    files:
      - src/ratePlans/store.js
    rationale: |
      AC1/AC2/AC5/AC6 need create+update with the same missing-name / bad-date-range validation
      already proven server-side in `src/guests/store.js`'s `assertValid` pattern. AC3 requires
      that only explicitly-listed room types carry an override. AC4 requires a resolution rule
      that never throws and always picks the same winner for the same inputs — an internal
      monotonic `_seq` counter (assigned at creation) makes "most recently created wins"
      deterministic even if two plans are created within the same JS-clock millisecond, which a
      raw `createdAt` string-compare cannot guarantee. AC8 is the `matches.length === 0` branch.
  - description: |
      Add `src/ratePlans/routes.js` (Express router, same shape as `src/guests/routes.js`) and
      mount it in `src/server.js`:

      ```js
      router.get('/', (req, res, next) => { try { res.status(200).json(listRatePlans()); } catch (err) { next(err); } });
      router.post('/', (req, res, next) => {
        try { res.status(201).json(createRatePlan(req.body, req.body.actor)); }
        catch (err) { if (err instanceof RatePlanValidationError) return res.status(400).json({ error: err.message }); next(err); }
      });
      // NOTE: price-lookup must be registered before '/:id' or Express will treat
      // "price-lookup" as an :id and 404 inside getRatePlan.
      router.get('/price-lookup', (req, res, next) => {
        try { res.status(200).json(resolveRate(req.query.roomTypeId, req.query.date)); }
        catch (err) { if (err instanceof RatePlanValidationError) return res.status(400).json({ error: err.message }); next(err); }
      });
      router.get('/:id', (req, res, next) => { /* 404 if missing, else 200 */ });
      router.patch('/:id', (req, res, next) => { /* 404 if missing, 400 on RatePlanValidationError */ });
      router.delete('/:id', (req, res, next) => { /* 204 if deleted, 404 if missing */ });
      ```
    files:
      - src/ratePlans/routes.js
      - src/server.js
    rationale: |
      Exposes the store's CRUD and resolution logic over HTTP for the frontend, following the
      exact router-registration convention already used for `guestsRouter`/`hiresRouter` in
      `src/server.js`.
  - description: |
      Build the "Rate plans" list screen and "Rate plan editor" screen from
      `.arc/designs/TEST-M1-STORY-098-design.html` (screen 1, lines ~548–615, and screen 2,
      lines ~636–706) into `public/rate-plans.html`, porting the page-specific styles verbatim
      from the design's third `<style>` block (`.rp-toolbar`, `.rp-layout`, `.rp-grid`,
      `.rp-card-head`, `.rp-card-actions`, `.rp-daterange`, `.rp-price-chips`,
      `.rp-overlap-note`, `.rp-empty`, `.rp-base-rates .rate-row`, `.rp-mode-switch`,
      `.rp-edit-picker`, `.form-row`, `.field-error`, `.price-rows`/`.price-row*`,
      `.not-listed-hint`, `.form-actions`, plus `.btn-danger`/`.btn-sm`) into
      `public/css/rate-plans.css`, linked the same way `guest-profiles.html` links
      `../design-system/tokens.css`, `../design-system/prototype-utils.css`, and its own
      page CSS.

      `public/js/rate-plans.js` exports `initRatePlansApp(doc, initialRoomTypes, initialPlans, api)`
      (mirrors `initGuestProfilesApp(doc, initialGuests, api)` in `public/js/guest-profiles.js`)
      plus `createDefaultApi()` doing `fetch` to `/rate-plans*` and `/room-types`, and the
      `DOMContentLoaded` auto-init block, matching `guest-profiles.js`'s
      `module.exports` / `if (typeof window !== 'undefined')` tail exactly.

      Reused verbatim from the design: the `#rp-empty` empty-state block (icon, "No rate plans
      yet" heading, prompt copy, "+ Add a rate plan" button — AC7), the `.rp-card` list markup
      with `.rp-price-chips` showing only explicitly-priced room types (AC3) and the
      `#base-rates-list` aside always listing every room type's base rate (AC8's fallback,
      always visible for reference), the `#plan-form` fields (`#plan-name`, `#plan-start`,
      `#plan-end`, `#price-rows` + `#add-row-btn`, `#not-listed-hint`) with `#err-name`,
      `#err-start`, `#err-end`, `#err-rows` inline error spans (AC5/AC6), and the
      `#edit-picker-field` + "Load plan" control for switching the same form into edit mode
      (AC2). The design's `#show-empty-btn` / `#restore-plans-btn` / `#reset-data-btn` are
      explicitly commented in the prototype as "Demo affordances for AC7" scaffolding for
      reviewing states in isolation, not real product behavior, and are intentionally dropped —
      the real empty state renders whenever `GET /rate-plans` returns `[]`.
    files:
      - public/rate-plans.html
      - public/css/rate-plans.css
      - public/js/rate-plans.js
    rationale: |
      Delivers AC1 (create → saved & listed), AC2 (edit name/dates/prices → persists), AC3
      (add/remove price rows → only listed room types carry an override, `#not-listed-hint`
      shows the rest falling back to base), AC5/AC6 (inline validation blocks save), and AC7
      (empty-state prompt) using the exact screens/elements the design already shows.
  - description: |
      Build the "Price lookup" screen from the design (screen 3, lines ~721–759) into the same
      `public/rate-plans.html`/`rate-plans.css`/`rate-plans.js` files: the `#lookup-room-type`
      select, `#lookup-date` input, `#lookup-submit-btn`, and `#lookup-result` panel that shows
      either a rate-plan-sourced price (`.chip` "Rate plan — “Name”"` + the overlap note naming
      the losing plan and the "most recently created plan wins" rule) or the base-rate badge
      (`.lookup-badge.base` "Base rate — no active rate plan"). Wired to
      `GET /rate-plans/price-lookup?roomTypeId=&date=` instead of the prototype's client-side
      `resolvePrice`/`findOverlapConflicts` functions, since the store (scope item 2) is now the
      real source of truth.
    files:
      - public/rate-plans.html
      - public/css/rate-plans.css
      - public/js/rate-plans.js
    rationale: |
      Delivers AC4 (overlap resolves to one deterministic, non-erroring answer, with the rule
      stated inline) and AC8 (no active plan → base rate returned and clearly labeled) using the
      design's own lookup screen and copy.
  - description: |
      Wire the design's "Delete rate plan" flow: the `.btn-danger` "Delete" button on each
      `.rp-card`, the `#delete-overlay`/`#delete-modal-wrap` confirm dialog naming the exact
      plan and date range before removal, and `Escape`-to-close, calling
      `DELETE /rate-plans/:id` (scope item 3) on confirm.
    files:
      - public/rate-plans.html
      - public/css/rate-plans.css
      - public/js/rate-plans.js
    rationale: |
      Not named by any individual AC, but it is a fully-built, approved part of the design (its
      own confirm-modal screen state, not a placeholder) and is the only way a staff user can
      remove an obsolete rate plan once created — without it, AC7's empty state would be
      unreachable except by never creating a plan. Flagged in
      assumptions_or_open_questions for explicit reviewer confirmation since it goes beyond the
      literal AC text.
tests:
  - |
    AC1 (create → saved & listed):
    - Store (`test/rate-plans-store.test.js`):
      ```js
      test('AC1: creating a rate plan with a name, date range, and one price saves it', () => {
        const plan = createRatePlan({ name: 'Summer Peak 2026', startDate: '2026-06-01', endDate: '2026-08-31', prices: { 'rt-queen': 160 } }, 'Jordan Blake');
        expect(listRatePlans().map((p) => p.id)).toContain(plan.id);
      });
      ```
    - API (`test/rate-plans.test.js`):
      ```js
      test('AC1: POST /rate-plans saves and lists the new plan', async () => {
        const res = await request(app).post('/rate-plans').send({ name: 'Summer Peak 2026', startDate: '2026-06-01', endDate: '2026-08-31', prices: { 'rt-queen': 160 }, actor: 'Jordan Blake' });
        expect(res.status).toBe(201);
        const listRes = await request(app).get('/rate-plans');
        expect(listRes.body.some((p) => p.id === res.body.id)).toBe(true);
      });
      ```
    - UI (`test/rate-plans-ui.test.js`):
      ```js
      document.getElementById('save-plan-btn').click();
      await Promise.resolve(); await Promise.resolve();
      expect(api.create).toHaveBeenCalledWith(expect.objectContaining({ name: 'Summer Peak 2026', prices: { 'rt-queen': 160 } }));
      expect(document.getElementById('rp-grid').textContent).toContain('Summer Peak 2026');
      ```
  - |
    AC2 (edit name/dates/prices → future lookups reflect it):
    ```js
    test('AC2: updating a plan\'s price takes effect for future price lookups', () => {
      const plan = createRatePlan({ name: 'Winter Holidays 2026', startDate: '2026-12-20', endDate: '2027-01-02', prices: { 'rt-suite': 320 } }, 'Jordan Blake');
      updateRatePlan(plan.id, { prices: { 'rt-suite': 350 } }, 'Jordan Blake');
      expect(resolveRate('rt-suite', '2026-12-25')).toMatchObject({ price: 350, source: 'rate_plan' });
    });
    ```
  - |
    AC3 (only explicitly-listed room types carry an override; others fall back):
    - Store:
      ```js
      test('AC3: a room type not listed on the plan falls back to base rate inside the plan\'s own date range', () => {
        createRatePlan({ name: 'Shoulder Season Autumn', startDate: '2026-09-15', endDate: '2026-11-15', prices: { 'rt-queen': 130 } }, 'Jordan Blake');
        expect(resolveRate('rt-twin', '2026-10-01')).toMatchObject({ price: 110, source: 'base', ratePlanId: null });
      });
      ```
    - UI: removing a `.price-row` via its `.price-row-remove` button updates `#not-listed-hint` to include that room type's name, e.g. `expect(document.getElementById('not-listed-hint').textContent).toContain('Standard Queen')`.
  - |
    AC4 (overlapping ranges resolve deterministically, no error):
    ```js
    test('AC4: overlapping plans for the same room type resolve to the most recently created plan, deterministically', () => {
      createRatePlan({ name: 'Summer Peak 2026', startDate: '2026-06-01', endDate: '2026-08-31', prices: { 'rt-king': 190 } }, 'Jordan Blake');
      const newer = createRatePlan({ name: 'Labor Day Weekend', startDate: '2026-08-29', endDate: '2026-09-02', prices: { 'rt-king': 205 } }, 'Jordan Blake');
      expect(() => resolveRate('rt-king', '2026-08-30')).not.toThrow();
      expect(resolveRate('rt-king', '2026-08-30')).toMatchObject({ price: 205, ratePlanId: newer.id, overlapping: true });
    });
    ```
  - |
    AC5 (missing name or bad date range → inline error shown):
    ```js
    document.getElementById('plan-name').value = '';
    document.getElementById('plan-start').value = '2026-08-10';
    document.getElementById('plan-end').value = '2026-08-01';
    document.getElementById('save-plan-btn').click();
    expect(document.getElementById('err-name').hidden).toBe(false);
    expect(document.getElementById('err-end').hidden).toBe(false);
    ```
  - |
    AC6 (invalid submission is not saved):
    - UI: continuing the AC5 test, `expect(api.create).not.toHaveBeenCalled();`
    - API/store (belt-and-suspenders server-side validation):
      ```js
      test('AC6: an end date before the start date is rejected and not saved', async () => {
        const res = await request(app).post('/rate-plans').send({ name: 'Bad Range', startDate: '2026-08-10', endDate: '2026-08-01', prices: { 'rt-queen': 100 }, actor: 'Jordan Blake' });
        expect(res.status).toBe(400);
        expect((await request(app).get('/rate-plans')).body.some((p) => p.name === 'Bad Range')).toBe(false);
      });
      ```
  - |
    AC7 (empty list → prompt to add a rate plan):
    - Store: `expect(listRatePlans()).toEqual([]);` on a fresh store.
    - UI:
      ```js
      test('AC7 UI: an empty rate plan list shows the empty-state prompt', () => {
        const { initRatePlansApp } = require('../public/js/rate-plans');
        initRatePlansApp(document, [{ id: 'rt-queen', name: 'Standard Queen', baseRate: 120 }], [], {});
        expect(document.getElementById('rp-empty').hidden).toBe(false);
        expect(document.getElementById('rp-empty').textContent).toContain('No rate plans yet');
      });
      ```
  - |
    AC8 (no active plan → base rate returned):
    ```js
    test('AC8: no active plan for a room type/date returns the base rate', () => {
      expect(resolveRate('rt-twin', '2026-12-25')).toMatchObject({ price: 110, source: 'base', ratePlanId: null });
    });
    ```
    UI equivalent on the Price lookup screen:
    ```js
    api.resolvePrice.mockResolvedValue({ price: 110, source: 'base', ratePlanId: null, overlapping: false, otherRatePlanIds: [] });
    document.getElementById('lookup-submit-btn').click();
    await Promise.resolve(); await Promise.resolve();
    expect(document.getElementById('lookup-result').textContent).toContain('Base rate');
    ```
assumptions_or_open_questions:
  - "Room types are seeded as a minimal, hardcoded read-only fixture in a new src/roomTypes/store.js (matching the design's fixture data exactly: Standard Queen $120, Deluxe King $150, Suite $240, Twin $110), because no room-types module or story exists in the codebase yet and the design itself marks room-type management as out of scope (inert nav link). If a separate room-types management story lands first or in parallel, this seed module should be replaced with calls into that story's real store — flagging for reviewer confirmation this is the right interim approach."
  - "Implemented the design's full 'Delete rate plan' confirm-modal flow even though no AC names deletion, since it's a fully-designed (not placeholder) part of the approved prototype and the only way to remove an obsolete plan. Reviewer should confirm this is in scope or should be deferred to a follow-up story."
  - "Assumed AC5/AC6 validation ('missing name or end date before start date') should also be enforced server-side (400 response), not just client-side, following the same defense-in-depth pattern already used in src/guests/store.js's assertValid — the design's client-side `validate()` function only covers the UI half."
  - "Assumed a room type that has never appeared on any rate plan still resolves via the base-rate fallback (AC8's rule applied uniformly), since no AC distinguishes 'never listed anywhere' from 'not listed on the specific plan covering this date'."
  - "AC4's deterministic tie-break ('most-recently-created plan wins') is implemented with an internal monotonic sequence counter rather than raw createdAt-timestamp comparison, since two plans created in the same test/request within the same millisecond would otherwise tie non-deterministically."
package_dependencies: []
notes: |
  No existing module in this codebase represents room types or rate plans (confirmed via
  `grep -r "roomType|baseRate"`, which only turned up the guest-profile "room preference" free-text
  field — an unrelated concept). This is a from-scratch vertical slice, so scope naturally spans
  the routing layer, the store layer, and the frontend.

  ```mermaid
  flowchart TD
    server[src/server.js]
    existing[existing routers already mounted in server.js, e.g. guestsRouter, hiresRouter]
    rpRoutes[src/ratePlans/routes.js]
    rpStore[src/ratePlans/store.js]
    rtRoutes[src/roomTypes/routes.js]
    rtStore[src/roomTypes/store.js]
    html[public/rate-plans.html]
    ui[public/js/rate-plans.js]

    server --> existing
    server --> rpRoutes
    server --> rtRoutes
    rpRoutes -->|CRUD + price-lookup| rpStore
    rtRoutes -->|list room types| rtStore
    rpStore -.->|reads base rate for AC3/AC8 fallback| rtStore
    html --> ui
    ui -->|fetch /rate-plans, /rate-plans/price-lookup| rpRoutes
    ui -->|fetch /room-types| rtRoutes

    classDef touched fill:#f96,color:#000
    class server,rpRoutes,rpStore,rtRoutes,rtStore,ui,html touched
  ```

  Frontend conventions (init function signature, `createDefaultApi()` using `fetch`, the
  `module.exports` + `DOMContentLoaded` tail, jsdom-based UI tests loading the real HTML file via
  `fs.readFileSync` and driving it through `document.getElementById(...).click()`/`.dispatchEvent(...)`)
  are copied from `public/js/guest-profiles.js` and `test/guest-profiles.test.js`, the closest
  precedent in this repo for a multi-screen staff CRUD tool. Backend conventions (`Map`-backed
  store, a `*ValidationError` class carrying `statusCode = 400`, `express.Router()` per domain
  mounted in `src/server.js`) are copied from `src/guests/store.js` / `src/guests/routes.js`.
