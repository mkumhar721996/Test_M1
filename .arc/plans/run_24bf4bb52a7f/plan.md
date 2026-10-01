summary: |
  Add step-by-step progression through a Run's task graph on top of the existing
  `src/runs/store.js` Run entity (the same entity story TEST-M1-STORY-138 extended
  with `status`/`employeeId`). A manager can mark the current step complete, which
  advances the run to the next task and appends a stage-transition entry to the
  linked hire's record; a step whose requirement is unmet blocks the run (without
  skipping later steps) until the manager resolves the requirement and retries,
  which resumes the run from the blocked step and returns it to `active`;
  completing the final step marks the run `completed` and updates the linked
  hire's onboarding status. This also wires up the two approved screens from the
  design (`Runs` list and `Run Detail`), replacing the dead "Runs" nav placeholder
  on the hire-profile page with a working link into this new area.

scope:
  - description: |
      Rename the Run's "in progress" status string from `in_progress` to `active`
      in `src/runs/store.js`'s `startRun`, so run status literally matches the
      `active` / `blocked` / `completed` vocabulary every AC in this story and the
      approved design use (AC1, AC3, AC4, AC6, AC7, AC9). `completeRun`'s existing
      behavior (setting `status = 'completed'`) and `employeeId` handling are
      otherwise untouched.
    files:
      - src/runs/store.js
      - test/runs-completion.test.js
    rationale: |
      Today `startRun` sets `status: 'in_progress'`, a leftover from
      TEST-M1-STORY-138 which never needed a `blocked` state. This story's ACs
      and the approved design (`status-chip--active`/`--blocked`/`--completed`,
      fixture `"status": "active"`) are unambiguous that the non-blocked,
      non-completed state is named `active`. `test/runs-completion.test.js`'s
      AC4 test currently asserts
      `expect(run.status).toBe('in_progress')` and must be updated to
      `expect(run.status).toBe('active')` to stay green -- this is the one
      pre-existing assertion this rename breaks.

  - description: |
      Extend the task-graph schema accepted by `createWorkflow`/`updateWorkflow`
      (no code change needed there -- they already store whatever shape is
      passed) with optional per-task fields consumed by step progression:
      `name`, `description`, `owner`, and an optional
      `requirement: { label, blockReason, metByDefault }`. Add a `buildSteps`
      helper in `src/runs/store.js` that walks a taskGraph's `next` chain from
      its root task (the task id never referenced by another task's `next`,
      falling back to `tasks[0]`) into an ordered array of step objects:
      `{ id, name, description, owner, status, requirementLabel, requirementMet, blockReason }`
      with `status` seeded `'current'` for index 0 and `'upcoming'` for the rest.
      `name` falls back to the task `id` when absent so older bare
      `{ id, next }` tasks (used by `test/workflows.test.js`,
      `test/runs.test.js`) still build valid steps.
    files:
      - src/runs/store.js
    rationale: |
      None of the AC's step data (name, owner, the blocking requirement) exists
      on today's taskGraph shape (`{ tasks: [{ id, next }] }`), and the approved
      design's stepper/action-panel/blocked-banner all render exactly these
      fields per step. Deriving an ordered `steps` array once at run-start time
      (rather than re-walking the graph on every read) keeps `advanceStep` a
      simple array-index operation.

  - description: |
      Extend `startRun(workflowId, hireId = null)` in `src/runs/store.js` to
      accept an optional `hireId`, and initialize the new run-progression
      fields: `hireId`, `currentIndex: 0`, `steps: buildSteps(taskGraph)`,
      `auditLog: [{ ts, actor: 'System', action: '...' }]` (one seed entry:
      `` `Run started. Step 1 of ${steps.length} is current.` ``), and
      `startedAt: new Date().toISOString()`. When `hireId` is supplied, also
      call the new `appendOnboardingAuditEntry` (see hires/store.js item below)
      so the hire record shows the run starting. Update
      `src/workflows/routes.js`'s `POST /:id/runs` to pass
      `req.body.hireId` through: `startRun(req.params.id, req.body.hireId)`.
    files:
      - src/runs/store.js
      - src/workflows/routes.js
    rationale: |
      A run has to be linkable to a specific hire for AC2/AC10 ("the hire
      record") to mean anything concrete, and for the approved design's
      "Runs" list / "Run Detail" screens (which show the hire's name, role,
      department) to have real backing data. `hireId` is optional so the
      existing TEST-M1-STORY-138 completion flow (`test/runs-completion.test.js`,
      which starts runs with no hire in the picture) keeps working unchanged.

  - description: |
      Add `advanceStep(runId, actor = 'Manager')` to `src/runs/store.js` --
      the single action behind both the design's "Mark step complete" and
      "Retry step" buttons (AC1, AC2, AC3, AC5, AC6, AC7, AC9, AC10):
      ```js
      function advanceStep(runId, actor = 'Manager') {
        const run = runs.get(runId);
        if (!run) return undefined;
        if (run.status === 'completed') return run;

        const idx = run.currentIndex;
        const step = run.steps[idx];
        const wasBlocked = step.status === 'blocked';

        if (step.requirementLabel && !step.requirementMet) {
          step.status = 'blocked';
          run.status = 'blocked';
          run.auditLog.push({
            ts: new Date().toISOString(),
            actor: 'System',
            action: `Attempted step ${idx + 1} of ${run.steps.length} (${step.name}) — blocked: ${step.blockReason}`,
          });
          return run;
        }

        step.status = 'done';
        const isLast = idx === run.steps.length - 1;
        if (isLast) {
          run.status = 'completed';
          const action = `Stage transition: step ${idx + 1} of ${run.steps.length} (${step.name}) completed — all steps finished. Run marked completed.`;
          run.auditLog.push({ ts: new Date().toISOString(), actor, action });
          if (run.hireId) appendOnboardingAuditEntry(run.hireId, actor, action, { completed: true });
        } else {
          run.currentIndex = idx + 1;
          run.steps[run.currentIndex].status = 'current';
          run.status = 'active';
          const nextStep = run.steps[run.currentIndex];
          const action = `Stage transition: step ${idx + 1} of ${run.steps.length} (${step.name}) completed${wasBlocked ? ' after blocking condition resolved' : ''} — advanced to step ${idx + 2} of ${run.steps.length} (${nextStep.name}).`;
          run.auditLog.push({ ts: new Date().toISOString(), actor, action });
          if (run.hireId) appendOnboardingAuditEntry(run.hireId, actor, action);
        }
        return run;
      }
      ```
      Also add `resolveStepRequirement(runId, actor = 'HR')`, the backing
      action for "Mark document received": it only flips
      `run.steps[run.currentIndex].requirementMet = true` and appends a run
      audit entry (`` `${step.requirementLabel} marked received ahead of retry.` ``)
      -- it never changes `run.status` itself (AC7's "returns to active" only
      happens on the next `advanceStep`/retry call, matching the approved
      design exactly). Both functions mutate only local, already-validated
      state and never call out to anything async, so a run is always read as
      either its pre-call or post-call state, never a partial one (AC12).
    files:
      - src/runs/store.js
    rationale: |
      This is the core of the story. Routing both "complete" and "retry"
      through one function mirrors the approved design's own
      `handleAdvanceStep`, which both the "Mark step complete" and
      "Retry step" buttons call. Keeping the blocked-check first and
      returning early means a blocked attempt never touches
      `currentIndex` or any step beyond the current one (AC5).

  - description: |
      Add `listRuns()` to `src/runs/store.js`, returning a clone of every
      stored run (full objects, including `steps`/`auditLog`/`hireId`); the
      route layer below picks the summary fields the Runs list screen needs.
    files:
      - src/runs/store.js
    rationale: |
      The approved design's "Runs" screen needs a backing list endpoint; no
      such read path exists today (`src/runs/store.js` only exposes `getRun`
      for a single run by id).

  - description: |
      Add `onboardingStatus` (`null` initially) and `auditLog` (`[]`) fields
      to every hire created in `src/hires/store.js` (`createHire` and the
      seeded `hire_2031` fixture), and export
      `appendOnboardingAuditEntry(hireId, actor, action, { completed = false } = {})`:
      ```js
      function appendOnboardingAuditEntry(hireId, actor, action, { completed = false } = {}) {
        const hire = hires.get(hireId);
        if (!hire) return undefined;
        hire.auditLog.push({ ts: new Date().toISOString(), actor, action });
        if (completed) hire.onboardingStatus = 'completed';
        else if (!hire.onboardingStatus) hire.onboardingStatus = 'in_progress';
        return hire;
      }
      ```
      Export it alongside the existing hire functions.
    files:
      - src/hires/store.js
    rationale: |
      AC2 ("an auditLog entry... is appended to the hire record") and AC10
      ("the associated hire record is updated to reflect the completed
      onboarding") both name the hire record specifically, not the run. This
      mirrors the `{ ts, actor, action }` auditLog shape already used by
      `src/guests/store.js` (`guest.auditLog.push({ ts, actor, action })`),
      rather than inventing a new shape. `onboardingStatus`/`auditLog` are new
      keys distinct from the hire's existing `run`/`runHistory` fields (which
      belong to the unrelated `src/onboarding/engineClient.js`-driven flow on
      the hire-profile page) -- see the assumption below on why these two
      "run" concepts are kept separate rather than merged.

  - description: |
      Extend `src/runs/routes.js`:
        - `GET /` -> `listRuns()`, filtered to runs with a `hireId`, mapped to
          `{ id, hireId, hireName, role, department, status, currentStepLabel, startedAt }`
          by looking up each hire via `getHire` (imported from
          `../hires/store`). `currentStepLabel` is computed as
          `` `Step ${currentIndex + 1} of ${steps.length} — ${steps[currentIndex].name}` ``.
        - `GET /:id` (existing route): compose the hire into the response:
          `{ ...run, hire: hire ? { id: hire.id, name: hire.name, role: hire.role, department: hire.department, onboardingStatus: hire.onboardingStatus } : null }`.
        - `POST /:id/advance` -> `advanceStep(req.params.id, req.body.actor)`,
          404 if the run doesn't exist.
        - `POST /:id/resolve-requirement` -> `resolveStepRequirement(req.params.id, req.body.actor)`,
          404 if the run doesn't exist.
    files:
      - src/runs/routes.js
    rationale: |
      Gives the frontend screens below real endpoints to call, and gives
      AC4/AC8 something to assert over HTTP (a blocked/in-progress run's full
      state, including the linked hire, is readable from `GET /runs/:id`).

  - description: |
      Seed one example run at `src/runs/store.js` module load, matching the
      approved design's fixture exactly: a 5-task workflow (`Collect signed
      offer letter` / HR — Priya Shah, `Verify I-9 employment eligibility` /
      HR — Priya Shah with `requirement: { label: 'I-9 supporting document',
      blockReason: 'Required document missing — Jordan has not yet uploaded
      I-9 supporting documentation.' }`, `Provision IT accounts & equipment` /
      IT — Devon Ruiz, `Assign onboarding buddy & complete orientation` /
      Manager — Morgan Ellis, `Manager check-in & 30-day goals sign-off` /
      Manager — Morgan Ellis), started against the existing seeded
      `hire_2031` (Jordan Reyes), then immediately call `advanceStep` on it
      once so it lands exactly on the design's starting point: step 1 done,
      step 2 current, nothing blocked yet.
    files:
      - src/runs/store.js
    rationale: |
      Without a seeded run, both new screens load empty on first run and
      can't be manually verified against the approved design the way
      `hire_2031` already lets `hire-profile.html` be checked today. Building
      the seed by calling the real `startRun`/`advanceStep` (rather than
      hand-constructing a matching object) means the seed only exists if the
      real step-progression code path produces it correctly.

  - description: |
      Add `public/runs.html` + `public/js/runs.js` (`initRunsListApp(doc, runs, onViewRun)`)
      implementing the approved design's "Runs" screen: the topbar/nav from
      the design (Profiles · Runs · Settings, with "Runs" active), and a
      `runs-table` populated from the `GET /runs` summaries, one
      `status-chip` (`active`/`blocked`/`completed`) and a "View run" button
      per row that calls `onViewRun(run.id)`. Default bootstrap (guarded by
      `typeof window !== 'undefined'`, matching `hire-profile.js`'s pattern)
      fetches `/runs` and navigates to
      `` `run-detail.html?runId=${runId}` `` on click.
    files:
      - public/runs.html
      - public/js/runs.js
    rationale: |
      This is the design's screen 1 ("Runs"), the new real destination for
      the hire-profile page's previously-dead "Runs" nav link (AC4, AC8 --
      every run's overall status and current step visible at a glance).

  - description: |
      Add `public/run-detail.html` + `public/js/run-detail.js`
      (`initRunDetailApp(doc, initialRun, api)` with
      `api = { advanceStep, resolveRequirement }`) implementing the approved
      design's "Run Detail" screen: the `run-layout` two-column grid (stepper
      + progress on the left; action panel, hire-record card, and collapsible
      audit log on the right), the `status-chip` on the run, the
      `blocked-banner` + `requirement-row` + "Mark document received"/"Retry
      step" buttons when the current step is blocked, the `success-panel`
      when `status === 'completed'`, and `fieldset#run-fieldset` disabled
      (plus a `pending-note`) while a request is in flight (AC11, AC12). On
      an `advanceStep`/`resolveRequirement` rejection, the error toast from
      the design (`` Couldn't save — step progression failed. Run state
      unchanged. Try again. ``) is shown and `run` is left exactly as it was
      (no reassignment happens in the `.catch`). Default bootstrap reads
      `runId` from the URL query string and fetches `GET /runs/:id`; a 404
      renders the design's generic empty state instead of the stepper.
    files:
      - public/run-detail.html
      - public/js/run-detail.js
    rationale: |
      This is the design's screen 2 ("Run Detail"), the interactive screen
      that covers AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC8, AC9, AC10, AC11,
      AC12 on the frontend. The design's `.demo-controls` "simulate a server
      error" checkbox and the separate "Reference States" screen are
      explicitly reviewer-only aids (the design's own comments say so) and
      are deliberately not built as real product UI -- see notes below.

  - description: |
      Add `public/css/runs.css` with the story-specific classes from the
      approved design's third `<style>` block that aren't already covered by
      `design-system/tokens.css` / `design-system/prototype-utils.css`:
      `.status-chip` + `--active`/`--blocked`/`--completed` variants,
      `.runs-table` (+ `th`/`td`/`.muted`/`.row-highlight`), `.run-layout`,
      `.progress-track`/`.progress-fill`/`.progress-label`, `.stepper`/
      `.step-item` (+ `--done`/`--current`/`--blocked`/`--upcoming`)/
      `.step-marker`/`.step-name`/`.step-owner`/`.step-tag`,
      `.blocked-banner`, `.requirement-row` (+ `.state--missing`/`--met`),
      `.action-panel`/`p.hint`, `.spin`/`@keyframes spin`, `.pending-note`,
      `fieldset.run-fieldset[disabled]`, `.success-panel`,
      `.audit-toggle`/`.audit-list`/`.audit-item`, `.hire-record-card`, and
      `.empty-state`. `.demo-controls` and the reviewer-bar/`.reference-grid`/
      `.ac-tag` styles are intentionally omitted (reviewer-only, not product
      UI). Both new HTML pages link `design-system/tokens.css`,
      `design-system/prototype-utils.css`, and this file, the same pattern
      `hire-profile.html` already uses for `hire-profile.css`.
    files:
      - public/css/runs.css
    rationale: |
      Keeps styling pixel-faithful to the approved design while following
      this codebase's existing convention of one page-specific CSS file per
      screen area layered on the shared token/utility files (see
      `public/css/hire-profile.css`'s identical structure).

  - description: |
      Change the "Runs" nav link on `public/hire-profile.html` from
      `<a href="#" onclick="return false;">Runs</a>` to
      `<a href="runs.html">Runs</a>`, and set the "Profiles" link on the two
      new pages to `<a href="hire-profile.html">Profiles</a>`.
    files:
      - public/hire-profile.html
      - public/runs.html
      - public/run-detail.html
    rationale: |
      The approved design's own note on the "Runs" screen says it is "the
      entry point for the 'Runs' nav item (previously a placeholder link on
      the hire-profile screen)" -- wiring it up is explicitly part of the
      approved design, not a new invention.

tests:
  - |
    AC1 (unit, new `test/runs-step-progression.test.js`): completing the
    current step advances the run to the next task.
    ```js
    const wf = createWorkflow({ tasks: [
      { id: 't1', name: 'Step One', next: ['t2'] },
      { id: 't2', name: 'Step Two', next: [] },
    ]});
    const run = startRun(wf.workflowId);
    const advanced = advanceStep(run.id);
    expect(advanced.currentIndex).toBe(1);
    expect(advanced.steps[0].status).toBe('done');
    expect(advanced.steps[1].status).toBe('current');
    ```
  - |
    AC2 (unit): completing a step appends a stage-transition entry to the
    linked hire's own auditLog.
    ```js
    const hire = await createHire({ name: 'A', email: 'a@x.com', phone: '1', startDate: '2026-01-01', department: 'Sales', role: 'AE', hireStage: 'draft' });
    const wf = createWorkflow({ tasks: [{ id: 't1', name: 'Step One', next: ['t2'] }, { id: 't2', name: 'Step Two', next: [] }] });
    const run = startRun(wf.workflowId, hire.id);
    advanceStep(run.id);
    const reloaded = getHire(hire.id);
    expect(reloaded.auditLog.some((e) => e.action.includes('Step One') && e.action.includes('advanced to'))).toBe(true);
    ```
  - |
    AC3 (unit): attempting a step whose requirement is unmet transitions the
    run to `blocked`.
    ```js
    const wf = createWorkflow({ tasks: [
      { id: 't1', name: 'Verify I-9', next: [], requirement: { label: 'I-9 document', blockReason: 'I-9 document missing' } },
    ]});
    const run = startRun(wf.workflowId);
    const blocked = advanceStep(run.id);
    expect(blocked.status).toBe('blocked');
    expect(blocked.steps[0].status).toBe('blocked');
    ```
  - |
    AC4 (HTTP, new `test/runs-step-progression.test.js`): a blocked run is
    visible to anyone viewing it via `GET /runs/:id`.
    ```js
    const res = await request(app).get(`/runs/${blockedRunId}`);
    expect(res.body.status).toBe('blocked');
    expect(res.body.steps[0].status).toBe('blocked');
    ```
  - |
    AC5 (unit): a blocked attempt does not advance `currentIndex` or change
    any later step's status.
    ```js
    const wf = createWorkflow({ tasks: [
      { id: 't1', name: 'Blocked step', next: ['t2'], requirement: { label: 'Doc', blockReason: 'missing' } },
      { id: 't2', name: 'Next step', next: [] },
    ]});
    const run = startRun(wf.workflowId);
    const blocked = advanceStep(run.id);
    expect(blocked.currentIndex).toBe(0);
    expect(blocked.steps[1].status).toBe('upcoming');
    ```
  - |
    AC6 + AC7 (unit): resolving the blocking condition then retrying resumes
    the run from the blocked step and returns its status to `active`.
    ```js
    const wf = createWorkflow({ tasks: [
      { id: 't1', name: 'Blocked step', next: ['t2'], requirement: { label: 'Doc', blockReason: 'missing' } },
      { id: 't2', name: 'Next step', next: [] },
    ]});
    const run = startRun(wf.workflowId);
    advanceStep(run.id);
    resolveStepRequirement(run.id);
    const resumed = advanceStep(run.id);
    expect(resumed.status).toBe('active');
    expect(resumed.currentIndex).toBe(1);
    expect(resumed.steps[0].status).toBe('done');
    ```
  - |
    AC8 (HTTP): viewing an in-progress run exposes current step, completed
    steps, and overall status together.
    ```js
    const res = await request(app).get(`/runs/${runId}`);
    expect(res.body.status).toBe('active');
    expect(res.body.steps.map((s) => s.status)).toEqual(['done', 'current', 'upcoming']);
    ```
  - |
    AC9 (unit): completing the only/final step transitions the run to
    `completed`.
    ```js
    const wf = createWorkflow({ tasks: [{ id: 't1', name: 'Only step', next: [] }] });
    const run = startRun(wf.workflowId);
    const completed = advanceStep(run.id);
    expect(completed.status).toBe('completed');
    ```
  - |
    AC10 (unit): completing the final step updates the linked hire's
    `onboardingStatus` to `completed`.
    ```js
    const hire = await createHire({ name: 'A', email: 'a@x.com', phone: '1', startDate: '2026-01-01', department: 'Sales', role: 'AE', hireStage: 'draft' });
    const wf = createWorkflow({ tasks: [{ id: 't1', name: 'Only step', next: [] }] });
    const run = startRun(wf.workflowId, hire.id);
    advanceStep(run.id);
    expect(getHire(hire.id).onboardingStatus).toBe('completed');
    ```
  - |
    AC11 (jsdom, new `test/run-detail-ui.test.js`): clicking "Mark step
    complete" disables the fieldset and shows a loading label while the
    request is pending.
    ```js
    let resolveAdvance;
    const api = { advanceStep: () => new Promise((r) => { resolveAdvance = r; }), resolveRequirement: jest.fn() };
    const { initRunDetailApp } = require('../public/js/run-detail');
    initRunDetailApp(document, fixtureRun(), api);
    document.getElementById('complete-btn').click();
    expect(document.getElementById('run-fieldset').disabled).toBe(true);
    expect(document.getElementById('complete-btn').textContent).toContain('Completing step');
    resolveAdvance(fixtureRun());
    await Promise.resolve(); await Promise.resolve();
    expect(document.getElementById('run-fieldset').disabled).toBe(false);
    ```
  - |
    AC12 (jsdom): a rejected advance request leaves the rendered run state
    untouched and shows the error toast, rather than a half-updated view.
    ```js
    let rejectAdvance;
    const api = { advanceStep: () => new Promise((_, rej) => { rejectAdvance = rej; }) };
    const fixture = fixtureRun();
    const { initRunDetailApp } = require('../public/js/run-detail');
    initRunDetailApp(document, fixture, api);
    const labelBefore = document.getElementById('progress-label').textContent;
    document.getElementById('complete-btn').click();
    rejectAdvance(new Error('network error'));
    await Promise.resolve(); await Promise.resolve();
    expect(document.getElementById('progress-label').textContent).toBe(labelBefore);
    expect(document.getElementById('error-toast').hidden).toBe(false);
    ```
  - |
    AC12 (unit, store-level complement): advancing a run id that doesn't
    exist mutates nothing and signals "not found" rather than throwing.
    ```js
    expect(advanceStep('does-not-exist')).toBeUndefined();
    ```
  - |
    AC4 + AC8 (jsdom, new `test/runs-list-ui.test.js`): the Runs list
    renders each run's status chip and current-step label, and "View run"
    invokes the callback with that run's id.
    ```js
    const onViewRun = jest.fn();
    const { initRunsListApp } = require('../public/js/runs');
    initRunsListApp(document, [{ id: 'run_1', hireName: 'Jordan Reyes', role: 'SE II', department: 'Engineering', status: 'blocked', currentStepLabel: 'Step 2 of 5 — Verify I-9 employment eligibility', startedAt: '2026-09-29' }], onViewRun);
    expect(document.getElementById('runs-tbody').textContent).toContain('Verify I-9 employment eligibility');
    document.querySelector('[data-view-run]').click();
    expect(onViewRun).toHaveBeenCalledWith('run_1');
    ```

assumptions_or_open_questions:
  - |
    The codebase has two separate "onboarding run" subsystems: (a)
    `src/runs/store.js`'s Run entity (workflow + taskGraph, extended by
    TEST-M1-STORY-138 with `status`/`employeeId`), and (b) the `run` object
    embedded directly on a hire via `src/onboarding/engineClient.js`
    (`hire.run`/`hire.runHistory`, driving the existing hire-profile page's
    progress bar). This plan builds entirely on (a), continuing the direction
    TEST-M1-STORY-138 already took, and does not touch (b) at all. The
    approved design's fixture (`hire.id: "hire_2031"`, task-graph-shaped
    steps, an explicit `auditLog`) reads as this same entity (a), not (b),
    which has no task graph or step concept today. If a future story needs
    these two to actually merge into one "the" onboarding run, that is a
    larger migration out of scope here.
  - |
    "Required staff fields"-style validation does not apply to step
    progression -- `advanceStep`/`resolveStepRequirement` take no payload
    beyond an optional `actor` string, matching the approved design (its
    "Mark step complete"/"Retry step" buttons submit no form data).
  - |
    The approved design names specific people as audit actors ("Priya Shah
    (HR)", "Morgan Ellis (Manager)") and a demo-only "simulate a server
    error" checkbox. Since this codebase has no authentication/identity
    system, this plan uses generic role labels (`'Manager'`, `'HR'`,
    `'System'`) as `actor` instead of fabricated named individuals, and
    deliberately does not build the demo-only failure-simulation control --
    the design's own comments mark both as reviewer aids, not product UI.
  - |
    The design's third "Reference States" screen is a static,
    non-interactive set of snapshots for reviewers (its own heading says so)
    bundled into the single-file prototype alongside the reviewer
    prev/next bar. This plan treats it as a review aid only and does not
    build it as a real additional page.
  - |
    `GET /runs`'s list filters out any run with no `hireId` (i.e. runs
    started the TEST-M1-STORY-138 way, with no hire attached) rather than
    rendering a row with blank hire fields, since the approved "Runs" list
    screen's columns (New hire, Role, Department) assume every row has one.
  - |
    A run's `requirement` is a static property of its task definition
    (`requirement: { label, blockReason }`), not derived from any real
    document-upload/background-check feature (none exists in this
    codebase). `resolveStepRequirement` is the only way to flip
    `requirementMet`, standing in for whatever real system would eventually
    report that condition resolved.
  - |
    The design's empty-state ("this hire doesn't have an onboarding run
    yet") is shown only generically on a `GET /runs/:id` 404 in
    `run-detail.html`; it is not wired to a specific hire's name/"View hire
    profile" link the way the static reference-state mockup shows, since
    nothing in the approved *interactive* screens actually drives that
    specific path. Flag if a hire-specific empty state is actually needed.

package_dependencies: []

notes: |
  No new third-party dependencies: `crypto.randomUUID`, `express`, and the
  existing jsdom/supertest/jest test stack already cover everything here.

  ```mermaid
  flowchart TD
    workflowsRoutes[workflows/routes.js]
    workflowsStore[workflows/store.js]
    runsStore[runs/store.js]
    runsRoutes[runs/routes.js]
    hiresStore[hires/store.js]
    runsJs[public/js/runs.js]
    runDetailJs[public/js/run-detail.js]

    workflowsRoutes -->|"startRun(workflowId, hireId) — hireId now passed through"| runsStore
    runsStore -->|getLatestVersion / createWorkflow seed - existing| workflowsStore
    runsRoutes -->|"new: POST /:id/advance, POST /:id/resolve-requirement, GET /"| runsStore
    runsRoutes -->|"new: getHire(run.hireId) to compose response"| hiresStore
    runsStore -->|"new: appendOnboardingAuditEntry on stage transition / completion"| hiresStore
    runsJs -->|"new: GET /runs"| runsRoutes
    runDetailJs -->|"new: GET /runs/:id, POST /:id/advance, POST /:id/resolve-requirement"| runsRoutes

    classDef touched fill:#f96,color:#000
    class workflowsRoutes,runsStore,runsRoutes,hiresStore,runsJs,runDetailJs touched
  ```

review_focus: |
  In scope: step-by-step progression on the existing `src/runs/store.js` Run
  entity (advance/block/resolve/complete), linking that Run to a hire for
  audit-log and onboarding-status purposes, and the two new screens (`runs.html`,
  `run-detail.html`) from the approved design. Out of scope and deliberately
  untouched: the separate `hire.run`/`engineClient` onboarding system already
  driving `hire-profile.html` -- see the first assumption above, which is the
  single biggest judgment call in this plan and worth confirming before merge.
  The riskiest area is `advanceStep`'s branching (block vs. advance vs.
  complete) in `src/runs/store.js`: it must never touch `currentIndex` or any
  step past the current one when blocking (AC5), and must only flip the hire's
  `onboardingStatus` to `completed` on the *last* step, not on every
  transition. Also note the deliberate rename of the Run's in-progress status
  from `in_progress` to `active`, which required updating one pre-existing
  assertion in `test/runs-completion.test.js` -- confirm this rename is
  actually wanted rather than introducing a parallel status vocabulary.
