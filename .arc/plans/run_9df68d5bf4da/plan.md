summary: |
  Add a "Create Expense" flow to the live expense tracker page (public/index.html +
  public/js/expenses.js), matching the approved prototype at
  .arc/designs/TEST-M1-STORY-091-design.html. A new "+ Add expense" button in the page
  header opens a second modal that follows the exact same markup/behavior pattern as the
  existing edit modal (its own overlay/wrap/panel, its own field ids so it can coexist in
  the DOM with the edit modal without collisions), starts fully empty, validates amount
  (required, numeric, at most 2 decimal places), date, category, and description on
  submit, and on success inserts the new expense at the top of the table with a brief
  highlight flash and a success toast, matching how the edit modal already reports
  success. A storage failure during save shows an error toast and leaves the modal open
  with every typed value intact. The work is test-first: one failing jsdom test per
  acceptance criterion is added in test/expenses-create.test.js (mirroring the existing
  test/expenses.test.js pattern for the edit modal), then the minimal markup/JS/CSS is
  added to make each pass.
scope:
  - description: |
      Add the "+ Add expense" trigger and a second, fully-empty create modal to
      public/index.html, reusing the edit modal's existing CSS classes
      (`.modal-overlay`/`.modal-wrap`/`.modal-panel`/`.modal-header`/`.icon-btn`/`.field`/
      `.field-error`/`.amount-input-wrap`/`.amount-prefix`/`.amount-input`/
      `.modal-actions`) but with its own element ids so both modals can exist in the same
      document without id collisions:
      `create-modal-overlay`, `create-modal-wrap`, `create-modal-title`,
      `create-modal-close-btn`, `create-form`, `create-field-amount` /
      `create-error-amount` / `create-amount-hint`, `create-field-date` /
      `create-error-date`, `create-field-category` / `create-error-category`,
      `create-field-description` / `create-error-description`, `create-modal-cancel-btn`,
      `create-modal-save-btn`. The page header becomes a flex row (h1+p on the left, the
      new `#add-expense-btn` button on the right) per the design's "Expense List" screen.
      The amount field is `type="text" inputmode="decimal"` (not `type="number"` like the
      edit modal), matching the design exactly, because AC4's "more than two decimal
      places" rule needs to inspect the raw typed string rather than rely on a native
      number input's normalization. The shared toast markup gains a `<span id="toast-icon">`
      so the same toast element can show either the existing ✓ or a new ⚠ for the error
      case, matching the design's toast markup on both its screens.
    files:
      - public/index.html
    rationale: |
      AC1 requires an "Add Expense" control that opens an empty create modal; the
      approved design (screen "Expense List") shows this as a `#add-expense-btn` button
      in the page header row, explicitly annotated in the prototype as "the control named
      in AC1" even though it sits in `.page-header` rather than the `.app-topbar` nav
      strip — this plan follows that placement (see
      assumptions_or_open_questions). Reusing the edit modal's CSS classes rather than
      inventing new ones satisfies the story description's "reuse the existing edit-modal
      pattern," while separate ids keep this change additive and risk-free to the
      existing, already-tested edit modal in the same page.
  - description: |
      Extend `initExpensesApp` in public/js/expenses.js with the create-modal
      open/close/cancel/submit wiring, mirroring the existing `openEditModal` /
      `closeModal` / `cancelEdit` functions one-for-one as `openCreateModal` /
      `closeCreateModal` / `cancelCreate`. Add two new exported pure functions:

      ```js
      function validateAmount(raw) {
        const trimmed = (raw || '').trim();
        if (trimmed === '') return 'Amount is required.';
        if (!/^\d+(\.\d+)?$/.test(trimmed)) return 'Enter a valid amount, e.g. 24.50.';
        const decimalMatch = trimmed.match(/\.(\d+)$/);
        if (decimalMatch && decimalMatch[1].length > 2) {
          return 'Amount can have at most 2 decimal places.';
        }
        if (parseFloat(trimmed) <= 0) return 'Enter an amount greater than $0.00.';
        return '';
      }

      function validateCreateExpenseFields({ amount, date, category, description }) {
        return {
          amount: validateAmount(amount) || null,
          date: date === '' ? 'Date is required.' : null,
          category: category === '' ? 'Category is required.' : null,
          description: (description || '').trim() === '' ? 'Description is required.' : null,
        };
      }
      ```

      (`validateAmount` is copied verbatim from the approved prototype's own script block,
      which already encodes the AC4 decimal-place rule distinctly from the generic
      "required" message.) Extend the existing `setFieldError(fieldEl, errorEl, hasError)`
      to accept an optional 4th `message` argument — `setFieldError(fieldEl, errorEl,
      hasError, message)` — that overwrites `errorEl.textContent` when both `hasError` and
      `message` are truthy; existing edit-modal call sites are unchanged (they omit the
      4th argument, so they keep their static HTML error text) and only the new
      create-modal call sites pass a message, since AC4/AC5 need different text per field
      per failure reason. Change `showToast(message)` to `showToast(kind, message)`,
      writing `kind === 'error' ? '⚠' : '✓'` into the new `#toast-icon` span; update the 3
      existing call sites (`cancelEdit`, the edit success path, the edit failure path) to
      pass `'success'`/`'success'`/`'error'` respectively so existing behavior/text is
      unchanged. On successful create, insert the new expense at the front of `expenses`
      (new rows appear at the top, per the design) and track it with a new `lastAddedId`
      variable (parallel to the existing `lastUpdatedId`) so `renderList` can apply a
      `row-added` flash class to it, mirroring how `row-updated` already works for edits.
    files:
      - public/js/expenses.js
    rationale: |
      This is the actual behavior for AC1-AC9: empty-on-open, per-field validation with
      AC4's decimal-place-specific message, blocking save + leaving the table/modal
      untouched on any invalid field (AC5/AC6), inserting into the table and toasting on
      success (AC2/AC3), toasting an error and preserving typed values on a storage
      failure (AC7/AC8), and discarding on cancel/close (AC9). Sharing the existing
      `expenses` array, `renderList`, `persistExpenses`, and `showToast` (rather than a
      parallel copy of the whole module) keeps a single source of truth for the list and
      matches "reuse the existing edit-modal pattern" from the story description.
  - description: |
      Add the page-specific CSS needed by the markup above, promoted from the same rules
      already used in the approved prototype's own `<style>` block (which itself notes
      they are "page-specific: not yet promoted to prototype-utils.css", the same pattern
      already used for `.amount-input-wrap`/`.field-error` etc. in this file today):
      a `.page-header-row` flex rule for the header+button layout, a `.hint` rule for the
      amount field's "USD, up to two decimal places" caption, a `.row-added` flash
      keyframe (with a `prefers-reduced-motion: reduce` override, matching the existing
      `.row-updated`/`flash-update` pair immediately above it in this file), and a
      `.toast .toast-icon { flex: 0 0 auto; }` rule for the new icon span.
    files:
      - public/css/expenses.css
    rationale: |
      Keeps the new visual pattern token-driven and consistent with the rest of this file
      (no hardcoded colors/spacing), and keeps motion respectful of
      `prefers-reduced-motion` per UI guideline §10, exactly as the existing
      `row-updated` flash already does.
  - description: |
      New test file, one `describe` block per the existing `test/expenses.test.js`
      pattern (same jsdom fixture load + `initExpensesApp(document)` setup), with one
      failing-first test per acceptance criterion (see `tests` below for the concrete
      assertions), plus 2 focused unit tests for the new `validateAmount` pure function.
    files:
      - test/expenses-create.test.js
    rationale: |
      Matches this repo's existing test organization (one test file per user-facing flow,
      pure-function unit tests alongside the DOM-level tests in the same file) and keeps
      this story's new tests reviewable as a single, self-contained diff distinct from the
      pre-existing edit-modal suite.
tests:
  - |
    AC1 — opening the modal shows every field empty:
    test('clicking Add expense opens the create modal with every field empty', () => {
      document.getElementById('add-expense-btn').click();
      expect(document.getElementById('create-modal-wrap').hidden).toBe(false);
      expect(document.getElementById('create-field-amount').value).toBe('');
      expect(document.getElementById('create-field-date').value).toBe('');
      expect(document.getElementById('create-field-category').value).toBe('');
      expect(document.getElementById('create-field-description').value).toBe('');
    });
  - |
    AC2 — a valid submit adds the expense to the table immediately:
    test('submitting a valid expense adds it to the top of the table immediately', () => {
      document.getElementById('add-expense-btn').click();
      document.getElementById('create-field-amount').value = '24.50';
      document.getElementById('create-field-date').value = '2026-09-20';
      document.getElementById('create-field-category').value = 'Travel';
      document.getElementById('create-field-description').value = 'Taxi to airport';
      document.getElementById('create-form').dispatchEvent(new Event('submit', { cancelable: true }));
      jest.advanceTimersByTime(350);
      const firstRow = document.querySelector('#expense-tbody tr');
      expect(firstRow.querySelector('.desc-cell').textContent).toBe('Taxi to airport');
      expect(firstRow.querySelector('.col-amount').textContent).toBe('$24.50');
    });
  - |
    AC3 — a valid submit shows a success toast:
    test('a valid submit shows a success toast', () => {
      document.getElementById('add-expense-btn').click();
      document.getElementById('create-field-amount').value = '24.50';
      document.getElementById('create-field-date').value = '2026-09-20';
      document.getElementById('create-field-category').value = 'Travel';
      document.getElementById('create-field-description').value = 'Taxi to airport';
      document.getElementById('create-form').dispatchEvent(new Event('submit', { cancelable: true }));
      jest.advanceTimersByTime(350);
      expect(document.getElementById('toast').hidden).toBe(false);
      expect(document.getElementById('toast-message').textContent).toBe('Expense added');
    });
  - |
    AC4 — more than two decimal places shows a decimal-place-specific inline error,
    distinct from the generic "required" message:
    test('an amount with more than two decimal places shows a decimal-place-specific error', () => {
      document.getElementById('add-expense-btn').click();
      document.getElementById('create-field-amount').value = '12.345';
      document.getElementById('create-form').dispatchEvent(new Event('submit', { cancelable: true }));
      expect(document.getElementById('create-error-amount').hidden).toBe(false);
      expect(document.getElementById('create-error-amount').textContent).toMatch(/at most 2 decimal places/i);
    });
  - |
    AC5 — submitting with every field empty shows an inline error under each field:
    test('submitting with every field empty shows an inline error under every field', () => {
      document.getElementById('add-expense-btn').click();
      document.getElementById('create-form').dispatchEvent(new Event('submit', { cancelable: true }));
      expect(document.getElementById('create-error-amount').hidden).toBe(false);
      expect(document.getElementById('create-error-date').hidden).toBe(false);
      expect(document.getElementById('create-error-category').hidden).toBe(false);
      expect(document.getElementById('create-error-description').hidden).toBe(false);
    });
  - |
    AC6 — the same invalid submit does not add a row and keeps the modal open:
    test('submitting with invalid fields adds nothing to the table and keeps the modal open', () => {
      const before = document.querySelectorAll('#expense-tbody tr').length;
      document.getElementById('add-expense-btn').click();
      document.getElementById('create-form').dispatchEvent(new Event('submit', { cancelable: true }));
      expect(document.querySelectorAll('#expense-tbody tr').length).toBe(before);
      expect(document.getElementById('create-modal-wrap').hidden).toBe(false);
    });
  - |
    AC7 — a localStorage failure on a valid submit shows an error toast:
    test('a localStorage failure on submit shows an error toast', () => {
      document.getElementById('add-expense-btn').click();
      document.getElementById('create-field-amount').value = '24.50';
      document.getElementById('create-field-date').value = '2026-09-20';
      document.getElementById('create-field-category').value = 'Travel';
      document.getElementById('create-field-description').value = 'Taxi to airport';
      const setItemSpy = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('QuotaExceededError');
      });
      document.getElementById('create-form').dispatchEvent(new Event('submit', { cancelable: true }));
      jest.advanceTimersByTime(350);
      expect(document.getElementById('toast-message').textContent).toMatch(/couldn.?t save/i);
      setItemSpy.mockRestore();
    });
  - |
    AC8 — the same failure leaves the modal open with every entered value intact:
    test('a localStorage failure keeps the modal open with entered values intact', () => {
      document.getElementById('add-expense-btn').click();
      document.getElementById('create-field-amount').value = '24.50';
      document.getElementById('create-field-date').value = '2026-09-20';
      document.getElementById('create-field-category').value = 'Travel';
      document.getElementById('create-field-description').value = 'Taxi to airport';
      const setItemSpy = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('QuotaExceededError');
      });
      document.getElementById('create-form').dispatchEvent(new Event('submit', { cancelable: true }));
      jest.advanceTimersByTime(350);
      expect(document.getElementById('create-modal-wrap').hidden).toBe(false);
      expect(document.getElementById('create-field-amount').value).toBe('24.50');
      expect(document.getElementById('create-field-description').value).toBe('Taxi to airport');
      setItemSpy.mockRestore();
    });
  - |
    AC9 — cancelling or closing the modal adds nothing to the table:
    test('cancelling the create modal adds nothing to the table', () => {
      const before = document.querySelectorAll('#expense-tbody tr').length;
      document.getElementById('add-expense-btn').click();
      document.getElementById('create-field-amount').value = '99.99';
      document.getElementById('create-modal-cancel-btn').click();
      expect(document.querySelectorAll('#expense-tbody tr').length).toBe(before);
      expect(document.getElementById('create-modal-wrap').hidden).toBe(true);
    });
  - |
    AC10 — a newly created expense is still present after reload (verified by re-reading
    localStorage directly, the same technique test/expenses.test.js already uses for the
    edit flow rather than a real page reload):
    test('a newly created expense is still present in localStorage after the save completes', () => {
      document.getElementById('add-expense-btn').click();
      document.getElementById('create-field-amount').value = '24.50';
      document.getElementById('create-field-date').value = '2026-09-20';
      document.getElementById('create-field-category').value = 'Travel';
      document.getElementById('create-field-description').value = 'Taxi to airport';
      document.getElementById('create-form').dispatchEvent(new Event('submit', { cancelable: true }));
      jest.advanceTimersByTime(350);
      const stored = JSON.parse(localStorage.getItem('expenses'));
      expect(stored.some((e) => e.description === 'Taxi to airport')).toBe(true);
    });
  - |
    Supporting unit tests for the new pure validator (not tied to a single AC, but back
    AC4/AC5's messages):
    test('validateAmount flags more than two decimal places distinctly from "required"', () => {
      const { validateAmount } = require('../public/js/expenses');
      expect(validateAmount('')).toMatch(/required/i);
      expect(validateAmount('12.345')).toMatch(/at most 2 decimal places/i);
      expect(validateAmount('12.34')).toBe('');
    });
assumptions_or_open_questions:
  - |
    AC1 says the button is "in the top bar", but the approved design places
    `#add-expense-btn` inside `.page-header` (next to the h1/p), not inside the
    `.app-topbar` nav strip that holds the brand and Expenses/Employees links — the
    design's own annotation explicitly calls this button "the control named in AC1"
    despite that placement. This plan follows the design's actual placement rather than
    the literal "top bar" wording, since the design is the approved source of truth and
    the annotation resolves the ambiguity in its favor.
  - |
    The prototype's "Simulate storage failure" checkbox and "Reset demo data" button are
    explicitly marked in the prototype itself as demo-only reviewer affordances, not part
    of the product. This plan omits both from production markup; AC7/AC8 are verified in
    tests via `jest.spyOn(Storage.prototype, 'setItem')`, the same technique
    test/expenses.test.js already uses for the edit modal's equivalent failure case.
  - |
    Found an orphaned, unwired duplicate of an "Add Expense" flow: public/app.js,
    public/validation.js, public/storage.js, public/currency.js, and their tests
    (test/app.test.js, test/validation.test.js, test/storage.test.js,
    test/currency.test.js) implement a different modal against a `#root` div that
    public/index.html no longer contains — index.html carries its own
    "TODO(rebase): uncertain merge" comment confirming this wiring is stale from an
    earlier/abandoned pass and is not loaded by the live page (only
    `./js/expenses.js` is). This plan builds on the live, wired implementation
    (public/js/expenses.js) per that comment, and does not touch or remove the orphaned
    files/tests since deleting them is not requested by this story's acceptance criteria.
  - |
    New expense ids use an incrementing `exp_NNN` counter seeded from the current list
    length, copied from the approved prototype's own id-generation logic. This is
    sufficient while only create+edit exist; it will need revisiting once a future delete
    story can make the list length non-monotonic with respect to ids already issued.
  - |
    The category list (Travel, Meals, Software, Office Supplies, Other) is reused as-is
    from the existing edit modal's `<select>`, since that is both what's already live in
    production and what the design's create-modal `<select>` shows verbatim — no new
    categories are introduced by this story.
package_dependencies: []
notes: |
  No new runtime or dev dependencies are needed — `jest` / `jest-environment-jsdom` are
  already devDependencies and the existing test/expenses.test.js already exercises this
  exact jsdom-fixture-plus-fake-timers pattern.

  ```mermaid
  flowchart TD
    HTML[public/index.html]
    JS[public/js/expenses.js]
    CSS[public/css/expenses.css]
    TEST[test/expenses-create.test.js]
    LS[(localStorage)]

    HTML -->|"script tag (defer)"| JS
    HTML -->|"link tag"| CSS
    JS -->|"persistExpenses / loadExpenses"| LS
    TEST -->|"loads fixture, calls initExpensesApp(document)"| HTML
    TEST -->|"requires validateAmount, initExpensesApp"| JS

    classDef touched fill:#f96,color:#000
    class HTML,JS,CSS,TEST touched
  ```

  Why this shape: `public/index.html` is the single live page (public/js/expenses.js is
  the only script tag it loads; public/app.js and its `storage.js`/`validation.js`/
  `currency.js` siblings are dead code per index.html's own TODO comment and are left
  untouched). `expenses.js` already owns both rendering (`renderList`) and persistence
  (`persistExpenses`/`loadExpenses`) for the edit flow; this story extends the same
  module with parallel create-modal functions rather than introducing a second module, so
  there is exactly one source of truth for the `expenses` array and one place that talks
  to `localStorage`.
