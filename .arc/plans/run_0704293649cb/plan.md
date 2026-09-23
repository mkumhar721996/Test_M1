summary: |
  This repo has no Run, Workflow, tenant, or role/auth concept at all today — only an unrelated
  `src/employees/{routes,store}.js` in-memory API (verified: plain `Map`, `crypto.randomUUID()`,
  no middleware beyond `express.json()`/`express.static`) mounted on a bare `src/server.js`,
  tested with Jest + Supertest. This story builds the Run lifecycle "start" surface from
  scratch, mirroring that exact pattern: a new `src/workflows/store.js` (in-memory Workflow
  definition versions, published-vs-draft pinning logic) and a new `src/runs/store.js`
  (in-memory Runs, duplicate-active-run guard, tenant scoping), fronted by a new
  `src/runs/routes.js` (`POST /runs`, `GET /runs/:id`) mounted the same way `employeesRouter`
  is. Since no authentication/tenant-resolution middleware exists anywhere in the codebase, this
  plan introduces the minimal stand-in needed to satisfy the role/tenant ACs: a small
  `src/auth/actor.js` helper that reads `x-tenant-id` and `x-actor-role` request headers (as a
  real auth/gateway layer would already have validated and attached upstream) rather than
  inventing a full auth system out of scope for this story. Workflow definition authoring
  (creating/publishing versions) has no story yet, so `src/workflows/store.js` exposes
  `addDefinitionVersion` as an internal seam only — used by this story's own tests to seed
  published/draft versions, not exposed via any HTTP route. Concurrency for AC11/AC12 is handled
  by keeping `startRun`'s check-then-create logic fully synchronous (no `await` between the
  active-run check and the write), which Node's single-threaded event loop cannot interleave.
scope:
  - description: |
      Add `src/auth/actor.js`: a minimal stand-in for identity/tenant resolution, since no such
      middleware exists anywhere in the repo today. Reads two headers that a real auth/gateway
      layer would already have validated and attached upstream:
      ```js
      const ALLOWED_START_ROLES = ['hr_coordinator', 'hiring_manager', 'platform_admin'];

      function getActor(req) {
        return {
          tenantId: req.header('x-tenant-id'),
          role: req.header('x-actor-role'),
        };
      }

      module.exports = { getActor, ALLOWED_START_ROLES };
      ```
    files:
      - src/auth/actor.js
    rationale: |
      ACs 3, 8, 9, and 10 require tenant scoping and role-based authorization, but the codebase
      (verified: `src/server.js`, `src/employees/routes.js`) has zero auth/tenant infrastructure.
      This is the smallest possible seam that lets routes read actor context without building a
      full auth system, which is out of scope for this story.
  - description: |
      Add `src/workflows/store.js`: in-memory Workflow definition versions per tenant, with the
      pinning rule ACs 2/13/14 require (prefer the current published version; fall back to the
      latest draft when none is published):
      ```js
      const crypto = require('crypto');

      const versionsByTenant = new Map();

      function addDefinitionVersion(tenantId, { status = 'draft' } = {}) {
        const list = versionsByTenant.get(tenantId) || [];
        const version = {
          id: crypto.randomUUID(),
          tenantId,
          versionNumber: list.length + 1,
          status,
          createdAt: new Date().toISOString(),
        };
        list.push(version);
        versionsByTenant.set(tenantId, list);
        return version;
      }

      function getVersionToPin(tenantId) {
        const list = versionsByTenant.get(tenantId) || [];
        const published = list.filter((v) => v.status === 'published');
        if (published.length > 0) return published[published.length - 1];
        const drafts = list.filter((v) => v.status === 'draft');
        if (drafts.length > 0) return drafts[drafts.length - 1];
        return null;
      }

      module.exports = { addDefinitionVersion, getVersionToPin };
      ```
      `addDefinitionVersion` has no HTTP route in this story (workflow authoring is a separate,
      not-yet-written story) — it exists solely as the seam `src/runs/store.js` and this story's
      tests use to seed/read Workflow definition state.
    files:
      - src/workflows/store.js
    rationale: |
      AC2 requires the Run to pin the version current at creation time; AC13/14 require a
      graceful fallback to the latest draft when the tenant has no published version. Isolating
      this lookup lets it be unit-tested directly, independent of the Run/HTTP layer.
  - description: |
      Add `src/runs/store.js`: in-memory Runs, keyed by id, with the duplicate-active-run guard
      and tenant scoping. Mirrors `src/employees/store.js`'s `Map` + `crypto.randomUUID()` style:
      ```js
      const crypto = require('crypto');
      const { getVersionToPin } = require('../workflows/store');

      const ACTIVE_STATUSES = ['started', 'paused', 'blocked'];
      const runsById = new Map();

      class DuplicateActiveRunError extends Error {
        constructor(existingRunId) {
          super('An active Run already exists for this hire.');
          this.code = 'DUPLICATE_ACTIVE_RUN';
          this.existingRunId = existingRunId;
        }
      }

      function listRunsForHire(tenantId, hireId) {
        return [...runsById.values()].filter(
          (run) => run.tenantId === tenantId && run.hireId === hireId
        );
      }

      function findActiveRunForHire(tenantId, hireId) {
        return listRunsForHire(tenantId, hireId).find((run) => ACTIVE_STATUSES.includes(run.status));
      }

      function startRun({ tenantId, hireId }) {
        const existingActive = findActiveRunForHire(tenantId, hireId);
        if (existingActive) {
          throw new DuplicateActiveRunError(existingActive.id);
        }
        const versionToPin = getVersionToPin(tenantId);
        const run = {
          id: crypto.randomUUID(),
          tenantId,
          hireId,
          workflowDefinitionVersionId: versionToPin ? versionToPin.id : null,
          status: 'started',
          createdAt: new Date().toISOString(),
        };
        runsById.set(run.id, run);
        return run;
      }

      function getRun(id) {
        return runsById.get(id);
      }

      module.exports = { startRun, getRun, listRunsForHire, DuplicateActiveRunError, ACTIVE_STATUSES };
      ```
      The check-then-create in `startRun` has no `await` between the active-run lookup and the
      `runsById.set` write, so two same-tick calls cannot interleave under Node's single-threaded
      event loop — this is what makes AC11/12 hold without a lock or DB transaction.
    files:
      - src/runs/store.js
    rationale: |
      AC1/4/5/6/7/11/12 are all Run-store invariants (create, reject-duplicate, allow-after-
      terminal, exactly-one-under-concurrency). `listRunsForHire` is exported because both the
      duplicate guard and AC5/AC7's "no extra Run" / "prior Run still retrievable" assertions
      need to enumerate a hire's Runs, not just fetch one by id.
  - description: |
      Add `src/runs/routes.js`: `POST /runs` (start) and `GET /runs/:id` (tenant-scoped fetch),
      mirroring `src/employees/routes.js`'s router-per-resource pattern:
      ```js
      const express = require('express');
      const { getActor, ALLOWED_START_ROLES } = require('../auth/actor');
      const { startRun, getRun, DuplicateActiveRunError } = require('./store');

      const router = express.Router();

      router.post('/', (req, res) => {
        const actor = getActor(req);
        if (!ALLOWED_START_ROLES.includes(actor.role)) {
          return res.status(403).json({
            code: 'UNAUTHORIZED_ROLE',
            message: 'Role is not authorized to start a Run.',
          });
        }
        try {
          const run = startRun({ tenantId: actor.tenantId, hireId: req.body.hireId });
          return res.status(201).json(run);
        } catch (err) {
          if (err instanceof DuplicateActiveRunError) {
            return res.status(409).json({
              code: err.code,
              message: err.message,
              existing_run_id: err.existingRunId,
            });
          }
          throw err;
        }
      });

      router.get('/:id', (req, res) => {
        const actor = getActor(req);
        const run = getRun(req.params.id);
        if (!run) {
          return res.status(404).json({ error: 'run not found' });
        }
        if (run.tenantId !== actor.tenantId) {
          return res.status(403).json({ code: 'FORBIDDEN', message: 'Run belongs to a different tenant.' });
        }
        return res.status(200).json(run);
      });

      module.exports = router;
      ```
    files:
      - src/runs/routes.js
    rationale: |
      This is the HTTP surface ACs 1, 3, 4, 6, 8, 9, 10, 11, 12 exercise. Role check happens
      before the duplicate/tenant logic so AC10 (unauthorized role) never leaks information about
      whether an active Run exists.
  - description: |
      Modify `src/server.js` to mount the new router next to the existing one:
      ```js
      const runsRouter = require('./runs/routes');
      // ...
      app.use('/runs', runsRouter);
      ```
      The `/employees` mount and static-file serving are unchanged.
    files:
      - src/server.js
    rationale: |
      Without this the new routes are unreachable through the app the tests exercise via
      `require('../src/server')`, exactly as `test/employees.test.js` already does.
  - description: |
      Add `test/workflows.test.js`: failing-tests-first, plain Jest/Node (no HTTP), for the
      pinning rule in isolation.
    files:
      - test/workflows.test.js
    rationale: |
      Backs AC2/13/14's core logic with a fast, DOM/HTTP-free unit test before it's exercised
      indirectly through the Run HTTP layer.
  - description: |
      Add `test/runs.test.js`: failing-tests-first, Supertest against `src/server.js`, matching
      `test/employees.test.js`'s style exactly. One test per remaining acceptance criterion (see
      `tests` below). Imports `listRunsForHire`/`getRun` from `src/runs/store.js` directly
      alongside the HTTP client to assert on store state that has no dedicated HTTP endpoint
      (e.g. "no additional Run was created"), and mutates a fetched run's `.status` directly
      (the store returns the same object reference it holds in its `Map`) to simulate reaching a
      terminal state, since no lifecycle-transition endpoint exists in this story.
    files:
      - test/runs.test.js
    rationale: |
      Covers ACs 1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12 end to end against the real app, using a
      fresh `crypto.randomUUID()` tenant/hire pair per test so the shared in-memory store's state
      from other tests never bleeds in.
tests:
  - |
    AC1 — starting a Run for a hire with no active Run creates it in the 'started' state:
    ```js
    test('AC1: starting a Run for a new hire with no active Run creates it in the started state', async () => {
      const tenantId = crypto.randomUUID();
      const hireId = crypto.randomUUID();
      const res = await request(app)
        .post('/runs')
        .set({ 'x-tenant-id': tenantId, 'x-actor-role': 'hr_coordinator' })
        .send({ hireId });
      expect(res.status).toBe(201);
      expect(res.body.status).toBe('started');
    });
    ```
    Fails until `src/runs/routes.js` and `src/runs/store.js` exist and are mounted.
  - |
    AC2 — the created Run is pinned to the tenant's current published Workflow definition
    version:
    ```js
    test('AC2: the created Run is pinned to the current published Workflow definition version', async () => {
      const tenantId = crypto.randomUUID();
      const hireId = crypto.randomUUID();
      addDefinitionVersion(tenantId, { status: 'draft' });
      const published = addDefinitionVersion(tenantId, { status: 'published' });
      const res = await request(app)
        .post('/runs')
        .set({ 'x-tenant-id': tenantId, 'x-actor-role': 'hiring_manager' })
        .send({ hireId });
      expect(res.body.workflowDefinitionVersionId).toBe(published.id);
    });
    ```
    Fails until `startRun` calls `getVersionToPin` and stores the result.
  - |
    AC3 — the created Run is scoped to the initiating user's tenant:
    ```js
    test('AC3: the created Run is scoped to the initiating tenant', async () => {
      const tenantId = crypto.randomUUID();
      const hireId = crypto.randomUUID();
      const res = await request(app)
        .post('/runs')
        .set({ 'x-tenant-id': tenantId, 'x-actor-role': 'hr_coordinator' })
        .send({ hireId });
      expect(res.body.tenantId).toBe(tenantId);
    });
    ```
  - |
    AC4 — a duplicate active Run is rejected with a structured DUPLICATE_ACTIVE_RUN error:
    ```js
    test('AC4: a duplicate start attempt is rejected with a structured DUPLICATE_ACTIVE_RUN error', async () => {
      const headers = { 'x-tenant-id': crypto.randomUUID(), 'x-actor-role': 'hr_coordinator' };
      const hireId = crypto.randomUUID();
      const first = await request(app).post('/runs').set(headers).send({ hireId });
      const second = await request(app).post('/runs').set(headers).send({ hireId });
      expect(second.status).toBe(409);
      expect(second.body.code).toBe('DUPLICATE_ACTIVE_RUN');
      expect(typeof second.body.message).toBe('string');
      expect(second.body.existing_run_id).toBe(first.body.id);
    });
    ```
  - |
    AC5 — no additional Run is created for the hire after a rejected duplicate attempt:
    ```js
    test('AC5: no additional Run is created after a rejected duplicate attempt', async () => {
      const tenantId = crypto.randomUUID();
      const hireId = crypto.randomUUID();
      const headers = { 'x-tenant-id': tenantId, 'x-actor-role': 'hr_coordinator' };
      await request(app).post('/runs').set(headers).send({ hireId });
      await request(app).post('/runs').set(headers).send({ hireId });
      expect(listRunsForHire(tenantId, hireId)).toHaveLength(1);
    });
    ```
    Requires `listRunsForHire` exported from `src/runs/store.js`.
  - |
    AC6 — a rehire can start a new Run once the prior Run has reached a terminal state:
    ```js
    test('AC6: a rehire can start a new Run once the prior Run is terminal', async () => {
      const tenantId = crypto.randomUUID();
      const hireId = crypto.randomUUID();
      const headers = { 'x-tenant-id': tenantId, 'x-actor-role': 'hr_coordinator' };
      const first = await request(app).post('/runs').set(headers).send({ hireId });
      getRun(first.body.id).status = 'completed';
      const second = await request(app).post('/runs').set(headers).send({ hireId });
      expect(second.status).toBe(201);
      expect(second.body.id).not.toBe(first.body.id);
    });
    ```
  - |
    AC7 — the prior Run record remains retrievable in its terminal state:
    ```js
    test('AC7: the prior Run remains retrievable in its terminal state', async () => {
      const tenantId = crypto.randomUUID();
      const hireId = crypto.randomUUID();
      const headers = { 'x-tenant-id': tenantId, 'x-actor-role': 'hr_coordinator' };
      const first = await request(app).post('/runs').set(headers).send({ hireId });
      getRun(first.body.id).status = 'completed';
      await request(app).post('/runs').set(headers).send({ hireId });
      const priorRes = await request(app).get(`/runs/${first.body.id}`).set(headers);
      expect(priorRes.status).toBe(200);
      expect(priorRes.body.status).toBe('completed');
    });
    ```
  - |
    AC8 — a queried Run is associated with the tenant/project it was created for:
    ```js
    test('AC8: a queried Run is associated with its tenant', async () => {
      const tenantId = crypto.randomUUID();
      const hireId = crypto.randomUUID();
      const headers = { 'x-tenant-id': tenantId, 'x-actor-role': 'hr_coordinator' };
      const createRes = await request(app).post('/runs').set(headers).send({ hireId });
      const getRes = await request(app).get(`/runs/${createRes.body.id}`).set(headers);
      expect(getRes.body.tenantId).toBe(tenantId);
    });
    ```
  - |
    AC9 — a user from a different tenant is denied access:
    ```js
    test('AC9: a different tenant is denied access to the Run', async () => {
      const tenantId = crypto.randomUUID();
      const hireId = crypto.randomUUID();
      const createRes = await request(app)
        .post('/runs')
        .set({ 'x-tenant-id': tenantId, 'x-actor-role': 'hr_coordinator' })
        .send({ hireId });
      const res = await request(app)
        .get(`/runs/${createRes.body.id}`)
        .set({ 'x-tenant-id': crypto.randomUUID(), 'x-actor-role': 'hr_coordinator' });
      expect(res.status).toBe(403);
    });
    ```
  - |
    AC10 — a user without an authorized role is rejected with an authorization error:
    ```js
    test('AC10: an unauthorized role is rejected when starting a Run', async () => {
      const res = await request(app)
        .post('/runs')
        .set({ 'x-tenant-id': crypto.randomUUID(), 'x-actor-role': 'employee' })
        .send({ hireId: crypto.randomUUID() });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('UNAUTHORIZED_ROLE');
    });
    ```
  - |
    AC11 — two simultaneous start requests for the same hire create exactly one Run:
    ```js
    test('AC11: concurrent start requests for the same hire create exactly one Run', async () => {
      const tenantId = crypto.randomUUID();
      const hireId = crypto.randomUUID();
      const headers = { 'x-tenant-id': tenantId, 'x-actor-role': 'hr_coordinator' };
      await Promise.all([
        request(app).post('/runs').set(headers).send({ hireId }),
        request(app).post('/runs').set(headers).send({ hireId }),
      ]);
      expect(listRunsForHire(tenantId, hireId)).toHaveLength(1);
    });
    ```
  - |
    AC12 — the other concurrent request is rejected with DUPLICATE_ACTIVE_RUN:
    ```js
    test('AC12: the losing concurrent request is rejected with DUPLICATE_ACTIVE_RUN', async () => {
      const tenantId = crypto.randomUUID();
      const hireId = crypto.randomUUID();
      const headers = { 'x-tenant-id': tenantId, 'x-actor-role': 'hr_coordinator' };
      const [a, b] = await Promise.all([
        request(app).post('/runs').set(headers).send({ hireId }),
        request(app).post('/runs').set(headers).send({ hireId }),
      ]);
      const statuses = [a.status, b.status].sort();
      expect(statuses).toEqual([201, 409]);
      const rejected = a.status === 409 ? a : b;
      expect(rejected.body.code).toBe('DUPLICATE_ACTIVE_RUN');
    });
    ```
  - |
    AC13 — with no current published Workflow definition version, the Run is still created:
    ```js
    test('AC13: a tenant with no published version can still start a Run', async () => {
      const tenantId = crypto.randomUUID();
      const hireId = crypto.randomUUID();
      addDefinitionVersion(tenantId, { status: 'draft' });
      const res = await request(app)
        .post('/runs')
        .set({ 'x-tenant-id': tenantId, 'x-actor-role': 'platform_admin' })
        .send({ hireId });
      expect(res.status).toBe(201);
    });
    ```
  - |
    AC14 — with no published version, the Run is pinned to the latest draft version:
    ```js
    test('AC14: the Run is pinned to the latest draft version when none is published', () => {
      const tenantId = crypto.randomUUID();
      addDefinitionVersion(tenantId, { status: 'draft' });
      const latestDraft = addDefinitionVersion(tenantId, { status: 'draft' });
      expect(getVersionToPin(tenantId).id).toBe(latestDraft.id);
    });
    ```
    This one lives in `test/workflows.test.js`; a matching integration assertion on
    `res.body.workflowDefinitionVersionId` is also included in `test/runs.test.js`'s AC13 case
    extended to assert `expect(res.body.workflowDefinitionVersionId).toBe(latestDraft.id)`.
assumptions_or_open_questions:
  - |
    No authentication/tenant-resolution middleware exists anywhere in this repo today (verified:
    `src/server.js` only has `express.json()` and static serving). This plan introduces
    `src/auth/actor.js`, which reads `x-tenant-id`/`x-actor-role` headers as a stand-in for a
    real auth/gateway layer that would already have validated and attached this identity
    upstream. If a real auth system is introduced later, `getActor` is the single seam to swap.
  - |
    `hireId` is treated as an opaque string and is not cross-referenced against
    `src/employees/store.js`'s employee records — no AC requires rejecting a Run start for a
    hire id that doesn't correspond to an existing employee record.
  - |
    Workflow definition authoring (creating/publishing versions) has no story yet.
    `src/workflows/store.js`'s `addDefinitionVersion` is exposed only as an internal seam this
    story's own tests use to seed state; it is not reachable via any HTTP route in this plan.
  - |
    Run lifecycle transitions (pause/block/complete/fail/cancel) are out of scope for this story.
    `test/runs.test.js` reaches a terminal state for AC6/AC7 by mutating the object returned by
    `getRun` directly (the store's `Map` holds that same object by reference), rather than
    calling a transition endpoint that doesn't exist yet.
  - |
    AC11/12's "exactly one Run created" guarantee relies on `startRun`'s check-then-create body
    never containing an `await` between the active-run lookup and the `Map.set` write, so
    Node's single-threaded event loop cannot interleave two concurrent calls. This is a load-
    bearing invariant for any future change to `startRun` (e.g. swapping the in-memory `Map` for
    a real database) — a async persistence layer would need its own transactional guard to
    preserve this AC.
  - |
    A tenant with zero Workflow definition versions at all (not even a draft) is not explicitly
    covered by any AC (AC13/14 only describe "no published version," implying a draft exists
    per AC14). This plan has `getVersionToPin` return `null` in that case, and the Run is stored
    with `workflowDefinitionVersionId: null` — flagged here as a product decision to confirm
    rather than inferred from any AC.
package_dependencies: []
notes: |
  This plan's scope crosses from the HTTP route layer down into two independent in-memory
  stores and a new auth seam, so the shape is worth diagramming:

  ```mermaid
  flowchart TD
    Server["src/server.js"] -->|app.use('/runs'), new| RunsRoutes["src/runs/routes.js"]
    Server -->|unchanged| EmployeesRouter["src/employees/routes.js"]
    RunsRoutes -->|getActor, role check| Actor["src/auth/actor.js"]
    RunsRoutes -->|startRun, getRun| RunsStore["src/runs/store.js"]
    RunsStore -->|getVersionToPin| WorkflowsStore["src/workflows/store.js"]
    TestRuns["test/runs.test.js"] -->|supertest| Server
    TestRuns -->|listRunsForHire, getRun for direct assertions| RunsStore
    TestRuns -->|addDefinitionVersion to seed| WorkflowsStore
    TestWorkflows["test/workflows.test.js"] -->|addDefinitionVersion, getVersionToPin| WorkflowsStore

    classDef touched fill:#f96,color:#000
    class Server,RunsRoutes,Actor,RunsStore,WorkflowsStore,TestRuns,TestWorkflows touched
  ```

  `src/employees/*` is untouched and shown only for context — no AC in this story involves it.
  The layering mirrors the existing `employees` module exactly (`routes.js` delegates
  persistence to `store.js`), extended with one extra store (`workflows`) that `runs/store.js`
  depends on for the pinning rule, and one new cross-cutting seam (`auth/actor.js`) that both
  the role check and tenant-scoping logic in `runs/routes.js` read from.
