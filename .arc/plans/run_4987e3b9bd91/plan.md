summary: |
  Build the embeddable inline guest-create/select hook described by TEST-M1-STORY-103.
  Critical correction versus a naive reading of the story: this repo is NOT greenfield for
  "guest" — `src/guests/store.js` and `src/guests/routes.js` already exist and are mounted at
  `/guests` (shipped by TEST-M1-STORY-100, commit 982815d, "Guest Profile CRUD & Soft-Delete"),
  backing an already-live guest directory UI (`public/guest-profiles.html` +
  `public/js/guest-profiles.js`) with its own passing test suites (`test/guests.test.js`,
  `test/guest-profiles.test.js`). This plan therefore EXTENDS that existing module instead of
  authoring it fresh, and is careful not to regress STORY-100's shipped behavior: its tests
  create guests with no `x-staff-role` header and with loosely-formatted phone values (e.g.
  `phone: '555-1'`), so this plan (a) treats a missing `x-staff-role` header as backward-compatible
  "allowed" on the shared `POST /guests`/`GET /guests/match` routes rather than failing closed on
  a missing role, and (b) keeps email/phone FORMAT (regex) validation entirely client-side in the
  new hook, never adding it to the shared `createGuest` store function that STORY-100's UI also
  calls. The shared backend validation stays limited to what it already enforces (name required;
  at least one of email/phone present), now surfaced as a structured per-field error object
  instead of a single message string. The new work is: (1) additive changes to the existing
  `src/guests/store.js`/`routes.js` for permission-checking (`canCreateGuest`/`ROLE_PERMISSIONS`),
  duplicate-detection (`findGuestMatch`), structured validation errors, and fixture-guest seeding
  (mirroring the existing seed pattern in `src/hires/store.js:6-18`); and (2) a new, standalone,
  mountable front-end module `public/js/guest-inline-hook.js` that renders the exact markup shown
  inside the dashed "Inline hook component (this story)" boundary in the approved prototype
  (`.arc/designs/TEST-M1-STORY-103-design.html`, screen 1, `.embed-boundary` at lines 744-816):
  the permission-denied notice, the create/select form (name/email/phone with per-field errors),
  the duplicate-detection status/match card, and the service-error notice. The prototype
  explicitly marks the surrounding "Front Desk Console" host page as "illustrative only, not part
  of this story" (HTML comment at lines 640-645, 670-699, and the CSS comment at lines 348-351),
  so this plan does not build a host/demo page — only the reusable hook and the backend it calls,
  tested by mounting the hook into a bare container the way a future reservation/check-in flow
  eventually will.

scope:
  - description: |
      Extend the EXISTING `src/guests/store.js` (do not recreate it — it already has
      `createGuest`, `getGuest`, `listGuests`, `updateGuest`, `deactivateGuest`, `reactivateGuest`,
      and a `GuestValidationError` used by STORY-100). Add, without touching those existing
      exports' current signatures:

      1. `ROLE_PERMISSIONS = { front_desk: true, housekeeping: false }` and
         `function canCreateGuest(role) { return ROLE_PERMISSIONS[role] === true; }` — pure,
         fails closed for any role not explicitly mapped `true` (including `undefined`), taken
         directly from the design's own `ROLE_PERMISSIONS` map (design lines 955-958). This
         function stays pure/fail-closed; the "missing header on the route = backward-compatible
         allow" decision (see scope item 2) is a ROUTE-level concern, not baked into this
         function, so `canCreateGuest(undefined)` correctly returns `false` for direct unit tests.

      2. Change `GuestValidationError` to carry structured fields:
         `class GuestValidationError extends Error { constructor(message, fields = {}) { super(message); this.statusCode = 400; this.fields = fields; } }`
         and change the existing `assertValid(name, email, phone)` to build a `fields` object
         instead of throwing on the first failure, e.g.:
         ```js
         function assertValid(name, email, phone) {
           const fields = {};
           if (!name) fields.name = "Enter the guest's full name.";
           if (!email && !phone) {
             fields.email = 'Add an email or phone number so we can check for existing profiles.';
             fields.phone = 'Add an email or phone number so we can check for existing profiles.';
           }
           if (Object.keys(fields).length > 0) throw new GuestValidationError('validation_error', fields);
         }
         ```
         This is additive only in the sense of the error's shape — the underlying rule set
         (name required; at least one of email/phone required) is UNCHANGED from STORY-100, so
         every existing STORY-100 create/update call that passes today still passes. It
         deliberately does NOT add the design's email/phone regex format checks
         (`isValidEmail`/`isValidPhone`, design lines 962-963) here, because STORY-100's own
         passing tests create guests with phone values that would fail that regex (e.g.
         `test/guests.test.js:17` creates `{ name: 'Ben Ortiz', phone: '555-1' }` and expects
         201 — `555-1` normalizes to 4 digits, which fails the design's `>= 7 digits` check).
         Format validation for this story is enforced client-side only, in the new hook (scope
         item 3), matching the design's own prototype script, which also only validates format
         client-side and never round-trips a badly-formatted value to any "server."

      3. `function findGuestMatch({ email, phone }) { ... }` — normalizes the same way the
         design's `normalizeEmail`/`normalizePhone`/`findMatch` do (design lines 960-972:
         lowercase+trim for email, strip non-digits for phone) and returns the first existing
         guest (any status) whose email or phone matches, or `undefined`. Purely additive, does
         not touch `createGuest`/`updateGuest`.

      4. Seed the three fixture guests from the design's `#fixture-guests` JSON (design lines
         649-654: `gst_1005` Jordan Lee, `gst_1006` Priya Nandakumar, `gst_1007` Sam Okafor)
         directly into the `guests` Map at module load, following the exact precedent already in
         this codebase at `src/hires/store.js:6-18` (`hires.set('hire_2031', {...})` at load
         time). Give each the full shape `createGuest` already produces (`status: 'active'`,
         `preferences: {}`, `bookingHistory: []`, `auditLog: []`) so `GET /guests/:id` on a
         fixture guest doesn't crash STORY-100's profile-view UI. Confirmed safe: no test in
         `test/guests.test.js` or `test/guest-profiles.test.js` asserts on `listGuests().length`
         or the total directory contents, so adding 3 rows is non-breaking.

      Export `canCreateGuest` and `findGuestMatch` alongside the existing exports.
    files:
      - src/guests/store.js
      - test/guests-store.test.js
    rationale: |
      Keeps the store as the single place that owns validation, matching, and the permission
      decision, so the routes in the next scope item and AC9's guarantee ("same authorization
      outcome as attempting direct profile creation") share one function rather than two
      implementations that could drift — while explicitly NOT retrofitting stricter format
      validation onto the function STORY-100's shipped UI already depends on.

  - description: |
      Extend the EXISTING `src/guests/routes.js` (already mounted at `/guests` in
      `src/server.js:17` — `app.use('/guests', guestsRouter)` already exists, so NO server.js
      change is needed for this story):

      - Add `router.get('/permission', ...)` and `router.get('/match', ...)` BEFORE the existing
        `router.get('/:id', ...)` registration (routes.js currently registers `GET /`, `POST /`,
        then `GET /:id` — Express matches in registration order, so a literal `/permission` or
        `/match` path registered AFTER `/:id` would incorrectly be swallowed by the `:id` param
        route first; they must be inserted between the existing `POST /` and `GET /:id`).
      - `GET /guests/permission` reads `req.headers['x-staff-role']`; if the header is absent,
        respond `{ allowed: true }` (backward-compatible: no existing caller sends this header
        yet, so absence must not deny); if present, respond
        `{ allowed: canCreateGuest(role) }`. This is what the hook calls when it opens, to decide
        whether to render the form or the permission-denied notice (design's "no widget
        rendered" behavior for housekeeping, design lines 676-680).
      - `GET /guests/match?email=&phone=` — same header rule (absent → proceed; present and
        `!canCreateGuest(role)` → `res.status(403).json({ error: 'forbidden' })`), otherwise
        `res.status(200).json({ match: findGuestMatch({ email: req.query.email, phone: req.query.phone }) || null })`.
      - `POST /guests` (the existing, shared "direct profile creation" endpoint AC9 refers to):
        add, as the FIRST check inside the handler, before touching the store:
        ```js
        const role = req.headers['x-staff-role'];
        if (role !== undefined && !canCreateGuest(role)) {
          return res.status(403).json({ error: 'forbidden' });
        }
        ```
        then change the existing `catch` block's validation-error branch from
        `res.status(400).json({ error: err.message })` to
        `res.status(400).json({ error: 'validation_error', fields: err.fields })` (safe: no
        existing test asserts on the old body shape, only on status code). Unexpected/thrown
        errors still fall through to `next(err)` → the existing 500 handler
        (`src/server.js:19-21`), unchanged.

      Because the inline hook (scope item 3) calls this exact `POST /guests` endpoint to create a
      profile — the SAME endpoint STORY-100's `public/js/guest-profiles.js` already calls, which
      never sends `x-staff-role` — AC9's "same authorization outcome as attempting direct profile
      creation" holds by construction: there is one code path, one permission check. The
      `role !== undefined` guard is the explicit, deliberate seam that lets this story add real
      permission enforcement without silently retrofitting auth onto STORY-100's already-shipped,
      role-unaware directory feature — flagged in assumptions below as something the reviewer
      should confirm, since it means an unauthenticated/legacy caller is currently NOT denied.
    files:
      - src/guests/routes.js
      - test/guests-inline.test.js
    rationale: |
      Mirrors the existing per-resource router pattern already in this file; keeping permission
      enforcement at the route boundary (before the store is touched) is what guarantees AC10/
      AC11's "no profile is created" / "no guest identifier is returned" outcomes. A NEW test
      file (`test/guests-inline.test.js`) is used instead of editing `test/guests.test.js`, so the
      already-passing STORY-100 suite is left untouched and a reviewer can see the additive
      surface (permission, match, structured fields) in isolation.

  - description: |
      Add `public/js/guest-inline-hook.js`, exporting
      `mountGuestInlineHook(container, { role, api, onLinked, onEvent } = {})`, returning
      `{ open, close }`. On construction it renders the exact markup the design shows inside
      `.embed-boundary` (design lines 744-816) into `container`: the permission-denied `.notice`
      (id `permission-denied-notice`), the `#hook-form` with `field-name`/`field-email`/
      `field-phone` inputs and their `field-error` elements, the `#dup-status` spinner + text, the
      `#dup-match` card with a "Use this profile" button, the service-error `.notice`, and the
      form-actions Cancel/"Create guest profile" buttons — same element ids/classes as the
      prototype.

      Behavior:
      - `open()` calls `api.checkPermission()`; while pending, actionable buttons are disabled;
        then either shows the form (granted) or the permission-denied notice + emits
        `onEvent('guest.permission_denied', { reason: 'insufficient_permissions' })` (AC9-11),
        never calling `api.createGuest`.
      - Input listeners on email/phone debounce 350ms (design line 1128's `setTimeout(..., 350)`)
        and call `api.checkMatch({ email, phone })`, toggling the spinner and rendering the
        match's name/email/id + "Use this profile" button (AC2/AC3). Clicking it calls
        `onLinked({ guestId, displayName, source: 'existing' })`,
        `onEvent('guest.linked', { guestId, displayName, source: 'existing' })`, and closes,
        without ever calling `api.createGuest`.
      - Form `submit` handler calls `event.preventDefault()` first (AC1 — no native navigation),
        then runs the SAME client-side validation as the design (name required; each of
        email/phone must match its regex if present — design's
        `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` for email, normalized-digit length >= 7 for phone; at
        least one of email/phone required), setting per-field `field-error` text and calling
        `onEvent('guest.validation_error', { invalidFields })` without calling the API if any
        field fails (AC5/AC6). This client-side check is where email/phone FORMAT is enforced —
        deliberately not on the server (see scope item 1's rationale).
      - On a client-valid submit it disables the submit button ("Creating…", design line 1197)
        and calls `api.createGuest({ name, email, phone })`, resolving to one of
        `{ ok: true, guest }`, `{ ok: false, kind: 'validation', fields }`,
        `{ ok: false, kind: 'forbidden' }`, or `{ ok: false, kind: 'service_error' }` (the last
        covers both a rejected fetch and any unexpected non-2xx/400/403 status —
        `api.createGuest` never lets a rejected promise reach the hook). On `validation` it
        renders the returned per-field messages (defense in depth — exercises the server's
        structured field errors even though the client gate should normally prevent reaching this
        branch). On `forbidden` it shows the permission-denied notice (defense in depth if
        `open()`'s check was bypassed or role changed mid-flow). On `service_error` it re-enables
        the submit button, shows the service-error notice, leaves every typed value untouched,
        and emits `onEvent('guest.service_error', { reason: 'network_error', persisted: false })`
        — no `onLinked` call (AC7/AC8). On `ok: true` it calls
        `onLinked({ guestId: guest.id, displayName: guest.name, source: 'created' })`, emits
        `onEvent('guest.created', { guestId: guest.id, displayName: guest.name, source: 'created' })`,
        and closes (AC1 + AC4).
      - `close()` resets the form, hides both notices and the dup-match card, clears any pending
        debounce timer, and re-enables the submit button (design's `closeHook()`, lines
        1041-1053).

      Also export `createDefaultApi(role)`, building the four `api` methods from
      `fetch('/guests/...', { headers: { 'x-staff-role': role, 'Content-Type': 'application/json' } })`,
      following the `createDefaultApi(hireId)` pattern already at
      `public/js/hire-profile.js:386-400`. Because this hook ALWAYS supplies a concrete `role`
      value in the header (never omits it), it always exercises the route's explicit
      `canCreateGuest(role)` branch, not the "header absent" backward-compat branch — so
      `front_desk` is allowed and `housekeeping` is denied exactly as the design's role switcher
      shows (design lines 712-719, 955-958).
    files:
      - public/js/guest-inline-hook.js
      - test/guest-inline-hook.test.js
    rationale: |
      This is the "embeddable entry point" the story describes: a plain function a future
      reservation/check-in page can call with its own container and role, with no dependency on
      a host page — matching the design's own framing that only the dashed boundary (not the
      "Front Desk Console" chrome) ships with this story.

tests:
  - |
    AC1 (create without full-page navigation) — test/guest-inline-hook.test.js: mount into a bare
    `<div>` appended to `document.body`, call `open()`, fill in valid name+email, dispatch
    `submit` on `#hook-form` as a cancelable Event, and assert the hook prevented native
    navigation and completed the create in place:
    ```js
    const submitEvent = new Event('submit', { cancelable: true });
    form.dispatchEvent(submitEvent);
    expect(submitEvent.defaultPrevented).toBe(true);
    await Promise.resolve(); await Promise.resolve();
    expect(onLinked).toHaveBeenCalledWith(expect.objectContaining({ source: 'created' }));
    expect(document.body.contains(container)).toBe(true);
    ```
  - |
    AC2 (duplicate detection triggered) — test/guest-inline-hook.test.js: with `api.checkMatch`
    mocked to resolve an existing guest for a seeded email, type it into the email field, advance
    the debounce timer, and assert the match card renders:
    ```js
    fieldEmail.value = 'jordan.lee@example.com';
    fieldEmail.dispatchEvent(new Event('input'));
    jest.advanceTimersByTime(350);
    await Promise.resolve();
    expect(api.checkMatch).toHaveBeenCalledWith({ email: 'jordan.lee@example.com', phone: '' });
    expect(document.getElementById('dup-match').hidden).toBe(false);
    ```
    and test/guests-store.test.js proves the match exists server-side against the seeded fixture
    from scope item 1:
    ```js
    const match = findGuestMatch({ email: 'jordan.lee@example.com', phone: '' });
    expect(match).toMatchObject({ id: 'gst_1005', name: 'Jordan Lee' });
    ```
  - |
    AC3 (staff member can select the existing profile) — test/guest-inline-hook.test.js: clicking
    "Use this profile" links the existing record without creating one:
    ```js
    document.getElementById('use-match-btn').click();
    expect(onLinked).toHaveBeenCalledWith({ guestId: 'gst_1005', displayName: 'Jordan Lee', source: 'existing' });
    expect(api.createGuest).not.toHaveBeenCalled();
    ```
  - |
    AC4 (stable guest identifier returned to the embedding context) — test/guests-store.test.js
    and test/guest-inline-hook.test.js both assert the identifier is stable and passed through
    unchanged:
    ```js
    const guest = createGuest({ name: 'Alex Rivera', email: 'alex@example.com' });
    expect(getGuest(guest.id)).toMatchObject({ id: guest.id, name: 'Alex Rivera' });
    ```
    and at the hook level, after a successful create:
    ```js
    expect(onLinked).toHaveBeenCalledWith({ guestId: expect.any(String), displayName: 'Alex Rivera', source: 'created' });
    ```
  - |
    AC5 (structured validation error) — test/guests-inline.test.js (backend, hitting the shared
    POST /guests) and test/guest-inline-hook.test.js (frontend, client-side format check):
    ```js
    const res = await request(app).post('/guests').send({ name: '' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'validation_error', fields: expect.objectContaining({ name: expect.any(String) }) });
    ```
    and on the hook, submitting with an invalid email format never calls the API:
    ```js
    fieldName.value = 'Alex Rivera'; fieldEmail.value = 'not-an-email';
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(document.getElementById('error-email').hidden).toBe(false);
    expect(api.createGuest).not.toHaveBeenCalled();
    ```
  - |
    AC6 (no profile created on validation failure) — test/guests-inline.test.js asserts the store
    is untouched:
    ```js
    const before = listGuests().length;
    await request(app).post('/guests').send({ name: '' });
    expect(listGuests().length).toBe(before);
    ```
  - |
    AC7 (service/network error surfaced) — test/guest-inline-hook.test.js mocks `api.createGuest`
    to resolve `{ ok: false, kind: 'service_error' }` (representing a network failure, since
    `createDefaultApi` never lets a rejection escape) for an otherwise client-valid submit:
    ```js
    await Promise.resolve(); await Promise.resolve();
    expect(document.getElementById('service-error-notice').hidden).toBe(false);
    expect(onLinked).not.toHaveBeenCalled();
    ```
  - |
    AC8 (no partial profile persisted on service error) — test/guests-inline.test.js asserts an
    unexpected store exception still returns 500 and persists nothing:
    ```js
    jest.spyOn(guestsStore, 'createGuest').mockImplementation(() => { throw new Error('boom'); });
    const before = guestsStore.listGuests().length;
    const res = await request(app).post('/guests').set('x-staff-role', 'front_desk').send({ name: 'X', email: 'x@example.com' });
    expect(res.status).toBe(500);
    expect(guestsStore.listGuests().length).toBe(before);
    ```
    and on the hook, the service-error path leaves every typed value untouched:
    ```js
    expect(fieldName.value).toBe('Alex Rivera');
    ```
  - |
    AC9 (permission denied, same outcome as direct creation) — test/guests-store.test.js and
    test/guests-inline.test.js:
    ```js
    expect(canCreateGuest('housekeeping')).toBe(false);
    expect(canCreateGuest('front_desk')).toBe(true);
    const res = await request(app).post('/guests').set('x-staff-role', 'housekeeping').send({ name: 'X', email: 'x@example.com' });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'forbidden' });
    ```
    and on the hook, opening with a denied role never renders the form:
    ```js
    await hook.open();
    expect(document.getElementById('hook-form').hidden).toBe(true);
    expect(document.getElementById('permission-denied-notice').hidden).toBe(false);
    ```
  - |
    AC10 (no guest profile created when denied) — test/guests-inline.test.js:
    ```js
    const before = listGuests().length;
    await request(app).post('/guests').set('x-staff-role', 'housekeeping').send({ name: 'X', email: 'x@example.com' });
    expect(listGuests().length).toBe(before);
    ```
  - |
    AC11 (no guest identifier returned to the embedding context when denied) —
    test/guest-inline-hook.test.js:
    ```js
    await hook.open();
    expect(api.createGuest).not.toHaveBeenCalled();
    expect(onLinked).not.toHaveBeenCalled();
    ```

assumptions_or_open_questions:
  - |
    Backward-compatibility decision that needs explicit reviewer sign-off: a missing
    `x-staff-role` header on `POST /guests` and `GET /guests/match` is treated as "allowed," not
    "fail closed," because the already-shipped `public/js/guest-profiles.js` (STORY-100) calls
    these same endpoints today and never sends this header — failing closed on its absence would
    silently break the existing guest-directory create flow and its passing test suite. This
    means an unauthenticated/legacy caller is NOT denied by this story's permission check; only a
    caller that explicitly identifies as `housekeeping` (or any role other than `front_desk`) is
    denied. If the reviewer wants the shipped directory UI to also require a role, that is
    additional scope beyond this story (retrofitting STORY-100) and should be called out as its
    own follow-up rather than folded in here silently.
  - |
    Email/phone FORMAT validation (the design's regex checks) is enforced client-side only, in
    the new hook — never added to the shared `createGuest` store function — specifically because
    STORY-100's own passing tests create guests with phone values (e.g. `'555-1'`) that would
    fail that regex. If the reviewer instead wants server-side format enforcement on all guest
    creation (not just the inline hook), STORY-100's existing tests/fixtures would need updating
    first, which is out of this story's stated scope.
  - |
    Only two roles are named anywhere in the story or design: `front_desk` (allowed) and
    `housekeeping` (denied). Any other explicit role value fails closed via `canCreateGuest`,
    since neither the ACs nor the design describe a third tier.
  - |
    AC7/AC8's "service or network error" has no real external dependency to fail against — unlike
    `src/hires/store.js`'s `engineClient`, the guest store is pure in-memory CRUD with nothing to
    time out or reject. This plan exercises it at the hook/API boundary (a rejected or unexpected
    fetch response) plus a backend test that an unexpected store exception still 500s without
    persisting anything, rather than manufacturing a fake network dependency purely to have
    something to fail. The design's own "Simulate service error" checkbox is explicitly labelled
    "demo only, for AC5" (design lines 762-767), confirming this is the intended framing.
  - |
    Duplicate detection (`findGuestMatch`) matches against ALL guests regardless of `status`
    (including ones a staff member deactivated via the STORY-100 directory), since neither the
    story's ACs nor the design's `findMatch` distinguish by status. Flagging in case the reviewer
    wants deactivated profiles excluded from duplicate matches.
  - |
    The guest record shape stays `{ id, name, email, phone, status, preferences, bookingHistory, auditLog }`
    as STORY-100 already defined it — this story adds no new fields to the record itself, only a
    permission check, a match lookup, and a structured error shape around the existing shape.
  - |
    The prototype's "Front Desk Console" host screen and its role-switcher are explicitly called
    out in the design itself as "illustrative only... not part of this story" (design lines
    640-645, 670-676, and the CSS comment at lines 348-351 — which is itself slightly stale, since
    it says "this project has no existing Guest... feature yet," true when TEST-M1-STORY-103's
    design was authored but no longer true now that STORY-100 has since merged). This plan
    therefore does not add a demo host page/route — the hook is tested by mounting it directly
    into a bare container, which is also how a real future consumer would use it.

package_dependencies: []

notes: |
  This story extends the guest module first shipped by TEST-M1-STORY-100 (commit 982815d) rather
  than introducing a "guest" concept from scratch — the original framing of this plan (and the
  design's own CSS comment, lines 348-351) assumed no guest feature existed yet, which was true
  when the design was authored but is no longer true in the current codebase. The design's actual
  screens, markup, and client-side logic (dashed `.embed-boundary`, `ROLE_PERMISSIONS`,
  `findMatch`, per-field validation messages) are unaffected by this correction and are followed
  as-is; only the backend plan changes, to graft the story's requirements onto the real, existing
  `src/guests/` module without regressing it.

  Sibling conventions mirrored: `src/hires/store.js`'s load-time fixture seeding (lines 6-18) and
  `public/js/hire-profile.js`'s `createDefaultApi(hireId)` fetch-wrapper pattern (lines 386-400).
  Front-end tests follow the existing `@jest-environment jsdom` + manual DOM dispatch style used
  in `test/hire-profile.test.js` and `test/guest-profiles.test.js`.

  flowchart TD
    subgraph "Existing (STORY-100, unmodified behavior for legacy callers)"
      DIRUI["public/js/guest-profiles.js<br/>(no x-staff-role header)"]
    end
    subgraph Frontend
      HOOK["public/js/guest-inline-hook.js<br/>mountGuestInlineHook / createDefaultApi(role)"]
    end
    subgraph Backend
      ROUTES["src/guests/routes.js<br/>GET /permission, GET /match, POST / (now permission-gated)"]
      STORE["src/guests/store.js<br/>createGuest (unchanged rules) + canCreateGuest + findGuestMatch (new)"]
    end
    SERVER["src/server.js<br/>app.use('/guests', ...) — already mounted, untouched"]
    DIRUI -- "POST /guests (no header -> allowed)" --> ROUTES
    HOOK -- "fetch with x-staff-role header" --> ROUTES
    SERVER -. "existing mount, no change" .-> ROUTES
    ROUTES -- "calls" --> STORE

    classDef touched fill:#f96,color:#000
    class HOOK,ROUTES,STORE touched
