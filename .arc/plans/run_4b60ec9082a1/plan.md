summary: |
  Adds a new "reporting" bounded context (src/reporting/{retention,store,routes}.js, mounted at
  /reporting in src/server.js) that models completed/cancelled hire records with a tenant-wide,
  admin-configurable retention period (default 12 months), an audit log of config
  changes/deletions/denied attempts, and a lazy "retention sweep" that permanently deletes any
  completed/cancelled hire whose retention window has elapsed the next time the dashboard,
  detail, or settings endpoints are hit. Builds the four already-approved screens from
  .arc/designs/TEST-M1-STORY-085-design.html (Hires Dashboard, Hire Detail — Within/Expired
  Retention, Data Retention Settings, Retention & Audit Log) as a new
  public/hires-dashboard.html + public/js/hires-dashboard.js + public/css/hires-dashboard.css
  page, following the same initXApp(doc, data, api, ...) / x-staff-role header conventions
  already used by public/js/guest-profiles.js and src/guests/routes.js. This is new,
  self-contained functionality: it does not touch or reuse src/hires (that module is an
  unrelated recruiting/onboarding ATS domain — see assumptions). This revision adds edge-case
  coverage: exact-boundary expiry semantics, active-status hires never expiring, increasing (not
  just decreasing) the retention period, batched/idempotent sweeps, invalid-input rejection, and
  no-op saves.
scope:
  - description: |
      Add pure date/retention-math helpers used by every other layer:
      `addMonths(isoDate, months)`, `computeExpiryDate(eventDateIso, retentionMonths)`, and
      `isPastRetention(eventDateIso, retentionMonths, nowIso)`. Boundary semantics: a record is
      still visible ON its exact expiry date (`nowIso === computeExpiryDate(...)` → not expired)
      and only becomes expired the day after, since AC3 says "*more than* 12 months after" —
      exactly 12 months is not yet "more than".

      ```js
      function isPastRetention(eventDateIso, retentionMonths, nowIso) {
        return nowIso > computeExpiryDate(eventDateIso, retentionMonths);
      }
      ```
    files:
      - src/reporting/retention.js
      - test/reporting-retention.test.js
    rationale: |
      Isolates month arithmetic so the store's sweep logic (AC1–AC3, AC8) and its tests don't
      each re-derive date math, mirroring how src/workflows/store.js isolates its own small pure
      helpers (clone, getVersion) from the Map-backed CRUD functions around them. The strict `>`
      (not `>=`) is deliberate: it's the one-line difference between correct and off-by-one-day
      wrong boundary behavior, so it's called out as its own scope point rather than left
      implicit in the store.
  - description: |
      Add the reporting store: an in-memory `Map` of hire records (worker, role, client,
      status: active|completed|cancelled, eventDate, metrics), a single tenant-wide retention
      config (`{ retentionMonths: 12, isCustomized: false }`), an audit log array, and a
      `tombstones` Map for deleted records. Seed fixture hires matching the design's
      fixture-data block (hire-101 active, hire-102 completed Aug 15 2026, hire-103 cancelled
      Jun 2 2026, hire-104 completed Nov 20 2025) so the frontend has data to render without a
      create-hire flow (no AC asks for one). Key exports (`now` is an optional ISO-date string
      on every function that takes it, defaulting to the real current date via
      `new Date().toISOString().slice(0, 10)` when omitted — call sites in routes and most
      tests never pass it; only the boundary-focused store/route tests pass an explicit `now`
      to pin "today"):

      ```js
      function listHires(now) { sweep(now); return Array.from(hires.values()); }
      function getHireDetail(id, now) {
        sweep(now);
        if (hires.has(id)) return { found: true, expired: false, hire: hires.get(id) };
        if (tombstones.has(id)) return { found: true, expired: true, tombstone: tombstones.get(id) };
        return { found: false };
      }
      function updateRetentionSettings(newMonths, actor, role, now) { /* see rationale below */ }
      function seedHire(hire) { /* inserts directly into the `hires` Map, bypassing sweep — used by fixtures and tests */ }
      function listAuditLog(type) { /* returns auditLog, optionally filtered to `type`, newest first */ }
      function getRetentionSettings() { /* returns a shallow copy of retentionConfig */ }
      ```

      `sweep(now)` walks `hires`, and for any `completed`/`cancelled` record where
      `isPastRetention(hire.eventDate, retentionConfig.retentionMonths, today)` is true: writes
      a minimal tombstone (`id, worker, role, client, status, eventDate, expiredOn, deletedOn` —
      no `metrics`, no other fields), deletes the full record from `hires`, increments a
      `deletedCount` tally, and — once per sweep call, not once per record — appends a single
      `type: 'deletion'` audit entry naming the batch count (e.g. "permanently deleted 2
      completed/cancelled hire records..."). Since a record is removed from `hires` the moment
      it's swept, and tombstoned records are never re-evaluated, calling `sweep()` again with no
      newly-expired records is a no-op: no duplicate tombstones, no duplicate deletion audit
      entries. `status: 'active'` records are never evaluated by `sweep()` at all — retention
      only ever applies to `completed`/`cancelled` records (AC1's note), so an active record is
      never swept regardless of how old its `eventDate` is.
    files:
      - src/reporting/store.js
      - test/reporting-store.test.js
    rationale: |
      Central model backing every endpoint below, following the existing per-domain Map-based
      store convention (src/guests/store.js, src/hires/store.js) and the existing
      role-permission-map pattern (`ROLE_PERMISSIONS` / `canCreateGuest` in src/guests/store.js),
      reused here as `ROLE_PERMISSIONS = { tenant_admin: true, recruiter: false }` /
      `canManageRetention(role)`.

      `updateRetentionSettings(newMonths, actor, role, now)` behaviour:
      - throws `PermissionError` (403) if `!canManageRetention(role)` — logs a `type: 'denied'`
        audit entry first, does NOT touch `retentionConfig`.
      - throws `ValidationError` (400) if
        `!Number.isFinite(newMonths) || newMonths < 1 || newMonths > 60` (bounds taken from the
        design's `<input min="1" max="60">`) — does NOT touch `retentionConfig` and writes no
        audit entry.
      - if `newMonths === retentionConfig.retentionMonths` (no-op save): returns the current
        settings unchanged and writes NO audit entry — there is no "change" for AC7 to record.
        Increasing the period always saves this way too (no sweep side effect, since raising the
        bar can never make anything newly expired).
      - otherwise: updates `retentionConfig` to `{ retentionMonths: newMonths, isCustomized: true }`,
        appends a `type: 'config'` audit entry, then re-runs `sweep(now)` so a *lowered* period
        deletes newly-expired records immediately (AC8's "when the retention period elapses"),
        matching the design's admin-settings impact callout/confirm-modal copy. Raising the
        period never deletes anything in the same call (sweep only ever removes records, never
        restores a tombstoned one, since AC8 says deletion is permanent).

      The no-op/validation/idempotency rules above are edge cases the ACs don't spell out but
      that a real save button and a real nightly-equivalent sweep will hit immediately, so
      they're specified here rather than left to implementation-time guessing.
  - description: |
      Add Express routes under `/reporting` and mount them in src/server.js:
      `GET /reporting/hires`, `GET /reporting/hires/:id`, `GET /reporting/retention-settings`
      (any role, read-only), `PUT /reporting/retention-settings` (admin-only), and
      `GET /reporting/audit-log?type=` (filters to `config`/`deletion`/`denied`, or all when
      omitted/`all`).

      ```js
      router.put('/retention-settings', (req, res) => {
        const role = req.headers['x-staff-role'];
        try {
          const settings = store.updateRetentionSettings(Number(req.body.retentionMonths), req.body.actor, role);
          res.status(200).json(settings);
        } catch (err) {
          if (err instanceof store.PermissionError) {
            return res.status(403).json({ error: 'forbidden', retentionSettings: store.getRetentionSettings() });
          }
          if (err instanceof store.ValidationError) {
            return res.status(400).json({ error: 'validation_error', retentionSettings: store.getRetentionSettings() });
          }
          throw err;
        }
      });
      ```

      `GET /reporting/hires/:id` returns 404 if the id was never seen, 410 with
      `{ error: 'retention_expired', tombstone }` if it was permanently deleted by the sweep,
      and 200 with the full record (including `metrics`) otherwise.
    files:
      - src/reporting/routes.js
      - src/server.js
      - test/reporting.test.js
    rationale: |
      Exposes the store over HTTP using the same router/`req.body.actor`/`x-staff-role` header
      conventions as src/guests/routes.js (`isPermitted(req)` →
      `guestsStore.canCreateGuest(...)`), so the new route file is idiomatically consistent
      with the rest of src/. src/server.js already mounts each domain router
      (`app.use('/guests', guestsRouter)` etc.) right before its error handler, so
      `app.use('/reporting', reportingRouter)` is added the same way.
  - description: |
      Build the four approved screens as one real page: `public/hires-dashboard.html` (Hires
      Dashboard list with the `.info-banner`, `.hire-card`/`.retention-chip` per design; a Hire
      Detail view reusing `.sla-grid`/`.metric-card`/`.retention-note` for within-retention
      hires and `.empty-state` copy for expired ones; ONE Data Retention Settings screen — see
      assumption on why the design's two admin/non-admin screens collapse to one — with
      `.field-row`/`.warning-callout`/confirm `.modal-panel`/`.lock-badge`/`.error-callout`; and
      a Retention & Audit Log screen with `.filter-chips`/`.audit-list`), plus
      `public/js/hires-dashboard.js` exporting
      `initHiresDashboardApp(doc, initialData, api, currentUser)` in the same style as
      `initGuestProfilesApp(doc, initialGuests, api)` (public/js/guest-profiles.js) /
      `initHireProfileApp(doc, initialHire, api)` (public/js/hire-profile.js), plus
      `public/css/hires-dashboard.css` for the classes not already in
      design-system/tokens.css / design-system/prototype-utils.css (`.info-banner`,
      `.status-badge`, `.retention-chip`, `.hire-card`, `.sla-grid`/`.metric-card`,
      `.retention-note`, `.empty-state`, `.field-group`/`.field-row`/`.unit-label`/
      `.helper-text`/`.lock-badge`, `.warning-callout`/`.error-callout`/`.field-flash`,
      `.chip-row`, `.audit-list`/`.audit-item`/`.audit-tag`, `.filter-chips`/`.filter-chip`,
      `.back-link`), copied from the design's inlined `<style>` block verbatim per-token.
    files:
      - public/hires-dashboard.html
      - public/js/hires-dashboard.js
      - public/css/hires-dashboard.css
      - test/hires-dashboard.test.js
    rationale: |
      Implements the already-approved prototype's four screens using the existing static-page +
      per-feature-CSS + initXApp(doc, data, api) pattern (public/hire-profile.html +
      public/js/hire-profile.js, public/guest-profiles.html + public/js/guest-profiles.js),
      reusing design-system/tokens.css + design-system/prototype-utils.css for shared primitives
      exactly as those two existing pages do.
tests:
  - |
    Pure retention math (foundational for AC1–AC3, AC8), in test/reporting-retention.test.js:
    ```js
    test('addMonths adds whole calendar months to an ISO date', () => {
      const { addMonths } = require('../src/reporting/retention');
      expect(addMonths('2026-08-15', 12)).toBe('2027-08-15');
    });
    test('EDGE: addMonths clamps to the last day of the target month rather than overflowing', () => {
      const { addMonths } = require('../src/reporting/retention');
      expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
      expect(addMonths('2024-01-31', 1)).toBe('2024-02-29');
    });
    test('computeExpiryDate adds the retention period in whole months', () => {
      const { computeExpiryDate } = require('../src/reporting/retention');
      expect(computeExpiryDate('2026-08-15', 12)).toBe('2027-08-15');
    });
    test('isPastRetention is true once "now" is strictly after the expiry date', () => {
      const { isPastRetention } = require('../src/reporting/retention');
      expect(isPastRetention('2025-06-10', 12, '2026-06-11')).toBe(true);
      expect(isPastRetention('2025-06-10', 12, '2026-06-09')).toBe(false);
    });
    ```
    `addMonths` clamps to the last valid day of the target month (e.g. Jan 31 + 1 month =
    Feb 28, or Feb 29 in a leap year) instead of relying on native JS `Date` rollover (which
    would silently overflow Jan 31 + 1 month into Mar 3) — the correct semantics for a
    calendar-months retention calculator, not just an arbitrary date-math choice.
  - |
    EDGE CASE — exact boundary: a record is still visible ON its exact expiry date and only
    expires the day after (test/reporting-retention.test.js):
    ```js
    test('a record is not yet expired on the exact expiry date, only the day after', () => {
      const { isPastRetention } = require('../src/reporting/retention');
      expect(isPastRetention('2026-08-15', 12, '2027-08-15')).toBe(false);
      expect(isPastRetention('2026-08-15', 12, '2027-08-16')).toBe(true);
    });
    ```
  - |
    AC1 (store) — a completed/cancelled hire inside its tenant's retention window stays in the
    list, in test/reporting-store.test.js:
    ```js
    test('AC1: a completed hire within the retention window remains in listHires()', () => {
      const store = require('../src/reporting/store');
      const eventDate = new Date(); eventDate.setMonth(eventDate.getMonth() - 3);
      store.seedHire({ id: 'ac1', worker: 'W', role: 'R', client: 'C', status: 'completed', eventDate: eventDate.toISOString().slice(0, 10), metrics: {} });
      expect(store.listHires().some((h) => h.id === 'ac1')).toBe(true);
    });
    ```
  - |
    EDGE CASE — an `active` hire is never swept regardless of age (AC1's note), in
    test/reporting-store.test.js:
    ```js
    test('EDGE: an active hire is never hidden or deleted no matter how old its eventDate is', () => {
      const store = require('../src/reporting/store');
      store.seedHire({ id: 'active-old', worker: 'W', role: 'R', client: 'C', status: 'active', eventDate: '2015-01-01', metrics: {} });
      expect(store.listHires().some((h) => h.id === 'active-old')).toBe(true);
      expect(store.getHireDetail('active-old').expired).toBe(false);
    });
    ```
  - |
    AC2 (store) — a hire past the tenant's customised (shorter) retention period is excluded,
    in test/reporting-store.test.js:
    ```js
    test('AC2: a hire past a customised (shorter) retention period is excluded from listHires()', () => {
      const store = require('../src/reporting/store');
      store.updateRetentionSettings(6, 'Jane Kim', 'tenant_admin');
      const eventDate = new Date(); eventDate.setMonth(eventDate.getMonth() - 7);
      store.seedHire({ id: 'ac2', worker: 'W2', role: 'R2', client: 'C2', status: 'cancelled', eventDate: eventDate.toISOString().slice(0, 10), metrics: {} });
      expect(store.listHires().some((h) => h.id === 'ac2')).toBe(false);
    });
    ```
  - |
    AC3 (store, fresh module so the default 12-month period hasn't been customised by another
    test in the file), in test/reporting-store.test.js:
    ```js
    test('AC3: with the uncustomised default 12-month period, a hire completed 13 months ago is hidden', () => {
      jest.resetModules();
      const store = require('../src/reporting/store');
      expect(store.getRetentionSettings()).toMatchObject({ retentionMonths: 12, isCustomized: false });
      const eventDate = new Date(); eventDate.setMonth(eventDate.getMonth() - 13);
      store.seedHire({ id: 'ac3', worker: 'W3', role: 'R3', client: 'C3', status: 'completed', eventDate: eventDate.toISOString().slice(0, 10), metrics: {} });
      expect(store.listHires().some((h) => h.id === 'ac3')).toBe(false);
    });
    ```
  - |
    AC4 (store) — saving a new period changes subsequent expiry calculations:
    ```js
    test('AC4: after an admin updates the retention period, later expiry checks use the new value', () => {
      const store = require('../src/reporting/store');
      store.updateRetentionSettings(3, 'Jane Kim', 'tenant_admin');
      expect(store.getRetentionSettings().retentionMonths).toBe(3);
      const eventDate = new Date(); eventDate.setMonth(eventDate.getMonth() - 4);
      store.seedHire({ id: 'ac4', worker: 'W4', role: 'R4', client: 'C4', status: 'completed', eventDate: eventDate.toISOString().slice(0, 10), metrics: {} });
      expect(store.listHires().some((h) => h.id === 'ac4')).toBe(false);
    });
    ```
  - |
    EDGE CASE — increasing the retention period never deletes anything, and rescues a hire that
    was about to expire but hasn't been swept yet (test/reporting-store.test.js):
    ```js
    test('EDGE: increasing the retention period never triggers a deletion', () => {
      const store = require('../src/reporting/store');
      const eventDate = new Date(); eventDate.setMonth(eventDate.getMonth() - 10);
      store.seedHire({ id: 'ac4b', worker: 'W', role: 'R', client: 'C', status: 'completed', eventDate: eventDate.toISOString().slice(0, 10), metrics: {} });
      const before = store.listAuditLog('deletion').length;
      store.updateRetentionSettings(24, 'Jane Kim', 'tenant_admin');
      expect(store.listAuditLog('deletion').length).toBe(before);
      expect(store.listHires().some((h) => h.id === 'ac4b')).toBe(true);
    });
    ```
  - |
    EDGE CASE — an invalid retentionMonths value is rejected and leaves the config untouched
    (store level), in test/reporting-store.test.js:
    ```js
    test('EDGE: retentionMonths outside 1-60, or non-numeric, is rejected and the config is unchanged', () => {
      const store = require('../src/reporting/store');
      const before = store.getRetentionSettings();
      [0, -1, 61, NaN].forEach((bad) => {
        expect(() => store.updateRetentionSettings(bad, 'Jane Kim', 'tenant_admin')).toThrow(store.ValidationError);
      });
      expect(store.getRetentionSettings()).toEqual(before);
    });
    ```
  - |
    EDGE CASE — a no-op save (same value as current) writes no redundant audit entry (AC7 only
    fires on an actual change), in test/reporting-store.test.js:
    ```js
    test('EDGE: saving the same retentionMonths value again does not create a new config audit entry', () => {
      const store = require('../src/reporting/store');
      store.updateRetentionSettings(9, 'Jane Kim', 'tenant_admin');
      const before = store.listAuditLog('config').length;
      store.updateRetentionSettings(9, 'Jane Kim', 'tenant_admin');
      expect(store.listAuditLog('config').length).toBe(before);
    });
    ```
  - |
    AC5 (route), in test/reporting.test.js (fresh `app` per test via `jest.resetModules()` so
    the shared retentionConfig singleton can't leak between tests in this file):
    ```js
    test('AC5: PUT /reporting/retention-settings from a non-admin role is rejected', async () => {
      const res = await request(app).put('/reporting/retention-settings')
        .set('x-staff-role', 'recruiter')
        .send({ retentionMonths: 1, actor: 'Priya Sharma' });
      expect(res.status).toBe(403);
    });
    ```
  - |
    EDGE CASE — GET /reporting/retention-settings is readable by any role, including a
    non-admin (only PUT is restricted), in test/reporting.test.js:
    ```js
    test('EDGE: GET /reporting/retention-settings succeeds for a non-admin role (read-only access)', async () => {
      const res = await request(app).get('/reporting/retention-settings').set('x-staff-role', 'recruiter');
      expect(res.status).toBe(200);
      expect(typeof res.body.retentionMonths).toBe('number');
    });
    ```
  - |
    AC6 (route) — the rejected change leaves the previous value in effect:
    ```js
    test('AC6: after a rejected non-admin change, GET /reporting/retention-settings still returns the old value', async () => {
      const before = (await request(app).get('/reporting/retention-settings')).body.retentionMonths;
      await request(app).put('/reporting/retention-settings').set('x-staff-role', 'recruiter').send({ retentionMonths: 1, actor: 'Priya Sharma' });
      const after = await request(app).get('/reporting/retention-settings');
      expect(after.body.retentionMonths).toBe(before);
    });
    ```
  - |
    AC7 (store) — a successful admin change appends an audit record with actor + timestamp:
    ```js
    test('AC7: a successful retention change is recorded with the admin identity and a timestamp', () => {
      const store = require('../src/reporting/store');
      store.updateRetentionSettings(9, 'Jane Kim', 'tenant_admin');
      const [latest] = store.listAuditLog('config');
      expect(latest).toMatchObject({ type: 'config', actor: 'Jane Kim', role: 'tenant_admin' });
      expect(typeof latest.timestamp).toBe('string');
    });
    ```
  - |
    EDGE CASE — a denied non-admin attempt also creates its own audit record (distinct from a
    'config' entry), in test/reporting-store.test.js:
    ```js
    test('EDGE: a denied retention-change attempt is itself recorded in the audit log', () => {
      const store = require('../src/reporting/store');
      const before = store.listAuditLog('denied').length;
      expect(() => store.updateRetentionSettings(1, 'Priya Sharma', 'recruiter')).toThrow(store.PermissionError);
      const denied = store.listAuditLog('denied');
      expect(denied.length).toBe(before + 1);
      expect(denied[0]).toMatchObject({ type: 'denied', actor: 'Priya Sharma', role: 'recruiter' });
    });
    ```
  - |
    AC8 (store) — the sweep permanently deletes the record (not just hides it): the tombstone
    keeps only audit-copy fields, and `metrics`/the full record are gone.
    ```js
    test('AC8: a hire past retention is permanently deleted; only a minimal tombstone remains', () => {
      const store = require('../src/reporting/store');
      const eventDate = new Date(); eventDate.setMonth(eventDate.getMonth() - 14);
      store.seedHire({ id: 'ac8', worker: 'Carlos Mendez', role: 'Line Cook', client: 'Sunrise Catering Co.', status: 'cancelled', eventDate: eventDate.toISOString().slice(0, 10), metrics: { timeToFill: '1 day' } });
      store.listHires();
      const detail = store.getHireDetail('ac8');
      expect(detail.expired).toBe(true);
      expect(detail.tombstone).toMatchObject({ worker: 'Carlos Mendez', status: 'cancelled' });
      expect(detail.tombstone.metrics).toBeUndefined();
    });
    ```
  - |
    EDGE CASE — batching: multiple hires expiring in the same sweep produce exactly ONE
    deletion audit entry naming the correct count, and re-sweeping afterwards is a no-op:
    ```js
    test('EDGE: N hires expiring together produce one deletion audit entry with count N, and re-sweeping is a no-op', () => {
      const store = require('../src/reporting/store');
      const old = new Date(); old.setMonth(old.getMonth() - 20);
      store.seedHire({ id: 'batch-1', worker: 'A', role: 'R', client: 'C', status: 'completed', eventDate: old.toISOString().slice(0, 10), metrics: {} });
      store.seedHire({ id: 'batch-2', worker: 'B', role: 'R', client: 'C', status: 'cancelled', eventDate: old.toISOString().slice(0, 10), metrics: {} });
      store.listHires();
      const [entry] = store.listAuditLog('deletion');
      expect(entry.description).toMatch(/permanently deleted 2 completed\/cancelled hire records/);
      const auditLenAfterFirstSweep = store.listAuditLog('deletion').length;
      store.listHires();
      expect(store.listAuditLog('deletion').length).toBe(auditLenAfterFirstSweep);
    });
    ```
  - |
    AC8 (route) — the HTTP surface never leaks the deleted record's metrics either, and 404 vs
    410 are distinguished (never-existed vs swept):
    ```js
    test('AC8: GET /reporting/hires/:id for a swept hire returns 410 with only tombstone fields', async () => {
      const res = await request(app).get('/reporting/hires/ac8-route');
      expect(res.status).toBe(410);
      expect(res.body.tombstone.metrics).toBeUndefined();
    });
    test('EDGE: GET /reporting/hires/:id for an id that never existed returns 404, not 410', async () => {
      const res = await request(app).get('/reporting/hires/never-existed-id');
      expect(res.status).toBe(404);
    });
    ```
  - |
    EDGE CASE — GET /reporting/audit-log?type= filters correctly across all three entry kinds:
    ```js
    test('EDGE: audit-log filtering returns only entries matching the requested type', async () => {
      await request(app).put('/reporting/retention-settings').set('x-staff-role', 'tenant_admin').send({ retentionMonths: 5, actor: 'Jane Kim' });
      await request(app).put('/reporting/retention-settings').set('x-staff-role', 'recruiter').send({ retentionMonths: 1, actor: 'Priya Sharma' });
      const configRes = await request(app).get('/reporting/audit-log').query({ type: 'config' });
      const deniedRes = await request(app).get('/reporting/audit-log').query({ type: 'denied' });
      expect(configRes.body.every((e) => e.type === 'config')).toBe(true);
      expect(deniedRes.body.every((e) => e.type === 'denied')).toBe(true);
    });
    ```
  - |
    UI (jsdom), in test/hires-dashboard.test.js — AC1/AC2/AC3 dashboard rendering:
    ```js
    test('AC1: a within-retention completed hire renders with its "expires on" chip', () => {
      const { initHiresDashboardApp } = require('../public/js/hires-dashboard');
      initHiresDashboardApp(document, fixtureData(), {}, { name: 'Jane Kim', role: 'tenant_admin' });
      expect(document.querySelector('[data-hire="hire-102"] .retention-chip').textContent).toMatch(/Expires/);
    });
    test('AC2/AC3: the info banner names the current retention period and hidden-record count', () => {
      const { initHiresDashboardApp } = require('../public/js/hires-dashboard');
      initHiresDashboardApp(document, fixtureData(), {}, { name: 'Jane Kim', role: 'tenant_admin' });
      expect(document.querySelector('.info-banner').textContent).toMatch(/3 completed\/cancelled hires/);
    });
    ```
  - |
    EDGE CASE (jsdom) — an active hire's card renders with no retention chip at all, matching
    the design's note that retention only applies once a hire is completed/cancelled:
    ```js
    test('EDGE: an active hire card renders with no retention chip', () => {
      const { initHiresDashboardApp } = require('../public/js/hires-dashboard');
      initHiresDashboardApp(document, fixtureData(), {}, { name: 'Jane Kim', role: 'tenant_admin' });
      const activeCard = document.querySelector('[data-hire="hire-101"]');
      expect(activeCard.querySelector('.retention-chip')).toBeNull();
    });
    ```
  - |
    UI (jsdom) — AC5/AC6 non-admin rejection snaps the field back and shows the error copy:
    ```js
    test('AC5/AC6: a non-admin save is rejected and the input reverts to the previous value', async () => {
      const api = { updateRetention: () => Promise.reject({ status: 403, retentionSettings: { retentionMonths: 12 } }) };
      const { initHiresDashboardApp } = require('../public/js/hires-dashboard');
      initHiresDashboardApp(document, fixtureData(), api, { name: 'Priya Sharma', role: 'recruiter' });
      document.getElementById('retention-input').value = '3';
      document.getElementById('save-btn').click();
      await Promise.resolve(); await Promise.resolve();
      expect(document.getElementById('retention-input').value).toBe('12');
      expect(document.getElementById('error-callout').hidden).toBe(false);
    });
    ```
  - |
    EDGE CASE (jsdom) — navigating directly to an expired hire's detail view renders the
    design's "This hire's data is no longer available" empty-state, not the SLA grid:
    ```js
    test('EDGE: opening an expired hire renders the retention-expired empty-state, not SLA metrics', () => {
      const api = { getHireDetail: () => Promise.resolve({ expired: true, tombstone: { worker: 'Carlos Mendez', role: 'Line Cook', client: 'Sunrise Catering Co.', status: 'cancelled', eventDate: '2025-06-10', expiredOn: '2026-06-10', deletedOn: '2026-06-11' } }) };
      const { initHiresDashboardApp } = require('../public/js/hires-dashboard');
      initHiresDashboardApp(document, fixtureData(), api, { name: 'Jane Kim', role: 'tenant_admin' });
      return api.getHireDetail().then(() => {
        expect(document.querySelector('.empty-state h2').textContent).toMatch(/no longer available/);
        expect(document.querySelector('.sla-grid')).toBeNull();
      });
    });
    ```
assumptions_or_open_questions:
  - |
    Domain-model conflict between the approved design and the existing codebase: the design's
    fixture hires (worker/role/client/status: active|completed|cancelled/shiftDate, plus SLA
    metrics like "time to fill"/"time to onboard"/"shift completion"/"client rating") describe a
    staffing-placement domain. The existing `src/hires` module (verified: src/hires/store.js,
    src/hires/routes.js, public/hire-profile.html) is a completely different, already-shipped
    domain: a recruiting/onboarding ATS with `hireStage` (draft|offer_accepted), `profileStatus`
    (active|deactivated), and an onboarding-engine `run` — it has no completed/cancelled
    concept, no client, no SLA metrics, and no AC in this story references it. This plan does
    NOT modify or reuse `src/hires`; it adds a new, separate `src/reporting/*` module for this
    story's data model. Flagging this explicitly since the design and the pre-existing "hires"
    code disagree on what a "hire" is — if `src/hires` was actually meant to be extended
    instead, that would require a much larger, likely breaking, migration of its existing
    routes/tests (test/hires.test.js, test/hires-store.test.js, test/hire-profile.test.js) that
    no AC calls for.
  - |
    No "tenant" or authentication concept exists anywhere in the codebase today. This plan
    models the app as effectively single-tenant: one global retention config + one global audit
    log in src/reporting/store.js (no tenant-id scoping), and identifies the caller's
    admin-ness via the same `x-staff-role` request header convention src/guests/routes.js
    already uses (`ROLE_PERMISSIONS`/`canCreateGuest`), here as
    `ROLE_PERMISSIONS = { tenant_admin: true, recruiter: false }` / `canManageRetention(role)`.
  - |
    AC8 ("permanently deleted rather than merely hidden") is in tension with the approved
    design's "Hire Detail — Retention Expired" screen, which still names the worker, role,
    client, and both the expiry and deletion dates of the deleted hire. This plan reconciles the
    two by keeping a minimal, audit-only tombstone (worker/role/client/status/eventDate/
    expiredOn/deletedOn — the same fields already spoken aloud in the design's audit-log copy)
    while genuinely deleting the full hire record and all of its metrics/detail data from the
    store. If this reconciliation is wrong — e.g. if AC8 should mean literally nothing survives,
    including the tombstone shown on that screen — the expired-detail screen's copy would need
    to change instead.
  - |
    "The dashboard loads" (AC2/AC3) and "the retention period elapses" (AC8) are implemented as
    one lazy sweep that runs at the top of every `listHires`/`getHireDetail`/
    `updateRetentionSettings` call: any completed/cancelled hire whose window has passed is
    deleted (not merely filtered) right then, and logged as one "Automated retention sweep"
    audit entry per sweep batch. There is no cron/scheduler infrastructure anywhere in this
    codebase, so a real nightly job is out of scope; the design's "tonight at 2:00 AM" copy is
    treated as flavor text on the confirm-modal, not a scheduling requirement to build.
  - |
    The design (verified at .arc/designs/TEST-M1-STORY-085-design.html) shows the
    retention-settings form as two separate prototype "screens" with different element IDs
    (data-name="Data Retention Settings — Admin" using #admin-retention-input etc., vs
    data-name="Data Retention Settings — Non-admin" using #nonadmin-retention-input etc.), used
    for prototype review navigation. Since there's no auth system, these represent the same real
    route rendered for two different signed-in identities rather than two navigable pages, so
    this plan implements ONE settings screen whose ids/behaviour/copy switch on the
    `currentUser.role` passed into `initHiresDashboardApp` — preserving the design's layout,
    copy, and component breakdown for each state (lock-badge, error-callout, warning-callout,
    confirm modal), but not its literal duplicate-ID namespace.
  - |
    `retentionMonths` bounds of 1–60 are taken directly from the design's
    `<input type="number" min="1" max="60">` (both #admin-retention-input and
    #nonadmin-retention-input) and enforced in `updateRetentionSettings` as a 400
    `ValidationError`; no other input validation is implied by any AC.
  - |
    Seeded fixture hires (ids hire-101..hire-104, dates, worker/client names, SLA metric values)
    are copied verbatim from the design's `#fixture-data` JSON block so the dashboard renders
    identically to the approved prototype on first load.
  - |
    EDGE CASE decision: a no-op save (submitting the same retentionMonths value that's already
    in effect) is treated as "nothing changed" — it returns 200 with the current settings but
    writes no new `type: 'config'` audit entry, since AC7 ties the audit record to "the change"
    being saved, and there's no change to record. If the reviewer instead wants every successful
    Save click audited regardless of whether the value moved, this is a one-line removal of the
    `newMonths === retentionConfig.retentionMonths` short-circuit.
  - |
    EDGE CASE decision: the exact-expiry-date boundary is inclusive on the visible side — a
    hire is still shown on its `expiresOn` date itself and only disappears/deletes the day
    after, since AC3's wording ("more than 12 months after") is strictly-greater-than, not
    greater-or-equal. This determines the `>` vs `>=` in `isPastRetention` and is worth explicit
    reviewer sign-off since it's a one-day, easy-to-get-backwards distinction with no other
    textual cue in the ACs.
package_dependencies: []
notes: |
  No new third-party dependencies are needed — everything reuses `express`, `crypto`, and the
  existing `jest`/`supertest`/`jest-environment-jsdom`/`@testing-library/dom` devDependencies
  already in package.json (verified).

  This touches three layers (new backend module, its mount point in src/server.js, and a new
  frontend page that calls it over HTTP), so here's the shape of what's touched vs. existing,
  untouched code it sits next to:

  ```mermaid
  flowchart TD
    server[src/server.js]
    reportingRoutes[src/reporting/routes.js]
    reportingStore[src/reporting/store.js]
    retention[src/reporting/retention.js]
    dashboardHtml[public/hires-dashboard.html]
    dashboardJs[public/js/hires-dashboard.js]
    hiresStore["src/hires/store.js (unrelated ATS domain, untouched)"]
    guestsRoutes["src/guests/routes.js (pattern reference only, untouched)"]

    server -->|mounts new router at /reporting| reportingRoutes
    reportingRoutes -->|calls listHires/getHireDetail/updateRetentionSettings| reportingStore
    reportingStore -->|calls computeExpiryDate/isPastRetention| retention
    dashboardHtml --> dashboardJs
    dashboardJs -->|fetch GET/PUT /reporting/*| reportingRoutes
    server -.already mounts, unrelated.-> hiresStore

    classDef touched fill:#f96,color:#000
    class server,reportingRoutes,reportingStore,retention,dashboardHtml,dashboardJs touched
  ```

  `guestsRoutes`/`hiresStore` are shown only as convention/contrast reference — neither file is
  modified by this plan. All file paths and conventions referenced above (src/guests/store.js,
  src/guests/routes.js, src/server.js's mounting pattern, src/workflows/store.js, src/hires/
  store.js, public/js/guest-profiles.js, public/js/hire-profile.js, design-system/tokens.css,
  design-system/prototype-utils.css, and the design HTML's exact classes/fixture data) were
  read directly while drafting this plan, not assumed.
review_focus: |
  In scope: a new, isolated src/reporting/* module (retention math, store, routes) plus one new
  frontend page — nothing in src/hires, src/guests, or any other existing domain is modified
  except the single new `app.use('/reporting', ...)` mount line in src/server.js. Out of scope:
  any real cron/scheduler (retention sweeps are lazy, triggered by the next read/write call —
  see notes), multi-tenant data isolation (single global config/audit log, no tenant-id
  scoping), and a create-hire flow (fixtures are seeded, not authored via UI).
  Riskiest area: the sweep's exact-boundary date arithmetic (`isPastRetention`'s strict `>`)
  and the AC8 tombstone/permanent-deletion semantics — both are deliberate, reviewer-flagged
  interpretations of ACs that don't spell out the one-day boundary or reconcile cleanly with
  the design's expired-detail screen copy, so a reviewer should treat those as the two decisions
  most likely to need explicit confirmation rather than silent correction.
  Also non-obvious: the design's two settings screens (admin vs non-admin) are deliberately
  built as ONE screen keyed off `currentUser.role`, not two, since there's no real auth system
  to navigate between them as separate pages.
