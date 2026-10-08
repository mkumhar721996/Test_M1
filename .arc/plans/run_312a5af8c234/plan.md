summary: |
  `src/workflows/{store,routes}.js` and `test/workflows.test.js` already exist in this codebase
  (added by an earlier Run-lifecycle story, TEST-M1-STORY-138, per `.arc/plans/run_24bf4bb52a7f/plan.md`):
  `createWorkflow`/`updateWorkflow` already persist a `taskGraph` (`{ tasks: [{ id, name?, next?,
  requirement? }] }`) as an append-only array of versions, and `src/runs/store.js` already starts
  real Run entities from `getLatestVersion(workflowId)`. This plan extends that real, in-place
  implementation to satisfy TEST-M1-STORY-044's remaining ACs rather than re-deriving a
  green-field `workflows` resource: it adds (a) eager structural validation of the task graph at
  save time (AC6/AC7), (b) role-based authorization on save using the project's established
  `x-staff-role` header convention with two new role values, `hr_coordinator`/`platform_admin`
  (AC11), (c) audit metadata — actor (derived from the authenticated role, never the request
  body, mirroring the tested precedent in `test/runs-authorization.test.js`), timestamp, and
  version — on every saved version (AC8), and (d) tenant/project scoping reusing the project's
  established `src/projects/store.js` + `x-user-id` membership pattern already used by
  `src/defects/*` (AC9/AC10). AC1-AC5 (version 1 on create, new version numbers on update, prior
  versions remaining accessible, in-flight Runs pinned to their original version) are already
  true of the existing store and are re-verified end-to-end against the real `/runs` HTTP
  surface, not a stand-in, since Runs genuinely exist in this codebase. Because `POST /workflows`
  and `POST /workflows/:id/versions` currently have no authorization at all, this plan's role gate
  (AC11) requires adding the new `x-staff-role` header to the 5 pre-existing HTTP call sites in
  `test/runs.test.js` and `test/runs-completion.test.js` that post to those routes today, or they
  would start failing with 401.

scope:
  - description: |
      Add a pure structural validator for the REAL task-graph shape already stored by
      `createWorkflow`/`updateWorkflow` (`{ tasks: [{ id, name?, next?: string[], ... }] }`),
      extended with one new optional field, `branch`, to represent "conditional branches" (not
      previously modeled anywhere in the codebase):
      ```js
      // src/workflows/validation.js
      class WorkflowValidationError extends Error {
        constructor(message, fields = {}) {
          super(message);
          this.statusCode = 400;
          this.fields = fields;
        }
      }

      function validateTaskGraph(taskGraph) {
        const fields = {};
        const tasks = taskGraph && Array.isArray(taskGraph.tasks) ? taskGraph.tasks : null;
        if (!tasks || tasks.length === 0) {
          throw new WorkflowValidationError('validation_error', { tasks: 'At least one task is required.' });
        }
        const ids = new Set();
        tasks.forEach((task, i) => {
          if (!task || typeof task.id !== 'string' || task.id.trim() === '') {
            fields[`tasks[${i}].id`] = 'Task id must be a non-empty string.';
            return;
          }
          if (ids.has(task.id)) fields[`tasks[${i}].id`] = `Duplicate task id "${task.id}".`;
          ids.add(task.id);
        });
        tasks.forEach((task, i) => {
          if (!task) return;
          if (task.next !== undefined) {
            if (!Array.isArray(task.next)) {
              fields[`tasks[${i}].next`] = 'next must be an array of task ids.';
            } else {
              task.next.forEach((targetId, j) => {
                if (!ids.has(targetId)) fields[`tasks[${i}].next[${j}]`] = `References unknown task id "${targetId}".`;
              });
            }
          }
          if (task.branch !== undefined) {
            const branch = task.branch;
            if (!branch || typeof branch !== 'object' || Array.isArray(branch)) {
              fields[`tasks[${i}].branch`] = 'branch must be an object.';
            } else {
              ['whenTrue', 'whenFalse'].forEach((key) => {
                const targetId = branch[key];
                if (targetId !== undefined && !ids.has(targetId)) {
                  fields[`tasks[${i}].branch.${key}`] = `References unknown task id "${targetId}".`;
                }
              });
            }
          }
        });
        if (Object.keys(fields).length > 0) throw new WorkflowValidationError('validation_error', fields);
      }
      module.exports = { WorkflowValidationError, validateTaskGraph };
      ```
      `fields` is a flat `{ path: message }` object, matching the exact convention already used
      by `HireValidationError`/`DefectValidationError`/`GuestValidationError` (not an array of
      `{field,message}` objects), so AC6's "clear error identifying the invalid element" and the
      HTTP `{ error: 'validation_error', fields }` response shape stay consistent with every
      other resource in this codebase.
    files:
      - src/workflows/validation.js
    rationale: |
      Isolating structural validation as a pure, throwing function (no store/HTTP concerns) is
      what makes AC6 directly unit-testable and, by being called before any mutation of the
      `versions` array in `store.js`, is what makes AC7 ("no new version is created") true by
      construction rather than by an extra guard that could be forgotten.

  - description: |
      Add a small per-resource auth middleware reusing the project's established `x-staff-role`
      header convention (already used identically by `src/runs/auth.js`, `src/leave/auth.js`,
      and inline in `src/guests/routes.js`/`src/rooms/routes.js`), with two new role values for
      this story:
      ```js
      // src/workflows/auth.js
      const ROLE_ACTORS = { hr_coordinator: 'HR Coordinator', platform_admin: 'Platform Admin' };

      function enforceWorkflowAuthorRole(req, res, next) {
        const role = req.headers['x-staff-role'];
        if (!role) return res.status(401).json({ error: 'unauthorized' });
        if (!Object.prototype.hasOwnProperty.call(ROLE_ACTORS, role)) {
          return res.status(403).json({ error: 'forbidden' });
        }
        req.actor = ROLE_ACTORS[role];
        next();
      }
      module.exports = { enforceWorkflowAuthorRole, ROLE_ACTORS };
      ```
    files:
      - src/workflows/auth.js
    rationale: |
      Every other resource module in this codebase (`runs`, `leave`, `guests`, `rooms`) owns its
      own private role-to-actor mapping behind the same shared `x-staff-role` header rather than
      a shared global auth module; `hires/routes.js` even imports another module's auth helper
      directly (`enforceOnboardingRole` from `../runs/auth`), so a workflows-local file mirrors
      the established pattern exactly. Setting `req.actor` here (not trusting a client-supplied
      actor field) is what satisfies AC8 safely, mirroring the explicitly tested precedent in
      `test/runs-authorization.test.js`: "the audit actor comes from the authenticated role,
      never from the request body."

  - description: |
      Extend (not replace) `src/workflows/store.js` to thread validation, actor/timestamp
      audit fields, and an optional `projectId` through the existing `createWorkflow`/
      `updateWorkflow`/`getLatestVersion`/`getVersion` functions, keeping every existing call
      signature backward compatible via default parameters (the many direct callers in
      `src/runs/store.js` and `test/runs*.test.js`/`test/workflows.test.js` call
      `createWorkflow(taskGraph)`/`updateWorkflow(id, taskGraph)` with no options object today):
      ```js
      // src/workflows/store.js (signature changes only; existing crypto/clone helpers untouched)
      function createWorkflow(taskGraph, { projectId = '', actor = 'System' } = {}) {
        validateTaskGraph(taskGraph);
        const id = crypto.randomUUID();
        const versionEntry = { version: 1, taskGraph: clone(taskGraph), savedBy: actor, savedAt: new Date().toISOString() };
        workflows.set(id, { id, projectId, versions: [versionEntry] });
        return getVersion(id, 1);
      }

      function updateWorkflow(workflowId, taskGraph, { actor = 'System' } = {}) {
        const workflow = workflows.get(workflowId);
        if (!workflow) return undefined;
        validateTaskGraph(taskGraph);
        const version = workflow.versions.length + 1;
        workflow.versions.push({ version, taskGraph: clone(taskGraph), savedBy: actor, savedAt: new Date().toISOString() });
        return getVersion(workflowId, version);
      }
      ```
      `getVersion`/`getLatestVersion` keep their existing 1-2 arg signatures (no `projectId`
      parameter) and are extended only to also return `projectId`, `savedBy`, `savedAt` on the
      cloned record, e.g. `{ workflowId, version, taskGraph, projectId, savedBy, savedAt }`.
    files:
      - src/workflows/store.js
    rationale: |
      `validateTaskGraph` runs before any push into the `versions` array in both
      `createWorkflow` and `updateWorkflow`, so a thrown `WorkflowValidationError` structurally
      guarantees AC7. Keeping `getLatestVersion(workflowId)`/`getVersion(workflowId, version)`
      untouched in arity means `src/runs/store.js`'s existing direct calls (`startRun`,
      `seedExampleRun`) need zero changes — tenant scoping is enforced one layer up, in
      `routes.js`, exactly mirroring how `src/defects/store.js` has no scoping logic at all and
      `src/defects/routes.js` applies `isVisibleTo` itself.

  - description: |
      Wire the new role check onto the two save routes, add optional project-membership
      enforcement reusing `src/projects/store.js` (the same store `src/defects/routes.js`
      already uses) when a `projectId` is supplied, and add the two retrieval routes this story
      needs (today `src/workflows/routes.js` has no `GET` route at all), reusing
      `requireAuthenticatedUser` from `../defects/auth` the same way `src/hires/routes.js`
      already imports `enforceOnboardingRole` from `../runs/auth`:
      ```js
      // src/workflows/routes.js (additions; POST /:id/runs block is untouched)
      const { enforceWorkflowAuthorRole } = require('./auth');
      const { requireAuthenticatedUser } = require('../defects/auth');
      const { WorkflowValidationError } = require('./validation');
      const projectsStore = require('../projects/store');

      function isVisible(definition, req) {
        return !definition.projectId || projectsStore.listProjectIdsForUser(req.userId).includes(definition.projectId);
      }

      router.post('/', enforceWorkflowAuthorRole, (req, res, next) => {
        try {
          const { taskGraph, projectId } = req.body;
          if (projectId) {
            const userId = req.headers['x-user-id'];
            if (!userId || !projectsStore.listProjectIdsForUser(userId).includes(projectId)) {
              return res.status(403).json({ error: 'forbidden' });
            }
          }
          const d = createWorkflow(taskGraph, { projectId, actor: req.actor });
          res.status(201).json({ id: d.workflowId, version: d.version, taskGraph: d.taskGraph, projectId: d.projectId, savedBy: d.savedBy, savedAt: d.savedAt });
        } catch (err) {
          if (err instanceof WorkflowValidationError) return res.status(400).json({ error: 'validation_error', fields: err.fields });
          next(err);
        }
      });

      router.get('/:id', requireAuthenticatedUser, (req, res) => {
        const d = getLatestVersion(req.params.id);
        if (!d || !isVisible(d, req)) return res.status(404).json({ error: 'workflow not found' });
        res.status(200).json({ id: d.workflowId, version: d.version, taskGraph: d.taskGraph, projectId: d.projectId, savedBy: d.savedBy, savedAt: d.savedAt });
      });

      router.get('/:id/versions/:version', requireAuthenticatedUser, (req, res) => {
        const d = getVersion(req.params.id, Number(req.params.version));
        if (!d || !isVisible(d, req)) return res.status(404).json({ error: 'workflow version not found' });
        res.status(200).json({ id: d.workflowId, version: d.version, taskGraph: d.taskGraph, projectId: d.projectId, savedBy: d.savedBy, savedAt: d.savedAt });
      });
      ```
      `POST /:id/versions` gets the same `enforceWorkflowAuthorRole` + `WorkflowValidationError`
      try/catch treatment as `POST /`, with its existing 404-on-missing-workflow behavior
      unchanged. `POST /:id/runs` (and its `enforceOnboardingRole` import) is left exactly as-is.
    files:
      - src/workflows/routes.js
    rationale: |
      `requireAuthenticatedUser` is reused rather than reimplemented since it is already
      generic (`x-user-id` header, fail-closed in production) with no defect-specific logic,
      exactly the kind of cross-module auth reuse `hires/routes.js` already does. Checking
      project membership only when a `projectId` is supplied on save (403), and always on read
      via `isVisible` (404 — indistinguishable from not-found, mirroring
      `src/defects/routes.js`'s own `isVisibleTo`), keeps the 5 pre-existing HTTP call sites that
      post to `/workflows`/`/workflows/:id/versions` with no tenant context at all working once
      they add the one now-required `x-staff-role` header (see next scope item), instead of also
      needing a brand-new `x-user-id`/project setup that the Run-lifecycle story's tests never
      needed.

  - description: |
      Update the 5 pre-existing HTTP-level call sites that post to the now-role-gated save
      routes with no `x-staff-role` header today, adding `.set('x-staff-role', 'hr_coordinator')`
      so they keep passing: `test/runs.test.js` (lines 27, 35-36, 44, 48-49) and
      `test/runs-completion.test.js` (line 80).
    files:
      - test/runs.test.js
      - test/runs-completion.test.js
    rationale: |
      These tests exercise Run-lifecycle behavior (pinned versions, completion) through
      `POST /workflows` and `POST /workflows/:id/versions`, which currently have no
      authorization at all. Once AC11's role gate is live, both routes correctly reject these
      calls with 401 unless a permitted role header is present; adding that header is the
      minimal, mechanical fix needed to keep the existing Run-lifecycle suite green, the same
      kind of pre-existing-assertion update already done for this epic in
      `.arc/plans/run_24bf4bb52a7f/plan.md` (there: a status-string rename broke one assertion
      in `test/runs-completion.test.js`; here: a new auth gate requires one header on 5 calls).

  - description: |
      Extend the existing `test/workflows.test.js` (today pure store-level, no HTTP) with
      AC1/AC2/AC3/AC4/AC5/AC8 coverage, including real end-to-end checks against the genuine
      `/runs` HTTP surface (Runs already exist in this codebase via `src/runs/*`).
    files:
      - test/workflows.test.js
    rationale: |
      See `tests` below for the concrete assertions. Because Runs are real here, AC2 ("available
      for starting new Runs") and AC5 ("in-flight Runs are not affected") are verified literally
      against `POST /workflows/:id/runs` and `GET /runs/:id`, not against a modeled stand-in.

  - description: |
      Add a new unit-test file for the pure structural validator (AC6/AC7), matching the
      project's existing precedent of testing pure helpers in their own file.
    files:
      - test/workflows-validation.test.js
    rationale: |
      A fast, HTTP-free test pins down the exact `fields` shape (`tasks[i].id`,
      `tasks[i].next[j]`, `tasks[i].branch.whenTrue`/`whenFalse`) independently of the router's
      error-mapping.

  - description: |
      Add a new HTTP-level role-enforcement test file for AC11, naming and structuring it like
      the three existing sibling files for other resources in this exact codebase:
      `test/hires-role-enforcement.test.js`, `test/guests-role-enforcement.test.js`,
      `test/rooms-role-enforcement.test.js`.
    files:
      - test/workflows-role-enforcement.test.js
    rationale: |
      Matching an established, repeated naming/structure convention (3 prior instances) rather
      than inventing a new one.

  - description: |
      Add a new HTTP-level tenancy test file for AC9/AC10, structured like the existing
      `test/defects-view.test.js` (same `src/projects/store.js` membership model, same
      `memberProject` helper pattern, same "non-member is 404, indistinguishable from
      not-found" assertion style).
    files:
      - test/workflows-tenancy.test.js
    rationale: |
      Reuses the one real multi-tenant precedent already in this codebase instead of inventing a
      new `x-tenant-id` scheme, as an earlier draft of this plan had done before being
      reconciled against the current code.

tests:
  - |
    AC1/AC8 (store-level, `test/workflows.test.js`): saving a new workflow definition persists
    it as version 1 and records the actor/timestamp.
    ```js
    test('AC1/AC8: a new workflow definition is persisted as version 1 and records actor + timestamp', () => {
      const definition = createWorkflow({ tasks: [{ id: 't1', next: [] }] }, { actor: 'HR Coordinator' });
      expect(definition.version).toBe(1);
      expect(definition.savedBy).toBe('HR Coordinator');
      expect(Number.isNaN(new Date(definition.savedAt).getTime())).toBe(false);
    });
    ```
  - |
    AC2 (HTTP, `test/workflows.test.js`): the newly saved version is immediately usable to start
    a real Run.
    ```js
    test('AC2: the newly saved version can immediately be used to start a new Run', async () => {
      const created = await request(app).post('/workflows').set('x-staff-role', 'hr_coordinator').send({ taskGraph: { tasks: [{ id: 't1', next: [] }] } });
      const runRes = await request(app).post(`/workflows/${created.body.id}/runs`).set('x-staff-role', 'manager').send();
      expect(runRes.status).toBe(201);
      expect(runRes.body.definitionVersion).toBe(1);
    });
    ```
  - |
    AC3 (HTTP, `test/workflows.test.js`): saving an update to an existing workflow assigns a new
    version number.
    ```js
    test('AC3: saving an update assigns a new version number', async () => {
      const created = await request(app).post('/workflows').set('x-staff-role', 'hr_coordinator').send({ taskGraph: { tasks: [{ id: 't1', next: [] }] } });
      const updated = await request(app).post(`/workflows/${created.body.id}/versions`).set('x-staff-role', 'hr_coordinator').send({ taskGraph: { tasks: [{ id: 't1', next: [] }] } });
      expect(updated.status).toBe(201);
      expect(updated.body.version).toBe(2);
    });
    ```
  - |
    AC4/AC5 (store-level, `test/workflows.test.js`): the prior version stays byte-identical
    after a later update.
    ```js
    test('AC4/AC5: a version captured before an update is unaffected by that update', () => {
      const created = createWorkflow({ tasks: [{ id: 't1', next: [] }] });
      const pinned = getVersion(created.workflowId, created.version);
      updateWorkflow(created.workflowId, { tasks: [{ id: 't1', next: ['t2'] }, { id: 't2', next: [] }] });
      const refetched = getVersion(created.workflowId, pinned.version);
      expect(refetched.taskGraph).toEqual(pinned.taskGraph);
    });
    ```
  - |
    AC5 (HTTP, `test/workflows.test.js`): a real in-flight Run keeps its original task graph
    after the workflow is updated.
    ```js
    test('AC5: an in-flight Run keeps its original task graph after the workflow is updated', async () => {
      const created = await request(app).post('/workflows').set('x-staff-role', 'hr_coordinator').send({ taskGraph: { tasks: [{ id: 't1', next: [] }] } });
      const runRes = await request(app).post(`/workflows/${created.body.id}/runs`).set('x-staff-role', 'manager').send();
      await request(app).post(`/workflows/${created.body.id}/versions`).set('x-staff-role', 'hr_coordinator').send({ taskGraph: { tasks: [{ id: 't1', next: ['t2'] }, { id: 't2', next: [] }] } });
      const getRunRes = await request(app).get(`/runs/${runRes.body.id}`);
      expect(getRunRes.body.definitionVersion).toBe(1);
      expect(getRunRes.body.taskGraph).toEqual({ tasks: [{ id: 't1', next: [] }] });
    });
    ```
  - |
    AC6 (unit, `test/workflows-validation.test.js`): a `next` entry referencing an unknown task
    id is reported by field.
    ```js
    test('AC6: a next entry referencing an unknown task id is reported by field', () => {
      try {
        validateTaskGraph({ tasks: [{ id: 't1', next: ['missing'] }] });
        throw new Error('expected validateTaskGraph to throw');
      } catch (err) {
        expect(err).toBeInstanceOf(WorkflowValidationError);
        expect(err.fields['tasks[0].next[0]']).toMatch(/missing/);
      }
    });
    ```
  - |
    AC6/AC7 (HTTP, `test/workflows.test.js`): an invalid task graph is rejected with a 400
    identifying the invalid element, and no new version is created.
    ```js
    test('AC6/AC7: an invalid update is rejected with a 400 and creates no new version', async () => {
      const created = await request(app).post('/workflows').set('x-staff-role', 'hr_coordinator').send({ taskGraph: { tasks: [{ id: 't1', next: [] }] } });
      const res = await request(app).post(`/workflows/${created.body.id}/versions`).set('x-staff-role', 'hr_coordinator').send({ taskGraph: { tasks: [{ id: 't1', next: ['missing'] }] } });
      expect(res.status).toBe(400);
      expect(res.body.fields['tasks[0].next[0]']).toMatch(/missing/);
      expect(getLatestVersion(created.body.id).version).toBe(1);
    });
    ```
  - |
    AC9 (HTTP, `test/workflows-tenancy.test.js`): a workflow created within a project is
    retrievable by a member of that project.
    ```js
    test('AC9: a workflow created within a project is retrievable by a member of that project', async () => {
      const project = memberProject('Onboarding Pilot', 'alex1');
      const created = await request(app).post('/workflows').set('x-staff-role', 'hr_coordinator').set('x-user-id', 'alex1').send({ taskGraph: validTaskGraph, projectId: project.id });
      expect(created.status).toBe(201);
      const res = await request(app).get(`/workflows/${created.body.id}`).set('x-user-id', 'alex1');
      expect(res.status).toBe(200);
      expect(res.body.projectId).toBe(project.id);
    });
    ```
  - |
    AC10 (HTTP, `test/workflows-tenancy.test.js`): a workflow created within one project is not
    visible to a user of another project.
    ```js
    test('AC10: a workflow is not visible to a user of another project', async () => {
      const mine = memberProject('Onboarding Pilot', 'alex2');
      memberProject('Other Team', 'jordan2');
      const created = await request(app).post('/workflows').set('x-staff-role', 'hr_coordinator').set('x-user-id', 'alex2').send({ taskGraph: validTaskGraph, projectId: mine.id });
      const res = await request(app).get(`/workflows/${created.body.id}`).set('x-user-id', 'jordan2');
      expect(res.status).toBe(404);
    });
    ```
  - |
    AC11 (HTTP, `test/workflows-role-enforcement.test.js`): saving without a permitted role is
    rejected, and no new version is created.
    ```js
    test('AC11: a non-permitted role cannot save a new version', async () => {
      const created = await request(app).post('/workflows').set('x-staff-role', 'hr_coordinator').send({ taskGraph: validTaskGraph });
      const res = await request(app).post(`/workflows/${created.body.id}/versions`).set('x-staff-role', 'manager').send({ taskGraph: validTaskGraph });
      expect(res.status).toBe(403);
      expect(getLatestVersion(created.body.id).version).toBe(1);
    });
    ```

assumptions_or_open_questions:
  - |
    `src/workflows/{store,routes}.js` and `test/workflows.test.js` already existed before this
    plan (added by the Run-lifecycle story TEST-M1-STORY-138, confirmed via
    `.arc/plans/run_24bf4bb52a7f/plan.md`), and `src/runs/*` already implements a real Run
    entity. This plan extends that code in place. This is the key correction from an earlier
    draft of this plan, which incorrectly assumed a green-field `workflows` resource, no Run
    entity, and invented `x-tenant-id`/`x-actor-role`/`x-actor-id` headers that don't match any
    existing convention in this codebase.
  - |
    The workflow definition schema is the REAL existing `{ tasks: [{ id, name?, next?: string[],
    requirement? }] }` shape already persisted by `createWorkflow`/`updateWorkflow` and consumed
    by `src/runs/store.js`'s `buildSteps`, extended with one new optional field, `branch: {
    whenTrue, whenFalse }`, to model "conditional branches" (not previously represented anywhere
    in the codebase). Flagging for reviewer sign-off since no design file specifies this exact
    shape.
  - |
    "Structurally invalid" is scoped to referential integrity only: unique non-empty task ids,
    and every `next`/`branch.whenTrue`/`branch.whenFalse` entry must reference an existing task
    id. Cycle detection in `next` is explicitly NOT implemented — the ACs describe rejecting and
    identifying "an invalid element," not whole-graph analysis.
  - |
    Tenant scoping reuses the existing `src/projects/store.js` project-membership model (the
    same one `src/defects/*` already uses) rather than introducing a new tenant concept, treating
    "tenant" and "project" as the same thing per the AC's own "tenant/project" phrasing.
    `projectId` is optional on save: a workflow saved with no `projectId` is globally visible
    (mirrors `src/defects/store.js`'s own `!defect.projectId` fallback); project membership
    (`x-user-id` + `listProjectIdsForUser`) is enforced only when a `projectId` is supplied on
    save, and always on the two new `GET` routes. This optionality is what lets the 5 pre-existing
    HTTP call sites in `test/runs.test.js`/`test/runs-completion.test.js` keep working with only
    one header added (`x-staff-role`), instead of also needing new tenant setup the
    Run-lifecycle story never needed.
  - |
    AC9/AC10's "created or retrieved" wording is read literally: project-membership is enforced
    on `POST /` (create) and the two `GET` routes (retrieve), but intentionally NOT re-checked on
    `POST /:id/versions` (update) or `POST /:id/runs` (execute) — neither AC mentions update or
    execution. Flagging in case the reviewer wants tenant checks on those routes too, since
    AC10's "or executable by" phrase could be read more broadly.
  - |
    The audit actor recorded on save (AC8) is the role-derived label (`'HR Coordinator'` /
    `'Platform Admin'`), never a client-supplied value, mirroring the explicitly tested
    precedent in `test/runs-authorization.test.js` ("the audit actor comes from the
    authenticated role, never from the request body"). `savedBy` is therefore always one of
    exactly two strings, not a free-text user identity.
  - |
    `workflowId` is still caller-supplied only via the URL param on update (`POST
    /:id/versions`); there is no "create-or-update" merge via the create route — this matches
    the existing, unchanged route shape and is not altered by this plan.

package_dependencies: []

notes: |
  This plan touches the `workflows` module (new `auth.js`/`validation.js`, extended
  `store.js`/`routes.js`) plus two small, mechanical test fixes in the `runs` test suite to keep
  it green once authorization is added to the save routes it already depends on. No change to
  `src/server.js` is needed — `/workflows` is already mounted.

  ```mermaid
  flowchart TD
    Server["src/server.js"] -->|already mounts /workflows, unchanged| Routes["src/workflows/routes.js"]
    Routes -->|new: role check on save| Auth["src/workflows/auth.js"]
    Routes -->|new: validate before persist| Validation["src/workflows/validation.js"]
    Routes -->|extended: projectId, actor, savedAt| Store["src/workflows/store.js"]
    Routes -->|reused, unchanged| DefectsAuth["src/defects/auth.js"]
    Routes -->|reused, unchanged| ProjectsStore["src/projects/store.js"]
    Routes -->|unchanged: POST /:id/runs| RunsAuth["src/runs/auth.js"]
    RunsStore["src/runs/store.js"] -->|unchanged calls: createWorkflow/getLatestVersion| Store
    TestWorkflows["test/workflows.test.js"] -->|extended: AC1-5/AC8| Store
    TestWorkflows -->|HTTP via supertest| Server
    TestValidation["test/workflows-validation.test.js"] -->|new: AC6/7| Validation
    TestRoleEnforcement["test/workflows-role-enforcement.test.js"] -->|new: AC11| Server
    TestTenancy["test/workflows-tenancy.test.js"] -->|new: AC9/10| Server
    TestRunsFix["test/runs.test.js + test/runs-completion.test.js"] -->|fix: add x-staff-role header| Server

    classDef touched fill:#f96,color:#000
    classDef reused fill:#cde,color:#000
    class Routes,Store,Auth,Validation,TestWorkflows,TestValidation,TestRoleEnforcement,TestTenancy,TestRunsFix touched
    class DefectsAuth,ProjectsStore,RunsAuth,RunsStore,Server reused
  ```

review_focus: |
  In scope: structural validation, `x-staff-role`-based save authorization, audit metadata, and
  project/tenant scoping on the EXISTING `workflows` module built by a prior Run-lifecycle story.
  Out of scope, deliberately: cycle detection in task sequencing, and tenant checks on
  `POST /:id/versions` or `POST /:id/runs` (see assumptions). The riskiest area is the 5
  pre-existing HTTP test call sites in `test/runs.test.js`/`test/runs-completion.test.js` that
  post to the now-role-gated save routes — review that the added `x-staff-role` header is the
  *only* change needed there, and that no other currently-green test calls those two routes
  without a role header. Also verify the audit actor is read from the authenticated role
  (`req.actor`), never from `req.body`, consistent with the existing precedent in
  `test/runs-authorization.test.js`.
