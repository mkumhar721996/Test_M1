summary: |
  Investigation shows the behavior required by this work item is already implemented and tested
  on `main` (merged as part of PR #81 / TEST-M1-STORY-155, "New-Hire Profile Creation &
  Editing"), even though that PR's title doesn't mention it. `src/hires/store.js` already
  triggers an onboarding run via `engineClient.triggerRun` on `createHire` and on `updateHire`
  whenever hire stage transitions to `offer_accepted`, and already cancels + restarts the active
  run via `engineClient.cancelRun` + `engineClient.triggerRun` whenever department or role changes
  while a run is active, leaving contact-info/start-date-only edits untouched. `test/hires-store.test.js`
  already contains tests labeled AC1–AC4 that match this story's AC1–AC5 almost one-for-one. This
  plan therefore does NOT add new production behavior. It closes three small test-coverage gaps
  that the existing suite leaves open (isolated single-field role/department changes, the
  pre-offer negative case, and HTTP-layer round-trips), run-verifies the full suite, and documents
  a fallback in case any gap test turns up a real latent bug. The goal is to leave this story with
  its own explicit, complete AC-traceable test coverage rather than relying on tests that happen
  to have been written under a different story's PR.
scope:
  - description: |
      Add two isolated characterization tests to `test/hires-store.test.js` that change ONLY
      `role` or ONLY `department` (not both at once) on a hire with an active run, asserting the
      run is still cancelled-and-restarted. The existing AC2/AC3 tests only exercise changing
      both fields simultaneously, which cannot distinguish `departmentChanging || roleChanging`
      (correct, matches AC wording "department or role") from a latent `&&` bug that would only
      trip when both change together.
    files:
      - test/hires-store.test.js
    rationale: |
      AC3 and AC4 both say "WHEN the hire's department or role is changed" (disjunctive). The
      current implementation in src/hires/store.js (lines 79-81: `roleOrDeptChanging =
      departmentChanging || roleChanging`) already satisfies this, but no existing test isolates
      a single-field change, so a future regression to `&&` semantics would go undetected.
  - description: |
      Add a negative-path test to `test/hires-store.test.js`: a hire still in `draft` stage
      (never reached `offer_accepted`, so `hire.run` is `null`) has its department and role
      changed in the same `updateHire` call. Assert no run is started: `expect(updated.run).toBeNull()`.
    files:
      - test/hires-store.test.js
    rationale: |
      AC3/AC4 are scoped to "WHEN an onboarding run is active for a hire." The implementation
      already guards this via `hasActiveRun` before taking the cancel+restart branch, but nothing
      currently proves that changing role/department on a hire that was never offer-accepted
      stays a no-op for run state — an easy regression to introduce if someone later simplifies
      the `hasActiveRun` / `roleOrDeptChanging` branching in src/hires/store.js.
  - description: |
      Add two HTTP-level round-trip tests to `test/hires.test.js`: (1) PATCH a draft hire's
      `hireStage` to `offer_accepted` and assert the response body's `run` is `{ status:
      'active', department, role }` (AC1 edit path, exercised through the route layer, not just
      the store); (2) PATCH an offer-accepted hire's `department`/`role` and assert the response
      `run.id` differs from the prior run id and `runHistory` contains the cancelled original
      (AC3/AC4 through the route layer).
    files:
      - test/hires.test.js
    rationale: |
      `test/hires-store.test.js` only calls `updateHire` directly. `src/hires/routes.js`
      whitelists patchable fields via `PATCHABLE_FIELDS` before delegating to the store — nothing
      currently proves the public HTTP contract (what a real client hits) carries the run-handoff
      behavior through, only that the store function does in isolation.
  - description: |
      Run the full suite (`npm test`) after adding the above tests. All new tests are expected to
      pass against the current, unmodified `src/hires/store.js` / `src/hires/routes.js` /
      `src/onboarding/engineClient.js` — no production code changes are anticipated. If any new
      test fails, treat it as a real bug uncovered by this story's own coverage and fix it
      minimally in `src/hires/store.js` (the branching already lives at lines 73-105), not by
      weakening the test.
    files:
      - src/hires/store.js
    rationale: |
      Stated as a scope item (not just a test item) because it is the contingency path: if a gap
      test fails, this is the one file where the fix would land, per the existing branch
      structure (`changingToOfferAccepted`, `hasActiveRun`, `roleOrDeptChanging`).
tests:
  - |
    test('AC3/AC4: changing only role (department unchanged) cancels and restarts the active run', async () => {
      const hire = await createHire({ name: 'A', department: 'Engineering', role: 'Engineer II', startDate: '2026-10-05', hireStage: 'offer_accepted' });
      const originalRunId = getHire(hire.id).run.id;
      const updated = await updateHire(hire.id, { role: 'Senior Engineer' });
      expect(updated.run.id).not.toBe(originalRunId);
      expect(updated.runHistory).toContainEqual(expect.objectContaining({ id: originalRunId, status: 'cancelled', reason: 'role_or_department_changed' }));
      expect(updated.run).toMatchObject({ status: 'active', department: 'Engineering', role: 'Senior Engineer' });
    });
  - |
    test('AC3/AC4: changing only department (role unchanged) cancels and restarts the active run', async () => {
      const hire = await createHire({ name: 'A', department: 'Engineering', role: 'Engineer II', startDate: '2026-10-05', hireStage: 'offer_accepted' });
      const originalRunId = getHire(hire.id).run.id;
      const updated = await updateHire(hire.id, { department: 'Product' });
      expect(updated.run.id).not.toBe(originalRunId);
      expect(updated.run).toMatchObject({ status: 'active', department: 'Product', role: 'Engineer II' });
    });
  - |
    test('AC3/AC4 (negative): changing department/role on a hire with no active run does not start one', async () => {
      const hire = await createHire({ name: 'A', department: 'Engineering', role: 'Engineer II', startDate: '2026-10-05', hireStage: 'draft' });
      const updated = await updateHire(hire.id, { department: 'Product', role: 'Product Manager' });
      expect(updated.run).toBeNull();
    });
  - |
    test('AC2: PATCH /hires/:id with hireStage offer_accepted triggers a run over HTTP', async () => {
      const created = await request(app).post('/hires').send({ name: 'A', email: 'a@x.com', phone: '1', startDate: '2026-10-05', department: 'Sales', role: 'AE', hireStage: 'draft' });
      const res = await request(app).patch(`/hires/${created.body.id}`).send({ hireStage: 'offer_accepted' });
      expect(res.status).toBe(200);
      expect(res.body.run).toMatchObject({ status: 'active', department: 'Sales', role: 'AE' });
    });
  - |
    test('AC3/AC4: PATCH /hires/:id changing department/role cancels and restarts the run over HTTP', async () => {
      const created = await request(app).post('/hires').send({ name: 'A', email: 'a@x.com', phone: '1', startDate: '2026-10-05', department: 'Engineering', role: 'Engineer II', hireStage: 'offer_accepted' });
      const originalRunId = created.body.run.id;
      const res = await request(app).patch(`/hires/${created.body.id}`).send({ department: 'Product', role: 'Product Manager' });
      expect(res.status).toBe(200);
      expect(res.body.run.id).not.toBe(originalRunId);
      expect(res.body.runHistory).toContainEqual(expect.objectContaining({ id: originalRunId, status: 'cancelled' }));
    });
  - |
    Full-suite check: run `npm test` and confirm `test/hires-store.test.js` and `test/hires.test.js`
    (including the five new tests above) pass with zero changes to `src/hires/store.js`,
    `src/hires/routes.js`, or `src/onboarding/engineClient.js`.
assumptions_or_open_questions:
  - |
    Assuming the tests already present in test/hires-store.test.js (labeled "AC1" through "AC4"
    in that file) are in fact this story's AC1-AC4 even though they were merged under PR #81,
    titled for TEST-M1-STORY-155. The branch for this work item (TEST-M1-STORY-156) was cut from
    main AFTER that merge, and src/hires/store.js / src/onboarding/engineClient.js already contain
    the full trigger/cancel/restart logic plus matching tests, with no open diff for this item.
    If this is wrong (i.e. the reviewer knows of a reason this behavior must be re-implemented or
    moved to a different module/service boundary — e.g. a planned real integration with
    src/runs/store.js's startRun/workflow engine instead of the stub src/onboarding/engineClient.js),
    that would change this plan substantially and should be called out before finalizing.
  - |
    Assuming `src/onboarding/engineClient.js` is the intended, deliberate integration boundary for
    this story (per the parent epic's "hand the hire off to trigger their onboarding run" wording
    and this story's explicit exclusion of "the run's own step mechanics, owned by Onboarding Run
    Tracking"), i.e. it is correct that this store never calls src/runs/store.js directly. No
    evidence in the codebase suggests these two "run" concepts (the hires-store stub run vs. the
    runs-store workflow run) are meant to be unified by this story.
  - |
    Assuming no UI changes are needed: public/js/hire-profile.js already renders run state,
    confirmation copy, and pending banners for stage changes and role/department changes
    (see public/js/hire-profile.js lines 163-379 and the passing tests in test/hire-profile.test.js),
    so this plan treats the front end as already covered and out of scope for new work.
package_dependencies: []
notes: |
  Evidence this story's behavior already ships on `main` (HEAD: commit `24ac1ae`, PR #81,
  TEST-M1-STORY-155):

  - `src/hires/store.js` `createHire`: if `hireStage === 'offer_accepted'`, calls
    `engineClient.triggerRun({ hireId, department, role })` and stores the result on `hire.run`
    (AC1).
  - `src/hires/store.js` `updateHire`: computes `changingToOfferAccepted`, `departmentChanging`,
    `roleChanging`, `roleOrDeptChanging`, and `hasActiveRun`, then either triggers a run (AC2),
    or cancels the old run + triggers a new one and pushes the cancelled run onto `runHistory`
    (AC3/AC4), or just applies the changes with the run left untouched (AC5) — see
    src/hires/store.js lines 73-105.
  - `test/hires-store.test.js` already has tests literally labeled AC1 (create triggers run),
    AC1 (update to offer_accepted triggers run), AC2 (role/department change cancels run), AC3
    (role/department change starts new run), AC4 (contact/start-date change leaves run
    unaffected) — a near-exact match for this story's AC1-AC5.
  - `test/hires.test.js` has an HTTP-level test for the create-triggers-run path (AC1) but none
    yet for the PATCH-triggers-run (AC2) or PATCH-role/department-restarts-run (AC3/AC4) paths —
    this is the main gap this plan closes.

  This plan is deliberately a verification + gap-closing plan, not a feature-build plan. Per the
  planning guidance to stay strictly within scope and avoid speculative work, it does not touch
  `src/runs/store.js`, `src/onboarding/engineClient.js`, or the UI, since none of those need
  changes to satisfy AC1-AC5 as written.

  No diagram included: this plan's scope is two existing test files plus a documented contingency
  in one already-read, unchanged source file — not new cross-module wiring.
review_focus: |
  This plan found that TEST-M1-STORY-156's acceptance criteria already pass against the current
  `main` (shipped incidentally under PR #81 / TEST-M1-STORY-155), so the only new work is closing
  test-coverage gaps (isolated single-field role/department changes, the pre-offer negative case,
  and two HTTP-layer round-trips) — hold the review to "do these new tests genuinely exercise the
  AC wording and pass against unmodified code," not "was new production behavior added." The
  riskiest assumption to double check is that `src/onboarding/engineClient.js` (a stub) is the
  correct, deliberate integration boundary rather than a placeholder this story was actually meant
  to replace with a real call into `src/runs/store.js`'s workflow engine — if that assumption is
  wrong, this plan under-scopes the story significantly.
