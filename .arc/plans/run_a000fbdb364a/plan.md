summary: |
  Investigation shows the behavior this story asks for is already enforced in `main`:
  the `assertValidStageTransition` guard added to `src/hires/store.js` by
  TEST-M1-STORY-188 (commit `b1fec9a`) already throws `Cannot change stage on a
  deactivated hire.` for any `hireStage`-changing `PATCH` while `profileStatus` is
  `'deactivated'` (AC1), already leaves non-stage edits untouched for a deactivated
  hire since the check only fires when `hireStage` is actually changing (AC2), and
  `reactivateHire` flips `profileStatus` back to `'active'` without ever touching
  `hireStage`, so a hire reactivated from a pre-onboarding stage (e.g. `interview`)
  can resume forward movement (AC3) while a hire reactivated from `offer_accepted`
  (the only stage that ever triggers an onboarding run) is still rejected by the
  existing forward-only/no-stage-after-`offer_accepted` rules (AC4). The one real
  gap is coverage: the existing regression test for AC1
  (`test/hires-stage-pipeline.test.js` "AC7") only exercises the store function
  directly, and nothing exercises the HTTP route or the full
  deactivate-then-reactivate lifecycle end to end. This plan adds a single new test
  file that locks in all four acceptance criteria at both the store and HTTP-route
  level; no production code changes are expected.

scope:
  - description: |
      Add an HTTP-route-level regression test proving `PATCH /hires/:id` rejects a
      stage change while the hire is deactivated (AC1 currently only has
      store-level coverage via `test/hires-stage-pipeline.test.js` "AC7").

      ```js
      test('AC1: PATCH stage on a deactivated hire is rejected via the HTTP route', async () => {
        const hire = await mk({ hireStage: 'applied' });
        await deactivateHire(hire.id);
        const res = await request(app).patch(`/hires/${hire.id}`)
          .set('x-staff-role', 'manager')
          .send({ hireStage: 'screening', hiringManager: 'mgr_1' });
        expect(res.status).toBe(400);
        expect(res.body).toMatchObject({ error: 'validation_error', fields: { hireStage: 'Cannot change stage on a deactivated hire.' } });
        expect(getHire(hire.id).hireStage).toBe('applied');
      });
      ```
    files:
      - test/hires-deactivation-stage-lock.test.js
    rationale: |
      No code change: the 400 is already thrown by the `hire.profileStatus ===
      'deactivated'` check in `assertValidStageTransition`
      (`src/hires/store.js:60-62`), reached from `PATCH /hires/:id` via
      `updateHire`. This test just adds the missing route-level proof so a future
      refactor of `routes.js` (e.g. changing how errors are mapped to status codes)
      can't silently break this without a test failing.

  - description: |
      Add tests proving non-stage edits (contact info) are still accepted while a
      hire is deactivated, at both the store and HTTP level.

      ```js
      test('AC2: contact-info edits are accepted while a hire is deactivated', async () => {
        const hire = await mk({ hireStage: 'interview', hiringManager: 'mgr_1' });
        await deactivateHire(hire.id);
        const updated = await updateHire(hire.id, { name: 'New Name', email: 'new@x.com', phone: '555-9999', startDate: '2026-12-01' });
        expect(updated).toMatchObject({ name: 'New Name', email: 'new@x.com', phone: '555-9999', startDate: '2026-12-01', profileStatus: 'deactivated' });
      });

      test('AC2: PATCH /hires/:id for contact info succeeds via the HTTP route while deactivated', async () => {
        const hire = await mk({ hireStage: 'interview', hiringManager: 'mgr_1' });
        await deactivateHire(hire.id);
        const res = await request(app).patch(`/hires/${hire.id}`).set('x-staff-role', 'hr').send({ phone: '555-0000' });
        expect(res.status).toBe(200);
        expect(res.body.phone).toBe('555-0000');
      });
      ```
    files:
      - test/hires-deactivation-stage-lock.test.js
    rationale: |
      No code change: `assertValidStageTransition` only evaluates the deactivated
      check when `stageChanging` is true (`'hireStage' in changes && changes.hireStage
      !== hire.hireStage`), so a `changes` object with no `hireStage` key never
      reaches that branch. This pins down the "unless already blocked by an existing
      rule" carve-out in the AC by deliberately choosing fields (`name`, `email`,
      `phone`, `startDate`) that don't trip the separate pre-existing
      hiringManager-clearing rule.

  - description: |
      Add a test proving a hire reactivated from a pre-onboarding stage (one that
      never reached `offer_accepted`, so no onboarding run was ever triggered) can
      resume forward stage progression.

      ```js
      test('AC3: a reactivated hire with pre-onboarding stages remaining can advance its stage', async () => {
        const hire = await mk({ hireStage: 'interview', hiringManager: 'mgr_1' });
        await deactivateHire(hire.id);
        await reactivateHire(hire.id);
        const updated = await updateHire(hire.id, { hireStage: 'offer_extended' });
        expect(updated.hireStage).toBe('offer_extended');
      });
      ```
    files:
      - test/hires-deactivation-stage-lock.test.js
    rationale: |
      No code change: `reactivateHire` (`src/hires/store.js:165-178`) sets
      `hire.profileStatus = 'active'` unconditionally and never touches
      `hire.hireStage`, so once reactivated the deactivated-check in
      `assertValidStageTransition` no longer fires and the ordinary forward-only
      single-step rule (already covered for the non-deactivated path by
      `test/hires-stage-pipeline.test.js`) takes back over.

  - description: |
      Add a test proving a hire reactivated from `offer_accepted` (the only stage
      that ever triggers `engineClient.triggerRun`, i.e. "onboarding already
      triggered before deactivation") still cannot have its stage changed after
      reactivation.

      ```js
      test('AC4: a reactivated hire whose onboarding already triggered before deactivation cannot change stage', async () => {
        const hire = await mk({ hireStage: 'offer_accepted' });
        await deactivateHire(hire.id);
        await reactivateHire(hire.id);
        await expect(updateHire(hire.id, { hireStage: 'interview' }))
          .rejects.toMatchObject({ statusCode: 400 });
        expect(getHire(hire.id).hireStage).toBe('offer_accepted');
      });
      ```
    files:
      - test/hires-deactivation-stage-lock.test.js
    rationale: |
      No code change: `offer_accepted` is the last entry in `CANDIDATE_STAGES`, so
      once reactivated (`profileStatus` back to `'active'`, `hireStage` still
      `'offer_accepted'`), any different target stage is rejected by the existing
      backward-move / invalid-stage checks in `assertValidStageTransition`
      (`src/hires/store.js:64-77`) — the same mechanism that already blocks this,
      just exercised through the deactivate-then-reactivate path instead of the
      plain non-deactivated path `test/hires-stage-pipeline.test.js` already covers.

tests:
  - |
    AC1: `PATCH /hires/:id` on a deactivated hire returns 400 with
    `fields: { hireStage: 'Cannot change stage on a deactivated hire.' }` and leaves
    `hireStage` unchanged — see the route-level snippet above. (Store-level
    equivalent already exists as `test/hires-stage-pipeline.test.js` "AC7".)
  - |
    AC2: `updateHire` and `PATCH /hires/:id` both accept edits to `name`, `email`,
    `phone`, `startDate` on a deactivated hire and return 200 with the new values
    persisted — see the two snippets above.
  - |
    AC3: after `deactivateHire` + `reactivateHire` on a hire still at a
    pre-`offer_accepted` stage, `updateHire(hire.id, { hireStage: <next stage> })`
    succeeds and `updated.hireStage` reflects the move — see the snippet above.
  - |
    AC4: after `deactivateHire` + `reactivateHire` on a hire that reached
    `offer_accepted` before being deactivated, `updateHire(hire.id, { hireStage: <any other stage> })`
    rejects with `statusCode: 400` and `getHire(hire.id).hireStage` stays
    `'offer_accepted'` — see the snippet above.

assumptions_or_open_questions:
  - |
    No production-code gap was found for any of the four acceptance criteria.
    AC1 is enforced by the `hire.profileStatus === 'deactivated'` check in
    `assertValidStageTransition` (`src/hires/store.js:60-62`, added by
    TEST-M1-STORY-188 / commit `b1fec9a`); AC2 falls out of that check only firing
    when `hireStage` is actually changing; AC3 and AC4 fall out of `reactivateHire`
    restoring `profileStatus` without touching `hireStage`, combined with the
    pre-existing forward-only/no-stage-after-`offer_accepted` rules. This plan is
    therefore test-only. Flagging this explicitly since the story description
    ("closing the current gap where stage changes are still accepted while
    deactivated") implies a gap that, on inspection of current `main`, no longer
    exists — it was apparently closed incidentally by the TEST-M1-STORY-188 work.
  - |
    AC4's "onboarding was already triggered before deactivation" is interpreted as
    "the hire's `hireStage` had reached `offer_accepted`" — that is the only point
    in the codebase where `engineClient.triggerRun` fires from a stage change
    (`src/hires/store.js:95-101,134-137`). There is no separate
    `onboardingStatus`/run-history-based flag feeding the stage guard, so this is
    the only coherent reading available from the existing code.
  - |
    `public/js/hire-profile.js:110` already computes
    `canEditStage = hire.hireStage !== 'offer_accepted' && hire.profileStatus === 'active'`,
    which independently matches all four ACs on the frontend. Since the story's
    scope note says this extends "the existing deactivate/reactivate endpoints" (an
    API-level description) and no AC mentions rendering, no UI test changes are
    included here.
  - |
    If review determines the intent was actually a *new, more specific* error
    shape/code for the deactivated-stage-change case (rather than reusing the
    existing generic `validation_error` / `hireStage` field message), that would be
    a scope change requiring an actual `src/hires/store.js` edit and should be
    raised before implementation starts.

package_dependencies: []

notes: |
  This plan intentionally has no `src/` changes. The single new test file
  (`test/hires-deactivation-stage-lock.test.js`) follows the existing
  one-file-per-story convention for the hires resource (see
  `test/hires-stage-pipeline.test.js`, `test/hires-validation.test.js`,
  `test/hires-role-enforcement.test.js`) and mirrors the existing dual
  store-level/HTTP-route-level split (`test/hires-store.test.js` vs.
  `test/hires.test.js`). No mermaid diagram is included since only one file is
  touched and it's purely additive test coverage, not a cross-layer change.

review_focus: |
  Expect this PR to contain only a new test file and zero `src/` diff — that is
  the deliberate outcome of this plan, not an incomplete implementation, so don't
  flag an empty production diff as a miss. The one judgment call worth
  double-checking is the AC4 interpretation: "onboarding already triggered before
  deactivation" is read as "hireStage had reached `offer_accepted`" purely because
  that's the only trigger point in the current code; if the product intent was
  broader (e.g. keyed off `onboardingStatus` or run history instead of
  `hireStage`), the fix would need a real code change to
  `assertValidStageTransition` and this plan's scope would need to change. Also
  confirm the AC1 HTTP-route test and AC2 contact-field tests are genuinely new
  coverage and not duplicates of existing assertions before merging.
