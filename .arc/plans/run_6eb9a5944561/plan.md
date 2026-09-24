summary: |
  Add a Delete action to each row of the Expenses table in the production app
  (`public/index.html` + `public/js/expenses.js` + `public/css/expenses.css`), following the
  exact interaction already built and approved in the delete-flow prototype
  (`.arc/designs/TEST-M1-STORY-093-design.html`): clicking "Delete" on a row opens a
  confirmation modal naming the record about to be removed; confirming removes the row
  immediately, persists the removal to `localStorage`, and shows a success toast; cancelling
  (Cancel button, ×, backdrop, or Esc) leaves the record untouched; a `localStorage` write
  failure on confirm shows an error toast and leaves the record in the table; and deleting the
  last remaining expense replaces the table with the existing empty-state pattern (icon + "No
  expenses yet" + body copy + a "+ Add expense" action button), reusing the already-shipped
  Create Expense modal for that button instead of leaving it disabled the way the isolated
  prototype fixture did. The implementation mirrors the existing Edit/Create modal code already
  in `public/js/expenses.js` (same `setTimeout(…, 350)` simulated-latency pattern, same
  `persistExpenses`/`showToast` helpers) rather than introducing new patterns.

scope:
  - description: |
      Add a delete confirmation modal to `public/index.html`, positioned after the existing
      create modal block and before the toast, following the same two-button
      `.modal-overlay`/`.modal-wrap`/`.modal-panel` structure already used by the edit and
      create modals (those primitives are shared, defined in
      `design-system/prototype-utils.css`, so no new modal-chrome CSS is needed):

      ```html
      <div class="modal-overlay" id="delete-modal-overlay" hidden></div>
      <div class="modal-wrap" id="delete-modal-wrap" role="dialog" aria-modal="true" aria-labelledby="delete-modal-title" hidden>
        <div class="modal-panel">
          <div class="modal-header">
            <div>
              <h2 id="delete-modal-title">Delete expense?</h2>
              <p id="delete-modal-desc">This will permanently remove the record below. This can't be undone.</p>
            </div>
            <button class="icon-btn" id="delete-modal-close-btn" type="button" aria-label="Close dialog without deleting">✕</button>
          </div>
          <div class="delete-summary" id="delete-confirm-summary"></div>
          <div class="modal-actions">
            <button type="button" class="btn btn-secondary" id="delete-modal-cancel-btn">Cancel</button>
            <button type="button" class="btn btn-primary" id="confirm-delete-btn">Delete expense</button>
          </div>
        </div>
      </div>
      ```

      This is a direct production port of the modal in the approved prototype (design lines
      616-637: `#modal-overlay`/`#modal-wrap`/`#modal-title`/`#modal-desc`/
      `#confirm-record-summary`/`#modal-cancel-btn`/`#confirm-delete-btn`), renamed with a
      `delete-` prefix because `public/index.html` already has an edit modal using the
      unprefixed `#modal-overlay`/`#modal-wrap`/`#modal-cancel-btn` ids — the prototype was a
      single-story fixture with no edit modal to collide with, production has three modals
      coexisting on one page.
    files:
      - public/index.html
    rationale: |
      AC1 requires a confirmation prompt before deletion proceeds; this is the dialog. Reusing
      the shared `.modal-overlay`/`.modal-wrap`/`.modal-panel`/`.modal-header`/`.icon-btn`/
      `.modal-actions` classes (already relied on by the edit/create modals in this same file)
      keeps focus-ring, sizing, and token usage consistent for free — no new CSS needed for the
      dialog chrome itself.

  - description: |
      In `public/index.html`, wrap the existing `.card.table-card` (the expense table) in a new
      `<div id="list-wrap">`, and add a sibling empty-state block, hidden by default, directly
      below it:

      ```html
      <div id="empty-wrap" class="empty-state" role="status" hidden>
        <svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
          <rect x="4" y="3" width="16" height="18" rx="2"></rect>
          <path d="M8 8h8M8 12h8M8 16h5"></path>
        </svg>
        <h2 class="empty-state-title">No expenses yet</h2>
        <p class="empty-state-body">Every expense has been deleted. Add a new one to start tracking your spending again.</p>
        <button type="button" class="btn btn-primary" id="empty-add-btn">+ Add expense</button>
      </div>
      ```

      This is a direct port of the prototype's `#empty-wrap` (design lines 604-613), with one
      deliberate deviation called out in `assumptions_or_open_questions`: the prototype's
      `#empty-add-btn` is `disabled` with an explanatory `title`, because that isolated
      prototype had no create-expense modal to wire it to. Production already shipped Create
      Expense (TEST-M1-STORY-091), so here the button is left enabled and wired to the existing
      `openCreateModal()` in the next scope item.
    files:
      - public/index.html
    rationale: |
      AC7 and AC8 require the empty-state message and its action button to be displayed once
      the last expense is removed. The existing production code's current handling of "zero
      expenses" (a plain `<tr class="empty-row"><td colspan="5">No expenses yet.</td></tr>`
      inside the table body, see `public/js/expenses.js` lines 104-110) has no icon, no body
      copy, and — critically for AC8 — no action button at all, so it does not satisfy the ACs.
      The prototype's fuller `#empty-wrap` treatment (icon + title + body + button) is what was
      actually approved, so production is being brought in line with it rather than kept as-is.
      This does not affect the *filtered*-to-nothing case (`.no-match-row`, AC5 of the sibling
      Filter story), which stays inside the table body and is untouched — confirmed no existing
      test binds `.empty-row` to appearing when all expenses are deleted, only that it must NOT
      appear on a filter-produced no-match (`expenses-filter.test.js:60`).

  - description: |
      In `public/js/expenses.js`, add a "Delete" button next to "Edit" in each row's
      `col-actions` cell inside `renderList`, wrapped in a new flex container for spacing
      between the two touch targets:

      ```html
      <td class="col-actions">
        <div class="row-actions">
          <button class="btn btn-secondary btn-sm" type="button" data-edit-id="${exp.id}">Edit</button>
          <button class="btn btn-secondary btn-sm" type="button" data-delete-id="${exp.id}">Delete</button>
        </div>
      </td>
      ```

      and wire it right after the existing `data-edit-id` wiring:

      ```js
      tbody.querySelectorAll('[data-delete-id]').forEach((btn) => {
        btn.addEventListener('click', () => openDeleteModal(btn.getAttribute('data-delete-id')));
      });
      ```

      This matches the exact `data-delete-id="${exp.id}"` button the prototype already renders
      per row (design line 861).
    files:
      - public/js/expenses.js
      - public/css/expenses.css
    rationale: |
      AC1's trigger is the row's delete action. `.row-actions { display: flex; justify-content:
      flex-end; gap: var(--space-2); }` (added to `public/css/expenses.css`) gives the two
      buttons spacing per UI guideline §1 ("touch targets ... spacing between them") — there was
      previously only one button per row so no gap rule existed. Note: `.btn-sm` already sets
      `min-height: 0`, overriding the shared `.btn, .input { min-height: 44px; }` rule, so the
      Edit button was already below the 44px touch-target guideline before this story; Delete
      inherits the same pre-existing sizing rather than this plan silently fixing (or
      inconsistently deviating from) that unrelated gap.

  - description: |
      In `public/js/expenses.js`, inside `initExpensesApp`, add the delete-modal open/close/
      cancel functions and wire the empty-state's "Add expense" button, mirroring the existing
      edit-modal functions one-for-one (same `doc.addEventListener('keydown', ...)` / Esc /
      overlay-click-to-cancel pattern as `openEditModal`/`closeModal`/`cancelEdit`/
      `onModalKeydown`, not the create modal's extra tab-trap — the confirm-style dialog is
      closer in shape to edit's than to the longer create form):

      ```js
      const listWrap = doc.getElementById('list-wrap');
      const emptyWrap = doc.getElementById('empty-wrap');

      const deleteOverlay = doc.getElementById('delete-modal-overlay');
      const deleteModalWrap = doc.getElementById('delete-modal-wrap');
      const deleteConfirmBtn = doc.getElementById('confirm-delete-btn');
      const deleteSummaryEl = doc.getElementById('delete-confirm-summary');
      let pendingDeleteId = null;

      function openDeleteModal(id) {
        const exp = expenses.find((e) => e.id === id);
        if (!exp) return;
        pendingDeleteId = id;

        deleteSummaryEl.innerHTML = `
          <p style="margin:0;color:var(--color-fg);">
            ${escapeHtml(doc, formatDateDisplay(exp.date))} &middot; ${escapeHtml(doc, exp.category)}<br>
            ${escapeHtml(doc, exp.description) || '—'}<br>
            <strong>${formatUSD(exp.amount)}</strong>
          </p>
        `;

        deleteOverlay.hidden = false;
        deleteModalWrap.hidden = false;
        doc.addEventListener('keydown', onDeleteModalKeydown);
        deleteConfirmBtn.focus();
      }

      function closeDeleteModal() {
        deleteOverlay.hidden = true;
        deleteModalWrap.hidden = true;
        pendingDeleteId = null;
        deleteConfirmBtn.disabled = false;
        deleteConfirmBtn.textContent = 'Delete expense';
        doc.removeEventListener('keydown', onDeleteModalKeydown);
      }

      function onDeleteModalKeydown(e) {
        if (e.key === 'Escape') {
          e.preventDefault();
          cancelDelete();
        }
      }

      function cancelDelete() {
        closeDeleteModal();
      }

      doc.getElementById('delete-modal-close-btn').addEventListener('click', cancelDelete);
      doc.getElementById('delete-modal-cancel-btn').addEventListener('click', cancelDelete);
      deleteOverlay.addEventListener('click', cancelDelete);
      doc.getElementById('empty-add-btn').addEventListener('click', openCreateModal);

      deleteConfirmBtn.addEventListener('click', () => {
        const targetId = pendingDeleteId;
        if (!targetId) return;

        deleteConfirmBtn.disabled = true;
        deleteConfirmBtn.textContent = 'Deleting…';

        setTimeout(() => {
          const idx = expenses.findIndex((e) => e.id === targetId);
          if (idx === -1) { closeDeleteModal(); return; }

          try {
            persistExpenses([...expenses.slice(0, idx), ...expenses.slice(idx + 1)]);
          } catch (err) {
            closeDeleteModal();
            showToast('error', "Couldn't delete expense — please try again.");
            return;
          }
          expenses = [...expenses.slice(0, idx), ...expenses.slice(idx + 1)];
          closeDeleteModal();
          applyFiltersAndRender();
          showToast('success', 'Expense deleted');
        }, 350);
      });
      ```

      `renderList` gets the empty-state toggle at its top, replacing the current
      `expenses.length === 0` branch (current code, `public/js/expenses.js` lines 104-110):

      ```js
      function renderList(list) {
        const tbody = doc.getElementById('expense-tbody');
        tbody.innerHTML = '';

        if (expenses.length === 0) {
          listWrap.hidden = true;
          emptyWrap.hidden = false;
          return;
        }
        listWrap.hidden = false;
        emptyWrap.hidden = true;

        if (list.length === 0) {
          // ...existing .no-match-row branch, unchanged...
        }
        // ...existing per-row loop, unchanged...
      }
      ```
    files:
      - public/js/expenses.js
    rationale: |
      This is the core delete flow: AC1 (open + name the record via `deleteSummaryEl`), AC2/AC3
      (success path removes the row and shows the success toast), AC4 (Cancel/×/backdrop/Esc all
      route through `cancelDelete` → `closeDeleteModal`, doing nothing to `expenses` or
      storage), AC5/AC6 (a `persistExpenses` throw is caught, the in-memory `expenses` array is
      never mutated, and an error toast is shown instead), and AC7/AC8 (once `expenses.length`
      reaches 0, `renderList` swaps to the empty state, whose button now opens the real create
      modal). Naming (`deleteOverlay`, `deleteModalWrap`, `closeDeleteModal`, `cancelDelete`)
      avoids colliding with the edit modal's existing `overlay`/`modalWrap`/`closeModal`/
      `cancelEdit` identifiers in the same function scope.

  - description: |
      In `public/js/expenses.js`, record which toast variant is active so CSS can style it, and
      add the corresponding rule to `public/css/expenses.css`:

      ```js
      function showToast(kind, message) {
        doc.getElementById('toast-icon').textContent = kind === 'error' ? '⚠' : '✓';
        toastMessage.textContent = message;
        toast.dataset.variant = kind;
        toast.hidden = false;
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => { toast.hidden = true; }, 3000);
      }
      ```

      ```css
      /* Toast error variant — same design-system gap noted above for field errors (no
         dedicated danger token yet): signalled with icon + wording + a heavier border,
         never color alone. */
      .toast[data-variant="error"] { border-left-color: var(--color-fg); }
      ```
    files:
      - public/js/expenses.js
      - public/css/expenses.css
    rationale: |
      The approved prototype gives its error toast a visibly different left border from the
      success toast (design line 451: `.toast[data-variant="error"] { border-left-color:
      var(--color-fg); }`), on top of the existing icon + wording distinction. `showToast` is
      shared by the edit, create, and (now) delete flows, so this one change brings all three
      error toasts up to the approved visual, not just delete's — there is no reason for
      delete's error toast to look different from edit's/create's.

  - description: |
      Add `.empty-state`, `.empty-state-icon`, `.empty-state-title`, `.empty-state-body`, and
      `.delete-summary` to `public/css/expenses.css`, using the same token values the prototype
      used for its equivalent classes (design lines 419-445 for `.empty-state*`; the record
      summary box mirrors the prototype's `.ref-modal-mini`, design lines 490-495, renamed since
      "ref-*" was a reviewer-reference-screen naming convention that doesn't belong in
      production):

      ```css
      .empty-state {
        text-align: center;
        padding: var(--space-4) var(--space-3);
        background: var(--card-default-background);
        border: 1px solid var(--card-default-border);
        border-radius: var(--card-default-radius);
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
      .delete-summary {
        background: var(--color-bg);
        border: 1px solid var(--card-default-border);
        border-radius: var(--radius-md);
        padding: var(--space-3);
        margin-bottom: var(--space-4);
      }
      ```

      Neither `.empty-state*` nor a summary-box class exists today in
      `design-system/prototype-utils.css` (confirmed by reading it) — both were page-local
      additions in the prototype's own `<style>` block, so they belong in
      `public/css/expenses.css` alongside this page's other page-local classes (`.no-match*`,
      `.filter-bar`, etc.), not in the shared design-system file.
    files:
      - public/css/expenses.css
    rationale: |
      Supports the two scope items above (empty state markup and delete-modal summary markup)
      with the exact token-only styling the approved design used — no hardcoded colors/spacing,
      per UI guideline §0/§2.

  - description: |
      Add `test/expenses-delete.test.js`, following the exact `beforeEach`/fake-timers structure
      already used by `test/expenses.test.js` and `test/expenses-create.test.js` (read
      `public/index.html` into `document.documentElement.innerHTML`, `require` and call
      `initExpensesApp(document)`, `jest.useFakeTimers()`/`jest.useRealTimers()`).
    files:
      - test/expenses-delete.test.js
    rationale: |
      One failing-test-first file per the sibling Edit/Create/Filter stories' convention,
      exercising all 9 ACs against the real production DOM and code path (no prototype-only
      fixture involved).

tests:
  - |
    AC1 — activating Delete on a row shows a confirmation prompt that names that record:
    ```js
    document.querySelector('[data-delete-id="exp_002"]').click();
    expect(document.getElementById('delete-modal-wrap').hidden).toBe(false);
    expect(document.getElementById('delete-confirm-summary').textContent).toMatch(/Team lunch — Q3 kickoff/);
    ```
  - |
    AC2 — confirming deletion removes the row from the table immediately:
    ```js
    document.querySelector('[data-delete-id="exp_002"]').click();
    document.getElementById('confirm-delete-btn').click();
    jest.advanceTimersByTime(350);
    expect(document.querySelector('[data-delete-id="exp_002"]')).toBeNull();
    ```
  - |
    AC3 — confirming deletion shows a success toast:
    ```js
    document.querySelector('[data-delete-id="exp_002"]').click();
    document.getElementById('confirm-delete-btn').click();
    jest.advanceTimersByTime(350);
    expect(document.getElementById('toast').hidden).toBe(false);
    expect(document.getElementById('toast-message').textContent).toBe('Expense deleted');
    ```
  - |
    AC4 — cancelling the confirmation prompt leaves the row in the table and storage untouched:
    ```js
    document.querySelector('[data-delete-id="exp_002"]').click();
    document.getElementById('delete-modal-cancel-btn').click();
    expect(document.getElementById('delete-modal-wrap').hidden).toBe(true);
    expect(document.querySelector('[data-delete-id="exp_002"]')).not.toBeNull();
    const stored = JSON.parse(localStorage.getItem('expenses'));
    expect(stored.some((e) => e.id === 'exp_002')).toBe(true);
    ```
  - |
    AC5 — a localStorage failure on confirm shows an error toast:
    ```js
    document.querySelector('[data-delete-id="exp_002"]').click();
    const setItemSpy = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    document.getElementById('confirm-delete-btn').click();
    jest.advanceTimersByTime(350);
    expect(document.getElementById('toast').hidden).toBe(false);
    expect(document.getElementById('toast-message').textContent).toMatch(/couldn.?t delete/i);
    setItemSpy.mockRestore();
    ```
  - |
    AC6 — that same localStorage failure keeps the row in the table:
    ```js
    document.querySelector('[data-delete-id="exp_002"]').click();
    const setItemSpy = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    document.getElementById('confirm-delete-btn').click();
    jest.advanceTimersByTime(350);
    expect(document.querySelector('[data-delete-id="exp_002"]')).not.toBeNull();
    setItemSpy.mockRestore();
    const stored = JSON.parse(localStorage.getItem('expenses'));
    expect(stored.some((e) => e.id === 'exp_002')).toBe(true);
    ```
  - |
    AC7 — deleting the last remaining expense displays the empty-state message:
    ```js
    ['exp_001', 'exp_002', 'exp_003'].forEach((id) => {
      document.querySelector(`[data-delete-id="${id}"]`).click();
      document.getElementById('confirm-delete-btn').click();
      jest.advanceTimersByTime(350);
    });
    expect(document.getElementById('list-wrap').hidden).toBe(true);
    expect(document.getElementById('empty-wrap').hidden).toBe(false);
    expect(document.getElementById('empty-wrap').textContent).toMatch(/No expenses yet/);
    ```
  - |
    AC8 — deleting the last remaining expense also displays the empty-state action button:
    ```js
    ['exp_001', 'exp_002', 'exp_003'].forEach((id) => {
      document.querySelector(`[data-delete-id="${id}"]`).click();
      document.getElementById('confirm-delete-btn').click();
      jest.advanceTimersByTime(350);
    });
    const addBtn = document.getElementById('empty-add-btn');
    expect(addBtn).not.toBeNull();
    expect(addBtn.closest('[hidden]')).toBeNull();
    ```
  - |
    AC9 — a deleted expense is no longer present after the page is reloaded:
    ```js
    document.querySelector('[data-delete-id="exp_002"]').click();
    document.getElementById('confirm-delete-btn').click();
    jest.advanceTimersByTime(350);

    jest.resetModules();
    document.documentElement.innerHTML = fs.readFileSync(HTML_PATH, 'utf8');
    const { initExpensesApp: reinit } = require('../public/js/expenses');
    reinit(document);

    expect(document.querySelector('[data-delete-id="exp_002"]')).toBeNull();
    expect(document.querySelectorAll('#expense-tbody tr').length).toBe(2);
    ```

assumptions_or_open_questions:
  - |
    The prototype's empty-state "+ Add expense" button (`#empty-add-btn`) is `disabled` with a
    title explaining that create was out of scope for that isolated fixture. Production already
    has Create Expense (TEST-M1-STORY-091) shipped, so this plan wires the button to the real
    `openCreateModal()` instead of leaving it disabled — a deliberate deviation from the literal
    prototype markup, made because the constraint that produced the prototype's disabled state
    no longer applies in production. Flagging explicitly per the instruction to surface any
    prototype/AC conflict rather than silently picking one; AC8 only requires the button be
    displayed, so leaving it disabled would also satisfy the letter of the AC, but a disabled
    dead-end button contradicts UI guideline §5 ("empty = an invitation to act, not a dead end").
  - |
    The prototype's own fixture data (`test-m1-story-093-expenses`, 5 rows) and its "Simulate
    delete failure" checkbox are demo-only scaffolding for standalone review; they are not
    ported. Production already has its own `expenses` storage key and 3-row `INITIAL_EXPENSES`
    fixture (shared with the Edit/Create/Filter stories), and localStorage-failure is simulated
    in tests the same way the existing Edit/Create tests already do it — via
    `jest.spyOn(Storage.prototype, 'setItem')` — not via a UI toggle.
  - |
    The delete confirmation modal's keyboard/dismiss behavior is implemented to match the
    existing Edit modal (Esc key + overlay-click both cancel, no focus trap), not the Create
    modal (which adds a tab-trap for its longer form). Neither the ACs nor the prototype specify
    a focus trap for this confirm-style dialog, and Edit is the closer precedent in shape and
    button count.
  - |
    Row-level Delete button sizing inherits the pre-existing `.btn-sm { min-height: 0; }`
    override already used by the Edit button, which sits below the 44px touch-target guideline.
    This plan does not change that pre-existing sizing — only adds `.row-actions` for spacing
    between the two buttons — since resizing existing row actions is outside this story's scope.

package_dependencies: []

notes: |
  Read `.arc/designs/TEST-M1-STORY-093-design.html` in full before writing this plan — it is the
  only record of the approved design (there is no separate structured design doc). All markup,
  copy, ids, and CSS values referenced above (`#delete-modal-*`, `#confirm-delete-btn`,
  `#empty-wrap`/`#list-wrap`, `.empty-state*`, `data-variant="error"`, the exact toast copy
  "Expense deleted" / "Couldn't delete expense — please try again.") are taken directly from
  that file's interactive "Expense List" screen (lines 559-643) and its "Reference States" screen
  (lines 655-786), not invented.

  Also read the current production files this plan touches
  (`public/index.html`, `public/js/expenses.js`, `public/css/expenses.css`,
  `design-system/prototype-utils.css`) and the three existing test files
  (`test/expenses.test.js`, `test/expenses-create.test.js`, `test/expenses-filter.test.js`) to
  confirm every id/class/function this plan reuses or extends still exists under those exact
  names, and that none of the new markup collides with the edit/create modals already on the
  page.

  ```mermaid
  flowchart TD
    HTML[public/index.html]
    JS[public/js/expenses.js]
    CSS[public/css/expenses.css]
    UTILS[public/js/utils.js]
    PROTO[design-system/prototype-utils.css]
    LS[(localStorage)]
    TEST[test/expenses-delete.test.js]

    HTML -- "delete modal + empty-state markup" --> JS
    JS -- "escapeHtml, formatDateDisplay" --> UTILS
    JS -- "persistExpenses / loadExpenses" --> LS
    CSS -- "styles .empty-state*, .row-actions, .delete-summary, toast[data-variant]" --> HTML
    PROTO -- "shared .modal-overlay/.modal-wrap/.modal-panel/.toast chrome" --> HTML
    TEST -- "reads HTML, requires + drives JS" --> HTML
    TEST --> JS

    classDef touched fill:#f96,color:#000
    class HTML,JS,CSS,TEST touched
  ```
