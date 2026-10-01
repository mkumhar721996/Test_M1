summary: |
  Build the candidate-lifecycle layer of the Hiring Pipeline on top of the existing
  onboarding-engine-backed `src/hires` store/routes (already created/tracked/role-enforced
  via `profileStatus` + `run`/`runHistory` from a prior story). This story adds: (1) an
  auditLog trail (`{ ts, actor, action }`) appended on create/update/deactivate/reactivate,
  (2) required-field validation on create/update so malformed submissions are rejected
  without mutating the record, (3) an explicit no-op guard on `deactivateHire` symmetric
  with the existing `reactivateHire` guard, (4) brand-new frontend pages — a candidate
  directory (empty-state + populated + search) and a candidate profile view (view/edit,
  reject/reinstate, run card, audit trail) — matching the approved prototype at
  `.arc/designs/TEST-M1-STORY-136-design.html`, and (5) hardening of the above against
  malformed/adversarial input (type-confused fields, mass-assignment via unexpected PATCH
  keys, unescaped candidate data rendered in the DOM, double-submit races). The backend
  transition mechanics themselves (deactivate cancels the run, reactivate starts a fresh
  run) already exist and are reused as-is per the story description; this plan only adds
  what's new: audit logging, validation (including its edge/security hardening), the
  symmetric guard, and the UI.
scope:
  - description: |
      Add an `auditLog` array to every hire record and an `actor` parameter threaded through
      `createHire`, `updateHire`, `deactivateHire`, `reactivateHire`, mirroring the existing
      `src/guests/store.js` pattern exactly (`auditLog.push({ ts, actor, action })`).
      - `createHire(data, actor)`: seeds `auditLog: [{ ts, actor, action: 'created candidate' }]`.
      - `updateHire(id, changes, actor)`: before mutating, diff `changes` against the current
        record across `['name','email','phone','startDate','department','role','hireStage']`;
        if any differ, after applying push `{ ts, actor, action: 'updated ${changedFields.join(", ")}' }`.
      - `deactivateHire(id, actor)`: pushes `{ ts, actor, action: 'rejected candidate' }` only when
        a real transition happens (see guard below).
      - `reactivateHire(id, actor)`: pushes `{ ts, actor, action: 'reinstated candidate' }` only
        when a real transition happens (existing guard already covers this).
      Also give the seeded fixture (`hire_2031`) an `auditLog: [{ ts: <fixed iso>, actor: 'system',
      action: 'seeded fixture profile' }]` so existing consumers never see `undefined.length`.
      Edge case: `actor` may be `undefined` (no auth system exists in this app) — the push must
      not throw; store whatever was passed through unchanged rather than defaulting/coercing it.
    files:
      - src/hires/store.js
    rationale: |
      AC7 requires one auditLog entry per create/update/deactivate/reactivate. The guests
      store already implements this exact shape for an equivalent profileStatus lifecycle,
      so this is a direct port of a proven pattern rather than new design.
  - description: |
      Add a `HireValidationError` class and an `assertValidHire({ name, email, phone, department,
      role, startDate, hireStage })` guard (mirroring `GuestValidationError`/`assertValid` in
      `src/guests/store.js`), called from `createHire` against `data` and from `updateHire`
      against the merged `{ ...hire, ...changes }` record. Required-field checks:
      name non-empty, email format (`/^[^\s@]+@[^\s@]+\.[^\s@]+$/`), phone non-empty,
      department non-empty, role non-empty, startDate non-empty, and (new, hardening)
      `hireStage` — if present, must be one of `['draft', 'offer_accepted']`. On failure, throw
      before any mutation so the record is left unchanged.
    files:
      - src/hires/store.js
    rationale: |
      AC9 requires malformed/missing required fields to be rejected with the record unchanged.
      Phone is intentionally validated as "non-empty" rather than the guests-store's
      "≥7 normalized digits" rule — see assumptions_or_open_questions for why (breaking the
      many pre-existing `phone: '1'` fixtures in test/hires-store.test.js and test/hires.test.js
      is out of scope for this story). The `hireStage` enum check is new hardening: nothing
      today stops a client from persisting an arbitrary string into `hireStage`, which is later
      compared with strict equality (`hire.hireStage === 'offer_accepted'`) to decide whether to
      trigger a Run — harmless to that comparison, but garbage data would still be stored and
      rendered, so it's cheap to reject at the same validation boundary.
  - description: |
      Harden `assertValidHire` and the field-presence checks against type-confused input: every
      check must guard with `typeof v === 'string'` before calling `.trim()`/regex methods, e.g.
      ```js
      function isNonEmptyString(v) { return typeof v === 'string' && v.trim().length > 0; }
      ```
      so that a malicious/malformed body like `{ name: { "x": 1 } }` or `{ email: ['a@x.com'] }`
      produces a `HireValidationError` (→ HTTP 400) instead of an uncaught `TypeError` (→ HTTP
      500, and in Express's default error handler, a stack-trace leak). Apply the same guard to
      `updateHire`'s merged-record validation.
    files:
      - src/hires/store.js
    rationale: |
      This is the specific security/edge-case gap the reviewer asked to cover: today
      `isValidEmail(v)` calls `.test(v)` on whatever `v` is, and `name`/`phone`/etc. presence
      checks call `.trim()` directly — both throw on non-string JSON types (array/object/number)
      rather than failing validation gracefully, turning a client input-shape mistake into a
      server error instead of a 400.
  - description: |
      Add a no-op guard to `deactivateHire`, symmetric with the existing `reactivateHire` guard:
      `if (hire.profileStatus === 'deactivated') return hire;` placed before cancelling any run
      or mutating state.
    files:
      - src/hires/store.js
    rationale: |
      AC8 requires an invalid transition (deactivating an already-deactivated candidate) to be
      blocked with the record left unchanged, "consistent with existing hire-state guards" — the
      existing `reactivateHire` guard is exactly that precedent; `deactivateHire` currently has no
      equivalent guard and would otherwise silently no-op without the explicit contract or an
      audit-log side effect to avoid.
  - description: |
      Update `src/hires/routes.js` to pass `req.body.actor` through to `createHire`, `updateHire`,
      `deactivateHire`, `reactivateHire`, and to catch `HireValidationError` on the POST `/` and
      PATCH `/:id` handlers, responding `res.status(400).json({ error: 'validation_error', fields: err.fields })`
      — the same shape `src/guests/routes.js` already uses for `GuestValidationError`. Confirm (and
      add a regression test for) the existing `PATCHABLE_FIELDS` allow-list in
      `pickPatchableFields` as the mass-assignment boundary: a PATCH body containing
      `profileStatus`, `auditLog`, `run`, `runHistory`, `id`, or `__proto__` must have those keys
      silently dropped before reaching `updateHire`, since `PATCHABLE_FIELDS` is currently
      `['name', 'email', 'phone', 'startDate', 'department', 'role', 'hireStage']` and none of
      those dangerous keys are in it — this is already correct by construction, but is exactly
      the kind of thing that silently breaks if someone "simplifies" the picker later, so it gets
      an explicit test rather than relying on reading the allow-list.
    files:
      - src/hires/routes.js
    rationale: |
      Routes need to surface the new validation errors as HTTP 400s and forward the actor so the
      audit trail records who performed each action, matching the guests router's existing
      contract exactly. The allow-list test is the security/edge-case coverage the reviewer asked
      for on the mass-assignment front.
  - description: |
      Build the candidate directory + candidate profile UI as a new single-page module
      (`public/candidates.html` + `public/js/candidates.js` + `public/css/candidates.css`),
      structured like the existing `public/guest-profiles.html`/`guest-profiles.js` (one HTML
      document with a directory `<div>` and a profile `<div>`, toggled via `hidden`), but built
      from the markup/classes/copy actually read in the approved prototype
      `.arc/designs/TEST-M1-STORY-136-design.html`:
      - Directory screen: `.app-topbar` with nav `Candidates (active) · Onboarding Runs · Reports`,
        `.toolbar` with a search `.input` and a `+ Add candidate` `.btn-primary`, a
        `.card.table-card` wrapping `table.candidate-table` (columns: Candidate, Role &
        department, Hire stage, Status, Last updated, Actions — `.view-link-btn`), status chips
        via `.profile-status-chip`/`.profile-status-chip--active`. A zero-candidates state
        (AC1) renders `.empty-state` with the exact prototype copy ("No candidates yet" /
        "Start your hiring pipeline by adding your first candidate...") and a
        `+ Add your first candidate` button that opens the same create modal as the toolbar
        button (the prototype duplicates the modal across its "empty" and "populated" screens
        only because those are isolated reviewer-bar fixtures — the real page has one directory
        and one modal). A separate "no search matches" note (`.no-results-note`) is also wired
        from the prototype's populated-screen copy, same as the existing no-match pattern in
        `guest-profiles.html`.
      - Create modal: fields name/email/phone/department(`<select>`)/role/startDate/hireStage
        (`draft` default, `offer_accepted` option), each with a `.field-error-text` + `.input-error`
        pair, a `.field-hint` under hire stage ("Choosing \"Offer accepted\" starts the onboarding
        run immediately."), matching the prototype's `#dir-create-modal` markup. Every value read
        from these fields is escaped via the existing `escapeHtml(doc, str)` helper
        (`public/js/utils.js`) before being interpolated into table/profile HTML — this is the
        stored-XSS defense for candidate data (see hardening tests below).
      - Profile screen: `.profile-header-row` (name + `.profile-status-chip`), `.deactivated-banner`
        shown only when deactivated, `.profile-actions` row with `Edit candidate` (always visible),
        `Reject / cancel candidate` (visible only when active), `Reinstate candidate` (visible only
        when deactivated) — toggling via `hidden`, which is itself the AC8 UI guard (the opposite
        action is never reachable from the UI). A `.layout-grid` of three `.card`s: candidate
        details (`.kv-list`), onboarding run (status chip, progress bar, history toggle — ported
        unchanged from the existing `hire-profile.js` run-card logic since AC3/AC4/AC5 reuse that
        same run lifecycle), and audit trail (`.audit-list`, newest first, with a
        `.audit-just-now` tag on the entry whose `ts` matches the most recent mutation — same
        technique as `guest-profiles.js`'s `lastMutationTs`). `actor`/`action` strings are escaped
        the same way as the candidate fields.
      - Edit modal: single form with all six fields pre-filled, `.form-banner-error` shown
        alongside per-field errors on AC9 validation failure, "last-write-wins" save copy
        ("Saving applies immediately — the most recent save always wins.").
      - Reject/Reinstate: two separate confirm modals (`.consequence-note` copy drawn from the
        prototype, swapping in the candidate name and, for reject, whether an active run exists).
      Guard-note copy ("Already deactivated — rejecting again has no effect." /
      "Already active — there's nothing to reinstate.") is ported as static informational text;
      the prototype's "Demo: attempt again" buttons are reviewer-bar-only scaffolding (they exist
      solely to let a design reviewer trigger the backend's AC8 guard manually) and are
      intentionally NOT built — see assumptions_or_open_questions.
    files:
      - public/candidates.html
      - public/js/candidates.js
      - public/css/candidates.css
    rationale: |
      This is the only UI surface this story's ACs require; it is new because the existing
      `public/hire-profile.html`/`hire-profile.js` serves a single hard-coded profile with a
      different interaction model (separate contact/role-change modals with a role-change
      run-restart confirmation step) that isn't part of this story's design and must not be
      regressed — see the "existing hire-profile.* left untouched" note below.
  - description: |
      Disable the relevant submit/confirm button for the duration of every in-flight mutating
      call (create, edit save, reject confirm, reinstate confirm) in `candidates.js`, mirroring
      the prototype's `setBusy(btn, busyLabel, idleLabel)` / `clearBusy(btn)` helpers exactly
      (`.btn.disabled = true` + label swap while the request is in flight, restored in both the
      success and failure branches). Re-entrant clicks while a button is disabled must not issue
      a second API call.
    files:
      - public/js/candidates.js
    rationale: |
      Edge-case hardening the reviewer asked for: without this, rapid double-clicking "Create
      candidate" (or Reject/Reinstate confirm) fires two concurrent requests against the
      in-memory store and can create two candidate records, or race the reject/reinstate guard
      from the same client instead of a genuinely different tab. The prototype already designed
      for this (`setBusy`/`clearBusy` exist there precisely for the AC9/pending-state purpose);
      this scope item just carries that same defense into the production module instead of
      letting it slip during a straight port.
  - description: |
      Export a `createDefaultApi()` from `public/js/candidates.js` (mirroring
      `guest-profiles.js`'s `createDefaultApi`) wiring `GET /hires`, `POST /hires`,
      `GET /hires/:id`, `PATCH /hires/:id`, `POST /hires/:id/deactivate`,
      `POST /hires/:id/reactivate`, each sending `actor: 'Morgan Ellis'` in the body (a
      hardcoded "signed in as" constant, matching both the prototype's `MANAGER` constant and
      the existing `guest-profiles.js`'s `STAFF_NAME` constant — this app has no real auth/session
      system).
    files:
      - public/js/candidates.js
    rationale: |
      Keeps the actor-threading contract (AC7) working end-to-end from a real browser without
      inventing an authentication mechanism outside this story's scope.
  - description: |
      Extend `test/hires-store.test.js` and `test/hires.test.js` with new
      `TEST-M1-STORY-136 AC*`-prefixed tests (the existing `AC1..AC8`-named tests in those files
      belong to the prior onboarding-run story and must not be renumbered or removed) covering:
      auditLog shape on create/update/deactivate/reactivate (AC7), validation rejecting a missing
      or malformed field on create and update without mutating the record (AC9), the new
      deactivate-guard no-op (AC8), and the edge/security cases listed under `tests` below
      (type-confused fields, hireStage enum, mass-assignment allow-list, unknown-id mutations,
      multi-field validation errors, undefined actor, reactivate-from-draft quirk).
    files:
      - test/hires-store.test.js
      - test/hires.test.js
    rationale: |
      Keeps the new store/route behavior — and its hardening — under direct unit/integration
      test without disturbing the pre-existing onboarding-run coverage already in these files.
  - description: |
      Add `test/candidates.test.js` (jsdom) covering the UI behaviors for AC1, AC2, AC3/AC4,
      AC5, AC6, AC7, AC8 (button visibility), AC9, plus the UI-side edge/security cases: stored-XSS
      escaping of candidate data, double-submit button-disable, and a search query containing
      regex-special characters not throwing. Follows the exact
      `document.documentElement.innerHTML = fs.readFileSync(...)` + `initCandidatesApp(document,
      initialCandidates, api)` pattern used in `test/guest-profiles.test.js`.
    files:
      - test/candidates.test.js
    rationale: |
      UI behavior isn't exercised by the backend store/route tests; this is the only place AC1
      (empty-state prompt), the AC8 button-hiding guard, and the UI-rendering hardening are
      actually verifiable.
  - description: |
      No changes to `public/hire-profile.html`, `public/js/hire-profile.js`,
      `public/css/hire-profile.css`, `src/onboarding/engineClient.js`, or `src/runs/*` — these
      belong to the existing onboarding-run feature this story reuses via the store layer only.
    files: ""
    rationale: |
      Explicitly scoping these out avoids accidental regression of a different story's approved
      UI/behavior while still satisfying "reusing the existing profileStatus deactivate/reactivate
      mechanism" from the story description.
tests:
  - |
    AC1 (UI, new `test/candidates.test.js`): zero candidates renders the guided empty state.
    ```js
    test('AC1: empty candidate list shows the guided empty-state prompt', () => {
      const { initCandidatesApp } = require('../public/js/candidates');
      initCandidatesApp(document, [], {});
      expect(document.getElementById('cand-empty-state').hidden).toBe(false);
      expect(document.getElementById('cand-empty-state').textContent).toContain('No candidates yet');
    });
    ```
  - |
    AC2 (store, `test/hires-store.test.js`): a valid submission creates a hire with
    `profileStatus: 'active'`.
    ```js
    test('TEST-M1-STORY-136 AC2: createHire sets profileStatus active on a valid submission', async () => {
      const hire = await createHire({ name: 'Sam Lee', email: 's@x.com', phone: '5551234567',
        department: 'Engineering', role: 'Engineer', startDate: '2026-11-01', hireStage: 'draft' }, 'Morgan Ellis');
      expect(hire.profileStatus).toBe('active');
    });
    ```
  - |
    AC3/AC4 (store, `test/hires-store.test.js`): deactivating an active candidate with a running
    onboarding run flips status and cancels the run (existing mechanism), asserted under this
    story's own test name for traceability.
    ```js
    test('TEST-M1-STORY-136 AC3/AC4: deactivating an active candidate sets deactivated and cancels the run', async () => {
      const hire = await createHire({ name: 'A', email: 'a@x.com', phone: '5551234567', startDate: '2026-10-05',
        department: 'Engineering', role: 'Engineer II', hireStage: 'offer_accepted' }, 'Morgan Ellis');
      const updated = await deactivateHire(hire.id, 'Morgan Ellis');
      expect(updated.profileStatus).toBe('deactivated');
      expect(updated.run).toBeNull();
    });
    ```
  - |
    AC5 (store, `test/hires-store.test.js`): reactivating a deactivated candidate returns to active.
    ```js
    test('TEST-M1-STORY-136 AC5: reactivating a deactivated candidate returns profileStatus to active', async () => {
      const hire = await createHire({ name: 'A', email: 'a@x.com', phone: '5551234567', startDate: '2026-10-05',
        department: 'Engineering', role: 'Engineer II', hireStage: 'offer_accepted' }, 'Morgan Ellis');
      await deactivateHire(hire.id, 'Morgan Ellis');
      const updated = await reactivateHire(hire.id, 'Morgan Ellis');
      expect(updated.profileStatus).toBe('active');
    });
    ```
  - |
    AC5 edge case (store, `test/hires-store.test.js`): reactivating a candidate who was
    deactivated while still in `hireStage: 'draft'` (never had a Run) still starts a fresh Run,
    because `reactivateHire` always triggers one unconditionally — this documents an inherited
    quirk of the reused mechanism rather than introducing new behavior (see
    assumptions_or_open_questions).
    ```js
    test('TEST-M1-STORY-136 AC5 edge case: reactivating a draft-stage candidate still starts a fresh run', async () => {
      const hire = await createHire({ name: 'A', email: 'a@x.com', phone: '5551234567', startDate: '2026-10-05',
        department: 'Engineering', role: 'Engineer II', hireStage: 'draft' }, 'Morgan Ellis');
      await deactivateHire(hire.id, 'Morgan Ellis');
      const updated = await reactivateHire(hire.id, 'Morgan Ellis');
      expect(updated.run).toMatchObject({ status: 'active', freshStart: true });
    });
    ```
  - |
    AC6 (store, `test/hires-store.test.js`): an edit save reflects the latest values
    (last-write-wins).
    ```js
    test('TEST-M1-STORY-136 AC6: editing a candidate applies last-write-wins', async () => {
      const hire = await createHire({ name: 'A', email: 'a@x.com', phone: '5551234567', startDate: '2026-10-05',
        department: 'Engineering', role: 'Engineer II', hireStage: 'draft' }, 'Morgan Ellis');
      const updated = await updateHire(hire.id, { name: 'A B', role: 'Senior Engineer' }, 'Morgan Ellis');
      expect(updated).toMatchObject({ name: 'A B', role: 'Senior Engineer' });
    });
    ```
  - |
    AC7 (store, `test/hires-store.test.js`): create/update/deactivate/reactivate each append one
    `{ ts, actor, action }` auditLog entry.
    ```js
    test('TEST-M1-STORY-136 AC7: creating a candidate appends a { ts, actor, action } auditLog entry', async () => {
      const hire = await createHire({ name: 'A', email: 'a@x.com', phone: '5551234567', startDate: '2026-10-05',
        department: 'Engineering', role: 'Engineer II', hireStage: 'draft' }, 'Morgan Ellis');
      expect(hire.auditLog).toEqual([
        expect.objectContaining({ ts: expect.any(String), actor: 'Morgan Ellis', action: 'created candidate' }),
      ]);
    });
    ```
  - |
    AC7 edge case (store, `test/hires-store.test.js`): a missing/undefined actor (no auth system
    in this app) must not crash the mutation — the audit entry is still appended.
    ```js
    test('TEST-M1-STORY-136 AC7 edge case: an undefined actor does not throw and still logs an entry', async () => {
      const hire = await createHire({ name: 'A', email: 'a@x.com', phone: '5551234567', startDate: '2026-10-05',
        department: 'Engineering', role: 'Engineer II', hireStage: 'draft' }); // no actor passed
      expect(hire.auditLog[0]).toMatchObject({ action: 'created candidate' });
      expect(hire.auditLog[0].actor).toBeUndefined();
    });
    ```
  - |
    AC8 (store, `test/hires-store.test.js`): deactivating an already-deactivated candidate is a
    no-op — blocked, record (including auditLog length) unchanged.
    ```js
    test('TEST-M1-STORY-136 AC8: deactivating an already-deactivated candidate is blocked and unchanged', async () => {
      const hire = await createHire({ name: 'A', email: 'a@x.com', phone: '5551234567', startDate: '2026-10-05',
        department: 'Engineering', role: 'Engineer II', hireStage: 'draft' }, 'Morgan Ellis');
      await deactivateHire(hire.id, 'Morgan Ellis');
      const auditLenBefore = getHire(hire.id).auditLog.length;
      const result = await deactivateHire(hire.id, 'Morgan Ellis');
      expect(result.profileStatus).toBe('deactivated');
      expect(getHire(hire.id).auditLog.length).toBe(auditLenBefore);
    });
    ```
  - |
    AC8 (UI, `test/candidates.test.js`): the opposite action's button is hidden, so the invalid
    transition is unreachable from the UI.
    ```js
    test('AC8 UI: a deactivated candidate only shows Reinstate, never Reject', () => {
      const deactivated = { id: 'hire_1', name: 'A', email: 'a@x.com', phone: '5551234567',
        department: 'Engineering', role: 'Engineer', startDate: '2026-10-05', hireStage: 'draft',
        profileStatus: 'deactivated', run: null, runHistory: [], auditLog: [] };
      const { initCandidatesApp } = require('../public/js/candidates');
      initCandidatesApp(document, [deactivated], { get: jest.fn().mockResolvedValue(deactivated) });
      document.querySelector('.view-link-btn').click();
      expect(document.getElementById('cand-reactivate-btn').hidden).toBe(false);
      expect(document.getElementById('cand-deactivate-btn').hidden).toBe(true);
    });
    ```
  - |
    AC8 edge case (store, `test/hires-store.test.js`): mutating an unknown id never throws —
    PATCH/deactivate/reactivate on a nonexistent hire all resolve `undefined` so the route can
    404 cleanly instead of 500ing.
    ```js
    test('TEST-M1-STORY-136 edge case: deactivate/reactivate/update on an unknown id resolve undefined, not throw', async () => {
      await expect(deactivateHire('does-not-exist', 'Morgan Ellis')).resolves.toBeUndefined();
      await expect(reactivateHire('does-not-exist', 'Morgan Ellis')).resolves.toBeUndefined();
      await expect(updateHire('does-not-exist', { name: 'X' }, 'Morgan Ellis')).resolves.toBeUndefined();
    });
    ```
  - |
    Security edge case (route, `test/hires.test.js`): an unusual/path-traversal-shaped id string
    is treated as a literal (safe) Map key — 404, not a crash or filesystem access.
    ```js
    test('security: a path-traversal-shaped id is treated as a literal id and 404s safely', async () => {
      const res = await request(app).get('/hires/' + encodeURIComponent('../../etc/passwd'));
      expect(res.status).toBe(404);
    });
    ```
  - |
    AC9 (store, `test/hires-store.test.js`): a malformed field is rejected and the record is left
    unchanged.
    ```js
    test('TEST-M1-STORY-136 AC9: updateHire rejects a malformed email and leaves the record unchanged', async () => {
      const hire = await createHire({ name: 'A', email: 'a@x.com', phone: '5551234567', startDate: '2026-10-05',
        department: 'Engineering', role: 'Engineer II', hireStage: 'draft' }, 'Morgan Ellis');
      await expect(updateHire(hire.id, { email: 'not-an-email' }, 'Morgan Ellis')).rejects.toThrow(HireValidationError);
      expect(getHire(hire.id).email).toBe('a@x.com');
    });
    ```
  - |
    AC9 (UI, `test/candidates.test.js`): saving an edit with a missing required field shows the
    inline error and never calls the API.
    ```js
    test('AC9 UI: saving an edit with a missing name shows a field error and does not call the api', async () => {
      const candidate = { id: 'hire_1', name: 'A', email: 'a@x.com', phone: '5551234567',
        department: 'Engineering', role: 'Engineer', startDate: '2026-10-05', hireStage: 'draft',
        profileStatus: 'active', run: null, runHistory: [], auditLog: [] };
      const api = { get: jest.fn().mockResolvedValue(candidate), update: jest.fn() };
      const { initCandidatesApp } = require('../public/js/candidates');
      initCandidatesApp(document, [candidate], api);
      document.querySelector('.view-link-btn').click();
      await Promise.resolve(); await Promise.resolve();
      document.getElementById('cand-edit-btn').click();
      document.getElementById('cand-ef-name').value = '';
      document.getElementById('cand-edit-form').dispatchEvent(new Event('submit', { cancelable: true }));
      expect(document.getElementById('cand-ee-name').hidden).toBe(false);
      expect(api.update).not.toHaveBeenCalled();
    });
    ```
  - |
    AC9 edge case (store, `test/hires-store.test.js`): multiple simultaneously-invalid fields are
    all reported together in one structured error, not just the first one found.
    ```js
    test('TEST-M1-STORY-136 AC9 edge case: multiple invalid fields are all reported together', async () => {
      await expect(createHire({ name: '', email: 'not-an-email', phone: '5551234567', department: '',
        role: 'Engineer', startDate: '2026-10-05' })).rejects.toMatchObject({
          fields: { name: expect.any(String), email: expect.any(String), department: expect.any(String) },
        });
    });
    ```
  - |
    Security/edge case (store, `test/hires-store.test.js`): type-confused fields (array/object
    instead of string) are rejected with a 400-worthy `HireValidationError`, never an uncaught
    `TypeError`.
    ```js
    test('security: a non-string email/name is rejected as a validation error, not a crash', async () => {
      expect.assertions(2);
      try {
        await createHire({ name: { x: 1 }, email: ['a@x.com'], phone: '5551234567',
          department: 'Engineering', role: 'Engineer', startDate: '2026-10-05' });
      } catch (err) {
        expect(err).toBeInstanceOf(HireValidationError);
        expect(err.fields).toMatchObject({ name: expect.any(String), email: expect.any(String) });
      }
    });
    ```
  - |
    Security/edge case (store, `test/hires-store.test.js`): an invalid `hireStage` value is
    rejected rather than silently stored.
    ```js
    test('security: an out-of-enum hireStage is rejected by createHire', async () => {
      await expect(createHire({ name: 'A', email: 'a@x.com', phone: '5551234567', startDate: '2026-10-05',
        department: 'Engineering', role: 'Engineer II', hireStage: 'not_a_real_stage' }))
        .rejects.toMatchObject({ fields: { hireStage: expect.any(String) } });
    });
    ```
  - |
    Security/edge case (route, `test/hires.test.js`): PATCH cannot mass-assign `profileStatus`,
    `auditLog`, `run`, or `id` directly — only the documented `PATCHABLE_FIELDS` take effect.
    ```js
    test('security: PATCH cannot directly set profileStatus, auditLog, run, or id', async () => {
      const createRes = await request(app).post('/hires').send({ name: 'A', email: 'a@x.com',
        phone: '5551234567', startDate: '2026-10-05', department: 'Engineering', role: 'Engineer II', hireStage: 'draft' });
      const { id } = createRes.body;
      const res = await request(app).patch(`/hires/${id}`).send({
        profileStatus: 'deactivated', auditLog: [{ ts: 'x', actor: 'attacker', action: 'faked' }], run: { status: 'active' }, id: 'hijacked',
      });
      expect(res.status).toBe(200);
      expect(res.body.profileStatus).toBe('active');
      expect(res.body.id).toBe(id);
      expect(res.body.auditLog).not.toContainEqual(expect.objectContaining({ actor: 'attacker' }));
    });
    ```
  - |
    Security (UI, `test/candidates.test.js`): candidate data containing HTML/script content is
    rendered as inert text, not executed markup (stored-XSS defense via `escapeHtml`).
    ```js
    test('security UI: a candidate name containing markup is escaped, not rendered as HTML', () => {
      const candidate = { id: 'hire_1', name: '<img src=x onerror=alert(1)>', email: 'a@x.com',
        phone: '5551234567', department: 'Engineering', role: 'Engineer', startDate: '2026-10-05',
        hireStage: 'draft', profileStatus: 'active', run: null, runHistory: [], auditLog: [] };
      const { initCandidatesApp } = require('../public/js/candidates');
      initCandidatesApp(document, [candidate], {});
      expect(document.getElementById('cand-tbody').querySelector('img')).toBeNull();
      expect(document.getElementById('cand-tbody').textContent).toContain('<img src=x onerror=alert(1)>');
    });
    ```
  - |
    Edge case (UI, `test/candidates.test.js`): double-clicking "Create candidate" before the
    first request resolves only issues one API call (button disabled while in flight).
    ```js
    test('edge case UI: double-submitting the create form only calls the api once', async () => {
      let resolveCreate;
      const api = { create: jest.fn(() => new Promise((resolve) => { resolveCreate = resolve; })) };
      const { initCandidatesApp } = require('../public/js/candidates');
      initCandidatesApp(document, [], api);
      document.getElementById('cand-add-btn').click();
      document.getElementById('cand-f-name').value = 'Sam Lee';
      document.getElementById('cand-f-email').value = 's@x.com';
      document.getElementById('cand-f-phone').value = '5551234567';
      document.getElementById('cand-f-department').value = 'Engineering';
      document.getElementById('cand-f-role').value = 'Engineer';
      document.getElementById('cand-f-startDate').value = '2026-11-01';
      const form = document.getElementById('cand-create-form');
      form.dispatchEvent(new Event('submit', { cancelable: true }));
      form.dispatchEvent(new Event('submit', { cancelable: true }));
      expect(api.create).toHaveBeenCalledTimes(1);
      resolveCreate({ id: 'hire_x', name: 'Sam Lee', profileStatus: 'active', auditLog: [] });
      await Promise.resolve(); await Promise.resolve();
    });
    ```
  - |
    Edge case (UI, `test/candidates.test.js`): a search query containing regex-special
    characters filters to no matches without throwing (search is plain substring matching, not a
    constructed RegExp — no ReDoS/injection surface).
    ```js
    test('edge case UI: searching with regex-special characters does not throw', () => {
      const candidate = { id: 'hire_1', name: 'Jordan Reyes', email: 'j@x.com', phone: '5551234567',
        department: 'Engineering', role: 'Engineer', startDate: '2026-10-05', hireStage: 'draft',
        profileStatus: 'active', run: null, runHistory: [], auditLog: [] };
      const { initCandidatesApp } = require('../public/js/candidates');
      initCandidatesApp(document, [candidate], {});
      const search = document.getElementById('cand-search-input');
      expect(() => {
        search.value = '.*(.+)+$';
        search.dispatchEvent(new Event('input'));
      }).not.toThrow();
      expect(document.getElementById('cand-no-results').hidden).toBe(false);
    });
    ```
assumptions_or_open_questions:
  - |
    Phone validation is relaxed to "non-empty" rather than the guests-store's "≥7 normalized
    digits" rule the prototype's client-side `isValidPhone` uses. Reason: `test/hires-store.test.js`
    and `test/hires.test.js` already contain many passing tests that create hires with
    `phone: '1'`/`phone: '2'` (pre-existing onboarding-run story fixtures, out of this story's
    scope to rewrite). Enforcing the stricter digit-count rule server-side would break those
    tests. If the reviewer wants strict phone-format parity with the prototype, the alternative
    is to also update those fixture phone numbers to realistic values as part of this story —
    flagging rather than silently picking either option.
  - |
    The prototype's per-screen "Demo: attempt to reject/reinstate again" buttons
    (`#prof-demo-reject-blocked`, `#prof-demo-reinstate-blocked`) are not built. They exist only
    so a design reviewer can manually trigger the AC8 guard in the static prototype; in the real
    app the Reject/Reinstate buttons are already conditionally hidden based on `profileStatus`,
    so there's no user-reachable path to the blocked transition the demo buttons simulate. The
    guard's static informational copy ("Already deactivated — rejecting again has no effect.")
    is kept. If the reviewer wants the interactive demo affordance kept for real managers too
    (e.g. to cover a stale-tab race), that's an explicit addition beyond what's described here.
  - |
    Department is validated as "non-empty" only, not restricted to the prototype's fixed
    `DEPARTMENTS` list (`Engineering, Product, Sales, People Ops, Finance`), mirroring how
    `hire-profile.js`'s `departmentOptionsMarkup` already tolerates an out-of-list legacy value by
    injecting it as an extra `<option>`. The create/edit `<select>` is still built from
    `DEPARTMENTS` for new candidates.
  - |
    No role/permission gating (e.g. the guests router's `x-staff-role` check) is added to
    `src/hires/routes.js` — the existing `/hires` routes have none today and no AC in this story
    mentions access control, so adding it would be scope creep.
  - |
    `actor` is a hardcoded `'Morgan Ellis'` constant sent by the frontend (matching the
    prototype's `MANAGER` constant), not a real signed-in user — this app has no auth/session
    layer anywhere else either (`guest-profiles.js` does the same with `STAFF_NAME`). A
    consequence flagged for the reviewer: a malicious/compromised client could send any string
    as `actor`, and the server trusts it as-is (same trust model already accepted for guests and
    expenses in this codebase) — genuine actor authentication is out of scope for this story.
  - |
    Validation applies to `createHire` as well as `updateHire`, even though AC9's literal wording
    only describes the edit flow — AC2 ("WHEN the form is valid THEN a hire record is created")
    implies an invalid create form must be rejectable too, and the prototype's `validateCandidate`
    is explicitly reused by both the create and edit forms.
  - |
    Reactivating a candidate always triggers a fresh onboarding Run unconditionally, even if that
    candidate's `hireStage` is still `'draft'` (never reached `'offer_accepted'`) — this is
    existing `reactivateHire` behavior from the prior onboarding-run story, reused as-is per this
    story's description ("reusing the existing profileStatus deactivate/reactivate mechanism").
    It's arguably a pre-existing inconsistency (create/update only trigger a Run when
    `hireStage === 'offer_accepted'`, but reactivate ignores `hireStage` entirely), but "fixing"
    it would mean changing behavior outside this story's stated reuse boundary — flagged rather
    than silently changed. A test documents the current (reused) behavior explicitly.
  - |
    Explicitly out of scope, consistent with the rest of this codebase (no other route in this
    app does either): CSRF protection (no cookie/session auth exists anywhere in the app) and
    request-rate-limiting/abuse throttling. Also out of scope: duplicate-candidate detection
    (e.g. matching by email/phone like `guests/store.js`'s `findGuestMatch`) — no AC asks for it,
    and adding it would be a speculative feature this story's description doesn't request.
package_dependencies: []
notes: |
  Research finding: `src/hires/store.js`/`src/hires/routes.js` and
  `public/hire-profile.html`/`hire-profile.js`/`hire-profile.css` already exist on this branch
  from a prior "onboarding Run" story and already implement the exact `profileStatus`
  active/deactivated mechanism (including the run-cancel-on-deactivate and
  fresh-run-on-reactivate behavior) that this story's description says to reuse. That prior
  story's own tests in `test/hires-store.test.js`/`test/hires.test.js` are numbered `AC1..AC8`
  for a *different* set of acceptance criteria (onboarding-run restart semantics) — this plan's
  new tests are prefixed `TEST-M1-STORY-136 AC*` (or `security:`/`edge case:` for the
  hardening-only tests) to avoid collision/confusion, and the prior tests are left untouched.

  This mirrors `src/guests/store.js` + `public/guest-profiles.html`/`guest-profiles.js` almost
  exactly: same `GuestValidationError`-shaped error class, same `auditLog.push({ ts, actor,
  action })` call shape, same one-page directory+profile screen-toggle structure, same
  `createDefaultApi()` / hardcoded actor-name convention. No new UI pattern is being invented.

  The edge-case/security tests added in this revision were specifically requested by the
  reviewer (not independently derived from the ACs); they target the three places adversarial
  or malformed input can actually reach this story's new code: (1) the JSON body of
  POST/PATCH `/hires*` (type confusion, mass assignment, hireStage enum), (2) the in-memory
  Map keyed by id (path-like id strings, unknown-id mutations), and (3) the DOM rendering layer
  in `candidates.js` (stored-XSS via unescaped candidate fields, double-submit races, and the
  plain-substring (non-regex) search filter).

  ```mermaid
  flowchart TD
    classDef touched fill:#f96,color:#000
    classDef context fill:#eee,color:#000

    html[public/candidates.html]:::touched
    js[public/js/candidates.js]:::touched
    css[public/css/candidates.css]:::touched
    routes[src/hires/routes.js]:::touched
    store[src/hires/store.js]:::touched
    engine[src/onboarding/engineClient.js]:::context
    server[src/server.js]:::context

    html -- "loads, defer script" --> js
    css -- "styles" --> html
    js -- "fetch /hires* (create/get/patch/deactivate/reactivate); escapes all rendered fields" --> routes
    routes -- "createHire/updateHire/deactivateHire/reactivateHire(id, changes, actor); allow-lists PATCH body" --> store
    store -- "triggerRun/cancelRun (unchanged, reused as-is)" --> engine
    server -- "app.use('/hires', hiresRouter) — existing mount, unchanged" --> routes
  ```
review_focus: |
  In scope: auditLog + actor threading and required-field validation (plus its type-confusion/
  enum hardening) added to `src/hires/store.js`/`routes.js`, a new deactivate no-op guard, a new
  `public/candidates.html`/`candidates.js`/`candidates.css` directory+profile UI, and the
  edge/security tests the reviewer explicitly requested this revision (XSS escaping,
  mass-assignment allow-list, type-confused/out-of-enum input, double-submit guarding,
  unknown-id mutation safety). Out of scope (deliberately untouched): `public/hire-profile.html`/
  `hire-profile.js` and the role/department run-restart confirmation flow it owns, CSRF/rate
  limiting, and duplicate-candidate detection — don't flag any of these as missing. Riskiest
  area: the validation relaxation on phone format (see assumptions) — a deliberate compatibility
  call to avoid breaking ~15 pre-existing tests using single-digit phone fixtures, not an
  oversight. Also deliberate: the reused `reactivateHire` always starts a fresh Run even from
  `hireStage: 'draft'` (an inherited quirk, documented with its own test, not newly introduced)
  and the prototype's "Demo: attempt again" guard buttons were intentionally not built since the
  real UI already makes that transition unreachable by hiding the button.
