summary: |
  Implements the three confirmed acceptance criteria for deadline-approaching reminders:
  (1) a configurable per-step reminder window that, once reached while the step owner hasn't
  acted, sends a reminder to the step owner, HR, and the relevant manager via both in-app and
  email channels; (2) a hard cap of 5 reminders per step, after which further interval elapses
  send nothing more; (3) every delivery attempt (recipient x channel) recorded as a log entry
  capturing the recipient, channel, and outcome. The work item's scope note explicitly says the
  exact reminder cadence, whether reminders continue once overdue, and whether a "resolved"
  completion notice is sent are all pending confirmation against epic rules — the approved
  design itself renders those three controls as disabled "Pending decision" chips on its
  Settings screen. This plan does not implement any of those three undecided behaviors and does
  not build the Settings screen (nor the Notifications-inbox or Email-preview screens, which
  only exist in the prototype to visualize sends already evidenced by the delivery log). It adds
  deadline/reminder metadata to onboarding run steps, a small reminder-evaluation engine with a
  simulated in-app/email transport, HTTP endpoints to read reminder status and force an
  evaluation check, a periodic background sweep, and a "Deadline reminders" card plus delivery
  log table on the existing Run Detail page, matching the design's reminder-card and
  recent-delivery-activity elements.

scope:
  - description: |
      Add deadline and reminder-configuration metadata to onboarding run steps. In
      `buildSteps(taskGraph, startedAt)`, a task may declare `deadlineOffsetHours` (hours after
      run start the step is due), and optionally `reminderWindowHours`, `hrContact`, and
      `managerContact`. When `deadlineOffsetHours` is present, the built step gets:
      `dueAt` (ISO string = startedAt + deadlineOffsetHours), `reminderWindowHours` (default 48),
      `reminderCadenceHours` (fixed default 12 — see assumptions), `maxReminders` (fixed 5),
      `remindersSent: 0`, `lastReminderAt: null`, `hrContact` (default `'HR'`),
      `managerContact` (default `'Manager'`). Steps without `deadlineOffsetHours` get
      `dueAt: null` and are never reminder-eligible. `startRun` is reordered so `startedAt` is
      computed before `buildSteps` is called, and passed through. Add a `getActiveRuns()`
      export returning live (non-cloned) run references for the reminder sweep to mutate, mirroring
      how `advanceStep` already mutates the Map-held run object directly. Update `seedExampleRun`'s
      `step_it` task with `deadlineOffsetHours`, `reminderWindowHours`, `hrContact: 'HR — Priya Shah'`,
      `managerContact: 'Manager — Morgan Ellis'` so the seeded Jordan Reyes run exercises the
      feature when the app runs manually, matching the design's fixture (Devon Ruiz / Priya Shah /
      Morgan Ellis).
    files:
      - src/runs/store.js
    rationale: |
      The run/step model is the only place a step's deadline and owner identity already live
      (free-text `owner`, e.g. `'IT — Devon Ruiz'`); this keeps the new fields consistent with
      that existing convention rather than introducing a staff directory this codebase doesn't
      have. `buildSteps` signature changes from `buildSteps(taskGraph)` to
      `buildSteps(taskGraph, startedAt)` — not destructively, since `startedAt` is only used when
      a task opts in via `deadlineOffsetHours`.

  - description: |
      New module `src/reminders/channels.js` — the simulated notification transport. Exports
      `sendInApp(recipient, message)` and `sendEmail(recipient, message)`, each returning
      `{ ok: true }` by default. These are the extension point a real in-app/email provider would
      replace; they must be called as `channels.sendInApp(...)` / `channels.sendEmail(...)` from
      `reminders/store.js` (not destructured on import), so a test can do
      `jest.spyOn(channels, 'sendEmail').mockImplementationOnce(() => { throw new Error('Mailbox unavailable'); })`
      to force the failure branch required by AC3.
    files:
      - src/reminders/channels.js
    rationale: |
      Isolating the transport call behind a mockable module is what makes AC3's "succeeds or
      fails" branch testable without a real email/in-app provider existing in this codebase.

  - description: |
      New module `src/reminders/store.js` — the reminder engine.
      `evaluateRun(run, now = new Date())`: looks at `run.steps[run.currentIndex]`; no-ops if the
      run is completed, the step has no `dueAt`, the step is already `'done'`, or
      `step.remindersSent >= step.maxReminders`. Computes
      `windowOpensAt = dueAt - reminderWindowHours*3600000`; no-ops if `now < windowOpensAt`.
      Sends the first reminder immediately once the window opens
      (`step.remindersSent === 0`); otherwise sends the next one once
      `now - lastReminderAt >= reminderCadenceHours*3600000`.
      `sendReminder(run, step, now)` (internal): builds the recipient list
      `[{ role: 'owner', label: step.owner }, { role: 'hr', label: step.hrContact }, { role: 'manager', label: step.managerContact }]`,
      and for each recipient x channel (`'in-app'`, `'email'`) attempts delivery via
      `channels.sendInApp`/`channels.sendEmail`, catching any throw as a failed delivery, and
      appends one entry per attempt to a per-run delivery log:
      `{ ts, runId, stepId, reminderNumber, recipientRole, recipientLabel, channel, outcome: 'delivered'|'failed', reason }`.
      Increments `step.remindersSent` and sets `step.lastReminderAt = now.toISOString()`.
      `sweepReminders(now = new Date())`: calls `evaluateRun` for every run from
      `getActiveRuns()`. `getDeliveryLog(runId)`: returns that run's log entries (empty array if
      none). `getReminderStatus(run)`: returns the read-model used by both the HTTP route and
      (indirectly) the UI —
      `{ stepId, stepName, dueAt, reminderWindowHours, maxReminders, remindersSent, ownerActed, windowReached, capped, recipients, deliveryLog }`.
      Exports `MAX_REMINDERS = 5` and `DEFAULT_REMINDER_WINDOW_HOURS = 48` /
      `DEFAULT_REMINDER_CADENCE_HOURS = 12` as named constants alongside the functions.
    files:
      - src/reminders/store.js
    rationale: |
      Keeps the trigger/cap/logging rule as one pure, directly-unit-testable module (mirrors how
      `runs/store.js` is tested directly rather than only through HTTP), independent of any
      scheduler or UI.

  - description: |
      Wire the reminder engine into the existing runs HTTP surface in `src/runs/routes.js`:
      `GET /runs/:id/reminders` returns `getReminderStatus(run)` for the run's current step (404
      if the run doesn't exist); `POST /runs/:id/reminders/check` (behind the existing
      `enforceOnboardingRole` middleware, same as `/advance` and `/resolve-requirement`) calls
      `evaluateRun(run, new Date())` then returns the same status payload. The POST route is the
      real-system equivalent of the design's "Simulate: reminder window reached /
      Simulate: next reminder interval elapses" button — it forces an immediate evaluation
      against actual wall-clock time and the step's real `dueAt`, rather than replaying a
      client-side fixture, since production cadence in this app comes from the periodic sweep
      below and a manual check is the only way to demo an interval elapsing without waiting in
      real time.
    files:
      - src/runs/routes.js
    rationale: |
      Reuses the existing role-enforcement and run-lookup conventions already in this file
      (`getRun`, `enforceOnboardingRole`) rather than introducing a new auth or routing pattern.

  - description: |
      In `src/index.js`, start a periodic sweep after the server listens:
      `setInterval(() => sweepReminders(), 15 * 60 * 1000)` (15 minutes), requiring
      `sweepReminders` from `src/reminders/store.js`. This file is the real process entrypoint
      (`node src/index.js`); test files only ever `require('../src/server')` directly, so this
      interval never starts under Jest.
    files:
      - src/index.js
    rationale: |
      Gives AC1/AC2 a real, non-demo trigger path in the running app (deadlines get checked on a
      schedule) without affecting test determinism, since every existing test imports the Express
      app from `server.js`, not `index.js`.

  - description: |
      Add a "Deadline reminders" card to `public/run-detail.html`, placed after the existing
      "Current step" card, reusing the design's reminder-card structure (card title + state pill,
      countdown-style status line, progress bar + label, a recipients chip row, and a delivery log
      table) read from `.arc/designs/TEST-M1-STORY-161-design.html`'s `.reminder-card` block
      (lines ~672-710) and its `.pill`/`.recipients-row`/`.log-table`/`.outcome` styling (lines
      ~404-441). New ids (distinct from the existing step-progress ids to avoid collisions):
      `reminder-card`, `reminder-state-pill`, `reminder-status-text`, `reminder-progress-fill`,
      `reminder-progress-label`, `reminder-recipients-row`, `check-reminders-btn`,
      `reminder-log-empty`, `reminder-log-scroll`, `reminder-log-body`. The card is hidden
      (`hidden` attribute, toggled by JS) when the current step has no `dueAt` (not
      reminder-eligible), matching the design's own empty/not-applicable handling.
    files:
      - public/run-detail.html
    rationale: |
      This is the one design screen the acceptance criteria actually require evidence on: AC1's
      recipients/channels, AC2's cap, and AC3's logged outcomes are all visualized on the design's
      "Run detail — Reminders" screen. The Notifications inbox, Email preview, Delivery-log, and
      Settings screens are prototype-only demo surfaces for those same already-logged facts (or,
      for Settings, for the three explicitly pending-decision controls) and are intentionally not
      built — see notes.

  - description: |
      Extend `public/js/run-detail.js`: add `renderReminders()` that reads a `reminders` field on
      the run payload (or a separately-fetched status) and renders the pill state
      (`'Not yet due for a reminder'` / `'Reminder N of 5 sent'` /
      `'Reminder limit reached (5 of 5)'` / `'Step completed'`, mirroring the design's
      `renderReminderPanel` state machine), the progress bar (`remindersSent / maxReminders`),
      the recipients chips, and the delivery log rows
      (`<td>${ts}</td><td>${recipientLabel}</td><td>${channel}</td><td>${outcome}</td>`, using the
      design's `outcome-ok`/`outcome-fail` markup for the icon-plus-text failure treatment — never
      color alone). Wire `check-reminders-btn` to `api.checkReminders()` (POST
      `/runs/:id/reminders/check`), disabling the button and re-rendering on resolution, following
      the same pending/disable pattern `runAction` already uses for `advance`/`resolve-requirement`.
      Extend `createDefaultApi` with `checkReminders: () => post('reminders/check')` style call (GET
      for status, POST for check) and extend the `DOMContentLoaded` bootstrap to also fetch
      `/runs/:id/reminders` for the initial render.
    files:
      - public/js/run-detail.js
    rationale: |
      Matches the existing `initRunDetailApp(doc, run, api)` test-injectable pattern already used
      by every other panel on this page (hire record, stepper, action panel).

  - description: |
      Add token-only CSS to `public/css/runs.css` for the new elements: `.reminder-card`,
      `.pill` / `.pill-waiting` / `.pill-delivered` / `.pill-capped`, `.recipients-row`,
      `.log-table` (+ `th`/`td`), `.log-scroll`, `.outcome` / `.outcome-ok::before` (`content: "✓"`)
      / `.outcome-fail::before` (`content: "✕"`), adapted from the design's page-specific style
      block (lines 381-441 of the design file), reusing existing `--color-*`/`--space-*`/`--radius-*`
      tokens already defined in `design-system/tokens.css` — no new literal colors or sizes.
    files:
      - public/css/runs.css
    rationale: |
      Keeps styling consistent with how `runs.css` already documents itself as "Story-specific
      styles ... built exclusively from design tokens," matching every other card on this page.

tests:
  - |
    AC1 (reminders-store unit test, `test/reminders-store.test.js`): a step with
    `deadlineOffsetHours: 48, reminderWindowHours: 48` reaches its window exactly at run start;
    calling `evaluateRun(run, new Date(run.startedAt))` must deliver to all three recipients on
    both channels:
    ```js
    const wf = createWorkflow({ tasks: [{ id: 't1', owner: 'IT — Devon Ruiz', hrContact: 'HR — Priya Shah', managerContact: 'Manager — Morgan Ellis', deadlineOffsetHours: 48, reminderWindowHours: 48, next: [] }] });
    const run = startRun(wf.workflowId);
    evaluateRun(run, new Date(run.startedAt));
    const log = getDeliveryLog(run.id);
    expect(log).toHaveLength(6);
    expect(log.map((e) => `${e.recipientRole}:${e.channel}`).sort()).toEqual(
      ['hr:email', 'hr:in-app', 'manager:email', 'manager:in-app', 'owner:email', 'owner:in-app']
    );
    expect(log.every((e) => e.outcome === 'delivered')).toBe(true);
    ```
    A second test confirms no reminder fires once the owner has acted:
    ```js
    advanceStep(run.id);
    evaluateRun(run, new Date(run.startedAt));
    expect(getDeliveryLog(run.id)).toHaveLength(0);
    ```
  - |
    AC2 (reminders-store unit test): sweeping across 6 elapsed cadence intervals sends exactly 5
    reminders, not 6:
    ```js
    const wf = createWorkflow({ tasks: [{ id: 't1', deadlineOffsetHours: 48, reminderWindowHours: 48, next: [] }] });
    const run = startRun(wf.workflowId);
    const windowOpensAt = new Date(run.startedAt).getTime();
    const cadenceMs = 12 * 3600 * 1000;
    for (let i = 0; i < 6; i += 1) {
      evaluateRun(run, new Date(windowOpensAt + i * cadenceMs));
    }
    expect(run.steps[0].remindersSent).toBe(5);
    expect(getDeliveryLog(run.id)).toHaveLength(5 * 3 * 2);
    ```
  - |
    AC3 (reminders-store unit test): a forced channel failure is recorded distinctly from a
    successful delivery, both capturing recipient and channel:
    ```js
    const channels = require('../src/reminders/channels');
    jest.spyOn(channels, 'sendEmail').mockImplementationOnce(() => { throw new Error('Mailbox unavailable'); });
    const run = startRun(wf.workflowId);
    evaluateRun(run, new Date(run.startedAt));
    const log = getDeliveryLog(run.id);
    const ownerEmail = log.find((e) => e.recipientRole === 'owner' && e.channel === 'email');
    expect(ownerEmail).toMatchObject({ outcome: 'failed', reason: 'Mailbox unavailable' });
    const ownerInApp = log.find((e) => e.recipientRole === 'owner' && e.channel === 'in-app');
    expect(ownerInApp.outcome).toBe('delivered');
    ```
  - |
    AC1 + AC3 (HTTP, `test/reminders-routes.test.js`): the check endpoint reflects sent reminders
    and their recipients/channels through the real route, not just the store:
    ```js
    const res = await request(app).post(`/runs/${run.id}/reminders/check`).set('x-staff-role', 'manager').send({});
    expect(res.status).toBe(200);
    expect(res.body.remindersSent).toBe(1);
    expect(res.body.deliveryLog).toHaveLength(6);
    ```
  - |
    AC2 (HTTP): once capped, `GET /runs/:id/reminders` reports `capped: true` and a further
    `POST .../reminders/check` does not increase `remindersSent`:
    ```js
    expect((await request(app).get(`/runs/${run.id}/reminders`)).body.capped).toBe(true);
    const before = (await request(app).get(`/runs/${run.id}/reminders`)).body.remindersSent;
    await request(app).post(`/runs/${run.id}/reminders/check`).set('x-staff-role', 'manager').send({});
    const after = (await request(app).get(`/runs/${run.id}/reminders`)).body.remindersSent;
    expect(after).toBe(before);
    ```
  - |
    AC1 + AC2 + AC3 (UI, `test/run-detail-reminders-ui.test.js`, jsdom): the reminder card renders
    the sent/cap state and a delivery log row with recipient, channel, and a failure rendered as
    icon-plus-text, never color alone:
    ```js
    initRunDetailApp(document, fixtureRunWithReminders({ remindersSent: 5, maxReminders: 5 }), {});
    expect(document.getElementById('reminder-state-pill').textContent).toContain('Reminder limit reached (5 of 5)');
    expect(document.getElementById('check-reminders-btn').disabled).toBe(true);
    const row = document.querySelector('#reminder-log-body tr');
    expect(row.textContent).toContain('Devon Ruiz');
    expect(row.querySelector('.outcome-fail').textContent).toContain('Failed');
    ```

assumptions_or_open_questions:
  - |
    The story's scope note says the exact reminder cadence is still pending confirmation against
    epic rules, and the design itself marks "Repeat interval" as a disabled "Pending decision"
    control showing "Every 12 hours" only as an illustrative placeholder. This plan uses 12 hours
    as the implementation default (`DEFAULT_REMINDER_CADENCE_HOURS`) purely so AC2's "another
    reminder interval elapses" is testable at all — it is not a confirmed product decision and
    should be revisited once the epic cadence is settled.
  - |
    Whether reminders continue once a step is already overdue (past `dueAt`), and whether a
    "resolved" notice is sent on step completion, are explicitly called out as unconfirmed in the
    story and are rendered as disabled controls in the design. Neither is implemented here:
    `evaluateRun` has no overdue-specific branch (it keeps sending on cadence until the 5-reminder
    cap regardless of whether `now` has passed `dueAt`, which is the current behavior by omission,
    not a deliberate "continue once overdue" decision), and no completion-triggered notification
    is sent anywhere in `advanceStep`.
  - |
    This codebase has no staff/user directory — step ownership is already modeled as a free-text
    label (e.g. `'IT — Devon Ruiz'`). HR and "the relevant manager(s)" are modeled the same way,
    as a single `hrContact` and a single `managerContact` free-text field per step (defaulting to
    `'HR'` / `'Manager'`), not a list of real user records with email addresses. "Relevant
    managers" (plural, per AC1's wording) is treated as one manager contact per step, matching the
    design's fixture which also shows exactly one named manager recipient.
  - |
    Reminders are only evaluated for a run's current step (`run.steps[run.currentIndex]`), since
    that is the only step a user can be "acting on" at a given time in this sequential
    advance-one-step-at-a-time run model. Completed and upcoming steps are never reminder-eligible.
  - |
    "Configurable reminder window" (AC1) is implemented as a property of the task/workflow
    definition (`task.reminderWindowHours`), not as a live admin-editable global settings screen.
    The design's Settings screen's one actually-interactive control (the reminder-window number
    input) is not built, since no AC requires a persisted global settings UI and the rest of that
    screen is explicitly non-interactive placeholder content for the pending-decision items above.
  - |
    In-app delivery is represented only as a delivery-log entry with `channel: 'in-app'` (plus the
    simulated `channels.sendInApp` call) — no per-recipient inbox store or Notifications-inbox
    screen is built, since no AC requires retrieving a recipient's own notification list, only
    that the send and its outcome are recorded (AC3) and that it happened on both channels (AC1).

package_dependencies: []

notes: |
  Design review: `.arc/designs/TEST-M1-STORY-161-design.html` is readable and was used directly.
  Its own in-file notes (around the Settings screen, lines 822-835) say the cadence, overdue-
  continuation, and resolved-notice controls are rendered "visibly but disabled with a 'Pending
  decision' chip, so a reviewer can see where this design intentionally stops short of the
  unconfirmed scope rather than guessing an answer" — this plan follows that same boundary in the
  implementation, not just the UI: those three behaviors are not coded, only the two confirmed
  rules (window-triggered send, 5-reminder cap) and the logging requirement are.

  Screens built: "Run detail — Reminders" only (the reminder card + delivery log, added to the
  existing `public/run-detail.html`/`run-detail.js`). Screens not built: Notifications inbox,
  Email preview, Delivery log (standalone), and Settings — each is either a visualization of facts
  already evidenced by the delivery log recorded under AC3, or (Settings) mostly non-interactive
  placeholder content for the three pending-decision items, per the assumptions above.

  ```mermaid
  flowchart TD
    WF[src/workflows/store.js<br/>task definitions]
    RS[src/runs/store.js<br/>buildSteps/startRun/getActiveRuns]
    REM[src/reminders/store.js<br/>evaluateRun/sweepReminders/getDeliveryLog]
    CH[src/reminders/channels.js<br/>sendInApp/sendEmail]
    RR[src/runs/routes.js<br/>GET+POST /runs/:id/reminders]
    IDX[src/index.js<br/>periodic sweep]
    UI[public/js/run-detail.js<br/>renderReminders]
    HTML[public/run-detail.html<br/>reminder-card markup]

    WF -->|opaque taskGraph fields read by| RS
    RS -->|live run/step refs| REM
    REM -->|per-attempt send, mockable for AC3| CH
    RR -->|getRun / getReminderStatus| RS
    RR -->|evaluateRun on POST check| REM
    IDX -->|every 15 min| REM
    UI -->|fetch /runs/:id/reminders| RR
    HTML -->|initRunDetailApp wires card| UI

    classDef touched fill:#f96,color:#000;
    class RS,REM,CH,RR,IDX,UI,HTML touched;
  ```

review_focus: |
  In scope: the window-triggered send rule (AC1), the fixed 5-reminder cap (AC2), and per-attempt
  delivery logging with recipient/channel/outcome (AC3) — implemented as a standalone
  `src/reminders/store.js` engine plus a reminder card on the existing Run Detail page. Explicitly
  out of scope (per the story's own "blocked pending confirmation" note and the design's disabled
  controls): the actual reminder cadence value, continuing reminders past the deadline, a
  "resolved" completion notice, and the Settings/Notifications-inbox/Email-preview/Delivery-log
  screens. The riskiest area is the recipient/channel fan-out inside `sendReminder` — it's easy to
  get the cardinality wrong (3 recipients x 2 channels = 6 log entries per reminder); the AC1 and
  AC2 tests pin the exact counts (6, and 30 across 5 reminders) to catch that. Also note
  `channels.sendEmail`/`sendInApp` must be called as `channels.sendX(...)`, not destructured, or
  `jest.spyOn` in the AC3 test silently stops intercepting the real call.
