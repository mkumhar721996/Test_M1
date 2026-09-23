summary: |
  Adds category filtering and category grouping (with subtotals) to the Expenses page that is
  actually shipped today (public/index.html + public/js/expenses.js, currently a plain table with
  an Edit-in-modal flow and no filter/group controls). The approved prototype
  (.arc/designs/TEST-M1-STORY-040-design.html) shows a sidebar-nav app shell, a filter bar
  (category `<select>` + "Clear filter" button + a flat/grouped view-toggle segmented control),
  and a card-based expense list with category chips, group headings, and per-group subtotals —
  none of which exist in the shipped page today, so this plan rebuilds that page's shell and list
  markup to match it. To make rename-vs-delete propagation (AC5/6 vs AC9/10) actually testable,
  categories become first-class records with a stable `id` distinct from their editable `name`
  (a new `public/js/categories.js` module), and expenses move from a plain `category` name string
  to a `categoryId` foreign key. There is no category-management ("Settings") screen in this
  codebase yet — that is future/out-of-scope work per the parent epic — so AC5/6/9/10 are
  implemented and tested by mutating the categories/expenses store directly between two
  `initExpensesApp` calls (standing in for "a change made elsewhere"), exactly mirroring the
  existing test suite's convention of re-instantiating the app per test. Beyond the 10 formal
  ACs, the plan also covers the 4 edge cases the prototype's own "Edge Cases & Data Quirks" screen
  calls out (a true zero-expense account vs. a filter matching nothing, a real category with zero
  expenses, every category being removed at once, and an unusually long renamed category), plus
  two defensive cases the prototype's code demonstrates but doesn't name as a distinct screen (a
  dangling categoryId with no explicit reassignment, and filter+group combining correctly).

scope:
  - description: |
      Add a new categories module, `public/js/categories.js`, giving categories a stable `id`
      distinct from their mutable `name` (required so a rename can be told apart from a delete —
      see `assumptions_or_open_questions`). Mirrors the existing localStorage load/persist
      pattern already used by `public/js/expenses.js` for expenses.

      ```js
      const CATEGORIES_STORAGE_KEY = 'categories'; // distinct from expenses.js's own STORAGE_KEY —
      // both files are loaded as classic (non-module) <script> tags on the same page, so a
      // top-level `const STORAGE_KEY` in both would be a duplicate-declaration SyntaxError.

      const DEFAULT_CATEGORIES = [
        { id: 'travel', name: 'Travel' },
        { id: 'meals', name: 'Meals' },
        { id: 'software', name: 'Software' },
        { id: 'office-supplies', name: 'Office Supplies' },
        { id: 'other', name: 'Other' },
      ];

      function loadCategories() { /* same try/catch-seed-fallback shape as loadExpenses() */ }
      function persistCategories(list) { localStorage.setItem(CATEGORIES_STORAGE_KEY, JSON.stringify(list)); }
      function renameCategory(categories, id, newName) {
        return categories.map((c) => (c.id === id ? { ...c, name: newName } : c));
      }
      function deleteCategory(categories, id) {
        return categories.filter((c) => c.id !== id);
      }
      ```

      `loadCategories`/`persistCategories`/`renameCategory`/`deleteCategory` are plain function
      declarations (not `const`), so in the browser (non-module, classic scripts) they attach to
      `window` the same way `formatCurrencyUSD` already does in `public/currency.js` — this lets
      `expenses.js` consume them via the same `typeof module !== 'undefined' ? require(...) : window`
      pattern `public/app.js` already uses for `currency.js`/`validation.js`.
    files:
      - public/js/categories.js
    rationale: |
      AC9/AC10 (rename stays stale until refresh, then updates) and AC5/AC6 (delete cascades
      immediately, no trace left) can only be told apart if "the same name" and "a different
      category" are distinguishable independent of the display name itself — a rename changes the
      name but not the identity; a delete removes the identity entirely. The shipped app currently
      has no such identity (categories are just a hardcoded array of name strings), so this is a
      minimal, additive data-model fix, not a redesign of category management (no CRUD UI is added
      — that belongs to a future Settings story per the parent epic).

  - description: |
      Rebuild the Expenses page shell in `public/index.html` to match the approved prototype's
      "Expense List — Filter & Group" screen: replace the current `.app-topbar` (brand + Expenses/
      Employees links) with the prototype's `.sidebar` (`.brand` + `.nav-item` × 4: 📊 Dashboard,
      💳 Expenses (active), 📈 Reports, ⚙️ Settings — Dashboard/Reports/Settings are inert `href="#"`
      placeholders, exactly as the prototype has them). Add the prototype's `.filter-bar`: a
      `.filter-field` with a `<label class="label">Category</label>` + `<select class="input"
      id="filter-category">`, a `<button id="clear-filter-btn" class="btn btn-secondary">✕ Clear
      filter</button>` (hidden unless a filter is active — AC4), and a `.view-toggle` segmented
      control with `#view-flat-btn` (☰ Flat list, default active) and `#view-grouped-btn` (▤ Grouped
      by category) buttons, per the prototype's `setGrouped()`-driven toggle. Replace the current
      `<table class="expense-table">`/`<tbody id="expense-tbody">` with the prototype's
      `<ul class="expense-list" id="expense-list">` and a sibling `<li class="empty-state card"
      id="empty-state" style="display:none;">` (prototype's `renderList` toggles these via
      `style.display`, distinguishing a true zero-expense account from a filter matching nothing —
      both empty-state copy variants, and the "category with zero expenses" and "all categories
      removed" edge cases, are taken verbatim from the prototype's `renderList`/edge-case screen).
      Remove the 5 hardcoded `<option>Travel</option>`-style options from `#field-category` in the
      Edit modal — they are now rendered dynamically from the categories module (see the
      `expenses.js` scope item) so a rename is reflected the next time the modal's options are
      (re)built, not hand-maintained HTML. Add `<script src="./js/categories.js" defer></script>`
      before the existing `expenses.js` script tag.
    files:
      - public/index.html
    rationale: |
      The prototype is the sole record of the approved design, and it explicitly diverges from
      what's shipped today: today's page is a table with a top bar; the prototype is a card list
      with a sidebar. Per the planning brief, the plan must build the already-approved design, not
      reconcile it with the pre-existing (and, per the design's own commit history, effectively
      superseded) table layout. See `assumptions_or_open_questions` for the two specific
      discrepancies this surfaced (layout family, and category-name fixture set) and how they were
      resolved.

  - description: |
      Add the prototype's design-token-only CSS for the new elements to `public/css/expenses.css`
      (currently only has table/modal/toast rules): `.sidebar`/`.brand`/`.nav-item` (+ `.active`
      state), `.filter-bar`/`.filter-field`/`.view-toggle` (+ button `.active` state), `.expense-list`/
      `.expense-row`/`.expense-row-main`/`.expense-desc`/`.expense-row-meta`/`.expense-amount`/
      `.list-summary` (card-list styles the shipped page doesn't have yet — `.chip`/`.card`/`.btn`/
      `.input`/`.label` are already available globally from `design-system/prototype-utils.css`, so
      only the list-specific classes are new), `.chip-uncategorised` (dashed border, muted text, no
      color-only signal — AC3), `.group-heading`/`.group-heading-name`/`.group-heading-meta`/
      `.group-heading-uncategorised` (AC7/AC8), and `.empty-state`/`.empty-state-icon`. All of these
      are copied from the prototype's inline `<style>` (lines ~267-531 of the design file), which
      is itself built exclusively from the same `design-system/tokens.css` variables this file
      already uses — no new colors/spacing/radii are introduced. None of the copied rules set
      `white-space: nowrap` or a fixed width without overflow handling on `.group-heading-name`,
      `.chip`, or `.filter-field .input`, so the long-renamed-category edge case wraps by default
      exactly as the prototype demonstrates — no extra CSS is needed to make that case pass.
      Retarget the existing `.row-updated` flash-on-save animation from
      `.expense-table tbody tr.row-updated` to `.expense-row.row-updated` so the existing "row
      flashes after a successful edit" behavior (currently untested but present) keeps working
      against the new `<li>` markup.
    files:
      - public/css/expenses.css
    rationale: |
      Per the planning brief, layout/spacing/colours must be taken from the prototype, not
      invented — these rules are a direct, token-for-token copy of what the prototype already
      specifies for this exact screen, including its edge-case screen.

  - description: |
      Rework `public/js/expenses.js`:
      1. Change `INITIAL_EXPENSES` fixtures from `category: 'Travel'` (etc.) to
         `categoryId: 'travel'` (etc., matching the new `categories.js` ids) — a breaking schema
         change, addressed for existing tests in the `test/expenses.test.js` scope item below.
      2. Add `resolveCategoryName(categoryId, categories)` — returns the matching category's
         current `name`, or `null` for both an explicit `null` categoryId and a "dangling" id that
         matches no current category (defensive fallback to Uncategorised either way — directly
         satisfies AC6's "no reference to the deleted category remains anywhere", including the
         edge case where a categoryId goes dangling by some path other than
         `reassignExpensesFromDeletedCategory`, e.g. bad data).
      3. Add `reassignExpensesFromDeletedCategory(expenses, categoryId)` — a pure helper a future
         category-management feature would call on delete; this story defines and unit-tests its
         contract now so AC5/AC6 have a concrete, correct cascade to test against:
         ```js
         function reassignExpensesFromDeletedCategory(expenses, categoryId) {
           return expenses.map((e) => (e.categoryId === categoryId ? { ...e, categoryId: null } : e));
         }
         ```
      4. In `initExpensesApp(doc)`, load `let categories = loadCategories();` once per call — this
         single read-at-open is what makes a same-session rename stay stale (AC9) while a fresh
         `initExpensesApp(doc)` call (standing in for "user refreshes or reopens the expense list")
         picks up the new name (AC10).
      5. Add filter/grouped UI state (`let filter = 'all'; let grouped = false;`) and:
         `renderFilterOptions()` (rebuilds `#filter-category`'s `<option>`s from `categories`, plus
         a trailing "Uncategorised (no category assigned)" option, resetting `filter` to `'all'` if
         it's no longer a valid id — e.g. the previously-selected category was just deleted, or
         every category was removed leaving only "All categories"/"Uncategorised" as valid options
         — edge case), `renderList()` (replaces the current table-row renderer; computes `visible`
         from `filter` first, then renders flat `<li>` rows or, when `grouped`, one `.group-heading`
         per *remaining* category — so if all categories are deleted this loop simply produces zero
         category headings and everything falls into the trailing Uncategorised heading, degrading
         gracefully rather than erroring — with `count + $ subtotal` (AC7), followed by a trailing
         `.group-heading-uncategorised` with a count only, no subtotal (AC8); also distinguishes a
         true zero-expense account (`total === 0`, "No expenses yet" + add-expense CTA) from a
         filter/category matching nothing (`total > 0 && visible.length === 0`, "No expenses match
         this filter" + clear-filter CTA — covers both the all-expenses-cleared edge case and the
         filter-to-a-real-but-empty-category edge case with the correct, different copy for each),
         and `setFilter(value)`/`setGrouped(bool)` wired to the new select/buttons via
         `addEventListener` (matching this file's existing style — not the prototype's inline
         `onclick=` scaffolding, which is prototype-only demo wiring). `renderList()` always
         recomputes `visible` from the current `filter` before branching on `grouped`, so filtering
         to one category and then switching to grouped view renders only that one category's
         heading (filter and grouping combine rather than conflict).
      6. Update `openEditModal`/the submit handler: `fieldCategory.value = exp.categoryId || '';`
         on open, `updated.categoryId = categoryValue;` on save (previously `category`/`categoryValue`
         directly, since the select's option values are now category ids, populated dynamically
         from `loadCategories()` at modal-build time instead of the 5 static HTML options removed
         from `index.html`).
      7. Remove the old flat `CATEGORIES` array and its export (superseded by `categories.js`).
    files:
      - public/js/expenses.js
    rationale: |
      This is the functional core of every AC: AC1/AC2/AC4 need `filter`/`renderFilterOptions`/
      `setFilter`; AC3/AC7/AC8 need `grouped`/`renderList`'s grouped branch; AC5/AC6/AC9/AC10 need
      the categories snapshot to be read once per `initExpensesApp` call rather than live-bound to
      the store, plus a real reassignment cascade so "deleted" and "renamed" are distinguishable.
      The edge cases folded in here (filter reset on deletion, graceful zero-category grouping,
      two distinct empty-state copies, filter+group combining) are exactly the scenarios the
      prototype's own "Edge Cases & Data Quirks" screen was added to demonstrate, per its revision
      note ("cover edge cases UX design as well").

  - description: |
      Update `test/expenses.test.js` for the schema/markup changes this plan makes, then add
      coverage for AC1-AC10 plus the edge cases below.
      - Fix now-broken assertions: `field-category` value assertions change from the category
        *name* (`'Travel'`) to its *id* (`'travel'`); `row.querySelector('.col-amount')` becomes
        `row.querySelector('.expense-amount')`; `.closest('tr')` becomes `.closest('.expense-row')`
        (the table `<tr>` no longer exists once the list is rebuilt as a `<ul>`/`<li>`).
      - Add the new AC-driven and edge-case tests listed in `tests` below to this same file (it
        already owns the `initExpensesApp`/`document` fixture setup these need).
    files:
      - test/expenses.test.js
    rationale: |
      Keeps the existing, currently-passing edit-modal suite green through the schema/markup
      migration instead of silently breaking it, and keeps all expense-list behavior tests
      (existing + new + edge case) colocated with the module they exercise, matching current file
      layout.

  - description: |
      Add `test/categories.test.js` covering the new module directly: `renameCategory` returns a
      new array with only the matching id's `name` changed and other entries untouched;
      `deleteCategory` returns a new array with the matching id removed and others untouched, and
      also returns an empty array (not an error) when called repeatedly until no categories remain
      (the "all categories removed" edge case at the module level); `loadCategories`/
      `persistCategories` round-trip through `localStorage` the same way the existing
      `loadExpenses`/`persistExpenses` tests already implicitly rely on.
    files:
      - test/categories.test.js
    rationale: |
      `categories.js` is new, standalone, pure-function-heavy code with no existing test coverage
      of any kind — it needs its own direct unit tests, not just indirect exercise through the
      expense-list integration tests.

tests:
  - |
    AC1 — selecting a single category in the filter narrows the list to only that category's
    expenses:
    ```js
    fireEvent.change(document.getElementById('filter-category'), { target: { value: 'travel' } });
    const rows = document.querySelectorAll('.expense-row');
    expect(rows.length).toBe(1);
    expect(rows[0].textContent).toContain('Flight to Chicago client site');
    ```
  - |
    AC2 — selecting "Uncategorised" shows only expenses with no category assigned. Seed one
    uncategorised expense first (via `reassignExpensesFromDeletedCategory`, the same helper AC5/6
    exercise, applied to a fixture id) so this doesn't depend on AC5's own test running first:
    ```js
    fireEvent.change(document.getElementById('filter-category'), { target: { value: 'uncategorised' } });
    const rows = document.querySelectorAll('.expense-row');
    expect(rows.length).toBe(1);
    expect(rows[0].querySelector('.chip-uncategorised')).toBeTruthy();
    ```
  - |
    AC3 — enabling "Grouped by category" renders expenses under category headings, with
    uncategorised expenses under a visually distinct heading (dashed border + muted italic text per
    the prototype, never color alone):
    ```js
    fireEvent.click(document.getElementById('view-grouped-btn'));
    const headings = document.querySelectorAll('.group-heading');
    expect(headings.length).toBeGreaterThan(1);
    const uncategorisedHeading = document.querySelector('.group-heading-uncategorised');
    expect(uncategorisedHeading.querySelector('.group-heading-name').textContent).toMatch(/Uncategorised/);
    ```
  - |
    AC4 — clearing an applied filter shows every expense again:
    ```js
    fireEvent.change(document.getElementById('filter-category'), { target: { value: 'travel' } });
    fireEvent.click(document.getElementById('clear-filter-btn'));
    expect(document.querySelectorAll('.expense-row').length).toBe(3);
    expect(document.getElementById('filter-category').value).toBe('all');
    ```
  - |
    AC5 — once a category is deleted, expenses previously in it appear under Uncategorised.
    Simulate the deletion "elsewhere" by applying the cascade + persisting the shrunk category
    list, then reopening the list (a fresh `initExpensesApp(document)` call):
    ```js
    const { loadExpenses, persistExpenses, reassignExpensesFromDeletedCategory, initExpensesApp } = require('../public/js/expenses');
    const { loadCategories, persistCategories, deleteCategory } = require('../public/js/categories');
    persistExpenses(reassignExpensesFromDeletedCategory(loadExpenses(), 'software'));
    persistCategories(deleteCategory(loadCategories(), 'software'));
    initExpensesApp(document);
    const row = document.querySelector('[data-edit-id="exp_003"]').closest('.expense-row');
    expect(row.querySelector('.chip-uncategorised')).toBeTruthy();
    ```
  - |
    AC6 — no reference to the deleted category remains anywhere in the list (filter options or
    group headings), reusing the same post-delete state as the AC5 test:
    ```js
    expect(document.getElementById('filter-category').textContent).not.toMatch(/Software/);
    fireEvent.click(document.getElementById('view-grouped-btn'));
    expect(document.querySelector('.expense-list').textContent).not.toMatch(/Software/);
    ```
  - |
    AC7 — each non-Uncategorised group heading shows a subtotal of its group's expenses:
    ```js
    fireEvent.click(document.getElementById('view-grouped-btn'));
    const travelHeading = [...document.querySelectorAll('.group-heading')].find((h) => h.textContent.includes('Travel'));
    expect(travelHeading.querySelector('.group-heading-meta').textContent).toMatch(/\$482\.50/);
    ```
  - |
    AC8 — the Uncategorised heading shows a count but no monetary subtotal:
    ```js
    fireEvent.click(document.getElementById('view-grouped-btn'));
    const meta = document.querySelector('.group-heading-uncategorised .group-heading-meta').textContent;
    expect(meta).toMatch(/expense/);
    expect(meta).not.toMatch(/\$/);
    ```
  - |
    AC9 — a category rename made elsewhere does not change the filter selector or group headings
    of an already-open list until the user takes further action:
    ```js
    const { loadCategories, persistCategories, renameCategory } = require('../public/js/categories');
    persistCategories(renameCategory(loadCategories(), 'travel', 'Trips'));
    // no re-init here — asserting against the list instance already opened in beforeEach
    expect(document.getElementById('filter-category').textContent).toMatch(/Travel/);
    expect(document.getElementById('filter-category').textContent).not.toMatch(/Trips/);
    ```
  - |
    AC10 — refreshing or reopening the list after a rename shows the new name. Reopening is
    modelled as a fresh `initExpensesApp(document)` call, which is this app's actual reload path
    (`initExpensesApp` runs from scratch on `DOMContentLoaded`, re-reading categories from
    localStorage — there is no separate in-app "refresh" affordance to build for this):
    ```js
    const { loadCategories, persistCategories, renameCategory } = require('../public/js/categories');
    const { initExpensesApp } = require('../public/js/expenses');
    persistCategories(renameCategory(loadCategories(), 'travel', 'Trips'));
    initExpensesApp(document);
    expect(document.getElementById('filter-category').textContent).toMatch(/Trips/);
    ```
  - |
    Edge case — a true zero-expense account shows an invitation-to-act empty state ("No expenses
    yet" + an "Add expense" CTA), not the filter-mismatch empty state:
    ```js
    const { persistExpenses, initExpensesApp } = require('../public/js/expenses');
    persistExpenses([]);
    initExpensesApp(document);
    expect(document.getElementById('empty-state').textContent).toMatch(/No expenses yet/);
    expect(document.getElementById('expense-list').style.display).toBe('none');
    ```
  - |
    Edge case — filtering to a real category that happens to have zero expenses shows the
    filter-mismatch empty state ("No expenses match this filter" + a clear-filter CTA), distinct
    from the true-zero-expenses copy above:
    ```js
    const { loadCategories, persistCategories } = require('../public/js/categories');
    const { initExpensesApp } = require('../public/js/expenses');
    persistCategories([...loadCategories(), { id: 'misc', name: 'Misc' }]);
    initExpensesApp(document);
    fireEvent.change(document.getElementById('filter-category'), { target: { value: 'misc' } });
    expect(document.getElementById('empty-state').textContent).toMatch(/No expenses match this filter/);
    ```
  - |
    Edge case — removing every category at once degrades grouping gracefully to a single
    Uncategorised group instead of erroring or dropping expenses:
    ```js
    const { loadCategories, persistCategories, deleteCategory } = require('../public/js/categories');
    const { initExpensesApp } = require('../public/js/expenses');
    const remaining = loadCategories().reduce((cats, c) => deleteCategory(cats, c.id), loadCategories());
    persistCategories(remaining);
    initExpensesApp(document);
    fireEvent.click(document.getElementById('view-grouped-btn'));
    const headings = document.querySelectorAll('.group-heading');
    expect(headings.length).toBe(1);
    expect(headings[0].classList.contains('group-heading-uncategorised')).toBe(true);
    expect(document.querySelectorAll('.expense-row').length).toBe(3);
    ```
  - |
    Edge case — an unusually long renamed category still appears (in full, un-truncated) in both
    the filter selector and its group heading:
    ```js
    const { loadCategories, persistCategories, renameCategory } = require('../public/js/categories');
    const { initExpensesApp } = require('../public/js/expenses');
    const longName = 'International Travel & Client Entertainment Reimbursements';
    persistCategories(renameCategory(loadCategories(), 'travel', longName));
    initExpensesApp(document);
    fireEvent.click(document.getElementById('view-grouped-btn'));
    expect(document.getElementById('filter-category').textContent).toContain(longName);
    expect(document.querySelector('.group-heading-name').textContent).toContain(longName);
    ```
  - |
    Edge case — a "dangling" categoryId that matches no current category (e.g. corrupted/partial
    data, not produced via `reassignExpensesFromDeletedCategory`) still falls back to Uncategorised
    defensively, per AC6's "no reference... remains" as a general invariant, not just a result of
    the one modelled delete path:
    ```js
    const { loadExpenses, persistExpenses, initExpensesApp } = require('../public/js/expenses');
    const expenses = loadExpenses();
    expenses[0].categoryId = 'nonexistent-category-id';
    persistExpenses(expenses);
    initExpensesApp(document);
    const row = document.querySelector(`[data-edit-id="${expenses[0].id}"]`).closest('.expense-row');
    expect(row.querySelector('.chip-uncategorised')).toBeTruthy();
    ```
  - |
    Edge case — an active category filter combines with grouped view rather than conflicting:
    filtering to "Travel" and then switching to grouped view shows only the Travel heading (no
    other category headings, no Uncategorised heading):
    ```js
    fireEvent.change(document.getElementById('filter-category'), { target: { value: 'travel' } });
    fireEvent.click(document.getElementById('view-grouped-btn'));
    const headings = document.querySelectorAll('.group-heading');
    expect(headings.length).toBe(1);
    expect(headings[0].textContent).toMatch(/Travel/);
    ```
  - |
    Edge case — deleting the category the user currently has selected in the filter resets the
    filter to "All categories" instead of leaving it pointing at a now-nonexistent option:
    ```js
    const { loadExpenses, persistExpenses, reassignExpensesFromDeletedCategory, initExpensesApp } = require('../public/js/expenses');
    const { loadCategories, persistCategories, deleteCategory } = require('../public/js/categories');
    fireEvent.change(document.getElementById('filter-category'), { target: { value: 'software' } });
    persistExpenses(reassignExpensesFromDeletedCategory(loadExpenses(), 'software'));
    persistCategories(deleteCategory(loadCategories(), 'software'));
    initExpensesApp(document);
    expect(document.getElementById('filter-category').value).toBe('all');
    expect(document.querySelectorAll('.expense-row').length).toBe(3);
    ```
  - |
    Regression — `reassignExpensesFromDeletedCategory` only touches matching expenses:
    ```js
    const { reassignExpensesFromDeletedCategory } = require('../public/js/expenses');
    const result = reassignExpensesFromDeletedCategory(
      [{ id: 'a', categoryId: 'software' }, { id: 'b', categoryId: 'travel' }],
      'software'
    );
    expect(result.find((e) => e.id === 'a').categoryId).toBeNull();
    expect(result.find((e) => e.id === 'b').categoryId).toBe('travel');
    ```
  - |
    Regression — `categories.js` module round-trips and mutates correctly in isolation, including
    deleting down to zero remaining categories without erroring:
    ```js
    const { DEFAULT_CATEGORIES, renameCategory, deleteCategory } = require('../public/js/categories');
    expect(renameCategory(DEFAULT_CATEGORIES, 'meals', 'Food & Drink').find((c) => c.id === 'meals').name).toBe('Food & Drink');
    expect(deleteCategory(DEFAULT_CATEGORIES, 'meals').find((c) => c.id === 'meals')).toBeUndefined();
    expect(deleteCategory(DEFAULT_CATEGORIES, 'meals').length).toBe(DEFAULT_CATEGORIES.length - 1);
    const emptied = DEFAULT_CATEGORIES.reduce((cats, c) => deleteCategory(cats, c.id), DEFAULT_CATEGORIES);
    expect(emptied).toEqual([]);
    ```

assumptions_or_open_questions:
  - |
    Layout conflict between the approved prototype and the currently-shipped page: the prototype's
    own comments say it "reuses the expense-list visual language established in
    TEST-M1-STORY-031/032," but the page actually wired into `public/index.html` today (032) is a
    `<table>` with a top bar, not the card-list-with-sidebar the prototype shows — that card-list
    style only exists in `public/app.js`, which is NOT loaded by any HTML page in this repo (dead
    code from 031, superseded when 032 shipped the table instead). This plan builds the prototype's
    layout (sidebar, filter bar, card list) directly into the real shipped page, since the
    prototype is the approved design of record and the ACs describe behavior of "the expense list"
    users actually see. `public/app.js` and `test/app.test.js` are left untouched as out-of-scope,
    unreferenced code. Flagging this for the reviewer in case the intent was actually the reverse
    (wire up `app.js` as the real page instead of rebuilding `index.html`) — happy to redo the file
    list around that if so.
  - |
    Category-name conflict: the prototype's fixture categories (Food/Transport/Housing/
    Entertainment/Misc) match `public/app.js`'s orphaned category list, not the real shipped
    `public/js/expenses.js` list (Travel/Meals/Software/Office Supplies/Other). No AC asks to
    change the app's category taxonomy, so this plan keeps the shipped names (slugified into ids:
    travel/meals/software/office-supplies/other) and applies only the prototype's *pattern* (chip +
    icon, group heading + subtotal, dashed Uncategorised styling) rather than its literal fixture
    names. The one exception is the "category with zero expenses" edge-case test, which adds a
    `Misc` category exactly as the prototype's edge-case screen does, since that's the specific
    scenario being tested, not a taxonomy change.
  - |
    No category-management ("Settings") UI exists anywhere in this codebase yet, and the parent
    epic frames "define and manage categories" as its own (broader) scope. This plan does not add
    any real rename/delete UI — AC5/6/9/10 (and the edge cases layered on top of them) are
    implemented as correct, testable behavior in the expense list given a categories/expenses store
    that *could* change externally, and are tested by mutating that store directly between two
    `initExpensesApp` calls rather than by driving a simulated "elsewhere" button, since building
    such a button would be inventing product surface the design explicitly marks as "not part of
    the real product UI" (its own demo panels).
  - |
    The prototype's sidebar (Dashboard/Expenses/Reports/Settings) drops the current page's
    non-functional "Employees" top-bar link. Since Employees has no frontend page today (it's a
    JSON-only API under `src/employees/`, and the existing link is `href="#" onclick="return
    false;"`), dropping it is a no-op for real functionality, so this plan follows the prototype's
    nav exactly rather than adding a 5th item the design doesn't show.
  - |
    No AC requires letting a user manually set an expense to "no category" from the Add/Edit form
    (category remains a required field there, unchanged); an expense can only become Uncategorised
    via the delete-reassignment path or a dangling-id edge case. The modal's category select
    therefore is not given an "Uncategorised" option.
  - |
    Category icons for the shipped category set (travel/meals/software/office-supplies/other)
    aren't specified by any AC, and the prototype's own icon map is keyed to its different fixture
    ids, so it can't be copied literally. Plan defines a small icon map with a 🗂️ fallback,
    mirroring the prototype's fallback pattern — exact emoji choice is cosmetic and open to
    reviewer preference.
  - |
    The long-category-name edge case is asserted on textContent only (full name present,
    un-truncated), not on actual pixel-level wrapping — jsdom doesn't perform real layout, so
    "wraps instead of overflowing" can only be verified visually in a real browser. The CSS
    scope item ensures no rule forces single-line/no-wrap behavior on the affected elements, which
    is the actual mechanism the prototype relies on, but a manual visual check is recommended once
    implemented.

package_dependencies: []

notes: |
  `@testing-library/dom`'s `fireEvent` (already a devDependency, already used by `test/app.test.js`)
  covers all new interaction tests; no new packages are needed.

  ```mermaid
  flowchart TD
    IndexHTML["public/index.html"] --> ExpensesJS["public/js/expenses.js"]
    IndexHTML --> CategoriesJS["public/js/categories.js"]
    ExpensesJS -- "loadCategories/renameCategory/deleteCategory" --> CategoriesJS
    IndexHTML --> ExpensesCSS["public/css/expenses.css"]
    ExpensesTest["test/expenses.test.js"] -- "exercises" --> ExpensesJS
    CategoriesTest["test/categories.test.js"] -- "exercises" --> CategoriesJS
    AppJS["public/app.js (orphaned, unwired — out of scope)"] -.-> StylesCSS["public/styles.css (out of scope)"]

    classDef touched fill:#f96,color:#000
    class IndexHTML,ExpensesJS,CategoriesJS,ExpensesCSS,ExpensesTest,CategoriesTest touched
  ```

  The dashed edge/untouched node (`public/app.js`) is shown only for contrast, per the first
  `assumptions_or_open_questions` entry — it is read but not modified by this plan.
