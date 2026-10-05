summary: |
  The expense create and edit flows already shipped (public/index.html, public/js/expenses.js)
  mostly satisfy this epic's settled rules, but reading the real code against the eleven
  acceptance criteria surfaces two concrete bugs in the EDIT flow specifically: (1) editing an
  expense does not re-attribute `loggedBy` to the currently signed-in viewer (AC7) — the
  `updated` record spreads the original record and never reads `viewerSelect.value`, and (2) the
  edit form's amount validation (`validateExpenseFields`) does not reject amounts with more than
  two decimal places or reuse the shared `validateAmount` helper the create form already uses
  (AC3) — it silently rounds an over-precise amount via `Math.round(...)` instead of blocking it
  with an inline error. This plan is test-first: for every acceptance criterion we either (a)
  write a confirming regression test that already passes today and locks the behavior in, or (b)
  write a failing test that reproduces one of the two bugs above, then make the minimal code
  change to the edit flow to pass it. No new screens, fields, or features are added — categories,
  the four-field form shape, shared visibility, immediate-save-no-workflow, and the absence of
  delete/attachment controls are all already correct and only need confirming tests.
scope:
  - description: |
      Fix `validateExpenseFields` (used only by the edit form's submit handler) to reuse the
      shared `validateAmount` helper instead of its own weaker inline check, so the edit flow
      rejects zero/negative/more-than-2-decimal amounts with the same specific inline message the
      create flow already shows, instead of silently rounding an invalid value and saving it.

      Before:
      ```js
      function validateExpenseFields({ amount, date, category }) {
        const amountValue = parseFloat(amount);
        return {
          amount: (amount === '' || Number.isNaN(amountValue) || amountValue <= 0) ? 'Amount is required.' : null,
          date: date === '' ? 'Date is required.' : null,
          category: category === '' ? 'Category is required.' : null,
        };
      }
      ```
      After:
      ```js
      function validateExpenseFields({ amount, date, category }) {
        return {
          amount: validateAmount(amount) || null,
          date: date === '' ? 'Date is required.' : null,
          category: category === '' ? 'Category is required.' : null,
        };
      }
      ```
    files:
      - public/js/expenses.js
    rationale: |
      `validateAmount` already implements exactly the AC3 rule set (required, must be > 0, at
      most 2 decimal places) and is already used by the create form's
      `validateCreateExpenseFields`. The edit form's bespoke check only caught blank/NaN/<=0 and
      let `19.999` through, which was then silently rounded to `20.00` on save instead of being
      blocked — violating AC3's "has more than 2 decimal places THEN submission is blocked" for
      the edit flow. Reusing the same helper is the minimal fix and removes the duplication.
  - description: |
      Pass the specific error message through to the edit form's amount/date/category fields
      (the create form already does this) so an invalid edit shows the decimal-place-specific
      message rather than always falling back to the generic "Amount is required." default text.

      Before (inside the `edit-form` submit handler):
      ```js
      setFieldError(fieldAmount, errorAmount, Boolean(errors.amount));
      setFieldError(fieldDate, errorDate, Boolean(errors.date));
      setFieldError(fieldCategory, errorCategory, Boolean(errors.category));
      ```
      After:
      ```js
      setFieldError(fieldAmount, errorAmount, Boolean(errors.amount), errors.amount);
      setFieldError(fieldDate, errorDate, Boolean(errors.date), errors.date);
      setFieldError(fieldCategory, errorCategory, Boolean(errors.category), errors.category);
      ```
    files:
      - public/js/expenses.js
    rationale: |
      `setFieldError(fieldEl, errorEl, hasError, message)` already accepts an optional message
      and only rewrites `errorEl.textContent` when one is passed; the edit handler just never
      passed it. Without this, fixing `validateExpenseFields` above would compute the correct
      message but the UI would still show the static "Amount is required." text for a
      zero/negative/over-precise amount, which is misleading and not what AC3's inline-error
      requirement implies.
  - description: |
      Set `loggedBy` to the currently-selected viewer when an edit is saved, matching what the
      create flow already does.

      Before (inside the `edit-form` submit handler's `setTimeout` callback):
      ```js
      const updated = {
        ...expenses[idx],
        amount: Math.round(parseFloat(amountRaw) * 100) / 100,
        date: dateValue,
        category: categoryValue,
        description: fieldDescription.value.trim(),
      };
      ```
      After:
      ```js
      const updated = {
        ...expenses[idx],
        amount: Math.round(parseFloat(amountRaw) * 100) / 100,
        date: dateValue,
        category: categoryValue,
        description: fieldDescription.value.trim(),
        loggedBy: viewerSelect.value,
      };
      ```
    files:
      - public/js/expenses.js
    rationale: |
      AC7 explicitly requires this for "creates or edits" both. Today the `updated` object
      spreads `...expenses[idx]` and never reads `viewerSelect.value`, so an edit keeps
      whoever originally logged the expense as `loggedBy` regardless of who is currently signed
      in — the create flow already does this correctly (`loggedBy: viewerSelect.value` in
      `createForm`'s submit handler), so this brings edit to parity with the rule it's supposed
      to already follow.
  - description: |
      Add failing-first then passing tests to `test/expenses.test.js` for the two edit-flow bugs
      above (AC3, AC7), plus confirming regression tests for AC1, AC2, AC4, AC8, AC9, AC10, AC11
      on the edit flow specifically (the blank-date case and "no default value applied" are not
      currently asserted anywhere for edit).
    files:
      - test/expenses.test.js
    rationale: |
      These are the tests that pin down the edit-flow behavior this story is meant to confirm
      (or, for the two bugs, demonstrate the gap before the fix above closes it).
  - description: |
      Add confirming regression tests to `test/expenses-create.test.js` for AC3 (zero and
      negative amount, not just the already-tested over-2-decimal case), AC2 (no default value
      substituted on a blocked submit), AC5/AC6 (fixed category list, no management control),
      and AC10/AC11 (no attachment/receipt control, no delete control) on the create flow.
    files:
      - test/expenses-create.test.js
    rationale: |
      The create flow already passes these, but no test currently locks in the zero/negative
      amount cases, the "no default applied" behavior, or the absence of category-management,
      attachment, and delete controls — all of which are explicit acceptance criteria for this
      story and should fail loudly if a future change regresses them.
tests:
  - |
    AC1/AC2 (edit, blank date — not currently covered): in test/expenses.test.js, add
    `document.getElementById('field-date').value = ''; document.getElementById('edit-form').dispatchEvent(new Event('submit', { cancelable: true })); expect(document.getElementById('error-date').hidden).toBe(false); expect(document.getElementById('modal-wrap').hidden).toBe(false);`
  - |
    AC2 (no default value applied — edit): clear category then submit:
    `document.getElementById('field-category').value = ''; ...dispatchEvent(submit)...; expect(document.getElementById('field-category').value).toBe(''); expect(document.getElementById('field-date').value).toBe('2026-09-02');`
    asserting the untouched Date field keeps its pre-filled value rather than being reset/defaulted.
  - |
    AC3 (edit, zero/negative — already should pass): `document.getElementById('field-amount').value = '0'; ...submit...; expect(document.getElementById('error-amount').hidden).toBe(false);` and repeat with `'-12.50'`.
  - |
    AC3 (edit, over-2-decimals — FAILS TODAY, exposes the bug): `document.getElementById('field-amount').value = '19.999'; document.getElementById('edit-form').dispatchEvent(new Event('submit', { cancelable: true })); expect(document.getElementById('error-amount').hidden).toBe(false); expect(document.getElementById('error-amount').textContent).toMatch(/at most 2 decimal places/i); const stored = JSON.parse(localStorage.getItem('expenses')); expect(stored.find(e => e.id === 'exp_001').amount).toBe(482.5);`
    This currently fails: today's edit validation lets `19.999` through and silently rounds it to `20.00` on save.
  - |
    AC4 (edit, large valid 2-decimal amount saves, no ceiling): `document.getElementById('field-amount').value = '1500000.00'; ...submit...; jest.advanceTimersByTime(350); expect(JSON.parse(localStorage.getItem('expenses')).find(e => e.id === 'exp_001').amount).toBe(1500000);`
  - |
    AC3 (create, zero and negative — not currently covered, only decimals are): in
    test/expenses-create.test.js, `const { validateAmount } = require('../public/js/expenses'); expect(validateAmount('0')).toMatch(/greater than \$0\.00/i); expect(validateAmount('-12.50')).toMatch(/greater than \$0\.00/i);`
  - |
    AC2 (no default value applied — create): submit with all fields blank, then assert
    `document.getElementById('create-field-category').value` is still `''` (not reset to the
    first real option) and `create-field-date` is still `''`, not today's date.
  - |
    AC5/AC6 (fixed category list, both forms): `const opts = v => Array.from(document.querySelectorAll(v)).map(o => o.textContent).filter(Boolean); expect(opts('#field-category option')).toEqual(['Select a category','Travel','Meals','Software','Office Supplies','Other']); expect(opts('#create-field-category option')).toEqual(opts('#field-category option'));`
    plus `expect(document.querySelector('[id*="category" i][id*="add" i], [id*="manage-categor" i]')).toBeNull();` to confirm no add/manage control exists.
  - |
    AC7 (edit re-attributes loggedBy — FAILS TODAY, exposes the bug): in test/expenses.test.js,
    `document.getElementById('viewer-select').value = 'Priya Shah'; document.querySelector('[data-edit-id="exp_001"]').click(); document.getElementById('field-amount').value = '500.00'; document.getElementById('edit-form').dispatchEvent(new Event('submit', { cancelable: true })); jest.advanceTimersByTime(350); expect(JSON.parse(localStorage.getItem('expenses')).find(e => e.id === 'exp_001').loggedBy).toBe('Priya Shah');`
    `exp_001` is fixtured with `loggedBy: 'Morgan Ellis'`, so this fails today (loggedBy stays
    'Morgan Ellis') and passes once the fix above is applied.
  - |
    AC8 (shared visibility — edit): after the AC7 edit above, switch viewer again and confirm the
    row is still rendered: `document.getElementById('viewer-select').value = 'Devon Ruiz'; document.getElementById('viewer-select').dispatchEvent(new Event('change')); expect(document.querySelector('[data-edit-id="exp_001"]')).not.toBeNull();`
  - |
    AC9 (no workflow state on save — edit, confirming): after a successful edit save, assert no
    pending/approval element exists: `expect(document.querySelector('[class*="pending" i], [class*="approval" i], [class*="status" i]')).toBeNull();` alongside the existing modal-closed assertion.
  - |
    AC10 (no attachment control, both forms, confirming): `expect(document.querySelector('#edit-form input[type="file"], #create-form input[type="file"], [id*="receipt" i], [id*="attach" i]')).toBeNull();`
  - |
    AC11 (no delete control anywhere, confirming): `const buttons = Array.from(document.querySelectorAll('button')); expect(buttons.some(b => /delete/i.test(b.textContent) || /delete/i.test(b.id))).toBe(false);` run against the full document including both modals and the row actions column.
assumptions_or_open_questions:
  - |
    The approved design prototype (.arc/designs/TEST-M1-STORY-154-design.html) is a standalone,
    self-contained demo page — a single combined create/edit form over one localStorage key
    (`test-m1-story-154-expenses`), plus two reference-only screens ("Validation & Category
    Rules" and "Epic Rules Checklist"). It is not literal markup to port into
    public/index.html: the real shipped app already has its own equivalent structure (separate
    `create-form` and `edit-form` modals, the same `field-error`/`input-invalid` inline-validation
    pattern, the same $-prefixed amount input, the same fixed five-category `<select>`, no
    delete/attachment/workflow controls). This plan treats the prototype as confirmation of the
    expected *behavior* (the exact validation-matrix inputs 0, -12.50, 19.999, 24.50, 1500000.00
    it calls out are used verbatim as test fixtures above) and does not restructure the shipped
    two-modal layout to match the demo's single combined modal, since no acceptance criterion
    requires merging them.
  - |
    Conflict between the design prototype and the shipped implementation: the prototype's single
    form requires Description on both create and edit (shows an `error-description` message for
    edit too). The shipped app's real edit form (public/index.html) instead labels Description
    "(optional)" and has no `error-description` element for edit, while its create form does
    require it. None of AC1–AC11 mention Description's required-ness at all, so this plan leaves
    the shipped optional-on-edit/required-on-create asymmetry unchanged rather than silently
    picking a side — flagging it here for the reviewer rather than resolving it as part of this
    "confirm, don't build" story.
  - |
    Treating the two edit-flow defects found while reading the code (AC3 decimal-place bypass via
    silent rounding, and AC7's missing loggedBy re-attribution) as in-scope bug fixes rather than
    "new functionality," since the story description frames the work as confirming shipped
    behavior "rather than building new functionality" but acceptance criteria 3 and 7 explicitly
    require this to work for edit as well as create — an unfixed gap would mean the story cannot
    honestly be confirmed as passing.
package_dependencies: []
notes: |
  Research trail: read public/js/expenses.js in full (`initExpensesApp`, `validateAmount`,
  `validateExpenseFields`, `validateCreateExpenseFields`), public/index.html (both modals'
  markup), and all three existing test files (test/expenses.test.js — edit flow,
  test/expenses-create.test.js — create flow, test/expenses-filter.test.js — filtering, out of
  scope here) before concluding the create flow already fully satisfies every AC and the edit
  flow has exactly two gaps (AC3, AC7), both inside the `edit-form` submit handler and its
  `validateExpenseFields` helper.

  ```mermaid
  flowchart TD
    editForm["edit-form submit handler\n(public/js/expenses.js)"]
    validateFields["validateExpenseFields()"]
    validateAmountFn["validateAmount()\n(shared helper)"]
    persist["persistExpenses() -> localStorage"]
    createForm["create-form submit handler\n(unchanged, already correct)"]
    viewerSelect["#viewer-select (DOM)"]

    editForm -->|"calls, now passes error message to setFieldError"| validateFields
    validateFields -->|"now delegates amount check instead of its own weaker regex"| validateAmountFn
    createForm -->|"already uses"| validateAmountFn
    editForm -->|"now reads viewerSelect.value into updated.loggedBy"| viewerSelect
    editForm --> persist
    createForm --> persist

    classDef touched fill:#f96,color:#000
    class editForm,validateFields touched
  ```
review_focus: |
  In scope: two targeted fixes inside public/js/expenses.js's edit flow only
  (`validateExpenseFields` reusing `validateAmount`, passing error messages to `setFieldError`,
  and `loggedBy: viewerSelect.value` in the edit save path), plus test coverage across both test
  files for every AC. Out of scope: any change to public/index.html markup, the create flow (already
  correct), categories, or anything resembling delete/attachment/workflow features — none of
  those should appear in the diff. Riskiest spot: the edit submit handler's `setTimeout` callback
  — it's easy to accidentally also change what happens when `editingId` no longer matches
  `targetId` (the existing cross-apply guard at line ~263), which must stay untouched. Deliberate,
  non-obvious choice a reviewer shouldn't flag as a miss: the shipped edit form intentionally
  treats Description as optional (unlike create, and unlike the design prototype) — this plan
  does not change that, since no AC governs it.
