summary: |
  Build the Approver Review & Decision Queue as a new client-side page, `public/approvals.html`
  backed by a new `public/js/approvals.js` module, following this repo's existing "Expenses"
  sub-app convention (plain `<script>` files + `localStorage`, no Express backend — unlike
  employees/hires/rooms which do have server-backed stores). The queue reads and writes the
  SAME `expenses` localStorage key the existing Expenses page (`public/index.html` +
  `public/js/expenses.js`) already owns, extending each record in-memory with the workflow
  fields (`status`, `decisions`, `employeeName`) it needs without touching the Expenses page's
  existing fixture, tests, or rendering (which must keep showing zero workflow/status UI, per
  its own AC9). The approved prototype at `.arc/designs/TEST-M1-STORY-162-design.html` is the
  only design record and is implemented verbatim: the "Approval Queue" screen's topbar/nav,
  viewer-switcher, shared-visibility hint, filter/sort toolbar, queue table, decision modal
  (reused for approve/reject/reverse), and empty/error/no-match/skeleton states, plus the
  "Reference States" screen's four callouts are treated as the acceptance spec for exact copy,
  element structure, and CSS classes.
scope:
  - description: |
      Create `public/js/approvals.js`: load/normalize/persist the shared `expenses` records and
      expose pure, independently-testable helpers plus `initApprovalsApp(doc)` for DOM wiring.

      Normalization (so legacy `exp_001`-`exp_003` records from `public/js/expenses.js`, which
      have no `status`/`decisions`/`employeeName` fields, work without any change to that file):
      ```js
      function normalizeExpense(exp) {
        return {
          ...exp,
          employeeName: exp.employeeName || exp.loggedBy,
          status: exp.status || 'submitted',
          decisions: exp.decisions || [],
        };
      }
      ```

      Load/seed (additive — never overwrites or removes whatever `expenses.js` already put in
      the shared key; only adds the design's fixture ids if they're not already present):
      ```js
      function loadQueueExpenses() {
        let list = [];
        try {
          const raw = localStorage.getItem(STORAGE_KEY);
          if (raw) list = JSON.parse(raw);
        } catch (e) { list = []; }
        const existingIds = new Set(list.map((e) => e.id));
        const seeded = INITIAL_QUEUE_EXPENSES.filter((e) => !existingIds.has(e.id));
        if (seeded.length) {
          list = [...list, ...seeded];
          try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); } catch (e) { /* ignore */ }
        }
        return list.map(normalizeExpense);
      }
      ```

      `INITIAL_QUEUE_EXPENSES` is copied field-for-field from the design's `#fixture-expenses`
      JSON (ids `exp_201`-`exp_211`, 4 employees including "Jordan Lee", the `exp_205`/`exp_206`
      rejected+resubmission pair, two pre-decided `approved` rows, one `reimbursed` row, and
      `exp_203` with `categoryOverLimit`/`limitNote`), so queue tests exercise the exact
      scenarios the approved design calls out.

      Pure helpers (exported for unit tests, mirroring the design's inline script logic):
      ```js
      function filterQueue(list, { employee = '', category = '', status = '' } = {}) { /* ... */ }
      function sortQueue(list, field, dir = 'desc') { /* ... */ }
      function isSelfSubmission(exp, viewerName) { return exp.employeeName === viewerName; }
      function lastDecision(exp) { return exp.decisions.length ? exp.decisions[exp.decisions.length - 1] : null; }
      function recordDecision(exp, action, actor, note) {
        exp.decisions.push({ action, actor, timestamp: new Date().toISOString(), note: note || '' });
        return exp;
      }
      ```
      `require('./utils')` for `escapeHtml`/`formatDateDisplay`/`trapTab`, same as
      `public/js/expenses.js` already does, instead of re-implementing them.
    files:
      - public/js/approvals.js
    rationale: |
      The parent epic requires a real submitted→approved/rejected→reimbursed workflow with an
      audit trail; the current `expenses` records have neither a status nor a decision history.
      Normalizing on read (rather than migrating `public/js/expenses.js`'s own `INITIAL_EXPENSES`
      array) is the only way to add this without breaking that file's already-passing tests,
      several of which assert exact record counts, exact sort order, and literally assert "no
      pending/approval/status workflow state" renders on the Expenses page (AC9 of that story) —
      a data-only field addition is invisible to that assertion since it only inspects rendered
      DOM classes, not the stored object.

  - description: |
      Create `public/approvals.html`: the "Approval Queue" screen from the design, built from
      its exact markup/ids/copy — topbar with brand "Expense Tracker" and nav
      `Expenses | Approvals (active) | Employees`, the "Signed in as" viewer-switcher
      (`#viewer-select` with Morgan Ellis / Priya Shah / Devon Ruiz / Jordan Lee), the
      `.shared-visibility-hint` paragraph, the filter/sort `.filter-card` (`#filter-employee`,
      `#filter-category`, `#filter-status`, `#sort-field`, `#sort-direction-btn`,
      `#demo-state-select`), `#result-summary`, the `.queue-table` with columns
      Employee/Date/Category/Amount/Description/Status/Actions and `#queue-tbody`, and the
      shared decision `#modal-wrap` (approve/reject/reverse body swapped by `initApprovalsApp`)
      plus `#toast`. Links `../design-system/tokens.css`, `../design-system/prototype-utils.css`,
      `./css/approvals.css`, and scripts `./js/utils.js` then `./js/approvals.js` (the
      `employees.html`/`hire-profile.html` script-tag pattern, not `index.html`'s, since
      `index.html` loads `expenses.js` via `require('./utils')` with no `utils.js` `<script>` tag
      present at all — a pre-existing gap in that file this plan does not touch or rely on).
    files:
      - public/approvals.html
    rationale: |
      This is a new, distinct nav destination per the design's own in-file comment ("Approvals
      is a new, distinct area from the personal/shared expense list... this queue is where any
      approver works a cross-employee decision queue, so it gets its own nav destination rather
      than overloading Expenses"), so it is its own page rather than a tab bolted onto
      `index.html`, consistent with how this codebase already separates e.g.
      `employees.html`/`employee.html` or `hire-profiles.html`/`hire-profile.html`.

  - description: |
      Create `public/css/approvals.css` with every page-specific class from the design's second
      `<style>` block that isn't already in `design-system/prototype-utils.css` (app shell,
      `.btn`, `.card`, `.input`, `.label`, `.modal-*`, `.toast` already live there and are not
      redefined): `.viewer-switcher`, `.shared-visibility-hint`, `.filter-row`/`.sort-control`/
      `.demo-field`/`.result-summary`, `.queue-table` + `.col-amount`/`.desc-cell`/
      `.employee-cell`/`.self-tag`, `.resubmission-tag`/`.resubmission-context`, `.limit-note`,
      `.status-chip` + `.is-approved`/`.is-rejected`/`.is-reimbursed`, `.decision-meta`/
      `.decision-note`, `.row-actions-cell`/`.row-actions`/`.self-note`/`.dash-cell`,
      `.empty-state`/`.error-state`/`.no-match-state`, `.skeleton-row`/`.skeleton-bar` +
      `@keyframes pulse` + `prefers-reduced-motion`, `.outcome-summary`/`.radio-option`/
      `.consequence-note`, `.field-error`/`.input-invalid`, `.btn[disabled]`. Carries over the
      design's own design-system-gap comment verbatim (no success/danger/warning tokens exist
      yet, so every state pairs an icon with a text label, never color alone).
    files:
      - public/css/approvals.css
    rationale: |
      Matches the established per-page pattern (`expenses.css`, `employees.css`, etc.) where
      shared primitives live once in `prototype-utils.css` and each page owns its own
      feature-specific rules in its own file.

  - description: |
      Wire real navigation between the two Expense-Tracker pages: change `public/index.html`'s
      nav `<a href="#" onclick="return false;">Employees</a>`-style placeholder for Approvals
      into a real link (`<a href="./approvals.html">Approvals</a>`), and give
      `public/approvals.html`'s Expenses nav item a real link back
      (`<a href="./index.html">Expenses</a>`). Leave both pages' "Employees" nav item as the
      existing inert placeholder (`href="#" onclick="return false;"`) — unchanged, since no
      Employees destination exists inside this sub-app (the real `employees.html` is a
      separately-branded "Workforce" app).
    files:
      - public/index.html
      - public/approvals.html
    rationale: |
      Mirrors the real cross-linking already used between e.g. `employee.html`↔`employees.html`
      and `hire-profile.html`↔`runs.html`, rather than leaving two co-equal screens of the same
      mini-app pointing at dead anchors.

  - description: |
      Implement the decision engine in `public/js/approvals.js`'s DOM wiring: row actions
      (`rowActionsHtml`) show Approve+Reject for a `submitted` row not belonging to the current
      viewer, "Reverse decision" for an `approved`/`rejected` row not belonging to the current
      viewer, a locked "Submitted by you" message (with the 🔒 icon, verbatim design copy) for
      any row — in any status except `reimbursed` — belonging to the current viewer, and a plain
      `—` dash cell with no buttons at all for any `reimbursed` row regardless of viewer. The
      shared modal (`openModal(mode, expenseId)`) renders: for `approve`, an optional note
      textarea; for `reject`, a required note textarea with inline `#decision-note-error`
      blocking until non-empty; for `reverse`, an `.outcome-summary` showing who/when decided it,
      a "Return to submitted" radio (always, checked by default) plus a "Reject instead" radio
      (only when currently `approved`), a note field whose required-ness and the
      `.consequence-note` visibility toggle with the selected radio, matching the design's
      `radio-option`/`consequence-note` wiring exactly. Confirming writes back to the shared
      `expenses` localStorage record: `approve` → `status: 'approved'`; `reject` → `status:
      'rejected'`; `reverse` to `submitted` → `status: 'submitted'`, decision action
      `reversed_to_submitted`; `reverse` to `rejected` → `status: 'rejected'`, decision action
      `reversed_to_rejected`, same mandatory-note rule and same
      `Reversing to "Rejected" notifies the employee the same way a direct rejection would.`
      consequence copy as a primary rejection. Every path calls `recordDecision(exp, action,
      currentApprover, note)` so actor+timestamp are always captured.
    files:
      - public/js/approvals.js
    rationale: |
      This is the literal shape of AC4-AC9 and AC13-AC14; matching the design's exact radio/
      consequence/validation wiring (rather than a simplified approximation) is what the
      prototype review already signed off on.

tests:
  - |
    AC1 — shared queue includes every employee's submissions plus a resubmission pair as
    ordinary rows, regardless of who's signed in:
    ```js
    const ids = () => Array.from(document.querySelectorAll('#queue-tbody tr[data-row-id]')).map(tr => tr.dataset.rowId);
    expect(ids()).toEqual(expect.arrayContaining(['exp_201','exp_202','exp_203','exp_204','exp_205','exp_206']));
    ```
  - |
    AC2 — filtering by employee and sorting by amount both apply to the original rejection
    (`exp_205`) and its resubmission (`exp_206`) the same as any other row:
    ```js
    const { filterQueue, sortQueue } = require('../public/js/approvals');
    const list = [{ id:'exp_205', employeeName:'Morgan Ellis', amount: 58.2 }, { id:'exp_206', employeeName:'Morgan Ellis', amount: 41 }, { id:'exp_202', employeeName:'Priya Shah', amount: 86.4 }];
    expect(filterQueue(list, { employee: 'Morgan Ellis' }).map(e => e.id)).toEqual(['exp_205','exp_206']);
    expect(sortQueue(list, 'amount', 'asc').map(e => e.id)).toEqual(['exp_206','exp_205','exp_202']);
    ```
  - |
    AC3 — a queued row displays employee, category, amount, date, and description directly:
    ```js
    const row = document.querySelector('tr[data-row-id="exp_201"]');
    expect(row.querySelector('.employee-cell').textContent).toMatch(/Morgan Ellis/);
    expect(row.querySelector('.chip').textContent).toBe('Travel');
    expect(row.querySelector('.col-amount').textContent).toBe('$412.75');
    expect(row.children[1].textContent).toBe('09/15/2026');
    expect(row.querySelector('.desc-cell').textContent).toMatch(/Flight to Denver/);
    ```
  - |
    AC4 — approving a submitted expense not owned by the viewer, with an optional note,
    transitions it to approved:
    ```js
    document.getElementById('viewer-select').value = 'Jordan Lee';
    document.querySelector('[data-action="approve"][data-id="exp_202"]').click();
    document.getElementById('modal-confirm-btn').click();
    jest.advanceTimersByTime(350);
    const stored = JSON.parse(localStorage.getItem('expenses')).find(e => e.id === 'exp_202');
    expect(stored.status).toBe('approved');
    ```
  - |
    AC5 — rejecting without a note is blocked:
    ```js
    document.querySelector('[data-action="reject"][data-id="exp_210"]').click();
    document.getElementById('modal-confirm-btn').click();
    expect(document.getElementById('decision-note-error').hidden).toBe(false);
    expect(JSON.parse(localStorage.getItem('expenses')).find(e => e.id === 'exp_210').status).toBe('submitted');
    ```
  - |
    AC6 — rejecting with a note transitions to rejected:
    ```js
    document.getElementById('decision-note').value = 'Missing itemized receipt.';
    document.getElementById('modal-confirm-btn').click();
    jest.advanceTimersByTime(350);
    expect(JSON.parse(localStorage.getItem('expenses')).find(e => e.id === 'exp_210').status).toBe('rejected');
    ```
  - |
    AC7 — viewing your own submitted expense hides approve/reject/reverse:
    ```js
    document.getElementById('viewer-select').value = 'Morgan Ellis';
    document.getElementById('viewer-select').dispatchEvent(new Event('change'));
    const row = document.querySelector('tr[data-row-id="exp_201"]');
    expect(row.querySelector('[data-action]')).toBeNull();
    expect(row.querySelector('.self-note').textContent).toMatch(/Submitted by you/);
    ```
  - |
    AC8 — reversing an approval back to submitted:
    ```js
    document.getElementById('viewer-select').value = 'Priya Shah';
    document.querySelector('[data-action="reverse"][data-id="exp_208"]').click();
    document.getElementById('modal-confirm-btn').click();
    jest.advanceTimersByTime(350);
    expect(JSON.parse(localStorage.getItem('expenses')).find(e => e.id === 'exp_208').status).toBe('submitted');
    ```
  - |
    AC9 — reversing an approval directly to rejected requires a note and carries the same
    consequence messaging as a primary rejection:
    ```js
    document.querySelector('[data-action="reverse"][data-id="exp_211"]').click();
    document.querySelector('input[name="reverse-target"][value="rejected"]').click();
    expect(document.getElementById('reverse-consequence').hidden).toBe(false);
    document.getElementById('modal-confirm-btn').click();
    expect(document.getElementById('decision-note-error').hidden).toBe(false);
    document.getElementById('decision-note').value = 'Reversing — duplicate of exp_207.';
    document.getElementById('modal-confirm-btn').click();
    jest.advanceTimersByTime(350);
    expect(JSON.parse(localStorage.getItem('expenses')).find(e => e.id === 'exp_211').status).toBe('rejected');
    ```
  - |
    AC10 — approving an over-the-limit category completes with no block or warning:
    ```js
    document.getElementById('viewer-select').value = 'Jordan Lee';
    document.querySelector('[data-action="approve"][data-id="exp_203"]').click();
    expect(document.querySelector('#modal-body [class*="block" i], #modal-body [class*="warning" i]')).toBeNull();
    document.getElementById('modal-confirm-btn').click();
    jest.advanceTimersByTime(350);
    expect(JSON.parse(localStorage.getItem('expenses')).find(e => e.id === 'exp_203').status).toBe('approved');
    ```
  - |
    AC11 — a reimbursed expense is never actionable, for any viewer:
    ```js
    ['Morgan Ellis','Priya Shah','Devon Ruiz','Jordan Lee'].forEach(name => {
      document.getElementById('viewer-select').value = name;
      document.getElementById('viewer-select').dispatchEvent(new Event('change'));
      const row = document.querySelector('tr[data-row-id="exp_209"]');
      expect(row.querySelector('[data-action]')).toBeNull();
      expect(row.querySelector('.dash-cell').textContent).toBe('—');
    });
    ```
  - |
    AC12 — a submitted expense shows both approve and reject actions:
    ```js
    const row = document.querySelector('tr[data-row-id="exp_204"]');
    expect(row.querySelector('[data-action="approve"]')).not.toBeNull();
    expect(row.querySelector('[data-action="reject"]')).not.toBeNull();
    ```
  - |
    AC13 — a decided, not-yet-reimbursed expense shows its outcome with reverse offered instead
    of approve/reject:
    ```js
    const row = document.querySelector('tr[data-row-id="exp_207"]');
    expect(row.querySelector('.status-chip.is-approved')).not.toBeNull();
    expect(row.querySelector('[data-action="reverse"]')).not.toBeNull();
    expect(row.querySelector('[data-action="approve"]')).toBeNull();
    ```
  - |
    AC14 — every decision records the acting user and a timestamp:
    ```js
    document.getElementById('viewer-select').value = 'Devon Ruiz';
    document.querySelector('[data-action="approve"][data-id="exp_204"]').click();
    document.getElementById('modal-confirm-btn').click();
    jest.advanceTimersByTime(350);
    const decision = JSON.parse(localStorage.getItem('expenses')).find(e => e.id === 'exp_204').decisions.slice(-1)[0];
    expect(decision).toMatchObject({ action: 'approved', actor: 'Devon Ruiz' });
    expect(() => new Date(decision.timestamp).toISOString()).not.toThrow();
    ```

assumptions_or_open_questions:
  - |
    The design's viewer-switcher lists 4 employees (adds "Jordan Lee" to the 3 already in
    `index.html`'s own `#viewer-select`). Per scope boundaries, this plan does not change
    `index.html`/`expenses.js`'s existing 3-person list (that would touch an already-tested,
    unrelated page) — `approvals.html` owns its own 4-person list as the approved design shows.
    This means an expense "logged by Jordan Lee" can only ever originate from the queue's own
    seed fixture, never from the live create-expense form, until/unless a future story
    reconciles the two employee lists.
  - |
    `resubmissionOf` is read-only in this plan: the queue renders the resubmission tag and
    "previous attempt" context box when a record already carries that field (as the seed
    fixture's `exp_206` does), but no UI in this story (or the existing create-expense flow)
    lets an approver or employee set it on a new submission. Treated as out of scope since no
    AC asks for a resubmission-authoring control.
  - |
    `categoryOverLimit`/`limitNote` are treated as optional, pass-through fields on an expense
    record for informational display only (per the story's explicit exclusion of spend-limit
    computation itself, which belongs to the Categories & Budgets epic). This plan does not
    compute or validate any limit; it only guarantees the approve action never blocks or warns
    when they're present, and renders the `.limit-note` hint if given.
  - |
    No AC specifies pagination or a row count ceiling for the queue; given the small fixture
    (11 records) and this being a prototype-scale app with no backend, the full shared list is
    rendered in one unpaginated table, matching the design.
  - |
    The design's `#filter-status` ("Status" filter: Needs review / Decided, not yet reimbursed /
    Reimbursed) is explicitly called out in the design's own comments as a bonus beyond the four
    required filter/sort dimensions (employee, date, amount, category). It's implemented as
    shown since the approved design includes it, but no test treats it as AC-required.

package_dependencies: []

notes: |
  This codebase splits cleanly into two architectures: employees/hires/rooms/runs/leave/guests
  have real Express routes + in-memory stores under `src/`, while the "Expense Tracker" mini-app
  (`public/index.html` + `public/js/expenses.js`) is entirely client-side against
  `localStorage`, with no `src/expenses` directory and no server route mounted for it in
  `src/server.js`. This story stays inside that same client-only architecture rather than
  introducing a new backend module, since it's extending that exact sub-app.

  ```mermaid
  flowchart TD
    LS[("localStorage: 'expenses' key")]
    EXP[public/js/expenses.js existing, untouched]
    IDX[public/index.html existing, nav edited]
    APR[public/js/approvals.js NEW]
    APRHTML[public/approvals.html NEW]
    APRCSS[public/css/approvals.css NEW]
    UTILS[public/js/utils.js existing, reused]

    IDX -->|loads| EXP
    EXP -->|loadExpenses / persistExpenses, no status field| LS
    APRHTML -->|loads| APR
    APRHTML -->|loads first| UTILS
    APR -->|require| UTILS
    APR -->|loadQueueExpenses / persist, normalizes status+decisions, additive seed| LS
    IDX -.->|nav link added: Approvals| APRHTML
    APRHTML -.->|nav link added: Expenses| IDX

    classDef touched fill:#f96,color:#000
    class APR,APRHTML,APRCSS,IDX touched
  ```

review_focus: |
  In scope: the new `approvals.html`/`approvals.js`/`approvals.css` page and the decision engine
  (approve/reject/reverse with note validation and audit trail) operating on the shared
  `expenses` localStorage record, plus the two small nav edits. Out of scope: any change to
  `public/js/expenses.js`'s own fixture, categories, or the Expenses page's 3-person viewer list;
  any real spend-limit computation (Categories & Budgets epic); any resubmission-authoring UI.
  The riskiest area is the reverse-decision modal's conditional note-requirement (optional when
  reversing to "submitted", mandatory and consequence-flagged when reversing straight to
  "rejected") — easy to get backwards or to apply the mandatory-note rule to the wrong radio
  state. A reviewer should also confirm the self-submission guard checks `employeeName` (i.e.
  who *submitted* the expense) and not who last *decided* it, since those can differ once an
  expense has been reversed and re-decided by someone else.
