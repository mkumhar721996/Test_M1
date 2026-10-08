summary: |
  Add `rejected` and `withdrawn` as two new, final `profileStatus` values on the existing hire
  record (`src/hires/store.js`), reachable only from an active, pre-offer candidate (hireStage
  in `applied`/`screening`/`interview`, i.e. before `offer_extended`). Two new HR/Manager-gated
  routes (`POST /hires/:id/reject`, `POST /hires/:id/withdraw`) set the outcome; the existing
  `reactivateHire` and `assertValidStageTransition` are extended to reject any further stage
  change or reactivation once a record is Rejected or Withdrawn, each with a field-level 400 on
  `profileStatus`/`hireStage`. On the frontend, `public/hire-profile.html` (the single
  "Candidate Record" equivalent in this codebase) gets a new "Outcome" card — status chip,
  contextual Reject/Withdraw/Reactivate buttons, a reason-capture confirm modal, and a reserved
  field-error slot — built from the approved prototype's Outcome block, status-chip variants,
  and consequence-box/modal patterns. The prototype's separate "Candidate Pipeline" list screen
  and its own "Recruiting stage"/Advance-button card do not have a real-app counterpart to build
  against (see notes) and are intentionally out of scope for this plan; see
  assumptions_or_open_questions for the reasoning.

scope:
  - description: |
      Add the two new terminal `profileStatus` values and the validation that gates them, in
      `src/hires/store.js`:
        - `OUTCOME_STATUSES = ['rejected', 'withdrawn']` and an `assertValidOutcome(hire, outcome)`
          guard, called from a new `markHireOutcome(id, outcome, reason)` store function:
          ```js
          function assertValidOutcome(hire, outcome) {
            if (hire.profileStatus === 'deactivated') {
              throw new HireValidationError('validation_error', {
                profileStatus: 'Cannot mark as Rejected or Withdrawn — candidate is deactivated. Reactivate the candidate first.',
              });
            }
            if (hire.profileStatus === 'rejected' || hire.profileStatus === 'withdrawn') {
              throw new HireValidationError('validation_error', {
                profileStatus: `Candidate is already marked ${hire.profileStatus === 'rejected' ? 'Rejected' : 'Withdrawn'} — this is a final outcome.`,
              });
            }
            const stageIdx = CANDIDATE_STAGES.indexOf(hire.hireStage);
            const offerIdx = CANDIDATE_STAGES.indexOf('offer_extended');
            if (stageIdx === -1 || stageIdx >= offerIdx) {
              throw new HireValidationError('validation_error', {
                profileStatus: 'Cannot mark as Rejected or Withdrawn — candidate is at or past the Offer stage.',
              });
            }
          }

          async function markHireOutcome(id, outcome, reason) {
            const hire = hires.get(id);
            if (!hire) return undefined;
            assertValidOutcome(hire, outcome);
            hire.profileStatus = outcome;
            hire.outcomeReason = reason ? String(reason).trim() : '';
            return hire;
          }
          ```
        - Extend `assertValidStageTransition` (AC3): when `stageChanging` is true, add a check
          alongside the existing `profileStatus === 'deactivated'` branch —
          `if (hire.profileStatus === 'rejected' || hire.profileStatus === 'withdrawn') throw new HireValidationError('validation_error', { hireStage: 'Cannot change stage — candidate is marked ' + (hire.profileStatus === 'rejected' ? 'Rejected' : 'Withdrawn') + '. This is a final outcome.' });`
        - Extend `reactivateHire` (AC2): before the existing deactivated-check/no-op, add
          `if (hire.profileStatus === 'rejected' || hire.profileStatus === 'withdrawn') throw new HireValidationError('validation_error', { profileStatus: 'Cannot reactivate — status is ' + (hire.profileStatus === 'rejected' ? 'Rejected' : 'Withdrawn') + '. Rejected and Withdrawn are final outcomes and are not eligible for reactivation.' });`
        - Export `markHireOutcome` alongside the existing exports.
    files:
      - src/hires/store.js
    rationale: |
      Mirrors the existing validation style already in this file (`HireValidationError` with a
      `fields` map, one guard function per concern) rather than introducing a new error type or
      pattern. Reuses `CANDIDATE_STAGES` (`applied`, `screening`, `interview`, `offer_extended`,
      `offer_accepted`) already defined here to express "before the Offer stage" (AC1) precisely
      as "stage index is before `offer_extended`'s index".

  - description: |
      Add two new routes in `src/hires/routes.js`, reusing `enforceOnboardingRole` exactly as
      `/deactivate` and `/reactivate` do:
      ```js
      router.post('/:id/reject', enforceOnboardingRole, async (req, res, next) => {
        try {
          const hire = await markHireOutcome(req.params.id, 'rejected', req.body && req.body.reason);
          if (!hire) return res.status(404).json({ error: 'hire not found' });
          res.status(200).json(hire);
        } catch (err) {
          if (err instanceof HireValidationError) return res.status(400).json({ error: 'validation_error', fields: err.fields });
          next(err);
        }
      });

      router.post('/:id/withdraw', enforceOnboardingRole, async (req, res, next) => {
        try {
          const hire = await markHireOutcome(req.params.id, 'withdrawn', req.body && req.body.reason);
          if (!hire) return res.status(404).json({ error: 'hire not found' });
          res.status(200).json(hire);
        } catch (err) {
          if (err instanceof HireValidationError) return res.status(400).json({ error: 'validation_error', fields: err.fields });
          next(err);
        }
      });
      ```
      Import `markHireOutcome` in the existing `require('./store')` destructure at the top of
      the file. No change to the `PATCHABLE_FIELDS` list — `profileStatus` stays unreachable via
      the generic PATCH route, same as `deactivated` already is.
    files:
      - src/hires/routes.js
    rationale: |
      One dedicated endpoint per action (reject / withdraw), matching this router's existing
      `/deactivate` and `/reactivate` convention, rather than a single generic
      `/outcome` endpoint with an enum body field.

  - description: |
      Add an "Outcome" card to `public/hire-profile.html`, placed after the existing "Profile
      details" card inside `.layout-grid` (own grid cell, same level as the Run card), built
      from the prototype's Outcome `control-block` (status chip + contextual actions + reserved
      `field-error` + `control-note`) and its reject/withdraw confirm dialog (modal-header,
      reason `<textarea class="input">`, `.consequence-box` info line, modal-actions):
      ```html
      <div class="card" id="outcome-card">
        <div class="card-header-row">
          <h2 class="card-title" style="margin:0;">Outcome</h2>
        </div>
        <div class="control-block">
          <div class="control-row">
            <div class="control-row-main">
              <span class="kv-label">Status</span>
              <span id="outcome-status-chip"></span>
            </div>
            <div class="control-actions" id="outcome-actions"><!-- rendered by JS --></div>
          </div>
          <p class="field-error" id="outcome-error" role="alert" hidden></p>
          <p class="control-note" id="outcome-note" hidden></p>
        </div>
      </div>

      <div class="modal-overlay" id="outcome-overlay" hidden></div>
      <div class="modal-wrap" id="outcome-modal" role="dialog" aria-modal="true" aria-labelledby="outcome-modal-title" hidden>
        <div class="modal-panel">
          <div class="modal-header">
            <div><h2 id="outcome-modal-title">Mark candidate as rejected</h2></div>
            <button class="icon-btn" id="outcome-close-btn" type="button" aria-label="Close dialog without making changes">✕</button>
          </div>
          <p id="outcome-modal-body"></p>
          <div class="field" style="margin-bottom:0;">
            <label class="label" for="outcome-reason">Reason (optional, visible to the hiring team)</label>
            <textarea class="input" id="outcome-reason" rows="3"></textarea>
          </div>
          <div class="consequence-box" id="outcome-consequence"></div>
          <div class="modal-actions">
            <button type="button" class="btn btn-secondary" id="outcome-cancel-btn">Cancel</button>
            <button type="button" class="btn btn-primary" id="outcome-confirm-btn">Mark as rejected</button>
          </div>
        </div>
      </div>
      ```
      `profile-status-chip` in the existing "Profile details" card header keeps showing
      active/deactivated only (unchanged); the new `outcome-status-chip` in the Outcome card is
      the one that also renders `rejected`/`withdrawn`, using the prototype's four status-chip
      treatments (icon + label + distinct border, never colour alone):
      active = `✓` solid primary border, deactivated = `⏸` dashed muted border,
      rejected = `✕` heavy (2px) solid border, withdrawn = `↩` heavy (2px) dashed border.
    files:
      - public/hire-profile.html
    rationale: |
      Reuses this page's existing `.card`, `.card-header-row`, `.control-block`-style kv-row
      layout, `.modal-overlay`/`.modal-wrap`/`.modal-panel` and `.consequence-note` primitives
      (already defined in `public/css/hire-profile.css` / `design-system/prototype-utils.css`)
      instead of introducing a parallel card system, while still taking the field/element
      breakdown (status chip, contextual action buttons, reserved field-error slot immediately
      beneath the control, reason textarea + consequence box in the confirm dialog) directly
      from the prototype's "Candidate Record" → Outcome block and outcome dialog.

  - description: |
      Wire the new card in `public/js/hire-profile.js`:
        - `renderOutcomeCard()`: builds the `outcome-status-chip` markup for all four statuses;
          when `hire.profileStatus` is `'rejected'`/`'withdrawn'`, renders a single Reactivate
          button and a closed-out note; otherwise (`'active'`/`'deactivated'`) renders both
          "Mark as rejected" and "Mark as withdrawn" buttons plus a contextual note when the
          action is currently blocked (deactivated, or at/past Offer stage) — buttons stay
          enabled/clickable in the blocked case so the field-level error is reachable, mirroring
          the prototype's `rowActionsHtml`/`renderOutcomeActions` pattern of always offering the
          action and letting the backend's 400 drive the inline error.
        - `openOutcomeModal(outcome)` / `closeOutcomeModal()` / `confirmOutcome()`: populate and
          show `#outcome-modal`, call `api.reject(reason)` or `api.withdraw(reason)` on confirm,
          clear the reason field on close, and update `hire`/re-render on success.
        - `onReactivateClick` (new, separate from the existing top-bar reactivate for
          `deactivated`): calls `api.reactivate()`; on a `validation_error` (400) response,
          renders the server's `fields.profileStatus` message into `#outcome-error` instead of
          only toasting — extending `renderTopActions()`'s existing branch so the top-bar
          "Reactivate profile" button (still used for `deactivated`) and the Outcome card's own
          Reactivate button (used for `rejected`/`withdrawn`) both exist without duplicating the
          deactivated case; `renderTopActions()` is only shown when `profileStatus ===
          'deactivated'` or `'active'`, exactly as today (unchanged), since reactivation for a
          closed record now lives in the Outcome card, not the page header.
        - Extend `createDefaultApi(hireId, getRole)` with
          `reject: (reason) => request(`/hires/${hireId}/reject`, 'POST', { reason })` and
          `withdraw: (reason) => request(`/hires/${hireId}/withdraw`, 'POST', { reason })`.
      Call `renderOutcomeCard()` from `renderAll()` alongside the existing `renderProfile()` /
      `renderTopActions()` / `renderRunCard()` calls.
    files:
      - public/js/hire-profile.js
    rationale: |
      Keeps the same `api.*` → `.then(updated => { hire = updated; renderAll(); })` /
      `.catch(err => ...)` shape already used for `deactivate`/`reactivate`/`saveStage` in this
      file, and reuses `isAccessDenied(err)` for the AC5 denial toast rather than inventing a
      second error-handling convention.

  - description: |
      Add `.field-error` / `.input-invalid` rules to `public/css/hire-profile.css` (copied from
      the identical, already-shipped pattern in `public/css/hire-profiles.css`) since this page
      has never needed an inline field error before; add `.status-chip--rejected` /
      `.status-chip--withdrawn` (and keep `.status-chip--active` / add
      `.status-chip--deactivated`) border/icon treatments per the prototype's
      `.status-chip--*` rules, plus a `.consequence-box` rule matching the prototype's (reusing
      this page's existing `.consequence-note` box-model, renamed/aliased so the Outcome modal's
      markup matches the prototype 1:1).
    files:
      - public/css/hire-profile.css
    rationale: |
      Keeps the visual language (icon + label + border-style, never hue alone) the prototype
      explicitly calls out as the project's accessibility baseline, consistent with every other
      status/stage chip already in this codebase.

  - description: |
      Store-level and route-level tests for AC1–AC4 and AC6 in a new `test/hires-outcome.test.js`,
      following the existing `hires-stage-pipeline.test.js` / `hires-validation.test.js` style
      (direct store calls plus `supertest` route calls against `src/server`).
    files:
      - test/hires-outcome.test.js
    rationale: ""

  - description: |
      Role-enforcement tests for AC5, extending the existing `test.each(['deactivate',
      'reactivate'])` pattern in `test/hires-role-enforcement.test.js` to also cover `reject`/
      `withdraw`.
    files:
      - test/hires-role-enforcement.test.js
    rationale: ""

  - description: |
      Frontend tests for the new Outcome card and modal in a new `test/hire-profile-outcome.test.js`,
      using the same jsdom + `fs.readFileSync(HTML_PATH)` + `initHireProfileApp(document,
      fixtureHire(), api)` harness as `test/hire-profile.test.js`.
    files:
      - test/hire-profile-outcome.test.js
    rationale: ""

tests:
  - |
    AC1 (store): candidate at an active, pre-offer stage can be marked Rejected or Withdrawn.
    ```js
    test('AC1: an active candidate at Screening can be marked Rejected', async () => {
      const hire = await createHire({ ...base, hireStage: 'screening', hiringManager: 'mgr_1' });
      const updated = await markHireOutcome(hire.id, 'rejected', 'Not a fit');
      expect(updated.profileStatus).toBe('rejected');
      expect(getHire(hire.id).profileStatus).toBe('rejected');
    });
    ```
  - |
    AC1 (route): HR/Manager PATCH-equivalent route sets the record.
    ```js
    test.each(['hr', 'manager'])('AC1: POST /hires/:id/withdraw as %s marks the record Withdrawn', async (role) => {
      const hire = await mk({ hireStage: 'interview', hiringManager: 'mgr_1' });
      const res = await request(app).post(`/hires/${hire.id}/withdraw`).set('x-staff-role', role).send({ reason: 'Accepted another offer' });
      expect(res.status).toBe(200);
      expect(res.body.profileStatus).toBe('withdrawn');
    });
    ```
  - |
    AC2: reactivating a Rejected/Withdrawn record is a field-level 400 and status is unchanged.
    ```js
    test.each(['rejected', 'withdrawn'])('AC2: reactivating a %s hire is blocked with a field-level 400', async (outcome) => {
      const hire = await mk({ hireStage: 'applied' });
      await markHireOutcome(hire.id, outcome, '');
      await expect(reactivateHire(hire.id)).rejects.toMatchObject({
        statusCode: 400,
        fields: { profileStatus: expect.stringContaining('Cannot reactivate') },
      });
      expect(getHire(hire.id).profileStatus).toBe(outcome);
    });
    ```
  - |
    AC3: advancing a Rejected/Withdrawn record's stage is a field-level 400 and stage is unchanged.
    ```js
    test.each(['rejected', 'withdrawn'])('AC3: advancing a %s hire is blocked with a field-level 400', async (outcome) => {
      const hire = await mk({ hireStage: 'interview', hiringManager: 'mgr_1' });
      await markHireOutcome(hire.id, outcome, '');
      await expect(updateHire(hire.id, { hireStage: 'offer_extended' })).rejects.toMatchObject({
        statusCode: 400,
        fields: { hireStage: expect.stringContaining('final outcome') },
      });
      expect(getHire(hire.id).hireStage).toBe('interview');
    });
    ```
  - |
    AC4: marking a deactivated candidate Rejected/Withdrawn is a field-level 400.
    ```js
    test.each(['reject', 'withdraw'])('AC4: POST /hires/:id/%s on a deactivated hire returns 400', async (action) => {
      const hire = await mk({ hireStage: 'applied' });
      await deactivateHire(hire.id);
      const res = await request(app).post(`/hires/${hire.id}/${action}`).set('x-staff-role', 'hr').send({});
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ error: 'validation_error', fields: { profileStatus: expect.stringContaining('deactivated') } });
      expect(getHire(hire.id).profileStatus).toBe('deactivated');
    });
    ```
  - |
    AC4 (store, also covers "at/past Offer stage" from scope — not deactivated but the same
    guard function): marking a candidate already at offer_extended is blocked.
    ```js
    test('marking an at-Offer candidate Rejected is blocked', async () => {
      const hire = await mk({ hireStage: 'offer_extended', hiringManager: 'mgr_1' });
      await expect(markHireOutcome(hire.id, 'rejected', '')).rejects.toMatchObject({
        statusCode: 400,
        fields: { profileStatus: expect.stringContaining('Offer stage') },
      });
    });
    ```
  - |
    AC5: a non-HR/Manager role is denied for both new actions, nothing changes.
    ```js
    test.each(['reject', 'withdraw'])('AC5: a non-HR/Manager role calling %s gets 403 and profileStatus is unchanged', async (action) => {
      const hire = await seedHire({ hireStage: 'applied' });
      const before = getHire(hire.id).profileStatus;
      const res = await request(app).post(`/hires/${hire.id}/${action}`).set('x-staff-role', 'front_desk').send({});
      expect(res.status).toBe(403);
      expect(getHire(hire.id).profileStatus).toBe(before);
    });
    ```
  - |
    AC6 (frontend): the Outcome card's status chip is visually distinguishable — distinct CSS
    class and label — for Rejected/Withdrawn vs. Active/Deactivated.
    ```js
    test('AC6: a withdrawn hire renders a distinct status chip, not the active/deactivated ones', () => {
      const api = {};
      const { initHireProfileApp } = require('../public/js/hire-profile');
      initHireProfileApp(document, { ...fixtureHire(), hireStage: 'interview', profileStatus: 'withdrawn' }, api);
      const chip = document.getElementById('outcome-status-chip');
      expect(chip.innerHTML).toContain('status-chip--withdrawn');
      expect(chip.innerHTML).not.toContain('status-chip--active');
      expect(chip.innerHTML).not.toContain('status-chip--deactivated');
    });
    ```
  - |
    AC2/AC3 (frontend field-level error): clicking Reactivate on a withdrawn record's Outcome
    card shows the inline error, not just a toast.
    ```js
    test('AC2 (UI): Reactivate on a withdrawn record shows a field-level error', async () => {
      const api = { reactivate: () => Promise.reject({ status: 400, error: 'validation_error', fields: { profileStatus: 'Cannot reactivate — status is Withdrawn.' } }) };
      const { initHireProfileApp } = require('../public/js/hire-profile');
      initHireProfileApp(document, { ...fixtureHire(), hireStage: 'interview', profileStatus: 'withdrawn' }, api);
      document.getElementById('reactivate-outcome-btn').click();
      await Promise.resolve(); await Promise.resolve();
      const err = document.getElementById('outcome-error');
      expect(err.hidden).toBe(false);
      expect(err.textContent).toContain('Cannot reactivate');
    });
    ```

assumptions_or_open_questions:
  - |
    The approved prototype (`.arc/designs/TEST-M1-STORY-189-design.html`) is built around a
    brand-new, self-contained "Candidate Pipeline" list screen (its own fixture candidates,
    its own stage vocabulary `applied/phone_screen/interview/offer/hired`, its own filter bar,
    row-level Reject/Withdraw/Advance/Reactivate actions) plus a "Candidate Record" detail
    screen with a separate "Recruiting stage" card driven by a single "Advance" button. The
    real app has no such list screen or Advance-button pattern: the closest real screens are
    `public/hire-profiles.html` (the all-candidates directory, whose own in-repo scope note
    explicitly defers "an active/deactivated status toggle" as "a separate story" — i.e. the
    same category of control this story would add) and `public/hire-profile.html` (the
    single-record page, which already edits `hireStage` via an inline `<select>` + "Save
    profile" button, not a dedicated "Advance" button). This plan therefore builds Reject/
    Withdraw/Reactivate-for-closed-records only into `hire-profile.html` (mirroring exactly
    where 171 put Deactivate/Reactivate), takes the Outcome card's component breakdown (status
    chip, contextual buttons, field-error slot, reason-modal with consequence box) directly from
    the prototype, and does **not** add a new pipeline list screen, a new Advance button, or any
    row-level actions to `hire-profiles.html`. Flagging this explicitly per instructions since it
    is a deliberate narrowing of the prototype's screen count to fit the real app's existing
    screen boundaries, not an oversight.
  - |
    AC3's existing stage-advance UI in `hire-profile.html` (the inline `<select>` +
    "Save profile" button) is only rendered at all when `canEditStage` is true, which already
    requires `hire.profileStatus === 'active'`. Once a record is `rejected`/`withdrawn` that
    condition is already false (same as it already is for `deactivated` today), so the
    stage-editing UI naturally disappears with no code change beyond what AC3 already requires
    at the store/route layer. AC3 is therefore verified at the store/route level only
    (`test/hires-outcome.test.js`); there is no "click Advance, see it blocked" UI test, because
    the real app's UI never exposes an Advance control for a non-active record in the first
    place (this mirrors how AC7 in `hires-stage-pipeline.test.js` — deactivated hires can't
    advance — is also store/route-only today).
  - |
    "Before the Offer stage" (AC1 scope line) is read as: `hireStage` index strictly before
    `offer_extended`'s index in `CANDIDATE_STAGES` — i.e. `applied`, `screening`, or `interview`.
    `offer_extended` and `offer_accepted` are excluded, matching the design's reference table row
    "Mark an Active candidate already at Offer or Hired → Not offered".
  - |
    No new stage/status history/timeline array is added to the hire record (the prototype's
    "Stage & status history" list). AC6 only requires the Rejected/Withdrawn status itself to be
    visually distinguishable from Active/Deactivated when viewing the record, which the new
    status chip satisfies; the existing `auditLog`/`runHistory` arrays serve a different,
    unrelated purpose (onboarding-run audit trail) and are left untouched.
  - |
    The reason text captured on Reject/Withdraw is stored as a new `outcomeReason` field on the
    hire record (not surfaced elsewhere in this plan) since no AC requires displaying it back;
    it is accepted and persisted only because the approved prototype's confirm dialog collects
    it, and dropping a field the user just typed into a modal felt riskier than storing it.

package_dependencies: []

notes: |
  This hire record model already lives entirely in `src/hires/store.js` as an in-memory `Map`;
  `profileStatus` today only takes `'active'` / `'deactivated'`. The flow this plan adds:

  ```mermaid
  flowchart TD
    classDef touched fill:#f96,color:#000

    routes["src/hires/routes.js"]:::touched
    store["src/hires/store.js"]:::touched
    auth["src/runs/auth.js\nenforceOnboardingRole (reused, untouched)"]
    html["public/hire-profile.html"]:::touched
    js["public/js/hire-profile.js"]:::touched
    css["public/css/hire-profile.css"]:::touched

    js -->|"fetch POST /hires/:id/reject|withdraw|reactivate"| routes
    routes -->|"enforceOnboardingRole"| auth
    routes -->|"markHireOutcome / reactivateHire"| store
    html -->|"loaded by"| js
    js -->|"styled by"| css
    store -->|"assertValidStageTransition also blocks\nPATCH hireStage once closed (AC3)"| routes
  ```

  The two existing deactivate/reactivate routes and the stage-pipeline validation
  (`assertValidStageTransition`) added in prior stories (171, 188) are the direct precedent this
  plan extends rather than replaces.

review_focus: |
  In scope: new `rejected`/`withdrawn` `profileStatus` values, their validation guards in
  `src/hires/store.js`, two new routes, and a new "Outcome" card + confirm modal on
  `public/hire-profile.html` only. Out of scope (see assumptions): a new pipeline list screen,
  a dedicated "Advance" stage button, and any row-level actions on `public/hire-profiles.html` —
  the prototype shows all three, but the real app's existing screen boundaries (established by
  prior stories 171/188) don't have a home for them without inventing new screens the ACs don't
  require. The riskiest spot is the interaction between `assertValidOutcome`'s stage-position
  check and `assertValidStageTransition`'s own guards — both read `CANDIDATE_STAGES` and must
  stay in sync if that array ever changes order. Also worth double-checking: `reactivateHire`'s
  pre-existing silent no-op (returns the hire unchanged, no error) for a record that's already
  `active` is preserved as-is; only the `rejected`/`withdrawn` path now throws.
