summary: |
  Add tenant- and relationship-scoped role-based access control over hire profiles (HR admin /
  manager / new hire) across both the `/hires` API and a new set of pages that implement the
  already-approved TEST-M1-STORY-054 prototype (Hire List, Profile Detail, Audit Log). Today
  `GET /hires` and `GET /hires/:id` are unauthenticated and return every record to anyone, and
  there is no tenant concept, no per-profile view scoping, and no tenant-level audit trail. This
  plan adds a `tenant` field to hire records, a per-request actor (role + name + own-hire-id +
  tenant) resolved from headers, scoping logic (HR sees the whole tenant, a manager sees only
  hires whose `hiringManager` is them, a new hire sees only their own record), a 403 with a
  specific denial reason for anything out of scope, and a tenant-scoped audit log that records
  every view attempt (allowed or denied) plus every edit/deactivate/reactivate. On the frontend it
  adds three new pages (`hire-directory`, `hire-access`, `audit-log`) that reproduce the approved
  prototype's Hire List, Profile Detail, and Audit Log screens, following this codebase's existing
  list/detail-page-pair convention (query-string navigation, `x-staff-role` header) rather than the
  prototype's single-file hash router, which is prototyping-only scaffolding.

scope:
  - description: |
      Give every hire record a `tenant` field so "within the tenant" (AC1-3, AC9-11) is
      meaningful. `createHire` already spreads `...data` into the stored record, so this only
      needs a default when the caller doesn't supply one (every existing caller/test), plus the
      same default on the pre-seeded `hire_2031` record so it behaves like every other hire.
    files:
      - src/hires/store.js
    rationale: |
      The design's own data-model note confirms "the codebase has no multi-tenant concept yet"
      and introduces a second tenant ("Globex Corp") purely to exercise AC9's cross-tenant denial.
      Without a `tenant` field there is nothing for the new scoping logic in `src/hires/auth.js`
      to compare against.
  - description: |
      New `src/hires/auth.js`: `resolveHireActor` middleware reads `x-staff-role`
      (`hr`/`manager`/`new_hire`), `x-staff-name`, `x-hire-id`, and `x-tenant` (default
      `'Acme Corp'` when absent) into `req.hireActor = { role, name, hireId, tenant }`; 401 when
      `x-staff-role` is missing, 403 when it isn't one of the three values. Also exports
      `canViewHire(actor, hire)` returning `{ allowed, reason }` (reasons: `cross_tenant`,
      `not_direct_report`, `not_own_profile`, `not_found`), `visibleHiresForActor(actor, hires)`,
      and `ROLE_LABELS` (`hr` -> `'HR Admin'`, `manager` -> `'Manager'`, `new_hire` -> `'New hire'`)
      for audit-log display text.
    files:
      - src/hires/auth.js
    rationale: |
      Mirrors the prototype's `canView`/`visibleHiresFor`/`roleLabel` functions (design script,
      lines ~1092-1131) one-for-one, translated into request-scoped middleware. Kept as a new
      file scoped to `/hires` (rather than editing the shared `src/runs/auth.js` used by
      employees/guests/rooms) because `new_hire` is a role those other domains don't have and
      `enforceOnboardingRole`'s 2-value role set would otherwise need to grow for everyone.
  - description: |
      New `src/hires/auditLog.js`: an in-memory, append-only, tenant-tagged audit trail.
      `recordAuditEntry({ tenant, actorName, actorRole, action, targetId, targetName, result, detail })`
      pushes `{ id, at, ...fields }` (id via `crypto.randomUUID()`, `at` via `new Date().toISOString()`)
      to the front of the list; `listAuditLogForTenant(tenant)` returns only that tenant's entries,
      newest first.
    files:
      - src/hires/auditLog.js
    rationale: |
      AC11 requires every profile CRUD action *and* access decision to be logged "at the tenant
      level" — i.e. a trail independent of any single hire record, matching the design's separate
      "Audit log" screen/table (design lines ~609-616, ~1133-1170), not the pre-existing
      per-hire `hire.auditLog` field that `appendOnboardingAuditEntry` writes to (that one is
      onboarding-task history, a different concern, and stays untouched).
  - description: |
      Wire the above into `src/hires/routes.js`:
        * `router.get('/', resolveHireActor, ...)` now returns `visibleHiresForActor(req.hireActor, listHires())`
          instead of the full unfiltered list.
        * `router.get('/:id', resolveHireActor, ...)` runs `canViewHire`, calls
          `recordAuditEntry` with `action: access.allowed ? 'Viewed profile' : 'Attempted to view profile'`
          and `result: access.allowed ? 'allowed' : 'denied'` for every id that actually resolves to a
          record, then returns `200` + the hire when allowed, or `403 { error: 'forbidden', reason }`
          when denied for an existing-but-out-of-scope record, or `404 { error: 'hire not found' }`
          only when the id doesn't exist at all (no audit entry — there is no profile to attribute
          it to).
        * New `router.get('/audit-log', resolveHireActor, ...)`, registered **before** `/:id` (an
          Express ordering requirement — otherwise `/audit-log` is captured as `:id`), 403s unless
          `req.hireActor.role === 'hr'`, then returns `listAuditLogForTenant(req.hireActor.tenant)`.
        * `router.patch('/:id', ...)`, `router.post('/:id/deactivate', ...)`, and
          `router.post('/:id/reactivate', ...)` keep `enforceOnboardingRole` (hr/manager, unchanged —
          see the `notes` conflict writeup) but add a tenant check ahead of the existing logic: if
          `hire.tenant !== req.hireActor.tenant`, respond `403 { error: 'forbidden', reason: 'cross_tenant' }`
          and record a denied audit entry, without calling `updateHire`/`deactivateHire`/`reactivateHire`.
          This means these three routes now need `resolveHireActor` run alongside
          `enforceOnboardingRole` to get `req.hireActor.tenant`.
        * `router.post('/', ...)` (create) keeps `enforceOnboardingRole` unchanged, plus one new
          guard: `if (req.hireActor.role === 'new_hire') return res.status(403).json({ error: 'forbidden' })`
          — a new hire shouldn't be able to create profiles; nothing in this story's ACs covers
          creation otherwise, so it is intentionally left alone beyond this.
    files:
      - src/hires/routes.js
    rationale: |
      This is the enforcement point for AC1, AC4-AC11. Edit/deactivate/reactivate deliberately
      keep their existing hr-or-manager gate rather than narrowing to hr-only — see the `notes`
      section for why, since the approved design's access matrix disagrees with this and the
      reviewer should see the tradeoff explicitly.
  - description: |
      Two existing `GET /hires/:id` calls in `test/hires.test.js` currently send no
      `x-staff-role` header and expect `200`/`404`. Once `GET /:id` requires an actor (see above),
      an unauthenticated call now gets `401`. Add `.set('x-staff-role', 'hr')` to both calls so
      they keep testing what they already test (hire retrieval shape, 404-for-unknown-id) rather
      than incidentally re-testing "missing header returns 401" (already covered elsewhere).
    files:
      - test/hires.test.js
    rationale: |
      `src/employees/routes.js` already requires `enforceOnboardingRole` on `GET /` and `GET /:id`
      — this brings `/hires` in line with that existing precedent rather than introducing a new
      one, and the two-line test change preserves each test's original intent.
  - description: |
      New `test/hires-access-control.test.js` — backend RBAC coverage for AC1, AC4-AC10 (see
      `tests` below for the concrete assertions).
    files:
      - test/hires-access-control.test.js
    rationale: ""
  - description: |
      New `test/hires-audit-log.test.js` — AC2, AC3, AC11 coverage: every view/edit/deactivate/
      reactivate attempt (allowed or denied) is recorded, `GET /hires/audit-log` is hr-only and
      tenant-scoped.
    files:
      - test/hires-audit-log.test.js
    rationale: ""
  - description: |
      New `public/hire-directory.html` + `public/css/hire-directory.css` — the approved design's
      "Hire List" screen (design lines 650-737), adapted to this codebase's static multi-page
      convention instead of the prototype's single-file hash router:
        * `.app-topbar` with `.tenant-badge` and an actor-switcher `<select id="actor-select">`
          listing the same five fixture actors as the design (`Priya Shah — HR Admin`,
          `Dana Brooks/Marcus Chen/Elena Vance — Manager`, `Jordan Reyes — New hire (self)`),
          matching the existing `role-select` convention already used on `hire-profile.html` /
          `employee.html`, extended with per-actor name/tenant/self-hire-id since this screen
          needs more than a bare role string.
        * `.scope-note` (shown only for managers: "Showing only `<name>`'s current direct reports
          within `<tenant>`."), a `.restricted-card` for the new-hire actor (lock icon + "View my
          profile" button, no roster at all — design lines 684-688), and for HR/manager a
          `.filter-bar` with a status `<select id="status-filter">` (all/active/deactivated) above
          a `table.directory-table` with Name / Department-Role / Hiring manager / Stage /
          Profile status columns (design lines 700-729), using `.status-chip--active` /
          `.status-chip--deactivated` and the manager empty state copy "You don't have any direct
          reports yet." (design line 1226) when the actor has zero visible hires.
      Deliberately NOT built: the prototype's "Reset demo data" / "Simulate load error" / "Retry"
      buttons and the "Try an out-of-scope profile" `.boundary-demo` box — these are
      reviewer-facing demo aids for a backend-less static prototype; the real app already lets
      anyone reach an out-of-scope profile for real (by clicking a row they can see, or via a
      deep link), which is what AC9/AC10 are actually tested against.
    files:
      - public/hire-directory.html
      - public/css/hire-directory.css
    rationale: |
      Satisfies AC4 (manager sees only direct reports), AC5 (empty state), and the new-hire
      "no roster" branch that AC8 implies (design line 641: "Jordan Reyes (new hire) has no list
      at all").
  - description: |
      New `public/js/hire-directory.js`: `initHireDirectoryApp(doc, actor, hires)` renders the
      scope-note/restricted-card/table/empty-state described above from an already-fetched hire
      list (filtering is server-side via `visibleHiresForActor`, so this just renders what it's
      given) and wires each row's name button to
      `window.location.href = 'hire-access.html?id=' + encodeURIComponent(id)` — following the
      exact `employees.html` -> `employee.html?employeeId=...` / `runs.html` ->
      `run-detail.html?runId=...` pattern already in this codebase (`public/js/employees.js:177`,
      `public/js/runs.js:53`) rather than the prototype's `location.hash = 'profile/' + id`.
      A `createDefaultApi(getActor)` builds the `fetch('/hires', { headers: { 'x-staff-role':
      getActor().role, 'x-staff-name': getActor().name, 'x-hire-id': getActor().hireId,
      'x-tenant': getActor().tenant } })` call and a `DOMContentLoaded` bootstrapper re-fetches
      and re-renders whenever the actor-switcher changes, so switching "Signed in as" re-evaluates
      the list live like the prototype does.
    files:
      - public/js/hire-directory.js
    rationale: ""
  - description: |
      New `test/hire-directory-ui.test.js` (jsdom) — see `tests` below.
    files:
      - test/hire-directory-ui.test.js
    rationale: ""
  - description: |
      New `public/hire-access.html` + `public/css/hire-access.css` — the approved design's
      "Profile Detail" screen (design lines 757-909):
        * `.back-link` ("← Back to hire profiles"), a denied state
          (`.notice--deny` with `#denied-title`, `#denied-reason`, and the fixed line "This
          attempt has been logged to `<tenant>`'s audit trail. If you believe this is a mistake,
          contact your HR admin." — design lines 783-792) and a viewable state
          (`.profile-header` with name/status chip/Edit+Deactivate buttons, a `.kv-list`,
          design lines 795-817).
        * Two field sets per design's `renderProfileInternal` vs `renderProfileSelf`
          (lines 1312-1352): HR/manager viewers get Hire ID / Email / Phone / Department /
          Role / Start date / Hiring manager / Pipeline stage / Onboarding status; a new hire
          viewing their own profile gets Email / Phone / Department / Role / Start date /
          "Your hiring manager" / Onboarding status (no Hire ID, no Pipeline stage).
        * `.readonly-note` shown only when a manager is viewing one of their direct reports
          (design line 813-816 text, verbatim).
        * The Edit modal (`#edit-form`: name/email/phone/department/role/start-date/
          hiring-manager `<select>`, plus a read-only "Pipeline stage" line noting it's managed
          elsewhere — design lines 820-883) and the Deactivate/Reactivate confirm modal
          (design lines 885-909), both hidden entirely unless the viewer can mutate (HR, per
          the existing `enforceOnboardingRole` gate — see `notes`).
    files:
      - public/hire-access.html
      - public/css/hire-access.css
    rationale: |
      Satisfies AC1 (HR full view), AC2/AC3 (edit/deactivate UI), AC8 (new-hire self view), AC9/
      AC10 (denied state with a specific, displayed reason).
  - description: |
      New `public/js/hire-access.js`: `initHireAccessApp(doc, actor, result)` where `result` is
      either `{ allowed: true, hire }` or `{ allowed: false, reason }` from
      `GET /hires/:id`. Denial-reason-to-copy mapping mirrors the design's `denialText()`
      (design lines 1123-1131) exactly:
      `{ cross_tenant: "This profile belongs to a different tenant and isn't accessible from <tenant>.",
      not_direct_report: "This profile isn't one of your direct reports, so you don't have
      permission to view it.", not_own_profile: 'You can only view your own profile.' }`.
      Edit-modal submit does `PATCH /hires/:id`; Deactivate/Reactivate submit does
      `POST /hires/:id/deactivate` or `/reactivate`; both re-render from the response and show a
      toast ("Profile updated" / "Profile deactivated" / "Profile reactivated"), matching the
      design's toast copy. `window.location.search` is read via
      `new URLSearchParams(window.location.search).get('id')`, matching
      `public/js/employee.js:151` / `public/js/run-detail.js:237`.
    files:
      - public/js/hire-access.js
    rationale: ""
  - description: |
      New `test/hire-access-ui.test.js` (jsdom) — see `tests` below.
    files:
      - test/hire-access-ui.test.js
    rationale: ""
  - description: |
      New `public/audit-log.html` + `public/css/audit-log.css` + `public/js/audit-log.js` — the
      approved design's "Audit log" reference screen (design lines 921-947, 1153-1170): a
      `table.audit-table` with Time / Actor / Action / Target profile / Result / Detail columns,
      `.result-chip.allowed` / `.result-chip.denied` markup, fetched hr-only from
      `GET /hires/audit-log`. The prototype's "Access & tenant matrix" and "Acceptance criteria
      checklist" reference screens (design lines 949-1023) are deliberately NOT built — they are
      non-interactive, reviewer-facing documentation screens restating behaviour that is already
      implemented and tested elsewhere; no AC calls for a documentation page, and building one
      would be scope the story doesn't ask for.
    files:
      - public/audit-log.html
      - public/css/audit-log.css
      - public/js/audit-log.js
    rationale: |
      AC11 requires the data to be "logged for auditability"; without something that renders it,
      there is no way to actually audit it, and the design already specifies exactly this screen.
  - description: |
      New `test/audit-log-ui.test.js` (jsdom) — see `tests` below.
    files:
      - test/audit-log-ui.test.js
    rationale: ""

tests:
  - |
    AC1 (backend, test/hires-access-control.test.js): HR admin views full profile data within the
    tenant.
    ```js
    const res = await request(app).get(`/hires/${hire.id}`)
      .set('x-staff-role', 'hr').set('x-staff-name', 'Priya Shah').set('x-tenant', 'Acme Corp');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: hire.id, name: hire.name, email: hire.email, department: hire.department });
    ```
  - |
    AC2 (backend, test/hires-access-control.test.js): HR admin's edit is saved.
    ```js
    const res = await request(app).patch(`/hires/${hire.id}`)
      .set('x-staff-role', 'hr').set('x-tenant', 'Acme Corp').send({ department: 'Product' });
    expect(res.status).toBe(200);
    expect(res.body.department).toBe('Product');
    ```
  - |
    AC3 (backend, test/hires-access-control.test.js): HR admin's deactivation takes effect.
    ```js
    const res = await request(app).post(`/hires/${hire.id}/deactivate`)
      .set('x-staff-role', 'hr').set('x-tenant', 'Acme Corp');
    expect(res.status).toBe(200);
    expect(res.body.profileStatus).toBe('deactivated');
    ```
  - |
    AC4 (backend, test/hires-access-control.test.js): manager's hire list shows only their current
    direct reports.
    ```js
    // hireA.hiringManager = 'Dana Brooks', hireB.hiringManager = 'Marcus Chen', same tenant
    const res = await request(app).get('/hires')
      .set('x-staff-role', 'manager').set('x-staff-name', 'Dana Brooks').set('x-tenant', 'Acme Corp');
    expect(res.body.map((h) => h.id)).toEqual([hireA.id]);
    ```
  - |
    AC5 (backend, test/hires-access-control.test.js): manager with no current direct reports gets
    an empty list.
    ```js
    const res = await request(app).get('/hires')
      .set('x-staff-role', 'manager').set('x-staff-name', 'Elena Vance').set('x-tenant', 'Acme Corp');
    expect(res.body).toEqual([]);
    ```
    AC5 (frontend, test/hire-directory-ui.test.js):
    ```js
    initHireDirectoryApp(document, { role: 'manager', name: 'Elena Vance' }, []);
    expect(document.getElementById('roster-tbody').textContent)
      .toContain("don't have any direct reports yet");
    ```
  - |
    AC6 (backend, test/hires-access-control.test.js): when a direct-report relationship changes,
    the new manager immediately gains access.
    ```js
    await request(app).patch(`/hires/${hire.id}`).set('x-staff-role', 'hr').set('x-tenant', 'Acme Corp')
      .send({ hiringManager: 'Elena Vance' });
    const res = await request(app).get(`/hires/${hire.id}`)
      .set('x-staff-role', 'manager').set('x-staff-name', 'Elena Vance').set('x-tenant', 'Acme Corp');
    expect(res.status).toBe(200);
    ```
  - |
    AC7 (backend, test/hires-access-control.test.js): the former manager immediately loses access
    after the same change.
    ```js
    const res = await request(app).get(`/hires/${hire.id}`)
      .set('x-staff-role', 'manager').set('x-staff-name', 'Marcus Chen').set('x-tenant', 'Acme Corp');
    expect(res.status).toBe(403);
    expect(res.body.reason).toBe('not_direct_report');
    ```
  - |
    AC8 (backend, test/hires-access-control.test.js): new hire views their own personal details
    and onboarding status.
    ```js
    const res = await request(app).get(`/hires/${hire.id}`)
      .set('x-staff-role', 'new_hire').set('x-hire-id', hire.id).set('x-tenant', 'Acme Corp');
    expect(res.status).toBe(200);
    expect(res.body.onboardingStatus).toBeDefined();
    ```
    AC8 (frontend, test/hire-access-ui.test.js): the self view omits the pipeline-stage row and
    "Hire ID" row that the internal view shows.
    ```js
    initHireAccessApp(document, { role: 'new_hire', hireId: 'hire_2031' }, { allowed: true, hire });
    expect(document.getElementById('profile-kv-list').textContent).not.toContain('Pipeline stage');
    expect(document.getElementById('profile-kv-list').textContent).toContain('Onboarding status');
    ```
  - |
    AC9 (backend, test/hires-access-control.test.js, parametrized across roles): any role
    attempting a profile outside its permitted scope is denied.
    ```js
    test.each([
      ['manager', 'not_direct_report'],
      ['new_hire', 'not_own_profile'],
    ])('role %s out of scope is denied with reason %s', async (role, expectedReason) => {
      const res = await request(app).get(`/hires/${outOfScopeHire.id}`)
        .set('x-staff-role', role).set('x-staff-name', 'Someone Else').set('x-hire-id', 'not-this-one')
        .set('x-tenant', 'Acme Corp');
      expect(res.status).toBe(403);
      expect(res.body.reason).toBe(expectedReason);
    });
    ```
    Plus a dedicated cross-tenant case for HR itself:
    ```js
    const res = await request(app).get(`/hires/${globexHire.id}`)
      .set('x-staff-role', 'hr').set('x-tenant', 'Acme Corp');
    expect(res.status).toBe(403);
    expect(res.body.reason).toBe('cross_tenant');
    ```
  - |
    AC10 (backend, test/hires-access-control.test.js): the denial response carries a
    human-displayable reason, not a bare 403.
    ```js
    expect(res.body).toEqual({ error: 'forbidden', reason: 'not_direct_report' });
    ```
    AC10 (frontend, test/hire-access-ui.test.js):
    ```js
    initHireAccessApp(document, actor, { allowed: false, reason: 'not_direct_report' });
    expect(document.getElementById('profile-denied-state').hidden).toBe(false);
    expect(document.getElementById('denied-reason').textContent)
      .toContain("isn't one of your direct reports");
    ```
  - |
    AC11 (backend, test/hires-audit-log.test.js): every view (allowed and denied), edit, and
    deactivation is recorded at the tenant level.
    ```js
    await request(app).get(`/hires/${hire.id}`).set('x-staff-role', 'hr').set('x-staff-name', 'Priya Shah').set('x-tenant', 'Acme Corp');
    await request(app).get(`/hires/${hire.id}`).set('x-staff-role', 'manager').set('x-staff-name', 'Someone Else').set('x-tenant', 'Acme Corp');
    const log = await request(app).get('/hires/audit-log').set('x-staff-role', 'hr').set('x-tenant', 'Acme Corp');
    expect(log.body[0]).toMatchObject({ result: 'denied', action: 'Attempted to view profile' });
    expect(log.body[1]).toMatchObject({ result: 'allowed', action: 'Viewed profile', actorRole: 'HR Admin' });
    ```
    and that it's hr-only and tenant-scoped:
    ```js
    const res = await request(app).get('/hires/audit-log').set('x-staff-role', 'manager').set('x-tenant', 'Acme Corp');
    expect(res.status).toBe(403);
    ```
  - |
    AC4/AC9 (frontend, test/hire-directory-ui.test.js): the restricted card, not a table, renders
    for a new hire.
    ```js
    initHireDirectoryApp(document, { role: 'new_hire', name: 'Jordan Reyes', hireId: 'hire_2031' }, []);
    expect(document.getElementById('restricted-card').hidden).toBe(false);
    expect(document.getElementById('roster-wrap').hidden).toBe(true);
    ```
  - |
    AC1/AC2/AC3 (frontend, test/hire-access-ui.test.js): edit/deactivate controls only render for
    HR; a manager viewing an allowed direct report sees the read-only note instead.
    ```js
    initHireAccessApp(document, { role: 'manager', name: 'Dana Brooks' }, { allowed: true, hire });
    expect(document.getElementById('profile-edit-btn').hidden).toBe(true);
    expect(document.getElementById('profile-readonly-note').hidden).toBe(false);
    ```
  - |
    AC11 (frontend, test/audit-log-ui.test.js): denied rows render with the denied chip, not
    silently dropped.
    ```js
    initAuditLogApp(document, [{ id: 'a1', at: '2026-10-01T00:00:00Z', actorName: 'Marcus Chen',
      actorRole: 'Manager', action: 'Attempted to view profile', targetName: 'Jordan Reyes',
      result: 'denied', detail: 'Not one of Marcus Chen\'s direct reports.' }]);
    expect(document.querySelector('.result-chip.denied')).not.toBeNull();
    ```
  - |
    Regression (test/hires.test.js): the two existing headerless `GET /hires/:id` calls still pass
    once an `x-staff-role: hr` header is added, proving the new auth requirement didn't change
    retrieval behaviour for an authorized caller.

assumptions_or_open_questions:
  - |
    Biggest open call in this plan: the approved design's "Access & tenant matrix" screen states
    Manager and New hire are flatly "Denied" for editing and deactivating a profile (design lines
    975-976), but `src/hires/routes.js`'s existing `enforceOnboardingRole` gate already lets BOTH
    `hr` and `manager` call `PATCH /hires/:id`, `/deactivate`, and `/reactivate` today, and that is
    locked in by already-passing tests this story doesn't own: `test/hires.test.js` (PATCH/
    deactivate/reactivate as `manager` expect 200) and `test/hires-stage-pipeline.test.js`
    (`test.each(['hr', 'manager'])('AC1: PATCH as %s advances to screening')`), which belong to the
    recruiting-pipeline-progression feature where a manager driving `hireStage`/`hiringManager`
    forward is core, intended behaviour. None of this story's 11 ACs explicitly says "a manager
    must be blocked from editing" — only that HR admin edits/deactivates are saved (AC2/AC3). I
    chose NOT to narrow the mutate gate to hr-only, to avoid silently regressing the
    pipeline-progression feature for a restriction no AC actually asks for; I instead added only a
    tenant check to those three mutate routes. If the reviewer wants the matrix's stricter
    "manager fully denied" behaviour, that requires either restructuring pipeline-progression
    mutations onto different routes/fields than general profile-edit mutations, or deliberately
    updating `test/hires.test.js` and `test/hires-stage-pipeline.test.js` to drop manager's mutate
    access — flagging rather than picking silently, per instructions.
  - |
    No tenant/org model exists anywhere in the codebase yet. `tenant` defaults to the string
    `'Acme Corp'` (matching the design's fixture) whenever a caller doesn't supply one, purely so
    every pre-existing hire/test lands in one consistent default tenant; this is a placeholder,
    not a real tenant-provisioning feature, since no AC asks for one.
  - |
    Manager-to-profile matching is a plain string comparison between `x-staff-name` and
    `hire.hiringManager`, exactly mirroring the design's own `hire.hiringManager === actor.name`
    (design line 1110) — there is no manager-identity model (ids, user accounts) anywhere in this
    codebase to match against instead.
  - |
    `x-staff-role`/`x-staff-name`/`x-hire-id`/`x-tenant` are unverified, client-asserted headers,
    identical in spirit to the existing `x-staff-role` convention (`src/runs/auth.js`) and the
    explicitly-documented-as-insecure `x-user-id` pattern in `src/defects/auth.js`. This is
    consistent with how every other role gate in this codebase already works (there is no real
    session/auth layer anywhere yet), not a new weakening.
  - |
    AC11's "access decision" logging is implemented for single-profile view/edit/deactivate/
    reactivate attempts only, not for `GET /hires` (the list). The design's own audit log only
    ever logs individual `renderProfileDetail` view attempts (design lines 1359-1367), never a
    list fetch, so this mirrors the approved design rather than extending beyond it.
  - |
    Audit-log viewing (`GET /hires/audit-log` and the new `audit-log.html` page) is restricted to
    the `hr` role. The prototype itself shows the "Audit log" nav link to every actor, but no AC
    requires every role to be able to browse the full tenant audit trail (including other people's
    access attempts), and exposing it unrestricted would be a real information-disclosure gap the
    ACs don't ask for.
  - |
    `new_hire` is explicitly blocked from `POST /hires` (create) as a new, small guard — no AC
    covers creation, but letting a new hire create arbitrary profiles would contradict the whole
    point of this story.

package_dependencies: []

notes: |
  Route-ordering requirement: `router.get('/audit-log', ...)` must be registered before
  `router.get('/:id', ...)` in `src/hires/routes.js`, otherwise Express matches `/hires/audit-log`
  against the `:id` route first and treats `"audit-log"` as a hire id.

  ```mermaid
  flowchart TD
    subgraph Frontend
      HD[hire-directory.js]
      HA[hire-access.js]
      AL[audit-log.js]
    end
    subgraph Backend
      R[hires/routes.js]
      AUTH[hires/auth.js<br/>resolveHireActor / canViewHire / visibleHiresForActor]
      AUDIT[hires/auditLog.js<br/>recordAuditEntry / listAuditLogForTenant]
      STORE[hires/store.js<br/>listHires / getHire / updateHire / deactivateHire / reactivateHire]
    end
    HD -->|GET /hires| R
    HA -->|GET, PATCH /hires/:id, POST /:id/deactivate,reactivate| R
    AL -->|GET /hires/audit-log, hr only| R
    R -->|resolve actor, scope checks| AUTH
    R -->|record every view/edit/deactivate/reactivate attempt| AUDIT
    R -->|read/write records| STORE

    classDef touched fill:#f96,color:#000
    class HD,HA,AL,R,AUTH,AUDIT,STORE touched
  ```

  Existing `public/hire-profiles.html`/`hire-profile.html` (create-a-profile list + onboarding-Run
  status detail page) are a different, already-shipped feature and are intentionally untouched —
  this story adds parallel, RBAC-aware pages rather than retrofitting those, since their role model
  (`hr`/`manager`/`employee`, no scoping) and purpose (Run lifecycle management) are a different
  concern from "who may see which profile."

review_focus: |
  In scope: tenant + relationship-based view scoping and denial reasons on `GET /hires` and
  `GET /hires/:id`, a new tenant-level audit log covering every view/edit/deactivate/reactivate
  attempt, and three new pages reproducing the approved prototype's Hire List / Profile Detail /
  Audit Log screens. Out of scope, deliberately: changing who may create a profile (beyond
  blocking `new_hire`), rebuilding the existing onboarding-Run pages, and the prototype's two
  non-interactive reference screens (access matrix, AC checklist). The riskiest, most
  judgment-call-heavy part of this plan is the decision (see `assumptions_or_open_questions`) to
  leave manager edit/deactivate access on `PATCH /hires/:id` and friends unchanged rather than
  matching the approved design's access matrix literally, to avoid regressing the
  recruiting-pipeline-progression feature's existing tests — a reviewer who disagrees should treat
  that as the one deliberate, flagged tradeoff in this plan rather than an oversight. Also worth
  double-checking: the 403-with-reason vs. 404 choice for out-of-scope-but-existing profiles is a
  deliberate departure from this codebase's other "indistinguishable 404" pattern
  (`src/defects/routes.js`), chosen because AC10 requires a specific, displayed reason.
