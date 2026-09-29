summary: |
  This repo is **not** greenfield for TEST-M1-STORY-140. `public/index.html`,
  `public/js/expenses.js`, `public/css/expenses.css`, and `test/expenses-create.test.js`
  already implement a fully working "create expense via modal" flow — a "+ Add expense"
  button, a modal with Amount/Date/Category/Description, per-field inline validation, a
  success/error toast, and `localStorage` persistence — that already satisfies AC1
  (missing fields flagged), AC2 (nothing saved on an invalid submit), and AC3 (a valid
  submit saves the expense), all covered by existing passing tests. What is genuinely
  missing is AC4: there is no concept anywhere in the app of *who* logged an expense, no
  "Logged by" column, and nothing proving that switching which staff member is acting
  never hides a previously logged row (shared visibility, no per-submitter scoping).
  Reading the approved `TEST-M1-STORY-140-design.html` prototype confirms this: its one
  interactive screen ("Expense List") adds a "Signed in as" viewer switcher (top bar) and
  a "Logged by" table column on top of essentially the same create-flow the repo already
  ships, plus a `.shared-visibility-hint` paragraph stating the AC4 guarantee in plain
  language, plus renamed copy ("Log an expense" / "Log expense" / "Expense logged" instead
  of "Create expense" / "Save expense" / "Expense added"). The design also swaps the
  existing modal's Date/Category field order to Amount → Category → Date → Description.
  This plan therefore (1) layers the AC4 attribution/visibility UI onto the existing,
  working create flow rather than building a new one, (2) reconciles the handful of
  copy/order drifts between the shipped modal and the newly-approved design, and (3) adds
  the missing AC4-mapped tests plus a couple of design-copy-fidelity tests, leaving the
  unrelated Edit Expense modal (TEST-M1-STORY-092, untouched by this design) and the
  backend `/employees` API (explicitly out of scope per the parent epic's "decoupled from
  guest and employee records" language) alone.
scope:
  - description: |
      In `public/index.html`, on the Expenses page:
      1. Add a "Signed in as" viewer switcher to `.app-topbar`, matching the design's
         markup (design lines 605-612):
         ```html
         <div class="viewer-switcher">
           <label for="viewer-select">Signed in as</label>
           <select class="input" id="viewer-select">
             <option>Morgan Ellis</option>
             <option>Priya Shah</option>
             <option>Devon Ruiz</option>
           </select>
         </div>
         ```
      2. Add the shared-visibility hint paragraph (design lines 625-628) directly above
         the `.card.table-card`:
         ```html
         <p class="shared-visibility-hint">
           <span class="hint-icon" aria-hidden="true">ℹ</span>
           <span>Every staff member sees this same list — logging an expense makes it
           visible to everyone, not just the person who submitted it.</span>
         </p>
         ```
      3. Rename the header button's visible label from "+ Add expense" to "+ Log expense"
         (design line 622) — keep its existing id `add-expense-btn`.
      4. Add a "Logged by" column to the table header, between Description and Amount
         (design line 638): `<th scope="col">Logged by</th>`.
      5. Update the create modal's title/subtitle/save-button copy to match the design
         exactly: title "Log an expense" (line 656), subtitle "Fill in every field below
         to add it to the shared expense list." (line 657), save button "Log expense"
         (line 707).
      6. Reorder the create modal's fields from the shipped Amount → Date → Category →
         Description to the design's Amount → Category → Date → Description (design lines
         671-703) — swap the existing `create-field-date` and `create-field-category`
         `.field` blocks.
      Kept every existing element id (`create-modal-*`, `create-field-*`, `create-error-*`,
      `add-expense-btn`) as-is rather than adopting the design's own unprefixed ids
      (`field-amount`, `modal-wrap`, `log-expense-btn`, ...) — see
      `assumptions_or_open_questions`.
    files:
      - public/index.html
    rationale: |
      These are the concrete, approved-design elements for the one AC (AC4) with no
      existing coverage, plus the copy/field-order drift between the shipped modal and
      the newly-approved design that the planning instructions require reconciling rather
      than silently ignoring.
  - description: |
      In `public/js/expenses.js`:
      1. Add a `loggedBy` value to each `INITIAL_EXPENSES` fixture (currently has none),
         so the new "Logged by" column doesn't render blank for the three pre-existing
         rows:
         ```js
         const INITIAL_EXPENSES = [
           { id: 'exp_001', date: '2026-09-02', category: 'Travel', description: 'Flight to Chicago client site', amount: 482.50, loggedBy: 'Morgan Ellis' },
           { id: 'exp_002', date: '2026-09-05', category: 'Meals', description: 'Team lunch — Q3 kickoff', amount: 96.18, loggedBy: 'Priya Shah' },
           { id: 'exp_003', date: '2026-09-10', category: 'Software', description: 'Figma seat renewal', amount: 15.00, loggedBy: 'Devon Ruiz' },
         ];
         ```
      2. Capture `const viewerSelect = doc.getElementById('viewer-select');` alongside
         the other field lookups, and set `loggedBy: viewerSelect.value` on the object
         built in the create-form submit handler (mirrors the design's own
         `loggedBy: viewerSelect.value`, design line 1056).
      3. In `renderList`, render a `.logged-by-cell` per row using `exp.loggedBy`,
         between the description cell and the amount cell:
         ```js
         <td class="logged-by-cell">${escapeHtml(doc, exp.loggedBy)}</td>
         ```
      4. Update the create flow's copy strings to match the design: the idle/loading
         save-button text ('Save expense'/'Saving…' → 'Log expense'/'Logging…', in both
         `closeCreateModal`'s reset and the submit handler), the success toast ('Expense
         added' → 'Expense logged'), and the error toast ("Couldn't save expense —
         please try again" → "Couldn't log expense — please try again").
      Deliberately do **not** attach a `change` (or any other) event listener to
      `viewerSelect` that re-renders or filters `expenses` — `renderList`/
      `applyFiltersAndRender` must keep rendering the one shared `expenses` array
      regardless of which name is selected, which is what makes AC4 ("no per-submitter
      scoping") true rather than merely displayed.
    files:
      - public/js/expenses.js
    rationale: |
      This is the minimal logic change that attributes new expenses to the acting viewer
      and renders that attribution, without introducing any filtering by viewer — the
      absence of such filtering is the actual behavior AC4 requires.
  - description: |
      In `public/css/expenses.css`, add the three new component/utility rules the above
      markup needs, copied verbatim (same declarations, same tokens) from the approved
      design's inline `<style>` block:
      - `.viewer-switcher`, `.viewer-switcher label`, `.viewer-switcher select` (design
        lines 363-376)
      - `.shared-visibility-hint`, `.shared-visibility-hint .hint-icon` (design lines
        423-432)
      - `.logged-by-cell` (design line 412): `color: var(--color-fg-muted); white-space: nowrap;`
    files:
      - public/css/expenses.css
    rationale: |
      `public/css/expenses.css` already holds every other page-specific rule for this
      page (`.filter-bar`, `.no-match`, `.desc-cell`, etc.) per its own comment
      distinguishing it from the shared `design-system/prototype-utils.css`; these three
      new classes belong there for the same reason.
  - description: |
      In `test/expenses-create.test.js`:
      1. Update the two existing assertions whose expected copy changes: the success-toast
         test now expects `'Expense logged'` instead of `'Expense added'`, and the
         localStorage-failure test's regex now expects `/couldn.?t log/i` instead of
         `/couldn.?t save/i`.
      2. Add the new tests listed in the `tests` field below (design-copy fidelity for
         AC3's modal, plus all of AC4).
    files:
      - test/expenses-create.test.js
    rationale: |
      Locks in the reconciled copy and adds the previously-nonexistent AC4 coverage,
      following the same file/`beforeEach` structure already established for this
      feature's tests.
tests:
  - |
    AC1 (each missing required field flagged) — already covered, no new test needed:
    ```js
    test('submitting with every field empty shows an inline error under every field', () => {
      document.getElementById('add-expense-btn').click();
      document.getElementById('create-form').dispatchEvent(new Event('submit', { cancelable: true }));
      expect(document.getElementById('create-error-amount').hidden).toBe(false);
      expect(document.getElementById('create-error-date').hidden).toBe(false);
      expect(document.getElementById('create-error-category').hidden).toBe(false);
      expect(document.getElementById('create-error-description').hidden).toBe(false);
    });
    ```
    (existing, `test/expenses-create.test.js:63`)
  - |
    AC2 (expense not saved on an invalid submit) — already covered, no new test needed:
    ```js
    test('submitting with invalid fields adds nothing to the table and keeps the modal open', () => {
      const before = document.querySelectorAll('#expense-tbody tr').length;
      document.getElementById('add-expense-btn').click();
      document.getElementById('create-form').dispatchEvent(new Event('submit', { cancelable: true }));
      expect(document.querySelectorAll('#expense-tbody tr').length).toBe(before);
      expect(document.getElementById('create-modal-wrap').hidden).toBe(false);
    });
    ```
    (existing, `test/expenses-create.test.js:72` — already asserts the modal stays open
    and the table is unchanged)
  - |
    AC3 (valid submit saves the expense) — persistence itself already covered
    (`test/expenses-create.test.js:30`, `:138`); new tests needed only for the
    design-copy fidelity of the modal that AC3's flow now presents, expected to fail
    until the `public/index.html` copy changes above land:
    ```js
    test('the modal title, subtitle, and save button copy match the approved design', () => {
      document.getElementById('add-expense-btn').click();
      expect(document.getElementById('create-modal-title').textContent).toBe('Log an expense');
      expect(document.querySelector('#create-modal-wrap .modal-header p').textContent)
        .toBe('Fill in every field below to add it to the shared expense list.');
      expect(document.getElementById('create-modal-save-btn').textContent).toBe('Log expense');
    });
    ```
    ```js
    test('while saving, the button shows "Logging…" per the approved design', () => {
      document.getElementById('add-expense-btn').click();
      document.getElementById('create-field-amount').value = '24.50';
      document.getElementById('create-field-date').value = '2026-09-20';
      document.getElementById('create-field-category').value = 'Travel';
      document.getElementById('create-field-description').value = 'Taxi to airport';
      document.getElementById('create-form').dispatchEvent(new Event('submit', { cancelable: true }));
      expect(document.getElementById('create-modal-save-btn').textContent).toBe('Logging…');
    });
    ```
  - |
    AC4 (saved expense is visible to any staff member — shared visibility, no
    per-submitter scoping) — entirely new, expected to fail until the `loggedBy`
    plumbing and viewer switcher above are added:
    ```js
    test('a newly logged expense is attributed to whoever is currently signed in', () => {
      document.getElementById('viewer-select').value = 'Priya Shah';
      document.getElementById('add-expense-btn').click();
      document.getElementById('create-field-amount').value = '24.50';
      document.getElementById('create-field-date').value = '2026-09-20';
      document.getElementById('create-field-category').value = 'Travel';
      document.getElementById('create-field-description').value = 'Taxi to airport';
      document.getElementById('create-form').dispatchEvent(new Event('submit', { cancelable: true }));
      jest.advanceTimersByTime(350);
      const firstRow = document.querySelector('#expense-tbody tr');
      expect(firstRow.querySelector('.logged-by-cell').textContent).toBe('Priya Shah');
    });
    ```
    ```js
    test('switching who is signed in after logging an expense does not hide it', () => {
      document.getElementById('viewer-select').value = 'Morgan Ellis';
      document.getElementById('add-expense-btn').click();
      document.getElementById('create-field-amount').value = '24.50';
      document.getElementById('create-field-date').value = '2026-09-20';
      document.getElementById('create-field-category').value = 'Travel';
      document.getElementById('create-field-description').value = 'Taxi to airport';
      document.getElementById('create-form').dispatchEvent(new Event('submit', { cancelable: true }));
      jest.advanceTimersByTime(350);

      document.getElementById('viewer-select').value = 'Devon Ruiz';
      document.getElementById('viewer-select').dispatchEvent(new Event('change'));

      const rows = Array.from(document.querySelectorAll('#expense-tbody tr'));
      expect(rows.some((r) => r.querySelector('.desc-cell').textContent === 'Taxi to airport')).toBe(true);
    });
    ```
    ```js
    test('the viewer switcher lists the three staff members from the approved design', () => {
      const options = Array.from(document.querySelectorAll('#viewer-select option')).map((o) => o.textContent);
      expect(options).toEqual(['Morgan Ellis', 'Priya Shah', 'Devon Ruiz']);
    });
    ```
    ```js
    test('the expense list page states that logging an expense is visible to every staff member', () => {
      expect(document.querySelector('.shared-visibility-hint').textContent).toMatch(/visible to everyone/i);
    });
    ```
assumptions_or_open_questions:
  - |
    The repo is not greenfield for this feature: `public/index.html`,
    `public/js/expenses.js`, `public/css/expenses.css`, and `test/expenses-create.test.js`
    already implement a working create-expense flow that independently satisfies AC1-AC3.
    This plan treats that as the real baseline and layers AC4 plus design-copy fidelity on
    top of it, mirroring the precedent set for the sibling edit-expense story in
    `.arc/plans/run_36f3e53ee22b/plan.md`.
  - |
    Kept the create modal's existing `create-*`-prefixed element ids instead of adopting
    the design's own unprefixed ids (`field-amount`, `modal-wrap`, `log-expense-btn`,
    etc.), because those unprefixed ids are already occupied by the pre-existing,
    out-of-scope Edit Expense modal (`TEST-M1-STORY-092`) in the same
    `public/index.html`. Only the design's user-visible copy, labels, field order, and new
    elements (viewer switcher, "Logged by" column, hint paragraph) were taken from it —
    its internal id scheme was not, since the design's own single-screen demo never had to
    coexist with a second modal.
  - |
    The design's "Signed in as" viewer switcher lists three hardcoded names (Morgan Ellis /
    Priya Shah / Devon Ruiz) with no backing user/session system anywhere in the demo.
    There is no auth/session concept anywhere in `src/`, and the parent epic explicitly
    says this feature is "decoupled from guest and employee records" — so this plan
    hardcodes the same three names in `public/index.html` rather than wiring the switcher
    to the real `/employees` backend API (`src/employees/routes.js`), which would be new,
    unrequested scope.
  - |
    Treated the design's "Simulate save failure" checkbox, "Reset demo data" button, the
    "← Prev/Next →" reviewer bar, and the "Reference States" screen as reviewer/demo-only
    affordances excluded from the shipped page — consistent with the identical exclusions
    already made for the sibling 092 design in `.arc/plans/run_36f3e53ee22b/plan.md`.
  - |
    Left the existing, stricter `validateAmount` messaging in `public/js/expenses.js`
    (e.g. its decimal-place-specific error) as-is rather than simplifying it to match the
    design's plainer regex — no AC dictates exact wording beyond "flagged with a visible
    error," and the existing behavior is a strict superset, not a contradiction, of the
    design.
  - |
    Assumed the three pre-existing fixture rows (`exp_001`-`exp_003`) needed a `loggedBy`
    value added retroactively so the new "Logged by" column doesn't render blank for them;
    picked the same three names, in the same distribution, that the design's own fixture
    data uses.
package_dependencies: []
notes: |
  All of this feature's logic already lives client-side in `public/js/expenses.js`,
  persisted to `localStorage`, served as a static file by the already-wired
  `express.static(path.join(__dirname, '..', 'public'))` in `src/server.js` — no new
  backend route or persistence layer is needed, matching the architecture of every sibling
  expense story (create/edit/filter) already in this repo.

  ```mermaid
  flowchart TD
    HTML[public/index.html<br/>viewer switcher, shared-visibility hint,<br/>Logged by column, updated copy/order]
    JS[public/js/expenses.js<br/>initExpensesApp / renderList /<br/>create-form submit handler]
    CSS[public/css/expenses.css<br/>.viewer-switcher .shared-visibility-hint .logged-by-cell]
    UTILS[public/js/utils.js<br/>escapeHtml, formatDateDisplay]
    LS[(localStorage)]
    TEST[test/expenses-create.test.js<br/>AC1-4 assertions]

    HTML -- "DOM ids read by" --> JS
    CSS -. "styles" .-> HTML
    JS -- "escapeHtml/formatDateDisplay" --> UTILS
    JS -- "loadExpenses/persistExpenses" --> LS
    TEST -- "drives via jsdom" --> HTML
    TEST -- "require()" --> JS

    classDef touched fill:#f96,color:#000
    class HTML,JS,CSS,TEST touched
  ```
review_focus: |
  In scope: layering AC4 (a "Logged by" attribution + "Signed in as" viewer switcher +
  shared-visibility hint) onto the already-working create-expense flow, and reconciling
  that flow's copy/field-order with the newly-approved design. Out of scope: the unrelated
  Edit Expense modal, the `/employees` backend, and any real authentication — the viewer
  switcher is a decoupled, hardcoded 3-name list by design. The riskiest area is
  `viewerSelect` in `public/js/expenses.js`: it must be read only at submit time and never
  drive a re-render or filter, since a `change`-triggered re-render would silently violate
  AC4's "no per-submitter scoping" while looking correct in casual manual testing. Also
  note the deliberate choice to keep the shipped modal's `create-*`-prefixed element ids
  rather than the design's raw ids — that's to avoid an id collision with the pre-existing
  Edit Expense modal, not a missed detail.
