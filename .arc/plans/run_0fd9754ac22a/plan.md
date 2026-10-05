summary: |
  TEST-M1-STORY-155 already built the hire-profile CRUD, validation, and deactivate/reactivate
  lifecycle (including run-cancellation-on-deactivate and fresh-run-on-reactivate) in
  `src/hires/store.js`/`src/hires/routes.js`, with full UI in `public/hire-profiles.html` and
  `public/hire-profile.html`. What TEST-M1-STORY-167 adds on top, per its scope text
  ("Restricts creation, editing, deactivate and reactivate to HR + Manager roles"), is role
  enforcement: today `src/hires/routes.js` has no auth check at all, so AC1/AC5/AC6 (reject
  non-HR/Manager actors on create/edit/deactivate/reactivate) currently fail. This plan wires
  the existing `enforceOnboardingRole` middleware (already used by `src/runs/routes.js` and
  `src/workflows/routes.js` for the same HR/Manager role gate) onto those four hires routes,
  updates the existing route-level tests that currently call those routes with no role header
  so they keep passing, adds a dedicated role-enforcement test suite for AC1/AC5/AC6, adds a
  regression-guard test for AC9 (no delete route exists — already true today), and makes the
  minimal frontend fix needed so the already-shipped hire-profile pages keep working once the
  backend starts rejecting un-authenticated requests (their default API clients send no
  `x-staff-role` header today). AC2/AC3/AC4/AC7/AC8/AC9 are already satisfied by existing store
  logic; this plan does not touch `src/hires/store.js`.

scope:
  - description: |
      Gate the four mutating hires routes behind the existing HR/Manager role check, reusing
      `enforceOnboardingRole` from `src/runs/auth.js` (already the HR/Manager gate for
      `src/runs/routes.js` and `src/workflows/routes.js` — it 401s with no `x-staff-role` header
      and 403s for any role other than `hr`/`manager`). `GET /hires` and `GET /hires/:id` are
      left ungated, matching that same precedent (only mutating actions are gated in this
      domain) and matching the story scope text, which lists only "creation, editing, deactivate
      and reactivate".

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
      This is the only production-code change needed: `enforceOnboardingRole` already exists
      and already encodes exactly the HR+Manager rule this story needs (verified in
      src/runs/auth.js and its use in src/runs/routes.js / src/workflows/routes.js). No new
      auth module or role model is needed.

  - description: |
      Add a dedicated role-enforcement test suite for AC1 (create), AC5 (edit), and AC6
      (deactivate/reactivate), mirroring the existing `test/rooms-role-enforcement.test.js` /
      `test/guests-role-enforcement.test.js` pattern, plus one regression-guard test for AC9.
    files:
      - test/hires-role-enforcement.test.js
    rationale: |
      Concrete assertions (new file):
      ```js
      const request = require('supertest');
      const app = require('../src/server');
      const { createHire, getHire, listHires } = require('../src/hires/store');

      function seedHire(overrides = {}) {
        return createHire({ name: 'A', department: 'Sales', role: 'AE', startDate: '2026-01-01', ...overrides });
      }

      test('AC1: a non-HR/Manager role creating a profile gets 403 and nothing is created', async () => {
        const before = listHires().length;
        const res = await request(app).post('/hires').set('x-staff-role', 'front_desk')
          .send({ name: 'X', department: 'Sales', role: 'AE', startDate: '2026-01-01' });
        expect(res.status).toBe(403);
        expect(res.body).toEqual({ error: 'forbidden' });
        expect(listHires().length).toBe(before);
      });

      test('AC1: no x-staff-role header at all is 401 and nothing is created', async () => {
        const before = listHires().length;
        const res = await request(app).post('/hires')
          .send({ name: 'X', department: 'Sales', role: 'AE', startDate: '2026-01-01' });
        expect(res.status).toBe(401);
        expect(res.body).toEqual({ error: 'unauthorized' });
        expect(listHires().length).toBe(before);
      });

      test.each(['hr', 'manager'])('AC2: role "%s" is permitted to create', async (role) => {
        const res = await request(app).post('/hires').set('x-staff-role', role)
          .send({ name: 'X', department: 'Sales', role: 'AE', startDate: '2026-01-01' });
        expect(res.status).toBe(201);
      });

      test('AC5: a non-HR/Manager role editing a profile gets 403 and the profile is unchanged', async () => {
        const hire = await seedHire();
        const res = await request(app).patch(`/hires/${hire.id}`).set('x-staff-role', 'front_desk').send({ name: 'Changed' });
        expect(res.status).toBe(403);
        expect(getHire(hire.id).name).toBe('A');
      });

      test.each(['deactivate', 'reactivate'])('AC6: a non-HR/Manager role calling %s gets 403 and profileStatus is unchanged', async (action) => {
        const hire = await seedHire({ hireStage: 'offer_accepted' });
        const before = getHire(hire.id).profileStatus;
        const res = await request(app).post(`/hires/${hire.id}/${action}`).set('x-staff-role', 'front_desk').send({});
        expect(res.status).toBe(403);
        expect(getHire(hire.id).profileStatus).toBe(before);
      });

      test.each(['deactivate', 'reactivate'])('AC6: no role header on %s is 401', async (action) => {
        const hire = await seedHire({ hireStage: 'offer_accepted' });
        const res = await request(app).post(`/hires/${hire.id}/${action}`).send({});
        expect(res.status).toBe(401);
      });

      test('AC9: there is no delete route for a hire profile', async () => {
        const hire = await seedHire();
        const res = await request(app).delete(`/hires/${hire.id}`).set('x-staff-role', 'manager');
        expect(res.status).toBe(404);
        expect(getHire(hire.id)).toBeTruthy();
      });
      ```
      The AC9 test is a regression guard, not a new behavior — `src/hires/routes.js` already has
      no DELETE handler today, confirmed by reading the file.

  - description: |
      Update the existing route-level hires tests that call the now-gated routes without a role
      header so they keep exercising AC2/AC3/AC4/AC7/AC8 instead of incidentally hitting the new
      401. In `test/hires.test.js`, add `.set('x-staff-role', 'manager')` to the POST /hires,
      PATCH /hires/:id, POST /hires/:id/deactivate, and POST /hires/:id/reactivate calls. In
      `test/hires-validation.test.js`, add the same header to the two route-level tests ("POST
      /hires with a missing required field..." and "PATCH /hires/:id clearing a required
      field..."); the store-level tests in that file call `createHire`/`updateHire` directly and
      are unaffected by route-layer auth.
    files:
      - test/hires.test.js
      - test/hires-validation.test.js
    rationale: |
      These tests currently pass because the routes have no auth check; once
      `enforceOnboardingRole` is added they would start failing with 401 for reasons unrelated to
      what they're actually testing (profile creation/edit/lifecycle behavior), which would mask
      real regressions in that behavior. Adding the header keeps them testing AC2/AC3/AC4/AC7/AC8
      as originally intended.

  - description: |
      Make the already-shipped hire-profile pages (built under TEST-M1-STORY-155) keep working
      once the backend rejects un-authenticated mutations: their default API clients currently
      send no `x-staff-role` header on create/update/deactivate/reactivate. Add
      `'x-staff-role': 'manager'` to those requests, mirroring the existing convention in
      `public/js/run-detail.js` (same onboarding domain, hardcodes `'manager'` because there is
      no role-switcher control on that page) rather than inventing a new pattern.

      `public/js/hire-profiles.js` — before:
      ```js
      function request(url, method, body) {
        return fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: body === undefined ? undefined : JSON.stringify(body),
        })...
      }
      ```
      after:
      ```js
      function request(url, method, body) {
        return fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json', 'x-staff-role': 'manager' },
          body: body === undefined ? undefined : JSON.stringify(body),
        })...
      }
      ```

      `public/js/hire-profile.js` — before:
      ```js
      function createDefaultApi(hireId) {
        const patch = (changes) => fetch(`/hires/${hireId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(changes),
        }).then((res) => res.json());
        return {
          saveStage: (hireStage) => patch({ hireStage }),
          updateRoleDepartment: (changes) => patch(changes),
          updateContact: (changes) => patch(changes),
          deactivate: () => fetch(`/hires/${hireId}/deactivate`, { method: 'POST' }).then((res) => res.json()),
          reactivate: () => fetch(`/hires/${hireId}/reactivate`, { method: 'POST' }).then((res) => res.json()),
        };
      }
      module.exports = { initHireProfileApp };
      ```
      after:
      ```js
      function createDefaultApi(hireId) {
        const patch = (changes) => fetch(`/hires/${hireId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'x-staff-role': 'manager' },
          body: JSON.stringify(changes),
        }).then((res) => res.json());
        return {
          saveStage: (hireStage) => patch({ hireStage }),
          updateRoleDepartment: (changes) => patch(changes),
          updateContact: (changes) => patch(changes),
          deactivate: () => fetch(`/hires/${hireId}/deactivate`, { method: 'POST', headers: { 'x-staff-role': 'manager' } }).then((res) => res.json()),
          reactivate: () => fetch(`/hires/${hireId}/reactivate`, { method: 'POST', headers: { 'x-staff-role': 'manager' } }).then((res) => res.json()),
        };
      }
      module.exports = { initHireProfileApp, createDefaultApi };
      ```
      `createDefaultApi` must be exported from `hire-profile.js` (it already is from
      `hire-profiles.js`) so the new test below can exercise it directly, matching how
      `test/guest-profiles.test.js` tests `public/js/guest-profiles.js`'s `createDefaultApi`.
    files:
      - public/js/hire-profiles.js
      - public/js/hire-profile.js
    rationale: |
      No UI prototype for TEST-M1-STORY-167 could be read (see assumptions) and none of AC1-9
      imply new visual elements — the design already approved for the hire-profile pages is the
      STORY-155 one, which this plan does not alter. This is purely plumbing so the existing,
      already-approved UI keeps functioning against the newly-gated backend; it adds no new
      screens, buttons, or layout.

  - description: |
      Add `createDefaultApi` header tests mirroring the existing
      `describe('createDefaultApi', ...)` block in `test/guest-profiles.test.js`.
    files:
      - test/hire-profiles.test.js
      - test/hire-profile.test.js
    rationale: |
      In `test/hire-profiles.test.js`:
      ```js
      describe('createDefaultApi', () => {
        const originalFetch = global.fetch;
        afterEach(() => { global.fetch = originalFetch; });

        test('create() sends the x-staff-role header', async () => {
          global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'hire_1' }) });
          const { createDefaultApi } = require('../public/js/hire-profiles');
          await createDefaultApi().create({ name: 'A' });
          expect(global.fetch).toHaveBeenCalledWith('/hires', expect.objectContaining({
            headers: expect.objectContaining({ 'x-staff-role': 'manager' }),
          }));
        });

        test('update() sends the x-staff-role header', async () => {
          global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'hire_1' }) });
          const { createDefaultApi } = require('../public/js/hire-profiles');
          await createDefaultApi().update('hire_1', { name: 'A' });
          expect(global.fetch).toHaveBeenCalledWith('/hires/hire_1', expect.objectContaining({
            headers: expect.objectContaining({ 'x-staff-role': 'manager' }),
          }));
        });
      });
      ```
      In `test/hire-profile.test.js`:
      ```js
      describe('createDefaultApi', () => {
        const originalFetch = global.fetch;
        afterEach(() => { global.fetch = originalFetch; });

        test('deactivate() sends the x-staff-role header', async () => {
          global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
          const { createDefaultApi } = require('../public/js/hire-profile');
          await createDefaultApi('hire_1').deactivate();
          expect(global.fetch).toHaveBeenCalledWith('/hires/hire_1/deactivate', expect.objectContaining({
            headers: expect.objectContaining({ 'x-staff-role': 'manager' }),
          }));
        });

        test('updateContact() sends the x-staff-role header on the PATCH', async () => {
          global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
          const { createDefaultApi } = require('../public/js/hire-profile');
          await createDefaultApi('hire_1').updateContact({ name: 'A' });
          expect(global.fetch).toHaveBeenCalledWith('/hires/hire_1', expect.objectContaining({
            method: 'PATCH',
            headers: expect.objectContaining({ 'x-staff-role': 'manager' }),
          }));
        });
      });
      ```

tests:
  - |
    `test/hires-role-enforcement.test.js` — AC1: `POST /hires` with `x-staff-role: front_desk`
    returns 403 `{ error: 'forbidden' }` and `listHires().length` is unchanged; with no header at
    all returns 401 `{ error: 'unauthorized' }` and nothing is created; with `hr` or `manager`
    returns 201.
  - |
    `test/hires.test.js` (updated) — AC2: `POST /hires` with `x-staff-role: manager` and all of
    name/department/role/startDate/email/phone provided returns 201 and
    `expect(res.body).toMatchObject(payload)`.
  - |
    `test/hires-validation.test.js` (updated) — AC3: `POST /hires` with `x-staff-role: manager`
    and a missing field returns 400 and
    `expect(res.body).toMatchObject({ error: 'validation_error', fields: { name: 'Full name is required.' } })`.
  - |
    `test/hires.test.js` (updated) — AC4: `PATCH /hires/:id` with `x-staff-role: manager` and a
    changed field returns 200 and `expect(patchRes.body.name).toBe('A B')`.
  - |
    `test/hires-role-enforcement.test.js` — AC5: `PATCH /hires/:id` with
    `x-staff-role: front_desk` returns 403 and `expect(getHire(hire.id).name).toBe('A')`
    (unchanged).
  - |
    `test/hires-role-enforcement.test.js` — AC6: `POST /hires/:id/deactivate` and
    `POST /hires/:id/reactivate` with `x-staff-role: front_desk` (and separately with no header)
    both return 403 (401 for no header) and
    `expect(getHire(hire.id).profileStatus).toBe(before)`.
  - |
    `test/hires-store.test.js` (existing, unchanged) — AC7: `deactivateHire` on a hire with an
    active run sets `run` to `null` and pushes a `{ status: 'cancelled', reason: 'profile_deactivated' }`
    entry onto `runHistory`; already passes today and is not touched by this plan.
  - |
    `test/hires-store.test.js` (existing, unchanged) — AC8: `reactivateHire` on a deactivated
    profile sets `run` to `expect.objectContaining({ status: 'active', tasksDone: 0, freshStart: true })`;
    already passes today and is not touched by this plan.
  - |
    `test/hires-role-enforcement.test.js` — AC9: `DELETE /hires/:id` with `x-staff-role: manager`
    returns 404 (no such route exists) and `expect(getHire(hire.id)).toBeTruthy()` (the profile
    still exists — only deactivation removed it from active circulation, never a hard delete).

assumptions_or_open_questions:
  - |
    The design prototype at
    `.arc/designs/TEST-M1-STORY-167-design.html` does not exist in this worktree (confirmed via
    a glob for `.arc/designs/*`, which lists prototypes only up through TEST-M1-STORY-155) and
    could not be read. The story's scope text and all nine ACs describe backend
    authorization/validation/lifecycle behavior with no new visual elements implied, and the
    existing STORY-155 UI (`public/hire-profiles.html`, `public/hire-profile.html`) already
    covers create/edit/deactivate/reactivate end-to-end per `test/hire-profiles.test.js` and
    `test/hire-profile.test.js`. This plan therefore does no new UI design work (per
    instructions) and only makes the minimal, non-visual frontend change needed (sending an
    `x-staff-role` header) to keep that already-approved UI functioning once the backend starts
    rejecting un-authenticated requests. If a STORY-167-specific visual redesign does exist
    somewhere else, it was not found and should be pointed out to re-plan the UI portion.
  - |
    Hardcoded the role sent by the hire-profile pages' default API clients as `'manager'`,
    mirroring `public/js/run-detail.js`'s existing convention in the same onboarding domain
    (there is no role-switcher control on these pages, unlike `public/js/rooms.js`'s `getRole()`).
    Flagging this as a decision a reviewer may want to revisit (e.g. prefer `'hr'`, or defer to a
    future real-auth/role-switcher story) — none of the ACs mandate which role the UI itself
    sends, only that the backend reject non-HR/Manager callers.
  - |
    `GET /hires` and `GET /hires/:id` are left ungated by `enforceOnboardingRole`. This matches
    the existing precedent in `src/runs/routes.js` and `src/workflows/routes.js` (only mutating
    endpoints are gated in this domain) and the story's own scope text, which lists only
    "creation, editing, deactivate and reactivate" as restricted — viewing is not mentioned in
    any AC.

package_dependencies: []

notes: |
  AC2, AC3, AC4, AC7, AC8, and AC9 are already implemented and already covered by passing tests
  from TEST-M1-STORY-155 (`src/hires/store.js`, `test/hires-store.test.js`,
  `test/hires-validation.test.js`). This plan's actual delta is the HR/Manager role gate
  (AC1/AC5/AC6) plus the test and frontend-wiring fallout from adding it.

  ```mermaid
  flowchart TD
    classDef touched fill:#f96,color:#000

    hireProfilesJs["public/js/hire-profiles.js<br/>(list/create/edit table UI)"]
    hireProfileJs["public/js/hire-profile.js<br/>(single-profile detail UI)"]
    hiresRoutes["src/hires/routes.js"]
    runsAuth["src/runs/auth.js<br/>(enforceOnboardingRole)"]
    hiresStore["src/hires/store.js<br/>(untouched — createHire/updateHire/\ndeactivateHire/reactivateHire)"]
    runsRoutes["src/runs/routes.js<br/>(existing enforceOnboardingRole caller)"]
    workflowsRoutes["src/workflows/routes.js<br/>(existing enforceOnboardingRole caller)"]

    hireProfilesJs -- "fetch POST/PATCH /hires\n(now sends x-staff-role: manager)" --> hiresRoutes
    hireProfileJs -- "fetch PATCH /hires/:id,\n/deactivate, /reactivate\n(now sends x-staff-role: manager)" --> hiresRoutes
    hiresRoutes -- "new: enforceOnboardingRole\non POST/PATCH/deactivate/reactivate" --> runsAuth
    hiresRoutes -- "unchanged calls" --> hiresStore
    runsRoutes -. "existing use of same middleware" .-> runsAuth
    workflowsRoutes -. "existing use of same middleware" .-> runsAuth

    class hireProfilesJs,hireProfileJs,hiresRoutes touched
  ```

review_focus: |
  In scope: adding the HR/Manager role gate (`enforceOnboardingRole`) to
  `POST /hires`, `PATCH /hires/:id`, `POST /hires/:id/deactivate`, and `POST /hires/:id/reactivate`,
  plus the minimal frontend header change needed to keep the already-shipped STORY-155 UI
  working against that gate. Out of scope: any change to validation rules, the deactivate/
  reactivate run-cancellation logic, or `src/hires/store.js` generally — all of that already
  exists and already passes its tests from STORY-155; this plan does not touch that file. The
  riskiest spot is the updates to `test/hires.test.js` and `test/hires-validation.test.js`:
  adding `x-staff-role` headers there must not silently change what those tests actually assert
  about AC2-AC4/AC7/AC8 behavior, only unblock them past the new 401/403. Also worth checking:
  this plan hardcodes `'manager'` as the role the hire-profile pages' own API clients send
  (there's no role-switcher UI for these pages, mirroring `run-detail.js`'s existing precedent)
  — that's a deliberate, flagged assumption, not an oversight.
