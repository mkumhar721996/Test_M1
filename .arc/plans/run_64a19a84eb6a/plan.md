summary: |
  Guest-management endpoints in `src/guests/routes.js` currently enforce front-desk-only
  access inconsistently: `POST /guests` checks the role header, but `GET /`, `GET /:id`,
  `PATCH /:id`, `POST /:id/deactivate`, and `POST /:id/reactivate` perform no role check at
  all today, so a housekeeping (or unauthenticated) caller can list, read, edit, deactivate,
  or reactivate any guest profile via a direct API call. This plan adds a single shared
  `enforceFrontDeskRole` middleware applied to all six guest-management routes that returns
  401 when the `x-staff-role` header is absent (no caller identity at all) and 403 when a
  role is present but not `front_desk`. It also fixes the existing test suite and the
  guest-profiles UI's default API client, both of which today call several of these routes
  without any role header and would otherwise start failing (or silently break in the
  browser) once enforcement is added everywhere.

scope:
  - description: |
      Add a shared `enforceFrontDeskRole` middleware in `src/guests/routes.js` and apply it
      to all six guest-management routes (list, get-by-id, create, patch, deactivate,
      reactivate). Missing `x-staff-role` header -> 401; present but not `front_desk` -> 403.
      Replace the ad-hoc `isPermitted` check currently inlined in the `POST /` handler with
      this middleware; leave `GET /permission` and `GET /match` on their existing `isPermitted`
      helper unchanged (they are not in the AC's list of six endpoints).

      Before:
      ```js
      function isPermitted(req) {
        return guestsStore.canCreateGuest(req.headers['x-staff-role']);
      }

      router.get('/', (req, res, next) => { ... });
      router.post('/', (req, res, next) => {
        if (!isPermitted(req)) {
          return res.status(403).json({ error: 'forbidden' });
        }
        ...
      });
      router.get('/:id', (req, res, next) => { ... });          // no check
      router.patch('/:id', (req, res, next) => { ... });        // no check
      router.post('/:id/deactivate', (req, res, next) => { ... }); // no check
      router.post('/:id/reactivate', (req, res, next) => { ... }); // no check
      ```

      After:
      ```js
      function enforceFrontDeskRole(req, res, next) {
        const role = req.headers['x-staff-role'];
        if (!role) {
          return res.status(401).json({ error: 'unauthorized' });
        }
        if (!guestsStore.canCreateGuest(role)) {
          return res.status(403).json({ error: 'forbidden' });
        }
        next();
      }

      router.get('/', enforceFrontDeskRole, (req, res, next) => { ... });
      router.post('/', enforceFrontDeskRole, (req, res, next) => { ... }); // isPermitted check removed
      router.get('/:id', enforceFrontDeskRole, (req, res, next) => { ... });
      router.patch('/:id', enforceFrontDeskRole, (req, res, next) => { ... });
      router.post('/:id/deactivate', enforceFrontDeskRole, (req, res, next) => { ... });
      router.post('/:id/reactivate', enforceFrontDeskRole, (req, res, next) => { ... });
      ```
    files:
      - src/guests/routes.js
    rationale: |
      This is the actual bug the story targets: today only `POST /guests` is protected, so
      housekeeping (or an unauthenticated caller) can read, edit, deactivate, and reactivate
      any guest profile. A single middleware keeps the 401-vs-403 decision in one place and
      guarantees the auth check runs before any route's business logic (including the
      404-for-unknown-id lookup), matching AC1/AC5 exactly.

  - description: |
      Update `test/guests.test.js`: every request currently sent with no `x-staff-role`
      header (all `GET /guests/:id`, `PATCH /guests/:id`, `POST /guests/:id/deactivate`,
      `POST /guests/:id/reactivate` calls, including the AC10/AC11/AC12 404 tests) now hits
      the new middleware and would get 401 instead of the behaviour under test. Add
      `.set('x-staff-role', 'front_desk')` to each of these calls so they keep exercising
      front-desk-authenticated behaviour (this is exactly AC2: a front-desk request is
      processed normally).
    files:
      - test/guests.test.js
    rationale: |
      This file predates role enforcement on anything but create, so most of its requests
      have no role header. Without this update, adding the middleware breaks ~15 currently-
      green tests with unrelated 401s, masking whether the real feature works.

  - description: |
      Update `test/guests-store.test.js`: the existing test `'AC9: POST /guests fails closed
      for a caller with no x-staff-role header'` currently asserts `res.status` is `403` with
      body `{ error: 'forbidden' }` for a request with no role header at all. Under the new
      AC5, "no authentication token or role present" must be `401`, not `403`. Update the
      assertion and rename the test to reflect the corrected contract.

      Before:
      ```js
      test('AC9: POST /guests fails closed for a caller with no x-staff-role header', async () => {
        const res = await request(app).post('/guests').send({ name: 'Legacy Caller', email: 'legacy@example.com' });
        expect(res.status).toBe(403);
        expect(res.body).toEqual({ error: 'forbidden' });
      });
      ```

      After:
      ```js
      test('AC5: POST /guests returns 401 for a caller with no x-staff-role header', async () => {
        const res = await request(app).post('/guests').send({ name: 'Legacy Caller', email: 'legacy@example.com' });
        expect(res.status).toBe(401);
        expect(res.body).toEqual({ error: 'unauthorized' });
      });
      ```
    files:
      - test/guests-store.test.js
    rationale: |
      This test currently locks in the exact behaviour AC5 requires this story to change
      (missing header must now be 401, not 403). Leaving it as-is would make the suite
      contradict the new acceptance criterion.

  - description: |
      Add a new test file `test/guests-role-enforcement.test.js` that table-drives all six
      guest-management endpoints against: (a) a non-front-desk role (403, AC1), (b) no role
      header at all (401, AC5), and (c) the front-desk role (normal processing, AC2). Also
      verify AC4 (audit log entry with actor + timestamp) for authenticated deactivate/
      reactivate calls, and AC3 (server rejects even when a client would have claimed the
      action was permitted) by calling the raw HTTP endpoint directly with a denied role,
      independent of any UI-layer check.

      ```js
      const request = require('supertest');
      const app = require('../src/server');
      const guestsStore = require('../src/guests/store');

      function seedGuest() {
        return guestsStore.createGuest({ name: 'Seed Guest', email: `seed-${Date.now()}@example.com` }, 'system');
      }

      const ENDPOINTS = [
        { name: 'list', build: () => ({ method: 'get', path: '/guests' }) },
        { name: 'get-by-id', build: (id) => ({ method: 'get', path: `/guests/${id}` }) },
        { name: 'create', build: () => ({ method: 'post', path: '/guests', body: { name: 'New Guest', email: 'new@example.com', actor: 'Priya Nair' } }) },
        { name: 'patch', build: (id) => ({ method: 'patch', path: `/guests/${id}`, body: { phone: '555-0100', actor: 'Priya Nair' } }) },
        { name: 'deactivate', build: (id) => ({ method: 'post', path: `/guests/${id}/deactivate`, body: { actor: 'Priya Nair' } }) },
        { name: 'reactivate', build: (id) => ({ method: 'post', path: `/guests/${id}/reactivate`, body: { actor: 'Priya Nair' } }) },
      ];

      describe.each(ENDPOINTS)('$name', ({ build }) => {
        test('AC1: a housekeeping role gets 403 and the operation is not performed', async () => {
          const guest = seedGuest();
          const before = { ...guestsStore.getGuest(guest.id) };
          const { method, path, body } = build(guest.id);
          const res = await request(app)[method](path).set('x-staff-role', 'housekeeping').send(body);
          expect(res.status).toBe(403);
          expect(res.body).toEqual({ error: 'forbidden' });
          expect(guestsStore.getGuest(guest.id)).toEqual(before);
        });

        test('AC5: no x-staff-role header at all gets 401 and the operation is not performed', async () => {
          const guest = seedGuest();
          const before = { ...guestsStore.getGuest(guest.id) };
          const { method, path, body } = build(guest.id);
          const res = await request(app)[method](path).send(body);
          expect(res.status).toBe(401);
          expect(res.body).toEqual({ error: 'unauthorized' });
          expect(guestsStore.getGuest(guest.id)).toEqual(before);
        });

        test('AC2: a front-desk role is processed normally', async () => {
          const guest = seedGuest();
          const { method, path, body } = build(guest.id);
          const res = await request(app)[method](path).set('x-staff-role', 'front_desk').send(body);
          expect([200, 201]).toContain(res.status);
        });
      });

      test('AC3: role check cannot be bypassed by calling the API directly (no UI involved)', async () => {
        const guest = seedGuest();
        const res = await request(app).post(`/guests/${guest.id}/deactivate`).set('x-staff-role', 'housekeeping').send({ actor: 'Housekeeping Bot' });
        expect(res.status).toBe(403);
        expect(guestsStore.getGuest(guest.id).status).toBe('active');
      });

      test('AC4: deactivate and reactivate by an authenticated front-desk actor are recorded in the audit log', async () => {
        const guest = seedGuest();
        await request(app).post(`/guests/${guest.id}/deactivate`).set('x-staff-role', 'front_desk').send({ actor: 'Priya Nair' });
        await request(app).post(`/guests/${guest.id}/reactivate`).set('x-staff-role', 'front_desk').send({ actor: 'Priya Nair' });
        const res = await request(app).get(`/guests/${guest.id}`).set('x-staff-role', 'front_desk');
        const [deactivateEntry, reactivateEntry] = res.body.auditLog.slice(-2);
        expect(deactivateEntry).toMatchObject({ actor: 'Priya Nair', action: 'deactivated profile' });
        expect(reactivateEntry).toMatchObject({ actor: 'Priya Nair', action: 'reactivated profile' });
        expect(typeof deactivateEntry.ts).toBe('string');
        expect(typeof reactivateEntry.ts).toBe('string');
      });
      ```
    files:
      - test/guests-role-enforcement.test.js
    rationale: |
      This is the primary test evidence for the story: one file that proves every one of the
      six endpoints enforces 401/403/200 correctly, rather than relying on scattered
      incidental coverage across other files.

  - description: |
      Fix `public/js/guest-profiles.js`'s `createDefaultApi()` so its `get` method and the
      initial directory-list `fetch('/guests')` on `DOMContentLoaded` send the
      `x-staff-role: front_desk` header, matching the header already sent by `create`/
      `update`/`deactivate`/`reactivate` via `jsonRequest`. Without this, the real
      guest-profiles UI (which has no login/role switcher and always acts as front desk)
      would start getting 401s on every profile lookup and on the initial directory load
      the moment `GET /` and `GET /:id` gained enforcement.

      Before:
      ```js
      get: (id) => fetch(`/guests/${id}`).then((res) => {
        if (!res.ok) return Promise.reject({ status: res.status });
        return res.json();
      }),
      ...
      window.addEventListener('DOMContentLoaded', () => {
        fetch('/guests')
          .then((res) => res.json())
          .then((guests) => initGuestProfilesApp(document, guests, createDefaultApi()));
      });
      ```

      After:
      ```js
      get: (id) => fetch(`/guests/${id}`, { headers: { 'x-staff-role': 'front_desk' } }).then((res) => {
        if (!res.ok) return Promise.reject({ status: res.status });
        return res.json();
      }),
      ...
      window.addEventListener('DOMContentLoaded', () => {
        fetch('/guests', { headers: { 'x-staff-role': 'front_desk' } })
          .then((res) => res.json())
          .then((guests) => initGuestProfilesApp(document, guests, createDefaultApi()));
      });
      ```
    files:
      - public/js/guest-profiles.js
    rationale: |
      A pure server-side enforcement change without this fix would regress the working UI
      (it would break AC2 in practice for the one real caller of these routes) even though
      no test would catch it, since `test/guest-profiles.test.js` injects a mocked `api`
      object and never exercises `createDefaultApi` directly.

  - description: |
      Add a small test to `test/guest-profiles.test.js` (new `describe('createDefaultApi',
      ...)` block, following the fetch-spy pattern already used for
      `createDefaultApi` in `test/guest-inline-hook.test.js`) asserting the `get` call sends
      the `x-staff-role` header.

      ```js
      describe('createDefaultApi', () => {
        const originalFetch = global.fetch;
        afterEach(() => { global.fetch = originalFetch; });

        test('get() sends the x-staff-role header', async () => {
          global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'gst_1' }) });
          const { createDefaultApi } = require('../public/js/guest-profiles');
          await createDefaultApi().get('gst_1');
          expect(global.fetch).toHaveBeenCalledWith(
            '/guests/gst_1',
            expect.objectContaining({ headers: expect.objectContaining({ 'x-staff-role': 'front_desk' }) })
          );
        });
      });
      ```
    files:
      - test/guest-profiles.test.js
    rationale: |
      Locks in the UI-side fix above with a real failing-first test, rather than relying on
      manual browser verification alone.

tests:
  - |
    `test/guests-role-enforcement.test.js` — `describe.each(ENDPOINTS)('$name', ...)` AC1 case:
    `expect(res.status).toBe(403); expect(guestsStore.getGuest(guest.id)).toEqual(before);`
    for all six endpoints with `x-staff-role: housekeeping`.
  - |
    `test/guests-role-enforcement.test.js` — AC5 case: `expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'unauthorized' });` for all six endpoints with no
    `x-staff-role` header set at all.
  - |
    `test/guests-role-enforcement.test.js` — AC2 case: `expect([200, 201]).toContain(res.status);`
    for all six endpoints with `x-staff-role: front_desk`.
  - |
    `test/guests-role-enforcement.test.js` — AC3 case: direct `POST /guests/:id/deactivate`
    with `x-staff-role: housekeeping` still returns 403 and
    `guestsStore.getGuest(guest.id).status` remains `'active'`, independent of any UI check.
  - |
    `test/guests-role-enforcement.test.js` — AC4 case: after an authenticated front-desk
    deactivate then reactivate, `res.body.auditLog` contains entries matching
    `{ actor: 'Priya Nair', action: 'deactivated profile' }` and
    `{ actor: 'Priya Nair', action: 'reactivated profile' }` with string `ts` values.
  - |
    `test/guests-store.test.js` (updated) — `expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'unauthorized' });` for `POST /guests` with no role
    header, replacing the prior 403 expectation.
  - |
    `test/guest-profiles.test.js` (new block) — `expect(global.fetch).toHaveBeenCalledWith('/guests/gst_1',
    expect.objectContaining({ headers: expect.objectContaining({ 'x-staff-role': 'front_desk' }) }));`

assumptions_or_open_questions:
  - |
    There is no real authentication/session system anywhere in this codebase — the
    `x-staff-role` header is the only signal of caller identity or role today. AC5's "no
    authentication token or role present" is therefore implemented as "the `x-staff-role`
    header is absent or empty", not as a separate token concept.
  - |
    `GET /guests/permission` and `GET /guests/match` are left with their current behaviour
    (200 `{ allowed: false }` / 403 `{ error: 'forbidden' }` respectively when the role is
    missing or denied) because they are not in the AC's explicit list of six guest-management
    endpoints (list, get-by-id, create, patch, deactivate, reactivate). If the reviewer wants
    401/403 consistency extended to these two utility endpoints as well, that's a follow-up.
  - |
    Role values are compared case-sensitively against the existing `ROLE_PERMISSIONS` map
    (`front_desk` / `housekeeping`) — no new roles or case-insensitive matching are
    introduced.
  - |
    The `actor` field in request bodies remains client-supplied and is not cross-checked
    against the `x-staff-role` header or derived from a trusted identity source; that
    remains existing behaviour and is out of scope for this story.

package_dependencies: []

notes: |
  Route registration order in `src/guests/routes.js` already puts `GET /permission` and
  `GET /match` before `GET /:id`, so applying `enforceFrontDeskRole` only to `GET /:id` (and
  not to those two literal-path routes) doesn't require any reordering — Express already
  matches the literal paths first.

  Because the middleware runs before each route handler's own logic, an unauthenticated or
  unauthorized request against an unknown guest id now gets 401/403 rather than 404 — auth is
  checked before existence. This is intentional (don't leak whether an id exists to a caller
  who isn't allowed to ask), and is why the AC10/AC11/AC12 404 tests in `test/guests.test.js`
  need `x-staff-role: front_desk` added to keep asserting 404 rather than being caught by
  the new 401 check.

  ```mermaid
  flowchart TD
    HTML["public/guest-profiles.html"] --> JS["public/js/guest-profiles.js"]
    JS -->|"GET /guests, GET /guests/:id now send x-staff-role header"| ROUTES["src/guests/routes.js"]
    SERVER["src/server.js (mounts /guests)"] --> ROUTES
    ROUTES -->|"enforceFrontDeskRole runs before every handler"| STORE["src/guests/store.js (canCreateGuest, unchanged)"]

    classDef touched fill:#f96,color:#000
    class JS,ROUTES touched
  ```

review_focus: |
  In scope: a single `enforceFrontDeskRole` middleware applied to exactly the six named
  guest-management routes (list, get-by-id, create, patch, deactivate, reactivate), returning
  401 for a missing `x-staff-role` header and 403 for a present-but-denied role; plus the
  test-file and UI-client fixes needed so existing behaviour keeps passing under the new
  enforcement. Deliberately out of scope: `GET /guests/permission` and `GET /guests/match`
  keep their current fail-closed behaviour unchanged (not named in the ACs), and `actor`
  identity is still client-supplied and not cross-checked against the role header. The
  riskiest area is ordering: auth is checked before the 404-for-unknown-id lookup on every
  route, so a reviewer should confirm that's the intended fail-closed behaviour (don't leak
  existence of a guest id to an unauthorized caller) rather than an accidental regression of
  the 404 tests.
