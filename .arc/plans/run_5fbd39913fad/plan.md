summary: |
  Builds Leave Type & Balance Setup as a new "Leave Admin" capability area: a fixed set of
  three leave types (annual, sick, unpaid) that every employee can request against, and a
  per-employee starting balance per type that is recorded once onboarding is complete (and
  cannot exist before then). The backend gates balance initialization and lookup on the
  employee already existing in Employee Records (`src/employees/store.js`), since the parent
  epic defines "completed onboarding" as "exist in Employee Records" and the codebase's
  existing `completeRun` (src/runs/store.js) is the only thing that ever creates an Employee
  Records entry. Three real pages are built from the approved prototype
  (`.arc/designs/TEST-M1-STORY-173-design.html`): Leave Types (reference), Employee Balances
  (set/adjust), and Balance Lookup (read-only, embeddable in a future request/approval view).
  No accrual, carryover, expiry, or custom-type management is implemented, matching the
  story's scope statement. The story's own BLOCKER — who may set/adjust balances (HR only,
  vs. HR + Manager) — is unresolved by the product owner, so this plan deliberately does not
  add any role/permission enforcement to the balance-mutation endpoint or page; this is
  flagged prominently below rather than guessed at.
scope:
  - description: |
      Add a `GET /employees` list endpoint. `src/employees/store.js` currently only exposes
      `createEmployee`/`getEmployee` (no way to enumerate records), but both the Employee
      Balances page (to list whom to set/adjust balances for) and the Balance Lookup page (to
      pick an employee to view) need to enumerate everyone who exists in Employee Records.
      Add `listEmployees()` to the store and `router.get('/', ...)` to the routes, mirroring
      the existing `GET /hires` (list) + `GET /hires/:id` (single) pairing already used in
      `src/hires/routes.js`.
    files:
      - src/employees/store.js
      - src/employees/routes.js
      - test/employees.test.js
    rationale: |
      Minimal supporting infrastructure required to make AC2/AC4 usable from a real UI; not
      speculative, since without it the Employee Balances/Lookup pages would have no way to
      discover which employees exist.
  - description: |
      New `src/leave/store.js` + `src/leave/routes.js`, mounted at `/leave` in `src/server.js`.

      `LEAVE_TYPES` is a fixed, hard-coded array (no add/edit/delete — scope says "a small
      fixed set"), copied from the design's fixture at lines 633-637 of the design file:
      `{ id: 'annual', name: 'Annual leave', description: 'Planned time off — vacations,
      personal days, and other pre-scheduled time away.', defaultBalance: 15 }`,
      `{ id: 'sick', ..., defaultBalance: 10 }`, `{ id: 'unpaid', ..., defaultBalance: 5 }`.

      `GET /leave/types` returns this array unchanged (AC1).

      `POST /leave/balances/:employeeId` upserts a starting balance (serves both the design's
      "Set starting balances" and "Adjust balances" actions, which are the same form/modal
      pre-filled differently — see design lines 1170-1190). Signature:
      `function initializeBalances(employeeId, values = {})`. It calls `getEmployee(employeeId)`
      from `src/employees/store.js`; if that returns undefined the employee has not completed
      onboarding and it throws `new LeaveBalanceError('employee not found or has not completed
      onboarding', 404)` (AC3). Each of the three leave types is validated independently: a
      missing value defaults to that type's `defaultBalance` (matching the design's pre-fill
      behavior at line 1179); a supplied value must be a non-negative number or it throws
      `new LeaveBalanceError('enter a starting balance of 0 or more for <typeId>', 400)`,
      matching the inline validation message at design line 1209 ("Enter a starting balance of
      0 or more."). On success it stores
      `{ employeeId, balances: { annual, sick, unpaid }, setAt: <ISO date>, created: <bool> }`
      and returns it (`created` distinguishes first-time "set" from "adjust", mirroring the
      design's two different toast messages at lines 1251).

      `GET /leave/balances/:employeeId` returns 404 (no body beyond an error message) if the
      employee doesn't exist in Employee Records OR exists but has no balance recorded yet —
      both cases mean "no starting balance exists for them" per AC3 — otherwise 200 with the
      stored record (AC4).
    files:
      - src/leave/store.js
      - src/leave/routes.js
      - src/server.js
      - test/leave.test.js
    rationale: |
      This is the core of all four acceptance criteria at the API level: AC1 (fixed types
      list), AC2 (initializing records a balance per type once onboarding is complete), AC3
      (no balance before/without onboarding), AC4 (current balance per type retrievable for a
      request/approval view to embed).
  - description: |
      New page `public/leave-types.html` + `public/css/leave-types.css` +
      `public/js/leave-types.js`, built from the design's "Leave Types" screen (design lines
      676-708): an `app-topbar`/`app-nav` shell (Leave Types / Employee Balances / Balance
      Lookup links, matching the existing shell pattern already used by
      `public/hire-profiles.html`), a `.leave-type-grid` of `.card.leave-type-card` elements
      each showing a `.chip.fixed-chip` labelled "Fixed — not configurable", the type name,
      description, and `.default-balance` ("Default starting balance: <n> days" per design
      line 1018), plus the static "Preview — requesting time off" `<select id="preview-leave-type">`
      (disabled) listing the same three types (design lines 695-706) — grounding AC1's
      "available leave types are listed for an employee" in a concrete, employee-facing
      moment. No add/edit/delete control exists anywhere on this page, consistent with the
      design's own note that this is how AC1 is satisfied. `initLeaveTypesApp(doc, api)` fetches
      via `api.list()` (`GET /leave/types`) and renders the grid; `createLeaveTypesApi()` is the
      default fetch-backed implementation, following the same `createDefaultApi()` /
      dependency-injection pattern already used in `public/js/hire-profiles.js` and
      `public/js/guest-profiles.js`.
    files:
      - public/leave-types.html
      - public/css/leave-types.css
      - public/js/leave-types.js
      - test/leave-types-ui.test.js
    rationale: |
      Builds the approved design's reference screen for AC1 as a real page wired to the new
      `GET /leave/types` endpoint, reusing the repo's established fetch+DI pattern rather than
      the design prototype's own localStorage/fixture scaffolding.
  - description: |
      New page `public/leave-balances.html` + `public/css/leave-balances.css` +
      `public/js/leave-balances.js`, built from the design's "Employee Balances" screen (design
      lines 743-794). Includes the same `app-topbar`/`app-nav` shell, the `.decision-banner`
      exactly as designed (design lines 758-765: "Open decision — not yet settled by the
      product owner" / "Who may set or adjust balances: HR only, or HR and Managers?") kept as
      permanent, real page content (not demo chrome) since the decision is genuinely still
      open, a list of `.emp-row` cards per employee returned by `GET /employees` showing name,
      a `.bal-chip` per leave type once set, and a "Set starting balances"/"Adjust balances"
      button (design lines 1141-1152) that opens the modal at design lines 897-939 (same
      `#field-annual`/`#field-sick`/`#field-unpaid` number inputs, `step="0.5" min="0"`,
      per-field `.field-error` on invalid input, `.modal-actions` Cancel/Save). Submitting
      calls `api.saveBalances(employeeId, values)` (`POST /leave/balances/:employeeId`); a
      successful response updates that row's chips and shows the design's toast copy ("Starting
      balances set for <name>." / "...updated for <name>." depending on `created`). The
      design's "Demo controls" block (role switcher, "Permission model (open decision)"
      toggle, "Simulate load/save failure" checkboxes — explicitly labelled demo-only in the
      design's own code comments at lines 356-367 and 715-721) is NOT built; the loading
      skeleton, error state with "Try again", and empty state it previews ARE built, but driven
      by real fetch outcomes rather than a manual toggle.

      Per this story's BLOCKER, no role/permission check gates who can click "Set/Adjust
      balances" — every viewer of this page can act, since picking HR-only vs. HR+Manager now
      would presuppose an undecided product answer (see assumptions below).

      Architecture note: this roster is populated only from `GET /employees` (Employee
      Records). Employees still mid-onboarding have no Employee Records entry at all (see
      `src/runs/store.js` `completeRun`) and are not merged in from `src/hires/store.js` — see
      the design-vs-code conflict called out in `assumptions_or_open_questions`.
    files:
      - public/leave-balances.html
      - public/css/leave-balances.css
      - public/js/leave-balances.js
      - test/leave-balances-ui.test.js
    rationale: |
      Builds the approved design's interactive set/adjust screen for AC2, wired to the real
      `GET /employees` and `POST /leave/balances/:employeeId` endpoints, while being explicit
      that the permission question the design itself flags as open is left open here too.
  - description: |
      New page `public/leave-lookup.html` + `public/css/leave-lookup.css` +
      `public/js/leave-lookup.js`, built from the design's "Balance Lookup" screen (design
      lines 809-848): an employee picker (`GET /employees`), and a read-only `.card.lookup-card`
      showing one `.lookup-item` per leave type (`.type-name` / `.type-amount`, e.g. "Annual
      leave" / "15 days", design lines 1314-1325) plus the "Starting balance set <date>. No
      accrual, carryover, or expiry is tracked in this story." meta line. When the selected
      employee has no Employee Records entry or no balance yet, shows the `.empty-state` "No
      starting balance yet" message (design lines 1304-1312) instead of numbers — this is the
      same AC3 guarantee as the Employee Balances page, demonstrated from a second,
      independent screen, and is also the concrete "current balance per leave type ... shown"
      view that AC4 describes as embeddable in a future request/approval screen. The design's
      role-based picker-locking ("Signed in as" restricting an Employee to their own record) is
      out of scope here for the same BLOCKER-adjacent reason as the Balances page: there is no
      settled notion yet of which real-world "employee" role maps to a session in this app, so
      the picker lists everyone from Employee Records and is not role-restricted.
    files:
      - public/leave-lookup.html
      - public/css/leave-lookup.css
      - public/js/leave-lookup.js
      - test/leave-lookup-ui.test.js
    rationale: |
      Builds the approved design's read-only lookup screen, satisfying AC4 (and re-proving
      AC3) with a real fetch-backed implementation.
tests:
  - |
    AC1 (backend): GET /leave/types returns the fixed set of three leave types in order.
      const res = await request(app).get('/leave/types');
      expect(res.status).toBe(200);
      expect(res.body.map((t) => t.id)).toEqual(['annual', 'sick', 'unpaid']);
  - |
    AC1 (frontend): the Leave Types page renders all three fixed types with no management
    control.
      const cards = document.querySelectorAll('.leave-type-card');
      expect(cards).toHaveLength(3);
      expect(document.querySelector('[id*="add-type" i], [id*="manage-type" i]')).toBeNull();
  - |
    AC2 (backend): POST /leave/balances/:employeeId records a starting balance for each leave
    type once onboarding is complete (employee exists in Employee Records).
      const employeeId = (await request(app).post('/employees').send({ name: 'Priya Shah', email: 'priya@example.com', jobTitle: 'People Ops' })).body.id;
      const res = await request(app).post(`/leave/balances/${employeeId}`).send({ annual: 15, sick: 10, unpaid: 5 });
      expect(res.status).toBe(200);
      expect(res.body.balances).toEqual({ annual: 15, sick: 10, unpaid: 5 });
      expect(res.body.created).toBe(true);
  - |
    AC2 (backend): omitting values defaults each type to its default starting balance.
      const res = await request(app).post(`/leave/balances/${employeeId}`).send({});
      expect(res.body.balances).toEqual({ annual: 15, sick: 10, unpaid: 5 });
  - |
    AC2 (frontend): submitting the "Set starting balances" form for an onboarded employee with
    no balance yet calls saveBalances with all three typed values.
      document.querySelector('[data-set-balances-id="emp_1"]').click();
      document.getElementById('field-annual').value = '15';
      document.getElementById('field-sick').value = '10';
      document.getElementById('field-unpaid').value = '5';
      document.getElementById('balances-form').dispatchEvent(new Event('submit', { cancelable: true }));
      expect(api.saveBalances).toHaveBeenCalledWith('emp_1', { annual: 15, sick: 10, unpaid: 5 });
  - |
    AC2 (frontend): a negative entry blocks save with an inline error and no API call.
      document.getElementById('field-annual').value = '-1';
      document.getElementById('balances-form').dispatchEvent(new Event('submit', { cancelable: true }));
      expect(document.getElementById('error-annual').hidden).toBe(false);
      expect(api.saveBalances).not.toHaveBeenCalled();
  - |
    AC3 (backend): querying or initializing balances for an id that has not completed
    onboarding (no Employee Records entry) finds nothing / is rejected.
      const getRes = await request(app).get('/leave/balances/not-a-real-employee-id');
      expect(getRes.status).toBe(404);
      const postRes = await request(app).post('/leave/balances/not-a-real-employee-id').send({});
      expect(postRes.status).toBe(404);
  - |
    AC3 (frontend): the Balance Lookup page shows "No starting balance yet" when the selected
    employee has no recorded balance.
      expect(document.querySelector('.empty-state h3').textContent).toBe('No starting balance yet');
  - |
    AC4 (backend): GET /leave/balances/:employeeId returns the current balance per leave type
    for an already-set employee, as a request/approval view would embed.
      const res = await request(app).get(`/leave/balances/${employeeId}`);
      expect(res.status).toBe(200);
      expect(res.body.balances).toEqual({ annual: 20, sick: 10, unpaid: 5 });
  - |
    AC4 (frontend): the Balance Lookup page renders one lookup-item amount per leave type for
    the selected employee.
      const amounts = Array.from(document.querySelectorAll('.lookup-item .type-amount')).map((e) => e.textContent);
      expect(amounts).toEqual(['15 days', '10 days', '5 days']);
  - |
    Supporting infra: GET /employees lists every employee record created so far (required for
    the Balances/Lookup pages to enumerate whom to show).
      const created = (await request(app).post('/employees').send({ name: 'List Test', email: 'list@example.com', jobTitle: 'QA' })).body;
      const res = await request(app).get('/employees');
      expect(res.status).toBe(200);
      expect(res.body.some((e) => e.id === created.id)).toBe(true);
  - |
    Re-adjusting an already-set employee's balance upserts in place rather than creating a
    second record, and reports created: false.
      await request(app).post(`/leave/balances/${employeeId}`).send({ annual: 15, sick: 10, unpaid: 5 });
      const res = await request(app).post(`/leave/balances/${employeeId}`).send({ annual: 18, sick: 10, unpaid: 5 });
      expect(res.body.created).toBe(false);
      expect(res.body.balances.annual).toBe(18);
assumptions_or_open_questions:
  - |
    BLOCKER (carried over verbatim from the story and the design's own "Open decision" banner):
    who may set or adjust balances — HR only, or HR and Managers — is not yet decided by the
    product owner. This plan deliberately implements NO role/permission check on
    `POST /leave/balances/:employeeId` or on the "Set/Adjust balances" button, because
    enforcing either answer now would silently resolve a decision the story explicitly says
    "must be settled before the story is scheduled for build." The `.decision-banner` from the
    design is kept as real, permanent page content (not demo chrome) so the open question stays
    visible in the shipped product. Once decided, add a middleware check (e.g. extending the
    existing `enforceOnboardingRole` pattern in `src/runs/auth.js`, or a narrower HR-only
    variant) to the write route and to the page's edit affordance as a follow-up change — not
    bundled into this plan.
  - |
    Design-vs-code model conflict: the design's "Employee Balances" fixture models one unified
    "employee" entity carrying both `onboardingStatus` (including mid-onboarding states) and
    `balances`, and shows mid-onboarding people as disabled rows to visually re-demonstrate AC3.
    The real codebase splits this across two stores with no stored link between them: hires
    (`src/hires/store.js`, pre/mid-onboarding, `onboardingStatus` field) and Employee Records
    (`src/employees/store.js`, created only by `completeRun` in `src/runs/store.js` once
    onboarding fully completes) — a hire never records the id of the employee it becomes. The
    parent epic itself says this story "does not cover hires still mid-onboarding." This plan
    resolves the conflict by building the Employee Balances/Lookup rosters only from
    `GET /employees` (Employee Records): people still mid-onboarding never appear in either
    roster at all (no disabled-row treatment), and AC3 is instead proven at the API level
    (querying/initializing a non-Employee-Records id returns 404) plus via the Lookup page's
    empty state for an onboarded employee with no balance recorded yet. Flagging this explicitly
    rather than silently picking one reading.
  - |
    AC1's "available leave types are listed for an employee" is read as "the one global fixed
    list every employee can request against," not a per-employee-filtered list — the scope
    statement describes "a small fixed set" with no mention of per-employee variation, and the
    design has no employee-selection control on its Leave Types screen.
  - |
    `POST /leave/balances/:employeeId` is a single upsert endpoint serving both the design's
    "Set starting balances" and "Adjust balances" actions (same form, pre-filled with defaults
    vs. current values), rather than two separate endpoints, since the design treats them as
    one form with two labels.
  - |
    The design's "Demo controls" affordances (role switcher, "Permission model (open decision)"
    toggle, "Simulate load/save failure" checkboxes) are explicitly labelled demo-only in the
    design file's own comments and are excluded from the production build; the loading/error/
    empty states they preview are still built, just driven by real fetch outcomes.
package_dependencies: []
notes: |
  Data-flow for the touched/added modules (orange = touched or new in this plan):

  ```mermaid
  flowchart TD
    server[src/server.js] --> leaveRoutes[src/leave/routes.js]
    server --> employeesRoutes[src/employees/routes.js]
    leaveRoutes --> leaveStore[src/leave/store.js]
    leaveStore -->|getEmployee: gates on onboarding-complete| employeesStore[src/employees/store.js]
    employeesRoutes --> employeesStore
    leaveTypesPage[public/js/leave-types.js] -->|GET /leave/types| leaveRoutes
    leaveBalancesPage[public/js/leave-balances.js] -->|GET /employees| employeesRoutes
    leaveBalancesPage -->|GET + POST /leave/balances/:id| leaveRoutes
    lookupPage[public/js/leave-lookup.js] -->|GET /employees| employeesRoutes
    lookupPage -->|GET /leave/balances/:id| leaveRoutes

    classDef touched fill:#f96,color:#000
    class server,leaveRoutes,leaveStore,employeesRoutes,employeesStore,leaveTypesPage,leaveBalancesPage,lookupPage touched
  ```

  `src/runs/store.js`'s `completeRun` (unchanged by this plan) is the sole existing creator of
  Employee Records entries, which is why `src/leave/store.js` depends on `getEmployee` from
  `src/employees/store.js` as its one, already-correct signal for "has completed onboarding."
review_focus: |
  In scope: the fixed leave-types list, balance initialization/adjustment gated on Employee
  Records existence, and balance lookup — all at both an API layer (`src/leave/*`) and three
  real pages built from the approved design. Explicitly OUT of scope and not a bug: (1) no
  role/permission enforcement on who can set/adjust a balance — this is the story's own stated
  BLOCKER and is left open on purpose, with the design's decision-banner kept as real UI to
  make that visible; (2) no merging of mid-onboarding hires into the Balances/Lookup rosters —
  the real codebase has no stored link from a hire to the Employee Records entry it becomes, so
  this plan scopes those rosters to Employee Records only and proves AC3 via direct API calls
  instead of a visual disabled-row state. Riskiest area: the upsert semantics of
  `POST /leave/balances/:employeeId` (first-set vs. adjust via the `created` flag, and the
  0-is-valid/negative-is-invalid boundary, matching the design's `min="0"` inputs) — a reviewer
  should check the boundary test at exactly 0 passes and that re-adjusting never creates a
  second record for the same employee.
