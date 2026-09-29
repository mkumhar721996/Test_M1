summary: |
  Add a new "Hire Dashboard" page (`public/hire-dashboard.html` + `public/js/hire-dashboard.js`
  + `public/css/hire-dashboard.css`) that lists active hires and lets an HR admin narrow that
  list by onboarding stage, hire name/ID search, department, and a start-date range, with a
  "Clear filters" action that restores the full active-hire list and a client-side auto-refresh
  (`setInterval` poll of `GET /hires`) that preserves whatever filters are currently set. No
  dashboard page exists yet in this repo (`public/index.html` is the Expense Tracker,
  `public/hire-profile.html` is a single-hire detail view) and `GET /hires` (src/hires/routes.js)
  already returns every hire's full record (id, name, department, startDate, hireStage,
  profileStatus) via `listHires()` in src/hires/store.js, so this is implemented the same way
  the existing guest-profiles and expenses pages filter data: fetch the full list once, then
  filter/re-render entirely client-side, with no changes to src/hires/routes.js or
  src/hires/store.js. Because a dashboard is the first page in this repo that keeps polling a
  live endpoint indefinitely, this plan also covers what happens when that fetch fails — both on
  first load and on a later auto-refresh tick — so a transient network error can't leave an HR
  admin looking at a blank or frozen page with no way to recover.

scope:
  - description: |
      Create `public/hire-dashboard.html`: a new page with the shared app topbar/nav
      (matching the pattern in `public/hire-profile.html` / `public/guest-profiles.html`), a
      `role="search"` filter bar with a stage `<select id="filter-stage">`, a text
      `<input type="search" id="filter-search">` for name/ID, a department
      `<select id="filter-department">`, two `<input type="date">` fields
      (`#filter-start-date` / `#filter-end-date`) for the start-date range, and a
      `#clear-filters-btn` button, plus a `#result-count` line and a table
      (`#hire-tbody`) that JS renders into. All of the above is wrapped in a
      `#dashboard-content` container, sibling to a `hidden` `#load-error` panel
      (`role="alert"`, with a `#load-retry-btn`) that JS shows in place of the content
      container when the initial `GET /hires` fetch fails.
    files: |
      public/hire-dashboard.html
    rationale: |
      Mirrors the existing `filter-bar` / `filter-field` / `filter-result-row` markup shape
      used in `public/index.html` (expenses) and the `role="search"` toolbar in
      `public/guest-profiles.html`, so the new page reads as native to this codebase rather
      than inventing a new layout convention. The `#dashboard-content` / `#load-error` split
      mirrors the `.error-state` pattern already used for card-level errors elsewhere in the
      design system, applied here at the whole-page level since there is nothing useful to
      show (no data, no filters) until the first fetch succeeds at least once.

  - description: |
      Create `public/css/hire-dashboard.css` with page-specific styles for the filter bar,
      result-count row, hire table, the "No matching hires" empty state, and the initial-load
      `.error-state` panel — following the same rules (spacing/color/radius tokens only, no
      hardcoded hex) as `public/css/expenses.css`, whose `.filter-bar`, `.filter-field`,
      `.list-count`, and `.no-match-row`/`.no-match` classes are reused by name/shape here
      (app-shell/topbar/modal/toast primitives keep coming from
      `design-system/prototype-utils.css`, not duplicated).
    files: |
      public/css/hire-dashboard.css
    rationale: |
      Every other page in this repo (expenses, hire-profile, guest-profiles) has its own
      page-specific stylesheet alongside the shared `prototype-utils.css`; this keeps that
      convention rather than growing a shared file with unrelated page rules.

  - description: |
      Create `public/js/hire-dashboard.js` exporting a pure filter function, two fixed
      option lists, an init function that wires the filter bar to the table and starts a
      polling refresh, and a load/retry wrapper around that init:

      ```js
      const { escapeHtml, formatDateDisplay } = require('./utils');

      const REFRESH_INTERVAL_MS = 10000;
      const DEPARTMENTS = ['Engineering', 'Product', 'Sales', 'People Ops', 'Finance'];
      const HIRE_STAGES = ['draft', 'offer_accepted'];

      function filterHires(list, { stage = '', search = '', department = '', start = '', end = '' } = {}) {
        const q = search.trim().toLowerCase();
        return list.filter((h) => {
          if (stage && h.hireStage !== stage) return false;
          if (department && h.department !== department) return false;
          if (start && h.startDate < start) return false;
          if (end && h.startDate > end) return false;
          if (q && !(h.name.toLowerCase().includes(q) || h.id.toLowerCase().includes(q))) return false;
          return true;
        });
      }

      function initHireDashboardApp(doc, initialHires, api) { /* ... */ }
      function createDefaultApi() { return { list: () => fetch('/hires').then((r) => r.json()) }; }
      function loadAndInit(doc, api) {
        return api.list().then((hires) => {
          hideLoadError(doc);
          initHireDashboardApp(doc, hires, api);
        }).catch((err) => {
          console.error('Hire dashboard initial load failed:', err);
          showLoadError(doc, () => loadAndInit(doc, api));
        });
      }
      module.exports = { initHireDashboardApp, filterHires, loadAndInit, DEPARTMENTS, HIRE_STAGES, REFRESH_INTERVAL_MS };
      ```

      `initHireDashboardApp` keeps `allHires` (everything last fetched) in closure state,
      derives `activeHires = allHires.filter(h => h.profileStatus === 'active')` on every
      render, applies `filterHires(activeHires, currentFiltersReadFromTheDom())`, and renders
      either table rows or a `.no-match-row`. Every filter control re-renders on its native
      event (`change` for the two selects, `input` for search and both date fields); "Clear
      filters" resets all five controls' `.value` to `''` then re-renders.
      `setInterval(() => api.list().then((hires) => { allHires = hires; render(); }).catch((err) =>
      console.error('Hire dashboard auto-refresh failed — showing last-loaded data:', err)),
      REFRESH_INTERVAL_MS)` is started once, inside `initHireDashboardApp`, before the first
      `render()` call — since `render()` always re-reads filter values straight from the
      (untouched) DOM controls, a refresh automatically re-applies whatever filters are
      currently set with no separate "saved filter state" to keep in sync, and a rejected
      refresh is swallowed (logged, not thrown) so one bad tick never stops the interval or
      crashes the page. `department`/`hireStage` option markup for the two `<select>` elements
      is generated from `DEPARTMENTS`/`HIRE_STAGES` at render time (mirrors `CATEGORIES` in
      `public/js/expenses.js`); a small `stageLabel()` helper maps `'offer_accepted'` ->
      `'Offer accepted'` and anything else -> `'Draft'`. `escapeHtml`/`formatDateDisplay` are
      imported from the existing shared `public/js/utils.js` (already used elsewhere in the
      repo) rather than reimplemented here. `showLoadError`/`hideLoadError` toggle the
      `#load-error` / `#dashboard-content` `hidden` attributes and wire `#load-retry-btn` to
      re-invoke `loadAndInit`. A `DOMContentLoaded` listener (guarded by
      `typeof window !== 'undefined'`, matching `public/js/hire-profile.js`) calls
      `loadAndInit(document, createDefaultApi())`.
    files: |
      public/js/hire-dashboard.js
    rationale: |
      No backend change is needed: `listHires()` in `src/hires/store.js` already returns
      every field this page filters on. This follows the exact precedent of
      `public/js/guest-profiles.js` (`applySearchFilter` filters an in-memory `guests` array
      fetched once) and `public/js/expenses.js` (`filterExpenses` pure function) rather than
      inventing server-side query-param filtering with no prior pattern in this codebase. The
      `loadAndInit`/`showLoadError` wrapper is the minimal addition needed so a failed fetch —
      on first load or on a refresh tick — degrades to a visible, retry-able state instead of
      an unhandled promise rejection or a silently-frozen table.

  - description: |
      Create `test/hire-dashboard.test.js` (jsdom) covering all 6 ACs, the pure filter
      function, the "active hires only" baseline every AC's GIVEN clause depends on, and the
      two failure-mode paths (failed initial load, failed auto-refresh tick).
    files: |
      test/hire-dashboard.test.js
    rationale: |
      Follows the same jsdom-fixture-HTML-plus-stub-api structure as
      `test/expenses-filter.test.js` and `test/hire-profile.test.js` (load the real HTML file
      into `document.documentElement.innerHTML`, `require` the module fresh via
      `jest.resetModules()`, pass a fixture hire list + stub `api` object directly into the
      init function rather than mocking global `fetch`).

tests:
  - |
    Foundation (implicit GIVEN in every AC — dashboard shows active hires and nothing else):
    ```js
    test('loads showing every active hire and excludes deactivated ones', () => {
      const rows = document.querySelectorAll('#hire-tbody tr');
      expect(rows.length).toBe(3);
      expect(document.getElementById('result-count').textContent).toMatch(/3 of 3/);
      expect(Array.from(rows).some((r) => r.textContent.includes('Deactivated Dana'))).toBe(false);
    });
    ```
  - |
    AC1 — stage filter narrows to hires currently in that stage:
    ```js
    test('selecting a stage immediately narrows the table to hires in that stage', () => {
      document.getElementById('filter-stage').value = 'draft';
      document.getElementById('filter-stage').dispatchEvent(new Event('change'));
      const rows = document.querySelectorAll('#hire-tbody tr');
      expect(rows.length).toBe(2);
      expect(document.getElementById('result-count').textContent).toMatch(/2 of 3/);
    });
    ```
  - |
    AC2 — name/ID search narrows to matching hires:
    ```js
    test('typing a hire name narrows the table to matching hires', () => {
      document.getElementById('filter-search').value = 'Jordan';
      document.getElementById('filter-search').dispatchEvent(new Event('input'));
      const rows = document.querySelectorAll('#hire-tbody tr');
      expect(rows.length).toBe(1);
      expect(rows[0].textContent).toContain('Jordan Reyes');
    });

    test('typing a hire ID narrows the table to the matching hire', () => {
      document.getElementById('filter-search').value = 'hire_1002';
      document.getElementById('filter-search').dispatchEvent(new Event('input'));
      const rows = document.querySelectorAll('#hire-tbody tr');
      expect(rows.length).toBe(1);
      expect(rows[0].textContent).toContain('Casey Kim');
    });
    ```
  - |
    AC3 — department filter narrows to that department:
    ```js
    test('selecting a department immediately narrows the table to that department', () => {
      document.getElementById('filter-department').value = 'Engineering';
      document.getElementById('filter-department').dispatchEvent(new Event('change'));
      const rows = document.querySelectorAll('#hire-tbody tr');
      expect(rows.length).toBe(2);
    });
    ```
  - |
    AC4 — start-date range narrows to hires starting within it:
    ```js
    test('setting a start-date range narrows the table to hires starting within it', () => {
      document.getElementById('filter-start-date').value = '2026-09-01';
      document.getElementById('filter-start-date').dispatchEvent(new Event('input'));
      document.getElementById('filter-end-date').value = '2026-10-31';
      document.getElementById('filter-end-date').dispatchEvent(new Event('input'));
      const rows = document.querySelectorAll('#hire-tbody tr');
      expect(rows.length).toBe(2);
      expect(Array.from(rows).some((r) => r.textContent.includes('Alex Chen'))).toBe(false);
    });
    ```
  - |
    AC5 — clearing all filters restores the full unfiltered (active) list:
    ```js
    test('clearing all filter controls restores the full active-hire list', () => {
      document.getElementById('filter-department').value = 'Engineering';
      document.getElementById('filter-department').dispatchEvent(new Event('change'));
      document.getElementById('clear-filters-btn').click();
      expect(document.getElementById('filter-stage').value).toBe('');
      expect(document.getElementById('filter-search').value).toBe('');
      expect(document.getElementById('filter-department').value).toBe('');
      expect(document.getElementById('filter-start-date').value).toBe('');
      expect(document.getElementById('filter-end-date').value).toBe('');
      expect(document.querySelectorAll('#hire-tbody tr').length).toBe(3);
    });
    ```
  - |
    AC6 — active filters survive an auto-refresh and the refreshed data still respects them:
    ```js
    test('an auto-refresh preserves active filters and re-applies them to the refreshed data', async () => {
      jest.useFakeTimers();
      document.getElementById('filter-department').value = 'Engineering';
      document.getElementById('filter-department').dispatchEvent(new Event('change'));
      expect(document.querySelectorAll('#hire-tbody tr').length).toBe(2); // Jordan + Alex

      const refreshed = [
        { id: 'hire_1001', name: 'Jordan Reyes', startDate: '2026-10-05', department: 'Engineering', hireStage: 'offer_accepted', profileStatus: 'active' },
        { id: 'hire_1005', name: 'Sam Park', startDate: '2026-10-10', department: 'Engineering', hireStage: 'draft', profileStatus: 'active' },
        { id: 'hire_1002', name: 'Casey Kim', startDate: '2026-09-20', department: 'Sales', hireStage: 'draft', profileStatus: 'active' },
      ];
      api.list.mockResolvedValueOnce(refreshed);

      jest.advanceTimersByTime(REFRESH_INTERVAL_MS);
      await Promise.resolve();
      await Promise.resolve();

      expect(document.getElementById('filter-department').value).toBe('Engineering');
      const rows = document.querySelectorAll('#hire-tbody tr');
      expect(rows.length).toBe(2);
      expect(Array.from(rows).some((r) => r.textContent.includes('Casey Kim'))).toBe(false);
      expect(Array.from(rows).some((r) => r.textContent.includes('Sam Park'))).toBe(true);
      jest.useRealTimers();
    });
    ```
  - |
    Pure function — `filterHires` AND-combines every condition and no-ops on an empty filter set:
    ```js
    test('filterHires is a pure function that AND-combines every filter condition', () => {
      const { filterHires } = require('../public/js/hire-dashboard');
      const list = [
        { id: 'hire_a', name: 'A', department: 'Engineering', hireStage: 'draft', startDate: '2026-09-01' },
        { id: 'hire_b', name: 'B', department: 'Sales', hireStage: 'offer_accepted', startDate: '2026-09-05' },
      ];
      expect(filterHires(list, { department: 'Engineering' })).toEqual([list[0]]);
      expect(filterHires(list, { stage: 'offer_accepted', search: 'b' })).toEqual([list[1]]);
      expect(filterHires(list, {})).toEqual(list);
    });
    ```
  - |
    Resilience — a failed initial load shows a retry-able error state, and Retry recovers:
    ```js
    test('a failed initial load shows a retry-able error state instead of a blank dashboard', async () => {
      const failingApi = { list: jest.fn(() => Promise.reject(new Error('network error'))) };
      const { loadAndInit } = require('../public/js/hire-dashboard');
      await loadAndInit(document, failingApi);
      expect(document.getElementById('load-error').hidden).toBe(false);
      expect(document.getElementById('dashboard-content').hidden).toBe(true);
    });
    ```
  - |
    Resilience — a failed auto-refresh tick is swallowed and the interval keeps refreshing on the next tick:
    ```js
    test('an auto-refresh failure is swallowed so the interval keeps refreshing on the next tick', async () => {
      jest.useFakeTimers();
      api.list.mockRejectedValueOnce(new Error('refresh failed'));
      jest.advanceTimersByTime(REFRESH_INTERVAL_MS);
      await Promise.resolve();
      await Promise.resolve();
      expect(document.querySelectorAll('#hire-tbody tr').length).toBe(3);
      jest.useRealTimers();
    });
    ```

assumptions_or_open_questions:
  - |
    "Onboarding stage filter" (AC1) is assumed to mean the hire record's own `hireStage`
    field. In the current codebase that field only ever takes two values, `'draft'` and
    `'offer_accepted'` (see `src/hires/store.js`, `PATCHABLE_FIELDS` in
    `src/hires/routes.js`, and the stage `<select>` in `public/js/hire-profile.js`) — there is
    no broader per-hire pipeline-stage taxonomy anywhere in the repo yet, even though the
    parent epic mentions "per-hire pipeline status". If a richer stage/status model is coming
    in a later story, this filter's option list will need to grow with it.
  - |
    No page in this repo currently links to a "dashboard" — this plan adds
    `public/hire-dashboard.html` as a new, standalone entry point (reachable at
    `/hire-dashboard.html`) but does not add a nav link to it from `hire-profile.html`,
    `guest-profiles.html`, or `index.html`, since none of the 6 ACs ask for navigation/wiring
    between pages.
  - |
    Filtering is entirely client-side against the full result of `GET /hires` (matching the
    existing `guest-profiles.js`/`expenses.js` precedent), not a new server-side query-param
    contract on `src/hires/routes.js`. If the real hire list is expected to grow large enough
    that shipping the full list to the client every refresh becomes a real cost, that would be
    a separate, larger backend-filtering story.
  - |
    "Auto-refreshes" (AC6) is implemented as a plain client-side `setInterval` poll of
    `GET /hires` (no existing polling/auto-refresh pattern was found anywhere else in this
    codebase to match). The interval length (`REFRESH_INTERVAL_MS = 10000`, i.e. 10s) is an
    arbitrary placeholder pending product input on the real desired cadence.
  - |
    The department filter's options are the fixed list `['Engineering', 'Product', 'Sales',
    'People Ops', 'Finance']`, matching the `DEPARTMENTS` array already hardcoded in
    `public/js/hire-profile.js`'s role/department edit modal, rather than being derived
    dynamically from whatever departments happen to be present in the current hire data.
  - |
    No row-level action (e.g. a "View profile" link into `hire-profile.html`) is added to the
    dashboard table, since none of the 6 ACs ask for navigation and `hire-profile.html`
    currently has no way to deep-link to a specific hire by ID (it always loads `hires[0]`).
  - |
    None of the 6 ACs explicitly ask for handling of a failed `GET /hires` call, on either the
    initial load or an auto-refresh tick. This plan adds a minimal retry-able error state for
    the initial load and a swallowed-and-logged failure for auto-refresh ticks anyway, since
    without it a transient network error on first load leaves the page permanently blank with
    no recovery path, and an unhandled rejection on a refresh tick would surface as a console
    error with no user-facing signal. This is treated as necessary-for-correctness baseline
    behavior rather than speculative scope creep, but a reviewer who considers it out of scope
    for this story should flag it for a follow-up instead.

package_dependencies: []

notes: |
  The only existing files this story reads (but does not modify) are `src/hires/routes.js`
  and `src/hires/store.js` — confirmed `GET /hires` already returns every field
  (`id`, `name`, `department`, `startDate`, `hireStage`, `profileStatus`) this page filters
  on, so no backend change is in scope. Styling follows the same "one CSS file per page, plus
  shared `design-system/prototype-utils.css` for app-shell/topbar/modal/toast" convention used
  by `public/css/expenses.css`, `public/css/hire-profile.css`, and
  `public/css/guest-profiles.css`. `escapeHtml`/`formatDateDisplay` are pulled from the
  existing shared `public/js/utils.js` rather than reimplemented per-page.

  ```mermaid
  flowchart TD
    HTML["public/hire-dashboard.html<br/>(new)"] -->|loads| JS["public/js/hire-dashboard.js<br/>(new)"]
    JS -->|"fetch('/hires') on load + every REFRESH_INTERVAL_MS"| ROUTE["src/hires/routes.js<br/>GET /<br/>(read only, unchanged)"]
    ROUTE -->|listHires| STORE["src/hires/store.js<br/>(unchanged)"]
    JS -->|"require escapeHtml, formatDateDisplay"| UTILS["public/js/utils.js<br/>(existing, unchanged)"]
    JS -->|renders into| HTML
    TEST["test/hire-dashboard.test.js<br/>(new)"] -->|requires + drives DOM events on| JS
    TEST -->|loads fixture markup from| HTML

    classDef touched fill:#f96,color:#000
    classDef untouched fill:#eee,color:#000
    class HTML,JS,TEST touched
    class ROUTE,STORE,UTILS untouched
  ```

review_focus: |
  In scope: a new, standalone `hire-dashboard.html` page with client-side-only filtering
  (stage/search/department/date-range) over the existing `GET /hires` response, a
  "Clear filters" reset, a `setInterval` auto-refresh that re-applies whatever filters are
  currently set in the DOM, and a minimal retry-able error state for a failed initial load /
  swallowed-and-logged auto-refresh failure. Out of scope: any change to `src/hires/routes.js`
  or `src/hires/store.js`, server-side filtering, navigation/nav-links into or out of this
  page, and row-level actions (e.g. linking to `hire-profile.html`). The riskiest area is the
  auto-refresh path (AC6): `render()` must always re-read filter values live from the DOM
  controls rather than from any cached/closure-captured filter state, otherwise a refresh
  tick would silently reset or ignore active filters — the AC6 test asserts on both the
  survived filter *value* and the re-filtered *row contents* after a mocked refresh tick to
  catch that class of bug. The initial-load/auto-refresh error handling was added beyond the
  letter of the 6 ACs (see `assumptions_or_open_questions`); treat it as intentional baseline
  robustness, not scope creep, unless the reviewer explicitly wants it split into a separate
  story.
