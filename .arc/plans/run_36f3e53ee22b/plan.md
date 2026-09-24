summary: |
  Reading the current worktree turned up something important: this feature is **not**
  greenfield. `public/index.html`, `public/js/expenses.js`, `public/css/expenses.css`, and
  `test/expenses.test.js` already implement a fully working "edit expense via modal" flow —
  table + edit modal + validation + toast + `localStorage` persistence — functionally
  identical to what TEST-M1-STORY-092 asks for. This appears to be carried over from an
  earlier, similarly-scoped story (`TEST-M1-STORY-032`, "Edit Expense via Modal Form" — see
  its own plan at `.arc/plans/run_909bfa08551e/plan.md`), now restyled with the
  design-system-bootstrap purple tokens (`design-system/tokens.css`) that already match the
  colors in the newly-approved `TEST-M1-STORY-092-design.html` prototype.
  Comparing the shipped `public/index.html` against the approved 092 prototype line-by-line
  found exactly one drift: the modal subtitle reads "Update any field, then save to apply the
  correction." (the *old* STORY-032 design's copy) instead of the approved 092 design's
  "Update any field, then save to apply the change." (design file line 680). Every other
  structural/style element (fields, ids, error copy, toast copy, table columns, `.field-error`
  treatment via icon+bold+border per the design's own danger-token-gap note) already matches.
  Comparing the existing `test/expenses.test.js` suite against the 092 AC list found real
  coverage gaps: AC3 (success toast on a valid save) has no assertion anywhere in the suite;
  AC4's "for each invalid field" (plural) is only ever exercised with a single invalid field
  (Amount); AC5 ("the expense is not updated" on an invalid submit) has no explicit
  storage/table assertion; AC6 ("cancels or closes") only drives the Cancel button, never the
  ✕ close button; AC7 ("still present after a reload") has no test that actually re-initializes
  the app against the same `localStorage`, only a same-session persistence check. AC1 and the
  amount-only slice of AC2 are already fully covered.
  This plan is therefore narrow and test-first in the coverage-closing sense rather than the
  literal red→green sense for most items: it (1) fixes the one copy drift so the shipped page
  matches the approved design exactly, and (2) adds the missing AC-mapped tests. Reading
  `public/js/expenses.js` closely, every one of these new tests is expected to pass against
  the current implementation without further code changes — they lock in behavior that
  already exists but was previously unverified, rather than driving new production code. If
  execution surfaces a genuine behavioral gap in one of them, the fix belongs narrowly in
  `public/js/expenses.js` (the single module owning this logic), not a new file.
scope:
  - description: |
      Fix the modal subtitle copy in `public/index.html` so it matches the approved
      `TEST-M1-STORY-092-design.html` prototype exactly (design file line 680) instead of the
      stale copy carried over from the prior `TEST-M1-STORY-032` design (line 551 of that
      design file).

      Before:
      ```html
      <p>Update any field, then save to apply the correction.</p>
      ```
      After:
      ```html
      <p>Update any field, then save to apply the change.</p>
      ```
    files:
      - public/index.html
    rationale: |
      The approved prototype is the only record of this design, and every UI step must build
      it exactly — this is the one place the shipped markup had drifted from it. No AC
      references this copy directly, but the plan instructions require citing and honoring the
      approved design's concrete text, not a stale variant of it.
  - description: |
      Add the missing AC-mapped test cases to the existing `test/expenses.test.js` suite
      (same file, same `beforeEach` jsdom/fake-timer setup already in place — no new test
      infrastructure needed). Six new `test(...)` blocks, each targeting one currently-untested
      slice of an acceptance criterion; see the `tests` field below for the exact assertions.
      No changes to `public/js/expenses.js` are anticipated — reading its current submit
      handler shows it already calls `showToast('Expense updated')` on a valid save (AC3),
      already validates and flags every invalid field independently via
      `validateExpenseFields` (AC4), already returns before persisting when any field is
      invalid (AC5), already wires both `#modal-close-btn` and `#modal-cancel-btn` to the same
      `cancelEdit` discard path (AC6), and already re-reads from the same `localStorage` key on
      every `initExpensesApp(doc)` call (AC7, verified by re-invoking it against a freshly
      loaded copy of `public/index.html` in the same test, simulating a reload since jsdom has
      no real navigation). If any one of these turns out not to hold at execution time, the fix
      is a targeted change to the corresponding branch of `public/js/expenses.js`'s
      `initExpensesApp`/`validateExpenseFields`, not a new module.
    files:
      - test/expenses.test.js
    rationale: |
      Closes real coverage gaps against the full 092 AC list without touching working
      production code speculatively. AC1 and the amount-only slice of AC2 already have passing
      tests (`test/expenses.test.js` lines 21 and 56) and need no new work.
tests:
  - |
    AC1 (pre-populated fields) — already covered, no new test needed:
    ```js
    test('activating Edit opens a modal pre-populated with the record\'s current values', () => {
      document.querySelector('[data-edit-id="exp_001"]').click();
      expect(document.getElementById('field-amount').value).toBe('482.50');
    });
    ```
    (existing, `test/expenses.test.js:21`)
  - |
    AC2 (table reflects *every* updated field immediately, not just amount) — new test,
    expected to pass against the current `renderList`/submit handler without code changes:
    ```js
    test('the table reflects every updated field (date, category, description, amount) immediately after saving', () => {
      document.querySelector('[data-edit-id="exp_002"]').click();
      document.getElementById('field-amount').value = '120.00';
      document.getElementById('field-date').value = '2026-09-20';
      document.getElementById('field-category').value = 'Software';
      document.getElementById('field-description').value = 'Updated description';
      document.getElementById('edit-form').dispatchEvent(new Event('submit', { cancelable: true }));
      jest.advanceTimersByTime(350);
      const row = document.querySelector('[data-edit-id="exp_002"]').closest('tr');
      expect(row.children[0].textContent).toBe('09/20/2026');
      expect(row.querySelector('.chip').textContent).toBe('Software');
      expect(row.querySelector('.desc-cell').textContent).toBe('Updated description');
      expect(row.querySelector('.col-amount').textContent).toBe('$120.00');
    });
    ```
  - |
    AC3 (success toast on valid submit) — currently untested anywhere in the suite; new test,
    expected to pass since `initExpensesApp`'s submit handler already calls
    `showToast('Expense updated')` after a successful save:
    ```js
    test('a successful save shows a success toast', () => {
      document.querySelector('[data-edit-id="exp_001"]').click();
      document.getElementById('field-amount').value = '512.50';
      document.getElementById('edit-form').dispatchEvent(new Event('submit', { cancelable: true }));
      jest.advanceTimersByTime(350);
      expect(document.getElementById('toast').hidden).toBe(false);
      expect(document.getElementById('toast-message').textContent).toBe('Expense updated');
    });
    ```
  - |
    AC4 (inline error "for each" invalid field, plural — only ever tested with Amount alone
    today) — new test with two fields invalid at once, expected to pass since
    `validateExpenseFields` already checks amount/date/category independently:
    ```js
    test('submitting with both Amount and Category invalid shows an inline error for each, leaving the valid Date field alone', () => {
      document.querySelector('[data-edit-id="exp_001"]').click();
      document.getElementById('field-amount').value = '';
      document.getElementById('field-category').value = '';
      document.getElementById('edit-form').dispatchEvent(new Event('submit', { cancelable: true }));
      expect(document.getElementById('error-amount').hidden).toBe(false);
      expect(document.getElementById('error-category').hidden).toBe(false);
      expect(document.getElementById('error-date').hidden).toBe(true);
    });
    ```
  - |
    AC5 (expense is not updated on an invalid submit) — no existing test asserts this
    explicitly; new test, expected to pass since the submit handler returns before persisting
    when validation fails:
    ```js
    test('submitting with an invalid field does not update the stored or rendered expense', () => {
      document.querySelector('[data-edit-id="exp_001"]').click();
      document.getElementById('field-amount').value = '';
      document.getElementById('edit-form').dispatchEvent(new Event('submit', { cancelable: true }));
      jest.advanceTimersByTime(350);
      const stored = JSON.parse(localStorage.getItem('expenses'));
      expect(stored.find((e) => e.id === 'exp_001').amount).toBe(482.5);
      const row = document.querySelector('[data-edit-id="exp_001"]').closest('tr');
      expect(row.querySelector('.col-amount').textContent).toBe('$482.50');
    });
    ```
  - |
    AC6 (cancels OR closes the modal — only Cancel is exercised today, never the ✕ close
    button) — new test, expected to pass since `#modal-close-btn` is already wired to the same
    `cancelEdit` handler as `#modal-cancel-btn`:
    ```js
    test('the close (X) button discards in-progress edits, same as Cancel', () => {
      document.querySelector('[data-edit-id="exp_001"]').click();
      document.getElementById('field-amount').value = '999.99';
      document.getElementById('modal-close-btn').click();
      const stored = JSON.parse(localStorage.getItem('expenses'));
      expect(stored.find((e) => e.id === 'exp_001').amount).toBe(482.5);
      expect(document.getElementById('modal-wrap').hidden).toBe(true);
    });
    ```
  - |
    AC7 (updated values still present after the page is reloaded) — no existing test
    re-initializes the app to simulate a reload; new test, expected to pass since
    `initExpensesApp` re-reads the same `localStorage` key every time it's called:
    ```js
    test('an edited expense still shows its updated values after the page is reloaded', () => {
      document.querySelector('[data-edit-id="exp_001"]').click();
      document.getElementById('field-amount').value = '512.50';
      document.getElementById('edit-form').dispatchEvent(new Event('submit', { cancelable: true }));
      jest.advanceTimersByTime(350);

      document.documentElement.innerHTML = fs.readFileSync(HTML_PATH, 'utf8');
      jest.resetModules();
      const { initExpensesApp: reInit } = require('../public/js/expenses');
      reInit(document);

      const row = document.querySelector('[data-edit-id="exp_001"]').closest('tr');
      expect(row.querySelector('.col-amount').textContent).toBe('$512.50');
    });
    ```
assumptions_or_open_questions:
  - |
    The repo is not greenfield for this feature: `public/index.html`, `public/js/expenses.js`,
    `public/css/expenses.css`, and `test/expenses.test.js` already implement the full
    edit-expense flow, apparently carried over from the earlier `TEST-M1-STORY-032` story
    (same feature, different story id/design iteration — see `.arc/plans/run_909bfa08551e/plan.md`).
    This plan treats that as the real baseline rather than re-deriving the whole feature from
    scratch, per the instruction to first verify what actually exists in the code.
  - |
    Because the underlying logic already exists, most of the new tests in this plan are
    expected to pass immediately rather than fail-then-pass in the literal TDD sense. They are
    still written first, before any code change, so if one of them *does* fail during
    execution it surfaces a real, previously-hidden gap rather than being written to match
    whatever the code happens to do.
  - |
    The approved 092 design's reviewer-only elements — the "← Prev / Next →" bar, the
    "Reload page" / "Reset demo data" buttons, and the second "Edit Modal — Reference States"
    screen — are intentionally not built into `public/index.html`, consistent with the same
    exclusion already made (and justified) for the near-identical STORY-032 design in
    `.arc/plans/run_909bfa08551e/plan.md`. AC7's "page reloaded" is verified in-suite by
    re-invoking `initExpensesApp` against a fresh copy of the markup with the same
    `localStorage`, since jsdom has no real browser navigation to trigger.
  - |
    No new backend route or persistence layer is needed: the feature is entirely client-side,
    backed by `localStorage` under the `expenses` key, matching AC7's persistence requirement
    and the already-static-file-serving `src/server.js` (`express.static('public')` and
    `express.static('design-system')`, both already wired).
package_dependencies: []
notes: |
  `jest-environment-jsdom` is already an installed devDependency (`package.json`), and
  `test/expenses.test.js` already opts into it via the `/** @jest-environment jsdom */`
  docblock — no test-infrastructure changes are needed for this plan's new assertions.

  This plan's footprint is a one-line copy fix in `public/index.html` plus new test cases in
  the existing `test/expenses.test.js` — no new files, no layer crossed, no production module
  touched — so a module diagram would add nothing here and is omitted per the planning
  instructions.
