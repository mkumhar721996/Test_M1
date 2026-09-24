summary: |
  Add always-visible, live client-side filtering (category + date range) to the existing
  Expenses list page built in TEST-M1-STORY-030/091. The approved design
  (`.arc/designs/TEST-M1-STORY-094-design.html`, screen "Filtered Expense List (Live)") adds a
  `.filter-bar` above the expense table with a category `<select>`, "From"/"To" date `<input
  type="date">` fields, and a "Clear filters" button, plus an `aria-live` result-count line and a
  distinct "No matching expenses" state for the case where filters exclude every row. Filtering is
  purely in-memory (no network/localStorage round trip) and re-runs synchronously on every
  change/input event, matching AC2/AC3's "no submit, no reload" requirement. This plan wires that
  design into the production page (`public/index.html`), the existing vanilla-JS controller
  (`public/js/expenses.js`), and its stylesheet (`public/css/expenses.css`), following the same
  test-first, jsdom-based testing pattern already used by `test/expenses.test.js` and
  `test/expenses-create.test.js`.
scope:
  - description: |
      Add the filter bar markup to `public/index.html`, directly below the existing
      `.page-header-row` (which already contains the "+ Add expense" button from STORY-091) and
      above the `.card.table-card` that wraps the expense table. Markup follows the design's
      "Filtered Expense List (Live)" screen almost verbatim:

      ```html
      <form role="search" aria-label="Filter expenses" class="filter-bar" onsubmit="return false;">
        <div class="filter-field">
          <label class="label" for="filter-category">Category</label>
          <select class="input" id="filter-category" aria-label="Category">
            <option value="">All categories</option>
            <option>Travel</option>
            <option>Meals</option>
            <option>Software</option>
            <option>Office Supplies</option>
            <option>Other</option>
          </select>
        </div>
        <div class="filter-field">
          <label class="label" for="filter-start-date">From</label>
          <input class="input" type="date" id="filter-start-date" aria-label="Start date" />
        </div>
        <div class="filter-field">
          <label class="label" for="filter-end-date">To</label>
          <input class="input" type="date" id="filter-end-date" aria-label="End date" />
        </div>
        <div class="filter-field filter-actions-field">
          <button type="button" class="btn btn-secondary" id="clear-filters-btn">Clear filters</button>
        </div>
      </form>
      <p class="filter-hint" id="date-order-hint" hidden>
        <span class="filter-hint-icon" aria-hidden="true">&#9888;</span>Start date is after end
        date — no expenses will fall in range.
      </p>
      <div class="filter-result-row">
        <p class="list-count" id="result-count" aria-live="polite"></p>
      </div>
      ```

      The category `<option>` list is hardcoded exactly like the existing create/edit modals'
      category `<select>` in the same file (AC7 — fixed set, independent of current data). The
      `Category`/`Start date`/`End date` `aria-label`s are kept alongside the bound `<label for=
      "...">` elements to match the design exactly, even though the `aria-label` alone would
      satisfy AC9.
    files:
      - public/index.html
    rationale: |
      AC1 requires the category dropdown and both date pickers to be always visible above the
      table with no toggle — this places them, unconditionally rendered, in the page's static
      markup rather than behind any show/hide control. AC7 requires the dropdown to list a fixed
      category set regardless of current data, which a hardcoded `<option>` list guarantees by
      construction. AC9 requires each control to have an associated accessible label.
  - description: |
      Extend `public/js/expenses.js` with pure, testable filtering and wire it into rendering.

      Add a pure filter function (exported for direct unit testing):

      ```js
      function filterExpenses(list, { category = '', start = '', end = '' } = {}) {
        return list.filter((exp) => {
          if (category && exp.category !== category) return false;
          if (start && exp.date < start) return false;
          if (end && exp.date > end) return false;
          return true;
        });
      }
      ```

      Change `renderList()` (currently `function renderList() { ... uses `expenses` directly ... }`,
      taking no arguments) to `function renderList(list)`, which renders `list` (the *filtered*
      rows) into `#expense-tbody`, while keeping the existing zero-total check against `expenses`
      (the unfiltered source array) so the two empty states stay distinct per AC5:

      ```js
      function renderList(list) {
        const tbody = doc.getElementById('expense-tbody');
        tbody.innerHTML = '';

        if (expenses.length === 0) {
          // unchanged existing zero-total empty state ("No expenses yet.", colspan=5)
        }

        if (list.length === 0) {
          const tr = doc.createElement('tr');
          tr.className = 'no-match-row';
          tr.innerHTML = '<td colspan="5"><div class="no-match">' +
            '<svg class="no-match-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M4 5h16l-6 8v5l-4 2v-7L4 5z"></path></svg>' +
            '<p class="no-match-title">No matching expenses</p>' +
            '<p class="no-match-body">No expenses match the selected category and date range. Try widening the range or choosing a different category.</p>' +
            '</div></td>';
          tbody.appendChild(tr);
          return;
        }

        // unchanged: forEach over `list` building rows + wiring [data-edit-id] listeners
      }
      ```

      Note the `colspan="5"` (not the design mock's `colspan="4"`): the design's standalone
      screen has a 4-column table (Date/Category/Description/Amount) with no Actions column,
      but the production table already has a 5th "Actions" column from STORY-091 — the no-match
      row must span all 5 real columns.

      Add a coordinating function that reads the three filter controls, updates the date-order
      hint, filters, renders, and updates the result count:

      ```js
      function applyFiltersAndRender() {
        const filters = {
          category: filterCategorySelect.value,
          start: filterStartInput.value,
          end: filterEndInput.value,
        };
        dateOrderHint.hidden = !(filters.start && filters.end && filters.start > filters.end);
        const filtered = filterExpenses(expenses, filters);
        renderList(filtered);
        const total = expenses.length;
        const filtersActive = Boolean(filters.category || filters.start || filters.end);
        resultCount.textContent = filtersActive
          ? filtered.length + ' of ' + total + ' expenses match the current filters'
          : total + ' expenses';
      }
      ```

      Wire listeners (category `change`, both date inputs' `input`, and `clear-filters-btn`
      `click`, which resets all three controls then re-applies):

      ```js
      filterCategorySelect.addEventListener('change', applyFiltersAndRender);
      filterStartInput.addEventListener('input', applyFiltersAndRender);
      filterEndInput.addEventListener('input', applyFiltersAndRender);
      doc.getElementById('clear-filters-btn').addEventListener('click', () => {
        filterCategorySelect.value = '';
        filterStartInput.value = '';
        filterEndInput.value = '';
        applyFiltersAndRender();
      });
      ```

      Replace every existing call site that currently calls `renderList()` with no arguments
      (end of `initExpensesApp`, after a successful edit save, after a successful create save)
      with `applyFiltersAndRender()`, so an edit or a new expense re-renders honoring whatever
      filters are currently active rather than silently dropping them. Export `filterExpenses`
      from the `module.exports` object alongside the existing exports.
    files:
      - public/js/expenses.js
    rationale: |
      AC2/AC3/AC4 require synchronous, submit-free, AND-combined filtering on every
      category/date change — a pure `filterExpenses` plus `change`/`input` listeners (not
      `submit`) deliver that directly. AC5 requires a no-match state distinct from the
      already-existing zero-total state, so the zero-total branch is left untouched and a new
      branch is added beneath it. AC6 is satisfied by "Clear filters" resetting all three
      controls and re-invoking the same `applyFiltersAndRender` path used by every other filter
      change (no separate/divergent "restore" code path to drift out of sync).
  - description: |
      Add the design's page-specific filter/no-match styles to `public/css/expenses.css`
      (the page's existing stylesheet, already loaded by `public/index.html` alongside the
      shared `design-system/prototype-utils.css`): `.filter-bar`, `.filter-field`,
      `.filter-field.filter-actions-field`, `.filter-hint`, `.filter-hint-icon`,
      `.filter-result-row`, `.list-count`, `.no-match-row td`, `.no-match`, `.no-match-icon`,
      `.no-match-title`, `.no-match-body` — copied from the design's page-specific `<style>`
      block (lines ~372-500 of the design HTML), which already builds every value from existing
      tokens (`--space-*`, `--font-size-*`, `--color-*`) with no new hardcoded colors. Also add
      the design's touch-target bump `.btn, .input { min-height: 44px; }`, which the current
      production CSS lacks.
    files:
      - public/css/expenses.css
    rationale: |
      Keeps the filter bar and no-match state visually identical to the approved design while
      reusing only existing design tokens (UI guideline non-negotiable: tokens only, no
      hardcoded colors/spacing). The 44px min-height satisfies UI guideline §1 (touch targets
      ≥44×44px) for the new filter controls, and applying it via the shared `.btn`/`.input`
      classes keeps the existing modal buttons/inputs consistent rather than special-casing the
      filter bar alone.
  - description: |
      Add `test/expenses-filter.test.js`, following the existing jsdom pattern from
      `test/expenses.test.js`/`test/expenses-create.test.js` (load `public/index.html` into
      `document.documentElement.innerHTML`, `require('../public/js/expenses')`, call
      `initExpensesApp(document)`), with one test per acceptance criterion (see `tests` below).
    files:
      - test/expenses-filter.test.js
    rationale: |
      Test-first: every acceptance criterion gets a failing jsdom test written before the
      corresponding markup/JS/CSS lands, matching this repo's existing testing convention for
      the Expenses feature.
tests:
  - |
    AC1 — filter controls are unconditionally present on load, no toggle:
    ```js
    test('the category dropdown and both date pickers are visible on page load with no toggle', () => {
      expect(document.getElementById('filter-category')).not.toBeNull();
      expect(document.getElementById('filter-start-date')).not.toBeNull();
      expect(document.getElementById('filter-end-date')).not.toBeNull();
      expect(document.getElementById('filter-category').closest('[hidden]')).toBeNull();
    });
    ```
  - |
    AC2 — selecting a category immediately narrows the table with no submit/reload:
    ```js
    test('selecting a category immediately narrows the table to matching rows', () => {
      document.getElementById('filter-category').value = 'Software';
      document.getElementById('filter-category').dispatchEvent(new Event('change'));
      const rows = document.querySelectorAll('#expense-tbody tr');
      expect(rows.length).toBe(1);
      expect(rows[0].querySelector('.desc-cell').textContent).toBe('Figma seat renewal');
      expect(document.getElementById('result-count').textContent).toMatch(/1 of 3/);
    });
    ```
  - |
    AC3 — a start/end date range immediately narrows the table:
    ```js
    test('setting a start and end date immediately narrows the table to expenses within range', () => {
      document.getElementById('filter-start-date').value = '2026-09-03';
      document.getElementById('filter-start-date').dispatchEvent(new Event('input'));
      document.getElementById('filter-end-date').value = '2026-09-09';
      document.getElementById('filter-end-date').dispatchEvent(new Event('input'));
      const rows = document.querySelectorAll('#expense-tbody tr');
      expect(rows.length).toBe(1);
      expect(rows[0].querySelector('.desc-cell').textContent).toBe('Team lunch — Q3 kickoff');
    });
    ```
  - |
    AC4 — category AND date range together only show the intersection:
    ```js
    test('combining a category and a date range only shows expenses matching both', () => {
      document.getElementById('filter-category').value = 'Travel';
      document.getElementById('filter-category').dispatchEvent(new Event('change'));
      document.getElementById('filter-start-date').value = '2026-09-01';
      document.getElementById('filter-start-date').dispatchEvent(new Event('input'));
      document.getElementById('filter-end-date').value = '2026-09-03';
      document.getElementById('filter-end-date').dispatchEvent(new Event('input'));
      const rows = document.querySelectorAll('#expense-tbody tr');
      expect(rows.length).toBe(1);
      expect(rows[0].querySelector('.desc-cell').textContent).toBe('Flight to Chicago client site');
    });
    ```
  - |
    AC5 — empty filtered result shows "No matching expenses", distinct from the zero-total
    empty state:
    ```js
    test('filters matching nothing show a distinct "No matching expenses" message', () => {
      document.getElementById('filter-category').value = 'Other';
      document.getElementById('filter-category').dispatchEvent(new Event('change'));
      const noMatchRow = document.querySelector('.no-match-row');
      expect(noMatchRow).not.toBeNull();
      expect(noMatchRow.querySelector('.no-match-title').textContent).toBe('No matching expenses');
      expect(document.querySelector('.empty-row')).toBeNull();
    });
    ```
  - |
    AC6 — clearing all filters restores the full unfiltered list:
    ```js
    test('clearing all filter controls restores the full unfiltered expense list', () => {
      document.getElementById('filter-category').value = 'Software';
      document.getElementById('filter-category').dispatchEvent(new Event('change'));
      document.getElementById('clear-filters-btn').click();
      expect(document.getElementById('filter-category').value).toBe('');
      expect(document.getElementById('filter-start-date').value).toBe('');
      expect(document.getElementById('filter-end-date').value).toBe('');
      expect(document.querySelectorAll('#expense-tbody tr').length).toBe(3);
    });
    ```
  - |
    AC7 — the dropdown always lists the fixed application category set:
    ```js
    test('the category dropdown lists the fixed application category set regardless of current data', () => {
      const { CATEGORIES } = require('../public/js/expenses');
      const options = Array.from(document.querySelectorAll('#filter-category option'))
        .map((o) => o.value)
        .filter((v) => v !== '');
      expect(options).toEqual(CATEGORIES);
    });
    ```
  - |
    AC8 — every filter control is a native, enabled, tabbable element (keyboard operable):
    ```js
    test('every filter control is a native, non-disabled element reachable by Tab', () => {
      ['filter-category', 'filter-start-date', 'filter-end-date', 'clear-filters-btn'].forEach((id) => {
        const el = document.getElementById(id);
        expect(el.disabled).toBe(false);
        expect(el.tabIndex).not.toBe(-1);
      });
    });
    ```
  - |
    AC9 — every filter control has an associated accessible label:
    ```js
    test('every filter control has an associated accessible label', () => {
      expect(document.querySelector('label[for="filter-category"]')).not.toBeNull();
      expect(document.querySelector('label[for="filter-start-date"]')).not.toBeNull();
      expect(document.querySelector('label[for="filter-end-date"]')).not.toBeNull();
      expect(document.getElementById('filter-category').getAttribute('aria-label')).toBe('Category');
      expect(document.getElementById('filter-start-date').getAttribute('aria-label')).toBe('Start date');
      expect(document.getElementById('filter-end-date').getAttribute('aria-label')).toBe('End date');
    });
    ```
assumptions_or_open_questions:
  - |
    The design's "Filtered Expense List (Live)" screen does not include the "+ Add expense"
    button that STORY-091 already shipped in `public/index.html` — the design was authored as a
    focused iteration on filtering alone. Assuming both features coexist: the existing
    `.page-header-row` (with its Add expense button) stays as-is, and the new `.filter-bar` is
    inserted directly beneath it, above the table card, exactly as laid out in the design.
  - |
    The design mock's no-match/table markup has 4 columns (no Actions column); the production
    table has 5 (Date/Category/Description/Amount/Actions, from STORY-091). The plan uses
    `colspan="5"` for the no-match row to span the real table, keeping every other class/element
    from the design's `.no-match` block unchanged.
  - |
    AC8 (keyboard operability) is satisfied for free by using native `<select>`/`<input
    type="date">` elements (per the design's own annotation and UI guideline §0, which forbids
    custom form controls in app code anyway) — no custom keyboard handling is added. The test
    verifies each control is enabled and not `tabindex="-1"` rather than simulating a full
    browser Tab traversal, since jsdom does not implement real focus-order navigation.
  - |
    The design HTML's "Reset filters & data" button and its second "Reference States" screen are
    reviewer/demo-only scaffolding for the standalone prototype file (per UI guideline §11) and
    are not implemented in production — only the "Filtered Expense List (Live)" screen's actual
    filter bar, table, and states are built.
  - |
    AC9 is satisfied by the bound `<label for="...">` alone; the design additionally sets a
    matching `aria-label` on each control. Both are kept to match the approved design exactly,
    even though it's redundant for accessible-name computation.
package_dependencies: []
notes: |
  This is a small, self-contained front-end change entirely within the existing static
  Expenses page — no server routes, stores, or other pages are touched. The touched modules and
  their relationships:

  ```mermaid
  flowchart TD
    HTML[public/index.html]
    JS[public/js/expenses.js initExpensesApp]
    CSS[public/css/expenses.css]
    FILTER[filterExpenses pure fn]
    APPLY[applyFiltersAndRender]
    RENDER[renderList list]
    TEST[test/expenses-filter.test.js]

    HTML -->|"DOM ids: filter-category, filter-start-date, filter-end-date, clear-filters-btn, result-count, date-order-hint, expense-tbody"| JS
    CSS -->|".filter-bar / .filter-field / .no-match-* styles"| HTML
    JS --> APPLY
    APPLY --> FILTER
    APPLY --> RENDER
    TEST -->|"loads index.html, requires expenses.js, drives DOM events"| JS

    classDef touched fill:#f96,color:#000
    class HTML,JS,CSS,FILTER,APPLY,RENDER,TEST touched
  ```

  Existing edit/create flows in `public/js/expenses.js` (modal open/close, validation, save
  timers) are untouched except for the three `renderList()` call sites being repointed to
  `applyFiltersAndRender()` so a save/edit re-renders honoring active filters instead of
  silently ignoring them.
