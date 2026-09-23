summary: |
  This is the first backend feature after the existing Express `employees` API
  (`src/employees/{routes,store}.js`, mounted in `src/server.js`, tested with Jest + Supertest
  against the exported `app`). TEST-M1-STORY-044 adds a `workflows` resource that lets an
  authorized actor create and version a canonical onboarding Workflow definition (task graph +
  sequencing rules + conditional branches), with eager structural validation at save time,
  per-tenant scoping, and an audit trail (actor/timestamp/version) on every saved version.
  Nothing in this repo today models authentication, roles, or tenancy — the existing employees
  API has none of those concerns — so this plan introduces the minimal request-header-based
  actor/tenant context needed to satisfy the ACs (`x-actor-role`, `x-actor-id`, `x-tenant-id`),
  flagged explicitly under assumptions since it is a real design decision, not something already
  established elsewhere in the code. Runs/Run-lifecycle do not exist anywhere in this codebase
  (a separate story under the same parent epic), so ACs 2 and 5, which talk about Runs, are
  verified at the level this story actually controls: version retrieval by id (latest) and by
  explicit version number, immediately after a save and unaffected by later saves. Everything is
  in-memory, mirroring the existing employees store, and is added as new `src/workflows/*`
  modules plus a new `test/workflows.test.js` / `test/workflow-validation.test.js`, following
  exactly the router -> store -> (validation) layering already used by `src/employees/*`.
scope:
  - description: |
      Add the pure structural validator for a Workflow definition. A definition is
      `{ tasks: [{ id, name?, ... }], sequencing?: [{ from, to }], branches?: [{ from, whenTrue?,
      whenFalse?, ... }] }`. The validator checks only structural/referential integrity — it does
      not enforce business rules (e.g. it does not detect cycles in `sequencing`), since the ACs
      describe rejecting "a structurally invalid element" and identifying it, not full graph
      analysis (see assumptions).
      ```js
      // src/workflows/validation.js
      function validateWorkflowDefinition(definition) {
        const errors = [];
        if (!definition || typeof definition !== 'object' || Array.isArray(definition)) {
          return [{ field: 'definition', message: 'definition must be an object' }];
        }
        const tasks = Array.isArray(definition.tasks) ? definition.tasks : [];
        if (tasks.length === 0) {
          errors.push({ field: 'tasks', message: 'at least one task is required' });
        }
        const taskIds = new Set();
        tasks.forEach((task, i) => {
          if (!task || typeof task.id !== 'string' || task.id === '') {
            errors.push({ field: `tasks[${i}].id`, message: 'task id must be a non-empty string' });
            return;
          }
          if (taskIds.has(task.id)) {
            errors.push({ field: `tasks[${i}].id`, message: `duplicate task id "${task.id}"` });
          }
          taskIds.add(task.id);
        });
        const sequencing = Array.isArray(definition.sequencing) ? definition.sequencing : [];
        sequencing.forEach((rule, i) => {
          if (!taskIds.has(rule.from)) {
            errors.push({ field: `sequencing[${i}].from`, message: `references unknown task id "${rule.from}"` });
          }
          if (!taskIds.has(rule.to)) {
            errors.push({ field: `sequencing[${i}].to`, message: `references unknown task id "${rule.to}"` });
          }
        });
        const branches = Array.isArray(definition.branches) ? definition.branches : [];
        branches.forEach((branch, i) => {
          ['from', 'whenTrue', 'whenFalse'].forEach((key) => {
            const value = branch[key];
            if (value !== undefined && !taskIds.has(value)) {
              errors.push({ field: `branches[${i}].${key}`, message: `references unknown task id "${value}"` });
            }
          });
        });
        return errors;
      }
      module.exports = { validateWorkflowDefinition };
      ```
      Returns an array of `{ field, message }` errors (empty array means valid) — `field` is what
      makes AC6's "clear error identifying the invalid element" concrete and testable.
    files:
      - src/workflows/validation.js
    rationale: |
      Isolating structural validation as a pure function (no store/HTTP concerns) is what makes
      AC6/AC7 testable directly, independent of persistence, and mirrors the existing precedent of
      pulling pure logic into its own module (e.g. the currency/validation helpers under
      `public/`).
  - description: |
      Add the in-memory, tenant-scoped, versioned workflow store. Keyed first by tenant, then by
      workflow id, holding an append-only array of version records (never mutated in place, which
      is what makes AC4/AC5 — "the prior version remains accessible" / "unaffected" — true by
      construction).
      ```js
      // src/workflows/store.js
      const crypto = require('crypto');
      const { validateWorkflowDefinition } = require('./validation');

      const tenants = new Map(); // tenantId -> Map<workflowId, VersionRecord[]>

      function getTenantWorkflows(tenantId) {
        if (!tenants.has(tenantId)) tenants.set(tenantId, new Map());
        return tenants.get(tenantId);
      }

      function saveWorkflow({ tenantId, workflowId, definition, actor }) {
        const errors = validateWorkflowDefinition(definition);
        if (errors.length > 0) {
          const err = new Error('workflow definition is invalid');
          err.code = 'VALIDATION_ERROR';
          err.details = errors;
          throw err;
        }
        const workflows = getTenantWorkflows(tenantId);
        const id = workflowId || crypto.randomUUID();
        const versions = workflows.get(id) || [];
        const record = {
          id,
          version: versions.length + 1,
          definition,
          savedBy: actor,
          savedAt: new Date().toISOString(),
        };
        workflows.set(id, [...versions, record]);
        return record;
      }

      function getLatestVersion(tenantId, workflowId) {
        const versions = getTenantWorkflows(tenantId).get(workflowId);
        return versions && versions.length > 0 ? versions[versions.length - 1] : undefined;
      }

      function getVersion(tenantId, workflowId, version) {
        const versions = getTenantWorkflows(tenantId).get(workflowId);
        return versions ? versions.find((v) => v.version === version) : undefined;
      }

      module.exports = { saveWorkflow, getLatestVersion, getVersion };
      ```
      `saveWorkflow` throws (rather than returning an error shape) on validation failure so the
      router can map it to a 400 without ever touching the `versions` array — satisfying AC7 ("no
      new version is created") structurally, since the push only happens after validation passes.
    files:
      - src/workflows/store.js
    rationale: |
      Nesting by `tenantId` first means a lookup with a different tenant id simply can't reach
      another tenant's `Map` entry — this is what makes AC9/AC10 true by construction rather than
      by an extra filter that could be forgotten. Storing an immutable array of version records
      (never edited or removed) is what makes AC4 and AC5 true by construction: fetching an old
      `version` number always returns the exact record captured at save time, before or after any
      later save.
  - description: |
      Add the Express router: tenant-header requirement, role-based authorization on write, and
      the three endpoints — create/update (POST), get-latest (GET by id), get-specific-version
      (GET by id + version).
      ```js
      // src/workflows/routes.js
      const express = require('express');
      const { saveWorkflow, getLatestVersion, getVersion } = require('./store');

      const AUTHORIZED_ROLES = new Set(['hr_coordinator', 'platform_admin']);
      const router = express.Router();

      router.use((req, res, next) => {
        const tenantId = req.header('x-tenant-id');
        if (!tenantId) return res.status(400).json({ error: 'x-tenant-id header is required' });
        req.tenantId = tenantId;
        next();
      });

      router.post('/', (req, res) => {
        const role = req.header('x-actor-role');
        if (!AUTHORIZED_ROLES.has(role)) {
          return res.status(403).json({ error: 'not authorized to save workflow definitions' });
        }
        const actor = req.header('x-actor-id') || 'unknown';
        const { workflowId, definition } = req.body;
        try {
          const record = saveWorkflow({ tenantId: req.tenantId, workflowId, definition, actor });
          res.status(201).json(record);
        } catch (err) {
          if (err.code === 'VALIDATION_ERROR') {
            return res.status(400).json({ error: err.message, details: err.details });
          }
          throw err;
        }
      });

      router.get('/:id', (req, res) => {
        const record = getLatestVersion(req.tenantId, req.params.id);
        if (!record) return res.status(404).json({ error: 'workflow not found' });
        res.status(200).json(record);
      });

      router.get('/:id/versions/:version', (req, res) => {
        const record = getVersion(req.tenantId, req.params.id, Number(req.params.version));
        if (!record) return res.status(404).json({ error: 'workflow version not found' });
        res.status(200).json(record);
      });

      module.exports = router;
      ```
    files:
      - src/workflows/routes.js
    rationale: |
      AC11's authorization check and the tenant-header check both live in the router because
      they're HTTP-layer concerns (reading headers, producing 400/403 status codes), keeping
      `store.js` a plain, HTTP-agnostic persistence module — the same separation
      `src/employees/routes.js` / `src/employees/store.js` already use.
  - description: |
      Mount the new router in the existing Express app factory, alongside the untouched
      `employees` router.
      Before:
      ```js
      app.use('/employees', employeesRouter);
      ```
      After:
      ```js
      const workflowsRouter = require('./workflows/routes');
      // ...
      app.use('/employees', employeesRouter);
      app.use('/workflows', workflowsRouter);
      ```
    files:
      - src/server.js
    rationale: |
      `src/server.js` (verified current contents) is the single Express app factory used by both
      `src/index.js` and every Supertest suite; mounting here is the minimal change needed to make
      `/workflows` reachable through the same exported `app` the new tests drive.
  - description: |
      Add the failing-tests-first HTTP suite driving ACs 1-5 and 8-11 end-to-end via Supertest
      against the exported `app`, matching `test/employees.test.js`'s style exactly (no mocking
      of the store).
    files:
      - test/workflows.test.js
    rationale: |
      This is the test-first artifact for the multi-tenant, versioning, and authorization
      behavior; see `tests` below for the concrete assertions per AC.
  - description: |
      Add a dedicated unit-test suite for the pure structural validator, covering AC6/AC7's
      validation rule directly (dangling task references, duplicate ids) without any HTTP
      involvement, plus the HTTP-level rejection behavior for the same ACs in
      `test/workflows.test.js`.
    files:
      - test/workflow-validation.test.js
    rationale: |
      A fast, DOM/HTTP-free unit test for `validateWorkflowDefinition` pins down the exact error
      shape (`field`/`message`) independently of the router's error-mapping, matching the
      project's existing precedent of unit-testing pure helpers separately from integration tests
      (e.g. `test/currency.test.js` / `test/validation.test.js` alongside `test/app.test.js`).
tests:
  - |
    AC1 — saving a new Workflow definition as an authorized actor persists it as version 1
    (`test/workflows.test.js`):
    ```js
    const request = require('supertest');
    const app = require('../src/server');

    const validDefinition = {
      tasks: [{ id: 'send_offer' }, { id: 'collect_docs' }],
      sequencing: [{ from: 'send_offer', to: 'collect_docs' }],
    };

    test('AC1: saving a new workflow definition persists it as version 1', async () => {
      const res = await request(app)
        .post('/workflows')
        .set('x-tenant-id', 'tenant-a')
        .set('x-actor-role', 'hr_coordinator')
        .set('x-actor-id', 'user-1')
        .send({ definition: validDefinition });
      expect(res.status).toBe(201);
      expect(res.body.version).toBe(1);
    });
    ```
  - |
    AC2 — the new version is immediately available (no Run entity exists in this codebase, so
    this is verified as: GET-latest returns it right after save) (`test/workflows.test.js`):
    ```js
    test('AC2: the new version is immediately retrievable for starting new runs', async () => {
      const createRes = await request(app)
        .post('/workflows')
        .set('x-tenant-id', 'tenant-a')
        .set('x-actor-role', 'hr_coordinator')
        .send({ definition: validDefinition });
      const getRes = await request(app)
        .get(`/workflows/${createRes.body.id}`)
        .set('x-tenant-id', 'tenant-a');
      expect(getRes.status).toBe(200);
      expect(getRes.body.version).toBe(1);
      expect(getRes.body.definition).toEqual(validDefinition);
    });
    ```
  - |
    AC3 — saving an update to an existing Workflow definition assigns a new version number
    (`test/workflows.test.js`):
    ```js
    test('AC3: saving an update assigns a new version number', async () => {
      const createRes = await request(app).post('/workflows')
        .set('x-tenant-id', 'tenant-a').set('x-actor-role', 'hr_coordinator')
        .send({ definition: validDefinition });
      const updateRes = await request(app).post('/workflows')
        .set('x-tenant-id', 'tenant-a').set('x-actor-role', 'hr_coordinator')
        .send({ workflowId: createRes.body.id, definition: { tasks: [{ id: 'send_offer' }] } });
      expect(updateRes.status).toBe(201);
      expect(updateRes.body.version).toBe(2);
    });
    ```
  - |
    AC4 — the prior version remains accessible after an update (`test/workflows.test.js`):
    ```js
    test('AC4: the prior version remains accessible after an update', async () => {
      const createRes = await request(app).post('/workflows')
        .set('x-tenant-id', 'tenant-a').set('x-actor-role', 'hr_coordinator')
        .send({ definition: validDefinition });
      const { id } = createRes.body;
      await request(app).post('/workflows')
        .set('x-tenant-id', 'tenant-a').set('x-actor-role', 'hr_coordinator')
        .send({ workflowId: id, definition: { tasks: [{ id: 'send_offer' }] } });

      const v1Res = await request(app).get(`/workflows/${id}/versions/1`).set('x-tenant-id', 'tenant-a');
      expect(v1Res.status).toBe(200);
      expect(v1Res.body.definition).toEqual(validDefinition);
    });
    ```
  - |
    AC5 — in-flight Runs are not affected by a later update (no Run entity exists yet, so this
    models a Run that already pinned to a version: capture a version record, save an update, then
    re-fetch that exact version number and assert it is unchanged) (`test/workflows.test.js`):
    ```js
    test('AC5: a version already pinned before an update is unaffected by that update', async () => {
      const createRes = await request(app).post('/workflows')
        .set('x-tenant-id', 'tenant-a').set('x-actor-role', 'hr_coordinator')
        .send({ definition: validDefinition });
      const pinned = createRes.body; // simulates a Run resolving to this version at start time

      await request(app).post('/workflows')
        .set('x-tenant-id', 'tenant-a').set('x-actor-role', 'hr_coordinator')
        .send({ workflowId: pinned.id, definition: { tasks: [{ id: 'send_offer' }] } });

      const refetched = await request(app)
        .get(`/workflows/${pinned.id}/versions/${pinned.version}`)
        .set('x-tenant-id', 'tenant-a');
      expect(refetched.body.definition).toEqual(pinned.definition);
    });
    ```
  - |
    AC6 — a structurally invalid definition is rejected with an error identifying the invalid
    element, both at the unit level (`test/workflow-validation.test.js`) and the HTTP level
    (`test/workflows.test.js`):
    ```js
    // test/workflow-validation.test.js
    const { validateWorkflowDefinition } = require('../src/workflows/validation');

    test('AC6: a sequencing rule referencing an unknown task id is reported by field', () => {
      const errors = validateWorkflowDefinition({
        tasks: [{ id: 'a' }],
        sequencing: [{ from: 'a', to: 'missing_task' }],
      });
      expect(errors).toEqual(expect.arrayContaining([
        expect.objectContaining({ field: 'sequencing[0].to', message: expect.stringContaining('missing_task') }),
      ]));
    });
    ```
    ```js
    // test/workflows.test.js
    test('AC6: an invalid definition is rejected with a 400 identifying the invalid element', async () => {
      const res = await request(app).post('/workflows')
        .set('x-tenant-id', 'tenant-a').set('x-actor-role', 'hr_coordinator')
        .send({ definition: { tasks: [{ id: 'a' }], sequencing: [{ from: 'a', to: 'missing' }] } });
      expect(res.status).toBe(400);
      expect(res.body.details[0].field).toBe('sequencing[0].to');
    });
    ```
  - |
    AC7 — a rejected save does not create a new version (`test/workflows.test.js`):
    ```js
    test('AC7: a rejected save does not create a new version', async () => {
      const createRes = await request(app).post('/workflows')
        .set('x-tenant-id', 'tenant-a').set('x-actor-role', 'hr_coordinator')
        .send({ definition: validDefinition });
      const { id } = createRes.body;

      await request(app).post('/workflows')
        .set('x-tenant-id', 'tenant-a').set('x-actor-role', 'hr_coordinator')
        .send({ workflowId: id, definition: { tasks: [{ id: 'a' }], sequencing: [{ from: 'a', to: 'missing' }] } });

      const getRes = await request(app).get(`/workflows/${id}`).set('x-tenant-id', 'tenant-a');
      expect(getRes.body.version).toBe(1);
    });
    ```
  - |
    AC8 — a saved Workflow definition records the actor, timestamp, and version number
    (`test/workflows.test.js`):
    ```js
    test('AC8: a saved workflow records the actor, timestamp, and version number', async () => {
      const res = await request(app).post('/workflows')
        .set('x-tenant-id', 'tenant-a').set('x-actor-role', 'hr_coordinator').set('x-actor-id', 'user-42')
        .send({ definition: validDefinition });
      expect(res.body.savedBy).toBe('user-42');
      expect(res.body.version).toBe(1);
      expect(Number.isNaN(new Date(res.body.savedAt).getTime())).toBe(false);
    });
    ```
  - |
    AC9 — a Workflow definition is created/retrieved scoped to the tenant it was created under
    (`test/workflows.test.js`):
    ```js
    test('AC9: a workflow is retrievable within the tenant it was created under', async () => {
      const createRes = await request(app).post('/workflows')
        .set('x-tenant-id', 'tenant-a').set('x-actor-role', 'hr_coordinator')
        .send({ definition: validDefinition });
      const getRes = await request(app).get(`/workflows/${createRes.body.id}`).set('x-tenant-id', 'tenant-a');
      expect(getRes.status).toBe(200);
    });
    ```
  - |
    AC10 — a Workflow definition is not visible to or executable by another tenant
    (`test/workflows.test.js`):
    ```js
    test('AC10: a workflow created under one tenant is not visible to another tenant', async () => {
      const createRes = await request(app).post('/workflows')
        .set('x-tenant-id', 'tenant-a').set('x-actor-role', 'hr_coordinator')
        .send({ definition: validDefinition });
      const otherTenantRes = await request(app)
        .get(`/workflows/${createRes.body.id}`)
        .set('x-tenant-id', 'tenant-b');
      expect(otherTenantRes.status).toBe(404);
    });
    ```
  - |
    AC11 — a user without HR coordinator or platform admin role cannot save a Workflow
    definition (`test/workflows.test.js`):
    ```js
    test('AC11: an unauthorized role cannot save a workflow definition', async () => {
      const res = await request(app).post('/workflows')
        .set('x-tenant-id', 'tenant-a').set('x-actor-role', 'employee')
        .send({ definition: validDefinition });
      expect(res.status).toBe(403);
    });
    ```
assumptions_or_open_questions:
  - |
    No authentication, role, or tenancy system exists anywhere in this repo today (the existing
    `employees` API has none of those concerns). This plan resolves actor role/id and tenant id
    from request headers (`x-actor-role`, `x-actor-id`, `x-tenant-id`) as the minimal stand-in
    needed to satisfy ACs 9-11, since no real auth/session/tenancy layer exists elsewhere in the
    codebase to build on. This is a real design decision, not an established convention — flagging
    for explicit reviewer sign-off. If a real auth layer is introduced by another story later,
    this router's two checks (tenant-header presence, role-set membership) are the only places
    that would need to change.
  - |
    The Workflow definition JSON shape (`{ tasks, sequencing, branches }`) is invented for this
    story: no design file, ADR, or existing code specifies the exact schema for a "task graph,
    sequencing rules, and conditional branches." It's kept intentionally generic (arbitrary task
    objects; `sequencing`/`branches` entries are just id-references) so structural validation can
    be purely referential without over-constraining business semantics that aren't specified.
  - |
    "Structurally invalid" is scoped to referential integrity: every task has a unique non-empty
    `id`, and every `sequencing`/`branches` entry references an existing task id. Cycle detection
    in the `sequencing` graph is explicitly NOT implemented — the ACs describe rejecting and
    identifying "an invalid element," not whole-graph analysis. Flagging in case the reviewer
    wants cycles treated as structurally invalid too; that would be an additive change to
    `validateWorkflowDefinition` only.
  - |
    Runs/Run lifecycle do not exist anywhere in this codebase (tracked as separate stories under
    the same parent epic). AC2 and AC5 are therefore verified at the level this story actually
    controls: AC2 as "GET-latest returns the new version immediately after save," and AC5 as "a
    version snapshot captured before a later save is byte-identical when re-fetched by its
    explicit version number after that save" (modeling what a Run pinned to that version would
    observe). No Run entity is created, referenced, or persisted by this plan.
  - |
    Storage is in-memory only, mirroring the existing `src/employees/store.js` precedent — data
    does not survive a process restart. No database or other persistence infra exists anywhere in
    the repo to build on instead.
  - |
    `workflowId` is caller-supplied in the POST body to target an update; if omitted (or it
    doesn't match an existing id for that tenant), the store always creates a brand-new workflow
    at version 1 rather than erroring, since no AC describes an explicit "update a specific,
    named workflow that doesn't exist" failure case.
package_dependencies: []
notes: |
  This plan's scope crosses the same router -> store layering the existing `employees` resource
  already uses, plus a new validation layer beneath the store and the `src/server.js` mount
  point that wires it in.

  ```mermaid
  flowchart TD
    Server["src/server.js"] -->|mounts /workflows, new| Routes["src/workflows/routes.js"]
    Server -->|unchanged| EmployeesRouter["src/employees/routes.js"]
    Routes -->|tenant header + role check, then delegates| Store["src/workflows/store.js"]
    Store -->|validates before persisting| Validation["src/workflows/validation.js"]
    TestHTTP["test/workflows.test.js"] -->|supertest against exported app| Server
    TestValidation["test/workflow-validation.test.js"] -->|direct unit test| Validation

    classDef touched fill:#f96,color:#000
    class Server,Routes,Store,Validation,TestHTTP,TestValidation touched
  ```

  Layering rationale: `routes.js` is the only module that touches HTTP concerns (headers, status
  codes) and role/tenant authorization, exactly mirroring how `src/employees/routes.js` delegates
  persistence to `src/employees/store.js`; `store.js` owns tenant-scoping and version-array
  immutability (the mechanism behind AC4/AC5/AC9/AC10); `validation.js` is a pure function with no
  knowledge of HTTP or storage, so AC6/AC7's rule is unit-testable in isolation.
