summary: |
  Add a "Delete" action to the shared, client-side Expense Tracker list (public/index.html +
  public/js/expenses.js + public/css/expenses.css) so any staff member can permanently remove
  any expense with no ownership/date/status check, matching the approved
  TEST-M1-STORY-142-design.html prototype: a per-row "🗑 Delete" button opens a confirmation
  dialog naming the expense and its irreversible consequence, and confirming removes it from
  the single shared `expenses` array in localStorage immediately, with no per-viewer copy left
  behind. This reuses the exact modal/simulated-latency/error-toast state machine already
  shipped for the Edit and Create flows (TEST-M1-STORY-103/140) rather than inventing a new
  one, and adds a `.no-restriction-note` callout above the table stating the no-restriction
  policy explicitly, per the prototype.

scope:
  - description: |
      Add the delete-confirmation modal markup and the "no ownership, time, or status
      restriction" callout to `public/index.html`, copied from the approved prototype's
      Screen 1 (design file lines ~606-658):
        - A `.no-restriction-note` paragraph (icon `ⓘ` + copy exactly: "Any staff member can
          delete any expense here — there's no owner, date, or status check. You don't have
          to be the person who logged it.") placed directly above `.table-card`, between the
          page header/filter bar and the table.
        - `#delete-modal-overlay` / `#delete-modal-wrap` (own ids, distinct from the existing
          `#modal-overlay`/`#modal-wrap` edit modal and `#create-modal-overlay`/
          `#create-modal-wrap` create modal, so all three can coexist in the DOM) with:
          - `<h2 id="delete-modal-title">Delete this expense?</h2>` and subtitle
            "This removes it from the shared list for every staff member."
          - `#delete-modal-close-btn` (✕ icon button, `aria-label="Close dialog without deleting"`)
          - `<div class="confirm-summary" id="confirm-summary">` filled by JS with
            date · category · description · logged by · amount
          - `<p class="confirm-warning"><span class="warn-icon" aria-hidden="true">⚠</span>
            <span>This can't be undone. The expense will be removed immediately for everyone,
            no matter who logged it.</span></p>`
          - `.modal-actions` with `#delete-modal-cancel-btn` ("Cancel", `btn btn-secondary`) and
            `#delete-modal-delete-btn` ("🗑 Delete expense", `btn btn-danger`)
    files:
      - public/index.html
    rationale: |
      The prototype is the only record of this modal's copy, structure, and AC3 messaging.
      Reusing the existing `.modal-overlay`/`.modal-wrap`/`.modal-panel` primitives (already
      shared by the edit and create modals on this same page) keeps the new modal visually and
      structurally consistent without touching `design-system/prototype-utils.css`.

  - description: |
      In `public/js/expenses.js`, add the row-level Delete action and wire the confirmation
      modal:
        - In `renderList`, add inside each row's `.col-actions` cell, alongside the existing
          Edit button:
            <button class="row-delete-btn" type="button" data-delete-id="${exp.id}">🗑 Delete</button>
          Rendered identically and unconditionally for every row regardless of `loggedBy` or
          `date` — no gating logic of any kind (AC3).
        - Add `openDeleteModal(id)`, `closeDeleteModal()`, `cancelDelete()`, and
          `onDeleteModalKeydown(e)` mirroring the existing edit-modal functions at
          `public/js/expenses.js:188-224` (same open/close/Escape/backdrop-click pattern),
          populating `#confirm-summary` the same way `openEditModal` populates its fields.
        - Track `pendingDeleteId` and `deleteTimer` state (mirrors `editingId` state). On
          `#delete-modal-delete-btn` click:
            const targetId = pendingDeleteId;
            deleteModalDeleteBtn.disabled = true;
            deleteModalDeleteBtn.textContent = 'Deleting…';
            deleteTimer = setTimeout(() => {
              if (pendingDeleteId !== targetId) return; // cancelled before this fired
              let updated;
              try {
                updated = expenses.filter((e) => e.id !== targetId);
                persistExpenses(updated);
              } catch (err) {
                deleteModalDeleteBtn.disabled = false;
                deleteModalDeleteBtn.textContent = '🗑 Delete expense';
                showToast('error', "Couldn't delete expense — please try again");
                return;
              }
              expenses = updated;
              closeDeleteModal();
              applyFiltersAndRender();
              showToast('success', 'Expense deleted');
            }, 300);
          This is the same race-safety guard already used for the edit form's in-flight save
          (`editingId !== targetId` check near line 263), adapted to delete.
        - Export nothing new — `initExpensesApp` already exposes the rendered DOM for tests to
          drive via `data-delete-id` and the new modal ids.
    files:
      - public/js/expenses.js
    rationale: |
      Reuses the exact simulated-latency / in-flight-cancel-guard / error-toast state machine
      already proven correct for Edit (TEST-M1-STORY-103) and Create (TEST-M1-STORY-140) in
      this file, rather than introducing a second, subtly different pattern for Delete.

  - description: |
      Add the new component styles to `public/css/expenses.css`, copied from the approved
      prototype's inline `<style>` block (design file lines 337-493):
        - `.row-delete-btn` — inline-flex, `border: 1px solid var(--color-border)`,
          `border-radius: var(--radius-sm)`, `color: var(--color-fg)`, 44px `min-height`,
          hover/focus-visible switching border/color to `var(--color-primary)`.
        - `.btn-danger` — `background: var(--color-bg)`, `color: var(--color-fg)`,
          2px `border-color: var(--color-fg)`, hover switching to `var(--color-primary)`.
        - `.confirm-summary` — column flex, `background: var(--color-bg)`,
          `border: 1px solid var(--color-border)`, `border-radius: var(--radius-md)`, muted
          text with bold `strong`.
        - `.confirm-warning` — bold row of icon + text.
        - `.no-restriction-note` — `background: var(--color-surface)`,
          `border: 1px solid var(--color-primary)` with a `var(--space-1)`-wide left border,
          `border-radius: var(--radius-md)`.
        - `.row-removing` / `@keyframes flash-removed` (fade+dim the row on delete), disabled
          under `@media (prefers-reduced-motion: reduce)`.
        - A small `.row-actions` wrapper (`display: inline-flex; gap: var(--space-2);`) around
          the Edit + Delete buttons in `.col-actions`, since the prototype's Actions column only
          ever held one button and the shipped page now needs two side by side.
    files:
      - public/css/expenses.css
    rationale: |
      Matches the existing project convention of keeping expense-page-specific component CSS in
      `public/css/expenses.css` (see the existing `.row-updated`/`.row-added` flash-animation
      pairs) rather than the shared `design-system/prototype-utils.css`, and preserves the
      prototype's explicit choice to signal destructiveness via icon + bold label rather than a
      semantic danger color, since none exists in `design-system/tokens.json`.

  - description: |
      Add `test/expenses-delete.test.js`, mirroring the structure of the existing
      `test/expenses-create.test.js` and `test/expenses.test.js` (same `jsdom` environment,
      same `fs.readFileSync(HTML_PATH)` + `initExpensesApp(document)` setup, same
      `jest.useFakeTimers()` pattern).
    files:
      - test/expenses-delete.test.js
    rationale: ""

tests:
  - |
    Opening the confirmation dialog names the expense about to be deleted:
      test('clicking Delete on a row opens a confirmation dialog naming that expense', () => {
        document.querySelector('[data-delete-id="exp_002"]').click();
        expect(document.getElementById('delete-modal-wrap').hidden).toBe(false);
        expect(document.getElementById('confirm-summary').textContent).toMatch(/Team lunch/);
      });
  - |
    AC1 — confirming permanently removes the expense from the list and from storage:
      test('confirming delete permanently removes the expense from the list', () => {
        document.querySelector('[data-delete-id="exp_002"]').click();
        document.getElementById('delete-modal-delete-btn').click();
        jest.advanceTimersByTime(300);
        expect(document.querySelector('[data-delete-id="exp_002"]')).toBeNull();
        const stored = JSON.parse(localStorage.getItem('expenses'));
        expect(stored.some((e) => e.id === 'exp_002')).toBe(false);
      });
  - |
    AC2 — the deleted expense stays gone no matter which "Signed in as" viewer is showing,
    proving it isn't just hidden from the person who deleted it:
      test('a deleted expense stays gone for every staff member', () => {
        document.getElementById('viewer-select').value = 'Morgan Ellis';
        document.querySelector('[data-delete-id="exp_002"]').click();
        document.getElementById('delete-modal-delete-btn').click();
        jest.advanceTimersByTime(300);
        document.getElementById('viewer-select').value = 'Priya Shah';
        document.getElementById('viewer-select').dispatchEvent(new Event('change'));
        expect(document.querySelector('[data-delete-id="exp_002"]')).toBeNull();
      });
  - |
    AC3 — any staff member can delete an expense someone else logged, and every row's Delete
    action is unconditionally enabled (no ownership/date/status gate):
      test('any staff member can delete an expense logged by someone else', () => {
        document.getElementById('viewer-select').value = 'Devon Ruiz';
        document.querySelector('[data-delete-id="exp_001"]').click(); // logged by Morgan Ellis
        document.getElementById('delete-modal-delete-btn').click();
        jest.advanceTimersByTime(300);
        const stored = JSON.parse(localStorage.getItem('expenses'));
        expect(stored.some((e) => e.id === 'exp_001')).toBe(false);
      });
      test('every row exposes an enabled Delete action with no gating', () => {
        const deleteButtons = Array.from(document.querySelectorAll('[data-delete-id]'));
        expect(deleteButtons).toHaveLength(3);
        deleteButtons.forEach((btn) => expect(btn.disabled).toBe(false));
      });
  - |
    AC4 — the list updates immediately after confirming, with no page reload, and the dialog
    closes:
      test('the list updates immediately after confirming', () => {
        const before = document.querySelectorAll('#expense-tbody tr').length;
        document.querySelector('[data-delete-id="exp_003"]').click();
        document.getElementById('delete-modal-delete-btn').click();
        jest.advanceTimersByTime(300);
        expect(document.querySelectorAll('#expense-tbody tr').length).toBe(before - 1);
        expect(document.getElementById('delete-modal-wrap').hidden).toBe(true);
      });
  - |
    Cancel / close (✕) / Escape all dismiss the dialog with no change to the list (matches the
    prototype's stated dismissal affordances):
      test('cancelling the confirmation dialog deletes nothing', () => {
        document.querySelector('[data-delete-id="exp_001"]').click();
        document.getElementById('delete-modal-cancel-btn').click();
        expect(document.getElementById('delete-modal-wrap').hidden).toBe(true);
        expect(document.querySelector('[data-delete-id="exp_001"]')).not.toBeNull();
      });
      test('Escape dismisses the confirmation dialog without deleting', () => {
        document.querySelector('[data-delete-id="exp_001"]').click();
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        expect(document.getElementById('delete-modal-wrap').hidden).toBe(true);
        expect(document.querySelector('[data-delete-id="exp_001"]')).not.toBeNull();
      });
  - |
    A successful delete shows the exact success toast copy from the prototype, and deleting
    every row reveals the existing empty state:
      test('a successful delete shows a success toast', () => {
        document.querySelector('[data-delete-id="exp_001"]').click();
        document.getElementById('delete-modal-delete-btn').click();
        jest.advanceTimersByTime(300);
        expect(document.getElementById('toast-message').textContent).toBe('Expense deleted');
      });
      test('deleting every expense reveals the empty state', () => {
        ['exp_001', 'exp_002', 'exp_003'].forEach((id) => {
          document.querySelector(`[data-delete-id="${id}"]`).click();
          document.getElementById('delete-modal-delete-btn').click();
          jest.advanceTimersByTime(300);
        });
        expect(document.querySelector('.empty-row')).not.toBeNull();
      });
  - |
    Race safety: cancelling while a delete is in flight must not remove the record once the
    timer fires (mirrors the existing edit-form in-flight-cancel test at
    test/expenses.test.js:166-176):
      test('cancelling while a delete is in flight does not remove the expense', () => {
        document.querySelector('[data-delete-id="exp_001"]').click();
        document.getElementById('delete-modal-delete-btn').click();
        document.getElementById('delete-modal-cancel-btn').click();
        jest.advanceTimersByTime(300);
        const stored = JSON.parse(localStorage.getItem('expenses'));
        expect(stored.some((e) => e.id === 'exp_001')).toBe(true);
      });
  - |
    A localStorage failure on delete keeps the dialog open, re-enables the button, and shows an
    error toast (mirrors the existing edit/create error-toast tests):
      test('a localStorage failure on delete shows an error toast and keeps the dialog open', () => {
        document.querySelector('[data-delete-id="exp_001"]').click();
        const setItemSpy = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
          throw new Error('QuotaExceededError');
        });
        document.getElementById('delete-modal-delete-btn').click();
        jest.advanceTimersByTime(300);
        expect(document.getElementById('delete-modal-wrap').hidden).toBe(false);
        const deleteBtn = document.getElementById('delete-modal-delete-btn');
        expect(deleteBtn.disabled).toBe(false);
        expect(document.getElementById('toast-message').textContent).toMatch(/couldn.?t delete/i);
        setItemSpy.mockRestore();
      });
  - |
    The page states the no-restriction policy explicitly, per the approved design:
      test('the page states that any staff member can delete any expense with no restriction', () => {
        expect(document.querySelector('.no-restriction-note').textContent)
          .toMatch(/no owner, date, or status check/i);
      });

assumptions_or_open_questions:
  - |
    The prototype's Screen 1 does not include the "+ Log expense" button, the filter bar, or
    the edit modal that already exist on the shipped page (those were added by
    TEST-M1-STORY-140 and TEST-M1-STORY-103 after this delete prototype was authored as a
    standalone reference). Assumed to keep all of that intact and add only the delete action,
    since removing existing shipped functionality isn't implied by any acceptance criterion
    here.
  - |
    The prototype's page-header copy ("Remove an expense that shouldn't be on the list — the
    change is immediate and visible to everyone.") conflicts with the shipped page's current
    header copy ("Review and correct submitted expense records, or add a new one."). Assumed to
    leave the existing header text as-is (it already covers editing/creating on this same page)
    and add the `.no-restriction-note` callout as a new element instead of replacing the
    header, since no acceptance criterion specifies header wording.
  - |
    Assumed the modal/callout copy strings are pinned character-for-character to what the
    prototype shows ("🗑 Delete", "🗑 Delete expense", "Deleting…", "Expense deleted", "This
    can't be undone...") since several tests assert on that exact text.
  - |
    Added a `persistExpenses` failure path (disabled-button re-enable + error toast) for delete
    even though no acceptance criterion explicitly requires it, because it mirrors the
    identical pattern already shipped for Edit and Create in this same file and its absence
    would be an inconsistency in an otherwise-uniform module. Flagging in case the reviewer
    wants this split into a separate follow-up instead.
  - |
    Assumed the 300ms simulated-latency delay from the prototype's `setTimeout` should be kept
    (rather than deleting synchronously) to stay visually consistent with the "Deleting…"
    button-label state the prototype and its notes describe.

package_dependencies: []

notes: |
  This story is purely client-side: there is no server-backed expense API in this codebase
  (`src/*/routes.js` covers guests/employees/hires/workflows/runs only), and TEST-M1-STORY-140
  already established the pattern of a single shared `expenses` array in `localStorage`
  rendered identically regardless of the "Signed in as" viewer. Delete follows that same
  precedent rather than introducing any new persistence layer.

  ```mermaid
  flowchart TD
    HTML["public/index.html<br/>delete modal + no-restriction-note markup"]
    JS["public/js/expenses.js<br/>renderList / openDeleteModal / delete handler"]
    CSS["public/css/expenses.css<br/>.row-delete-btn .btn-danger .confirm-summary etc."]
    TEST["test/expenses-delete.test.js"]
    LS[("localStorage 'expenses'")]
    UTILS["public/js/utils.js<br/>escapeHtml / formatDateDisplay"]

    HTML -->|"jsdom loads fixture into document"| JS
    JS -->|"filter + persistExpenses"| LS
    JS -->|"row markup"| UTILS
    CSS -.styles.-> HTML
    TEST -->|"drives clicks, fake timers"| JS
    TEST -->|"reads fixture"| HTML

    classDef touched fill:#f96,color:#000
    class HTML,JS,CSS,TEST touched
  ```

review_focus: |
  In scope: a per-row Delete action + confirmation modal on the existing client-side,
  localStorage-backed expense list page only — no server/API work, since none exists for
  expenses today (this mirrors the 140/103 precedent, not a gap to flag). Out of scope:
  changing the page header copy, filter bar, or "+ Log expense" flow, even though the
  standalone 142 prototype's Screen 1 omits them — those are preserved from prior stories by
  deliberate choice (see assumptions). The riskiest area is the in-flight-cancel race guard
  (`pendingDeleteId !== targetId`), copied from the edit form's existing pattern — if that
  guard is dropped or miscopied, a cancelled-then-reopened delete could silently remove the
  wrong row. Also note the destructive-action styling deliberately avoids a semantic "danger"
  color (icon + bold text only) because no such token exists in the design system, per the
  prototype's own documented gap note — this is intentional, not an oversight.
