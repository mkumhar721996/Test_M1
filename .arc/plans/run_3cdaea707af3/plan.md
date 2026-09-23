summary: |
  This repo has no categories feature at all yet — only an unrelated Express `employees` API
  (in-memory store, JSON routes) and a client-side-only `expenses` page (`public/index.html` +
  `public/js/expenses.js`, backed by `localStorage`). TEST-M1-STORY-041 needs a new "Category
  Management" list view that shows each category's name, total spend, and optional spend limit
  in an accessible, keyboard-navigable table, with real loading/error/retry states — this
  requires an actual asynchronous data source to make AC1/AC9/AC10 meaningful, so this plan adds
  a small `GET /categories` JSON endpoint (mirroring the existing `employees` module's
  store+router shape) and a new client page that `fetch()`s it. Layout, markup, and interaction
  are taken directly from the approved prototype at
  `.arc/designs/TEST-M1-STORY-041-design.html`, specifically its first, interactive
  `<div class="screen" data-name="Category Management">` block (design lines 562-643) — the
  three-state card (loading spinner + skeleton rows / inline error + Retry / accessible
  `<table>` with `th scope="row"` names and `th scope="col"` headers for Total spend and Spend
  limit), the `is-warning` row treatment (left accent bar + tint + icon-and-text "⚠ Over limit"
  badge inside the spend cell, never color alone), and the muted "No limit set" text for
  limit-less categories. The prototype's reviewer bar, "Simulate fetch failure" demo button, and
  second (static, non-interactive) "Reference — States & Annotations" screen are reviewer/demo
  aids per the file's own comments and are not built. Edit/Delete/Set-limit row actions are kept
  as real, keyboard-reachable `<button>`s (per AC2) but only show placeholder feedback, since no
  category-editing or spend-limit-setting story exists yet — those flows are out of scope here.
scope:
  - description: |
      Add `src/categories/store.js`, an in-memory categories store mirroring the shape of
      `src/employees/store.js`, seeded with the design prototype's own fixture data (design
      lines 751-758) so the list view has enough variety to exercise every visual/ARIA state the
      ACs require (an over-limit category, an at-limit category, an under-limit category, and
      two with no limit set):
      ```js
      const CATEGORIES = [
        { id: 'cat-1', name: 'Groceries', totalSpend: 482.13, spendLimit: 600.00 },
        { id: 'cat-2', name: 'Dining Out', totalSpend: 310.00, spendLimit: 250.00 },
        { id: 'cat-3', name: 'Transportation', totalSpend: 128.50, spendLimit: null },
        { id: 'cat-4', name: 'Entertainment', totalSpend: 75.00, spendLimit: 75.00 },
        { id: 'cat-5', name: 'Utilities', totalSpend: 210.40, spendLimit: 300.00 },
        { id: 'cat-6', name: 'Software Subscriptions', totalSpend: 89.99, spendLimit: null },
      ];

      function listCategories() {
        return CATEGORIES.map((c) => ({ ...c }));
      }

      module.exports = { listCategories };
      ```
    files:
      - src/categories/store.js
    rationale: |
      Gives the new `GET /categories` route real, varied data to serve without inventing any
      spend-calculation logic (no expense-to-category aggregation exists yet, and no AC asks for
      it) — this mirrors how `employees/store.js` keeps persistence trivial and in-memory, and
      how the STORY-032 plan seeded `INITIAL_EXPENSES` directly in code for a first-of-its-kind
      list view.
  - description: |
      Add `src/categories/routes.js`, a router in the same shape as `src/employees/routes.js`:
      ```js
      const express = require('express');
      const { listCategories } = require('./store');

      const router = express.Router();

      router.get('/', (req, res) => {
        res.status(200).json(listCategories());
      });

      module.exports = router;
      ```
    files:
      - src/categories/routes.js
    rationale: |
      A real JSON endpoint is what makes AC1 (in-progress indicator until data resolves), AC9
      (fetch fails), and AC10 (retry re-attempts the fetch) meaningful behaviors to build and
      test, rather than a client-only demo timer with a manual "simulate failure" button (which
      the prototype itself only uses as a reviewer aid, not a feature to ship).
  - description: |
      Modify `src/server.js` to mount the new router, following the exact pattern already used
      for `employeesRouter`:
      ```js
      const categoriesRouter = require('./categories/routes');
      ...
      app.use('/categories', categoriesRouter);
      ```
      Placed alongside the existing `app.use('/employees', employeesRouter);` line. No other
      lines change.
    files:
      - src/server.js
    rationale: |
      Without this, `GET /categories` is unreachable through the running app. `express.static`
      already serves `public/*.html` at its own paths (e.g. `/categories.html`), so mounting the
      API router at `/categories` (a path with no matching static file) does not collide with
      any static asset.
  - description: |
      Add `public/categories.html`: the real Category Management page, adapted from the design's
      interactive screen (lines 562-643), keeping the exact ids/classes/ARIA structure the design
      specifies — `#state-loading` (spinner `role="status" aria-live="polite"` + `aria-hidden`
      skeleton rows, design lines 580-605), `#state-error` (`role="alert"` panel with
      `#retry-btn`, lines 608-616), and `#state-success` wrapping a `.category-table` with a
      visually-hidden `<caption>`, `<th scope="col">` headers "Category" / "Total spend" /
      "Spend limit" / "Actions", and an empty `<tbody id="category-tbody">` populated by JS
      (lines 619-636). The topbar nav becomes real three-way navigation — Expenses links to
      `index.html`, Employees stays inert (`onclick="return false;"`, since no employees frontend
      exists), Categories is the current page (`class="active" aria-current="page"`) — instead of
      the design's all-inert demo nav, since a shipped page must actually be reachable from the
      existing Expenses page (see the `public/index.html` scope item below).
      Excluded, per the design's own comments distinguishing real UI from reviewer aids: the
      "← Prev / Next →" reviewer bar and its spacer div, the `#simulate-error-btn` "Simulate fetch
      failure" button (a demo-only trigger — this build gets real error/retry behavior from an
      actual failed `fetch()`, exercised in tests by mocking `fetch`, not from a demo toggle), and
      the entire second `data-name="Reference — States & Annotations"` screen (explicitly
      non-interactive per its own comment).
      Links `../design-system/tokens.css` and `../design-system/prototype-utils.css` (unmodified,
      already used the same way by `public/index.html`), plus `./css/expenses.css` (reused for the
      already-established `.app-topbar`/`.app-nav`/`.page`/`.page-header`/`.toast` rules — see the
      `public/css/categories.css` scope item for why these are not duplicated) and the new
      `./css/categories.css`, and loads `./js/categories.js` with `defer`.
    files:
      - public/categories.html
    rationale: |
      This is the page AC1-AC10 describe as "the category management view." Reusing the exact
      table/th-scope/badge structure from the approved design is what satisfies AC3 (distinct
      screen-reader-labelled fields via native table semantics) and AC4 (warning badge text
      living inside the same spend `<td>`) without inventing new markup.
  - description: |
      Add `public/css/categories.css` with the design's category-management-specific rules only
      (design lines 273-490): `.loading-panel`/`.spinner`/`.skeleton-row`/`.skeleton-bar` (incl.
      the `prefers-reduced-motion` overrides for both animations), `.error-panel`/`.error-title`/
      `.error-body`, `.category-table` and its `th`/`td`/`caption` rules, `.cat-name`,
      `.cell-value`/`.cell-value.no-limit`, `.category-row.is-warning` (background tint via
      `color-mix(in srgb, var(--color-primary) 14%, transparent)` plus the left accent border),
      `.warning-badge`, `.row-actions`/`.action-btn`/`.action-btn.danger`, `.visually-hidden`, and
      the `@media (max-width: 640px)` responsive block that turns rows into stacked cards with
      `data-label` pseudo-headers. Also adds one small rule not present verbatim in the design's
      per-screen block (which only defined it for reviewer-only `#prev-btn`/`#next-btn` alongside
      it):
      ```css
      .action-btn:focus-visible {
        outline: 2px solid var(--color-primary);
        outline-offset: 2px;
      }
      ```
      `.app-topbar`, `.app-nav`, `.page`, `.page-header`, and `.toast` are intentionally *not*
      duplicated here — `public/css/expenses.css` already defines byte-for-byte the same rules
      for these (both files were generated from the same design-system tokens), and
      `public/categories.html` links `expenses.css` for them, per the existing project's
      established pattern of keeping one canonical copy of shared chrome rather than
      re-declaring it per page.
    files:
      - public/css/categories.css
    rationale: |
      Keeps the "over limit" state's color signal paired redundantly with the `⚠` icon and
      "Over limit" text (AC7/AC8) exactly as the design's own comment (design lines 195-203)
      calls for, given `tokens.json` has no dedicated warning/danger color — same known
      design-system gap already documented by `public/css/expenses.css`'s own inline comment.
  - description: |
      Add `public/js/categories.js`, the page's logic as small, individually-testable exports:
      ```js
      function formatUSD(amount) {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
      }

      function isOverLimit(category) {
        return category.spendLimit != null && category.totalSpend >= category.spendLimit;
      }

      function fetchCategories() {
        return fetch('/categories').then((res) => {
          if (!res.ok) throw new Error(`Request failed with status ${res.status}`);
          return res.json();
        });
      }

      function renderCategoryRows(doc, categories) { /* builds #category-tbody rows: th[scope=row] .cat-name,
        td total-spend (+ .warning-badge when isOverLimit), td spend-limit (or "No limit set" .no-limit span),
        td.row-actions with three real <button type="button"> elements carrying aria-label and
        data-action/data-category-id, exactly as the design's renderCategoryRows (lines 764-787) shapes each row */ }

      function setState(doc, state) { /* toggles #state-loading/#state-error/#state-success .hidden,
        exactly as the design's setState (lines 791-795) */ }

      function showToast(doc, message) { /* same as design's showToast (lines 810-816) */ }

      function handleRowAction(doc, event) { /* delegated click handler on #category-tbody: reads
        event.target.closest('[data-action]').dataset, shows a placeholder toast per action */ }

      function loadCategories(doc) {
        setState(doc, 'loading');
        return fetchCategories()
          .then((categories) => { renderCategoryRows(doc, categories); setState(doc, 'success'); })
          .catch(() => { setState(doc, 'error'); });
      }

      function initCategoriesApp(doc = document) {
        doc.getElementById('category-tbody').addEventListener('click', (e) => handleRowAction(doc, e));
        doc.getElementById('retry-btn').addEventListener('click', () => loadCategories(doc));
        return loadCategories(doc);
      }

      module.exports = { formatUSD, isOverLimit, fetchCategories, renderCategoryRows, setState, loadCategories, initCategoriesApp };
      if (typeof window !== 'undefined') {
        window.addEventListener('DOMContentLoaded', () => initCategoriesApp());
      }
      ```
      Two deliberate deviations from the prototype's literal `<script>` (design lines 750-826),
      both called out under `assumptions_or_open_questions`: (1) row actions are wired via a
      single delegated `click` listener on `#category-tbody` reading `data-action`/
      `data-category-id`, instead of the design's per-button inline `onclick="..."` attributes —
      this matches `public/js/expenses.js`'s own unobtrusive-JS convention and survives the
      `innerHTML` re-render on every `loadCategories()` call without needing to rebind; (2) the
      Edit/Set-limit toast text drops the design's stray `"— see TEST-M1-STORY-032"` suffix
      (that story is Edit Expense via Modal Form, unrelated to category editing — an apparent
      copy-paste artifact in the prototype) in favor of a neutral "not yet available" message.
    files:
      - public/js/categories.js
    rationale: |
      Isolating fetch/render/state into `module.exports`-ed functions is what lets
      `test/categories.test.js` drive and assert each state transition deterministically (by
      mocking `global.fetch`) while the same file boots itself unmodified in a real browser via
      `DOMContentLoaded`, mirroring `public/js/expenses.js`'s existing structure exactly.
  - description: |
      Modify `public/index.html`'s top nav to add a working link to the new page — currently it
      only has "Expenses" (active, `href="#"`) and an inert "Employees" — so the shipped feature
      is actually reachable:
      ```html
      <nav class="app-nav">
        <a href="#" class="active" aria-current="page">Expenses</a>
        <a href="#" onclick="return false;">Employees</a>
        <a href="categories.html">Categories</a>
      </nav>
      ```
    files:
      - public/index.html
    rationale: |
      AC1-AC10 all presuppose "the category management view is loaded/displayed"; without a real
      link from the app's existing entry page, the new view would be unreachable except by typing
      a URL directly. This is the minimal nav change needed, not a nav redesign — Employees stays
      exactly as inert as before, since no employees frontend page exists.
  - description: |
      Add `test/categories-api.test.js` (Jest's default `node` environment, same shape as
      `test/employees.test.js`), asserting the JSON contract `public/js/categories.js` depends on.
    files:
      - test/categories-api.test.js
    rationale: |
      The frontend's loading/error/success states and every visual/ARIA assertion depend on
      `GET /categories` returning objects shaped `{ name, totalSpend, spendLimit }` with
      `spendLimit` nullable, and on the fixture including at least one over/at-limit category and
      one no-limit category (needed to exercise AC6-AC8) — this test pins that contract
      independently of the frontend suite.
  - description: |
      Add `test/categories.test.js` (`/** @jest-environment jsdom */`, following
      `test/expenses.test.js`'s pattern of loading the real `public/categories.html` markup via
      `fs.readFileSync` into `document.documentElement.innerHTML`, `jest.resetModules()` +
      fresh `require('../public/js/categories')` per test). Since neither Node's `jest-environment
      -jsdom` nor jsdom itself ships a `fetch` implementation, each test assigns its own
      `global.fetch = jest.fn(...)` mock before requiring/calling `initCategoriesApp`/
      `loadCategories` — a standard, dependency-free way to drive `fetchCategories()`
      deterministically without real network I/O. One test per acceptance criterion (see `tests`
      below), plus one supporting test for AC2's second half (activating a focused button shows
      feedback).
    files:
      - test/categories.test.js
    rationale: |
      This is the test-first artifact for AC1-AC10; loading the actual `public/categories.html`
      markup (rather than a hand-rolled fixture) means the tests fail if the real page's ids ever
      drift from what `categories.js` expects, exactly as `test/expenses.test.js` already does for
      the expenses page.
tests:
  - |
    AC1 — a standard in-progress indicator is shown until the list is ready:
    ```js
    test('AC1: a standard in-progress indicator is shown while categories are being fetched', () => {
      global.fetch = jest.fn(() => new Promise(() => {})); // never resolves during this assertion
      const { initCategoriesApp } = require('../public/js/categories');
      initCategoriesApp(document);
      expect(document.getElementById('state-loading').hidden).toBe(false);
      expect(document.getElementById('state-success').hidden).toBe(true);
      expect(document.getElementById('state-error').hidden).toBe(true);
    });
    ```
    Fails until `public/categories.html` has the three state containers and `loadCategories`
    calls `setState(doc, 'loading')` synchronously before awaiting `fetch`.
  - |
    AC2 — each row's Edit/Delete/limit controls are reachable and activatable via keyboard:
    ```js
    test('AC2: each row\'s controls are real, focusable buttons reachable via Tab', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(
        [{ id: 'cat-1', name: 'Groceries', totalSpend: 482.13, spendLimit: 600 }]
      ) });
      const { initCategoriesApp } = require('../public/js/categories');
      await initCategoriesApp(document);
      const buttons = document.querySelectorAll('#category-tbody .action-btn');
      expect(buttons.length).toBe(3);
      buttons.forEach((btn) => {
        expect(btn.tagName).toBe('BUTTON');
        expect(btn.tabIndex).not.toBe(-1);
        btn.focus();
        expect(document.activeElement).toBe(btn);
      });
    });

    test('AC2: activating a focused control (native button click, the browser\'s Enter/Space activation path) works without a pointer device', async () => {
      // ...same setup...
      const editBtn = document.querySelector('[data-action="edit"]');
      editBtn.focus();
      editBtn.click();
      expect(document.getElementById('toast').hidden).toBe(false);
      expect(document.getElementById('toast-message').textContent).toMatch(/Edit Groceries/);
    });
    ```
    Fails until every row action is a real, enabled `<button>` (not a `<span>`/`<a>` with a click
    handler) with a delegated click listener wired in `initCategoriesApp`. jsdom cannot simulate
    the browser's native Enter/Space-to-click translation, so `.click()` on a focused button is
    used as the standard proxy (see `assumptions_or_open_questions`).
  - |
    AC3 — name, total spend, and spend limit are each announced as distinct labelled fields:
    ```js
    test('AC3: each row exposes name, total spend, and spend limit as distinct labelled table fields', async () => {
      // ...fetch mock resolving one category...
      const headers = Array.from(document.querySelectorAll('.category-table thead th')).map((th) => th.textContent);
      expect(headers).toEqual(['Category', 'Total spend', 'Spend limit', 'Actions']);
      const row = document.querySelector('#category-tbody tr');
      expect(row.querySelector('th[scope="row"]').textContent).toBe('Groceries');
      expect(row.children[1].tagName).toBe('TD');
      expect(row.children[2].tagName).toBe('TD');
    });
    ```
    Fails until `renderCategoryRows` emits `<th scope="row">` for the name and `<td>`s under the
    `<th scope="col">` headers, giving assistive tech the row/column pairing needed to announce
    each as a distinct field.
  - |
    AC4 — the warning state is announced as a distinct labelled condition alongside the figures:
    ```js
    test('AC4: an over-limit category announces the warning state alongside its spend figures', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(
        [{ id: 'cat-2', name: 'Dining Out', totalSpend: 310, spendLimit: 250 }]
      ) });
      const { initCategoriesApp } = require('../public/js/categories');
      await initCategoriesApp(document);
      const row = document.querySelector('#category-tbody tr');
      expect(row.classList.contains('is-warning')).toBe(true);
      const spendCell = row.children[1];
      expect(spendCell.querySelector('.warning-badge').textContent).toMatch(/Over limit/);
      expect(spendCell.textContent).toMatch(/\$310\.00/);
    });
    ```
    Fails until `isOverLimit` gates a `.warning-badge` rendered *inside* the same total-spend
    `<td>` as the figure (so a screen reader announces both together as one field), not as a
    separate, unlabelled sibling.
  - |
    AC5 — a sighted user sees the row's name, total spend, and spend limit (if set):
    ```js
    test('AC5: a loaded row visibly shows the category\'s name, total spend, and spend limit', async () => {
      // ...fetch mock: { id: 'cat-1', name: 'Groceries', totalSpend: 482.13, spendLimit: 600 }...
      const row = document.querySelector('#category-tbody tr');
      expect(row.querySelector('.cat-name').textContent).toBe('Groceries');
      expect(row.children[1].textContent).toMatch(/\$482\.13/);
      expect(row.children[2].textContent).toMatch(/\$600\.00/);
    });
    ```
    Fails until `renderCategoryRows` formats `totalSpend`/`spendLimit` through `formatUSD` into
    the name/spend/limit cells.
  - |
    AC6 — a category with no spend limit displays no spend limit value:
    ```js
    test('AC6: a category with no spend limit displays no spend limit value', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(
        [{ id: 'cat-3', name: 'Transportation', totalSpend: 128.50, spendLimit: null }]
      ) });
      const { initCategoriesApp } = require('../public/js/categories');
      await initCategoriesApp(document);
      const limitCell = document.querySelector('#category-tbody tr').children[2];
      expect(limitCell.textContent).toMatch(/No limit set/);
      expect(limitCell.textContent).not.toMatch(/\$/);
    });
    ```
    Fails until `renderCategoryRows` branches on `spendLimit == null` to render the muted
    "No limit set" text instead of any numeric value.
  - |
    AC7 — an over-limit row displays a warning icon or badge on the row/spend value:
    ```js
    test('AC7: an over-limit row displays a warning icon/badge on the spend value', async () => {
      // ...fetch mock: { id: 'cat-4', name: 'Entertainment', totalSpend: 75, spendLimit: 75 }...
      const badge = document.querySelector('#category-tbody .warning-badge');
      expect(badge).not.toBeNull();
      expect(badge.textContent).toContain('⚠');
      expect(badge.textContent).toContain('Over limit');
    });
    ```
    Fails until `isOverLimit` (using `>=`, so an at-limit category also counts) renders the badge
    with both the icon and the text label, never the icon alone.
  - |
    AC8 — an over-limit row/value shows a distinct color change:
    ```js
    test('AC8: an over-limit row carries the is-warning class that drives the distinct warning color', async () => {
      // ...same fetch mock as AC7...
      expect(document.querySelector('#category-tbody tr').classList.contains('is-warning')).toBe(true);
    });
    ```
    Fails until the `<tr>` itself (not just the badge) gets the `is-warning` class that
    `categories.css` uses to apply the `color-mix(...)` tint and left accent border. jsdom does
    not compute `color-mix()` output, so the actual rendered color must additionally be confirmed
    by starting the dev server and viewing `categories.html` in a browser (see
    `assumptions_or_open_questions`).
  - |
    AC9 — a failed fetch displays an inline error message in place of the category list:
    ```js
    test('AC9: a failed fetch displays an inline error message in place of the category list', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 });
      const { loadCategories } = require('../public/js/categories');
      await loadCategories(document);
      expect(document.getElementById('state-error').hidden).toBe(false);
      expect(document.getElementById('state-success').hidden).toBe(true);
      expect(document.getElementById('state-error').querySelector('.error-body').textContent)
        .toMatch(/problem fetching/i);
    });
    ```
    Fails until `fetchCategories` rejects on a non-ok response and `loadCategories`'s `.catch`
    switches to the error state instead of leaving stale/loading UI showing.
  - |
    AC10 — activating Retry re-attempts the data fetch:
    ```js
    test('AC10: activating Retry re-attempts the fetch and shows the list on success', async () => {
      global.fetch = jest.fn()
        .mockResolvedValueOnce({ ok: false, status: 500 })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(
          [{ id: 'cat-1', name: 'Groceries', totalSpend: 482.13, spendLimit: 600 }]
        ) });
      const { initCategoriesApp } = require('../public/js/categories');
      await initCategoriesApp(document);
      expect(document.getElementById('state-error').hidden).toBe(false);
      document.getElementById('retry-btn').click();
      await new Promise((resolve) => setImmediate(resolve));
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(document.getElementById('state-success').hidden).toBe(false);
    });
    ```
    Fails until `#retry-btn`'s click listener calls `loadCategories(doc)` again rather than only
    running once on initial load.
  - |
    Supporting API-contract test (backs AC6-AC8's need for varied fixture data), in
    `test/categories-api.test.js`:
    ```js
    test('GET /categories returns each category with a name, total spend, and nullable spend limit', async () => {
      const res = await request(app).get('/categories');
      expect(res.status).toBe(200);
      res.body.forEach((cat) => {
        expect(typeof cat.name).toBe('string');
        expect(typeof cat.totalSpend).toBe('number');
        expect(cat.spendLimit === null || typeof cat.spendLimit === 'number').toBe(true);
      });
      expect(res.body.some((c) => c.spendLimit != null && c.totalSpend >= c.spendLimit)).toBe(true);
      expect(res.body.some((c) => c.spendLimit === null)).toBe(true);
    });
    ```
    Fails until `src/categories/store.js` and `src/categories/routes.js` exist and are mounted at
    `/categories` in `src/server.js`.
assumptions_or_open_questions:
  - |
    The approved design's fixture category names ("Groceries", "Dining Out", "Transportation",
    "Entertainment", "Utilities", "Software Subscriptions") don't match the unrelated `CATEGORIES`
    list already hardcoded in `public/js/expenses.js` ("Travel", "Meals", "Software", "Office
    Supplies", "Other"). No AC requires these to align, and no story yet computes a category's
    `totalSpend` from real expense records — this plan seeds `src/categories/store.js` directly
    with the design's own fixture values (server-side, not duplicated client-side) purely to
    drive the list view's accessible states. Wiring real expense-to-category spend aggregation is
    left to a future story under the parent epic.
  - |
    The prototype's row-action `onclick` toast text for Edit and Set/Edit-limit references
    `"— see TEST-M1-STORY-032"`, which is "Edit Expense via Modal Form" — an unrelated, already-
    shipped story that does not build category editing. Treated as a stale copy-paste artifact
    in the prototype and not reproduced; this plan's placeholder toasts say the action "is not
    yet available" instead. Delete's toast text ("Delete {name} requested") had no such issue and
    is kept as-is.
  - |
    AC2 (keyboard reachability) is verified in jsdom via focusability (`tabIndex !== -1`,
    `document.activeElement` after `.focus()`) and `.click()` on a focused native `<button>` as
    the proxy for Enter/Space activation, since jsdom does not implement the browser's native
    key-to-click translation and no keyboard-simulation library (e.g. `@testing-library/
    user-event`) is currently a dependency. Real Tab-order traversal in an actual browser should
    still be spot-checked manually against `public/categories.html`.
  - |
    AC8's color change is asserted in jsdom only via presence of the `is-warning` class (which
    `categories.css`'s `color-mix(...)` rule keys off of), since jsdom does not compute
    `color-mix()`/CSS custom property output. The actual rendered warning color/contrast should
    be visually confirmed by starting the dev server (`npm start`) and viewing
    `/categories.html` in a real browser before calling this AC done.
  - |
    Edit, Delete, and Set/Edit-limit remain real, keyboard-operable buttons (satisfying AC2) but
    only show placeholder toast feedback — no category-editing, deleting, or spend-limit-setting
    backend/UI is built here, since no AC in this story describes those flows and no such story
    exists yet in this repo. This mirrors how the design's own prototype only demos these actions
    with toasts, never a real form.
  - |
    Adding a "Categories" link to `public/index.html`'s nav (and pointing its own "Expenses" link
    back at `index.html`) is treated as in-scope, minimal wiring — without it, the new view
    described by every AC here ("the category management view is loaded/displayed") would be
    unreachable from the app's existing entry point.
package_dependencies: []
notes: |
  This plan's scope spans a new small backend module, two new frontend assets, one modified
  frontend asset, and the server wiring connecting them — worth diagramming:

  ```mermaid
  flowchart TD
    Server["src/server.js"] -->|app.use `/categories`| Routes["src/categories/routes.js"]
    Routes -->|listCategories| Store["src/categories/store.js"]
    Server -->|express.static| IndexHTML["public/index.html"]
    Server -->|express.static| CatHTML["public/categories.html"]
    IndexHTML -->|nav link, new| CatHTML
    CatHTML -->|link rel=stylesheet, reused| ExpCSS["public/css/expenses.css"]
    CatHTML -->|link rel=stylesheet, new| CatCSS["public/css/categories.css"]
    CatHTML -->|script src, defer, new| CatJS["public/js/categories.js"]
    CatJS -->|fetch GET /categories| Routes
    ApiTest["test/categories-api.test.js"] -->|supertest| Server
    UiTest["test/categories.test.js"] -->|fs.readFileSync, sets innerHTML| CatHTML
    UiTest -->|require, mocks global.fetch| CatJS

    classDef touched fill:#f96,color:#000
    class Server,Routes,Store,CatHTML,CatCSS,CatJS,IndexHTML,ApiTest,UiTest touched
  ```

  `src/employees/*`, `public/js/expenses.js`, `public/currency.js`, `public/validation.js`, and
  `public/app.js` are untouched — the last three are pre-existing, already-orphaned legacy files
  (no current HTML page loads them; only their own unit tests reference them) and this plan does
  not attempt to clean them up, since that's unrelated to this story's ACs.
