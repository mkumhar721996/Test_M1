summary: |
  Build the Employee Directory & Search feature exactly as shown in the approved prototype
  (`.arc/designs/TEST-M1-STORY-172-design.html`): a new, read-only "Employee Directory" screen
  (search by name, filter by department/role, direct ID lookup, Active/Inactive status badges,
  no status filter) and a new, read-only "Employee Profile" detail screen reachable from it. No
  backend changes are required — `GET /employees` and `GET /employees/:id` already enforce the
  HR/Manager gate (`enforceOnboardingRole`) and already return deactivated employees with full
  detail (confirmed in `src/employees/routes.js`, `src/employees/store.js`, and
  `test/employees-status.test.js`), so this plan is two new static pages plus their client-side
  modules, fetching the existing endpoints once and doing all search/filter/lookup logic
  client-side, mirroring the pattern already used by `public/js/employees.js`'s status filter
  and by the prototype's own `matchingEmployees()`/`getEmployee()` helpers.

scope:
  - description: |
      Add a new directory page `public/employee-directory.html`, built from the design's
      "Employee Directory" screen: the `.app-topbar`/`.app-nav` shell (Directory active, Org
      chart/Settings as inert placeholders, matching the design's comment that it reuses the
      "Workforce" shell from TEST-M1-STORY-171), a `role-switcher` with four options (`hr`,
      `manager`, `employee`, `signedout`) for demo role selection, a `#directory-denied` panel
      and a `#directory-authorized` wrapper containing: the `.lookup-row` (`#lookup-id-input`,
      `#lookup-id-btn`, `#lookup-id-error`), the `.filter-bar` (`#search-input`,
      `#department-filter`, `#role-filter`, `#clear-filters-btn`), the `.filter-note` stating
      status isn't offered as a filter, `#results-summary`, `#partial-note`/`#partial-note-text`,
      and a `.card.table-card` > `.directory-table` with `Name | Department / Role | Status`
      columns and `#directory-tbody`.
      Deliberately excluded from this file: the design's reviewer bar, its "Access & Search
      Reference" and "Acceptance Criteria Checklist" reference screens, and the "Simulate load
      error (dev tool)" button — all three are prototype review scaffolding, not product
      features backed by an acceptance criterion.
    files:
      - public/employee-directory.html
      - public/css/employee-directory.css
    rationale: |
      Satisfies AC1 (directory renders for HR/Manager), AC2 (denied panel replaces all content,
      including the lookup/filter controls, for any other role), and AC6 (no status filter is
      ever rendered — only a note explaining why). This is a new page rather than a retrofit of
      STORY-171's `public/employees.html`: that page's "Employee directory" is actually the
      Employee Status Management screen (status filter + Deactivate/Reactivate actions column),
      which directly conflicts with AC6 (no status filter) and with this design's own
      `.profile-note` ("Deactivating or reactivating an employee is managed from Employee Status
      Management, not from this directory — this screen is read-only."). The epic description
      itself separates "status changes", "profile edits", and "directory/search" as three
      distinct concerns, consistent with three distinct screens.
      `public/css/employee-directory.css` supplies the page-specific classes not already in
      `design-system/prototype-utils.css` (which only covers `.app-topbar`, `.btn`, `.card`,
      `.modal-*`, `.toast`, `.input`, `.label`, `.page`): `.role-switcher`, `.filter-bar` /
      `.filter-field` / `.search-field` / `.clear-filters-btn`, `.filter-note`, `.lookup-row` /
      `.lookup-field` / `.lookup-error`, `.results-summary`, `.table-card` / `.directory-table`
      (name-cell/person-name-link/person-id, role-cell/role-line/dept-line), `.partial-note`,
      `.status-chip` with `--active`/`--inactive` variants (the design's own naming — distinct
      from STORY-171's `--deactivated` variant in `public/css/employees.css`), `.skeleton-row` /
      `.skeleton-bar` with the shimmer keyframes, `.empty-state` / `.error-state`, and
      `.access-denied-panel`.
  - description: |
      Add `public/js/employee-directory.js` exporting:

      ```js
      function initEmployeeDirectoryApp(doc, api, getRole, onViewEmployee = () => {})
      function createDefaultApi(getRole)
      ```

      `initEmployeeDirectoryApp` fetches `api.list()` (GET `/employees` with the
      `x-staff-role` header, reusing the exact pattern in `public/js/employees.js`'s
      `createDefaultApi`) once per load and on every `role-select` change. On success it keeps
      the full unfiltered employee array in memory, derives sorted/deduped department and role
      options for the two `<select>`s (mirroring the prototype's `populateFilterOptions()`), and
      renders `#directory-authorized`. On a `{status: 401}` rejection it shows
      `#directory-denied` with the "must be signed in" copy; on `{status: 403}` it shows the
      "need the HR or Manager role" copy — both strings taken verbatim from the design's
      `renderDirectoryAccess()`. Any other rejection renders `.error-state` with a Retry button
      inside `#directory-tbody`, leaving the filter bar in place.
      Search/filter (`input`/`change` listeners on `#search-input`, `#department-filter`,
      `#role-filter`) AND-combine exactly like the design's `matchingEmployees()`: case-insensitive
      substring match on `name`, exact match on `department`/`role` unless `all`. Results above
      `RESULTS_PAGE_SIZE = 8` show only the first 8 rows plus `#partial-note` (same constant and
      copy as the design); zero matches render `.empty-state` with a "Clear filters" action that
      calls the same handler as `#clear-filters-btn`.
      The ID lookup (`#lookup-id-btn` click, Enter key in `#lookup-id-input`) looks up the
      trimmed, case-insensitive ID against the in-memory full array (not a new network call,
      matching the design's `getEmployee()`): blank shows "Enter an employee ID to look up.",
      unknown shows `No employee found with ID "<id>".`, a match calls
      `onViewEmployee(employee.id)`. Clicking a row's `[data-view-id]` name link calls the same
      `onViewEmployee(id)`.
      The real `window` bootstrap (`DOMContentLoaded`) wires `onViewEmployee` to
      `window.location.href = 'employee-record.html?id=' + encodeURIComponent(id)`, and omits
      the `x-staff-role` header entirely when `getRole()` is `'signedout'`, which is what
      actually triggers the backend's existing 401 path.
    files:
      - public/js/employee-directory.js
    rationale: |
      Satisfies AC3 (combinable name/department/role search with only matching records
      returned, including the duplicate-name and punctuation/accent edge cases the design calls
      out — plain case-insensitive `String.includes()` handles both since no regex is involved),
      AC4 (no-match empty state), AC5 (deactivated employees are never filtered out — the
      in-memory array is never pruned by status, only by the three real filter fields), and AC7
      /AC8 (ID lookup and name-link navigation both resolve to the same record view). No backend
      filtering endpoint is needed: `GET /employees` already returns every employee regardless of
      `employmentStatus` (see `src/employees/store.js`'s `listEmployees()`, which applies no
      status filter, and `test/employees-status.test.js`'s AC6 case), so client-side filtering
      against that one fetched array is sufficient and matches the existing
      `public/js/employees.js` status-filter precedent.
  - description: |
      Add a new read-only record page `public/employee-record.html`, built from the design's
      "Employee Profile" screen: the same app shell, a `#profile-denied` panel, and a
      `#profile-authorized` wrapper with `#profile-back-btn` ("← Back to directory"), a
      `.profile-header` (`#profile-name`, `#profile-role-line`, `#profile-status-chip`), a
      details card with a `.kv-list` of `#profile-id` / `#profile-email` / `#profile-department`
      / `#profile-role` / `#profile-start-date`, and the `.profile-note` explaining that status
      changes happen in Employee Status Management, not here. Adds one state beyond the literal
      prototype — `#profile-notfound` — for a stale/mistyped `id` reached directly by URL (see
      assumptions).
    files:
      - public/employee-record.html
      - public/css/employee-record.css
    rationale: |
      Satisfies AC7 (a deactivated employee's full record renders, unmodified, when opened
      directly by ID) and AC8 (an active employee's full record renders the same way, whether
      opened by ID or from the directory). Kept as its own file rather than reusing STORY-171's
      `public/employee.html` because that page is never read-only — it always renders a
      Deactivate/Reactivate button and status history, which contradicts this design's explicit
      "this screen is read-only" note.
      `public/css/employee-record.css` adds `.back-link`, `.profile-header`, `.kv-list` /
      `.kv-row` / `.kv-label` / `.kv-value`, and `.profile-note`; it is loaded alongside
      `employee-directory.css` (for the shared `.status-chip` and `.access-denied-panel`
      classes), the same cross-file reuse already used by STORY-171's `employee.html`
      (`employees.css` + `employee.css`).
  - description: |
      Add `public/js/employee-record.js` exporting:

      ```js
      function initEmployeeRecordApp(doc, employeeId, api, getRole)
      function createDefaultApi(employeeId, getRole)
      ```

      Mirrors `public/js/employee-profile.js`'s `isAccessDenied`/load pattern: on init (and on
      `role-select` change) it shows a skeleton, calls `api.getProfile()` (GET
      `/employees/:id` with the `x-staff-role` header), and on success renders the full record
      (including the exact `status-chip--active`/`--inactive` markup used by the directory page)
      with `#profile-denied` hidden. A `{status: 401 | 403}` rejection shows `#profile-denied`
      with copy matching the design ("You need the HR or Manager role to view employee
      records."). A `{status: 404}` rejection (or a missing `employeeId` query param) shows the
      new `#profile-notfound` state instead of a blank page. `#profile-back-btn` navigates to
      `employee-directory.html`. The real bootstrap reads `id` from
      `new URLSearchParams(window.location.search)`.
    files:
      - public/js/employee-record.js
    rationale: |
      Completes AC7/AC8 end-to-end: the backend already returns the deactivated/active record
      unmodified (`src/employees/routes.js`'s `GET /employees/:id`), so this module only needs to
      render what comes back and gate on the same 401/403 the directory page already handles.
  - description: |
      Add failing-test-first UI test suites `test/employee-directory-ui.test.js` and
      `test/employee-record-ui.test.js` (jsdom, same style as `test/employees-list-ui.test.js`
      and `test/employee-profile.test.js`), covering every acceptance criterion against the two
      new HTML fixtures and JS modules above with a mocked `api`.
    files:
      - test/employee-directory-ui.test.js
      - test/employee-record-ui.test.js
    rationale: |
      TDD anchor for this plan: before the two scope items above exist, `require('../public/js/employee-directory')`
      and `require('../public/js/employee-record')` fail with "Cannot find module", giving the
      natural red state; after the HTML/JS are added the suites below go green without any
      backend change.

tests:
  - |
    AC1 — directory renders for HR/Manager:
    ```js
    test('AC1: HR sees the full directory on load', async () => {
      const employees = [fixtureActive(), fixtureDeactivated()];
      const api = { list: jest.fn().mockResolvedValue(employees) };
      initEmployeeDirectoryApp(document, api, () => 'hr');
      await flush();
      expect(document.getElementById('directory-denied').hidden).toBe(true);
      expect(document.getElementById('directory-authorized').hidden).toBe(false);
      expect(document.querySelectorAll('#directory-tbody [data-view-id]')).toHaveLength(2);
    });
    ```
  - |
    AC2 — non-HR/Manager and unauthenticated are both denied, with distinct copy:
    ```js
    test('AC2: a non-HR/Manager role is denied and the directory controls are not rendered', async () => {
      const api = { list: jest.fn().mockRejectedValue({ status: 403 }) };
      initEmployeeDirectoryApp(document, api, () => 'employee');
      await flush();
      expect(document.getElementById('directory-authorized').hidden).toBe(true);
      expect(document.getElementById('directory-denied-text').textContent).toMatch(/need the HR or Manager role/i);
    });

    test('AC2: signed out (no role header, 401) sees the "must be signed in" copy', async () => {
      const api = { list: jest.fn().mockRejectedValue({ status: 401 }) };
      initEmployeeDirectoryApp(document, api, () => 'signedout');
      await flush();
      expect(document.getElementById('directory-denied-text').textContent).toMatch(/must be signed in/i);
    });
    ```
  - |
    AC3 — combined name/department/role search returns only matching records, including the
    duplicate-name and accented/punctuated-name edge cases from the design fixture:
    ```js
    test('AC3: a name search narrows results, and a department filter narrows further', async () => {
      const api = { list: jest.fn().mockResolvedValue([priya(), lena(), sofiaOps(), sofiaMarketing()]) };
      initEmployeeDirectoryApp(document, api, () => 'hr');
      await flush();
      document.getElementById('search-input').value = 'Sofia Russo';
      document.getElementById('search-input').dispatchEvent(new Event('input'));
      expect(document.querySelectorAll('#directory-tbody [data-view-id]')).toHaveLength(2);
      document.getElementById('department-filter').value = 'Marketing';
      document.getElementById('department-filter').dispatchEvent(new Event('change'));
      expect(document.querySelectorAll('#directory-tbody [data-view-id]')).toHaveLength(1);
    });

    test('AC3 edge case: a punctuated, accented name is matched by a plain substring search', async () => {
      const api = { list: jest.fn().mockResolvedValue([siobhan()]) };
      initEmployeeDirectoryApp(document, api, () => 'hr');
      await flush();
      document.getElementById('search-input').value = "o'connor";
      document.getElementById('search-input').dispatchEvent(new Event('input'));
      expect(document.querySelectorAll('#directory-tbody [data-view-id]')).toHaveLength(1);
    });
    ```
  - |
    AC4 — a no-match filter combination shows the empty state, and Clear filters recovers:
    ```js
    test('AC4: no-match filters show the empty state; Clear filters restores all rows', async () => {
      const api = { list: jest.fn().mockResolvedValue([sofiaMarketing(), noahSales()]) };
      initEmployeeDirectoryApp(document, api, () => 'hr');
      await flush();
      document.getElementById('department-filter').value = 'Marketing';
      document.getElementById('department-filter').dispatchEvent(new Event('change'));
      document.getElementById('role-filter').value = 'Sales Manager';
      document.getElementById('role-filter').dispatchEvent(new Event('change'));
      expect(document.querySelector('.empty-state').textContent).toMatch(/No employees match/i);
      document.getElementById('clear-filters-btn').click();
      expect(document.querySelectorAll('#directory-tbody [data-view-id]')).toHaveLength(2);
    });
    ```
  - |
    AC5 — a deactivated employee still appears, with a distinct Inactive badge, and remains
    searchable:
    ```js
    test('AC5: a deactivated employee appears with a distinct Inactive badge and is still searchable', async () => {
      const api = { list: jest.fn().mockResolvedValue([fixtureDeactivated()]) };
      initEmployeeDirectoryApp(document, api, () => 'hr');
      await flush();
      expect(document.querySelector('.status-chip--inactive').textContent).toContain('Inactive');
      document.getElementById('search-input').value = fixtureDeactivated().name;
      document.getElementById('search-input').dispatchEvent(new Event('input'));
      expect(document.querySelectorAll('#directory-tbody [data-view-id]')).toHaveLength(1);
    });
    ```
  - |
    AC6 — status is never offered as a filter:
    ```js
    test('AC6: no status filter control is ever rendered', async () => {
      initEmployeeDirectoryApp(document, { list: jest.fn().mockResolvedValue([]) }, () => 'hr');
      await flush();
      expect(document.getElementById('status-filter')).toBeNull();
      expect(document.querySelector('.filter-note').textContent).toMatch(/not offered as a filter/i);
    });
    ```
  - |
    AC7 — a deactivated employee's record opens directly by ID, both via the record page itself
    and via the directory's lookup box:
    ```js
    test('AC7: the record page renders a deactivated employee in full', async () => {
      const api = { getProfile: jest.fn().mockResolvedValue(fixtureDeactivated()) };
      initEmployeeRecordApp(document, fixtureDeactivated().id, api, () => 'hr');
      await flush();
      expect(document.getElementById('profile-authorized').hidden).toBe(false);
      expect(document.getElementById('profile-status-chip').textContent).toContain('Inactive');
    });

    test('AC7: the lookup box opens a known ID and flags a blank or unknown ID inline instead of navigating', async () => {
      const onViewEmployee = jest.fn();
      const api = { list: jest.fn().mockResolvedValue([fixtureDeactivated()]) };
      initEmployeeDirectoryApp(document, api, () => 'hr', onViewEmployee);
      await flush();
      document.getElementById('lookup-id-btn').click();
      expect(document.getElementById('lookup-id-error').hidden).toBe(false);
      expect(document.getElementById('lookup-id-error').textContent).toMatch(/Enter an employee ID/);
      document.getElementById('lookup-id-input').value = 'emp_c999';
      document.getElementById('lookup-id-btn').click();
      expect(document.getElementById('lookup-id-error').textContent).toMatch(/No employee found/);
      document.getElementById('lookup-id-input').value = fixtureDeactivated().id;
      document.getElementById('lookup-id-btn').click();
      expect(onViewEmployee).toHaveBeenCalledWith(fixtureDeactivated().id);
    });
    ```
  - |
    AC8 — an active employee's full record opens by ID lookup or by clicking its name in the
    directory:
    ```js
    test('AC8: clicking a name link in the directory navigates to that employee record', async () => {
      const onViewEmployee = jest.fn();
      const api = { list: jest.fn().mockResolvedValue([priya()]) };
      initEmployeeDirectoryApp(document, api, () => 'manager', onViewEmployee);
      await flush();
      document.querySelector('[data-view-id]').click();
      expect(onViewEmployee).toHaveBeenCalledWith(priya().id);
    });

    test('AC8: the record page renders full detail for an active employee', async () => {
      const api = { getProfile: jest.fn().mockResolvedValue(priya()) };
      initEmployeeRecordApp(document, priya().id, api, () => 'hr');
      await flush();
      expect(document.getElementById('profile-email').textContent).toBe(priya().email);
      expect(document.querySelector('.status-chip--active')).not.toBeNull();
    });
    ```

assumptions_or_open_questions:
  - |
    Conflict flagged per instructions: the story's "Scope" text describes a fallback default
    ("deactivated employees are excluded from directory/search results... this default holds
    until the product owner confirms whether to instead show them with a distinct status badge
    and/or add status as a filter dimension") that is the OPPOSITE of AC5 and AC6, and of the
    approved design, which both unambiguously show deactivated employees INCLUDED with a
    distinct "Inactive" badge and status explicitly NOT offered as a filter (see the design's
    `.filter-note` copy and its `EMPLOYEES` fixture, which never excludes `emp_c003`/`emp_c008`
    from the table). I am treating the PO's open question as already resolved by the ratified
    ACs and the approved design, and building "include + badge, no status filter" — not the
    older fallback text. Flagging this explicitly rather than silently picking one.
  - |
    Treating this as two brand-new pages/screens, not a retrofit of STORY-171's
    `public/employees.html` / `public/employee.html`. Those pages are the Employee Status
    Management screens (status filter + Deactivate/Reactivate actions, non-read-only profile)
    and directly conflict with this design's read-only, no-status-filter screens. The epic
    description's three separate concerns ("status changes, profile edits, and
    directory/search") support three separate screens. Flagging for reviewer confirmation since
    both screens are titled "Employee directory" in their respective `<h1>`s, which could read as
    one screen evolving rather than two coexisting ones.
  - |
    No backend route, store, or auth change is needed: `GET /employees` and `GET /employees/:id`
    already enforce HR/Manager via `enforceOnboardingRole` and already return deactivated
    employees in full. All search/filter/lookup logic is implemented client-side against the one
    fetched array, matching the design's own client-side `matchingEmployees()`/`getEmployee()`
    and the existing `public/js/employees.js` status-filter precedent.
  - |
    Excluded from scope, as prototype-only review scaffolding rather than product features: the
    design's reviewer bar, its "Access & Search Reference" and "Acceptance Criteria Checklist"
    screens, and the "Simulate load error (dev tool)" button. The genuine error state (with a
    Retry action) is still implemented for real fetch failures — only the manual trigger button
    is omitted.
  - |
    Added beyond the literal prototype: a `#profile-notfound` state on the record page for a
    stale, deleted, or mistyped `id` reached directly by URL. The prototype's only "not found"
    handling lives in the directory's own lookup box (`#lookup-id-error`); a bookmarked or
    hand-typed `employee-record.html?id=X` URL needs its own fallback, modeled on the existing
    `public/js/employee.js`'s `showEmployeeNotFound` pattern.
  - |
    Navigation from the directory to a record uses the query string `employee-record.html?id=<id>`
    (matching the existing `public/employee-profile.html` convention) rather than
    `?employeeId=` (used by `public/employee.html`) or the prototype's `#employee/<id>` hash
    routing — this new page is its own top-level route, so a plain query param is simplest.
    Reviewer can redirect if a different convention is preferred.
  - |
    The design's "Signed out (not authenticated)" role-switcher option is implemented by omitting
    the `x-staff-role` header entirely for that demo state, since that header's absence is what
    genuinely triggers the backend's existing 401 path — there is no real session/auth system in
    this app yet.

package_dependencies: []

notes: |
  Research trail: read `src/employees/routes.js`, `src/employees/store.js`, `src/runs/auth.js`
  (the shared `enforceOnboardingRole` used by both GET routes), `test/employees-status.test.js`
  (confirms deactivated employees are never excluded from `GET /employees` and are returned in
  full by `GET /employees/:id`), `public/employees.html` + `public/js/employees.js` + their test
  (`test/employees-list-ui.test.js`, the STORY-171 status-management screen), `public/employee.html`
  + `public/js/employee.js` + their test (`test/employee-profile-ui.test.js`, the STORY-171
  lifecycle profile screen), `public/employee-profile.html` + `public/js/employee-profile.js`
  (an orphaned profile-editing screen, linked from nowhere — left untouched), `public/js/utils.js`
  (shared `escapeHtml`/`formatDateDisplay`/`trapTab`, reused by the new modules), and
  `design-system/prototype-utils.css` / `design-system/tokens.css` (confirms which classes are
  already global vs. need to be added per-page).

  ```mermaid
  flowchart TD
    server[src/server.js] --> employeesRoutes[src/employees/routes.js]
    employeesRoutes --> employeesStore[src/employees/store.js]
    auth[src/runs/auth.js enforceOnboardingRole] --> employeesRoutes
    employeesRoutes -. "GET /employees (unchanged)" .-> directoryJs[public/js/employee-directory.js]
    employeesRoutes -. "GET /employees/:id (unchanged)" .-> recordJs[public/js/employee-record.js]
    directoryJs --> directoryHtml[public/employee-directory.html]
    recordJs --> recordHtml[public/employee-record.html]
    utilsJs[public/js/utils.js] --> directoryJs
    utilsJs --> recordJs
    directoryHtml -- "navigate ?id=" --> recordHtml

    classDef touched fill:#f96,color:#000
    class directoryJs,recordJs,directoryHtml,recordHtml touched
  ```

review_focus: |
  In scope: two brand-new, read-only pages (`employee-directory.html`/`.js`,
  `employee-record.html`/`.js`) and their CSS/tests, all consuming the existing, unchanged
  `GET /employees` / `GET /employees/:id` endpoints — no backend, store, or route changes. Out of
  scope: anything about STORY-171's `employees.html`/`employee.html` (status management) or the
  orphaned `employee-profile.html` (field editing); none of those files are touched. The riskiest
  area is the client-side AND-combination filter logic (name substring + department + role) and
  its interaction with the empty/partial(>8 rows)/error states — verify the partial-note count
  text and the empty-state's "Clear filters" action both land correctly, and that deactivated
  employees are genuinely never excluded by any of the three filters (only by nothing — status
  has no filter at all, per AC6). Also deliberate, not accidental: this plan treats the directory
  PO's "fallback default" scope note as superseded by AC5/AC6/the design (see
  assumptions_or_open_questions), builds two new screens instead of extending STORY-171's, and
  omits the design's dev-tool "Simulate load error" button and its reference-only screens.
