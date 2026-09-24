summary: |
  Re-enable the disabled "Employees" nav link in the existing single-page Expense
  Tracker shell (`public/index.html`) and route it to a minimal placeholder section,
  proving client-side navigation works end-to-end without building any real Employees
  feature. The app has no SPA framework or router library today — `public/index.html`
  is one static page whose `<nav class="app-nav">` already contains a dead
  `<a href="#" onclick="return false;">Employees</a>` link, and `public/js/expenses.js`
  renders the expense table into that same page. This plan turns that one page into a
  minimal two-section shell (a `#section-expenses` section holding the existing
  expense-table markup unchanged, and a new `#section-employees` placeholder section)
  and adds a small new `public/js/nav.js` module that toggles which section is visible
  on nav-link click and on `hashchange`, matching the click-to-swap/hash-routing
  behavior already demonstrated in the approved prototype at
  `.arc/designs/TEST-M1-STORY-089-design.html`. No backend routes, no new Employees
  data model, and no changes to `src/employees/**` (that existing employee-record API
  is unrelated to this nav-placeholder story) are in scope.

scope:
  - description: |
      In `public/index.html`, re-enable the Employees link and wrap the existing
      expense-page body in an `#section-expenses` section so it can be shown/hidden as
      a unit.

      Before (nav, current file lines 16-19):
      ```html
      <nav class="app-nav">
        <a href="#" class="active" aria-current="page">Expenses</a>
        <a href="#" onclick="return false;">Employees</a>
      </nav>
      ```
      After:
      ```html
      <nav class="app-nav" aria-label="Primary">
        <a href="#/expenses" class="active" aria-current="page" data-nav="expenses">Expenses</a>
        <a href="#/employees" data-nav="employees">Employees</a>
      </nav>
      ```

      Before (page body, currently a direct child of `<body>`, lines 22-81):
      ```html
      <div class="page">
        <div class="page-header page-header-row"> ... </div>
        <form role="search" ...> ... </form>
        ...
        <div class="card table-card"> ... expense-table ... </div>
      </div>
      ```
      After (same markup, now wrapped — no attributes on the inner elements change, so
      every existing `getElementById` call in `expenses.js` and every existing
      DOM-based test that loads this fixture keeps working unmodified):
      ```html
      <section id="section-expenses" class="app-section" data-section="expenses">
        <div class="page">
          <div class="page-header page-header-row"> ... </div>
          <form role="search" ...> ... </form>
          ...
          <div class="card table-card"> ... expense-table ... </div>
        </div>
      </section>
      ```

      The edit/create modals and the toast (lines 84-197) stay exactly where they are
      today — siblings after the page content, before `</body>` — rather than being
      nested inside the new section, since they are already positioned via
      `position: fixed` and gated purely by their own `hidden` attributes, so moving
      them isn't needed and not moving them means zero risk to the modal wiring in
      `expenses.js` or to `test/expenses.test.js` / `test/expenses-create.test.js` /
      `test/expenses-filter.test.js`.
    files:
      - public/index.html
    rationale: |
      AC1 needs the Employees link to be a real, clickable, routable link instead of a
      dead `onclick="return false;"` stub. AC2 ("renders within the same application
      shell") is satisfied more strongly by keeping ONE topbar/nav in the DOM and
      toggling which section is visible underneath it, rather than literally
      duplicating the topbar per screen the way the static two-screen prototype does
      (the prototype duplicates the topbar because it's a `display:none`-swapped
      clickthrough of two independent mock screens; a real single-page shell should
      reuse one topbar instance). `data-nav`/`data-section` attributes are the hook
      `nav.js` uses to know which link maps to which section.

  - description: |
      In `public/index.html`, add the Employees placeholder section, using the exact
      heading, body copy, icon markup, and "In development" chip from the approved
      design's `employees-placeholder` screen
      (`.arc/designs/TEST-M1-STORY-089-design.html` lines 532-565):
      ```html
      <section id="section-employees" class="app-section" data-section="employees" hidden>
        <div class="page">
          <div class="page-header">
            <h1>Employees</h1>
            <p>Manage the people who submit and approve expenses.</p>
          </div>
          <div class="card placeholder-card">
            <svg class="placeholder-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
              <circle cx="9" cy="8" r="3"></circle>
              <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"></path>
              <circle cx="17" cy="9" r="2.5"></circle>
              <path d="M15.5 14.2c1.9.4 3.5 2 3.5 5.8"></path>
            </svg>
            <p class="placeholder-title">Employees is coming soon</p>
            <p class="placeholder-body">
              We're building out employee records, roles, and approval routing. For now this
              section is a placeholder — check back soon for the full experience.
            </p>
            <span class="placeholder-chip">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M12 8v4l2.5 2.5"></path></svg>
              In development
            </span>
          </div>
        </div>
      </section>
      ```
      This section starts with the native `hidden` attribute set (default browser UA
      style is `[hidden] { display: none; }`, no extra CSS required) so on first page
      load only Expenses shows, matching current behavior.
    files:
      - public/index.html
    rationale: |
      AC3 requires a visible "coming soon" heading/message — copied verbatim from the
      approved prototype rather than invented. AC4 requires no expense-specific UI in
      this section — deliberately no `<table>`, no `+ Add expense` button, no chips
      tied to expense categories; the only "chip"-styled element is the generic
      `.placeholder-chip` status pill ("In development"), which is not
      expense-specific.

  - description: |
      Add `public/js/nav.js`, a new module following the same shape as
      `public/js/expenses.js` (`module.exports` of testable functions plus a
      `DOMContentLoaded` auto-init guarded by `typeof window !== 'undefined'`, mirroring
      the `window.addEventListener('DOMContentLoaded', () => initExpensesApp());` guard
      at the end of `expenses.js`). It owns showing/hiding `.app-section` elements and
      keeping the clicked nav link's active state and the URL hash in sync — this is
      the "routing" the ACs refer to, since the app has no router library.

      Public shape:
      ```js
      function activateSection(doc, sectionName) { /* ... */ }
      function initNav(doc = document) { /* ... */ }
      module.exports = { initNav, activateSection, HASH_TO_SECTION };
      ```

      `activateSection(doc, sectionName)`:
      - Sets `.hidden` on every `.app-section` to `section.dataset.section !== sectionName`.
      - For every `[data-nav]` link: toggles `.active` and sets/removes
        `aria-current="page"` based on whether `link.dataset.nav === sectionName`.

      `initNav(doc)`:
      - Attaches a `click` handler to every `[data-nav]` link that calls
        `e.preventDefault()`, calls `activateSection(doc, link.dataset.nav)`, then sets
        `doc.defaultView.location.hash = '#/' + link.dataset.nav` (this is the "browser
        navigates" behavior AC1/AC6 exercise — no full page reload, no server
        round-trip, so no opportunity for a network/JS error there).
      - Attaches a `hashchange` listener on `doc.defaultView` that re-derives the
        section from `HASH_TO_SECTION[location.hash]` and calls `activateSection`, so
        back/forward and manually-edited hashes stay in sync (mirrors the design's
        "Deep-link support" script comment).
      - On init, activates whichever section matches the current hash, defaulting to
        `'expenses'` if the hash is empty or unrecognized, so a fresh load behaves
        exactly as it does today.

      Wire it into the page by adding, in `public/index.html`'s `<head>`, right after
      the existing `expenses.js` tag:
      ```html
      <script src="./js/nav.js" defer></script>
      ```
    files:
      - public/js/nav.js
      - public/index.html
    rationale: |
      Isolating routing in its own module keeps `expenses.js` (already large, and
      covered by several passing test files) untouched — it never needs to know about
      the Employees section. This is also the natural seam for the parent epic's later
      "unified routing" work to replace with a real router without re-touching
      `expenses.js`.

  - description: |
      Add the placeholder card styling and the nav-link hover/active transition to
      `public/css/expenses.css` (the page-specific stylesheet already loaded by
      `index.html`), copied from the approved design's page-specific `<style>` block
      (lines 376-420 of the design file) since none of these classes exist in the
      shared `design-system/prototype-utils.css` yet:
      ```css
      .placeholder-card { text-align: center; padding: var(--space-4) var(--space-3); }
      .placeholder-icon { margin: 0 auto var(--space-3); width: 48px; height: 48px; color: var(--color-fg-muted); }
      .placeholder-title { font-family: var(--font-family-base); font-size: var(--font-size-lg); font-weight: var(--font-weight-bold); color: var(--color-fg); margin: 0 0 var(--space-2); }
      .placeholder-body { font-family: var(--font-family-base); font-size: var(--font-size-md); color: var(--color-fg-muted); max-width: 46ch; margin: 0 auto; }
      .placeholder-chip {
        display: inline-flex; align-items: center; gap: var(--space-1);
        margin-top: var(--space-3); padding: var(--space-1) var(--space-3);
        background: var(--chip-default-background); color: var(--chip-default-foreground);
        border: 1px solid var(--color-border); border-radius: var(--radius-lg);
        font-family: var(--font-family-base); font-size: var(--font-size-sm);
        font-weight: var(--font-weight-bold);
      }
      .app-nav a { transition: color 150ms ease-out, border-color 150ms ease-out; }
      @media (prefers-reduced-motion: reduce) {
        .app-nav a { transition: none; }
      }
      ```
      All values are existing tokens confirmed present in `design-system/tokens.css`
      (`--space-1` through `--space-4`, `--color-fg`, `--color-fg-muted`,
      `--chip-default-background`, `--chip-default-foreground`, `--color-border`,
      `--radius-lg`, `--font-family-base`, `--font-weight-bold`, `--font-size-lg`,
      `--font-size-md`, `--font-size-sm`) — no hardcoded colors/spacing, per UI
      guideline §0/§2.
    files:
      - public/css/expenses.css
    rationale: |
      UI guideline §4 requires visible feedback, and §10 requires purposeful,
      `prefers-reduced-motion`-aware motion on the nav's active-state change; the
      design's own page-specific style block already establishes this exact transition
      for the nav-click "flash", so it's reused verbatim rather than reinvented.

  - description: |
      Add `test/employees-nav.test.js`, a jsdom test (matching the existing
      `test/expenses.test.js` pattern: `/** @jest-environment jsdom */`, reads
      `public/index.html` into `document.documentElement.innerHTML` via
      `fs.readFileSync`, then requires and calls the real init function(s) against
      `document`) covering AC1-AC6. Both `initExpensesApp` and `initNav` are
      initialized in `beforeEach` so the shell behaves exactly as it will in the
      browser (nav needs the expense table present to prove AC4/AC6 meaningfully).
    files:
      - test/employees-nav.test.js
    rationale: |
      Test-first: every assertion in the `tests` list below is written to fail against
      the current `index.html` (no `data-nav` attributes, no `#section-employees`, no
      `nav.js`) before the scope items above are implemented.

tests:
  - |
    AC1 — clicking Employees navigates without a JS error, and the hash reflects the
    new location (standing in for "the browser navigates", since this app has no
    path-based router):
    ```js
    test('clicking the Employees nav link navigates without throwing a JS error', () => {
      expect(() => {
        document.querySelector('[data-nav="employees"]').click();
      }).not.toThrow();
      expect(window.location.hash).toBe('#/employees');
    });
    ```
  - |
    AC2 — the placeholder renders inside the same shell: exactly one topbar/nav in the
    DOM, with the Expenses link still reachable through it:
    ```js
    test('the Employees section renders inside the same topbar and nav as Expenses', () => {
      document.querySelector('[data-nav="employees"]').click();
      expect(document.querySelectorAll('.app-topbar').length).toBe(1);
      expect(document.querySelector('.app-nav [data-nav="expenses"]')).not.toBeNull();
    });
    ```
  - |
    AC3 — a visible coming-soon heading:
    ```js
    test('the Employees placeholder shows a coming-soon heading', () => {
      document.querySelector('[data-nav="employees"]').click();
      const heading = document.querySelector('#section-employees .placeholder-title');
      expect(heading.textContent).toMatch(/coming soon/i);
    });
    ```
  - |
    AC4 — no expense table or expense-specific UI inside the placeholder section:
    ```js
    test('the Employees section renders no expense table or expense-specific controls', () => {
      document.querySelector('[data-nav="employees"]').click();
      const section = document.getElementById('section-employees');
      expect(section.querySelector('table.expense-table')).toBeNull();
      expect(section.querySelector('#add-expense-btn')).toBeNull();
    });
    ```
  - |
    AC5 — the Expenses nav link stays visible and reachable while viewing the
    placeholder:
    ```js
    test('the Expenses nav link remains visible while viewing the Employees placeholder', () => {
      document.querySelector('[data-nav="employees"]').click();
      const expensesLink = document.querySelector('[data-nav="expenses"]');
      expect(expensesLink).not.toBeNull();
      expect(expensesLink.hidden).toBe(false);
    });
    ```
  - |
    AC6 — clicking Expenses from the placeholder navigates back to the expense table:
    ```js
    test('clicking Expenses from the placeholder navigates back to the expense table', () => {
      document.querySelector('[data-nav="employees"]').click();
      document.querySelector('[data-nav="expenses"]').click();
      expect(document.getElementById('section-expenses').hidden).toBe(false);
      expect(document.getElementById('section-employees').hidden).toBe(true);
      expect(document.querySelector('#section-expenses table.expense-table')).not.toBeNull();
    });
    ```

assumptions_or_open_questions:
  - |
    No Employees data/API work is in scope. `src/employees/routes.js` and
    `src/employees/store.js` already exist and were read while planning — they
    implement a POST/GET single-employee-record API used by `test/employees.test.js`
    — but they are unrelated to this story's nav-placeholder UI and are left
    untouched.
  - |
    "The browser navigates" (AC1) is implemented as an in-page section swap plus a
    `location.hash` update (`#/expenses` / `#/employees`), not a real path change or
    server round-trip — this app has no router library and no server-rendered routes
    for `/employees` today, and the approved design's own script explicitly simulates
    routing this same way ("Simulated client-side routing (AC1, AC6)" / "standing in
    for real client-side routing"). No change to `src/server.js` static routing is
    needed since a hash never reaches the server.
  - |
    The design's two "screens" each duplicate the topbar/nav markup because the
    prototype is a static clickthrough of two mock screens toggled with
    `display:none`. The real implementation instead keeps one topbar/nav DOM instance
    and toggles which `.app-section` beneath it is visible — a stricter reading of AC2
    ("renders within the same application shell") than literal duplication would
    satisfy, and there is no conflict with the design's visual content, only with its
    static-prototype mechanics.

package_dependencies: []

notes: |
  This app is plain server-static HTML/CSS/JS served by Express (`src/server.js` via
  `express.static`) — there is no React/Next/SPA framework and no client-side router
  dependency anywhere in the repo today, so "routing" here means the same
  hash-plus-visibility-toggle mechanism the approved prototype already demonstrates,
  kept as a small standalone module (`nav.js`) rather than folded into `expenses.js`.

  Verified directly against the current repo before writing this plan: `public/index.html`
  lines 16-19 (nav with the dead Employees link) and lines 22-81 (page body) match the
  "before" snippets above exactly; `public/js/expenses.js` ends with
  `window.addEventListener('DOMContentLoaded', () => initExpensesApp());` guarded by
  `typeof window !== 'undefined'`, confirming the pattern `nav.js` should mirror;
  `test/expenses.test.js` confirms the jsdom fixture-loading pattern `employees-nav.test.js`
  should follow; every CSS custom property referenced in scope item 4 exists in
  `design-system/tokens.css`; and the design file's placeholder screen
  (lines 532-565) and page-specific `<style>` block (lines 376-420) match the markup
  and CSS quoted in scope items 2 and 4 verbatim. No drift found — the plan as
  originally drafted still fits the current code.

  ```mermaid
  flowchart TD
    IndexHTML["public/index.html<br/>topbar, nav links, sections"]
    NavJS["public/js/nav.js<br/>initNav / activateSection (new)"]
    ExpensesJS["public/js/expenses.js<br/>initExpensesApp (unchanged)"]
    ExpensesCSS["public/css/expenses.css<br/>placeholder + nav-transition styles"]
    TestFile["test/employees-nav.test.js (new)"]

    IndexHTML -->|"script defer, new tag"| NavJS
    IndexHTML -->|"script defer, unchanged"| ExpensesJS
    NavJS -->|"toggles hidden on #section-expenses / #section-employees, sets .active"| IndexHTML
    ExpensesCSS -->|"styles .placeholder-card, .app-nav a"| IndexHTML
    TestFile -->|"loads fixture, calls initNav + initExpensesApp"| IndexHTML
    TestFile -->|"requires"| NavJS

    classDef touched fill:#f96,color:#000
    class IndexHTML,NavJS,ExpensesCSS,TestFile touched
  ```
