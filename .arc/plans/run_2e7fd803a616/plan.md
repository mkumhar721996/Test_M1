summary: |
  The expense list page (public/index.html + public/js/expenses.js), built in prior stories
  (140/126/103), already has a working "Edit expense" modal with no restriction on who logged
  a record or how old it is — so AC4 (cross-user edit) and AC5 (age-independent edit) already
  work functionally today, they just aren't locked in by tests or made visible in the UI. The
  one real functional gap is that the edit form's Description field is currently optional
  (labelled "(optional)", no validation), while the create form already enforces it as required
  via `validateCreateExpenseFields`. This plan (a) makes Description required on the edit form
  by consolidating edit-form validation onto the same shared validator the create form uses —
  directly satisfying "matching the validation behaviour of the create form" — and (b) builds
  the remaining pieces the approved TEST-M1-STORY-141 prototype
  (.arc/designs/TEST-M1-STORY-141-design.html) shows to make AC4/AC5 visible rather than only
  implicit: a "record context" bar in the modal (Logged by X on Y + a "Not logged by you" badge
  + a "Logged a while ago" badge for records over 90 days old), a date-field hint, an age flag
  next to old rows' Edit buttons, and a page-level hint paragraph stating both permissions
  plainly. No backend route or storage schema changes are needed — this feature is entirely
  client-side against localStorage, matching stories 140/141's existing pattern.
scope:
  - description: |
      Update the edit-expense modal markup in the existing single-page app shell.
      Specifically, from the approved design (.arc/designs/TEST-M1-STORY-141-design.html,
      "Expense List" screen, lines ~639-679):
        - Add a `.record-context` bar right after the modal header and before the form,
          with `#context-logged-by` / `#context-logged-date` spans and two badges
          (`#not-yours-badge` "👤 Not logged by you", `#old-badge` "⏱ Logged a while ago"),
          both `hidden` by default:
            <div class="record-context" id="record-context">
              <span>Logged by <strong id="context-logged-by">—</strong> on <strong id="context-logged-date">—</strong></span>
              <span class="not-yours-badge" id="not-yours-badge" hidden>👤 Not logged by you</span>
              <span class="not-yours-badge" id="old-badge" hidden>⏱ Logged a while ago</span>
            </div>
        - Change the Amount input from `type="number" min="0.01" step="0.01"` to
          `type="text" inputmode="decimal" placeholder="0.00"`, matching the create form's
          input and the design, so the shared decimal-place validation applies identically.
        - Add a hint below the Date input: `<span class="hint" id="hint-date">Any date is
          allowed, including dates from months ago.</span>`, and update the input's
          `aria-describedby` to `"error-date hint-date"`.
        - Make Description required: remove the "(optional)" label suffix, add
          `placeholder="What was this expense for?"`, and add
          `<p class="field-error" id="error-description" role="alert" hidden>⚠ Description is
          required.</p>` (mirroring the create modal's `create-error-description`).
        - Add a page-level hint paragraph above the expense table (same position/shape as the
          existing `.shared-visibility-hint`, new class `.edit-hint` per the design):
            <p class="edit-hint">
              <span class="hint-icon" aria-hidden="true">ℹ</span>
              <span>You can edit any expense in this list, even one someone else logged, or one from months ago. Description is required — it can't be cleared.</span>
            </p>
    files:
      - public/index.html
    rationale: |
      This markup is taken directly from the only approved design record for this story. The
      record-context bar and badges are how the design makes AC4 (cross-user edit) and AC5
      (age-independent edit) visible/provable rather than silent; the edit-hint paragraph and
      date hint are the design's plain-language statement of the same two permissions plus the
      new required-description rule. The amount input type change aligns the edit form with the
      create form's input so the shared validator's decimal-place check behaves identically in
      both, consistent with the story's "matching the validation behaviour of the create form"
      requirement.
  - description: |
      Consolidate edit-form validation onto the create form's validator and add the
      supporting behaviour (badges, age flag, description handling) in public/js/expenses.js.
      Concretely:
        1. Delete the old lightweight `validateExpenseFields` (amount/date/category only, no
           description) and rename the existing `validateCreateExpenseFields` to
           `validateExpenseFields` so both forms call the exact same function:
             function validateExpenseFields({ amount, date, category, description }) {
               return {
                 amount: validateAmount(amount) || null,
                 date: date === '' ? 'Date is required.' : null,
                 category: category === '' ? 'Category is required.' : null,
                 description: (description || '').trim() === '' ? 'Description is required.' : null,
               };
             }
        2. Update the edit-form `submit` handler to read `fieldDescription.value.trim()`, run
           it through the shared validator, call `setFieldError(fieldDescription, errorDescription,
           Boolean(errors.description), errors.description)`, include it in the
           first-invalid-field focus chain, and include it in `clearAllErrors()`.
        3. Add two small date-math helpers:
             function daysBetween(isoA, isoB) {
               const a = new Date(isoA + 'T00:00:00Z');
               const b = new Date(isoB + 'T00:00:00Z');
               return Math.round((b - a) / 86400000);
             }
             function todayISO() { return new Date().toISOString().slice(0, 10); }
           (using the real current date, not the design prototype's hardcoded `TODAY` constant,
           so age never goes stale in the shipped app).
        4. In `openEditModal(id)`, after populating the fields, set the context bar and badges:
             doc.getElementById('context-logged-by').textContent = exp.loggedBy;
             doc.getElementById('context-logged-date').textContent = formatDateDisplay(exp.date);
             doc.getElementById('not-yours-badge').hidden = (exp.loggedBy === viewerSelect.value);
             doc.getElementById('old-badge').hidden = daysBetween(exp.date, todayISO()) <= 90;
        5. In `renderList(list)`, compute `const isOld = daysBetween(exp.date, todayISO()) > 90;`
           per row and append the design's age flag to the Edit button:
             Edit${isOld ? '<span class="age-flag" title="Logged over 90 days ago" aria-hidden="true">⏱</span>' : ''}
    files:
      - public/js/expenses.js
    rationale: |
      Reusing one validator for both forms is the most direct way to satisfy "description
      enforced as required — matching the validation behaviour of the create form": it isn't
      just similar behaviour, it's the identical code path, so the two forms cannot drift apart
      again. AC4 and AC5 already pass today because `openEditModal` never checks `loggedBy` and
      the submit handler never checks `exp.date` age — this step only adds the visibility layer
      (badges, age flag) the approved design calls for; it does not add any gating logic, since
      gating would contradict the acceptance criteria (edits must always succeed regardless of
      author or age).
  - description: |
      Add the CSS for the new design elements, taken from the design file's inline `<style>`
      block (record-context / not-yours-badge / age-flag / edit-hint rules):
        .record-context {
          display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2);
          background: var(--color-bg); border: 1px solid var(--color-border);
          border-radius: var(--radius-md); padding: var(--space-2) var(--space-3);
          margin-bottom: var(--space-4); font-family: var(--font-family-base);
          font-size: var(--font-size-sm); color: var(--color-fg-muted);
        }
        .record-context strong { color: var(--color-fg); font-weight: var(--font-weight-bold); }
        .not-yours-badge {
          display: inline-flex; align-items: center; gap: var(--space-1);
          padding: var(--space-1) var(--space-2); background: var(--color-surface);
          color: var(--color-primary); border: 1px solid var(--color-primary);
          border-radius: var(--radius-lg); font-size: var(--font-size-sm);
          font-weight: var(--font-weight-bold);
        }
        .age-flag { display: inline-block; margin-left: var(--space-1); color: var(--color-primary); font-size: var(--font-size-sm); }
        .edit-hint {
          display: flex; align-items: flex-start; gap: var(--space-2);
          font-family: var(--font-family-base); font-size: var(--font-size-sm);
          color: var(--color-fg-muted); margin: 0 0 var(--space-3) 0;
        }
        .edit-hint .hint-icon { flex: 0 0 auto; color: var(--color-primary); }
    files:
      - public/css/expenses.css
    rationale: |
      These rules are copied from the design's own stylesheet (same token variables the rest of
      the file already uses — no new colors invented), keeping the new elements visually
      consistent with the existing `.field-error` / `.hint` / `.shared-visibility-hint` rules
      already in this file.
  - description: |
      Add failing-first tests to test/expenses.test.js for: Description required on edit
      (AC1/AC2), the multi-field update path with Description enforced (AC3), cross-user edit
      with the "Not logged by you" badge (AC4), and age-independent edit with the "Logged a
      while ago" badge (AC5). See the `tests` section below for the concrete assertions.
    files:
      - test/expenses.test.js
    rationale: |
      Existing tests in this file already cover pre-population, amount validation, cancel/close,
      persistence-after-reload, and error-toast-on-storage-failure for the edit modal — none of
      that needs to change. The new tests close the gap: today nothing in this file exercises
      Description at all on the edit path (it's optional and untested), and nothing exercises a
      cross-user or aged-record edit, even though the underlying code already permits both.
tests:
  - |
    AC1/AC2 — clearing Description and submitting shows an inline error, keeps the modal open,
    and leaves the stored record untouched:
      document.querySelector('[data-edit-id="exp_001"]').click();
      document.getElementById('field-description').value = '';
      document.getElementById('edit-form').dispatchEvent(new Event('submit', { cancelable: true }));
      expect(document.getElementById('modal-wrap').hidden).toBe(false);
      expect(document.getElementById('error-description').hidden).toBe(false);
      expect(document.getElementById('error-description').textContent).toMatch(/Description is required/);
      jest.advanceTimersByTime(350);
      const stored = JSON.parse(localStorage.getItem('expenses'));
      expect(stored.find((e) => e.id === 'exp_001').description).toBe('Flight to Chicago client site');
  - |
    AC3 — updating amount, category, date, and description together and submitting updates the
    rendered list row for every changed field (extends the existing multi-field test to confirm
    it still passes now that Description is required and non-empty):
      document.querySelector('[data-edit-id="exp_002"]').click();
      document.getElementById('field-amount').value = '120.00';
      document.getElementById('field-date').value = '2026-09-20';
      document.getElementById('field-category').value = 'Software';
      document.getElementById('field-description').value = 'Updated description';
      document.getElementById('edit-form').dispatchEvent(new Event('submit', { cancelable: true }));
      jest.advanceTimersByTime(350);
      const row = document.querySelector('[data-edit-id="exp_002"]').closest('tr');
      expect(row.querySelector('.desc-cell').textContent).toBe('Updated description');
      expect(row.querySelector('.col-amount').textContent).toBe('$120.00');
  - |
    AC4 — opening the edit modal for an expense logged by someone else than the current viewer
    shows the "Not logged by you" badge, and saving still succeeds:
      document.getElementById('viewer-select').value = 'Morgan Ellis';
      document.querySelector('[data-edit-id="exp_002"]').click(); // exp_002 loggedBy: 'Priya Shah'
      expect(document.getElementById('not-yours-badge').hidden).toBe(false);
      document.getElementById('field-amount').value = '150.00';
      document.getElementById('edit-form').dispatchEvent(new Event('submit', { cancelable: true }));
      jest.advanceTimersByTime(350);
      const stored = JSON.parse(localStorage.getItem('expenses'));
      expect(stored.find((e) => e.id === 'exp_002').amount).toBe(150);
    Negative case in the same suite — badge stays hidden when the viewer did log the record:
      document.getElementById('viewer-select').value = 'Morgan Ellis';
      document.querySelector('[data-edit-id="exp_001"]').click(); // exp_001 loggedBy: 'Morgan Ellis'
      expect(document.getElementById('not-yours-badge').hidden).toBe(true);
  - |
    AC5 — opening the edit modal for an expense logged more than 90 days ago shows the "Logged a
    while ago" badge and an age flag on its Edit button, and saving still succeeds regardless of
    age:
      const oldDate = new Date(Date.now() - 100 * 86400000).toISOString().slice(0, 10);
      localStorage.setItem('expenses', JSON.stringify([
        { id: 'exp_old', date: oldDate, category: 'Software', description: 'Vendor contract renewal', amount: 1080, loggedBy: 'Devon Ruiz' },
      ]));
      jest.resetModules();
      document.documentElement.innerHTML = fs.readFileSync(HTML_PATH, 'utf8');
      const { initExpensesApp: reInit } = require('../public/js/expenses');
      reInit(document);
      expect(document.querySelector('[data-edit-id="exp_old"] .age-flag')).not.toBeNull();
      document.querySelector('[data-edit-id="exp_old"]').click();
      expect(document.getElementById('old-badge').hidden).toBe(false);
      document.getElementById('field-amount').value = '1140.00';
      document.getElementById('edit-form').dispatchEvent(new Event('submit', { cancelable: true }));
      jest.advanceTimersByTime(350);
      const stored = JSON.parse(localStorage.getItem('expenses'));
      expect(stored.find((e) => e.id === 'exp_old').amount).toBe(1140);
  - |
    Supporting UI coverage — the context bar shows who logged the record and when, and the
    page states both edit permissions and the required-description rule:
      document.querySelector('[data-edit-id="exp_002"]').click();
      expect(document.getElementById('context-logged-by').textContent).toBe('Priya Shah');
      expect(document.getElementById('context-logged-date').textContent).toBe('09/05/2026');
      expect(document.querySelector('.edit-hint').textContent).toMatch(/edit any expense/i);
      expect(document.querySelector('.edit-hint').textContent).toMatch(/Description is required/i);
assumptions_or_open_questions:
  - |
    Assumed a 90-day threshold for the "Logged a while ago" badge / age flag, copied from the
    design prototype's own `daysBetween(exp.date, TODAY) > 90` logic. No acceptance criterion
    specifies an exact cutoff — AC5 only requires that editing succeeds regardless of age, which
    the current code already does unconditionally. The 90-day badge is a non-blocking visual
    affordance only; changing or removing the threshold would not affect AC compliance.
  - |
    Assumed "today" for age calculations should be the real `new Date()` at render/open time,
    not the design prototype's hardcoded `TODAY = '2026-09-30'` constant, since the shipped app
    must keep working correctly as real time passes rather than being pinned to the prototype's
    demo date.
  - |
    The record-context bar, both badges, the age flag, and the edit-hint paragraph are UI-only
    affordances that make already-passing AC4/AC5 behaviour visible; they are not required to
    make the acceptance criteria pass functionally. Flagging this so the reviewer can confirm
    this visual/design-fidelity work is wanted in this change, versus a narrower change that
    only adds the Description-required validation.
  - |
    Assumed it's safe to delete the old two-field-only `validateExpenseFields` function and
    rename `validateCreateExpenseFields` to `validateExpenseFields` (used by both forms) since no
    test in test/expenses.test.js or test/expenses-create.test.js imports either name directly —
    both suites only exercise behaviour through the DOM or via `formatUSD`/`validateAmount`.
package_dependencies: []
notes: |
  This is a client-side-only feature (localStorage, no server route), matching the pattern
  already established by story 140's create flow — no changes to src/server.js or any backend
  route are needed.

  ```mermaid
  flowchart TD
    HTML[public/index.html<br/>edit modal: record-context, badges,<br/>date hint, required description]
    JS[public/js/expenses.js<br/>validateExpenseFields, daysBetween,<br/>openEditModal, renderList]
    CSS[public/css/expenses.css<br/>.record-context .not-yours-badge<br/>.age-flag .edit-hint]
    LS[(localStorage 'expenses')]
    TEST[test/expenses.test.js]

    HTML -->|DOM ids read/written by| JS
    JS -->|persists / loads| LS
    CSS -->|styles| HTML
    TEST -->|loads and drives| HTML
    TEST -->|requires + asserts| JS

    classDef touched fill:#f96,color:#000
    class HTML,JS,CSS,TEST touched
  ```
review_focus: |
  In scope: making the edit form's Description field required using the exact same validator
  the create form already uses, plus building the visual affordances the approved
  TEST-M1-STORY-141 design shows for AC4/AC5 (record-context bar, "Not logged by you" / "Logged
  a while ago" badges, age flag, edit-hint copy). Out of scope: any backend/server change (this
  remains a pure localStorage feature), any change to the create/filter flows beyond the shared
  validator rename, and any actual gating of edits by author or age — AC4/AC5 require edits to
  always succeed regardless of who logged the record or how old it is, so the badges are
  strictly informational and must never block submission.

  Riskiest area: the `validateExpenseFields` rename/consolidation touches the create form's
  submit handler as well as the edit form's, even though the story is about editing — a mistake
  here (e.g. a typo'd field name in the merged validator) would silently break create-expense
  validation too. Reviewers should specifically re-run the existing test/expenses-create.test.js
  suite mentally against the new shared function, not just the edit tests.

  Non-obvious decision: the 90-day "old" threshold and badges are not literal AC requirements —
  they're this story's design-approved way of making already-working cross-user/age-independent
  editing visible, not new gating logic. A reviewer should not read the badges as validation and
  should confirm submission succeeds even when both badges are showing.
