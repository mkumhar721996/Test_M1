summary: |
  Builds the already-approved "Shared Expense List with Filters" screen
  (`.arc/designs/TEST-M1-STORY-179-design.html`) on top of the existing client-side expense
  app (`public/index.html` + `public/js/expenses.js`, localStorage-backed, no server
  component). The current filter bar auto-applies on every `change`/`input` event and only
  shows a passive, non-blocking hint when the date range is inverted; the approved design
  replaces that with an explicit "Apply filters" / "Clear filters" workflow, an active-filter
  chip row, a `result-summary` line, a distinct dashed-border "no match" callout, and a
  blocking inline validation error for an inverted date range. The current render path also
  never sorts by date, so the default view currently violates AC5. This plan reworks the
  filter bar markup, the render/filter pipeline in `expenses.js`, and the supporting CSS to
  match the design pixel-for-pixel for every element the design actually shows, while leaving
  the pre-existing Edit action and create/edit logic untouched per this story's explicit
  scope note ("Does not cover creating or editing records").
scope:
  - description: |
      Replace the filter-bar markup in `public/index.html` with the design's filter-card
      structure: a `.card.filter-card` wrapping a `.filter-row` (Category `<select>`, "From"
      and "To" date `<input type="date">`, and a `.filter-actions` pair of `Clear filters` /
      `Apply filters` buttons), a `.field-error#error-date-range` (role="alert", hidden by
      default) directly under the row, and a `.active-filter-chips#active-filter-chips`
      container — exactly as laid out in the design's "Shared Expense List" screen. Remove
      the old `date-order-hint` passive-hint paragraph and `filter-result-row`/`list-count`
      markup, replacing the latter with a single `<p class="result-summary" id="result-summary"
      role="status" aria-live="polite">` placed between the filter card and the table card,
      matching the design exactly. Keep every existing `aria-label`/`label[for]` pairing on
      the category/date controls, and keep the Edit column in `<thead>`/`<tbody>` untouched.
    files:
      - public/index.html
    rationale: |
      The design screen's filter bar (ids `filter-category`, `filter-start-date`,
      `filter-end-date`, `clear-filters-btn`, `apply-filters-btn`, `error-date-range`,
      `active-filter-chips`, `result-summary`) is a different interaction model than what's
      currently in the DOM (live filtering, `date-order-hint`, `result-count`), and AC2/AC4/
      AC9/AC10 all depend on the Apply-gated, validated workflow this markup enables.
  - description: |
      Rework the filter/render pipeline in `public/js/expenses.js`: add an exported
      `sortByDateDesc(list)` pure function (`list.slice().sort((a, b) =>
      b.date.localeCompare(a.date))`), introduce module-level `activeFilters` and
      `visibleExpenses` state (mirroring the design's script), and replace
      `applyFiltersAndRender`/live `change`/`input` listeners with:
      an `apply-filters-btn` click handler that (a) reads category/start/end, (b) if
      `startDate && endDate && startDate > endDate` calls `setDateRangeError(...)` and
      returns without touching `activeFilters`/`visibleExpenses` (AC9, AC10), else (c) clears
      the error, sets `activeFilters`, recomputes `visibleExpenses =
      sortByDateDesc(filterExpenses(expenses, activeFilters))` (AC2, AC5, AC6), and
      re-renders; and a `clear-filters-btn` handler that resets the three controls, clears
      the error, sets `activeFilters` back to `{ category: '', start: '', end: '' }`, and
      sets `visibleExpenses = sortByDateDesc(expenses)` (AC3). `renderList()` changes
      signature from `renderList(list)` to `renderList()` (reads `visibleExpenses`), renders
      `result-summary` text ("Showing all N expenses, sorted by date (newest first)." with no
      filters active, else "Showing X of Y expenses matching the applied filters, sorted by
      date (newest first)."), renders `active-filter-chips` from a `describeFilters(filters)`
      helper, and — when `visibleExpenses.length === 0` and at least one filter is active —
      renders the `.no-match-state` block (🔍 icon, "No expenses match these filters" title,
      detail copy, and a "Clear filters" button wired to the same clear handler) instead of
      the old `.no-match-row`. On `initExpensesApp` load and after every create/edit save,
      call `visibleExpenses = sortByDateDesc(filterExpenses(expenses, activeFilters))` before
      rendering, so AC5 holds on first load and stays true after any create/edit without
      touching the create/edit submit handlers themselves.
    files:
      - public/js/expenses.js
    rationale: |
      This is the only place AC2/AC3/AC5/AC6/AC9/AC10 can be implemented; the existing
      `filterExpenses` pure function already does inclusive start/end comparison (AC6 is
      already correct there), so it is reused as-is rather than rewritten.
  - description: |
      Add/rename CSS in `public/css/expenses.css` to match the design's component classes:
      `.filter-card`, `.filter-row`, `.field.date-field`, `.filter-actions`,
      `.active-filter-chips` (+ `[hidden]`), `.filter-chip`, `.result-summary`, and
      `.no-match-state` (dashed border callout, distinct from the existing `.empty-state`
      used only when there are zero expenses at all) with `.no-match-icon` /
      `.no-match-title` / `.no-match-detail`, taking spacing/colour values straight from the
      design's inline `<style>` block (e.g. `.no-match-state { border: 1px dashed
      var(--color-border); border-radius: var(--radius-md); margin: var(--space-4); }`).
      Remove the now-unused `.filter-bar`, `.filter-field`, `.filter-hint`/`.filter-hint-icon`,
      `.filter-result-row`, `.list-count`, `.no-match-row`/`.no-match`/`.no-match-body` rules
      once the markup in `public/index.html` no longer references them.
    files:
      - public/css/expenses.css
    rationale: |
      The design's "Design-system gap note" comment explicitly says the no-match/validation
      states must be signalled with icon + bold text + heavier border rather than colour
      alone (no `color-danger` token exists) — the existing `.no-match-row`/`.no-match-body`
      styling doesn't have the dashed-border treatment the design uses to make AC4's message
      read as a deliberate callout rather than a blank table.
  - description: |
      Rewrite `test/expenses-filter.test.js` test-first, one `describe` block covering every
      AC in this story (the file's current contents test a since-superseded live-filter,
      non-blocking-hint interaction model and must be replaced, not patched around).
    files:
      - test/expenses-filter.test.js
    rationale: |
      The existing file asserts behaviour (`result-count`, auto-filter on `change`/`input`,
      a passive `date-order-hint` that never blocks) that directly contradicts AC9/AC10 and
      the approved design's ids/workflow, so it would false-pass against old behaviour and
      must be replaced wholesale as part of this story's filter-control scope.
tests:
  - |
    AC1 — every expense stays visible no matter which identity is "signed in", confirming
    the viewer switcher only previews, never filters:
    ```js
    test('AC1: every expense is visible regardless of which identity is signed in', () => {
      const countFor = (name) => {
        document.getElementById('viewer-select').value = name;
        document.getElementById('viewer-select').dispatchEvent(new Event('change'));
        return document.querySelectorAll('#expense-tbody tr').length;
      };
      expect(countFor('Morgan Ellis')).toBe(3);
      expect(countFor('Priya Shah')).toBe(3);
      expect(countFor('Devon Ruiz')).toBe(3);
    });
    ```
  - |
    AC2 — applying a category and a date range together only shows rows matching both:
    ```js
    test('AC2: applying category + date range together shows only rows matching both', () => {
      document.getElementById('filter-category').value = 'Travel';
      document.getElementById('filter-start-date').value = '2026-09-01';
      document.getElementById('filter-end-date').value = '2026-09-03';
      document.getElementById('apply-filters-btn').click();
      jest.advanceTimersByTime(300);
      const rows = document.querySelectorAll('#expense-tbody tr');
      expect(rows.length).toBe(1);
      expect(rows[0].querySelector('.desc-cell').textContent).toBe('Flight to Chicago client site');
    });
    ```
  - |
    AC3 — "Clear filters" restores the full unfiltered, date-descending list:
    ```js
    test('AC3: Clear filters restores the full unfiltered list', () => {
      document.getElementById('filter-category').value = 'Software';
      document.getElementById('apply-filters-btn').click();
      jest.advanceTimersByTime(300);
      document.getElementById('clear-filters-btn').click();
      const dates = Array.from(document.querySelectorAll('#expense-tbody tr'))
        .map((tr) => tr.children[0].textContent);
      expect(dates).toEqual(['09/10/2026', '09/05/2026', '09/02/2026']);
      expect(document.getElementById('filter-category').value).toBe('');
    });
    ```
  - |
    AC4 — a filter combination matching nothing shows the distinct no-match callout, not a
    blank table:
    ```js
    test('AC4: a non-matching filter combination shows a distinct "no match" callout', () => {
      document.getElementById('filter-category').value = 'Office Supplies';
      document.getElementById('apply-filters-btn').click();
      jest.advanceTimersByTime(300);
      const noMatch = document.querySelector('.no-match-state');
      expect(noMatch).not.toBeNull();
      expect(noMatch.querySelector('.no-match-title').textContent).toBe('No expenses match these filters');
      expect(document.querySelectorAll('#expense-tbody tr').length).toBe(1);
    });
    ```
  - |
    AC5 — the unfiltered list renders most-recent-first on load, and the sort helper is a
    pure function independent of input order:
    ```js
    test('AC5: sortByDateDesc orders by date descending regardless of input order', () => {
      const { sortByDateDesc } = require('../public/js/expenses');
      const input = [
        { id: 'a', date: '2026-09-02' },
        { id: 'b', date: '2026-09-10' },
        { id: 'c', date: '2026-09-05' },
      ];
      expect(sortByDateDesc(input).map((e) => e.id)).toEqual(['b', 'c', 'a']);
    });

    test('AC5: the unfiltered list on load is rendered most-recent-first', () => {
      const dates = Array.from(document.querySelectorAll('#expense-tbody tr'))
        .map((tr) => tr.children[0].textContent);
      expect(dates).toEqual(['09/10/2026', '09/05/2026', '09/02/2026']);
    });
    ```
  - |
    AC6 — a date range applied via "Apply filters" includes rows dated exactly on the start
    and end boundaries:
    ```js
    test('AC6: boundary-dated rows are included in an applied date range', () => {
      document.getElementById('filter-start-date').value = '2026-09-02';
      document.getElementById('filter-end-date').value = '2026-09-10';
      document.getElementById('apply-filters-btn').click();
      jest.advanceTimersByTime(300);
      const descriptions = Array.from(document.querySelectorAll('#expense-tbody .desc-cell'))
        .map((td) => td.textContent);
      expect(descriptions).toEqual(
        expect.arrayContaining(['Flight to Chicago client site', 'Figma seat renewal'])
      );
    });
    ```
  - |
    AC7 — every row shows the "Logged by" identity as a visible field:
    ```js
    test('AC7: each row shows the identity that logged it in a visible "Logged by" field', () => {
      expect(document.querySelector('.expense-table thead th:nth-child(4)').textContent).toBe('Logged by');
      const row = document.querySelector('[data-edit-id="exp_002"]').closest('tr');
      expect(row.querySelector('.logged-by-cell').textContent).toBe('Priya Shah');
    });
    ```
  - |
    AC8 — no delete control exists anywhere on the shared list:
    ```js
    test('AC8: no delete control is presented anywhere on the list', () => {
      const buttons = Array.from(document.querySelectorAll('button'));
      expect(buttons.some((b) => /delete/i.test(b.textContent) || /delete/i.test(b.id))).toBe(false);
    });
    ```
  - |
    AC9 — an inverted date range (From after To) is blocked with an inline error next to the
    date fields:
    ```js
    test('AC9: From after To is blocked with an inline validation error', () => {
      document.getElementById('filter-start-date').value = '2026-09-27';
      document.getElementById('filter-end-date').value = '2026-09-15';
      document.getElementById('apply-filters-btn').click();
      const error = document.getElementById('error-date-range');
      expect(error.hidden).toBe(false);
      expect(error.textContent).toMatch(/From.*on or before.*To/i);
    });
    ```
  - |
    AC10 — that same blocked attempt leaves the previously shown list completely unchanged:
    ```js
    test('AC10: a blocked invalid-range attempt leaves the previously shown list unchanged', () => {
      const before = Array.from(document.querySelectorAll('#expense-tbody .desc-cell'))
        .map((td) => td.textContent);
      document.getElementById('filter-start-date').value = '2026-09-27';
      document.getElementById('filter-end-date').value = '2026-09-15';
      document.getElementById('apply-filters-btn').click();
      const after = Array.from(document.querySelectorAll('#expense-tbody .desc-cell'))
        .map((td) => td.textContent);
      expect(after).toEqual(before);
    });
    ```
assumptions_or_open_questions:
  - |
    The design's own screen omits the Actions/Edit column entirely, and its "Reference
    states" screen explicitly says "No column or row menu offers edit or delete — this view
    is read-only." That directly conflicts with this story's scope note ("Does not cover
    creating or editing records") and with the already-approved, already-tested Edit action
    (`test/expenses.test.js`, "Edit Expense via Modal Form", from a prior story). Decision:
    keep the existing Edit column/action exactly as-is; read the design's "read-only" framing
    as describing only the filtering/visibility additions this story itself contributes (no
    new edit or delete affordance), not as a mandate to remove a feature a separate approved
    story already shipped. AC8 (no delete) is still fully honored either way.
  - |
    The design's fixture data includes a fourth "signed in as" identity, Jordan Lee, that
    doesn't exist in the real app's viewer switcher (locked at 3 options — Morgan Ellis,
    Priya Shah, Devon Ruiz — by an existing passing test in `expenses-create.test.js`). No
    AC in this story requires adding identities, so the switcher is left unchanged; the
    design's 4th name is treated as demo-fixture flavor, not a scoped requirement.
  - |
    Keeping the existing page-header and `.shared-visibility-hint` copy wording as-is rather
    than adopting the design's slightly reworded copy ("One shared list for the whole team…",
    "same filters available…"), since AC1 is a behavioral requirement already satisfied by
    the current copy and wording, and an existing passing test pins the current wording via
    a regex match.
  - |
    The design simulates a short delay ("Applying…" button state, ~280ms) before filters take
    effect, mirroring the existing 350ms simulated-save delay pattern already used by the
    create/edit forms in this codebase. No AC requires this delay; it's included only for
    visual fidelity with the approved design and consistency with the codebase's existing
    async-button-state convention (`jest.useFakeTimers()` / `jest.advanceTimersByTime(...)`
    in tests). Flagging in case the reviewer would rather keep filtering fully synchronous.
  - |
    No backend/server changes are needed — expenses are purely client-side, persisted to
    `localStorage` (there is no `src/expenses/` route or store, unlike `src/employees/`),
    so this plan's scope is entirely within `public/`.
package_dependencies: []
notes: |
  No new dependency is needed: `jest`, `jest-environment-jsdom`, and
  `@testing-library/dom` are already devDependencies and already used by the sibling
  `expenses.test.js`/`expenses-create.test.js` files this plan's test file sits alongside.

  ```mermaid
  flowchart TD
    HTML[public/index.html] -->|filter-card markup, ids read by JS| JS[public/js/expenses.js]
    JS -->|renders classes defined in| CSS[public/css/expenses.css]
    UTILS[public/js/utils.js] -->|escapeHtml, formatDateDisplay| JS
    TEST[test/expenses-filter.test.js] -->|loads fixture DOM from| HTML
    TEST -->|calls initExpensesApp, sortByDateDesc, filterExpenses| JS

    classDef touched fill:#f96,color:#000
    class HTML,JS,CSS,TEST touched
  ```
review_focus: |
  In scope: the filter bar's Apply/Clear workflow, inline date-range validation (AC9/AC10),
  always-sort-by-date-desc on render (AC5), the active-filter-chip row, the result-summary
  line, and the distinct no-match callout (AC4) — all driven off the existing, unmodified
  `filterExpenses` pure function. Out of scope, deliberately: create/edit submit logic, the
  Edit column/action, the viewer-switcher identity list, and the page's existing copy —
  none of this story's ACs require touching them, and the design's own fixture/reference
  screens disagree with already-approved behavior from other stories in ways called out
  above. The riskiest area is the switch from live (`change`/`input`) filtering to an
  Apply-gated workflow: double-check that `visibleExpenses` is only ever reassigned on a
  successful Apply or Clear (never on a blocked, invalid Apply attempt — AC10), and that the
  post-create/post-edit render path still re-sorts/re-filters through `activeFilters` rather
  than reverting to raw insertion order.
