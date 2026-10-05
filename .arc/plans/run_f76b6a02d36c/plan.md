summary: |
  Add HR/manager-only role gating to the four new-hire profile write actions —
  create, edit (PATCH), deactivate, and reactivate — on `src/hires/routes.js`,
  reusing the existing `enforceOnboardingRole` middleware from `src/runs/auth.js`
  (the same middleware that already gates onboarding-run actions to the
  `manager`/`hr` roles via the `x-staff-role` header). Read access
  (`GET /hires` and `GET /hires/:id`) is explicitly left unguarded per the
  story's scope. Existing hire tests that call the now-gated routes without a
  role header are updated to send one so they keep passing, a new
  role-enforcement test file pins the six acceptance criteria directly, and the
  two front-end API clients for the hire-profile pages are updated to send the
  `x-staff-role` header on their write calls, mirroring how
  `public/js/guest-profiles.js` and `public/js/run-detail.js` already do this
  for their own role-gated actions.
scope:
  - description: |
      Guard the four write routes on the hires router with the shared
      `enforceOnboardingRole` middleware; leave both GET routes untouched.

      Before:
      ```js
      router.post('/', async (req, res, next) => { ... });
      router.patch('/:id', async (req, res, next) => { ... });
      router.post('/:id/deactivate', async (req, res, next) => { ... });
      router.post('/:id/reactivate', async (req, res, next) => { ... });
      ```
      After:
      ```js
      const { enforceOnboardingRole } = require('../runs/auth');
      router.post('/', enforceOnboardingRole, async (req, res, next) => { ... });
      router.patch('/:id', enforceOnboardingRole, async (req, res, next) => { ... });
      router.post('/:id/deactivate', enforceOnboardingRole, async (req, res, next) => { ... });
      router.post('/:id/reactivate', enforceOnboardingRole, async (req, res, next) => { ... });
      ```
    files:
      - src/hires/routes.js
    rationale: |
      `enforceOnboardingRole` already encodes exactly the two roles this story
      requires (`ROLE_ACTORS = { manager: 'Manager', hr: 'HR' }` in
      src/runs/auth.js) and already returns 401 for a missing
      `x-staff-role` header and 403 for a recognized-but-not-permitted role —
      this is the "access pattern already used for onboarding runs" the story
      references, so reusing it directly (rather than writing a parallel
      hires-specific permission map, as guests/rooms each did with their own
      front-desk-only role set) keeps the two role-gated flows in this app
      consistent and avoids a second source of truth for who counts as HR/manager.
      Store functions (`createHire`, `updateHire`, `deactivateHire`,
      `reactivateHire`) are left untouched since the existing store-level tests
      in test/hires-store.test.js and test/hires-validation.test.js call them
      directly without going through the router, matching how guests/rooms
      keep their role checks at the route layer only.
  - description: |
      Add the `x-staff-role` header to the existing hires HTTP tests that call
      the now-gated POST/PATCH/deactivate/reactivate routes without one, so
      they keep passing. Use `'hr'` as the header value for these pre-existing
      happy-path tests (any permitted role works per AC5; `'hr'` keeps the diff
      minimal and consistent).
    files:
      - test/hires.test.js
      - test/hires-validation.test.js
    rationale: |
      These tests currently call `request(app).post('/hires')`,
      `.patch(...)`, `.post('/:id/deactivate')`, and `.post('/:id/reactivate')`
      with no `x-staff-role` header. Once the middleware is applied they would
      start failing with 401, which is a false regression, not a real bug —
      the same mechanical update was needed historically when rooms/guests
      picked up their own role gating (test/rooms.test.js already carries
      `.set('x-staff-role', 'front_desk')` on every mutating call for exactly
      this reason).
  - description: |
      Add a new role-enforcement test file covering all six acceptance
      criteria end-to-end through the real HTTP routes, following the same
      `describe.each(ENDPOINTS)` shape as test/guests-role-enforcement.test.js
      and test/rooms-role-enforcement.test.js.
    files:
      - test/hires-role-enforcement.test.js
    rationale: |
      A dedicated file keeps the AC-to-test mapping explicit and matches the
      convention already established for the two other role-gated resources
      in this codebase, making it easy for a reviewer to find the coverage for
      this specific story.
  - description: |
      Send the `x-staff-role` header on the hire-profile pages' write
      requests, mirroring the hardcoded-role pattern already used in
      `public/js/guest-profiles.js` (`'x-staff-role': 'front_desk'`) and
      `public/js/run-detail.js` (`'x-staff-role': 'manager'`). GET requests for
      hires are left without the header since read access is not restricted
      (AC6).

      In public/js/hire-profiles.js, `createDefaultApi`'s `request` helper
      currently sends only `{ 'Content-Type': 'application/json' }`; add
      `'x-staff-role': 'hr'` alongside it so both `create` and `update` (which
      both call `request`) carry the header.

      In public/js/hire-profile.js, `createDefaultApi`'s `patch` helper and the
      `deactivate`/`reactivate` fetch calls currently send no staff-role
      header; add `'x-staff-role': 'hr'` to all three so `saveStage`,
      `updateRoleDepartment`, `updateContact`, `deactivate`, and `reactivate`
      all carry it.
    files:
      - public/js/hire-profiles.js
      - public/js/hire-profile.js
    rationale: |
      Without this, the real browser UI for creating/editing/deactivating/
      reactivating a new-hire profile would start getting a 401 from the
      now-gated backend routes, even though the acceptance criteria are about
      the API-level access check, not about building a real auth/login system
      — this app has no login flow, so every other role-gated page hardcodes a
      single staff role in its default API client, and these two pages need
      the same fix to keep working end-to-end.
assumptions_or_open_questions:
  - "The story names two distinct roles (HR for create/deactivate, manager for edit/reactivate) in ACs 1-4, but AC5 says a user lacking *either* recognized role is rejected for *all four* actions — read together, this means both `hr` and `manager` are permitted for every one of the four write actions (not role-restricted per specific action), exactly like the existing `enforceOnboardingRole` behavior for run `advance`/`resolve-requirement`. The plan follows that reading rather than building four separate per-action role maps."
  - "This app has no real authentication; `x-staff-role` is a trusted request header set by the caller (test harness or hardcoded front-end client), identical to how guests/rooms/runs already work. No login/session work is in scope."
  - "Picked `'hr'` as the single hardcoded role for the two front-end default API clients' write calls, since both roles are equally permitted for every write action and the existing precedents (guest-profiles.js, run-detail.js) each hardcode just one role per page regardless of which specific action is being taken."
package_dependencies: []
notes: |
  Reused pattern confirmed by reading `src/runs/auth.js` (the `enforceOnboardingRole`
  middleware and its `ROLE_ACTORS = { manager: 'Manager', hr: 'HR' }` map),
  `src/runs/routes.js` and `src/workflows/routes.js` (both already apply this
  exact middleware to their own mutating routes), and
  `test/runs-authorization.test.js` (shows the 401-missing-header /
  403-wrong-role / success-for-hr-and-manager test shape this story's new
  test file follows). The guests (`src/guests/store.js` `canCreateGuest` +
  `src/guests/routes.js` `enforceFrontDeskRole`) and rooms role-gating are a
  second, independent implementation of the same idea with their own
  single-role permission map — this story's roles (`hr`/`manager`) already
  exist verbatim in `src/runs/auth.js`, so this plan reuses that module
  directly rather than adding a third copy of the pattern.

  ```mermaid
  flowchart TD
    server[src/server.js]
    hireRoutes[src/hires/routes.js]
    hiresStore[src/hires/store.js]
    runsAuth[src/runs/auth.js]
    hireProfilesJS[public/js/hire-profiles.js]
    hireProfileJS[public/js/hire-profile.js]

    server -->|mounts /hires| hireRoutes
    hireRoutes -->|create/getHire/update/deactivate/reactivate, unchanged| hiresStore
    runsAuth -->|enforceOnboardingRole, already used by runs/workflows routes| hireRoutes
    hireProfilesJS -->|POST /hires, PATCH /hires/:id now need x-staff-role| hireRoutes
    hireProfileJS -->|PATCH/deactivate/reactivate now need x-staff-role| hireRoutes

    classDef touched fill:#f96,color:#000
    class hireRoutes,hireProfilesJS,hireProfileJS touched
  ```
tests:
  - |
    AC1 (failing test first, in test/hires-role-enforcement.test.js): an HR-role create succeeds.
    ```js
    test('AC1: HR can create a new-hire profile', async () => {
      const res = await request(app).post('/hires').set('x-staff-role', 'hr').send(payload);
      expect(res.status).toBe(201);
      expect(getHire(res.body.id)).toBeTruthy();
    });
    ```
    Minimal code to pass: apply `enforceOnboardingRole` to `router.post('/', ...)` in src/hires/routes.js (no other change needed — `hr` is already a permitted role in `ROLE_ACTORS`).
  - |
    AC2 (failing test first): a manager-role edit is saved.
    ```js
    test('AC2: manager can edit an existing new-hire profile', async () => {
      const res = await request(app).patch(`/hires/${hire.id}`).set('x-staff-role', 'manager').send({ name: 'A B' });
      expect(res.status).toBe(200);
      expect(res.body.name).toBe('A B');
    });
    ```
    Minimal code to pass: apply `enforceOnboardingRole` to `router.patch('/:id', ...)`.
  - |
    AC3 (failing test first): HR deactivates and status becomes inactive.
    ```js
    test('AC3: HR can deactivate a new-hire profile', async () => {
      const res = await request(app).post(`/hires/${hire.id}/deactivate`).set('x-staff-role', 'hr').send({});
      expect(res.status).toBe(200);
      expect(res.body.profileStatus).toBe('deactivated');
    });
    ```
    Minimal code to pass: apply `enforceOnboardingRole` to `router.post('/:id/deactivate', ...)`.
  - |
    AC4 (failing test first): manager reactivates a deactivated profile and status becomes active.
    ```js
    test('AC4: manager can reactivate a deactivated new-hire profile', async () => {
      await deactivateHire(hire.id);
      const res = await request(app).post(`/hires/${hire.id}/reactivate`).set('x-staff-role', 'manager').send({});
      expect(res.status).toBe(200);
      expect(res.body.profileStatus).toBe('active');
    });
    ```
    Minimal code to pass: apply `enforceOnboardingRole` to `router.post('/:id/reactivate', ...)`.
  - |
    AC5 (failing test first): an unrecognized role is rejected for every write action and nothing changes;
    a missing header is a 401, a recognized-but-wrong role is a 403.
    ```js
    describe.each([
      { name: 'create', build: () => ({ method: 'post', path: '/hires', body: payload }) },
      { name: 'patch', build: (id) => ({ method: 'patch', path: `/hires/${id}`, body: { name: 'X' } }) },
      { name: 'deactivate', build: (id) => ({ method: 'post', path: `/hires/${id}/deactivate`, body: {} }) },
      { name: 'reactivate', build: (id) => ({ method: 'post', path: `/hires/${id}/reactivate`, body: {} }) },
    ])('$name', ({ build }) => {
      test('AC5: an unrecognized role is forbidden and nothing changes', async () => {
        const before = { ...getHire(hire.id) };
        const { method, path, body } = build(hire.id);
        const res = await request(app)[method](path).set('x-staff-role', 'front_desk').send(body);
        expect(res.status).toBe(403);
        expect(getHire(hire.id)).toEqual(before);
      });
      test('AC5: no x-staff-role header at all is unauthorized and nothing changes', async () => {
        const before = { ...getHire(hire.id) };
        const { method, path, body } = build(hire.id);
        const res = await request(app)[method](path).send(body);
        expect(res.status).toBe(401);
        expect(getHire(hire.id)).toEqual(before);
      });
    });
    ```
    Minimal code to pass: same middleware application as above (one middleware covers both the missing-header and wrong-role cases).
  - |
    AC6 (failing test first): a user without a recognized role can still read a new-hire profile.
    ```js
    test('AC6: reading a profile succeeds with no staff role at all', async () => {
      const listRes = await request(app).get('/hires');
      expect(listRes.status).toBe(200);
      const getRes = await request(app).get(`/hires/${hire.id}`);
      expect(getRes.status).toBe(200);
    });
    ```
    Minimal code to pass: do NOT add `enforceOnboardingRole` (or any role check) to `router.get('/', ...)` or `router.get('/:id', ...)` in src/hires/routes.js — this test documents that read routes must stay unguarded.
review_focus: |
  Scope is strictly the four hires write routes (create/edit/deactivate/reactivate)
  gated to `hr`/`manager` via the existing `enforceOnboardingRole` middleware;
  read routes are deliberately left open per AC6 — flag anything that adds a
  role check to `GET /hires` or `GET /hires/:id`. The riskiest part is the
  mechanical update to pre-existing tests in test/hires.test.js and
  test/hires-validation.test.js to add a role header — verify each updated
  test still exercises its original assertion (not just made to pass by
  adding a header) and that no AC coverage was accidentally deleted. Also
  deliberate: both `hr` and `manager` are accepted for all four actions, not
  restricted per-action (e.g. HR can also edit, manager can also create) —
  this follows directly from reusing `enforceOnboardingRole` as-is, so it
  should not be flagged as under-scoping the per-action role split implied by
  reading AC1-AC4 in isolation.
