summary: |
  Adds Rejected and Withdrawn as two new terminal `profileStatus` values on the existing hire
  record (`src/hires/store.js`), reachable from any pre-offer `hireStage` (applied, screening,
  interview — before `offer_extended`) while the record is active (not already deactivated,
  rejected, or withdrawn). Two new routes, `POST /hires/:id/reject` and `POST /hires/:id/withdraw`,
  reuse the existing `enforceOnboardingRole` HR/Manager gate from `src/runs/auth.js`. Rejected and
  Withdrawn are distinct from Deactivated: `reactivateHire` and the stage-transition guard in
  `assertValidStageTransition` are extended so a rejected/withdrawn record can never be reactivated
  or advanced, always failing with a field-level 400 on the `profileStatus`/`hireStage` field. The
  Hire Profile detail page (`public/hire-profile.html` / `public/js/hire-profile.js`) gets a
  "Mark as rejected" / "Mark as withdrawn" confirm dialog with an optional reason field, and its
  existing status chip and top-actions are extended to render and act on the two new statuses —
  matching the status-chip and mark-outcome-dialog treatment shown in the approved design
  (`.arc/designs/TEST-M1-STORY-189-design.html`), adapted onto the real data model and pages.

scope:
  - description: |
      Add an outcome-eligibility guard and two new store actions to `src/hires/store.js`:

      ```js
      function assertEligibleForOutcome(hire) {
        if (hire.profileStatus === 'deactivated') {
          throw new HireValidationError('validation_error', { profileStatus: 'Cannot mark as Rejected or Withdrawn — candidate is deactivated. Reactivate the candidate first.' });
        }
        if (hire.profileStatus === 'rejected' || hire.profileStatus === 'withdrawn') {
          throw new HireValidationError('validation_error', { profileStatus: `Already closed — status is ${hire.profileStatus === 'rejected' ? 'Rejected' : 'Withdrawn'}.` });
        }
        const stageIdx = CANDIDATE_STAGES.indexOf(hire.hireStage);
        const offerIdx = CANDIDATE_STAGES.indexOf('offer_extended');
        if (stageIdx === -1 || stageIdx >= offerIdx) {
          throw new HireValidationError('validation_error', { profileStatus: 'Cannot mark as Rejected or Withdrawn — candidate is at or past the Offer stage.' });
        }
      }

      async function markOutcome(id, outcome, reason) {
        const hire = hires.get(id);
        if (!hire) return undefined;
        assertEligibleForOutcome(hire);
        hire.profileStatus = outcome;
        hire.outcomeReason = reason ? String(reason).trim() : '';
        return hire;
      }

      async function rejectHire(id, reason) { return markOutcome(id, 'rejected', reason); }
      async function withdrawHire(id, reason) { return markOutcome(id, 'withdrawn', reason); }
      ```

      `CANDIDATE_STAGES` (`['applied', 'screening', 'interview', 'offer_extended', 'offer_accepted']`)
      already exists in this file from TEST-M1-STORY-188; "before the Offer stage" (scope text) maps
      to an index less than `offer_extended`. Pre-offer stages never carry an active onboarding run
      (runs only trigger on reaching `offer_accepted`), so `markOutcome` needs no run-cancellation
      logic, unlike `deactivateHire`.

      Export `rejectHire` and `withdrawHire` from the module alongside the existing exports.
    files:
      - src/hires/store.js
    rationale: |
      This is the single source of truth for hire records; `profileStatus` already distinguishes
      active/deactivated (TEST-M1-STORY-171) and `hireStage` already models the pre-offer pipeline
      (TEST-M1-STORY-188), so Rejected/Withdrawn are added as two more terminal `profileStatus`
      values rather than a new field, matching the single-status model the approved design's status
      chip shows (`.status-chip--active/--deactivated/--rejected/--withdrawn`, one mutually-exclusive
      dimension).

  - description: |
      In the same file, extend the two existing guards so a rejected/withdrawn record can never be
      reactivated or advanced — both are currently guarded only against `'deactivated'`:

      In `assertValidStageTransition`, right after the existing deactivated check:
      ```js
      if (hire.profileStatus === 'rejected' || hire.profileStatus === 'withdrawn') {
        throw new HireValidationError('validation_error', { hireStage: `Cannot change stage — status is ${hire.profileStatus === 'rejected' ? 'Rejected' : 'Withdrawn'}. This record is closed and cannot advance to another stage.` });
      }
      ```

      In `reactivateHire`, before the existing deactivated/no-op check:
      ```js
      if (hire.profileStatus === 'rejected' || hire.profileStatus === 'withdrawn') {
        throw new HireValidationError('validation_error', { profileStatus: `Cannot reactivate — status is ${hire.profileStatus === 'rejected' ? 'Rejected' : 'Withdrawn'}. Rejected and Withdrawn are final outcomes and aren't eligible for reactivation.` });
      }
      if (hire.profileStatus !== 'deactivated' || (hire.run && hire.run.status === 'active')) return hire;
      ```
      (that last line is the existing no-op-for-already-active behaviour, left unchanged).
    files:
      - src/hires/store.js
    rationale: |
      AC2 and AC3 require these to be blocking 400s, not the current silent no-op/deactivated-only
      behaviour. Scoping the new branch to a dedicated `if` ahead of the existing logic keeps the
      pre-existing TEST-M1-STORY-171/188 behaviour (deactivated hire, already-active reactivate
      no-op) untouched and additive-only.

  - description: |
      Add two routes to `src/hires/routes.js`, mirroring the existing `/deactivate` and
      `/reactivate` routes exactly (same middleware, same 404/400 handling):

      ```js
      router.post('/:id/reject', enforceOnboardingRole, async (req, res, next) => {
        try {
          const hire = await rejectHire(req.params.id, req.body && req.body.reason);
          if (!hire) return res.status(404).json({ error: 'hire not found' });
          res.status(200).json(hire);
        } catch (err) {
          if (err instanceof HireValidationError) return res.status(400).json({ error: 'validation_error', fields: err.fields });
          next(err);
        }
      });
      router.post('/:id/withdraw', enforceOnboardingRole, async (req, res, next) => {
        try {
          const hire = await withdrawHire(req.params.id, req.body && req.body.reason);
          if (!hire) return res.status(404).json({ error: 'hire not found' });
          res.status(200).json(hire);
        } catch (err) {
          if (err instanceof HireValidationError) return res.status(400).json({ error: 'validation_error', fields: err.fields });
          next(err);
        }
      });
      ```
      Update the top import line to also pull in `rejectHire, withdrawHire` from `./store`.
    files:
      - src/hires/routes.js
    rationale: |
      Reuses `enforceOnboardingRole` exactly as the scope text requires ("Reuses the existing
      HR/Manager role check"), satisfying AC5 for free since that middleware already returns
      401/403 before any store logic runs.

  - description: |
      New backend test file covering AC1, AC2, AC3, AC4, AC5, AC6 at the store and route layer,
      modeled on the existing `test/hires-stage-pipeline.test.js` / `test/hires-role-enforcement.test.js`
      style (`mk()` helper building a hire via `createHire`, `test.each` for the rejected/withdrawn
      pair). See `tests` below for the literal assertions.
    files:
      - test/hires-outcome.test.js
    rationale: |
      Keeps the new outcome behaviour's test coverage in one dedicated file, same pattern as the
      stage-pipeline feature got its own `hires-stage-pipeline.test.js` file in TEST-M1-STORY-188.

  - description: |
      Extend the existing `test.each(['deactivate', 'reactivate'])(...)` arrays in
      `test/hires-role-enforcement.test.js` (the two AC6-labelled tests, 403 and 401) to
      `test.each(['deactivate', 'reactivate', 'reject', 'withdraw'])`, so the new routes are proven
      to share literally the same role gate rather than re-implementing a parallel check.
    files:
      - test/hires-role-enforcement.test.js
    rationale: |
      Directly demonstrates the scope's "Reuses the existing HR/Manager role check" with a minimal
      diff instead of duplicating equivalent assertions in the new test file.

  - description: |
      Add a "Mark as rejected / Mark as withdrawn" confirm dialog to `public/hire-profile.html`,
      reusing the existing modal CSS primitives already on this page (`.modal-overlay`,
      `.modal-panel`, `.field`, `.consequence-note`, `.modal-actions`) the same way the existing
      Deactivate/Reactivate modals on this page do:

      ```html
      <!-- Reject / Withdraw outcome modal (AC1, AC6) -->
      <div class="modal-overlay" id="outcome-overlay" hidden></div>
      <div class="modal-wrap" id="outcome-modal" role="dialog" aria-modal="true" aria-labelledby="outcome-modal-title" hidden>
        <div class="modal-panel">
          <div class="modal-header">
            <div><h2 id="outcome-modal-title">Mark candidate as rejected</h2></div>
            <button class="icon-btn" id="outcome-close-btn" type="button" aria-label="Close dialog without making changes">✕</button>
          </div>
          <div class="field" style="margin-bottom:0;">
            <label class="label" for="outcome-reason">Reason (optional, visible to the hiring team)</label>
            <textarea class="input" id="outcome-reason" rows="3" placeholder="e.g. Not enough backend experience for this role"></textarea>
          </div>
          <div class="consequence-note">
            <span aria-hidden="true">ℹ</span>
            <span>This closes the candidate's hire record. Rejected and Withdrawn are final outcomes — the record won't be eligible to advance to another stage or be reactivated into the live pipeline.</span>
          </div>
          <div class="modal-actions">
            <button type="button" class="btn btn-secondary" id="outcome-cancel-btn">Cancel</button>
            <button type="button" class="btn btn-primary" id="outcome-confirm-btn">Mark as rejected</button>
          </div>
        </div>
      </div>
      ```
      The reason textarea, its placeholder/optional copy, and the "final outcome" consequence
      wording are taken directly from the approved design's outcome dialog
      (`#outcome-reason`, `#outcome-consequence-text` in `TEST-M1-STORY-189-design.html`).
    files:
      - public/hire-profile.html
    rationale: |
      This is the one net-new interactive surface the story needs; everything else (status
      display, blocked-attempt handling) extends elements that already exist on this page from
      TEST-M1-STORY-171/188.

  - description: |
      Extend `public/js/hire-profile.js`:
      - Add `isPreOfferStage(stage)` using the file's existing `CANDIDATE_STAGES` array.
      - Add a 4-way status chip map and use it in `renderProfile()` in place of the current
        active/not-active ternary:
        ```js
        const STATUS_CHIP = {
          active: { icon: '●', label: 'Active profile' },
          deactivated: { icon: '○', label: 'Deactivated' },
          rejected: { icon: '✕', label: 'Rejected' },
          withdrawn: { icon: '↩', label: 'Withdrawn' },
        };
        ```
        rendered as `profileStatusChip.className = 'profile-status-chip profile-status-chip--' + hire.profileStatus;`.
      - Extend `renderTopActions()` from its current 2-way (active → Deactivate, else → Reactivate)
        branch to 4-way: `active` + pre-offer stage renders Deactivate + "Mark as rejected" +
        "Mark as withdrawn"; `active` past the offer stage renders Deactivate only; `deactivated`
        renders "Reactivate profile" wired to the existing `openReactivateModal`; `rejected`/
        `withdrawn` renders a plain "Reactivate" button wired to a new `handleDirectReactivate`
        (no confirm dialog — see `notes` for why this differs from the deactivated case).
      - Add `openOutcomeModal(outcome)` / `closeOutcomeModal()` and wire the new dialog's buttons;
        on confirm, call `api.reject(reason)` or `api.withdraw(reason)`, update `hire`, `renderAll()`,
        and toast; on a 400 use the server's `err.fields.profileStatus` message if present.
      - Add `reject`/`withdraw` to `createDefaultApi`:
        ```js
        reject: (reason) => request(`/hires/${hireId}/reject`, 'POST', { reason }),
        withdraw: (reason) => request(`/hires/${hireId}/withdraw`, 'POST', { reason }),
        ```
    files:
      - public/js/hire-profile.js
    rationale: |
      Reuses the page's existing render/modal/toast/API-client conventions rather than introducing
      a parallel UI pattern; AC3's "blocked advance" needs no new UI at all because the existing
      `canEditStage` gate (`hire.profileStatus === 'active'`) already hides the stage editor for
      any non-active status, including the two new ones — the 400 from `assertValidStageTransition`
      is exercised directly over the API/store (see `tests`), matching how the pre-existing
      deactivated-blocks-stage-change behaviour from TEST-M1-STORY-188 is tested today with no
      dedicated inline UI either.
    
  - description: |
      Add the two new chip variants to `public/css/hire-profile.css`, next to the existing
      `.profile-status-chip--active` rule, using only existing design tokens (no new colors),
      matching the approved design's status-chip treatment (distinct border weight/style per
      status, never hue alone):
      ```css
      .profile-status-chip--deactivated { border: 1px dashed var(--color-fg-muted); color: var(--color-fg-muted); }
      .profile-status-chip--rejected { border: 2px solid var(--color-fg-muted); color: var(--color-fg); }
      .profile-status-chip--withdrawn { border: 2px dashed var(--color-fg); color: var(--color-fg); }
      ```
    files:
      - public/css/hire-profile.css
    rationale: |
      Copies the border-style-per-status rule straight from the design's own
      `.status-chip--deactivated/--rejected/--withdrawn` rules (`TEST-M1-STORY-189-design.html`),
      which were themselves built from this same token set (no success/danger/warning tokens
      exist, so meaning is carried by icon + label + border, not color).

  - description: |
      Add tests to `test/hire-profile.test.js` (jsdom) covering AC1 (mark-as-rejected dialog flow
      updates the chip and removes the reject/withdraw buttons), AC2 (reactivating a
      withdrawn/rejected hire is blocked and surfaces the server's message in the toast), AC6
      (each of the four statuses renders its own chip class/label), and that the reject/withdraw
      buttons are not offered once a candidate is past the offer stage.
    files:
      - test/hire-profile.test.js
    rationale: |
      Matches this file's existing jsdom-based coverage style for the detail page (AC9 pending
      state, role/department modal, etc. are already tested this way).

tests:
  - |
    test.each(['applied', 'screening', 'interview'])('AC1: marking an active %s-stage candidate as rejected sets profileStatus to rejected', async (stage) => {
      const hire = await mk({ hireStage: stage, hiringManager: stage === 'applied' ? undefined : 'mgr_1' });
      const updated = await rejectHire(hire.id, 'Not enough experience');
      expect(updated).toMatchObject({ profileStatus: 'rejected', outcomeReason: 'Not enough experience' });
    });
    test('AC1: POST /hires/:id/withdraw as HR sets profileStatus to withdrawn', async () => {
      const hire = await mk({ hireStage: 'interview', hiringManager: 'mgr_1' });
      const res = await request(app).post(`/hires/${hire.id}/withdraw`).set('x-staff-role', 'hr').send({ reason: 'Accepted another offer' });
      expect(res.status).toBe(200);
      expect(res.body.profileStatus).toBe('withdrawn');
    });
  - |
    test.each(['rejected', 'withdrawn'])('AC2: reactivating a %s hire is blocked with a field-level 400', async (outcome) => {
      const hire = await mk({ hireStage: 'applied' });
      await (outcome === 'rejected' ? rejectHire(hire.id) : withdrawHire(hire.id));
      await expect(reactivateHire(hire.id)).rejects.toMatchObject({ statusCode: 400, fields: { profileStatus: expect.stringContaining('Cannot reactivate') } });
      expect(getHire(hire.id).profileStatus).toBe(outcome);
    });
  - |
    test.each(['rejected', 'withdrawn'])('AC3: advancing a %s hire to another stage is blocked with a field-level 400', async (outcome) => {
      const hire = await mk({ hireStage: 'screening', hiringManager: 'mgr_1' });
      await (outcome === 'rejected' ? rejectHire(hire.id) : withdrawHire(hire.id));
      await expect(updateHire(hire.id, { hireStage: 'interview' })).rejects.toMatchObject({ statusCode: 400, fields: { hireStage: expect.stringContaining('closed') } });
      expect(getHire(hire.id).hireStage).toBe('screening');
    });
  - |
    test.each(['reject', 'withdraw'])('AC4: %sing a deactivated hire is blocked with a field-level 400', async (action) => {
      const hire = await mk({ hireStage: 'applied' });
      await deactivateHire(hire.id);
      const res = await request(app).post(`/hires/${hire.id}/${action}`).set('x-staff-role', 'manager').send({});
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ error: 'validation_error', fields: { profileStatus: expect.stringContaining('deactivated') } });
      expect(getHire(hire.id).profileStatus).toBe('deactivated');
    });
  - |
    test.each(['reject', 'withdraw'])('AC5: a non-HR/Manager role calling %s gets 403 and profileStatus is unchanged', async (action) => {
      const hire = await mk({ hireStage: 'applied' });
      const res = await request(app).post(`/hires/${hire.id}/${action}`).set('x-staff-role', 'front_desk').send({});
      expect(res.status).toBe(403);
      expect(getHire(hire.id).profileStatus).toBe('active');
    });
  - |
    test.each([
      ['active', 'Active profile'],
      ['deactivated', 'Deactivated'],
      ['rejected', 'Rejected'],
      ['withdrawn', 'Withdrawn'],
    ])('AC6: %s status renders its own distinguishable chip', (status, label) => {
      const hire = { ...fixtureHire(), profileStatus: status, run: null };
      const { initHireProfileApp } = require('../public/js/hire-profile');
      initHireProfileApp(document, hire, {});
      const chip = document.getElementById('profile-status-chip');
      expect(chip.className).toContain(`profile-status-chip--${status}`);
      expect(chip.textContent).toContain(label);
    });

assumptions_or_open_questions:
  - |
    The approved design (`TEST-M1-STORY-189-design.html`) models this as a self-contained
    "Recruiting" prototype with its own Pipeline-list and Candidate-Record pages and its own
    stage vocabulary (applied/phone_screen/interview/offer/hired, and a `status` of
    active/deactivated/rejected/withdrawn on a `localStorage`-backed fixture). The real app
    already has a recruiting pipeline (TEST-M1-STORY-188) built on the existing Hire Profile
    record (`hireStage`: applied/screening/interview/offer_extended/offer_accepted,
    `profileStatus`: active/deactivated). This plan builds the design's interaction pattern
    (status chip with icon+label+border-style per status, a mark-outcome confirm dialog with an
    optional reason, blocked-attempt messaging) on the REAL model and REAL pages rather than the
    prototype's invented ones, mapping "the Offer stage" to `offer_extended`. Flagging this
    mapping explicitly since the design's literal stage/status names and page structure don't
    exist in the codebase today.
  - |
    Scope is narrowed to the Hire Profile DETAIL page (`public/hire-profile.html`/`hire-profile.js`)
    only; the Hire Profiles LIST page is left untouched. This mirrors how TEST-M1-STORY-171's
    Deactivate/Reactivate was implemented (detail-page-only; the list page has no status column
    today) and matches the design's own reviewer note that the candidate record is "the canonical
    place" to see every blocked attempt. If a future story wants Reject/Withdraw actions directly
    from the list, that is a separate, larger change (new status column, new row actions) not
    covered here.
  - |
    The design's "Stage & status history" timeline and its reference-only "Role & status
    permissions" / "Acceptance Criteria Checklist" screens are prototype-authoring artifacts
    documenting the story, not functional requirements — no AC asks for a persisted audit trail,
    and the real hire record has no such field today (only an onboarding-specific `auditLog`).
    Building a full history log is out of scope for this plan.
  - |
    An optional reason is accepted and persisted on the hire record as `outcomeReason` (per the
    design's dialog), but is not displayed anywhere in the UI since no AC requires surfacing it.
    This is a reasonable, low-cost inclusion since the approved dialog already collects it and
    store/route code barely changes to accept it; it would be easy to drop the field entirely if a
    reviewer prefers the backend not store data no AC reads back.
  - |
    Assumed "before the Offer stage" (scope text) means `hireStage` index strictly less than the
    index of `offer_extended` in the existing `CANDIDATE_STAGES` array — i.e. applied, screening,
    interview are eligible; offer_extended and offer_accepted are not, even though no AC
    explicitly tests the at-or-past-offer case (AC1's precondition implies it, and the design's
    own permissions matrix lists it as "Not offered").
  - |
    AC1's "active (non-deactivated) candidate" precondition is read as `profileStatus === 'active'`
    exactly, so attempting to mark an already-rejected/withdrawn record again is blocked by the
    same `assertEligibleForOutcome` guard (the "Already closed" message) even though no AC
    separately enumerates that case — it's a direct consequence of AC1's own wording, not added
    scope.

package_dependencies: []

notes: |
  Reference reading for this plan: `src/hires/store.js` and `src/hires/routes.js` (the hire
  record, `CANDIDATE_STAGES`, `assertValidStageTransition`, `deactivateHire`/`reactivateHire`),
  `src/runs/auth.js` (`enforceOnboardingRole`, the role gate to reuse), `public/hire-profile.html`
  and `public/js/hire-profile.js` (the detail page this plan extends), and
  `test/hires-stage-pipeline.test.js` / `test/hires-role-enforcement.test.js` /
  `test/hire-profile.test.js` (existing test conventions this plan's tests follow).

  Non-obvious UI decision: the detail page's "Reactivate" control branches to two different
  handlers depending on status — the existing `openReactivateModal` confirm dialog when
  `deactivated` (unchanged TEST-M1-STORY-171 behaviour), vs. a direct `handleDirectReactivate`
  call with no confirm dialog when `rejected`/`withdrawn` (new). This is deliberate: confirming an
  action ("A fresh onboarding Run starts from the beginning…") that is guaranteed to be rejected
  by the server would be misleading, so the blocked case skips the dialog and goes straight to the
  API call, surfacing the server's field-level message in the toast instead. Both render under the
  same button id at different times by design — only one is ever on screen for a given status.

  ```mermaid
  flowchart TD
    classDef touched fill:#f96,color:#000
    classDef context fill:#eee,color:#000
    auth["src/runs/auth.js<br/>enforceOnboardingRole<br/>(reused, unchanged)"]:::context
    routes["src/hires/routes.js<br/>+POST /:id/reject<br/>+POST /:id/withdraw"]:::touched
    store["src/hires/store.js<br/>+rejectHire/withdrawHire<br/>~reactivateHire<br/>~assertValidStageTransition"]:::touched
    html["public/hire-profile.html<br/>+outcome modal"]:::touched
    js["public/js/hire-profile.js<br/>+openOutcomeModal<br/>~renderProfile/renderTopActions"]:::touched
    css["public/css/hire-profile.css<br/>+chip variants"]:::touched

    auth -->|role gate, runs before store logic| routes
    routes -->|calls| store
    store -->|HireValidationError -> 400 fields| routes
    js -->|fetch POST reject/withdraw/reactivate| routes
    html --> js
    css --> html
  ```

review_focus: |
  In scope: two new terminal `profileStatus` values (`rejected`, `withdrawn`) and their guards in
  `src/hires/store.js`, two new routes reusing the existing role middleware, and the Hire Profile
  DETAIL page's status chip/top-actions/new confirm dialog. Explicitly out of scope: the Hire
  Profiles list page (untouched), any persisted stage/status history log, and the design's
  reference-only screens — don't flag their absence as a gap. Riskiest area: the new branches
  added to the pre-existing `assertValidStageTransition` and `reactivateHire` functions — verify
  they're purely additive (`if` branches ahead of/alongside the existing deactivated-only checks)
  and don't change behaviour for plain active/deactivated hires covered by TEST-M1-STORY-171/188's
  existing tests. Non-obvious: AC3 (blocked stage advance) has no new inline UI at all — the
  existing `canEditStage` gate already hides the stage editor for any non-active status, so AC3 is
  verified via direct store/API tests, not a UI assertion; this is intentional, not an oversight.
