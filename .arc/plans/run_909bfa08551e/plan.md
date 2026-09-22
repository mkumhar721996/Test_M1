summary: |
  This repo currently has no expense feature at all — only an unrelated Express `employees`
  API (in-memory store, no frontend, no static file serving) and shared design-system CSS
  tokens. TEST-M1-STORY-032 is being planned before any "create"/"list" expense story exists,
  so this plan builds the minimal expense list + edit-via-modal frontend the ACs require,
  taking layout, markup, and behavior directly from the approved prototype at
  `.arc/designs/TEST-M1-STORY-032-design.html` (the "Expense List" interactive screen). The
  feature is entirely client-side vanilla JS/HTML/CSS backed by `localStorage`, matching AC4's
  explicit persistence requirement and the design's own implementation (no network calls, no
  new backend routes). The existing Express app is extended only to serve this as static
  content; the `employees` module is untouched.
scope:
  - description: |
      Add `jest-environment-jsdom` as a new devDependency so the new test suite can run real
      DOM interactions (clicks, form submits) against markup loaded from `public/index.html`.
      The existing `test/employees.test.js` suite is unaffected: it stays on Jest's default
      `node` test environment, and the new suite opts into jsdom per-file via the docblock
      `/** @jest-environment jsdom */`, so no global Jest config changes are needed.
    files:
      - package.json
    rationale: |
      Jest 28+ moved the jsdom environment out of `jest-core` into a separate installable
      package; without it, `testEnvironment: 'jsdom'` (or the docblock) throws
      `Test environment jest-environment-jsdom cannot be found`. Scoping it to one file via
      docblock avoids touching the `employees` suite's environment.
  - description: |
      Add `public/index.html`: the real Expense List page, built from the design's first
      `<div class="screen" data-name="Expense List">` block (design file lines 508-602) —
      topbar with "Expense Tracker" brand and an "Expenses" (active) / "Employees" nav (the
      "Employees" link stays inert via `onclick="return false;"`, exactly as in the approved
      design, since building an Employees UI is out of scope here), the `page-header`, the
      `card table-card` wrapping `table.expense-table` with columns Date / Category /
      Description / Amount / Actions and an empty `<tbody id="expense-tbody">` ("rendered by
      JS" per the design's own comment), the `#modal-overlay` / `#modal-wrap` edit dialog with
      fields `#field-amount` (with `$` prefix span), `#field-date`, `#field-category` (a
      `<select>` with options "", Travel, Meals, Software, Office Supplies, Other) and
      `#field-description`, each required field paired with a `hidden` `<p class="field-error"
      role="alert">`, and the `#toast` confirmation banner. It links
      `../design-system/tokens.css` and `../design-system/prototype-utils.css` (already in the
      repo, unmodified) plus the new `./css/expenses.css`, and loads `./js/expenses.js` with
      `defer`.
      Excluded from this file, per the design's own comments distinguishing real UI from
      reviewer aids: the "← Prev / Next →" reviewer bar, the entire second
      `data-name="Edit Modal — Reference States"` screen (explicitly labeled "Non-interactive
      snapshots... Use screen 1 to try the real flow"), and the "Reset demo data" button (a
      demo-only convenience, not described by any AC).
    files:
      - public/index.html
    rationale: |
      AC1 requires "viewing the expense list" and an edit action that opens a pre-populated
      modal; this is the page that provides both, using the exact structure/ids the approved
      design specifies so the JS in the next scope item can bind to them predictably.
  - description: |
      Add `public/css/expenses.css`: the app-specific rules from the design's third `<style>`
      block (design file lines 206-433) — `.app-topbar`/`.app-nav`, `.page`/`.page-header`,
      `.expense-table` (incl. `.col-amount`, `.col-actions`, `.desc-cell`, `.empty-row`, the
      `row-updated` flash-on-save animation with a `prefers-reduced-motion` override),
      `.modal-overlay`/`.modal-wrap`/`.modal-panel`/`.modal-header`/`.modal-actions`,
      `.amount-input-wrap`/`.amount-prefix`, `.input-invalid`/`.field-error`, and `.toast`.
      Excludes the reviewer-only `#review-bar button` rule and the reference-screen-only
      `.reference-grid`/`.mini-modal`/`.ac-tag` rules, since those elements aren't part of the
      shipped page. Per the design's own inline comment (lines 195-204), inline validation is
      signalled with an icon + bold text + a heavier `--color-primary` border rather than an
      invented red/danger color, since `tokens.json` has no danger token today — this rule is
      carried over unchanged.
    files:
      - public/css/expenses.css
    rationale: |
      Keeps app-specific styling out of the shared, auto-generated `design-system/*.css` files
      (which are marked "Do not edit directly") while reproducing the approved visual design
      exactly.
  - description: |
      Add `public/js/expenses.js`, the core logic ported from the design's `<script>` block
      (lines 713-923) and reorganized into testable, exported functions:
      ```js
      const STORAGE_KEY = 'expenses';
      const CATEGORIES = ['Travel', 'Meals', 'Software', 'Office Supplies', 'Other'];
      const INITIAL_EXPENSES = [
        { id: 'exp_001', date: '2026-09-02', category: 'Travel', description: 'Flight to Chicago client site', amount: 482.50 },
        { id: 'exp_002', date: '2026-09-05', category: 'Meals', description: 'Team lunch — Q3 kickoff', amount: 96.18 },
        { id: 'exp_003', date: '2026-09-10', category: 'Software', description: 'Figma seat renewal', amount: 15.00 },
      ];

      function loadExpenses() { /* reads STORAGE_KEY from localStorage, seeds INITIAL_EXPENSES on first run */ }
      function persistExpenses(list) { /* localStorage.setItem(STORAGE_KEY, JSON.stringify(list)) */ }
      function formatUSD(amount) {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
      }
      function validateExpenseFields({ amount, date, category }) {
        const amountValue = parseFloat(amount);
        return {
          amount: (amount === '' || Number.isNaN(amountValue) || amountValue <= 0) ? 'Amount is required.' : null,
          date: date === '' ? 'Date is required.' : null,
          category: category === '' ? 'Category is required.' : null,
        };
      }
      function initExpensesApp(doc = document) { /* renders the list, wires Edit/Cancel/close/backdrop/Esc/submit exactly as the design's script does, using validateExpenseFields + persistExpenses */ }

      module.exports = { STORAGE_KEY, CATEGORIES, INITIAL_EXPENSES, loadExpenses, persistExpenses, formatUSD, validateExpenseFields, initExpensesApp };
      if (typeof window !== 'undefined') {
        window.addEventListener('DOMContentLoaded', () => initExpensesApp());
      }
      ```
      `initExpensesApp` preserves the design's exact interaction details: Cancel button,
      `#modal-close-btn`, backdrop click, and Escape key all call the same discard path
      (AC6/AC7); a valid submit disables `#modal-save-btn` and sets its text to "Saving…" for a
      simulated 350ms (matching the design) before persisting, closing the modal, and
      re-rendering with the `row-updated` flash — this delay is UI polish carried over from the
      approved design, not itself required by any AC.
    files:
      - public/js/expenses.js
    rationale: |
      Isolating fixtures/storage/formatting/validation/DOM-wiring into one `module.exports`-ed
      file is what lets `test/expenses.test.js` drive real interactions in jsdom and assert
      on `formatUSD`/`validateExpenseFields` directly, while the same file works unmodified in
      a real browser via the `DOMContentLoaded` bootstrap.
  - description: |
      Modify `src/server.js` to serve `public/` as static content:
      ```js
      const express = require('express');
      const path = require('path');
      const employeesRouter = require('./employees/routes');

      const app = express();
      app.use(express.json());
      app.use('/employees', employeesRouter);
      app.use(express.static(path.join(__dirname, '..', 'public')));

      module.exports = app;
      ```
      `express.static` serves `public/index.html` for `GET /`, `public/css/expenses.css` for
      `GET /css/expenses.css`, etc. The `employees` router and its tests are unaffected — this
      only adds a new middleware line.
    files:
      - src/server.js
    rationale: |
      Without this, the built expense page is unreachable through the running app; it's the
      minimal change to make "the user is viewing the expense list" (AC1) true against the
      real server, without introducing any new expense HTTP routes (none are needed — all
      persistence is client-side `localStorage`, per AC4).
  - description: |
      Add `test/expenses.test.js`: a jsdom-based suite (opted in via
      `/** @jest-environment jsdom */`) that loads the real `public/index.html` markup into
      `document.documentElement.innerHTML` via `fs.readFileSync`, clears `localStorage`,
      `require`s `initExpensesApp` from `public/js/expenses.js` fresh each test (`jest.resetModules()`),
      calls it against `document`, and then drives the page exactly as a user would (clicking
      the rendered `[data-edit-id]` Edit button, filling `#field-amount`/`#field-date`/
      `#field-category`/`#field-description`, submitting `#edit-form`). Uses
      `jest.useFakeTimers()` / `jest.advanceTimersByTime(350)` to settle the design's simulated
      save latency deterministically. One test per acceptance criterion (see `tests` below).
    files:
      - test/expenses.test.js
    rationale: |
      This is the test-first artifact for AC1-AC8; loading the actual `public/index.html`
      rather than a hand-rolled fixture means the tests fail if the real markup's ids/structure
      ever drift from what the JS expects, instead of only testing an idealized copy of it.
tests:
  - |
    AC1 — activating Edit opens a modal pre-populated with the record's current values:
    ```js
    test('activating Edit opens a modal pre-populated with the record\'s current values', () => {
      document.querySelector('[data-edit-id="exp_001"]').click();
      expect(document.getElementById('modal-wrap').hidden).toBe(false);
      expect(document.getElementById('field-amount').value).toBe('482.50');
      expect(document.getElementById('field-date').value).toBe('2026-09-02');
      expect(document.getElementById('field-category').value).toBe('Travel');
      expect(document.getElementById('field-description').value).toBe('Flight to Chicago client site');
    });
    ```
    Fails until `public/index.html` and `public/js/expenses.js` exist and `initExpensesApp`
    wires the Edit button to populate the modal fields from the matching record.
  - |
    AC2 — clearing a required field and submitting keeps the modal open with an inline error:
    ```js
    test('clearing Amount and submitting keeps the modal open with an inline error below it', () => {
      document.querySelector('[data-edit-id="exp_001"]').click();
      document.getElementById('field-amount').value = '';
      document.getElementById('edit-form').dispatchEvent(new Event('submit', { cancelable: true }));
      expect(document.getElementById('modal-wrap').hidden).toBe(false);
      expect(document.getElementById('error-amount').hidden).toBe(false);
      expect(document.getElementById('error-amount').textContent).toMatch(/Amount is required/);
    });
    ```
    Fails until the submit handler calls `validateExpenseFields`, keeps the modal open on
    failure, and un-hides the matching `.field-error` element.
  - |
    AC3 — a valid submit closes the modal:
    ```js
    test('submitting with all required fields valid closes the modal', () => {
      document.querySelector('[data-edit-id="exp_001"]').click();
      document.getElementById('field-amount').value = '512.50';
      document.getElementById('edit-form').dispatchEvent(new Event('submit', { cancelable: true }));
      jest.advanceTimersByTime(350);
      expect(document.getElementById('modal-wrap').hidden).toBe(true);
    });
    ```
    Fails until a fully-valid submit persists and hides `#modal-overlay`/`#modal-wrap`.
  - |
    AC4 — the updated record is persisted to localStorage:
    ```js
    test('a valid submit persists the updated record to localStorage', () => {
      document.querySelector('[data-edit-id="exp_001"]').click();
      document.getElementById('field-amount').value = '512.50';
      document.getElementById('edit-form').dispatchEvent(new Event('submit', { cancelable: true }));
      jest.advanceTimersByTime(350);
      const stored = JSON.parse(localStorage.getItem('expenses'));
      expect(stored.find(e => e.id === 'exp_001').amount).toBe(512.5);
    });
    ```
    Fails until the submit handler calls `persistExpenses` with the updated record included.
  - |
    AC5 — the list reflects the updated values immediately:
    ```js
    test('the list row shows the updated amount immediately after saving', () => {
      document.querySelector('[data-edit-id="exp_001"]').click();
      document.getElementById('field-amount').value = '512.50';
      document.getElementById('edit-form').dispatchEvent(new Event('submit', { cancelable: true }));
      jest.advanceTimersByTime(350);
      const row = document.querySelector('[data-edit-id="exp_001"]').closest('tr');
      expect(row.querySelector('.col-amount').textContent).toBe('$512.50');
    });
    ```
    Fails until the submit handler re-renders `#expense-tbody` from the updated in-memory list
    right after persisting.
  - |
    AC6 — cancelling the modal preserves the original record values:
    ```js
    test('cancelling the modal discards in-progress edits to the record', () => {
      document.querySelector('[data-edit-id="exp_001"]').click();
      document.getElementById('field-amount').value = '999.99';
      document.getElementById('modal-cancel-btn').click();
      const stored = JSON.parse(localStorage.getItem('expenses'));
      expect(stored.find(e => e.id === 'exp_001').amount).toBe(482.5);
    });
    ```
    Fails until Cancel discards the form's in-memory edits without calling `persistExpenses`.
  - |
    AC7 — cancelling the modal leaves the list unchanged:
    ```js
    test('cancelling the modal leaves the rendered list unchanged', () => {
      document.querySelector('[data-edit-id="exp_001"]').click();
      document.getElementById('field-amount').value = '999.99';
      document.getElementById('modal-cancel-btn').click();
      const row = document.querySelector('[data-edit-id="exp_001"]').closest('tr');
      expect(row.querySelector('.col-amount').textContent).toBe('$482.50');
      expect(document.getElementById('modal-wrap').hidden).toBe(true);
    });
    ```
    Fails until Cancel closes the modal without triggering a re-render that would pick up the
    discarded field value.
  - |
    AC8 — an edited amount displays as USD with a $ symbol and two decimal places:
    ```js
    test('formatUSD renders a $ symbol and exactly two decimal places', () => {
      const { formatUSD } = require('../public/js/expenses');
      expect(formatUSD(512.5)).toBe('$512.50');
      expect(formatUSD(15)).toBe('$15.00');
    });

    test('the saved row displays the amount as USD with two decimals', () => {
      document.querySelector('[data-edit-id="exp_003"]').click();
      document.getElementById('field-amount').value = '9';
      document.getElementById('edit-form').dispatchEvent(new Event('submit', { cancelable: true }));
      jest.advanceTimersByTime(350);
      const row = document.querySelector('[data-edit-id="exp_003"]').closest('tr');
      expect(row.querySelector('.col-amount').textContent).toBe('$9.00');
    });
    ```
    Fails until list rendering formats each row's amount through `formatUSD` rather than
    printing the raw number.
assumptions_or_open_questions:
  - |
    No prior "create/list expense" story exists anywhere in this repo (only an unrelated
    `employees` API). This plan seeds a small set of initial expense records directly in
    `public/js/expenses.js` (`INITIAL_EXPENSES`) so the list has data to view and edit; adding
    new expenses is left to a separate story under the parent epic, not built here.
  - |
    The localStorage key is `expenses`, not the design prototype's demo-specific
    `test-m1-story-032-expenses` key — the ACs only require persistence to localStorage, not a
    specific key name, and the prototype's key embeds the story id as a reviewer-demo
    convention.
  - |
    The design file's reviewer navigation bar, its second `data-name="Edit Modal — Reference
    States"` screen, and its "Reset demo data" button are prototype/reviewer aids (the file's
    own comments call the reference screen "non-interactive" and say to "use screen 1 to try
    the real flow") and are intentionally not built into the shipped page.
  - |
    No new backend routes are added for expenses: AC4 explicitly calls for localStorage
    persistence, and the approved design's script performs the entire edit flow client-side
    with no network calls, so `src/server.js` only gains static file serving, not an expense
    API.
  - |
    The Employees nav link in the topbar is kept inert (`onclick="return false;"`), exactly as
    the approved design shows it, since building an Employees frontend page is out of scope for
    this story.
package_dependencies:
  - name: jest-environment-jsdom
    version: ^29.7.0
    ecosystem: npm
    rationale: |
      Jest 28+ requires this as a separate package to use `testEnvironment: 'jsdom'` (or the
      `@jest-environment jsdom` docblock). Needed by `test/expenses.test.js` to render and
      interact with real DOM elements loaded from `public/index.html`; matches the already-
      installed `jest@^29.7.0`.
notes: |
  This plan's scope crosses from the server's static-file wiring down into a browser-only
  client module and the test suite that drives it through real markup, so the shape is worth
  diagramming:

  ```mermaid
  flowchart TD
    Server["src/server.js"] -->|express.static| HTML["public/index.html"]
    HTML -->|link rel=stylesheet| CSS["public/css/expenses.css"]
    HTML -->|script src, defer| JS["public/js/expenses.js"]
    HTML -.->|link, unmodified| Tokens["design-system/tokens.css"]
    HTML -.->|link, unmodified| Utils["design-system/prototype-utils.css"]
    JS -->|localStorage.setItem/getItem| Storage[(Browser localStorage)]
    Test["test/expenses.test.js"] -->|fs.readFileSync, sets innerHTML| HTML
    Test -->|require, calls initExpensesApp| JS

    classDef touched fill:#f96,color:#000
    class Server,HTML,CSS,JS,Test touched
  ```

  `src/employees/*` and `src/index.js` are untouched by this plan — the diagram omits them
  since neither the design nor any AC involves them. The existing `test/employees.test.js`
  suite keeps Jest's default `node` environment; only `test/expenses.test.js` opts into jsdom,
  so this plan does not change any global Jest configuration.
