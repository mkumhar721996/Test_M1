summary: |
  This story adds an append-only, tenant-scoped audit log for Run and task lifecycle events, and
  locks in the fact that terminal Run records and their audit trails are retained indefinitely with
  no purge path. Concretely: a new `src/runs/auditLog.js` module owns a write-only in-memory store
  of frozen entries (no update/delete functions exist at all, satisfying AC3 structurally), exposing
  `recordRunEvent`, `recordTaskEvent`, and a tenant-required `listAuditEntries` query. `src/runs/store.js`
  is updated to carry a `tenantId`/`projectId` on every Run and to call into the new module at every
  existing status/step transition (start, advance, resolve-requirement), plus four new minimal
  store-level primitives (`pauseRun`, `resumeRun`, `cancelRun`, `failRun`) so all seven Run lifecycle
  states named in AC1 are real, testable code paths rather than just a wish-list. A new
  `GET /runs/:id/audit-log` route demonstrates the AC5 tenant boundary over HTTP. The existing
  human-readable `run.auditLog` feed (read by `public/js/run-detail.js`) is left untouched and
  unduplicated — this is a parallel, structured, immutable trail, not a replacement.
scope:
  - description: |
      Create the audit log module. It owns the only mutable state in this change (a private,
      module-scoped array) and exposes exactly three functions plus two type-name constants —
      there is no `updateEntry`/`deleteEntry`/`clear` export anywhere, which is itself the AC3
      guarantee ("cannot be modified or deleted by any user or automated process").

      ```js
      const RUN_EVENT_TYPES = ['started', 'paused', 'resumed', 'cancelled', 'blocked', 'completed', 'failed'];
      const TASK_EVENT_TYPES = ['dispatched', 'retried', 'blocked', 'timed_out', 'completed', 'skipped'];
      const DEFAULT_TENANT_ID = 'default-tenant';

      function recordRunEvent({ runId, tenantId, projectId = null, eventType, actor, priorState, newState, ts }) { /* validates eventType against RUN_EVENT_TYPES, throws if tenantId missing, Object.freeze()s the entry, pushes it, returns it */ }
      function recordTaskEvent({ runId, tenantId, projectId = null, taskId, eventType, ts }) { /* same shape, validates against TASK_EVENT_TYPES */ }
      function listAuditEntries({ tenantId, projectId = null, runId } = {}) { /* throws if tenantId missing; filters by tenantId, then projectId/runId if given */ }
      ```
    files:
      - src/runs/auditLog.js
    rationale: |
      Isolating the audit store in its own module (rather than adding fields to runs/store.js's
      `runs` Map) makes the "no modification/deletion API exists" guarantee easy to verify by
      inspection and by a direct `Object.keys`/`toBeUndefined` test, and makes tenant scoping a
      single enforced choke point (`listAuditEntries` throws without a `tenantId`) instead of
      something every caller has to remember to filter by itself.
  - description: |
      Wire the new module into every real transition that exists in the Run store today, and add
      four minimal new primitives for the transitions that have no trigger point yet.

      - `startRun(workflowId, hireId = null, { tenantId = DEFAULT_TENANT_ID, projectId = null } = {})`
        stores `run.tenantId`/`run.projectId` and calls
        `recordRunEvent({ eventType: 'started', actor: 'System', priorState: null, newState: 'active', ... })`,
        plus `recordTaskEvent({ taskId: steps[0].id, eventType: 'dispatched' })` for the first step.
      - `advanceStep`: the unmet-requirement branch now also calls
        `recordTaskEvent({ taskId: step.id, eventType: 'blocked' })` every attempt, and
        `recordRunEvent({ eventType: 'blocked', priorState, newState: 'blocked' })` only when
        `run.status` actually changes into `'blocked'` (not on repeated blocked retries). The
        success branch calls `recordTaskEvent({ taskId: step.id, eventType: 'retried' })` when the
        step `wasBlocked`, then always `recordTaskEvent({ taskId: step.id, eventType: 'completed' })`.
        Advancing to a next step additionally emits `recordTaskEvent({ taskId: nextStep.id, eventType: 'dispatched' })`,
        and — only when the prior run status was `'blocked'` — `recordRunEvent({ eventType: 'resumed', priorState: 'blocked', newState: 'active' })`.
        Reaching the final step emits `recordRunEvent({ eventType: 'completed', priorState, newState: 'completed' })`.
      - `completeRun` (the `/complete` endpoint path, independent of `advanceStep`) emits
        `recordRunEvent({ eventType: 'completed', actor: 'System', priorState, newState: 'completed' })`
        only when `run.status !== 'completed'` already, to avoid duplicate entries on repeat calls.
      - New: `pauseRun(runId, actor = 'System')`, `resumeRun(runId, actor = 'System')`,
        `cancelRun(runId, actor = 'System')`, `failRun(runId, actor = 'System')` — each a guarded
        status transition (no-op if the run is already in a terminal state, or not paused for
        `resumeRun`) that records the matching `recordRunEvent` before mutating `run.status`.
      - `module.exports` additionally includes `pauseRun, resumeRun, cancelRun, failRun, DEFAULT_TENANT_ID`
        (re-exported from `./auditLog`).
    files:
      - src/runs/store.js
    rationale: |
      AC1 names seven Run states; today's store only ever produces `active`/`blocked`/`completed`
      through real code paths, and `paused`/`resumed`/`cancelled`/`failed` have no trigger at all
      (the `cancelled` status that appears in `src/hires/store.js` belongs to a different, unrelated
      `hire.run` object produced by the `src/onboarding/engineClient.js` stub, not a real `Run` from
      this store — see assumptions). Adding four small guarded primitives is the minimal way to make
      every AC1 transition a real, testable occurrence rather than asserting on a function that can
      never fire in practice. The existing `run.auditLog.push(...)` human-log calls are left exactly
      as they are; the new `recordRunEvent`/`recordTaskEvent` calls are added alongside them, not in
      place of them, so `public/js/run-detail.js`'s existing rendering of `run.auditLog` is unaffected.
  - description: |
      Expose the audit trail for a single run over HTTP, scoped to tenant, and thread tenantId/projectId
      from run-creation requests into `startRun`.

      ```js
      // src/runs/routes.js
      router.get('/:id/audit-log', (req, res) => {
        const run = getRun(req.params.id);
        if (!run) return res.status(404).json({ error: 'run not found' });
        const tenantId = req.headers['x-tenant-id'] || DEFAULT_TENANT_ID;
        if (tenantId !== run.tenantId) return res.status(404).json({ error: 'run not found' });
        res.status(200).json(listAuditEntries({ tenantId: run.tenantId, runId: run.id }));
      });
      ```

      ```js
      // src/workflows/routes.js, inside POST /:id/runs
      const run = startRun(req.params.id, hireId, { tenantId: req.body.tenantId, projectId: req.body.projectId });
      ```
    files:
      - src/runs/routes.js
      - src/workflows/routes.js
    rationale: |
      A tenant mismatch returns 404 (not 403) so the endpoint doesn't confirm a run's existence to a
      caller outside its tenant, mirroring how `/runs/:id` already behaves for an unknown id. The
      `x-tenant-id` header is a minimal stand-in since no tenant/auth concept exists anywhere in the
      codebase today (see assumptions) — defaulting to `DEFAULT_TENANT_ID` keeps every existing caller
      and test that never sends the header working unchanged.
  - description: |
      Failing tests first, covering all 5 ACs against both the module directly and the HTTP surface.
    files:
      - test/runs-audit-log.test.js
    rationale: TDD — written and run red before any production code above exists.
tests:
  - |
    AC1 (started): starting a run writes a started run entry with actor/prior/new state.
    ```js
    const run = startRun(wf.workflowId);
    const started = listAuditEntries({ tenantId: run.tenantId, runId: run.id }).find((e) => e.eventType === 'started');
    expect(started).toMatchObject({ kind: 'run', actor: 'System', priorState: null, newState: 'active' });
    expect(typeof started.ts).toBe('string');
    ```
  - |
    AC1 (completed): completing the final step writes a completed run entry with the acting role.
    ```js
    advanceStep(run.id, 'Manager');
    expect(listAuditEntries({ tenantId: run.tenantId, runId: run.id })).toContainEqual(
      expect.objectContaining({ kind: 'run', eventType: 'completed', actor: 'Manager', priorState: 'active', newState: 'completed' })
    );
    ```
  - |
    AC1 (blocked -> resumed): blocking then resolving a requirement writes blocked then resumed run entries, in order.
    ```js
    advanceStep(run.id);              // blocks
    resolveStepRequirement(run.id);
    advanceStep(run.id, 'HR');        // resumes
    const runEventTypes = listAuditEntries({ tenantId: run.tenantId, runId: run.id }).filter((e) => e.kind === 'run').map((e) => e.eventType);
    expect(runEventTypes).toEqual(['started', 'blocked', 'resumed']);
    ```
  - |
    AC1 (paused/resumed/cancelled/failed primitives): each new store function writes its matching entry.
    ```js
    pauseRun(run.id, 'Manager');
    resumeRun(run.id, 'Manager');
    expect(listAuditEntries({ tenantId: run.tenantId, runId: run.id }).map((e) => e.eventType)).toEqual(['started', 'paused', 'resumed']);
    ```
  - |
    AC2 (dispatched/completed): step progression writes task entries carrying the task id.
    ```js
    advanceStep(run.id);
    const taskEvents = listAuditEntries({ tenantId: run.tenantId, runId: run.id }).filter((e) => e.kind === 'task');
    expect(taskEvents).toContainEqual(expect.objectContaining({ taskId: 't1', eventType: 'dispatched' }));
    expect(taskEvents).toContainEqual(expect.objectContaining({ taskId: 't1', eventType: 'completed' }));
    expect(taskEvents).toContainEqual(expect.objectContaining({ taskId: 't2', eventType: 'dispatched' }));
    ```
  - |
    AC2 (blocked/retried): a blocked-then-resolved step writes blocked then retried task entries for the same task id.
    ```js
    advanceStep(run.id);
    resolveStepRequirement(run.id);
    advanceStep(run.id);
    const events = listAuditEntries({ tenantId: run.tenantId, runId: run.id }).filter((e) => e.kind === 'task' && e.taskId === 't1').map((e) => e.eventType);
    expect(events).toEqual(['dispatched', 'blocked', 'retried', 'completed']);
    ```
  - |
    AC2 (full type coverage): recordTaskEvent accepts and records every task event type, including timed_out and skipped which have no workflow trigger yet.
    ```js
    test.each(TASK_EVENT_TYPES)('records a %s task event', (eventType) => {
      const entry = recordTaskEvent({ runId: 'run-x', tenantId: 'tenant-x', taskId: 'task-1', eventType });
      expect(entry).toMatchObject({ kind: 'task', taskId: 'task-1', eventType });
    });
    ```
  - |
    AC3 (immutable entry): a returned entry is frozen and mutating it does not change what's stored.
    ```js
    const entry = recordRunEvent({ runId: 'r1', tenantId: 'tenant-x', eventType: 'started', actor: 'System', priorState: null, newState: 'active' });
    expect(Object.isFrozen(entry)).toBe(true);
    entry.actor = 'tampered';
    const reread = listAuditEntries({ tenantId: 'tenant-x', runId: 'r1' }).find((e) => e.id === entry.id);
    expect(reread.actor).toBe('System');
    ```
  - |
    AC3 (no mutation API surface): the module exposes no update/delete/clear function.
    ```js
    const auditLog = require('../src/runs/auditLog');
    expect(auditLog.updateAuditEntry).toBeUndefined();
    expect(auditLog.deleteAuditEntry).toBeUndefined();
    expect(auditLog.clearAuditEntries).toBeUndefined();
    ```
  - |
    AC4 (indefinite retention, no purge): a terminal run and its full trail remain retrievable, and no purge function exists.
    ```js
    advanceStep(run.id); // run now completed
    expect(getRun(run.id).status).toBe('completed');
    const trail = listAuditEntries({ tenantId: run.tenantId, runId: run.id });
    expect(trail.length).toBeGreaterThanOrEqual(3);
    expect(trail.some((e) => e.eventType === 'completed')).toBe(true);
    expect(require('../src/runs/auditLog').purgeAuditEntries).toBeUndefined();
    ```
  - |
    AC5 (tenant scoping, module level): listAuditEntries only returns entries for the requested tenant, and requires one.
    ```js
    recordRunEvent({ runId: 'run-a', tenantId: 'tenant-1', eventType: 'started', actor: 'System', priorState: null, newState: 'active' });
    recordRunEvent({ runId: 'run-b', tenantId: 'tenant-2', eventType: 'started', actor: 'System', priorState: null, newState: 'active' });
    const tenant1 = listAuditEntries({ tenantId: 'tenant-1' });
    expect(tenant1.every((e) => e.tenantId === 'tenant-1')).toBe(true);
    expect(() => listAuditEntries({})).toThrow();
    ```
  - |
    AC5 (tenant scoping, HTTP): the audit-log endpoint hides a run from a mismatched tenant.
    ```js
    const run = startRun(wf.workflowId, null, { tenantId: 'tenant-a' });
    const same = await request(app).get(`/runs/${run.id}/audit-log`).set('x-tenant-id', 'tenant-a');
    expect(same.status).toBe(200);
    expect(same.body.length).toBeGreaterThan(0);
    const other = await request(app).get(`/runs/${run.id}/audit-log`).set('x-tenant-id', 'tenant-b');
    expect(other.status).toBe(404);
    ```
assumptions_or_open_questions:
  - |
    No tenant/auth concept exists anywhere in this codebase today. This plan introduces a minimal
    `tenantId`/`projectId` pair carried on Run records and audit entries, read from an optional
    `x-tenant-id` header (defaulting to a `DEFAULT_TENANT_ID` constant so every existing caller/test
    that never sends it keeps working). If a broader tenancy/auth model is planned elsewhere, this
    should be reconciled with it rather than treated as the final shape.
  - |
    `src/hires/store.js`'s `hire.run` (produced by the `src/onboarding/engineClient.js` stub) is a
    separate, unrelated object from the real `Run` records in `src/runs/store.js` — they even both
    happen to use the status value `'cancelled'` independently. This plan does not unify them, so a
    hire-triggered cancellation via `engineClient.cancelRun` does not produce an entry in the new
    audit log. Flagging this pre-existing split as a likely gap for a future story, not fixing it here.
  - |
    AC2 names `timed_out` and `skipped` as task event types, but no timeout or skip mechanic exists
    anywhere in the current task/step model. Rather than inventing new workflow mechanics (speculative
    work beyond this story), this plan proves those two event types are correctly accepted and
    recorded via a direct unit test of `recordTaskEvent`, so a future story that adds real timeout/skip
    behavior only needs to call the existing function.
  - |
    AC1's `paused`/`resumed`(-via-pause)/`cancelled`/`failed` states have no existing UI or route
    trigger beyond the `blocked`-recovery `resumed` case this plan derives from real step-progression
    code. The new `pauseRun`/`resumeRun`/`cancelRun`/`failRun` functions are store-level only (no new
    HTTP routes), since nothing in the product today calls for exposing them yet. Flag if routes
    should be added in this same story instead of left as store primitives.
  - |
    The whole app is single-process, in-memory storage with no TTL/eviction anywhere today, so
    "retained indefinitely" (AC4) is the existing default behavior; this plan locks it in with a test
    that no purge function exists and that a terminal run's trail stays queryable, rather than adding
    a new retention mechanism (there is nothing to turn off).
  - |
    The new `GET /runs/:id/audit-log` endpoint has no role check (unlike `/advance` and
    `/resolve-requirement`, which require `enforceOnboardingRole`), since AC5 is about tenant scoping
    specifically, not role-based authorization. Flag if this read endpoint should also be gated by
    `enforceOnboardingRole`.
package_dependencies: []
notes: |
  Research: `src/runs/store.js` currently only ever reaches `run.status` values `active`/`blocked`/`completed`
  through real code (`startRun`, `advanceStep`, `completeRun`); `public/js/run-detail.js:143-145` reads
  `run.auditLog` directly for its UI feed, which is why that field and its existing `.push(...)` calls
  are left untouched rather than replaced. `src/workflows/routes.js` is the only caller of `startRun`
  that accepts a request body, which is why tenantId/projectId threading lands there.

  ```mermaid
  flowchart TD
    WFRoutes[src/workflows/routes.js] -->|"startRun(.., {tenantId, projectId})"| RunsStore[src/runs/store.js]
    RunsRoutes[src/runs/routes.js] -->|advanceStep / resolveStepRequirement| RunsStore
    RunsRoutes -->|"GET /:id/audit-log -> listAuditEntries"| AuditLog[src/runs/auditLog.js]
    RunsStore -->|recordRunEvent / recordTaskEvent| AuditLog
    HiresStore[src/hires/store.js] -.separate hire.run model, unchanged.-> EngineClient[src/onboarding/engineClient.js]

    classDef touched fill:#f96,color:#000
    class WFRoutes,RunsRoutes,RunsStore,AuditLog touched
  ```
review_focus: |
  In scope: the new `src/runs/auditLog.js` module, wiring it into every existing Run/task transition
  in `src/runs/store.js` plus four new guarded primitives (`pauseRun`/`resumeRun`/`cancelRun`/`failRun`),
  and a tenant-scoped `GET /runs/:id/audit-log` route. Out of scope, deliberately: unifying this with
  the separate `hire.run`/`engineClient` model, and building real timeout/skip workflow mechanics —
  those two task event types are only proven at the `recordTaskEvent` unit level. Riskiest area: the
  mapping from existing step-progression code onto the seven named Run states and six named task
  events is not 1:1 — review in particular that a `blocked -> active` recovery is deliberately recorded
  as `resumed` (not a second `started`/`active`), that run-level events are deduped on actual status
  change while task-level `blocked` fires on every blocked attempt, and that the new HTTP audit-log
  endpoint intentionally has no role check (only tenant scoping) since AC5, not RBAC, is its concern.
