summary: |
  This item builds the read-only Expense List View (M1-STORY-030): a small client-side page
  that reads expense records from localStorage on load and renders either an accessible empty
  state ("No expenses yet" + a call-to-action to add the first expense) or a list of expense
  rows showing amount, date, category, and description, most-recently-added-first. The approved
  design is the static prototype at `.arc/designs/TEST-M1-STORY-030-design.html`; its "Live
  Demo" screen explicitly annotates that the real Add Expense flow is a separate story, so this
  plan is deliberately read-only — AC3/AC4 are verified by seeding localStorage directly and
  confirming the renderer preserves and reproduces that order.

  Re-reading the current repo (not just the plan text carried over from an earlier pass) turned
  up a real change in baseline: this worktree is no longer greenfield. A prior "restart" commit
  reset the branch onto history that already includes an unrelated, previously-merged Express
  "employees" API (`package.json` with `express`/`jest`/`supertest`, `src/server.js`,
  `src/employees/store.js`, `src/employees/routes.js`, `test/employees.test.js`), while
  preserving only this story's approved design file. None of the expense-list application files
  (storage/render/format modules, `index.html`, any frontend build config) exist yet. This plan
  therefore adds the expense-list frontend as new files alongside that existing, untouched
  backend rather than assuming an empty repo, and edits `package.json` in place instead of
  overwriting it.
scope:
  - description: |
      Extend the existing `package.json` (do not overwrite — it already declares `express`,
      `jest`, and `supertest` for the unrelated employees API and must keep working) with a
      dev/build/test toolchain for the new vanilla-JS frontend: Vite as the dev/build tool
      (matching the approved prototype's own framework-free approach) and Vitest + jsdom for
      tests, run via a separate script so the existing `npm test` (jest, employees API) is left
      untouched.

      New scripts added to the existing `scripts` block:
      ```json
      "dev": "vite",
      "build": "vite build",
      "preview": "vite preview",
      "test:frontend": "vitest run"
      ```
      New `devDependencies` added (existing `jest`/`supertest`/`express` entries unchanged):
      ```json
      "vite": "^5.4.0",
      "vitest": "^2.1.0",
      "jsdom": "^25.0.0"
      ```

      `vite.config.js`:
      ```js
      import { defineConfig } from 'vite';

      export default defineConfig({
        server: { port: Number(process.env.ARC_WEB_PORT) || 5173 },
        preview: { port: Number(process.env.ARC_WEB_PORT) || 4173 },
        test: { environment: 'jsdom' },
      });
      ```
    files:
      - package.json
      - vite.config.js
    rationale: |
      Reading `src/index.js` shows the existing Express employees API already listens on
      `process.env.ARC_DEV_PORT` (falling back to 8036; `.env` sets `ARC_DEV_PORT=8030`).
      Binding the new frontend dev server to that same env var, as an earlier draft of this
      plan did before this repo state existed, would collide with that already-running
      listener. `ARC_WEB_PORT` (3030 in `.env`) is unclaimed by any existing code and is the
      natural "web/frontend" counterpart, so the new dev/preview servers bind to it instead —
      a deviation from the prior draft made specifically because reading the current code
      revealed the port conflict. `.gitignore` already ignores `node_modules/`, so no change
      is needed there.
  - description: |
      Add the storage-read module that safely loads the expense array from localStorage,
      tolerating missing or corrupt data.

      `src/storage.js`:
      ```js
      export const STORAGE_KEY = 'expenses';

      export function loadExpenses() {
        try {
          const raw = localStorage.getItem(STORAGE_KEY);
          const parsed = raw ? JSON.parse(raw) : [];
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [];
        }
      }
      ```
      This mirrors the prototype's own `loadExpenses` (design lines 741-749) minus the write
      side (`saveExpenses`), which is out of scope for this read-only story.
    files:
      - src/storage.js
      - tests/storage.test.js
    rationale: |
      AC1 and AC4 both depend on correctly reading (or safely defaulting) whatever is in
      localStorage before anything can render. Isolating this in its own module keeps it
      independently testable without touching the DOM.
  - description: |
      Add the currency/date formatting helpers the design's row markup requires.

      `src/format.js`:
      ```js
      export function formatCurrency(amount) {
        return '$' + Number(amount).toFixed(2);
      }

      export function formatDate(isoDate) {
        const d = new Date(isoDate + 'T00:00:00');
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      }
      ```
      Both functions are copied verbatim in behavior from the prototype's `formatCurrency`/
      `formatDate` (design lines 753-759), the only recorded spec for "$128.40" / "Sep 17, 2026"
      formatting.
    files:
      - src/format.js
      - tests/format.test.js
    rationale: |
      AC3 requires "USD, two decimal places with $ symbol" and a specific date rendering. The
      prototype is the only source of truth for the exact format, so these are extracted
      exactly as the design implements them rather than re-derived.
  - description: |
      Add the render module producing either the empty state or the populated list, taking its
      markup, classes, and accessible `sr-only` labelling directly from the design's "Empty
      State" screen (design lines 502-524) and "Populated List" screen (design lines 539-596).

      `src/render.js`:
      ```js
      import { formatCurrency, formatDate } from './format.js';

      function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
      }

      function formatCount(n) {
        return n + (n === 1 ? ' expense' : ' expenses');
      }

      function emptyStateHTML() {
        return `
          <div class="empty-state" role="status">
            <svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
              <rect x="4" y="3" width="16" height="18" rx="2"></rect>
              <path d="M8 8h8M8 12h8M8 16h5"></path>
            </svg>
            <h2 class="empty-state-title">No expenses yet</h2>
            <p class="empty-state-body">Start tracking your spending — add your first expense to see it listed here.</p>
            <button type="button" class="btn btn-primary" id="empty-add-first-btn">+ Add your first expense</button>
          </div>`;
      }

      function rowHTML(e) {
        return `<li class="expense-row">
          <div class="expense-primary">
            <span class="expense-amount"><span class="sr-only">Amount:</span> ${formatCurrency(e.amount)}</span>
            <span class="chip"><span class="sr-only">Category:</span> ${escapeHtml(e.category)}</span>
          </div>
          <p class="expense-description"><span class="sr-only">Description:</span> ${escapeHtml(e.description)}</p>
          <div class="expense-date u-text-sm u-text-muted"><span class="sr-only">Date:</span> <time datetime="${e.date}">${formatDate(e.date)}</time></div>
        </li>`;
      }

      function listHTML(expenses) {
        return `
          <p class="list-count">${formatCount(expenses.length)}</p>
          <ul class="expense-list" aria-label="Expenses, most recently added first">
            ${expenses.map(rowHTML).join('')}
          </ul>`;
      }

      export function renderExpenseList(container, expenses) {
        container.innerHTML = expenses.length === 0 ? emptyStateHTML() : listHTML(expenses);
      }
      ```
      This reproduces the prototype's own `expenseRowHTML`/`renderLiveDemo` logic (design lines
      760-793) as a pure `(container, expenses)` function with no localStorage access, so every
      acceptance criterion it covers is testable via a fixture array. `escapeHtml` is copied
      from the prototype (design lines 760-764) to avoid an XSS hole when rendering
      user-entered `category`/`description` text as HTML. Renders items in the order given —
      it does not sort — since ordering is the storage layer's/caller's contract (see
      assumptions on AC3/AC4).

      Deviation from the design: the "Populated List" screen's disabled header `+ Add expense`
      button (design line 549) is NOT rendered — no AC requires it, and in the prototype it is
      only a static mock of the "Live Demo" screen's control, which belongs to a future Add
      Expense story. Building a non-functional control with no AC backing it would be
      speculative UI.

      `src/style.css`:
      ```css
      @import '../design-system/tokens.css';
      @import '../design-system/prototype-utils.css';
      ```
      followed by the page-specific rules copied verbatim from the design's third `<style>`
      block (design lines 197-377): `.sr-only`, the `min-height: 44px` touch-target bump on
      `.btn`/`.input`/`.select`, `.select`, `.app-topbar*`, `.page`/`.page-header`,
      `.empty-state*`, `.expense-list`/`.expense-row`/`.expense-primary`/`.expense-amount`/
      `.expense-description`/`.expense-date` (including the `min-width: 640px` row-layout
      media query), and `.list-count` — these resolve entirely through design-system tokens
      already, per the design's own comment. The design's `.demo-note`/`.demo-actions`/
      `.add-form`/`.toast`/`.field-error` rules (design lines 379-468) are Live-Demo-screen-only
      and intentionally excluded.
    files:
      - src/render.js
      - src/style.css
      - tests/render.test.js
    rationale: |
      This is the core of AC1, AC3, and AC5. Keeping it a pure function of
      `(container, expenses)` with no localStorage access makes every acceptance criterion it
      covers testable via a fixture array, independent of storage or bootstrapping concerns.
  - description: |
      Wire the page entry point: `index.html` loads `src/style.css` and `src/main.js` as a
      native ES module, with the design's `.app-topbar` (brand "Expense Tracker", active
      "Expenses" nav item, design lines 503-508) and a `<div id="app">` mount point inside
      `<main class="page">`.

      `src/main.js`:
      ```js
      import { loadExpenses } from './storage.js';
      import { renderExpenseList } from './render.js';

      export function initApp(container) {
        renderExpenseList(container, loadExpenses());
      }

      if (typeof document !== 'undefined' && document.getElementById('app')) {
        initApp(document.getElementById('app'));
      }
      ```
    files:
      - index.html
      - src/main.js
      - tests/persistence.test.js
    rationale: |
      `initApp` is the seam AC4's test uses: calling it twice against the same localStorage
      state (simulating a page refresh, since jsdom/vitest has no real navigation) must produce
      an identical render, proving the read path is deterministic and storage-order-preserving
      without needing a browser E2E harness.
tests:
  - |
    AC3 (currency formatting) — `tests/format.test.js`:
    ```js
    import { test, expect } from 'vitest';
    import { formatCurrency } from '../src/format.js';

    test('formats amounts as USD with two decimals and a dollar sign', () => {
      expect(formatCurrency(9)).toBe('$9.00');
      expect(formatCurrency(128.4)).toBe('$128.40');
    });
    ```
  - |
    AC1/AC4 (safe read from localStorage) — `tests/storage.test.js`:
    ```js
    import { test, expect, beforeEach } from 'vitest';
    import { loadExpenses, STORAGE_KEY } from '../src/storage.js';

    beforeEach(() => localStorage.clear());

    test('returns an empty array when nothing is stored', () => {
      expect(loadExpenses()).toEqual([]);
    });

    test('returns an empty array when stored data is not valid JSON', () => {
      localStorage.setItem(STORAGE_KEY, 'not-json');
      expect(loadExpenses()).toEqual([]);
    });
    ```
  - |
    AC1 (empty state) — `tests/render.test.js`:
    ```js
    import { test, expect } from 'vitest';
    import { renderExpenseList } from '../src/render.js';

    test('shows the empty state with a prompt to add the first expense', () => {
      document.body.innerHTML = '<div id="app"></div>';
      renderExpenseList(document.getElementById('app'), []);
      expect(document.querySelector('.empty-state-title').textContent).toBe('No expenses yet');
      expect(document.querySelector('#empty-add-first-btn').textContent)
        .toContain('Add your first expense');
    });
    ```
  - |
    AC3 (populated row content: amount, date, category, description) —
    `tests/render.test.js`:
    ```js
    test('renders amount, date, category, and description for a saved expense', () => {
      document.body.innerHTML = '<div id="app"></div>';
      renderExpenseList(document.getElementById('app'), [
        { amount: 128.4, date: '2026-09-17', category: 'Utilities', description: 'Monthly electricity bill' },
      ]);
      const row = document.querySelector('.expense-row');
      expect(row.querySelector('.expense-amount').textContent).toContain('$128.40');
      expect(row.querySelector('time').textContent).toBe('Sep 17, 2026');
      expect(row.querySelector('.chip').textContent).toContain('Utilities');
      expect(row.querySelector('.expense-description').textContent).toContain('Monthly electricity bill');
    });
    ```
  - |
    AC4 (renders rows in the given array order, most-recent-first is the caller's/storage's
    contract) — `tests/render.test.js`:
    ```js
    test('renders rows in the order the expenses array is given, without re-sorting', () => {
      document.body.innerHTML = '<div id="app"></div>';
      renderExpenseList(document.getElementById('app'), [
        { amount: 1, date: '2026-09-10', category: 'Transport', description: 'first-in-array' },
        { amount: 2, date: '2026-09-17', category: 'Utilities', description: 'second-in-array' },
      ]);
      const descriptions = [...document.querySelectorAll('.expense-description')].map(n => n.textContent);
      expect(descriptions[0]).toContain('first-in-array');
      expect(descriptions[1]).toContain('second-in-array');
    });
    ```
  - |
    AC5 (accessible text for amount/date/category/description) — `tests/render.test.js`:
    ```js
    test('exposes amount, date, category, and description as accessible text per row', () => {
      document.body.innerHTML = '<div id="app"></div>';
      renderExpenseList(document.getElementById('app'), [
        { amount: 9, date: '2026-09-14', category: 'Transport', description: 'Metro card top-up' },
      ]);
      const row = document.querySelector('.expense-row');
      expect(row.textContent).toContain('Amount:');
      expect(row.textContent).toContain('Category:');
      expect(row.textContent).toContain('Date:');
      expect(row.textContent).toContain('Description:');
    });
    ```
  - |
    AC5 (same records/order reappear on reload, simulated by calling `initApp` twice against
    the same localStorage) — `tests/persistence.test.js`:
    ```js
    import { test, expect } from 'vitest';
    import { initApp } from '../src/main.js';
    import { STORAGE_KEY } from '../src/storage.js';

    test('re-initializing against the same localStorage reproduces the same order', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([
        { amount: 1, date: '2026-09-10', category: 'Transport', description: 'A' },
        { amount: 2, date: '2026-09-17', category: 'Utilities', description: 'B' },
      ]));
      document.body.innerHTML = '<div id="app"></div>';
      const app = document.getElementById('app');
      initApp(app);
      const first = [...app.querySelectorAll('.expense-description')].map(n => n.textContent);
      app.innerHTML = '';
      initApp(app);
      const second = [...app.querySelectorAll('.expense-description')].map(n => n.textContent);
      expect(second).toEqual(first);
    });
    ```
assumptions_or_open_questions:
  - |
    This worktree's baseline changed since an earlier pass over this plan: a "restart: preserve
    the approved UX design across the reset" commit put the branch on history that already
    includes an unrelated, previously-merged Express "employees" API (`package.json` with
    `express`/`jest`/`supertest`, `src/server.js`, `src/employees/store.js`,
    `src/employees/routes.js`, `test/employees.test.js`). This plan treats that code as an
    existing, untouched baseline — it edits `package.json` in place and adds new files
    alongside it rather than assuming a greenfield repo.
  - |
    `ARC_DEV_PORT` is already claimed by the existing Express API's listener in `src/index.js`.
    The new Vite dev/preview servers are bound to `ARC_WEB_PORT` instead, which is otherwise
    unclaimed — confirmed by reading `src/index.js` and `.env`.
  - |
    This adds Vitest + jsdom as a second test runner alongside the existing Jest + Supertest
    setup, exposed as a separate `npm run test:frontend` script rather than folding into the
    existing `npm test` (jest). Vitest pairs natively with Vite's ESM-based dev server and
    config/resolution, avoiding CommonJS/ESM interop work that retrofitting the existing
    Node-environment Jest config for jsdom + ES modules would require. Flagging since having
    two test runners in one repo is unusual and worth the reviewer's explicit sign-off.
  - |
    Storage key chosen as `'expenses'`. The prototype uses a demo-scoped key
    (`'TEST-M1-STORY-030-expenses'`, design line 739) purely to sandbox the reviewer's live demo
    from any real app data — that is not an appropriate production key. No other story or ADR
    defines the real schema key, so this needs confirmation before a future Add Expense story
    writes to it — a mismatch would make the list silently appear empty.
  - |
    Expense record shape assumed as `{ amount: number, date: 'YYYY-MM-DD', category: string,
    description: string }`, taken from the design's live-demo fixture object (design lines
    869-875), minus its demo-only `addedAt` field. No `id` field is included since this story
    only reads/renders and never needs to reference a specific record. A future edit/delete
    story will need a stable identifier added to each record.
  - |
    AC4 ("most-recently-added-first order") and AC5 ("same records reappear... on refresh") are
    validated here only on the read/render side: tests seed localStorage directly with a fixed
    order and confirm the renderer preserves it, and that re-running the app's init logic
    against the same storage reproduces an identical render. This story adds no write path (no
    Add Expense form) — the design's own annotation on the "Live Demo" screen explicitly calls
    that a separate story — so nothing in this plan can yet guarantee that a future "add"
    operation actually unshifts new records to the front of storage. That guarantee is that
    future story's responsibility.
  - |
    Deviation from the design: the disabled `+ Add expense` button shown in the "Populated
    List" screen's header (design line 549) is intentionally omitted from the real app built
    here, since it is a static mock with no function in the prototype itself and no AC requires
    it. Only the empty state's `+ Add your first expense` button is built (per AC1), and it is
    rendered without a click handler — wiring it to a real form is out of scope until the Add
    Expense story exists.
  - |
    `design-system/tokens.css` and `tokens.json` currently define `--color-primary` as yellow
    (`#eab308`), but the approved prototype's own embedded stylesheet snapshot uses a red
    (`#ef4444`) `--color-primary` (per its own comment, chosen to preserve a "previous blue"'s
    luminance). Since `src/style.css` `@import`s the live `design-system/tokens.css` rather than
    a frozen copy, the shipped page's primary/button color will render as the current yellow
    token, not the red shown in the static prototype file today. This is a real mismatch
    between the two files as they exist right now, not something this story should silently
    resolve one way or the other — flagging for the reviewer.
package_dependencies:
  - name: vite
    version: ^5.4.0
    ecosystem: npm
    rationale: |
      Dev server and build tool for the vanilla-JS frontend; nothing in the repo currently
      provides a frontend dev server (the existing `package.json` only runs the Express
      employees API). Its `server.port`/`preview.port` are wired to the existing
      `ARC_WEB_PORT` env var to avoid colliding with the employees API's `ARC_DEV_PORT`.
  - name: vitest
    version: ^2.1.0
    ecosystem: npm
    rationale: |
      Test runner for the new `tests/*.test.js` suite, exposed via a separate `test:frontend`
      script. Pairs natively with Vite's config/resolution so no separate babel/webpack test
      config is needed, and avoids retrofitting the existing CommonJS/node-environment Jest
      setup for ESM + jsdom.
  - name: jsdom
    version: ^25.0.0
    ecosystem: npm
    rationale: |
      DOM environment Vitest needs to run `renderExpenseList`/`initApp` tests (querySelector,
      localStorage, innerHTML) outside a real browser.
notes: |
  The repo is not greenfield: `src/employees/*`, `src/server.js`, `src/index.js`,
  `test/employees.test.js`, and the existing `package.json` (express/jest/supertest) already
  exist from a previously-merged, unrelated story and are left untouched. This plan's new
  frontend module graph sits alongside that backend, sharing only the edited `package.json`
  manifest.

  ```mermaid
  flowchart TD
    pkg[package.json]
    vite[vite.config.js]
    tokens["design-system/tokens.css + prototype-utils.css"]
    html[index.html]
    main["src/main.js initApp"]
    storage["src/storage.js loadExpenses"]
    render["src/render.js renderExpenseList"]
    format["src/format.js formatCurrency/formatDate"]
    style[src/style.css]
    ls[(Browser localStorage)]
    employees["src/server.js + src/employees/* + test/employees.test.js (existing, untouched)"]

    pkg -->|"dev/build/preview/test:frontend scripts"| vite
    vite -->|"server.port from ARC_WEB_PORT"| html
    html -->|"script type=module"| main
    html -->|"link rel=stylesheet"| style
    style -->|"@import"| tokens
    main -->|"reads expenses"| storage
    main -->|"passes expenses to"| render
    render -->|"formats each field"| format
    storage -->|"getItem/JSON.parse"| ls
    pkg -.->|"existing start/test scripts, unchanged"| employees

    classDef touched fill:#f96,color:#000
    class pkg,vite,html,main,storage,render,format,style touched
  ```

  Layering: `src/render.js` deliberately has no dependency on `src/storage.js` (it only takes
  plain data), keeping AC1/AC3/AC5 testable without any localStorage involvement; `src/main.js`
  is the only module that wires storage to render, and is the seam the AC4/AC5 persistence test
  exercises by calling `initApp` twice against the same localStorage state.
