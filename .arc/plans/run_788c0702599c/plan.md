summary: |
  The shared expense list (`public/index.html` + `public/js/expenses.js`) already lets any
  signed-in viewer open and save an edit on any row — `openEditModal` never checks who logged
  the record, so AC1, AC2, AC3, AC4, and AC5 are functionally already true today (confirmed by
  reading the existing edit flow and its test coverage in `test/expenses.test.js`). What the
  newly approved design (`.arc/designs/TEST-M1-STORY-178-design.html`) adds on top of that is a
  **visible, attributable trail of the edit**: the original logger (`loggedBy`) is never
  overwritten, a new `lastEditedBy` field is set on save, an "Edited by {name}" badge renders
  under "Logged by" in the table, and the edit modal gains an "Originally logged by {name} on
  {date}" note so the editor can see whose record they're correcting. This plan brings the real
  app's data model and markup in line with that design, fixes one real conflict it exposes with
  already-shipped behavior/tests (see `assumptions_or_open_questions`), and aligns the edit
  modal's Amount field and save-failure copy with the approved design.
scope:
  - description: |
      Stop overwriting `loggedBy` on save. Add a `lastEditedBy` field (defaults to `null` on the
      three fixture rows) that is set to the current "Signed in as" viewer only when an edit is
      successfully saved, and render it as an "Edited by {name}" badge under "Logged by" —
      exactly as shown in the design's fixture rows (`.arc/designs/TEST-M1-STORY-178-design.html`
      lines 599-602 `lastEditedBy` field, lines 422-428 `.edited-badge` rule, lines 980-986 badge
      markup in `renderList`).

      In `public/js/expenses.js`:
      - `INITIAL_EXPENSES`: add `lastEditedBy: null` to each of the 3 rows.
      - In the edit-form submit handler, change the `updated` object from setting
        `loggedBy: viewerSelect.value` to `lastEditedBy: viewerSelect.value`, keeping `loggedBy`
        untouched via the existing `...expenses[idx]` spread:
        `const updated = { ...expenses[idx], amount, date: dateValue, category: categoryValue, description: fieldDescription.value.trim(), lastEditedBy: viewerSelect.value };`
      - In `renderList`, add the badge next to the existing `loggedBy` cell:
        `const editedBadge = exp.lastEditedBy ? \`<span class="edited-badge">Edited by ${escapeHtml(doc, exp.lastEditedBy)}</span>\` : '';`
        and append it inside the `logged-by-cell` `<td>`.
    files:
      - public/js/expenses.js
      - public/css/expenses.css
      - test/expenses.test.js
    rationale: |
      The design's own JS (`openEditModal`/submit handler, lines 1127-1157) never reassigns
      `loggedBy` — only `lastEditedBy` changes on save — and every fixture row in the design is
      deliberately logged by a different person than the default viewer precisely so a reviewer
      can confirm AC1 without hunting for a mismatch (design comment, lines 592-596). This
      directly conflicts with the current shipped behavior in `public/js/expenses.js`, where the
      submit handler sets `loggedBy: viewerSelect.value`, re-attributing the row to whoever is
      currently signed in. That behavior is pinned by an existing test
      ("AC7/AC8: editing re-attributes loggedBy to the current viewer...", `test/expenses.test.js`
      lines 265-277) which must be rewritten to assert the new, approved behavior instead.
  - description: |
      Add the "Originally logged by {name} on {date}" origin note to the real edit modal, and
      update the modal subtitle copy to match the design.

      In `public/index.html`, inside the edit modal (`#modal-wrap`), add a new paragraph right
      after `.modal-header` and before `<form id="edit-form">`:
      `<p class="origin-note" id="origin-note"></p>`
      and update the existing subtitle `<p>` to carry the id and the design's exact copy:
      `<p id="modal-subtitle">Update the details below and save to correct the shared record.</p>`

      In `public/js/expenses.js`, inside `openEditModal(id)`, populate it:
      `originNote.innerHTML = \`Originally logged by <strong>${escapeHtml(doc, exp.loggedBy)}</strong> on ${formatDateDisplay(exp.date)}.\`;`
    files:
      - public/index.html
      - public/js/expenses.js
      - public/css/expenses.css
      - test/expenses.test.js
    rationale: |
      Design lines 707-714 (`#modal-subtitle`, `#origin-note`) and line 1028
      (`originNote.innerHTML = 'Originally logged by <strong>...</strong> on ...'`) are the
      mechanism that makes it visually obvious to the editor that they're correcting a record
      someone else logged — this is the concrete UI expression of AC1 inside the modal itself,
      not just the always-enabled Edit button. The `.origin-note` / `.origin-note strong` CSS
      rule (design lines 473-479) has no equivalent in `public/css/expenses.css` today.
  - description: |
      Align the edit modal's Amount field markup with both the design and the already-shipped
      create-expense form (`public/js/expenses.js` create flow already uses a text input).

      In `public/index.html`, change the edit form's `#field-amount` input from
      `type="number" min="0.01" step="0.01" inputmode="decimal"` to
      `type="text" inputmode="decimal" placeholder="0.00"`.
    files:
      - public/index.html
      - test/expenses.test.js
    rationale: |
      Design's edit-form amount field (lines 727-731) is
      `<input class="input amount-input" id="field-amount" name="amount" type="text" inputmode="decimal" placeholder="0.00" .../>`
      — matching the create form the codebase already ships. The current edit form is the only
      place left using a native `type="number"` input, which is an inconsistency with AC2's
      "same field validation as logging" framing (logging already uses the text+regex approach)
      and with the approved design.
  - description: |
      Align the save-failure toast copy on the edit form with the design's exact string, and
      update the one existing test that pins the old copy.

      In `public/js/expenses.js`, in the edit-form submit handler's `catch` block, change
      `showToast('error', 'Expense could not be saved — please try again');` to
      `showToast('error', "Couldn't save changes — please try again");`.
    files:
      - public/js/expenses.js
      - test/expenses.test.js
    rationale: |
      Design's `persistExpenses`/submit-handler failure path (lines 1142-1148) shows the exact
      copy `"Couldn't save changes — please try again"`. The existing test
      ("a localStorage failure on save keeps the modal open...", `test/expenses.test.js` lines
      194-212) asserts `toMatch(/could not be saved/i)` against the old copy and must be updated
      to the new string so it still passes once the copy changes.
tests:
  - |
    AC1 (new, pinning cross-person edit explicitly): a different team member can open and save
    an edit on a row they did not log.
    ```js
    test('AC1: a different team member can open and save an edit on an expense they did not log', () => {
      document.getElementById('viewer-select').value = 'Priya Shah';
      const row = document.querySelector('[data-edit-id="exp_001"]').closest('tr');
      expect(row.querySelector('.logged-by-cell').textContent).toContain('Morgan Ellis');
      document.querySelector('[data-edit-id="exp_001"]').click();
      document.getElementById('field-amount').value = '399.00';
      document.getElementById('edit-form').dispatchEvent(new Event('submit', { cancelable: true }));
      jest.advanceTimersByTime(350);
      expect(storedExpense('exp_001').amount).toBe(399);
      expect(document.getElementById('modal-wrap').hidden).toBe(true);
    });
    ```
  - |
    AC1/AC4 (replaces the stale "AC7/AC8" test, `test/expenses.test.js` lines 265-277): editing
    preserves the original logger, shows the origin note, records who last edited it as a badge,
    and the updated row — badge included — stays visible immediately after switching viewers,
    with no reload.
    ```js
    test('AC1/AC4: editing preserves the original logger, shows who last edited it, and stays visible after switching viewers', () => {
      const viewer = document.getElementById('viewer-select');
      viewer.value = 'Priya Shah';
      document.querySelector('[data-edit-id="exp_001"]').click();
      expect(document.getElementById('origin-note').textContent).toBe('Originally logged by Morgan Ellis on 09/02/2026.');
      document.getElementById('field-amount').value = '500.00';
      document.getElementById('edit-form').dispatchEvent(new Event('submit', { cancelable: true }));
      jest.advanceTimersByTime(350);
      expect(storedExpense('exp_001').loggedBy).toBe('Morgan Ellis');
      expect(storedExpense('exp_001').lastEditedBy).toBe('Priya Shah');

      viewer.value = 'Devon Ruiz';
      viewer.dispatchEvent(new Event('change'));
      const row = document.querySelector('[data-edit-id="exp_001"]').closest('tr');
      expect(row.querySelector('.logged-by-cell').textContent).toBe('Morgan EllisEdited by Priya Shah');
    });
    ```
  - |
    AC2/AC3: the edit Amount field matches the design's markup (text input, decimal inputmode,
    $0.00 placeholder) and still blocks an invalid value with an inline error while leaving the
    stored record unchanged.
    ```js
    test('AC2/AC3: the edit Amount field matches the design and still blocks invalid values without changing the stored record', () => {
      expect(document.getElementById('field-amount').type).toBe('text');
      expect(document.getElementById('field-amount').getAttribute('inputmode')).toBe('decimal');
      expect(document.getElementById('field-amount').placeholder).toBe('0.00');
      document.querySelector('[data-edit-id="exp_001"]').click();
      document.getElementById('field-amount').value = '19.999';
      document.getElementById('edit-form').dispatchEvent(new Event('submit', { cancelable: true }));
      expect(document.getElementById('error-amount').textContent).toMatch(/at most 2 decimal places/i);
      expect(storedExpense('exp_001').amount).toBe(482.5);
    });
    ```
    (AC2/AC3 already have broad passing coverage in `test/expenses.test.js` — e.g. the blank-amount,
    both-fields-invalid, and amount-boundary tests — this adds the one assertion not yet covered:
    that the field markup itself matches the approved design after Scope item 3's change.)
  - |
    AC5: the row for a just-edited expense still exposes only the "Edit" action — no delete
    control appears anywhere, before or after an edit.
    ```js
    test('AC5: the row for an edited expense still has only an Edit action, never a delete control', () => {
      document.querySelector('[data-edit-id="exp_001"]').click();
      document.getElementById('field-amount').value = '500.00';
      document.getElementById('edit-form').dispatchEvent(new Event('submit', { cancelable: true }));
      jest.advanceTimersByTime(350);
      const row = document.querySelector('[data-edit-id="exp_001"]').closest('tr');
      const buttons = Array.from(row.querySelectorAll('button'));
      expect(buttons).toHaveLength(1);
      expect(buttons[0].textContent).toBe('Edit');
    });
    ```
    (The pre-existing "AC11: no delete control anywhere in the document" test already covers the
    document-wide case; this adds the edited-row-specific check implied by this story's AC5.)
  - |
    Save-failure copy alignment (supports AC3's "record remains unchanged" framing with the
    design's exact error copy): update the existing failure test's assertion from the old string
    to the new one.
    ```js
    test('a localStorage failure on edit save shows the design\'s exact error copy and leaves the record unchanged', () => {
      document.querySelector('[data-edit-id="exp_001"]').click();
      document.getElementById('field-amount').value = '500.00';
      const setItemSpy = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('fail'); });
      document.getElementById('edit-form').dispatchEvent(new Event('submit', { cancelable: true }));
      jest.advanceTimersByTime(350);
      expect(document.getElementById('toast-message').textContent).toBe("Couldn't save changes — please try again");
      expect(storedExpense('exp_001').amount).toBe(482.5);
      setItemSpy.mockRestore();
    });
    ```
assumptions_or_open_questions:
  - |
    The design's "Simulate save failure (demo only)" checkbox and "Reset demo data" link are
    reviewer/prototype-only affordances for walking through the error-feedback state and
    resetting the prototype's own `test-m1-story-178-expenses` localStorage fixture — the design
    file itself labels the checkbox under a CSS section literally titled "Demo-only affordances
    (not part of the shipped product)" (lines 481-516). Neither is built into
    `public/index.html`; the equivalent real failure path (an actual `localStorage.setItem`
    throwing) is already exercised in tests via `jest.spyOn(Storage.prototype, 'setItem')`.
  - |
    This plan resolves a real conflict between the approved design and already-shipped behavior:
    today, saving an edit overwrites `loggedBy` with whoever is currently "Signed in as" (pinned
    by the now-renamed "AC7/AC8" test). The design instead never changes `loggedBy` and adds a
    separate `lastEditedBy` field plus an "Edited by {name}" badge. This plan follows the
    approved design (preserves `loggedBy`, adds `lastEditedBy`) since that's the explicit,
    reviewed behavior in the prototype, and updates the outdated test to match. Flagging this
    here per the review instructions rather than silently picking one.
  - |
    "Signed in as" remains a plain client-side identity selector with no real authentication —
    consistent with how it already works for logging expenses (STORY-177/179) and with the
    design's own `#viewer-select`. "A different team member" in AC1 is simulated by switching
    this dropdown, not by a real multi-user session.
  - |
    No backend/API changes are in scope — expenses are still persisted to `localStorage` under
    the existing `expenses` key (`public/js/expenses.js`), matching how create/filter already
    work; the design's own fixture uses a different, prototype-only storage key
    (`test-m1-story-178-expenses`) that isn't carried into the real app.
package_dependencies: []
notes: |
  No new third-party dependencies — this is confined to the existing vanilla JS/HTML/CSS
  expense-tracker page and its Jest/jsdom test suite.

  ```mermaid
  flowchart TD
    HTML[public/index.html<br/>edit modal markup]
    JS[public/js/expenses.js<br/>initExpensesApp / openEditModal / submit handler]
    CSS[public/css/expenses.css<br/>.edited-badge / .origin-note]
    TEST[test/expenses.test.js]
    UTILS[public/js/utils.js<br/>escapeHtml / formatDateDisplay]

    HTML -->|"origin-note, modal-subtitle,<br/>field-amount markup"| JS
    JS -->|"renders badge + origin note,<br/>uses for escaping/formatting"| UTILS
    JS -->|"persists lastEditedBy,<br/>preserves loggedBy"| HTML
    TEST -->|"loads index.html,<br/>drives JS, asserts DOM"| HTML
    TEST --> JS
    CSS -.->|"styles new elements"| HTML

    classDef touched fill:#f96,color:#000
    class HTML,JS,CSS,TEST touched
  ```
review_focus: |
  In scope: making the existing (already-functional) cross-person edit flow match the approved
  design's data model and copy — preserving `loggedBy`, adding `lastEditedBy` + its "Edited by"
  badge, the modal's origin note, the amount-field markup, and the save-failure copy. Out of
  scope: any delete functionality (explicitly excluded by the story), any backend/API work, and
  the design's demo-only affordances (simulate-failure checkbox, reset-demo-data link). The
  riskiest part is the `loggedBy`/`lastEditedBy` behavior change in the submit handler — it's a
  deliberate reversal of the currently-shipped "editing re-attributes loggedBy" behavior, backed
  by the approved design, not a regression; the rewritten test in `test/expenses.test.js` (the
  former "AC7/AC8" test) is the one a reviewer should check carefully against the design's own
  script (lines 1127-1157) rather than assume the old test's expectations were correct.
