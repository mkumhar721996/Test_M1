summary: |
  Profile activation status (deactivate/reactivate) is already partially implemented from
  TEST-M1-STORY-155: `deactivateHire` and `reactivateHire` exist in `src/hires/store.js`, wired
  through `src/hires/routes.js` (`POST /hires/:id/deactivate` and `/reactivate`), with a matching
  UI in `public/hire-profile.html` / `public/js/hire-profile.js`. Deactivate correctly cancels any
  active run and flips `profileStatus` to `deactivated` (AC1, AC2), and reactivate correctly
  starts a brand-new run and never resumes the cancelled one (AC3, AC4), and the profile response
  always carries current `profileStatus` (AC5). The gap this story closes is AC6/AC7:
  `reactivateHire` today calls `engineClient.triggerRun` unconditionally, so reactivating a
  profile that was deactivated while still in the Draft hire stage (never reached Offer accepted)
  incorrectly starts an onboarding run. This plan adds the missing hire-stage gate — a run only
  (re)starts on reactivation when `hireStage === 'offer_accepted'` — and updates the reactivate UI
  copy/toast so HR isn't told a run started when it didn't, since the existing copy is
  unconditional.
scope:
  - description: |
      Gate `reactivateHire` so it only triggers a new onboarding run when the hire's current
      `hireStage` is `'offer_accepted'`. When the hire stage is still `'draft'`, reactivation
      flips `profileStatus` back to `'active'` but leaves `run` as `null` — no run is started and
      `hireStage` is left untouched either way (HR never has to re-set it).

      Before:
      ```js
      async function reactivateHire(id) {
        const hire = hires.get(id);
        if (!hire) return undefined;
        if (hire.profileStatus !== 'deactivated' || (hire.run && hire.run.status === 'active')) return hire;

        const run = await engineClient.triggerRun({
          hireId: hire.id,
          department: hire.department,
          role: hire.role,
        });
        hire.profileStatus = 'active';
        hire.run = { ...run, freshStart: true };
        return hire;
      }
      ```

      After:
      ```js
      async function reactivateHire(id) {
        const hire = hires.get(id);
        if (!hire) return undefined;
        if (hire.profileStatus !== 'deactivated' || (hire.run && hire.run.status === 'active')) return hire;

        if (hire.hireStage === 'offer_accepted') {
          const run = await engineClient.triggerRun({
            hireId: hire.id,
            department: hire.department,
            role: hire.role,
          });
          hire.run = { ...run, freshStart: true };
        }
        hire.profileStatus = 'active';
        return hire;
      }
      ```
    files:
      - src/hires/store.js
    rationale: |
      AC6 requires that reactivating a profile deactivated while still Draft starts no run; AC7
      requires that reactivating a profile whose hire stage is Offer accepted starts a new run
      without HR re-setting the stage. The current unconditional `triggerRun` call satisfies AC7
      but violates AC6. Gating on `hireStage` is the minimal change that satisfies both without
      touching the deactivate path (AC1/AC2, already correct) or the run-history bookkeeping
      (AC4, already correct).
  - description: |
      Add unit coverage in the existing hires store test file for the two uncovered scenarios:
      reactivating a Draft-stage profile starts no run, and reactivating an Offer-accepted
      profile leaves `hireStage` untouched while starting a fresh run.

      ```js
      test('AC6: reactivating a profile deactivated while hireStage was still draft starts no onboarding Run', async () => {
        const hire = await createHire({ name: 'A', email: 'a@x.com', phone: '1', startDate: '2026-10-05', department: 'Engineering', role: 'Engineer II', hireStage: 'draft' });
        await deactivateHire(hire.id);
        const updated = await reactivateHire(hire.id);
        expect(updated.profileStatus).toBe('active');
        expect(updated.run).toBeNull();
      });

      test('AC7: reactivating a profile with hireStage offer_accepted starts a new Run without HR re-setting the hire stage', async () => {
        const hire = await createHire({ name: 'A', email: 'a@x.com', phone: '1', startDate: '2026-10-05', department: 'Engineering', role: 'Engineer II', hireStage: 'offer_accepted' });
        await deactivateHire(hire.id);
        const updated = await reactivateHire(hire.id);
        expect(updated.hireStage).toBe('offer_accepted');
        expect(updated.run).toMatchObject({ status: 'active', freshStart: true });
      });
      ```
    files:
      - test/hires-store.test.js
    rationale: |
      These are the failing-test-first drivers for the `reactivateHire` change above: the Draft
      case fails against current code (it returns a non-null `run`), and the Offer-accepted case
      pins down the "no re-setting the hire stage" wording in AC7 as an explicit assertion rather
      than relying on the already-passing but less specific AC7 test in this file
      ("reactivating a deactivated profile starts a fresh Run from the beginning").
  - description: |
      Add route-level coverage proving the gate holds through the HTTP layer and that a
      subsequent GET reflects the resulting status (AC5), using the existing `supertest` setup in
      this file.

      ```js
      test('POST /hires/:id/reactivate on a Draft-stage profile returns active status with no Run, and GET reflects it', async () => {
        const payload = { name: 'A', email: 'a@x.com', phone: '1', startDate: '2026-10-05', department: 'Sales', role: 'AE', hireStage: 'draft' };
        const createRes = await request(app).post('/hires').send(payload);
        const { id } = createRes.body;

        await request(app).post(`/hires/${id}/deactivate`);
        const reactivateRes = await request(app).post(`/hires/${id}/reactivate`);
        expect(reactivateRes.status).toBe(200);
        expect(reactivateRes.body.profileStatus).toBe('active');
        expect(reactivateRes.body.run).toBeNull();

        const getRes = await request(app).get(`/hires/${id}`);
        expect(getRes.body.profileStatus).toBe('active');
      });
      ```
    files:
      - test/hires.test.js
    rationale: |
      Closes the gap between unit-level store coverage and the actual HTTP contract HR's client
      talks to, and gives AC5 ("the response reflects current status when queried") an explicit
      GET-based assertion rather than relying on it being implied by other tests.
  - description: |
      Update the reactivate confirmation modal so its consequence copy and the post-reactivation
      toast/pending label reflect whether a run will actually start, instead of unconditionally
      claiming "a fresh onboarding Run starts from the beginning" — which becomes false once the
      Draft-stage gate above ships. Give the copy span an id so JS can set it, then make it and
      the confirm handler conditional on `hire.hireStage`.

      `public/hire-profile.html`, inside `#reactivate-modal`, before:
      ```html
      <span>A fresh onboarding Run starts from the beginning. The previously cancelled Run is not resumed.</span>
      ```
      after:
      ```html
      <span id="reactivate-consequence-copy">A fresh onboarding Run starts from the beginning. The previously cancelled Run is not resumed.</span>
      ```

      `public/js/hire-profile.js`, `openReactivateModal` before:
      ```js
      function openReactivateModal() {
        reactivateOverlay.hidden = false;
        reactivateModal.hidden = false;
      }
      ```
      after:
      ```js
      function openReactivateModal() {
        reactivateConsequenceCopy.textContent = hire.hireStage === 'offer_accepted'
          ? 'A fresh onboarding Run starts from the beginning. The previously cancelled Run is not resumed.'
          : 'Hire stage is still Draft, so no onboarding Run will start. Set hire stage to "Offer accepted" to trigger one later.';
        reactivateOverlay.hidden = false;
        reactivateModal.hidden = false;
      }
      ```

      and the confirm handler before:
      ```js
      doc.getElementById('reactivate-confirm-btn').addEventListener('click', () => {
        closeReactivateModal();
        setPending(true, 'Starting a fresh onboarding Run…');
        api.reactivate().then((updated) => {
          hire = updated;
          setPending(false);
          renderAll();
          showToast('Profile reactivated — new onboarding Run started');
        }).catch(() => {
          setPending(false);
          renderAll();
          showToast('Reactivation could not be completed — please try again');
        });
      });
      ```
      after:
      ```js
      doc.getElementById('reactivate-confirm-btn').addEventListener('click', () => {
        const willStartRun = hire.hireStage === 'offer_accepted';
        closeReactivateModal();
        setPending(true, willStartRun ? 'Starting a fresh onboarding Run…' : 'Reactivating profile…');
        api.reactivate().then((updated) => {
          hire = updated;
          setPending(false);
          renderAll();
          showToast(hire.run ? 'Profile reactivated — new onboarding Run started' : 'Profile reactivated — no onboarding Run started (hire stage is still Draft)');
        }).catch(() => {
          setPending(false);
          renderAll();
          showToast('Reactivation could not be completed — please try again');
        });
      });
      ```
      Also declare `const reactivateConsequenceCopy = doc.getElementById('reactivate-consequence-copy');`
      alongside the other modal element lookups near the top of `initHireProfileApp`.
    files:
      - public/hire-profile.html
      - public/js/hire-profile.js
    rationale: |
      AC6/AC7 are observable through the product, not just the API; once reactivation can
      legitimately start no run, the existing unconditional copy and toast would actively
      mislead HR into believing a run started. This is the minimal UI change needed to keep the
      surfaced message truthful — no new modal, no layout change, just conditional text already
      supported by data (`hire.hireStage`, `hire.run`) the component already holds.
  - description: |
      Add jsdom coverage proving the Draft-stage reactivate path shows the correct copy and
      toast, and that the existing Offer-accepted path is unaffected.

      ```js
      test('AC6/AC7: reactivating a Draft-stage profile shows Draft-specific copy and starts no Run', async () => {
        let resolveReactivate;
        const api = { reactivate: () => new Promise((resolve) => { resolveReactivate = resolve; }) };
        const deactivatedDraftHire = { ...fixtureHire(), hireStage: 'draft', profileStatus: 'deactivated', run: null };
        const { initHireProfileApp } = require('../public/js/hire-profile');
        initHireProfileApp(document, deactivatedDraftHire, api);

        document.getElementById('reactivate-btn').click();
        expect(document.getElementById('reactivate-consequence-copy').textContent).toContain('no onboarding Run will start');

        document.getElementById('reactivate-confirm-btn').click();
        resolveReactivate({ ...deactivatedDraftHire, profileStatus: 'active', run: null });
        await Promise.resolve();
        await Promise.resolve();

        expect(document.getElementById('toast-message').textContent).toContain('no onboarding Run started');
      });
      ```
    files:
      - test/hire-profile.test.js
    rationale: |
      Guards the UI copy change against regressions and documents, in the same file as the
      existing reactivate pending-state test, the contrast between the two reactivate outcomes.
tests:
  - |
    AC1 (deactivate cancels active run): already covered by test/hires-store.test.js
    "AC6: deactivating a profile cancels its active Run" and test/hires.test.js
    "POST /hires/:id/deactivate then /reactivate starts a fresh Run" — no change needed,
    re-run as regression.
  - |
    AC2 (deactivate marks profileStatus deactivated): already covered by the same existing
    tests via `expect(updated.profileStatus).toBe('deactivated')` — no change needed, re-run
    as regression.
  - |
    AC3 (reactivate starts a brand-new run from the beginning): already covered by
    test/hires-store.test.js "AC7: reactivating a deactivated profile starts a fresh Run from
    the beginning" (`expect(updated.run).toMatchObject({ status: 'active', tasksDone: 0,
    freshStart: true })`) for the offer_accepted case — kept passing by the new hireStage gate
    since that test's hire has hireStage 'offer_accepted'.
  - |
    AC4 (cancelled run never resumed): already covered by test/hires-store.test.js "AC8: the
    previously cancelled Run is not resumed on reactivation"
    (`expect(updated.run.id).not.toBe(cancelledRunId)`) — no change needed, re-run as
    regression.
  - |
    AC5 (query reflects current status): new route-level test in test/hires.test.js asserting
    `reactivateRes.body.profileStatus === 'active'` and a follow-up `GET /hires/:id` returns
    the same `profileStatus`.
  - |
    AC6 (reactivating a Draft-stage deactivated profile starts no run): new failing-first test
    in test/hires-store.test.js — `expect(updated.run).toBeNull()` after `deactivateHire` +
    `reactivateHire` on a hire created with `hireStage: 'draft'`; fails against current code
    because `reactivateHire` unconditionally calls `engineClient.triggerRun`.
  - |
    AC7 (reactivating an Offer-accepted profile starts a new run without re-setting hire
    stage): new explicit test in test/hires-store.test.js —
    `expect(updated.hireStage).toBe('offer_accepted')` and
    `expect(updated.run).toMatchObject({ status: 'active', freshStart: true })`, plus the
    jsdom test in test/hire-profile.test.js asserting the UI never asks HR to touch hire stage
    and shows the run-started toast.
assumptions_or_open_questions:
  - |
    AC6 says "Draft (never reached Offer accepted)" — the codebase's only hireStage values
    observed are 'draft', 'offer_accepted', 'onboarding_in_progress', and 'completed' (see
    public/js/hire-profiles.js STAGE_LABELS). I've implemented the gate as "run starts only
    when hireStage === 'offer_accepted'" rather than "run starts whenever hireStage !==
    'draft'". Since a profile can only reach 'onboarding_in_progress'/'completed' via a run
    that was already running (and deactivation only happens from 'draft' or 'offer_accepted'
    per the current create/update code paths), these two phrasings are equivalent in
    practice, but I'm flagging the choice in case a future story introduces a hireStage
    reachable without an active run.
  - |
    Assumed profileStatus always flips to 'active' on reactivate regardless of whether a run
    starts (so a Draft profile can be reactivated into an active-but-run-less state, matching
    AC6's "no onboarding run starts" without blocking the status change itself) — this isn't
    stated explicitly in the ACs but follows from AC5 and from the existing guard clause's
    behavior, which already returns early only when the profile isn't deactivated or already
    has an active run, never based on hireStage.
  - |
    Treated the reactivate-modal copy/toast update as in-scope even though no AC names UI text
    directly, because the existing (story-155-built) UI would otherwise tell HR a run started
    when AC6 says it must not — flagging this in case the reviewer wants the UI change split
    into a separate pass.
package_dependencies: []
notes: |
  No new design file exists for TEST-M1-STORY-157 (`.arc/designs/` has no matching file), and the
  deactivate/reactivate UI itself was already built under TEST-M1-STORY-155 — this story is a
  targeted logic fix (hire-stage gate on reactivation) plus the minimal copy update that keeps the
  existing UI truthful once that gate ships. No new routes, modals, or endpoints are introduced.

  ```mermaid
  flowchart TD
    UI[public/js/hire-profile.js]
    HTML[public/hire-profile.html reactivate modal copy]
    Routes[src/hires/routes.js]
    Store["src/hires/store.js reactivateHire"]
    Engine[src/onboarding/engineClient.js]

    HTML -->|consequence copy id used by UI| UI
    UI -->|POST /hires/:id/reactivate| Routes
    Routes --> Store
    Store -->|triggerRun only if hireStage=offer_accepted| Engine

    classDef touched fill:#f96,color:#000
    class UI,HTML,Routes,Store touched
  ```

  Routes itself needs no code change (it already just forwards to reactivateHire and returns its
  result) — it's shown because it's the layer the new route-level test in test/hires.test.js
  exercises.
review_focus: |
  In scope: gating `reactivateHire` on `hireStage === 'offer_accepted'` so a Draft-stage
  reactivation starts no run (AC6) while an Offer-accepted one still starts a fresh run without
  HR re-touching hire stage (AC7), plus making the reactivate modal/toast copy match that
  conditional outcome. Out of scope: the deactivate path, run-history/audit-log bookkeeping, and
  any role/department-triggered run changes — all already correct and untouched here.

  Riskiest spot: the early-return guard in `reactivateHire`
  (`if (hire.profileStatus !== 'deactivated' || (hire.run && hire.run.status === 'active')) return hire;`)
  is unchanged and sits *before* the new hireStage check — confirm the two conditions don't
  interact in a way that masks the Draft-stage case (they shouldn't, since that guard only
  short-circuits on profile/run state, never on hireStage, but it's worth a reviewer's second
  look).

  Non-obvious decision: profileStatus always becomes 'active' on reactivate even when no run
  starts (Draft case) — this is deliberate per the assumptions section, not a missed guard.
