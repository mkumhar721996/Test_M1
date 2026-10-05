summary: |
  Add HR/manager-only role gating to the four new-hire profile write actions —
  create, edit (PATCH), deactivate, and reactivate — on `src/hires/routes.js`,
  reusing the existing `enforceOnboardingRole` middleware from `src/runs/auth.js`
  (the same middleware that already gates onboarding-run actions to the
  `manager`/`hr` roles via the `x-staff-role` header). Read access
  (`GET /hires` and `GET /hires/:id`) is explicitly left unguarded per the
  story's scope. Existing hire tests that call the now-gated routes without a
  role header are updated to send one so they keep passing, a new
  role-enforcement test file pins the six acceptance criteria directly plus a
  set of edge cases (case-sensitive role matching, empty-header handling,
  check-ordering against 404s, validation errors still firing for authorized
  callers, and explicit-but-unrecognized roles on read routes), and the two
  front-end API clients for the hire-profile pages are updated to send the
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
      src/runs/auth.js) and already returns 401 for a missing `x-staff-role`
      header and 403 for a recognized-but-not-permitted role — this is the
      "access pattern already used for onboarding runs" the story references,
      so reusing it directly (rather than writing a parallel hires-specific
      permission map, as guests/rooms each did with their own front-desk-only
      role set) keeps the role-gated flows in this app consistent and avoids
      a second source of truth for who counts as HR/manager. Because it is
      applied as Express middleware before the route handler runs, the role
      check always executes before any store lookup — including the 404
      check for a nonexistent id — which matters for one of the edge-case
      tests below. Store functions (`createHire`, `updateHire`,
      `deactivateHire`, `reactivateHire`) are left untouched since the
      existing store-level tests in test/hires-store.test.js and
      test/hires-validation.test.js call them directly without going through
      the router, matching how guests/rooms keep their role checks at the
      route layer only.
  - description: |
      Add the `x-staff-role` header to the existing hires HTTP tests that
      call the now-gated POST/PATCH/deactivate/reactivate routes without one,
      so they keep passing. Use `'hr'` as the header value for these
      pre-existing happy-path tests (any permitted role works per AC5; `'hr'`
      keeps the diff minimal and consistent).
    files:
      - test/hires.test.js
      - test/hires-validation.test.js
    rationale: |
      These tests currently call `request(app).post('/hires')`, `.patch(...)`,
      `.post('/:id/deactivate')`, and `.post('/:id/reactivate')` with no
      `x-staff-role` header. Once the middleware is applied they would start
      failing with 401, which is a false regression, not a real bug — the
      same mechanical update was needed historically when rooms/guests picked
      up their own role gating (test/rooms.test.js already carries
      `.set('x-staff-role', 'front_desk')` on every mutating call for exactly
      this reason).
  - description: |
      Add a new role-enforcement test file covering all six acceptance
      criteria end-to-end through the real HTTP routes, following the same
      `describe.each(ENDPOINTS)` shape as test/guests-role-enforcement.test.js
      and test/rooms-role-enforcement.test.js. Beyond the six ACs, add
      targeted edge-case coverage: case-sensitive role matching (`'HR'`
      rejected the same as any other unrecognized string), an empty-string
      header treated as "missing" (401, not 403), the role check running
      before the 404 check (an unauthorized caller against a nonexistent
      hire id still gets 401/403, never a 404 that would leak whether the id
      exists), validation errors (400) still firing for an authorized caller
      who sends an invalid payload (role gating must not swallow existing
      validation behavior), an unauthorized caller rejected even when the
      action would otherwise be a no-op (reactivating an already-active
      hire), and GET routes succeeding even when an explicit
      recognized-as-invalid role header (not just a missing one) is sent.
    files:
      - test/hires-role-enforcement.test.js
    rationale: |
      A dedicated file keeps the AC-to-test mapping explicit and matches the
      convention already established for the two other role-gated resources
      in this codebase, making it easy for a reviewer to find the coverage
      for this specific story. The extra edge cases pin down behavior that
      is implied by reusing `enforceOnboardingRole` as-is (case sensitivity,
      401-vs-403 distinction, ordering relative to 404s) but that none of the
      six formal ACs state explicitly, so they are easy to accidentally
      regress later without a test calling them out by name.
  - description: |
      Send the `x-staff-role` header on the hire-profile pages' write
      requests, mirroring the hardcoded-role pattern already used in
      `public/js/guest-profiles.js` (`'x-staff-role': 'front_desk'`) and
      `public/js/run-detail.js` (`'x-staff-role': 'manager'`). GET requests
      for hires are left without the header since read access is not
      restricted (AC6).

      In public/js/hire-profiles.js, `createDefaultApi`'s `request` helper
      currently sends only `{ 'Content-Type': 'application/json' }`; add
      `'x-staff-role': 'hr'` alongside it so both `create` and `update`
      (which both call `request`) carry the header.

      In public/js/hire-profile.js, `createDefaultApi`'s `patch` helper and
      the `deactivate`/`reactivate` fetch calls currently send no
      staff-role header; add `'x-staff-role': 'hr'` to all three so
      `saveStage`, `updateRoleDepartment`, `updateContact`, `deactivate`,
      and `reactivate` all carry it.
    files:
      - public/js/hire-profiles.js
      - public/js/hire-profile.js
    rationale: |
      Without this, the real browser UI for creating/editing/deactivating/
      reactivating a new-hire profile would start getting a 401 from the
      now-gated backend routes, even though the acceptance criteria are
      about the API-level access check, not about building a real
      auth/login system — this app has no login flow, so every other
      role-gated page hardcodes a single staff role in its default API
      client, and these two pages need the same fix to keep working
      end-to-end.

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
    Minimal code to pass: apply `enforceOnboardingRole` to `router.post('/', ...)` in
    src/hires/routes.js (no other change needed — `hr` is already a permitted role in
    `ROLE_ACTORS`).
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
    AC5 (failing test first): an unrecognized role is rejected for every write action and nothing
    changes; a missing header is a 401, a recognized-but-wrong role is a 403.
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
    Minimal code to pass: same middleware application as above (one middleware covers both the
    missing-header and wrong-role cases).
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
    Minimal code to pass: do NOT add `enforceOnboardingRole` (or any role check) to
    `router.get('/', ...)` or `router.get('/:id', ...)` in src/hires/routes.js — this test
    documents that read routes must stay unguarded.
  - |
    Edge case — case sensitivity (failing test first): the role header match is exact-string, so a
    differently-cased value that happens to spell a valid role is still rejected like any other
    unrecognized role.
    ```js
    test.each(['create', 'patch', 'deactivate', 'reactivate'])('edge case: "HR" (wrong case) is forbidden for %s', async (name) => {
      const { method, path, body } = ENDPOINTS.find((e) => e.name === name).build(hire.id);
      const res = await request(app)[method](path).set('x-staff-role', 'HR').send(body);
      expect(res.status).toBe(403);
    });
    ```
    Minimal code to pass: none beyond AC1-AC5's middleware application — `enforceOnboardingRole`
    already does a case-sensitive `hasOwnProperty` lookup against `ROLE_ACTORS`, so `'HR'` already
    falls through to 403; this test pins that behavior down explicitly instead of leaving it
    accidental.
  - |
    Edge case — empty header (failing test first): an explicitly empty `x-staff-role` header is
    treated the same as no header at all (401), not as an unrecognized role (403).
    ```js
    test('edge case: an empty x-staff-role header is unauthorized, not forbidden', async () => {
      const res = await request(app).post('/hires').set('x-staff-role', '').send(payload);
      expect(res.status).toBe(401);
    });
    ```
    Minimal code to pass: none beyond AC1-AC5's middleware application — `enforceOnboardingRole`'s
    `if (!role)` check already treats `''` as falsy; this test documents that 401/403 distinction
    so it cannot regress silently.
  - |
    Edge case — check ordering against 404 (failing test first): the role check must run before
    the existence check, so an unauthorized caller gets 401/403 (never 404) regardless of whether
    the targeted hire id actually exists — this prevents the route from leaking which ids are
    valid to an unauthorized caller.
    ```js
    test('edge case: an unauthorized role gets 403 even for a hire id that does not exist', async () => {
      const res = await request(app).patch('/hires/does-not-exist').set('x-staff-role', 'front_desk').send({ name: 'X' });
      expect(res.status).toBe(403);
    });
    test('edge case: a missing role gets 401 even for a hire id that does not exist', async () => {
      const res = await request(app).post('/hires/does-not-exist/deactivate').send({});
      expect(res.status).toBe(401);
    });
    ```
    Minimal code to pass: none beyond AC1-AC5's middleware application — applying
    `enforceOnboardingRole` as the first argument to each route (before the async handler that
    does the `getHire`/`updateHire` lookup) already guarantees this ordering; these tests make the
    guarantee explicit instead of relying on argument order never changing unnoticed.
  - |
    Edge case — validation errors still fire for an authorized caller (failing test first): role
    gating must not swallow the pre-existing 400 validation path.
    ```js
    test('edge case: an authorized create with a missing required field still returns 400', async () => {
      const res = await request(app).post('/hires').set('x-staff-role', 'hr').send({ department: 'Sales', role: 'AE', startDate: '2026-10-05' });
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ error: 'validation_error', fields: { name: 'Full name is required.' } });
    });
    ```
    Minimal code to pass: none beyond AC1-AC5's middleware application — the validation logic in
    src/hires/store.js (`assertValidHire`) is unchanged by this story and runs after the middleware
    passes control to the route handler, so an authorized-but-invalid request still reaches it and
    still returns 400.
  - |
    Edge case — rejected even when the action would be a no-op (failing test first): an
    unauthorized caller is still rejected when reactivating an already-active hire, confirming the
    role gate runs unconditionally rather than only when the underlying store call would actually
    change state.
    ```js
    test('edge case: an unrecognized role is forbidden to reactivate an already-active hire', async () => {
      const res = await request(app).post(`/hires/${hire.id}/reactivate`).set('x-staff-role', 'front_desk').send({});
      expect(res.status).toBe(403);
    });
    ```
    Minimal code to pass: none beyond AC1-AC5's middleware application.
  - |
    Edge case — explicit unrecognized role on read routes (failing test first): AC6 only requires
    that a *missing* role can still read; this pins down that an explicitly-set but unrecognized
    role also succeeds on GET, since read routes carry no middleware at all.
    ```js
    test('edge case: an explicit unrecognized role can still list and read hires', async () => {
      const listRes = await request(app).get('/hires').set('x-staff-role', 'front_desk');
      expect(listRes.status).toBe(200);
      const getRes = await request(app).get(`/hires/${hire.id}`).set('x-staff-role', 'front_desk');
      expect(getRes.status).toBe(200);
    });
    ```
    Minimal code to pass: same as AC6 — do not add any role check to the two GET routes.

assumptions_or_open_questions:
  - |
    The story names two distinct roles (HR for create/deactivate, manager for edit/reactivate) in
    ACs 1-4, but AC5 says a user lacking *either* recognized role is rejected for *all four*
    actions — read together, this means both `hr` and `manager` are permitted for every one of the
    four write actions (not role-restricted per specific action), exactly like the existing
    `enforceOnboardingRole` behavior for run `advance`/`resolve-requirement`. The plan follows that
    reading rather than building four separate per-action role maps.
  - |
    This app has no real authentication; `x-staff-role` is a trusted request header set by the
    caller (test harness or hardcoded front-end client), identical to how guests/rooms/runs already
    work. No login/session work is in scope.
  - |
    Picked `'hr'` as the single hardcoded role for the two front-end default API clients' write
    calls, since both roles are equally permitted for every write action and the existing
    precedents (guest-profiles.js, run-detail.js) each hardcode just one role per page regardless
    of which specific action is being taken.
  - |
    The extra edge-case tests (case sensitivity, empty header, check ordering vs. 404, validation
    errors surviving the gate, no-op rejection, explicit-unrecognized-role reads) are not named by
    any of the six acceptance criteria; they were added at the reviewer's request to harden the
    test suite against regressions in behavior that falls directly out of reusing
    `enforceOnboardingRole` as-is. None of them require any additional production code beyond what
    AC1-AC5 already require.

package_dependencies: []

notes: |
  Reused pattern confirmed by reading `src/runs/auth.js` (the `enforceOnboardingRole` middleware
  and its `ROLE_ACTORS = { manager: 'Manager', hr: 'HR' }` map), `src/runs/routes.js` and
  `src/workflows/routes.js` (both already apply this exact middleware to their own mutating
  routes), and `test/runs-authorization.test.js` (shows the 401-missing-header /
  403-wrong-role / success-for-hr-and-manager test shape this story's new test file follows). The
  guests (`src/guests/store.js` `canCreateGuest` + `src/guests/routes.js` `enforceFrontDeskRole`)
  and rooms role-gating are a second, independent implementation of the same idea with their own
  single-role permission map — this story's roles (`hr`/`manager`) already exist verbatim in
  `src/runs/auth.js`, so this plan reuses that module directly rather than adding a third copy of
  the pattern. Confirmed in src/hires/store.js that `createHire`/`updateHire`/`deactivateHire`/
  `reactivateHire` never write to a hire's own `auditLog` (only `appendOnboardingAuditEntry`,
  used by the runs flow, does) — so unlike test/guests-role-enforcement.test.js's AC4, there is no
  "actor recorded in the audit log" behavior on the hires routes themselves to add a test for.

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

review_focus: |
  Scope is strictly the four hires write routes (create/edit/deactivate/reactivate) gated to
  `hr`/`manager` via the existing `enforceOnboardingRole` middleware; read routes are deliberately
  left open per AC6 — flag anything that adds a role check to `GET /hires` or `GET /hires/:id`,
  including the new edge-case test that sets an explicit-but-unrecognized role on a GET and still
  expects 200. The riskiest part is the mechanical update to pre-existing tests in
  test/hires.test.js and test/hires-validation.test.js to add a role header — verify each updated
  test still exercises its original assertion (not just made to pass by adding a header) and that
  no AC coverage was accidentally deleted. The new edge-case tests (case-sensitive role string,
  empty-header-as-401, role-check-before-404-check, validation errors surviving an authorized
  request, rejection even on a would-be no-op reactivate) require no production code beyond what
  AC1-AC5 already need — they exist only to pin down behavior inherited for free from
  `enforceOnboardingRole`, so a reviewer should not expect to see extra logic in
  src/hires/routes.js to "support" them. Also deliberate: both `hr` and `manager` are accepted for
  all four actions, not restricted per-action (e.g. HR can also edit, manager can also create) —
  this follows directly from reusing `enforceOnboardingRole` as-is, so it should not be flagged as
  under-scoping the per-action role split implied by reading AC1-AC4 in isolation.
