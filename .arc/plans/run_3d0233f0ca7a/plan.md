summary: |
  Add a Delete action to each row of the expense table so a user can permanently remove an
  expense from the list and from `localStorage`. The work extends the already-shipped Edit
  flow in `public/js/expenses.js` / `public/index.html` (from TEST-M1-STORY-032) with a second,
  distinctly-id'd confirmation modal (per the approved prototype at
  `.arc/designs/TEST-M1-STORY-093-design.html`), a shared toast that can render a success or
  error variant, and a full empty-state card (icon + title + body + a disabled "+ Add expense"
  placeholder button, since Add Expense is a separate, not-yet-built story) that replaces the
  current plain "No expenses yet." table row once the list is empty. All persistence is
  client-side `localStorage`, matching the existing Edit implementation's pattern exactly
  (optimistic UI update guarded by a try/catch around the write, ~350ms simulated latency,
  toast feedback either way).
scope:
  - description: |
      Wrap the existing populated-list markup in `#list-wrap` and add a new `#empty-wrap`
      empty-state card to `public/index.html`, mirroring the design's "State: empty" block
      (`.arc/designs/TEST-M1-STORY-093-design.html` lines 604–613): the same rect+lines SVG
      icon, `<h2 class="empty-state-title">No expenses yet</h2>`, and body copy "Every expense
      has been deleted. Add a new one to start tracking your spending again." The design's
      `+ Add expense` button is disabled with a tooltip explaining it belongs to a separate
      prototype; in production code that tooltip text doesn't apply, so it becomes:
      `title="Add Expense is not available yet"` on `<button id="empty-add-btn" class="btn
      btn-primary" disabled>+ Add expense</button>`. This element is a placeholder only — no
      click handler — since building Add Expense is out of scope for this story (AC8 only
      requires the button be *displayed*).
    files:
      - public/index.html
    rationale: |
      AC7/AC8 require an empty-state message AND an action button once the last expense is
      removed. The design is the only record of what that empty state looks like, so its exact
      icon/copy/button are load-bearing, not a guess. This also removes the only other
      candidate for "empty" handling in production code today — the old `.empty-row` branch in
      `renderList()` (`public/js/expenses.js` lines 66–72), which just prints "No expenses
      yet." inside a table row and has no action button — so it is replaced rather than kept
      alongside a second, conflicting empty treatment.
  - description: |
      Add a second confirmation-modal block to `public/index.html`, structurally identical to
      the design's modal (lines 616–637) but with IDs renamed to avoid colliding with the
      existing Edit modal's `#modal-overlay` / `#modal-wrap` / `#modal-close-btn` /
      `#modal-cancel-btn` (already used by the Edit flow shipped in STORY-032):
      `#delete-modal-overlay`, `#delete-modal-wrap`, `#delete-modal-title`,
      `#delete-modal-desc`, `#delete-modal-close-btn`, `#delete-summary` (holds the
      about-to-be-deleted record's date/category/description/amount, filled by JS),
      `#delete-modal-cancel-btn`, `#confirm-delete-btn`. Copy is taken verbatim from the
      design: title "Delete expense?", body "This will permanently remove the record below.
      This can't be undone.", buttons "Cancel" / "Delete expense". Reuses the shared
      `.modal-overlay` / `.modal-wrap` / `.modal-panel` / `.modal-header` / `.icon-btn` /
      `.modal-actions` classes already defined in `design-system/prototype-utils.css` (linked
      by `index.html`), so no new modal-shell CSS is needed.
    files:
      - public/index.html
    rationale: |
      AC1 requires a confirmation prompt naming the specific expense before any deletion
      proceeds. The design's IDs can't be reused as-is because the current production
      `index.html` already has a live Edit modal using those same IDs — this is a genuine
      conflict between the standalone prototype (which only ever shows one modal at a time)
      and the real page (which now needs two). Renaming only the delete modal's IDs preserves
      the design's exact layout/copy/component classes while avoiding a DOM-id collision.
  - description: |
      Add a `#toast-icon` span inside the existing `#toast` element in `public/index.html`
      (currently a hardcoded "✓"), so JS can swap it to "⚠" for the error-toast case, matching
      the design's toast markup (lines 639–642).
    files:
      - public/index.html
    rationale: |
      AC5 requires an error toast distinct from the success toast. Per UI guideline §3
      ("never encode meaning in color alone") and the design's own gap note (no semantic
      danger color token exists yet — `.arc/designs/TEST-M1-STORY-093-design.html` lines
      337–345), the error toast is distinguished by icon + wording + a border-color tweak, not
      color alone, so the icon needs to be a targetable element rather than static text.
  - description: |
      Add empty-state CSS (`.empty-state`, `.empty-state-icon`, `.empty-state-title`,
      `.empty-state-body`), a `.delete-summary` box style (mirrors the design's
      `.ref-modal-mini`: `background: var(--color-bg); border: 1px solid
      var(--card-default-border); border-radius: var(--radius-md); padding: var(--space-3);`
      — this class doesn't exist in the shared `design-system/prototype-utils.css`, only in
      the design's page-local styles), the error-toast border rule
      `.toast[data-variant="error"] { border-left-color: var(--color-fg); }`, and a small
      spacing rule between the new Delete button and the existing Edit button in each row's
      actions cell (`.col-actions .btn + .btn { margin-left: var(--space-2); }`) to
      `public/css/expenses.css`.
    files:
      - public/css/expenses.css
    rationale: |
      All four rules come straight from the approved design (lines 337–345, 418–450) except
      the last, which is a UI-guideline requirement (§1: "Touch targets ≥44×44px; spacing
      between them") not shown in the design because its rows only ever had one action button
      at a time (Edit-only in STORY-032, Delete-only in this prototype) — production rows now
      need both side by side.
  - description: |
      In `public/js/expenses.js`: add a `Delete` button per row in `renderList()`
      (`<button class="btn btn-secondary btn-sm" type="button"
      data-delete-id="${exp.id}">Delete</button>`, appended next to the existing Edit button
      inside `.col-actions`); toggle `#list-wrap`/`#empty-wrap` visibility based on
      `expenses.length` at the top of `renderList()` (replacing the old `.empty-row` branch);
      wire `[data-delete-id]` buttons to a new `openDeleteModal(id)`.
    files:
      - public/js/expenses.js
    rationale: |
      Mirrors the existing `[data-edit-id]` wiring pattern already in `renderList()`
      (`public/js/expenses.js` lines 74–93) for consistency, and is the minimal change needed
      to expose the delete action and drive the new empty-state toggle from the same render
      pass that already owns the table body.
  - description: |
      Add `openDeleteModal(id)`, `closeDeleteModal()`, `cancelDelete()`, and
      `onDeleteModalKeydown(e)` to `public/js/expenses.js`, following the same shape as the
      existing `openEditModal` / `closeModal` / `cancelEdit` / `onModalKeydown` quartet (lines
      108–144), but targeting the new `#delete-modal-*` elements and populating `#delete-summary`
      with the target record's formatted date/category/description/amount so AC1's prompt names
      the specific expense. `openDeleteModal` sets a new `pendingDeleteId` module-level variable
      (parallel to the existing `editingId`) and focuses `#confirm-delete-btn` on open, matching
      the design's own script (`confirmBtn.focus()`), i.e. the primary/destructive action is
      given default focus, same as the approved prototype. Wire `#delete-modal-close-btn`,
      `#delete-modal-cancel-btn`, and a click on `#delete-modal-overlay` to `cancelDelete()`,
      which does not remove the row or show a toast (AC4).
    files:
      - public/js/expenses.js
    rationale: |
      Satisfies AC1 (named confirmation prompt) and AC4 (cancel leaves the record untouched,
      with no toast) using the same interaction shell already proven for Edit, so keyboard
      (Esc), backdrop-click, and close-button behavior stay consistent across both modals in
      the app.
  - description: |
      Add the `#confirm-delete-btn` click handler in `public/js/expenses.js`: disable the
      button and set its label to "Deleting…" (mirrors the existing Save button's "Saving…"
      pattern), then after a simulated 350ms latency (`setTimeout`, matching the existing edit
      flow's timing) look up the target record, build `remaining` as `expenses` with that
      record spliced out, and attempt `persistExpenses(remaining)` inside a `try/catch`:
        - success: `expenses = remaining; closeDeleteModal(); renderList();
          showToast('Expense deleted', 'success');`
        - failure: `closeDeleteModal(); showToast("Expense could not be deleted — please try
          again", 'error');` — `expenses` is left unmodified and `renderList()` is NOT called,
          so the row stays exactly where it was.
    files:
      - public/js/expenses.js
    rationale: |
      Directly satisfies AC2 (immediate removal), AC3 (success toast), AC5 (error toast on a
      failed write), and AC6 (record remains on failure). The try/catch-around-`persistExpenses`
      shape is identical to the existing Edit-save handler (`public/js/expenses.js` lines
      194–205), which already has a passing test for the equivalent failure path
      (`test/expenses.test.js` line 125), so this plan reuses a pattern already validated in
      this codebase rather than inventing a new one.
  - description: |
      Update `showToast` in `public/js/expenses.js` from `showToast(message)` to
      `showToast(message, variant = 'success')`. On call it sets
      `toastMessage.textContent = message`, `toast.dataset.variant = variant`,
      `toastIcon.textContent = variant === 'error' ? '⚠' : '✓'`, and
      `toast.setAttribute('role', variant === 'error' ? 'alert' : 'status')` /
      `toast.setAttribute('aria-live', variant === 'error' ? 'assertive' : 'polite')`. Update
      the two existing Edit-flow call sites (`showToast('Expense updated')` and
      `showToast('Expense could not be saved — please try again')`) to pass `'success'` and
      `'error'` explicitly so both flows go through the same variant-aware path.
    files:
      - public/js/expenses.js
    rationale: |
      One shared toast element serves both the Edit and Delete flows; the delete-failure case
      (AC5) needs a visibly and programmatically distinct error toast per UI guideline §3
      ("never encode meaning in color alone" — icon + role change, not just a border-color
      swap), and making Edit's calls explicit at the same time avoids leaving one call site on
      an implicit default that a future reader has to reverse-engineer.
  - description: |
      Append a new `describe('Delete Expense', ...)` block to `test/expenses.test.js`, using
      the same `beforeEach` setup as the existing `describe('Edit Expense via Modal Form', ...)`
      block (reset modules/localStorage, load `public/index.html` into `document`, fake timers,
      call `initExpensesApp(document)`).
    files:
      - test/expenses.test.js
    rationale: |
      Keeps all client-side expense-page tests in one file, consistent with how Edit's tests
      are organized today, and lets Delete tests reuse the exact same DOM/localStorage fixture
      setup already proven to work against `public/index.html`.
tests:
  - |
    AC1 — clicking Delete opens a confirmation prompt naming the record:
    ```js
    document.querySelector('[data-delete-id="exp_001"]').click();
    expect(document.getElementById('delete-modal-wrap').hidden).toBe(false);
    expect(document.getElementById('delete-summary').textContent).toMatch(/Flight to Chicago client site/);
    ```
  - |
    AC2 — confirming deletion removes the row immediately:
    ```js
    document.querySelector('[data-delete-id="exp_001"]').click();
    document.getElementById('confirm-delete-btn').click();
    jest.advanceTimersByTime(350);
    expect(document.querySelector('[data-delete-id="exp_001"]')).toBeNull();
    ```
  - |
    AC3 — confirming deletion shows a success toast:
    ```js
    document.querySelector('[data-delete-id="exp_001"]').click();
    document.getElementById('confirm-delete-btn').click();
    jest.advanceTimersByTime(350);
    expect(document.getElementById('toast').hidden).toBe(false);
    expect(document.getElementById('toast-message').textContent).toBe('Expense deleted');
    ```
  - |
    AC4 — cancelling leaves the record in the table:
    ```js
    document.querySelector('[data-delete-id="exp_001"]').click();
    document.getElementById('delete-modal-cancel-btn').click();
    expect(document.querySelector('[data-delete-id="exp_001"]')).not.toBeNull();
    expect(JSON.parse(localStorage.getItem('expenses')).find((e) => e.id === 'exp_001')).toBeTruthy();
    ```
  - |
    AC5 — a localStorage failure on confirm shows an error toast:
    ```js
    const setItemSpy = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    document.querySelector('[data-delete-id="exp_001"]').click();
    document.getElementById('confirm-delete-btn').click();
    jest.advanceTimersByTime(350);
    expect(document.getElementById('toast-message').textContent).toMatch(/could not be deleted/i);
    expect(document.getElementById('toast').dataset.variant).toBe('error');
    setItemSpy.mockRestore();
    ```
  - |
    AC6 — that same localStorage failure leaves the record in the table:
    ```js
    const setItemSpy = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    document.querySelector('[data-delete-id="exp_001"]').click();
    document.getElementById('confirm-delete-btn').click();
    jest.advanceTimersByTime(350);
    expect(document.querySelector('[data-delete-id="exp_001"]')).not.toBeNull();
    setItemSpy.mockRestore();
    const stored = JSON.parse(localStorage.getItem('expenses'));
    expect(stored.some((e) => e.id === 'exp_001')).toBe(true);
    ```
  - |
    AC7 — deleting the last expense shows the empty-state message:
    ```js
    ['exp_001', 'exp_002', 'exp_003'].forEach((id) => {
      document.querySelector(`[data-delete-id="${id}"]`).click();
      document.getElementById('confirm-delete-btn').click();
      jest.advanceTimersByTime(350);
    });
    expect(document.getElementById('empty-wrap').hidden).toBe(false);
    expect(document.getElementById('list-wrap').hidden).toBe(true);
    expect(document.getElementById('empty-wrap').textContent).toMatch(/No expenses yet/);
    ```
  - |
    AC8 — deleting the last expense also shows the action button:
    ```js
    ['exp_001', 'exp_002', 'exp_003'].forEach((id) => {
      document.querySelector(`[data-delete-id="${id}"]`).click();
      document.getElementById('confirm-delete-btn').click();
      jest.advanceTimersByTime(350);
    });
    const addBtn = document.getElementById('empty-add-btn');
    expect(addBtn).not.toBeNull();
    expect(document.getElementById('empty-wrap').contains(addBtn)).toBe(true);
    expect(document.getElementById('empty-wrap').hidden).toBe(false);
    ```
  - |
    AC9 — a deleted expense is gone after reload (simulated by re-reading the same localStorage
    into a fresh DOM/module instance):
    ```js
    document.querySelector('[data-delete-id="exp_001"]').click();
    document.getElementById('confirm-delete-btn').click();
    jest.advanceTimersByTime(350);

    jest.resetModules();
    document.documentElement.innerHTML = fs.readFileSync(HTML_PATH, 'utf8');
    const { initExpensesApp: reinit } = require('../public/js/expenses');
    reinit(document);

    expect(document.querySelector('[data-delete-id="exp_001"]')).toBeNull();
    expect(JSON.parse(localStorage.getItem('expenses')).some((e) => e.id === 'exp_001')).toBe(false);
    ```
assumptions_or_open_questions:
  - |
    The repo currently contains two parallel, non-interoperating expense-list implementations:
    `public/js/expenses.js` (wired into `public/index.html`, has the Edit flow from
    TEST-M1-STORY-032, and is what this plan builds on) and an older orphaned set
    (`public/app.js` + `public/storage.js` + `public/currency.js` + `public/validation.js`,
    covered only by the separate `test/app.test.js` and not referenced by `index.html` at all
    — see the `TODO(rebase)` comment at the top of `public/index.html`). This plan treats the
    orphaned set as pre-existing repo drift, out of scope for TEST-M1-STORY-093, and does not
    touch it or its tests.
  - |
    AC7/AC8 only describe the empty state produced by deleting the last expense. This plan
    makes `#empty-wrap` a general `expenses.length === 0` condition (also covering "no
    expenses were ever seeded"), since that's the simplest correct reading of the design (its
    `renderList()` shows the same toggle unconditionally) and avoids maintaining two different
    empty-state branches for what is visually one state.
  - |
    The design's disabled "+ Add expense" button tooltip text ("Add Expense is a separate
    story — this prototype covers the delete flow only") is prototype-review commentary and
    was reworded for production to "Add Expense is not available yet" — the button's presence,
    label, disabled state, and position are otherwise taken as-is from the design.
  - |
    Per the design, `#confirm-delete-btn` (the destructive action) receives default focus when
    the modal opens, matching the prototype's own script exactly rather than substituting a
    safer default-to-Cancel pattern that isn't what was approved.
package_dependencies: []
notes: |
  No server/API work is involved — like Edit, Delete is entirely client-side against
  `localStorage`, so no changes are needed under `src/`.

  ```mermaid
  flowchart TD
    HTML[public/index.html]
    CSS[public/css/expenses.css]
    JS[public/js/expenses.js]
    LS[(localStorage)]
    TEST[test/expenses.test.js]

    HTML -->|"#list-wrap / #empty-wrap / #delete-modal-* / #toast-icon (new markup)"| JS
    JS -->|"renderList() reads/writes DOM"| HTML
    JS -->|"persistExpenses() / loadExpenses()"| LS
    CSS -->|".empty-state / .delete-summary / toast[data-variant] styling"| HTML
    TEST -->|"drives clicks, asserts DOM + localStorage"| JS

    classDef touched fill:#f96,color:#000
    class HTML,CSS,JS,TEST touched
  ```

  This mirrors the exact shape already used by the Edit flow (STORY-032): a module-level
  `expenses` array, a single modal open/close/cancel/keydown quartet per modal, a
  `setTimeout`-simulated write with a try/catch around `persistExpenses`, and toast feedback —
  Delete just adds a second modal and a variant-aware toast rather than a new architecture.
