summary: |
  Make the expense list actually reachable in its two real states instead of one fake one.
  Today `loadExpenses()` in `public/js/expenses.js` auto-seeds three fixture rows
  (`INITIAL_EXPENSES`) into `localStorage` the very first time it is empty, and the table's
  own "no data" fallback is a single `<tr class="empty-row">` cell reading "No expenses yet."
  That means a genuinely-empty store can never be observed in the shipped app, and AC2's
  guided empty state (icon + heading + body copy + "+ Add your first expense" button) has no
  markup at all yet. This plan (a) stops the auto-seed so `loadExpenses()` returns `[]` when
  storage is empty or unreadable, (b) adds the guided empty-state card from the approved
  prototype (`.arc/designs/TEST-M1-STORY-090-design.html`, "Empty State" and "Live Demo"
  screens) as a sibling of the existing table card, toggled by `renderList()`, and (c) wires
  that empty state's own button to the create-expense modal already shipped in
  TEST-M1-STORY-091. Because removing the auto-seed changes what a fresh `localStorage` looks
  like, the existing edit-modal test suite (`test/expenses.test.js`), which relies on that
  auto-seed to have `exp_001`/`exp_002`/`exp_003` present, is updated to seed that same fixture
  data explicitly rather than relying on the side effect.

scope:
  - description: |
      Stop `loadExpenses()` from writing `INITIAL_EXPENSES` into `localStorage` as a side
      effect of reading it. Today:
      ```js
      function loadExpenses() {
        try {
          const raw = localStorage.getItem(STORAGE_KEY);
          if (raw) return JSON.parse(raw);
        } catch (e) { /* ignore malformed storage */ }
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(INITIAL_EXPENSES));
        } catch (e) { /* storage unavailable — fall back to in-memory defaults */ }
        return INITIAL_EXPENSES.map((e) => ({ ...e }));
      }
      ```
      becomes:
      ```js
      function loadExpenses() {
        try {
          const raw = localStorage.getItem(STORAGE_KEY);
          const parsed = raw ? JSON.parse(raw) : [];
          return Array.isArray(parsed) ? parsed : [];
        } catch (e) {
          return [];
        }
      }
      ```
      `INITIAL_EXPENSES` stays as an exported fixture constant (existing tests and the new
      empty-state test reuse it to seed `localStorage` explicitly) but is no longer written by
      production code.
    files:
      - public/js/expenses.js
    rationale: |
      This is the actual root cause blocking AC2: a fresh page load always had three fake rows,
      so the guided empty state could never appear in real use. The design's own "Live Demo"
      screen (design lines 814-835) reads real `localStorage` with no seed-on-empty behavior and
      offers an explicit "Load sample expenses" action instead — confirming empty is meant to be
      a first-class, reachable state, not something the app papers over.

  - description: |
      Add the guided empty-state card to `public/index.html` as a sibling of the existing table
      card, and give the table card an id so JS can toggle between the two. Current markup:
      ```html
      <div class="card table-card">
        <div class="table-scroll">
          <table class="expense-table"> ... </table>
        </div>
      </div>
      ```
      becomes (id added to the existing card, new empty-state card added right after it, hidden
      by default in the static markup until JS decides which to show):
      ```html
      <div class="card table-card" id="expense-table-wrap">
        <div class="table-scroll">
          <table class="expense-table"> ... </table>
        </div>
      </div>

      <div class="card" id="expense-empty-state" hidden>
        <div class="empty-state" role="status">
          <svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
            <rect x="4" y="3" width="16" height="18" rx="2"></rect>
            <path d="M8 8h8M8 12h8M8 16h5"></path>
          </svg>
          <h2 class="empty-state-title">No expenses yet</h2>
          <p class="empty-state-body">Start tracking your spending — add your first expense to see it listed here.</p>
          <button type="button" class="btn btn-primary" id="empty-add-expense-btn">+ Add your first expense</button>
        </div>
      </div>
      ```
      This markup, copy, and icon are copied verbatim from the approved prototype's "Empty
      State" screen (design lines 628-638) and "Live Demo" screen (design lines 716-728) — same
      heading, same body copy, same decorative (`aria-hidden`) document icon, same single CTA.
    files:
      - public/index.html
    rationale: |
      AC2 requires the empty state to appear "in place of the table", i.e. the table itself must
      not render, not just show a friendlier one-row message inside it. The prototype shows this
      as a full `.card > .empty-state` block replacing the table card, so production markup needs
      that second card to exist for `renderList()` to reveal.

  - description: |
      In `renderList()`, toggle `#expense-table-wrap` / `#expense-empty-state` visibility based
      on `expenses.length`, remove the old single-row `.empty-row` fallback, and wire the new
      `#empty-add-expense-btn` to the same `openCreateModal` already used by the header's
      `#add-expense-btn`. Relevant slice of the new `renderList()`:
      ```js
      function renderList() {
        const tableWrap = doc.getElementById('expense-table-wrap');
        const emptyState = doc.getElementById('expense-empty-state');
        const tbody = doc.getElementById('expense-tbody');
        tbody.innerHTML = '';

        if (expenses.length === 0) {
          tableWrap.hidden = true;
          emptyState.hidden = false;
          return;
        }

        tableWrap.hidden = false;
        emptyState.hidden = true;

        expenses.forEach((exp) => { /* unchanged row-rendering body */ });
        lastUpdatedId = null;
        lastAddedId = null;
        tbody.querySelectorAll('[data-edit-id]').forEach((btn) => {
          btn.addEventListener('click', () => openEditModal(btn.getAttribute('data-edit-id')));
        });
      }
      ```
      and, alongside the existing header-button binding:
      ```js
      doc.getElementById('add-expense-btn').addEventListener('click', openCreateModal);
      doc.getElementById('empty-add-expense-btn').addEventListener('click', openCreateModal);
      ```
    files:
      - public/js/expenses.js
    rationale: |
      This is what actually makes AC1/AC2 visible and AC3 clickable: the table only shows when
      there is data, the guided empty state only shows when there is not, and its button opens
      the exact same create-expense modal flow already shipped and tested in
      TEST-M1-STORY-091 (`#create-modal-wrap`), matching the prototype's note that "+ Add your
      first expense" and the header's "+ Add expense" open the identical modal.

  - description: |
      Add the empty-state styles to `public/css/expenses.css` (copied from the design's own
      token-based rules, design lines 397-420) and delete the now-dead `.empty-row td { ... }`
      rule (current lines 65-69), since no markup renders that class anymore.
      ```css
      .empty-state {
        text-align: center;
        padding: calc(var(--space-4) * 2) var(--space-4);
      }
      .empty-state-icon {
        margin: 0 auto var(--space-3);
        width: 56px;
        height: 56px;
        color: var(--color-fg-muted);
      }
      .empty-state-title {
        font-family: var(--font-family-base);
        font-size: var(--font-size-lg);
        font-weight: var(--font-weight-bold);
        color: var(--color-fg);
        margin: 0 0 var(--space-2);
      }
      .empty-state-body {
        font-family: var(--font-family-base);
        font-size: var(--font-size-md);
        color: var(--color-fg-muted);
        max-width: 42ch;
        margin: 0 auto var(--space-4);
      }
      ```
    files:
      - public/css/expenses.css
    rationale: |
      Tokens-only styling per the UI guidelines (§0): every value here is a `var(--...)` token
      already defined in `design-system/tokens.css`, none hardcoded, matching the prototype
      exactly. `.empty-row` is removed rather than left in place because nothing in the new
      markup ever gets that class — leaving it would be dead CSS.

  - description: |
      Update `test/expenses.test.js`'s `beforeEach` to explicitly seed `localStorage` with the
      same fixture data it previously got for free via auto-seed, since that auto-seed is being
      removed in this story. Before:
      ```js
      beforeEach(() => {
        jest.resetModules();
        localStorage.clear();
        document.documentElement.innerHTML = fs.readFileSync(HTML_PATH, 'utf8');
        jest.useFakeTimers();
        const { initExpensesApp } = require('../public/js/expenses');
        initExpensesApp(document);
      });
      ```
      After:
      ```js
      beforeEach(() => {
        jest.resetModules();
        localStorage.clear();
        document.documentElement.innerHTML = fs.readFileSync(HTML_PATH, 'utf8');
        jest.useFakeTimers();
        const { initExpensesApp, INITIAL_EXPENSES, STORAGE_KEY } = require('../public/js/expenses');
        localStorage.setItem(STORAGE_KEY, JSON.stringify(INITIAL_EXPENSES));
        initExpensesApp(document);
      });
      ```
      No assertions in that file change — it still exercises `exp_001`/`exp_002`/`exp_003` — only
      how they get into `localStorage` changes.
    files:
      - test/expenses.test.js
    rationale: |
      That whole suite is about the pre-existing edit-modal flow (out of this story's scope) and
      depends on `exp_001` etc. already being present the moment `initExpensesApp` runs. Once
      `loadExpenses()` no longer seeds fixtures on an empty store (this story's fix for AC2),
      that suite would start seeing a genuinely empty list and fail on the very first test.
      `test/expenses-create.test.js` needs no change: none of its assertions depend on specific
      seeded rows existing, only on relative before/after counts, which hold at 0 or otherwise.

  - description: |
      Add a new test file, `test/expenses-list-empty-state.test.js`, covering all three
      acceptance criteria for this story, following the same jsdom + fake-timers harness pattern
      as `test/expenses-create.test.js`.
    files:
      - test/expenses-list-empty-state.test.js
    rationale: |
      This story's three ACs (populated table, guided empty state, empty-state CTA opens the
      create modal) have no dedicated coverage today; the existing suites only cover the
      edit and create modal flows.

tests:
  - |
    AC1 — seeding localStorage with expenses before init renders every one as a row with its
    date/category/description/amount cells:
    ```js
    test('all expenses in localStorage are rendered with date, category, description, and amount cells', () => {
      localStorage.setItem('expenses', JSON.stringify([
        { id: 'exp_101', date: '2026-09-10', category: 'Software', description: 'Figma seat renewal', amount: 15 },
        { id: 'exp_102', date: '2026-09-18', category: 'Travel', description: 'Flight to Chicago client site', amount: 482.5 },
      ]));
      const { initExpensesApp } = require('../public/js/expenses');
      initExpensesApp(document);

      expect(document.getElementById('expense-table-wrap').hidden).toBe(false);
      expect(document.getElementById('expense-empty-state').hidden).toBe(true);
      const rows = document.querySelectorAll('#expense-tbody tr');
      expect(rows.length).toBe(2);
      const softwareRow = Array.from(rows).find((r) => r.querySelector('.chip').textContent === 'Software');
      expect(softwareRow.querySelector('.desc-cell').textContent).toBe('Figma seat renewal');
      expect(softwareRow.querySelector('.col-amount').textContent).toBe('$15.00');
    });
    ```
    This fails today because `#expense-table-wrap` does not exist (the table card has no id yet).
  - |
    AC2 (part 1) — a genuinely empty store stays empty; `loadExpenses` no longer auto-seeds:
    ```js
    test('loadExpenses returns an empty array and writes nothing when localStorage is empty', () => {
      localStorage.clear();
      const { loadExpenses, STORAGE_KEY } = require('../public/js/expenses');
      expect(loadExpenses()).toEqual([]);
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });
    ```
    This fails today because `loadExpenses()` currently calls `localStorage.setItem` with
    `INITIAL_EXPENSES` the first time storage is empty.
  - |
    AC2 (part 2) — with no expenses, the guided empty state replaces the table:
    ```js
    test('with no expenses in localStorage, the guided empty state replaces the table', () => {
      localStorage.clear();
      const { initExpensesApp } = require('../public/js/expenses');
      initExpensesApp(document);

      expect(document.getElementById('expense-table-wrap').hidden).toBe(true);
      expect(document.getElementById('expense-empty-state').hidden).toBe(false);
      expect(document.querySelector('.empty-state-title').textContent).toBe('No expenses yet');
      expect(document.querySelector('.empty-state-body').textContent).toMatch(/add your first expense/i);
    });
    ```
    This fails today because there is no `#expense-empty-state` element and no guided-empty-state
    markup at all.
  - |
    AC3 — clicking the empty state's own button opens the create-expense modal:
    ```js
    test('clicking "+ Add your first expense" in the empty state opens the create-expense modal', () => {
      localStorage.clear();
      const { initExpensesApp } = require('../public/js/expenses');
      initExpensesApp(document);

      document.getElementById('empty-add-expense-btn').click();
      expect(document.getElementById('create-modal-wrap').hidden).toBe(false);
    });
    ```
    This fails today because `#empty-add-expense-btn` does not exist.

assumptions_or_open_questions:
  - |
    Date format conflict between the approved prototype and already-shipped code, called out
    explicitly rather than silently picked: the prototype's own script formats dates as
    "Sep 18, 2026" via `toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })`
    (design lines 839-842), but the app's shipped, shared `formatDateDisplay` in
    `public/js/utils.js` (already used by both `expenses.js` and `hire-profile.js`) renders
    `MM/DD/YYYY` instead. This plan keeps the existing shared formatter as-is rather than
    reformatting to match the prototype's date string, because (a) AC1 only requires a "date"
    column to be present, not a specific format, and (b) changing the shared utility would also
    change `hire-profile.js`'s rendering, which is outside this story. Flagging in case the
    reviewer wants the prototype's exact date string instead — that would need a small
    expenses-only date formatter rather than a change to the shared `utils.js` function.
  - |
    AC1 says the table has "date, category, description, and amount columns" — it does not
    mention the existing "Actions" (Edit) column already shipped by prior stories
    (TEST-M1-STORY-032/091). Assuming that extra column is fine to keep as-is since AC1 doesn't
    forbid additional columns and the prototype's own "Populated List"/"Empty State" screens are
    static reference frames without an edit affordance at all (edit wasn't in this story's scope
    when the design was authored) — not a signal to remove the already-shipped Edit column.
  - |
    Assuming the native `hidden` attribute (already the pattern used for this app's modals and
    toasts) is the right mechanism for toggling `#expense-table-wrap` / `#expense-empty-state`,
    rather than inline `style.display` (used only in the prototype's own "Live Demo" screen
    script, which is throwaway demo wiring, not part of the reusable component patterns).
  - |
    `INITIAL_EXPENSES` remains exported from `public/js/expenses.js` after this change, now purely
    as a fixture constant for tests to seed explicitly (see `test/expenses.test.js` update above)
    — no production code path writes it to `localStorage` anymore.

package_dependencies: []

notes: |
  Read `.arc/designs/TEST-M1-STORY-090-design.html` in full before writing this plan. Its three
  screens map directly to the three ACs: "Populated List" (static reference for AC1, four fixture
  rows), "Empty State" (static reference for AC2, the exact card/icon/heading/body/button this
  plan copies into `public/index.html`), and "Live Demo" (the only screen actually wired to real
  `localStorage`, demonstrating that a genuinely empty store — not an auto-seeded one — is the
  expected first-run state, and that both "+ Add expense" and "+ Add your first expense" open the
  identical create-expense modal for AC3).

  This story's title and description are effectively a redo of the already-merged
  TEST-M1-STORY-030 ("Expense List View with Empty State", commit 6260e13) under a fresh design
  iteration (this branch's own commit 9cbb51f). The shipped code from that story — and from the
  later TEST-M1-STORY-091/032 work — left `public/js/expenses.js` auto-seeding fixture data and
  using a single in-table `.empty-row` message instead of a guided empty state, which is exactly
  what this plan corrects.

  ```mermaid
  flowchart TD
    HTML["public/index.html"] -->|"parsed DOM: #expense-table-wrap, #expense-empty-state, #empty-add-expense-btn"| JS["public/js/expenses.js initExpensesApp/renderList"]
    CSS["public/css/expenses.css"] -->|".empty-state* rules"| HTML
    JS -->|"loadExpenses / persistExpenses"| LS[("localStorage")]
    JS -->|"openCreateModal (existing, TEST-M1-STORY-091)"| MODAL["#create-modal-wrap in public/index.html"]
    T1["test/expenses-list-empty-state.test.js (new)"] -->|"initExpensesApp(document)"| JS
    T2["test/expenses.test.js (seeding updated)"] -->|"initExpensesApp(document)"| JS

    classDef touched fill:#f96,color:#000
    class HTML,JS,CSS,T1,T2 touched
  ```
  `MODAL` and `LS` are shown for context (already-existing, untouched) to make clear this story
  reuses the create modal rather than building a new one, and continues using the same
  `localStorage` key/shape as every other expense story.
