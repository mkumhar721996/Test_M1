summary: |
  Fire the "blocked step/run alert" the moment `advanceStep` in `src/runs/store.js`
  transitions a step into its existing `blocked` state (the same transition shipped in
  TEST-M1-STORY-137's `advanceStep`/`resolveStepRequirement` pair). A new
  `src/notifications/store.js` module resolves the right recipients — HR, the run's
  relevant managers, and the blocked step's own owner, never the owners of the run's
  other steps — and records one delivery attempt per recipient per channel (`In-app`,
  `Email`), each logged with enough detail (notification id, run/step, recipient,
  channel, outcome, error code, retry count) for support to diagnose a missed
  notification. A new `GET /notifications/delivery-log` endpoint and support-facing
  "Notification delivery log" page expose that log (AC3), and the real Run Detail page
  gains an "Alerts sent" panel showing, for the run's own blocked step, who was
  notified on which channel and which other steps' owners were correctly excluded
  (AC1/AC2) — both built from the approved prototype's Run Detail and Delivery Log
  screens. The current codebase has no concept of "HR partner", "relevant managers",
  or a structured step-owner identity (only a free-text `owner` string per step) and no
  notion of "the logged-in user" at all (only a coarse `x-staff-role` header) — this
  plan adds the minimal structured data needed to address recipients, and deliberately
  does not build the prototype's per-persona inbox/mailbox screens, which would require
  inventing an identity system the story doesn't ask for (see
  `assumptions_or_open_questions`).

scope:
  - description: |
      Create `src/notifications/store.js`, a new in-memory notification log store
      mirroring the existing `src/employees/store.js` / `src/runs/store.js` pattern
      (plain module-level array, no persistence). Exports:
      ```js
      function resolveRecipients(run, step) { /* dedup by email, else name */ }
      function fireBlockedStepAlert(run, step) { /* records In-app + Email attempts for every resolved recipient */ }
      function listDeliveryLog({ runId, status } = {}) { /* filter by runId and/or status ('all'|'delivered'|'failed') */ }
      module.exports = { resolveRecipients, fireBlockedStepAlert, listDeliveryLog };
      ```
      `resolveRecipients` builds the candidate list from `run.notifyRecipients.hr`
      (role `'HR'`), each of `run.notifyRecipients.managers` (role `'Relevant
      manager'`), and the blocked `step` itself (role `` `Step owner — ${step.ownerTitle}` ``
      from `step.ownerName`/`step.ownerEmail`) — then dedupes by `email` (falling back
      to `name`), merging role labels with `' & '` when the same person appears twice
      (e.g. the seeded I-9 step's owner, Priya Shah, is also the run's HR recipient).
      `fireBlockedStepAlert` sends each resolved recipient one `'In-app'` and one
      `'Email'` attempt. In-app always succeeds (there is no external in-app transport
      to fail against, matching how the prototype's fixture never fails that channel).
      Email succeeds only if the recipient has a non-empty `email`; otherwise it fails
      with `errorCode: 'NO_EMAIL_ADDRESS'` and a detail string naming the recipient —
      deterministic so tests never flake, unlike the prototype's illustrative "SMTP 550"
      example. Every attempt is pushed to the log as:
      ```js
      { id, notificationId, runId, stepId, recipientName, recipientRole, channel, status, detail, errorCode, retryCount: 0, createdAt }
      ```
    files:
      - src/notifications/store.js
    rationale: |
      This is the core of the story: one place that turns "a step just blocked" into
      "the right people were notified on both channels, and every attempt — success or
      failure — is recorded." Keeping it as a standalone store (not folded into
      `runs/store.js`) matches the codebase's existing one-module-per-domain
      convention (`employees/store.js`, `hires/store.js`) and lets `runs/store.js` stay
      focused on run/step state.

  - description: |
      Wire the alert into the existing blocked transition in `src/runs/store.js`, and
      give steps/runs the identity data `resolveRecipients` needs:
        1. `buildSteps` gains `ownerName`, `ownerTitle`, `ownerEmail` on each built step
           (new optional fields read off the task definition, defaulting to `''`),
           alongside the existing `owner` display string.
        2. `startRun` carries a new `run.notifyRecipients` field, read from
           `definition.taskGraph.notifyRecipients` and defaulting to
           `{ hr: null, managers: [] }` when the workflow didn't define it.
        3. In `advanceStep`, inside the existing
           `if (step.requirementLabel && !step.requirementMet)` branch, call
           `fireBlockedStepAlert(run, step)` — but only `if (!wasBlocked)`. `wasBlocked`
           is already computed at the top of the function
           (`const wasBlocked = step.status === 'blocked';`); gating on it means the
           alert fires exactly once per "enters blocked" transition and does NOT
           re-fire on a second failed retry while the step is still blocked. This
           resolves (conservatively, toward AC1's literal wording) the story's own
           open question about whether the alert repeats while blocked — see
           `assumptions_or_open_questions`.
        4. `seedExampleRun`'s workflow definition gains a `notifyRecipients` block
           (`hr: Priya Shah`, `managers: [Morgan Ellis, Alex Chen]`) and
           `ownerName`/`ownerTitle`/`ownerEmail` on each of its 5 tasks, reusing the
           people already named in its `owner` strings today (Priya Shah, Devon Ruiz,
           Morgan Ellis) plus Alex Chen as the second "relevant manager" (new, mirrors
           the prototype's fixture).
    files:
      - src/runs/store.js
    rationale: |
      `advanceStep` is the single place the "blocked" transition already happens
      (`step.status = 'blocked'; run.status = 'blocked';`) — AC1 says to alert "the
      moment" that transition occurs, so the call belongs right there, not in a
      poller or a second endpoint. The step/run only carry a free-text `owner` string
      and no HR/manager concept at all today, so targeting data has to be added
      somewhere; putting it on the task definition (like the existing `requirement`
      field) keeps the extension consistent with how steps already carry
      per-task optional metadata.

  - description: |
      Create `src/notifications/routes.js` exposing
      `GET /notifications/delivery-log` — reads optional `runId` and `status` query
      params and returns `listDeliveryLog({ runId, status })` as JSON, status 200.
      Mount it in `src/server.js` as `app.use('/notifications', notificationsRouter)`,
      alongside the other domain routers.
    files:
      - src/notifications/routes.js
      - src/server.js
    rationale: |
      AC3 requires the logged detail to be usable "for support staff to diagnose
      missed notifications" — that implies a way to actually read the log, not just
      write it. This mirrors the existing thin-router-over-store pattern used by every
      other domain (`src/runs/routes.js`, `src/employees/routes.js`).

  - description: |
      Add an "Alerts sent" card to the real Run Detail page. In `public/run-detail.html`,
      add a card (`id="alert-card"`) with heading "Alerts sent" and an empty
      `<div id="alert-panel-wrap">`, placed in the second column after the existing
      hire-record card — this is the prototype's Run Detail screen's `#alert-card`
      (`recipient-grid` of `recipient-card`s, each with two `channel-row`s, plus an
      `excluded-box` listing "Not notified" owners). In `public/js/run-detail.js`, add
      `renderAlertPanel()`, called from `renderAll()`:
        - If `run.status !== 'blocked'`, render the prototype's empty state
          ("Nothing has blocked on this run yet." / helper line).
        - Otherwise call
          `(api.getDeliveryLog ? api.getDeliveryLog(run.id) : Promise.resolve([]))`
          (the optional-chaining-style fallback keeps the existing AC4 blocked-run test,
          which passes `api = {}`, from throwing), group the resolved attempts by
          `recipientName`, and render one `.recipient-card` per recipient with a
          `.channel-row.state--delivered`/`.state--failed` per channel — exact class
          names taken from the prototype's `runs.css`-equivalent block (`.recipient-grid`,
          `.recipient-card`, `.r-name`, `.r-role`, `.channel-row`, `.state--delivered`,
          `.state--failed`). Below it, render `.excluded-box` listing every *other*
          step's `ownerName` not already present among the resolved recipients (proves
          AC2 in the UI without a second API call, using `run.steps` already on the
          page). Add `getDeliveryLog` to `createDefaultApi`:
          `getDeliveryLog: (id) => fetch('/notifications/delivery-log?runId=' + encodeURIComponent(id)).then((res) => (res.ok ? res.json() : []))`.
      Add the `.recipient-grid` / `.recipient-card` / `.channel-row` / `.excluded-box`
      rules to `public/css/runs.css`, copied from the prototype's token-based styles
      (same `--color-border`/`--radius-sm`/`--space-*` variables already used
      throughout `runs.css`). Add an "Alerts" nav link
      (`<a href="notification-log.html">Alerts</a>`) to the topbar `<nav class="app-nav">`
      in both `public/run-detail.html` and `public/runs.html`, matching the prototype's
      topbar, which adds the same link across every screen.
    files:
      - public/run-detail.html
      - public/js/run-detail.js
      - public/css/runs.css
      - public/runs.html
    rationale: |
      This is the only UI surface in the approved design that doesn't require
      inventing a "current user" — it shows, for the one run being viewed, who was
      notified and how, which is exactly AC1 + AC2 made visible. Reusing the
      prototype's own class names/layout keeps this a direct build of the approved
      design rather than a new invention.

  - description: |
      Build the prototype's "Notification Delivery Log" screen (AC3, support/ops
      view) as a new real page: `public/notification-log.html` (topbar with the same
      new "Alerts" link, active; a filter `<select id="status-filter">` with
      `all`/`delivered`/`failed` options, matching the prototype's filter — but
      without the prototype's "Demo: which step is about to block" picker, which only
      exists to let a reviewer switch fixture scenarios) and
      `public/js/notification-log.js` exporting
      `initDeliveryLogApp(doc, attempts)`, which renders the prototype's stat chips
      (`.stat-chip` × "N attempts" / "N delivered" / "N failed", the last styled
      `.is-failed` when `> 0`) and a `.log-table` (`Time` / `Recipient` / `Channel` /
      `Status` / a `Details` toggle revealing a `.log-detail-row` with notification id,
      run/step, detail text, error code, and retry count) — exact classes
      (`.log-stats`, `.stat-chip`, `.log-table-wrap`, `.log-table`, `.log-status`,
      `.log-detail-row`, `.log-detail-box`, `.log-toggle-btn`) copied from the
      prototype into a new `public/css/notification-log.css`. The prototype's
      "Resend" button is intentionally not built — AC3 asks only for diagnosable
      logging, not a remediation action; see `assumptions_or_open_questions`. On load,
      `fetch('/notifications/delivery-log')` populates the page with every attempt
      across every run (not scoped to one run, since this is the support-wide view).
    files:
      - public/notification-log.html
      - public/js/notification-log.js
      - public/css/notification-log.css
    rationale: |
      AC3 explicitly frames the log as being "enough detail for support staff to
      diagnose missed notifications" — that's a support/ops surface spanning every
      run, exactly what the prototype's fifth screen is and exactly what `GET
      /notifications/delivery-log` (no `runId`) returns.

tests:
  - |
    AC1 (unit, `test/blocked-step-alerts.test.js`): a step entering its blocked state
    fires one In-app + one Email attempt to HR, every relevant manager, and the step
    owner.
    ```js
    const wf = createWorkflow({
      notifyRecipients: {
        hr: { name: 'Priya Shah', email: 'priya.shah@onboardco.example' },
        managers: [{ name: 'Morgan Ellis', email: 'morgan.ellis@onboardco.example' }],
      },
      tasks: [{
        id: 't1', name: 'Verify I-9', next: [],
        ownerName: 'Devon Ruiz', ownerTitle: 'IT Systems', ownerEmail: 'devon.ruiz@onboardco.example',
        requirement: { label: 'I-9 doc', blockReason: 'missing' },
      }],
    });
    const run = startRun(wf.workflowId);

    advanceStep(run.id);

    const log = listDeliveryLog({ runId: run.id });
    expect(log).toHaveLength(6);
    expect(new Set(log.map((e) => e.recipientName))).toEqual(new Set(['Priya Shah', 'Morgan Ellis', 'Devon Ruiz']));
    expect(log.every((e) => e.status === 'delivered')).toBe(true);
    ```
  - |
    AC1 (HTTP, `test/blocked-step-alerts.test.js`): the delivery log is readable over
    HTTP once the block has fired.
    ```js
    const res = await request(app).get(`/notifications/delivery-log?runId=${run.id}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(6);
    ```
  - |
    AC2 (unit, `test/blocked-step-alerts.test.js`): with two steps owned by different
    people, only the blocked step's owner is notified.
    ```js
    const wf = createWorkflow({
      notifyRecipients: { hr: null, managers: [] },
      tasks: [
        { id: 't1', name: 'Step 1', next: ['t2'], ownerName: 'Devon Ruiz', ownerEmail: 'devon@x.com', requirement: { label: 'req', blockReason: 'missing' } },
        { id: 't2', name: 'Step 2', next: [], ownerName: 'Riley Chen', ownerEmail: 'riley@x.com' },
      ],
    });
    const run = startRun(wf.workflowId);

    advanceStep(run.id);

    const names = new Set(listDeliveryLog({ runId: run.id }).map((e) => e.recipientName));
    expect(names.has('Devon Ruiz')).toBe(true);
    expect(names.has('Riley Chen')).toBe(false);
    ```
  - |
    AC2 (dedup, unit, `test/blocked-step-alerts.test.js`): when the blocked step's
    owner is also the run's HR recipient (the seeded workflow's real I-9 step), they
    are notified once per channel, not twice.
    ```js
    const wf = createWorkflow({
      notifyRecipients: { hr: { name: 'Priya Shah', email: 'priya.shah@x.com' }, managers: [] },
      tasks: [{
        id: 't1', name: 'I-9', next: [],
        ownerName: 'Priya Shah', ownerTitle: 'HR Partner', ownerEmail: 'priya.shah@x.com',
        requirement: { label: 'doc', blockReason: 'missing' },
      }],
    });
    const run = startRun(wf.workflowId);

    advanceStep(run.id);

    const log = listDeliveryLog({ runId: run.id });
    expect(log.filter((e) => e.recipientName === 'Priya Shah' && e.channel === 'Email')).toHaveLength(1);
    ```
  - |
    AC3 (unit, `test/blocked-step-alerts.test.js`): an attempt with no destination
    address fails but is still logged with diagnosable detail.
    ```js
    const wf = createWorkflow({
      notifyRecipients: { hr: null, managers: [] },
      tasks: [{ id: 't1', name: 'Step', next: [], ownerName: 'Devon Ruiz', ownerEmail: '', requirement: { label: 'req', blockReason: 'missing' } }],
    });
    const run = startRun(wf.workflowId);

    advanceStep(run.id);

    const failed = listDeliveryLog({ runId: run.id }).find((e) => e.channel === 'Email');
    expect(failed.status).toBe('failed');
    expect(failed.errorCode).toBe('NO_EMAIL_ADDRESS');
    expect(failed.notificationId).toBeTruthy();
    expect(failed.stepId).toBe('t1');
    ```
  - |
    Open-question resolution (unit, `test/blocked-step-alerts.test.js`): retrying an
    already-blocked step (requirement still unmet) does not re-fire the alert.
    ```js
    const run = startRun(wf.workflowId); // wf as in the AC1 test
    advanceStep(run.id);
    const firstCount = listDeliveryLog({ runId: run.id }).length;

    advanceStep(run.id);

    expect(listDeliveryLog({ runId: run.id })).toHaveLength(firstCount);
    ```
  - |
    AC1 + AC2 (jsdom, `test/run-detail-ui.test.js`, extending the existing suite): a
    blocked run renders one recipient card per notified person with per-channel
    delivered/failed state, and lists the other step's owner as excluded.
    ```js
    const api = { getDeliveryLog: jest.fn().mockResolvedValue([
      { recipientName: 'Priya Shah', recipientRole: 'HR', channel: 'In-app', status: 'delivered' },
      { recipientName: 'Priya Shah', recipientRole: 'HR', channel: 'Email', status: 'delivered' },
      { recipientName: 'Devon Ruiz', recipientRole: 'Step owner — IT Systems', channel: 'In-app', status: 'delivered' },
      { recipientName: 'Devon Ruiz', recipientRole: 'Step owner — IT Systems', channel: 'Email', status: 'failed' },
    ]) };
    initRunDetailApp(document, blockedRun(false), api);
    await flush();

    expect(api.getDeliveryLog).toHaveBeenCalledWith('run_7201');
    expect(document.querySelectorAll('#alert-panel-wrap .recipient-card')).toHaveLength(2);
    expect(document.querySelector('#alert-panel-wrap').textContent).toContain('Email not delivered');
    expect(document.querySelector('.excluded-box').textContent).toContain('Devon Ruiz');
    ```
  - |
    AC3 (jsdom, `test/notification-log-ui.test.js`, new): the delivery log page shows
    stat chips and a filterable table.
    ```js
    const { initDeliveryLogApp } = require('../public/js/notification-log');
    initDeliveryLogApp(document, [
      { id: 'a1', recipientName: 'Priya Shah', recipientRole: 'HR', channel: 'Email', status: 'delivered', notificationId: 'ntf_1', runId: 'run_1', stepId: 't1', detail: 'Accepted.', retryCount: 0 },
      { id: 'a2', recipientName: 'Devon Ruiz', recipientRole: 'Step owner — IT', channel: 'Email', status: 'failed', notificationId: 'ntf_2', runId: 'run_1', stepId: 't1', detail: 'No email address on file for Devon Ruiz.', errorCode: 'NO_EMAIL_ADDRESS', retryCount: 0 },
    ]);

    expect(document.querySelector('.stat-chip.is-failed').textContent).toContain('1 failed');
    document.getElementById('status-filter').value = 'failed';
    document.getElementById('status-filter').dispatchEvent(new Event('change'));
    expect(document.querySelectorAll('.log-table tbody tr').length).toBe(1);
    ```

assumptions_or_open_questions:
  - |
    Nothing in the codebase today models "HR partner", "relevant managers", or a
    structured step-owner identity (email) — `src/hires/store.js`, `src/runs/store.js`
    and `src/employees/store.js` only carry a free-text `owner` display string per
    step and no manager/HR concept at all. This plan invents the minimal schema needed
    (`notifyRecipients: { hr, managers }` on the workflow task graph/run,
    `ownerName`/`ownerTitle`/`ownerEmail` on each task/step), mirroring the names
    already used in the prototype's fixture and the existing seeded workflow's `owner`
    strings. If there's a different intended source of truth for HR/manager
    assignment, this schema should be redirected there instead.
  - |
    "Relevant managers" is treated as a fixed list captured on the workflow
    definition when the run starts (`run.notifyRecipients.managers`), not computed
    dynamically from an org chart or reporting line — no such structure exists
    anywhere in this codebase to compute it from.
  - |
    The story's own scope note says it is "blocked pending confirmation of whether
    the alert repeats while still blocked and whether a 'resolved' follow-up fires
    once unblocked." This plan resolves both conservatively, toward AC1's literal
    wording ("WHEN the transition occurs"): the alert fires exactly once per
    "enters-blocked" transition (not on every failed retry while still blocked), and
    no "back to normal"/resolved notification is sent when the block later clears —
    exactly as the prototype's own Run Detail screen states explicitly
    ("Resolving this block and any 'back to normal' notification are out of scope for
    this story — not simulated here"). Confirm before merge if repeat-while-blocked
    alerts are actually wanted.
  - |
    Email delivery failure is modeled deterministically (fails only when the
    recipient has no email on file, `errorCode: 'NO_EMAIL_ADDRESS'`) rather than the
    prototype's illustrative flaky-SMTP example, since nothing in this codebase sends
    real email (no mail library, no SMTP config — `src/onboarding/engineClient.js`
    shows every other "external" integration in this app is already an in-process
    simulation) and a deterministic failure mode keeps the new tests from flaking.
  - |
    The prototype's per-persona "In-app Notifications" inbox and "Email
    Notifications" mailbox screens are deliberately not built. Both require knowing
    "which person is currently looking at this" — a concept that does not exist
    anywhere in this codebase (only a coarse `x-staff-role: manager|hr|front_desk`
    header, never an individual identity). Building either would mean inventing a
    login/session system this story never asked for. AC1 and AC2 are instead made
    verifiable through the real Run Detail page's new "Alerts sent" panel (which needs
    no viewer identity — it just shows what happened for the run being viewed) and
    through the backend tests above; AC3 is served by the support-wide Delivery Log
    page, which also needs no viewer identity.
  - |
    The prototype's "Resend" button on a failed delivery-log row is not built. AC3
    asks only that attempts be logged with enough detail to diagnose a problem, not
    that support can remediate it from this screen — adding a resend action would be
    speculative scope beyond the stated acceptance criteria.
  - |
    The seeded example run in `src/runs/store.js` (`seedExampleRun`) is updated with
    `notifyRecipients`/owner-email data using the people it already names in its
    `owner` strings (Priya Shah, Devon Ruiz, Morgan Ellis) plus a new second manager,
    Alex Chen, to mirror the prototype's fixture. It intentionally does NOT adopt the
    prototype's alternate "Riley Chen" owner for the orientation step — that only
    exists in the prototype as a second demo scenario to show the owner-list changing
    (AC2), and introducing a second real person for the same step in production seed
    data isn't needed to satisfy any acceptance criterion.

package_dependencies: []

notes: |
  No new third-party dependencies: the "email" and "in-app" channels are both
  simulated in-process (consistent with `src/onboarding/engineClient.js`, the only
  other "external" integration in this codebase, which is also a plain in-process
  stub) and `crypto.randomUUID` (already used in `runs/store.js`/`employees/store.js`)
  covers id generation.

  ```mermaid
  flowchart TD
    runsStore[runs/store.js]
    runsRoutes[runs/routes.js]
    notifStore[notifications/store.js]
    notifRoutes[notifications/routes.js]
    server[server.js]
    runDetailJs[public/js/run-detail.js]
    notifLogJs[public/js/notification-log.js]

    runsStore -->|"new: fireBlockedStepAlert(run, step) when !wasBlocked"| notifStore
    notifRoutes -->|"new: listDeliveryLog(filters)"| notifStore
    server -->|"new: mount /notifications"| notifRoutes
    server -->|existing mount /runs| runsRoutes
    runsRoutes -->|existing calls| runsStore
    runDetailJs -->|"new: GET /notifications/delivery-log?runId=&lt;id&gt;"| notifRoutes
    notifLogJs -->|"new: GET /notifications/delivery-log"| notifRoutes

    classDef touched fill:#f96,color:#000
    class runsStore,notifStore,notifRoutes,server,runDetailJs,notifLogJs touched
  ```

review_focus: |
  In scope: the blocked-transition hook in `advanceStep`, the new
  `notifications/store.js`/`routes.js` pair, and two UI surfaces that don't require a
  "current user" — the Run Detail "Alerts sent" panel and the new support-wide
  Delivery Log page. Explicitly out of scope (see `assumptions_or_open_questions` for
  why): the prototype's per-persona in-app inbox and email-mailbox screens, its
  "Resend" action, repeat-while-still-blocked alerts, and any "back to normal"
  notification on unblock. The riskiest area is the recipient-resolution/dedup logic
  in `resolveRecipients` — the seeded workflow has a real case (Priya Shah is both the
  HR recipient and the I-9 step's owner) where getting the dedup-by-email-or-name
  logic wrong would either double-send or silently drop a recipient; the `!wasBlocked`
  guard in `advanceStep` is the other non-obvious piece — without it, every failed
  retry on an already-blocked step would re-fire the alert, which is deliberately
  avoided here but is explicitly called out as a still-open product question in the
  story itself, not a settled requirement.
