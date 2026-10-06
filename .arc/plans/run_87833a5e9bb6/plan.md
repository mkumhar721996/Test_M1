summary: |
  Onboarding Workflow Run Progression already has most of its engine built: `src/runs/store.js` /
  `src/runs/routes.js` and `src/workflows/store.js` / `src/workflows/routes.js` implement
  starting a run (`POST /workflows/:id/runs`), advancing a step, blocking on an unmet
  requirement, and resolving a requirement, all covered by `test/runs.test.js`,
  `test/runs-step-progression.test.js` and `test/runs-authorization.test.js` from the prior
  TEST-M1-STORY-137. What this story adds is the three gaps the acceptance criteria call out
  that are NOT yet covered: (1) AC6 is only enforced on the mutation routes today — `GET /runs`
  and `GET /runs/:id` are wide open with no role check; (2) there is no UI path to actually
  start a run by manually picking a hire + an existing workflow (AC1) — only a raw POST route
  exists, workflows cannot even be listed (no `GET /workflows`), and workflows have no
  human-readable name; (3) the approved prototype
  (`.arc/designs/TEST-M1-STORY-168-design.html`) redraws the Run Detail action panel around a
  single persistent "Advance step" button with an inline `field-error` shown on a blocked
  attempt (AC4/AC5), replacing the old separate blocked-banner + disabled "Retry step" button,
  and drops the collapsible audit log and the hire-record card in favor of an always-visible
  "Run activity" list and a "Run summary" card (workflow name + started date). This plan adds a
  `GET /workflows` listing (reusing the existing `buildSteps` ordering logic so the preview never
  drifts from how a run is actually built), a new Start Run screen, role-gates the two open GET
  routes, and brings Run Detail and the Runs list screens in line with the prototype, including
  the access-denied panel and "Signed in as" role-switcher convention already established on
  `hire-profile.html` and `rooms.html`.
scope:
  - description: |
      Add role enforcement to the two currently-open read routes so AC6 covers viewing, not just
      acting. `router.get('/')` and `router.get('/:id')` in `src/runs/routes.js` get the same
      `enforceOnboardingRole` middleware already used on `advance`/`resolve-requirement`:
        router.get('/', enforceOnboardingRole, (req, res) => { ... });
        router.get('/:id', enforceOnboardingRole, (req, res) => { ... });
      No change to the middleware itself (`src/runs/auth.js`) — it already returns 401 with no
      `x-staff-role` header and 403 for any role not in `{hr, manager}`.
    files:
      - src/runs/routes.js
    rationale: |
      AC6 says "WHEN they attempt to view or act on a run THEN access is denied" — today only
      the "act" half is enforced. This is the smallest change that closes the AC6 gap for the
      existing API surface.
  - description: |
      Give workflows an optional human-readable name, and add a `GET /workflows` listing that
      reuses `buildSteps` (already exported from `src/runs/store.js`) so the preview a reviewer
      sees on Start Run is built from the exact same step-ordering code a real run uses — no
      second implementation to drift out of sync.
      `src/workflows/store.js`:
        function createWorkflow(taskGraph, name) {
          const id = crypto.randomUUID();
          workflows.set(id, { id, name: name || null, versions: [{ version: 1, taskGraph: clone(taskGraph) }] });
          return getVersion(id, 1);
        }
        function getVersion(workflowId, version) {
          const workflow = workflows.get(workflowId);
          if (!workflow) return undefined;
          const found = workflow.versions.find((v) => v.version === version);
          return found ? { workflowId, name: workflow.name, version: found.version, taskGraph: clone(found.taskGraph) } : undefined;
        }
        function listWorkflows() {
          return Array.from(workflows.keys()).map((id) => getLatestVersion(id));
        }
        function getWorkflowName(workflowId) {
          const workflow = workflows.get(workflowId);
          return workflow ? (workflow.name || workflow.id) : undefined;
        }
      `src/workflows/routes.js` passes the name through on create, and adds the list route (role
      gated, since it only exists to feed the Start Run picker):
        router.post('/', (req, res) => {
          const definition = createWorkflow(req.body.taskGraph, req.body.name);
          res.status(201).json({ id: definition.workflowId, name: definition.name, version: definition.version, taskGraph: definition.taskGraph });
        });
        router.get('/', enforceOnboardingRole, (req, res) => {
          const summaries = listWorkflows().map((wf) => ({
            id: wf.workflowId,
            name: wf.name || wf.workflowId,
            version: wf.version,
            steps: buildSteps(wf.taskGraph).map((s) => ({ name: s.name, owner: s.owner, requirementLabel: s.requirementLabel })),
          }));
          res.status(200).json(summaries);
        });
      `buildSteps` is imported from `../runs/store` (that file already imports from
      `../workflows/store`, so importing the other way only at the routes layer avoids a
      store-to-store circular require).
    files:
      - src/workflows/store.js
      - src/workflows/routes.js
    rationale: |
      AC1 requires "HR or Manager selects an existing workflow" — there is currently no way to
      enumerate workflows or see their steps before committing, which the approved design's Start
      Run screen requires (workflow dropdown + live preview with per-step owner and blocking
      requirement).
  - description: |
      Expose a friendly workflow name on run responses and seed the one real workflow this app
      ships with (the Jordan Reyes example in `seedExampleRun`) with a name, so the Run Detail
      "Run summary" card and the Start Run dropdown never show a bare UUID in the only workflow
      that exists out of the box.
      `src/runs/routes.js`:
        const { getWorkflowName } = require('../workflows/store');
        function withHire(run) {
          const hire = run.hireId ? getHire(run.hireId) : null;
          const summary = hire ? { ... } : null;
          return { ...run, hire: summary, workflowName: getWorkflowName(run.workflowId) || run.workflowId };
        }
      `src/runs/store.js` seed call becomes:
        const workflow = createWorkflow({ tasks: [...] }, 'Engineering — Software Engineer Onboarding');
    files:
      - src/runs/routes.js
      - src/runs/store.js
    rationale: |
      The approved design's Run Detail screen replaces the old "Hire record" card with a "Run
      summary" card showing `Workflow: <name>` and `Started: <date>` — the API has to supply that
      name since the run object today only carries `workflowId`.
  - description: |
      Rebuild `public/runs.html` / `public/js/runs.js` / `public/css/runs.css` to match the
      design's "Runs" screen: a "Start onboarding run" button in the page header next to the
      heading (navigates to the new Start Run screen), and the same "Signed in as" role-switcher
      + access-denied convention already used on `hire-profile.html` / `rooms.html` (not the
      prototype's dashed "demo control" styling, which the prototype itself labels "not part of
      the real product UI" — see assumptions). `initRunsListApp` keeps its existing
      `(doc, runs, onViewRun)` signature but now also reads `doc.getElementById('role-select')`
      directly (matching how `rooms.js` does it) to decide whether to render the table or the
      access-denied panel, and re-renders on the select's `change` event without refetching. The
      bootstrap code adds the `x-staff-role` header to the `/runs` fetch.
    files:
      - public/runs.html
      - public/js/runs.js
      - public/css/runs.css
    rationale: |
      AC6 needs a client-visible denial, not just a 401/403 the page ignores; the design's Runs
      screen notes literally say "the Viewing as control simulates the access rule in AC6: switch
      it to New hire to see the whole runs area deny access instead of listing runs." The "Start
      onboarding run" button is the design's entry point into AC1.
  - description: |
      New Start Run screen: `public/start-run.html` + `public/js/start-run.js`, styled with the
      design's `.workflow-preview-list` / `.form-actions` rules (copied into `runs.css`, which
      already hosts the Runs/Run-Detail styles for this feature area). Fetches `/hires`,
      `/runs`, and `/workflows` (each with the `x-staff-role` header) on load; the hire `<select>`
      lists only active-profile hires with no run in the `active`/`blocked` state; the workflow
      `<select>` lists every workflow's `{id, name}`; choosing a workflow renders its step preview
      (name, owner, and a "Blocking requirement: <label>" tag per step, straight from the
      `GET /workflows` steps array). "Start run" stays `disabled` until both are chosen; on click
      it calls `POST /workflows/:workflowId/runs` with `{ hireId }` and the staff-role header,
      then navigates to `run-detail.html?runId=<id>` on success. "Cancel" returns to
      `runs.html`. No eligible hires renders the design's empty state copy: "Every current hire
      already has an onboarding run." Same role-switcher + access-denied panel as `runs.html`.
    files:
      - public/start-run.html
      - public/js/start-run.js
      - public/css/runs.css
    rationale: |
      This is the only way AC1 ("HR or Manager selects an existing workflow for a hire") is
      actually reachable by a user today — the backend route existed but nothing in the UI called
      it with a manually-chosen workflow and hire.
  - description: |
      Redesign `public/run-detail.html` / `public/js/run-detail.js` to match the prototype's Run
      Detail screen exactly:
        - Replace the `.blocked-banner` + disabled "Retry step" button with a single persistent
          `#advance-btn` labeled "Advance step" and an `#field-error` div (hidden by default,
          `role="alert"`) shown directly under it only while the step is blocked, reading:
          `Can't advance — "<requirementLabel>" has not been met yet. Mark it met to continue.`
          Clicking "Advance step" always calls `POST /runs/:id/advance`; when the response comes
          back blocked, the panel re-renders with the error visible instead of silently doing
          nothing (AC4). The requirement row's button is relabeled "Mark requirement met" (from
          "Mark document received", since the label is workflow-defined, not I-9-specific) and
          flips to "Met ✓" once resolved, which re-enables a successful advance (AC5).
        - Replace the collapsible "Audit log" (`audit-toggle-btn`) with an always-visible
          "Run activity" list (`#activity-list`), rendered straight from `run.auditLog` — the
          design's activity panel has no expand/collapse affordance.
        - Replace the "Hire record" card with a "Run summary" card showing
          `Workflow: run.workflowName` and `Started: run.startedAt` (hire name/role/department
          stay in the page header, unchanged).
        - Add the same role-switcher + access-denied panel as `runs.html`/`start-run.html`; the
          bootstrap fetch for `/runs/:id` now also sends `x-staff-role`.
      Status-value note: the prototype's own inline script fixture uses `complete`/`active` for
      step status, but the real API (confirmed in `src/runs/store.js`) uses `done`/`current` — the
      implementation keeps the real API's vocabulary (`.step-item--done`, `.step-item--current`,
      already used in the current code) and only takes the *visual* structure (marker icons,
      stepper layout, card breakdown, field-error) from the prototype.
    files:
      - public/run-detail.html
      - public/js/run-detail.js
      - public/css/runs.css
    rationale: |
      This is the screen the approved prototype documents most thoroughly (AC2–AC5 walkthrough
      in its own comments), and its component breakdown for the blocked/resolved states is
      materially different from what shipped under story 137 — building the approved design means
      adopting that breakdown, not layering the new field-error onto the old blocked-banner.
  - description: |
      Update the existing tests that call `GET /runs` or `GET /runs/:id` without a role header —
      they will start failing with 401 once scope item 1 lands — by adding
      `.set('x-staff-role', 'manager')` (or `'hr'` where already used nearby) to each call.
    files:
      - test/runs.test.js
      - test/workflows.test.js
    rationale: |
      These assertions are about workflow-version pinning and run-summary shape, not about
      authorization, so they keep their original intent — they just need to present as an
      authorized caller now that the route requires one.
assumptions_or_open_questions:
  - |
    The prototype's "Viewing as" selects are explicitly marked `.demo-controls` / "Demo control
    (not part of the real product)" in its own CSS and screen comments. I'm treating those as
    prototype-only scaffolding for driving the static file, and instead reusing this product's
    already-established real "Signed in as" role-switcher (`hire-profile.html`, `rooms.html`,
    `topbar-actions`/`role-switcher` markup and CSS) on all three real screens, since that's the
    actual in-product convention for simulating the signed-in role everywhere else in this app.
    If the reviewer wants the literal dashed demo-control treatment instead, that's a small CSS
    swap.
  - |
    For the third (disallowed) role option, I'm using this app's existing convention of
    value="employee" (as in `hire-profile.html`) but labeling it "New hire (no HR/Manager
    access)" to match AC6's own example ("such as a new hire") — reconciling the repo's existing
    option-value convention with the story's wording rather than introducing a new `new_hire`
    value with no precedent elsewhere in the app.
  - |
    "Hires eligible to start a run" (the Start Run hire picker) is defined as: active-profile
    hires (`profileStatus === 'active'`) with no run in the runs store whose `status` is
    `active` or `blocked` for their `hireId`. A hire whose only prior run already `completed` is
    treated as eligible again. This rule isn't spelled out in the acceptance criteria — it's
    inferred from the prototype's empty-state copy ("Every current hire already has an
    onboarding run") and the no-delete-run-twice concern isn't otherwise addressed anywhere in
    this story.
  - |
    `GET /workflows` is gated behind `enforceOnboardingRole` even though workflows themselves
    aren't "a run" — it exists solely to populate the Start Run picker, which AC6 says must be
    denied to a non-HR/Manager user, so the whole Start Run flow (including the workflow list
    backing it) is gated consistently.
  - |
    The Run Detail redesign removes the onboarding-status display that used to live on the old
    "Hire record" card. No acceptance criterion in this story calls for showing onboarding status
    on this screen, and the approved prototype's Run Detail card breakdown doesn't include it —
    flagging this explicitly since it's an intentional removal, not an oversight.
package_dependencies: []
notes: |
  ```mermaid
  flowchart TD
    runsJS["public/js/runs.js"] -->|"GET /runs + x-staff-role"| runsRoutes["src/runs/routes.js"]
    startRunJS["public/js/start-run.js (new)"] -->|"GET /hires"| hiresRoutes["src/hires/routes.js"]
    startRunJS -->|"GET /workflows + x-staff-role"| workflowsRoutes["src/workflows/routes.js"]
    startRunJS -->|"POST /workflows/:id/runs"| workflowsRoutes
    runDetailJS["public/js/run-detail.js"] -->|"GET /runs/:id, POST advance / resolve-requirement"| runsRoutes
    runsRoutes --> runsStore["src/runs/store.js"]
    runsRoutes --> auth["src/runs/auth.js (enforceOnboardingRole, reused unchanged)"]
    workflowsRoutes --> workflowsStore["src/workflows/store.js"]
    workflowsRoutes -->|"buildSteps for preview"| runsStore
    workflowsRoutes --> auth
    runsStore --> workflowsStore

    classDef touched fill:#f96,color:#000
    class runsJS,startRunJS,runDetailJS,runsRoutes,workflowsRoutes,workflowsStore,runsStore touched
  ```
  `src/hires/routes.js` and `src/runs/auth.js` are shown for call-direction context only — neither
  is modified; `GET /hires` is reused as-is to build the Start Run hire picker, and the
  authorization middleware is reused unchanged on the two newly-gated GET routes.
tests:
  - |
    AC6 (routes.js): GET /runs and GET /runs/:id now require a role.
      test.each(['/runs', `/runs/${run.id}`])('%s without a role header is 401', async (path) => {
        const res = await request(app).get(path);
        expect(res.status).toBe(401);
      });
      test.each(['/runs', `/runs/${run.id}`])('%s with a non-permitted role is 403', async (path) => {
        const res = await request(app).get(path).set('x-staff-role', 'new_hire');
        expect(res.status).toBe(403);
      });
  - |
    AC1 (workflows store/routes): a named workflow round-trips, and GET /workflows exposes a
    step preview built from buildSteps.
      test('createWorkflow stores and returns an optional name', () => {
        const wf = createWorkflow({ tasks: [{ id: 't1', next: [] }] }, 'Engineering Onboarding');
        expect(wf.name).toBe('Engineering Onboarding');
      });
      test('GET /workflows lists each workflow with its ordered step preview', async () => {
        const created = await request(app).post('/workflows').send({
          name: 'Sales Onboarding',
          taskGraph: { tasks: [{ id: 't1', name: 'Offer letter', owner: 'HR', next: ['t2'] }, { id: 't2', name: 'Background check', owner: 'HR', requirement: { label: 'Check cleared' }, next: [] }] },
        });
        const res = await request(app).get('/workflows').set('x-staff-role', 'hr');
        expect(res.status).toBe(200);
        const wf = res.body.find((w) => w.id === created.body.id);
        expect(wf).toMatchObject({ name: 'Sales Onboarding', steps: [{ name: 'Offer letter', owner: 'HR' }, { name: 'Background check', owner: 'HR', requirementLabel: 'Check cleared' }] });
      });
      test('GET /workflows without a role header is 401', async () => {
        expect((await request(app).get('/workflows')).status).toBe(401);
      });
  - |
    AC1 (start-run.js, jsdom): submit stays disabled until both pickers are set, and a successful
    start navigates to the run detail screen.
      test('Start run is disabled until a hire and a workflow are both chosen', () => {
        initStartRunApp(document, { hires: [hireFixture], workflows: [workflowFixture] }, api);
        expect(document.getElementById('start-run-submit-btn').disabled).toBe(true);
        document.getElementById('hire-select').value = hireFixture.id;
        document.getElementById('hire-select').dispatchEvent(new Event('change'));
        document.getElementById('workflow-select').value = workflowFixture.id;
        document.getElementById('workflow-select').dispatchEvent(new Event('change'));
        expect(document.getElementById('start-run-submit-btn').disabled).toBe(false);
      });
      test('submitting calls the API with the chosen hire and workflow and navigates on success', async () => {
        const api = { startRun: jest.fn().mockResolvedValue({ id: 'run_9001' }) };
        /* ...select hire + workflow as above... */
        document.getElementById('start-run-submit-btn').click();
        await flush();
        expect(api.startRun).toHaveBeenCalledWith(workflowFixture.id, hireFixture.id);
      });
  - |
    AC2 (run-detail.js, jsdom): the stepper shows each step's current status.
      test('each step shows its status: done, current, or blocked', () => {
        initRunDetailApp(document, fixtureRun(), {});
        expect(document.querySelectorAll('.step-item--done')).toHaveLength(1);
        expect(document.querySelector('.step-item--current')).not.toBeNull();
      });
  - |
    AC3 (run-detail.js, jsdom): advancing an eligible step marks it complete and activates the
    next one.
      test('advancing a non-blocked step calls the API and renders the next step as current', async () => {
        const api = { advanceStep: jest.fn().mockResolvedValue(fixtureRun({ currentIndex: 2 })) };
        initRunDetailApp(document, fixtureRun(), api);
        document.getElementById('advance-btn').click();
        await flush();
        expect(api.advanceStep).toHaveBeenCalledTimes(1);
        expect(document.getElementById('field-error').hidden).toBe(true);
      });
  - |
    AC4 (run-detail.js, jsdom): attempting to advance a step with an unmet requirement shows the
    inline error and the step does not silently advance.
      test('a blocked advance response shows the inline field error with the requirement label', async () => {
        const api = { advanceStep: jest.fn().mockResolvedValue(blockedRun(false)) };
        initRunDetailApp(document, fixtureRun(), api);
        document.getElementById('advance-btn').click();
        await flush();
        const err = document.getElementById('field-error');
        expect(err.hidden).toBe(false);
        expect(err.textContent).toContain('I-9 supporting document');
      });
  - |
    AC5 (run-detail.js, jsdom): marking the requirement met records the resolution and makes the
    step eligible for advancement.
      test('marking the requirement met flips it to Met and clears the field error', async () => {
        const api = { resolveRequirement: jest.fn().mockResolvedValue(blockedRun(true)) };
        initRunDetailApp(document, blockedRun(false), api);
        document.getElementById('resolve-btn').click();
        await flush();
        expect(document.querySelector('.state--met')).not.toBeNull();
      });
  - |
    AC6 (runs.js / start-run.js / run-detail.js, jsdom): a non-HR/Manager viewer sees access
    denied instead of the runs list, the start-run form, or the run detail.
      test('selecting the non-permitted role replaces the runs table with the access-denied panel', () => {
        initRunsListApp(document, [summary()], jest.fn());
        document.getElementById('role-select').value = 'employee';
        document.getElementById('role-select').dispatchEvent(new Event('change'));
        expect(document.querySelector('.access-denied')).not.toBeNull();
        expect(document.getElementById('runs-tbody')).toBeNull();
      });
review_focus: |
  In scope: role-gating the two previously-open GET routes (AC6), a new `GET /workflows` listing
  plus optional workflow naming (AC1 backend support), the new Start Run screen, and a full
  rebuild of the Run Detail action panel to match the approved prototype's blocked/resolved
  states (AC2–AC5) — including removing the old blocked-banner/retry-button/hire-record-card/
  audit-toggle UI that shipped under story 137 in favor of the prototype's persistent
  advance-button + inline field-error + always-visible activity list + run-summary card. Out of
  scope: anything about hire profile editing or employee-record creation (`src/employees/*`,
  `completeRun`, `src/onboarding/engineClient.js`) — those are explicitly excluded by this story's
  description and untouched here. The riskiest area is the Run Detail rewrite: it changes element
  IDs and removes markup that `test/run-detail-ui.test.js` currently asserts on, so that file is
  rewritten rather than patched — a reviewer diffing it against its previous version should expect
  wholesale replacement of the blocked/audit-log assertions, not a small patch. The "eligible hire"
  filter in Start Run (active profile + no active/blocked run) is a judgment call, not something
  an AC spells out — flagged in assumptions, worth reviewer sign-off if a different rule was
  intended (e.g. allowing a second concurrent run per hire).
