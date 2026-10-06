summary: |
  AC1–AC5 of "Log a new expense" are already implemented: `public/js/expenses.js` and
  `public/index.html` ship a working "+ Log expense" modal (create-field-amount/date/category/
  description, create-form, create-modal-save-btn) with its own test suite in
  `test/expenses-create.test.js`, built under the earlier TEST-M1-STORY-154 work. The current
  commit (`b254a9a TEST-M1-STORY-177: UX design iteration`) adds a freshly-approved prototype at
  `.arc/designs/TEST-M1-STORY-177-design.html` for this same flow, and comparing it line-by-line
  against the shipped code surfaces three real gaps, not a rebuild:
  (1) `validateAmount`'s format regex (`^\d+(\.\d+)?$`) rejects a leading `-`, so a negative
  amount like `-12.50` fails the *format* check and shows the generic "Enter a valid amount"
  message instead of the design's required "Amount must be greater than $0.00." (AC2) — the
  regex must accept an optional leading `-` and the sign/zero check must run before the
  decimal-place check, matching the design's own validation matrix;
  (2) the shipped create form requires Description and shows "Description is required." when
  it's blank, but the design's own authoring note states plainly that Description has no
  required-field validation, and AC4 names only Category and Date as blocking-when-empty — so
  Description must become truly optional (no validation, no inline error element, no error id),
  with its label updated to "Description (optional)" to match the edit form's existing pattern
  and the design's label;
  (3) two copy strings drift from the approved text: the create-modal subtitle
  ("Fill in every field below..." → "Fill in the details below...") and the shared-visibility
  hint under the page header, which the design rewords to foreground AC5 ("a new expense is
  visible to everyone immediately"). This plan makes exactly those corrections test-first and
  leaves the rest of the already-working create flow (field order, amount `$` prefix, button
  labels, toast copy, localStorage persistence, immediate shared rendering) untouched.
scope:
  - description: |
      Fix `validateAmount` in `public/js/expenses.js` so the format regex accepts a leading
      `-`, the zero/negative check runs before the decimal-place check, and all three message
      strings match the approved design's validation matrix exactly.

      Before:
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
      ```

      After:
      ```js
      function validateAmount(raw) {
        const trimmed = (raw || '').trim();
        if (trimmed === '') return 'Amount is required.';
        if (!/^-?\d+(\.\d+)?$/.test(trimmed)) return 'Enter a valid number, e.g. 24.50.';
        if (parseFloat(trimmed) <= 0) return 'Amount must be greater than $0.00.';
        const decimalMatch = trimmed.match(/\.(\d+)$/);
        if (decimalMatch && decimalMatch[1].length > 2) {
          return 'Amount can have at most 2 decimal places, e.g. 24.50.';
        }
        return '';
      }
      ```
      This function is shared with the Edit modal's `validateExpenseFields`, so the edit flow
      picks up the same fix for free; no edit-specific code changes needed.
    files:
      - public/js/expenses.js
    rationale: |
      AC2 requires zero/negative amounts to be blocked with an inline error, and the approved
      design's "Amount validation matrix" reference screen states `-12.50` must show exactly
      "Amount must be greater than $0.00." — the current regex instead rejects it at the format
      stage with a generic message, which is observably different copy for the same blocked
      case.
  - description: |
      Make Description a true optional field on the create form: drop its required-ness from
      validation, remove its inline error paragraph and `aria-describedby` wiring, and update
      its label to say "(optional)".

      `validateCreateExpenseFields` before:
      ```js
      function validateCreateExpenseFields({ amount, date, category, description }) {
        return {
          amount: validateAmount(amount) || null,
          date: date === '' ? 'Date is required.' : null,
          category: category === '' ? 'Category is required.' : null,
          description: (description || '').trim() === '' ? 'Description is required.' : null,
        };
      }
      ```

      After:
      ```js
      function validateCreateExpenseFields({ amount, date, category }) {
        return {
          amount: validateAmount(amount) || null,
          date: date === '' ? 'Date is required.' : null,
          category: category === '' ? 'Category is required.' : null,
        };
      }
      ```
      In the `createForm` submit handler, drop `createErrorDescription`/`errors.description`
      from `clearAllCreateErrors`, the `setFieldError` calls, the `errors.amount || errors.date
      || errors.category` guard, and the `firstInvalid` fallback chain (last fallback becomes
      `createFieldCategory`, since there's no further field to fall back to).

      In `public/index.html`, remove
      `<p class="field-error" id="create-error-description" ...>` entirely, drop
      `aria-describedby="create-error-description"` from `#create-field-description`, and change
      the label to:
      ```html
      <label class="label" for="create-field-description">Description <span class="u-text-muted">(optional)</span></label>
      ```
    files:
      - public/js/expenses.js
      - public/index.html
    rationale: |
      The approved design's own authoring note says plainly: "Description has no
      required-field validation in this prototype — this story's acceptance criteria name only
      Category and Date as blocking-when-empty (AC4) ... Description is still captured and saved
      when filled in." AC4 itself names only "the category or date field" as blocking when
      empty. The shipped form over-validates relative to both the design and the AC text.
  - description: |
      Align two copy strings in `public/index.html` with the approved design text: the
      create-modal subtitle and the shared-visibility hint under the page header. Also remove
      the "USD, up to two decimal places" hint under Amount and its `create-amount-hint` id,
      since it does not appear in the approved design's Amount field.

      Subtitle, before → after:
      ```html
      <p>Fill in every field below to add it to the shared expense list.</p>
      <!-- becomes -->
      <p>Fill in the details below to add it to the shared expense list.</p>
      ```

      Shared-visibility hint, before → after:
      ```html
      Every staff member sees this same list — logging an expense makes it visible to everyone, not just the person who submitted it.
      <!-- becomes -->
      Every team member sees this same list — a new expense is visible to everyone immediately, not just the person who logged it.
      ```

      Amount field `aria-describedby` loses the `create-amount-hint` token (keeps
      `create-error-amount`), and the `<span class="hint" id="create-amount-hint">...</span>`
      element is deleted.
    files:
      - public/index.html
    rationale: |
      These two copy blocks are specific to the create-expense flow this story owns (the modal
      it opens, and the AC5 shared-visibility messaging), so they're brought in line with the
      approved prototype. The page's `<h1>`/subtitle text above the table and the Edit/Filter
      UI are deliberately left alone — see assumptions below.
  - description: |
      Update `test/expenses-create.test.js` to encode the corrected behavior test-first: tighten
      the AC2 negative/zero assertions to the exact message, assert the AC3 message wording,
      replace the "every field empty" assertion to expect no `create-error-description` element
      at all, add a test proving a blank Description does not block submission and is saved as
      an empty string, add a label-text assertion for "(optional)", and update the modal-copy
      assertion to the new subtitle.
    files:
      - test/expenses-create.test.js
    rationale: |
      TDD: these assertions must be written and failing against the current implementation
      before the `public/js/expenses.js` and `public/index.html` changes above are made.
tests:
  - |
    AC2 (exact message, both zero and negative) — replace the existing loose
    `test.each(['0', '-12.50'])` assertion:
    ```js
    test.each(['0', '-12.50'])('AC2: validateAmount blocks %s with the exact greater-than message', (value) => {
      const { validateAmount } = require('../public/js/expenses');
      expect(validateAmount(value)).toBe('Amount must be greater than $0.00.');
    });
    ```
    Run first to confirm `-12.50` currently fails this assertion (it returns the generic
    "Enter a valid amount, e.g. 24.50." message today), then fix `validateAmount` to pass it.
  - |
    AC3 (exact decimal-place message, matching the design's validation matrix):
    ```js
    test('AC3: validateAmount flags more than two decimal places with the design copy', () => {
      const { validateAmount } = require('../public/js/expenses');
      expect(validateAmount('19.999')).toBe('Amount can have at most 2 decimal places, e.g. 24.50.');
    });
    ```
  - |
    AC4 (only Amount/Date/Category are blocking; no Description error element exists at all) —
    replace the existing "every field empty" test:
    ```js
    test('AC4: submitting with every required field empty shows inline errors for amount, date, and category only', () => {
      document.getElementById('add-expense-btn').click();
      document.getElementById('create-form').dispatchEvent(new Event('submit', { cancelable: true }));
      expect(document.getElementById('create-error-amount').hidden).toBe(false);
      expect(document.getElementById('create-error-date').hidden).toBe(false);
      expect(document.getElementById('create-error-category').hidden).toBe(false);
      expect(document.getElementById('create-error-description')).toBeNull();
    });
    ```
    Also add, to prove Description is genuinely optional rather than just unvalidated-but-still-
    required-looking:
    ```js
    test('AC4 boundary: a blank Description does not block submission and saves as empty', () => {
      document.getElementById('add-expense-btn').click();
      document.getElementById('create-field-amount').value = '24.50';
      document.getElementById('create-field-date').value = '2026-09-20';
      document.getElementById('create-field-category').value = 'Travel';
      document.getElementById('create-form').dispatchEvent(new Event('submit', { cancelable: true }));
      jest.advanceTimersByTime(350);
      expect(document.getElementById('create-modal-wrap').hidden).toBe(true);
      const stored = JSON.parse(localStorage.getItem('expenses'));
      expect(stored[0].description).toBe('');
    });
    ```
    and a label-copy check:
    ```js
    test('the Description field label indicates it is optional, matching the approved design intent', () => {
      document.getElementById('add-expense-btn').click();
      expect(document.querySelector('label[for="create-field-description"]').textContent.trim())
        .toBe('Description (optional)');
    });
    ```
  - |
    AC1 (full-record creation with exact submitted values, not just description/amount as the
    existing test checks):
    ```js
    test('AC1: a valid submit creates a record with exactly the submitted date, category, description, and amount', () => {
      document.getElementById('add-expense-btn').click();
      document.getElementById('create-field-amount').value = '24.50';
      document.getElementById('create-field-date').value = '2026-09-20';
      document.getElementById('create-field-category').value = 'Travel';
      document.getElementById('create-field-description').value = 'Taxi to airport';
      document.getElementById('create-form').dispatchEvent(new Event('submit', { cancelable: true }));
      jest.advanceTimersByTime(350);
      const stored = JSON.parse(localStorage.getItem('expenses'))[0];
      expect(stored).toMatchObject({
        date: '2026-09-20',
        category: 'Travel',
        description: 'Taxi to airport',
        amount: 24.5,
      });
    });
    ```
  - |
    AC5 (already covered by the existing test
    `'switching who is signed in after logging an expense does not hide it'` in
    `test/expenses-create.test.js` — keep as-is, no change needed) plus the updated modal-copy
    assertion:
    ```js
    test('the modal title, subtitle, and save button copy match the approved design', () => {
      document.getElementById('add-expense-btn').click();
      expect(document.getElementById('create-modal-title').textContent).toBe('Log an expense');
      expect(document.querySelector('#create-modal-wrap .modal-header p').textContent)
        .toBe('Fill in the details below to add it to the shared expense list.');
      expect(document.getElementById('create-modal-save-btn').textContent).toBe('Log expense');
    });
    ```
assumptions_or_open_questions:
  - |
    The approved design's "Expense List" screen is annotated as explicitly scoped to
    create-only — "there is no 'Edit' action on any row and no filter/search control anywhere
    on this screen — both are explicitly out of scope per the work item." The real shipped page
    (`public/index.html`) already has both, from the separate, already-merged
    TEST-M1-STORY-154 (edit) and a filter story. This plan treats the design screen as an
    isolated mockup of just this story's slice, not an instruction to remove already-shipped,
    separately-scoped functionality, and does not touch the Edit column or filter bar. Flagging
    this per instructions since the design and the live page visibly diverge here.
  - |
    Because of the above, this plan does NOT change the page-level `<h1>`/subtitle text
    ("Review and correct submitted expense records, or add a new one.") to the design's
    narrower copy ("Log a new expense so it's captured and visible to the whole team right
    away.") — the shipped subtitle correctly describes a page that also supports edit and
    filtering, which the isolated design mockup doesn't show. Only copy that belongs
    specifically to this story's create flow (modal subtitle, shared-visibility hint) is
    updated to match the design.
  - |
    Assumed the "Simulate save failure" checkbox and "Reset demo data" button in the design
    file are demo/reviewer-only affordances, not product requirements — the design file's own
    comments mark them as such ("Demo-only affordances (not part of the shipped product)"), and
    no acceptance criterion calls for either. No code is added for them.
  - |
    Assumed removing the "USD, up to two decimal places" hint under the Amount field (present
    in the shipped form, absent from the approved design) is an intentional simplification by
    the designer rather than an oversight, since the design's own Amount field is otherwise
    pixel-for-pixel identical (same `$` prefix, placeholder, input type) and no note calls the
    hint out as missing.
package_dependencies: []
notes: |
  Research trail: `public/js/expenses.js` + `public/index.html` already implement the full
  create-expense flow (modal, validation, localStorage persistence, immediate re-render) from
  TEST-M1-STORY-154, exercised by the 20+ existing tests in `test/expenses-create.test.js`. No
  backend/store code is involved — `grep` for "expense" under `src/` returns nothing; everything
  lives client-side. `design-system/tokens.css` and `design-system/prototype-utils.css` (loaded
  by `public/index.html`) already define the exact dark-purple palette and `.modal`/`.btn`/
  `.field-error` component classes the design prototype inlines for preview purposes — so no
  visual/token work is needed, only the three copy/validation corrections in `scope`.

  ```mermaid
  flowchart TD
    HTML[public/index.html<br/>create-form markup] -->|loads| JS[public/js/expenses.js<br/>initExpensesApp]
    JS -->|validateAmount| VA[validateAmount]
    JS -->|validateCreateExpenseFields| VCF[validateCreateExpenseFields]
    JS -->|persistExpenses| LS[(localStorage)]
    TEST[test/expenses-create.test.js] -->|requires| JS
    TEST -->|reads fixture| HTML
    EDITFORM[Edit modal submit handler<br/>public/js/expenses.js] -->|reuses| VA

    classDef touched fill:#f96,color:#000
    class HTML,JS,VA,VCF,TEST touched
  ```
  `VA` (validateAmount) is touched and shared with the untouched Edit-modal handler — the
  regex/order fix flows through to Edit for free, which is why Edit needs no direct code change
  but its existing tests (`test/expenses.test.js`) must still pass unmodified.
review_focus: |
  This is a correction pass on an already-shipped create-expense flow to match a newly-approved
  design, not new feature work — hold the diff to the three changes in `scope` (amount
  validation regex/order/copy, Description becoming truly optional, two copy strings) and flag
  anything touching the Edit modal, filter bar, or page-level header copy as out of scope. The
  riskiest change is widening `validateAmount`'s regex to accept a leading `-`: verify it still
  returns the "not a valid number" message for genuine garbage (e.g. `"abc"`, `"1.2.3"`) and that
  `test/expenses.test.js` (Edit flow, which shares this function) still passes unmodified since
  no change is planned there. Also confirm nothing else in the codebase queries
  `#create-error-description` or `#create-amount-hint` before they're deleted.
