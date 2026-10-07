summary: |
  Extend the existing hire record model with a fixed pre-offer recruiting pipeline
  (applied -> screening -> interview -> offer_extended -> offer_accepted) and a
  hiringManager field. `updateHire` in `src/hires/store.js` gains a stage-transition
  guard that enforces forward-only, single-step movement once a hire is already in
  one of the five pipeline stages, requires `hiringManager` to be set (by this change
  or already on the record) for any target stage from screening onward, and blocks any
  stage change while the hire is deactivated. The guard is deliberately scoped to only
  fire when both the current and target stage are recognized pipeline stages, so the
  pre-existing `draft` stage and the existing `offer_accepted` onboarding-run trigger
  keep working exactly as today for hires that never enter the new pipeline. Role
  enforcement (`enforceOnboardingRole`), the required-field validator
  (`assertValidHire`), and the `offer_accepted -> engineClient.triggerRun` wiring are
  reused unchanged.

scope:
  - description: |
      Add the fixed candidate-stage order and a stage-transition guard to the hires
      store, and wire it into `updateHire` before the existing run-triggering branches.

      ```js
      const CANDIDATE_STAGES = ['applied', 'screening', 'interview', 'offer_extended', 'offer_accepted'];

      function assertValidStageTransition(hire, changes) {
        if (!('hireStage' in changes) || changes.hireStage === hire.hireStage) return;

        if (hire.profileStatus === 'deactivated') {
          throw new HireValidationError('validation_error', { hireStage: 'Cannot change stage on a deactivated hire.' });
        }

        const fromIdx = CANDIDATE_STAGES.indexOf(hire.hireStage);
        const toIdx = CANDIDATE_STAGES.indexOf(changes.hireStage);
        if (fromIdx === -1 || toIdx === -1) return;

        if (toIdx < fromIdx) {
          throw new HireValidationError('validation_error', { hireStage: 'Stage cannot move backward.' });
        }
        if (toIdx > fromIdx + 1) {
          throw new HireValidationError('validation_error', { hireStage: 'Stage cannot skip ahead.' });
        }

        const nextHiringManager = 'hiringManager' in changes ? changes.hiringManager : hire.hiringManager;
        if (toIdx >= 1 && (!nextHiringManager || !String(nextHiringManager).trim())) {
          throw new HireValidationError('validation_error', { hiringManager: 'Hiring manager is required from Screening onward.' });
        }
      }
      ```

      Call `assertValidStageTransition(hire, changes)` in `updateHire` immediately after
      the existing `assertValidHire(...)` call and before the `changingToOfferAccepted`
      branching, so required-field errors still take priority (matches the existing
      `hires-validation.test.js` case that clears `department` while also setting
      `hireStage: 'offer_accepted'`). Also add `hiringManager: null` to the seeded
      `hire_2031` record for model consistency.
    files:
      - src/hires/store.js
    rationale: |
      `updateHire` is the single place that already validates and applies hire field
      changes and owns the `offer_accepted` onboarding-run trigger, so the new guard
      composes with (and runs strictly before) that existing logic instead of
      duplicating it. Gating both the forward-only check and the hiringManager
      requirement on "both from and to stages are recognized pipeline stages" is what
      keeps the pre-existing `draft -> offer_accepted` direct-update test
      (`test/hires-store.test.js` "AC1: updating a draft profile to offer_accepted
      triggers an onboarding Run") passing unchanged, since `draft` is intentionally
      not one of the five pipeline stages.

  - description: |
      Add `hiringManager` to the set of PATCH-able fields so it can be set on its own
      or alongside a `hireStage` change in the same request.

      ```js
      const PATCHABLE_FIELDS = ['name', 'email', 'phone', 'startDate', 'department', 'role', 'hireStage', 'hiringManager'];
      ```
    files:
      - src/hires/routes.js
    rationale: |
      `pickFields(req.body, PATCHABLE_FIELDS)` already whitelists what `PATCH
      /hires/:id` accepts; without this addition `hiringManager` sent by a client
      would be silently dropped before it ever reaches `updateHire`.

  - description: |
      New test file covering all seven acceptance criteria against both the store
      functions directly (unit level) and the HTTP routes (role header + response
      shape), mirroring the existing split between `test/hires-store.test.js` and
      `test/hires.test.js`.
    files:
      - test/hires-stage-pipeline.test.js
    rationale: |
      Keeps this story's tests isolated in their own file per the existing
      one-test-file-per-story convention for the hires resource (e.g.
      `hires-validation.test.js`, `hires-role-enforcement.test.js`) rather than
      growing an unrelated existing file.

tests:
  - |
    AC1 (store level): advancing Applied -> Screening with hiringManager set succeeds.
    ```js
    const hire = await createHire({ name: 'A', email: 'a@x.com', phone: '1', startDate: '2026-10-05', department: 'Engineering', role: 'Engineer II', hireStage: 'applied' });
    const updated = await updateHire(hire.id, { hireStage: 'screening', hiringManager: 'mgr_1' });
    expect(updated.hireStage).toBe('screening');
    ```
    AC1 (route level, both roles): `test.each(['hr','manager'])` PATCHes
    `{ hireStage: 'screening', hiringManager: 'mgr_1' }` on a freshly created
    `applied` hire via `request(app).patch(...).set('x-staff-role', role)` and
    asserts `res.status === 200 && res.body.hireStage === 'screening'`.
  - |
    AC2: moving a hire at Interview back to Screening is blocked.
    ```js
    const hire = await createHire({ ..., hireStage: 'applied' });
    await updateHire(hire.id, { hireStage: 'screening', hiringManager: 'mgr_1' });
    await updateHire(hire.id, { hireStage: 'interview' });
    await expect(updateHire(hire.id, { hireStage: 'screening' }))
      .rejects.toMatchObject({ statusCode: 400, fields: { hireStage: 'Stage cannot move backward.' } });
    expect(getHire(hire.id).hireStage).toBe('interview');
    ```
  - |
    AC3: a hire at Applied cannot be set directly to Interview, skipping Screening.
    ```js
    const hire = await createHire({ ..., hireStage: 'applied' });
    await expect(updateHire(hire.id, { hireStage: 'interview', hiringManager: 'mgr_1' }))
      .rejects.toMatchObject({ statusCode: 400, fields: { hireStage: 'Stage cannot skip ahead.' } });
    expect(getHire(hire.id).hireStage).toBe('applied');
    ```
  - |
    AC4: hiringManager assigned to a different user than the requester does not gate
    the stage change (route level).
    ```js
    const hire = await createHire({ ..., hireStage: 'screening', hiringManager: 'mgr_other' });
    const res = await request(app).patch(`/hires/${hire.id}`).set('x-staff-role', 'hr').send({ hireStage: 'interview' });
    expect(res.status).toBe(200);
    expect(res.body.hireStage).toBe('interview');
    ```
  - |
    AC5: advancing Applied -> Screening with no hiringManager set is blocked with a
    field-level error (store and route level).
    ```js
    const hire = await createHire({ ..., hireStage: 'applied' });
    await expect(updateHire(hire.id, { hireStage: 'screening' }))
      .rejects.toMatchObject({ statusCode: 400, fields: { hiringManager: 'Hiring manager is required from Screening onward.' } });
    ```
    ```js
    const res = await request(app).patch(`/hires/${created.body.id}`).set('x-staff-role', 'manager').send({ hireStage: 'screening' });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'validation_error', fields: { hiringManager: 'Hiring manager is required from Screening onward.' } });
    ```
  - |
    AC6: reaching Offer Accepted through the pipeline still triggers the existing
    onboarding run.
    ```js
    const hire = await createHire({ ..., hireStage: 'applied' });
    await updateHire(hire.id, { hireStage: 'screening', hiringManager: 'mgr_1' });
    await updateHire(hire.id, { hireStage: 'interview' });
    await updateHire(hire.id, { hireStage: 'offer_extended' });
    const updated = await updateHire(hire.id, { hireStage: 'offer_accepted' });
    expect(updated.run).toMatchObject({ status: 'active', department: hire.department, role: hire.role });
    ```
  - |
    AC7: a deactivated hire record cannot advance its stage.
    ```js
    const hire = await createHire({ ..., hireStage: 'applied' });
    await deactivateHire(hire.id);
    await expect(updateHire(hire.id, { hireStage: 'screening', hiringManager: 'mgr_1' }))
      .rejects.toMatchObject({ statusCode: 400, fields: { hireStage: 'Cannot change stage on a deactivated hire.' } });
    ```

assumptions_or_open_questions:
  - |
    Stage values are stored as lowercase snake_case (`applied`, `screening`,
    `interview`, `offer_extended`, `offer_accepted`) to match the existing codebase
    convention (`hireStage: 'offer_accepted'`, `'draft'`) even though the acceptance
    criteria prose capitalizes the stage names (Applied, Screening, ...).
  - |
    The forward-only and hiringManager-required checks only activate once BOTH the
    current and target `hireStage` are one of the five pipeline stages. A hire whose
    current stage is `draft` (or any other legacy/non-pipeline value) can move
    directly to any pipeline stage, including `offer_accepted`, without hitting these
    checks — this preserves the existing `test/hires-store.test.js` and
    `test/hires.test.js` cases that jump straight from `draft` to `offer_accepted`
    with no `hiringManager`. Entry into the pipeline from `draft` (e.g. `draft` ->
    `applied`) is intentionally left unvalidated since no acceptance criterion covers
    it.
  - |
    AC7's "deactivated hire record" is assumed to mean `profileStatus === 'deactivated'`
    (the existing field set by `deactivateHire`), and the block applies to any
    `hireStage` change attempt while deactivated, not only forward moves.
  - |
    `hiringManager` is treated as an opaque string identifier/display value with no
    directory lookup or format validation beyond "present and non-blank" — consistent
    with how `department` and `role` are free-text today.
  - |
    No UI changes are included: `public/js/hire-profile.js` / `hire-profiles.js` are
    out of scope since no acceptance criterion touches rendering, only the API/store
    behavior.

package_dependencies: []

notes: |
  This mirrors the existing `offer_accepted` validation/trigger pattern already in
  `src/hires/store.js` (`assertValidHire` then `changingToOfferAccepted` branch) by
  adding a second guard function ahead of it rather than reworking that logic.

  ```mermaid
  flowchart TD
    routes[src/hires/routes.js]
    store[src/hires/store.js]
    engine[src/onboarding/engineClient.js]
    auth[src/runs/auth.js enforceOnboardingRole]
    test[test/hires-stage-pipeline.test.js]

    routes -->|"PATCH /hires/:id, now whitelists hiringManager"| store
    auth -.->|"reused unchanged, role check"| routes
    store -->|"existing offer_accepted trigger, unchanged"| engine
    test -->|"unit calls"| store
    test -->|"HTTP calls"| routes

    classDef touched fill:#f96,color:#000
    class routes,store,test touched
  ```

review_focus: |
  In scope: the `assertValidStageTransition` guard in `src/hires/store.js` (forward-only
  movement, hiringManager-required-from-screening, deactivated-blocks-any-change) and
  wiring `hiringManager` through `PATCH /hires/:id`. Out of scope: backward-move
  recovery, rejection/withdrawal flows, and any change to `deactivateHire`/
  `reactivateHire` themselves (only how `updateHire` reacts to an already-deactivated
  record). The riskiest spot is the gating condition `fromIdx === -1 || toIdx === -1`
  — it's a deliberate choice to exempt the pre-existing `draft` stage from the new
  checks so the current `draft -> offer_accepted` direct-update tests keep passing
  without a `hiringManager`; a reviewer should not read this as a missed case but
  confirm it's intentional given the story's explicit "reuses the existing
  offer_accepted trigger unchanged" scope note. Also note `hiringManager` is never
  compared against the requesting actor's identity (AC4) — it is a plain data field,
  not a permission gate.
