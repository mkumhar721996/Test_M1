summary: |
  Build the embeddable inline guest-create/select hook described by
  TEST-M1-STORY-103. This repo has no "guest" concept yet, so the work adds a
  new `src/guests/` module (in-memory store + Express routes, mirroring the
  existing `src/hires/` and `src/employees/` modules) and a standalone,
  mountable front-end module `public/js/guest-inline-hook.js` that renders the
  exact markup shown inside the dashed "Inline hook component (this story)"
  boundary in the approved prototype
  (`.arc/designs/TEST-M1-STORY-103-design.html`, screen 1, lines 741-817): the
  permission-denied notice, the create/select form (name/email/phone fields
  with per-field errors), the duplicate-detection status/match card, and the
  service-error notice. The prototype explicitly marks the surrounding "Front
  Desk Console" host page as "illustrative only, not part of this story" (see
  the HTML comment at lines 640-645 and 670-699), so this plan does not build
  a host/demo page — only the reusable hook and the backend it calls, tested
  by mounting the hook into a bare container the way a future reservation/
  check-in flow eventually will.
scope:
  - description: |
      Add `src/guests/store.js`: an in-memory guest store mirroring the
      `Map`-based pattern in `src/hires/store.js` and `src/employees/store.js`.
      Exports:
        - `ROLE_PERMISSIONS = { front_desk: true, housekeeping: false }` and
          `canCreateGuest(role)` — returns `ROLE_PERMISSIONS[role] === true`,
          i.e. fails closed for any unrecognized/missing role. Taken directly
          from the design's own `ROLE_PERMISSIONS` map (design lines 955-958).
        - `class ValidationError extends Error { constructor(fields) { super('validation_error'); this.fields = fields; } }`
        - `createGuest(data)` — validates `name` (required), and that at
          least one of `email`/`phone` is present and passes the same
          regexes the design already encodes (design lines 962-963:
          `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` for email, normalized-digit-length
          >= 7 for phone). On failure throws `new ValidationError({ name?, email?, phone? })`
          with one message per invalid field (never a mix of "required" and
          "invalid format" for the same field). On success stores
          `{ id: crypto.randomUUID(), name, email: email || '', phone: phone || '' }`
          and returns it.
        - `getGuest(id)`, `listGuests()`.
        - `findGuestMatch({ email, phone })` — normalizes the same way the
          design's `normalizeEmail`/`normalizePhone`/`findMatch` do (design
          lines 960-972) and returns the first existing guest whose email or
          phone matches, or `undefined`.
      Seed the store with the exact three fixture guests from the design's
      `#fixture-guests` JSON (design lines 649-655: `gst_1005` Jordan Lee,
      `gst_1006` Priya Nandakumar, `gst_1007` Sam Okafor) so duplicate
      detection is exercisable with the same data reviewers already saw in
      the prototype.
    files:
      - src/guests/store.js
      - test/guests-store.test.js
    rationale: |
      Keeps the store as the single place that owns both validation and the
      permission decision, so the routes in the next scope item and the
      AC6 guarantee ("same authorization outcome as attempting direct
      profile creation") share one function rather than two implementations
      that could drift.
  - description: |
      Add `src/guests/routes.js`, an Express router mounted at `/guests` in
      `src/server.js` (next to `hiresRouter`/`employeesRouter`, following the
      existing `app.use('/hires', hiresRouter)` pattern at src/server.js:15):
        - `GET /guests/permission` — reads the caller's role from the
          `x-staff-role` request header and responds
          `res.status(200).json({ allowed: canCreateGuest(role) })`. This is
          what the hook calls when it opens, so it can decide whether to
          render the form or the permission-denied notice — exactly the
          design's "no widget rendered" behavior for housekeeping (design
          lines 676-680).
        - `GET /guests/match?email=&phone=` — 403s the same way as POST (see
          below) if `!canCreateGuest(role)`, otherwise responds
          `{ match: findGuestMatch({ email, phone }) || null }`.
        - `POST /guests` (the "direct profile creation" endpoint AC6 refers
          to) — if `!canCreateGuest(role)` respond
          `res.status(403).json({ error: 'forbidden' })` before touching the
          store; otherwise call `createGuest(req.body)`, catch
          `ValidationError` and respond
          `res.status(400).json({ error: 'validation_error', fields: err.fields })`,
          otherwise `next(err)` (falls through to the existing 500 handler in
          src/server.js:17-19) for anything unexpected, and respond
          `res.status(201).json(guest)` on success.
      Because the hook (next scope item) calls this same `POST /guests`
      endpoint to create a profile, AC6's "same authorization outcome as
      attempting direct profile creation" holds by construction — there is
      only one creation code path.
    files:
      - src/guests/routes.js
      - src/server.js
      - test/guests.test.js
    rationale: |
      Mirrors the existing per-resource router + `app.use` wiring used by
      every other resource in src/server.js; keeping permission enforcement
      at the route boundary (before the store is touched) is what guarantees
      AC5/AC6's "no partial profile record is persisted" / "no profile is
      created" outcomes.
  - description: |
      Add `public/js/guest-inline-hook.js`, exporting
      `mountGuestInlineHook(container, { role, api, onLinked, onEvent } = {})`,
      which returns `{ open, close }`. On construction it renders the exact
      markup the design shows inside `.embed-boundary` (design lines
      744-816) into `container`: the permission-denied `.notice` (id
      `permission-denied-notice`), the `#hook-form` with `field-name` /
      `field-email` / `field-phone` inputs and their `field-error` elements,
      the `#dup-status` spinner + text, the `#dup-match` card with a
      "Use this profile" button, the service-error `.notice`, and the
      form-actions Cancel/"Create guest profile" buttons — reusing the same
      element ids/classes as the prototype so the markup matches 1:1.

      Behavior:
        - `open()` calls `api.checkPermission()`; while it resolves nothing
          is rendered as actionable (buttons disabled), then either shows the
          form (permission granted) or the permission-denied notice + emits
          `onEvent('guest.permission_denied', { reason: 'insufficient_permissions' })`
          (AC6), never calling `api.createGuest`.
        - Input listeners on email/phone debounce 350ms (matching design line
          1128's `setTimeout(..., 350)`) and call `api.checkMatch({ email, phone })`,
          toggling the spinner and rendering the returned match's name/email/id
          plus a "Use this profile" button (AC2). Clicking it calls
          `onLinked({ guestId, displayName, source: 'existing' })`,
          `onEvent('guest.linked', { guestId, displayName, source: 'existing' })`,
          and closes the hook without ever calling `api.createGuest`.
        - Form `submit` handler always calls `event.preventDefault()` first
          (no native form submission / page navigation — AC1), then runs the
          same client-side validation as the design (name required; each of
          email/phone must match its regex if present; at least one of
          email/phone required), setting per-field `field-error` text and
          calling `onEvent('guest.validation_error', { invalidFields })`
          without calling the API if any field fails (AC4 client half).
        - On a client-valid submit it disables the submit button
          ("Creating…", matching design line 1197) and calls
          `api.createGuest({ name, email, phone })`, which resolves to one of
          `{ ok: true, guest }`, `{ ok: false, kind: 'validation', fields }`,
          `{ ok: false, kind: 'forbidden' }`, or `{ ok: false, kind: 'service_error' }`
          (the last one covering both a network-level rejection and any
          non-2xx/400/403 status — `api.createGuest` never lets a rejected
          promise reach the hook). On `validation` it renders the returned
          per-field messages (AC4 server half — exercises structured field
          errors even when they didn't originate from the client checks). On
          `forbidden` it shows the permission-denied notice (defense in
          depth if `open()`'s check was bypassed or role changed mid-flow).
          On `service_error` it re-enables the submit button, shows the
          service-error notice, leaves every typed value untouched, and emits
          `onEvent('guest.service_error', { reason: 'network_error', persisted: false })`
          — no `onLinked` call (AC5). On `ok: true` it calls
          `onLinked({ guestId: guest.id, displayName: guest.name, source: 'created' })`,
          emits `onEvent('guest.created', { guestId: guest.id, displayName: guest.name, source: 'created' })`,
          and closes (AC1 + AC3).
        - `close()` resets the form, hides both notices and the dup-match
          card, clears any pending debounce timer, and re-enables the submit
          button — mirroring the design's `closeHook()` (lines 1041-1053).

      Also export `createDefaultApi(role)`, building the four `api` methods
      above from `fetch('/guests/...', { headers: { 'x-staff-role': role, 'Content-Type': 'application/json' } })`,
      following the `createDefaultApi(hireId)` pattern already used in
      public/js/hire-profile.js:386-400.
    files:
      - public/js/guest-inline-hook.js
      - test/guest-inline-hook.test.js
    rationale: |
      This is the actual "embeddable entry point" the story describes: a
      plain function a future reservation/check-in page can call with its
      own container element and role, with no dependency on a specific host
      page, matching the design's own framing that only the dashed boundary
      (not the "Front Desk Console" chrome around it) ships with this story.
tests:
  - |
    AC1 (create without full-page navigation) — test/guest-inline-hook.test.js:
    mount into a bare `<div>` appended to `document.body`, call `open()`,
    fill in valid name+email, dispatch `submit` on `#hook-form` as a
    `cancelable` Event, and assert the hook prevented native navigation and
    still completed the create in place:
      const submitEvent = new Event('submit', { cancelable: true });
      form.dispatchEvent(submitEvent);
      expect(submitEvent.defaultPrevented).toBe(true);
      await Promise.resolve(); await Promise.resolve();
      expect(onLinked).toHaveBeenCalledWith(expect.objectContaining({ source: 'created' }));
      expect(document.body.contains(container)).toBe(true);
  - |
    AC2 (duplicate detection) — test/guest-inline-hook.test.js: with
    `api.checkMatch` mocked to resolve an existing guest for a seeded email,
    type it into the email field, advance the debounce timer, and assert the
    match card renders and selecting it links the existing profile without
    creating one:
      fieldEmail.value = 'jordan.lee@example.com';
      fieldEmail.dispatchEvent(new Event('input'));
      jest.advanceTimersByTime(350);
      await Promise.resolve();
      expect(api.checkMatch).toHaveBeenCalledWith({ email: 'jordan.lee@example.com', phone: '' });
      document.getElementById('use-match-btn').click();
      expect(onLinked).toHaveBeenCalledWith({ guestId: 'gst_1005', displayName: 'Jordan Lee', source: 'existing' });
      expect(api.createGuest).not.toHaveBeenCalled();
  - |
    AC3 (stable identifier returned to the embedding context) —
    test/guests-store.test.js and test/guest-inline-hook.test.js both assert
    the identifier is stable and passed through unchanged:
      const guest = createGuest({ name: 'Alex Rivera', email: 'alex@example.com' });
      expect(getGuest(guest.id)).toMatchObject({ id: guest.id, name: 'Alex Rivera' });
    and, at the hook level, after a successful create:
      expect(onLinked).toHaveBeenCalledWith({ guestId: expect.any(String), displayName: 'Alex Rivera', source: 'created' });
  - |
    AC4 (validation error, structured, nothing created) —
    test/guests.test.js (backend) and test/guest-inline-hook.test.js
    (frontend):
      const res = await request(app).post('/guests').set('x-staff-role', 'front_desk').send({ name: '' });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'validation_error', fields: expect.objectContaining({ name: expect.any(String) }) });
      expect(listGuests().length).toBe(guestsBefore);
    and on the hook, submitting with a blank name never calls the API:
      expect(document.getElementById('error-name').hidden).toBe(false);
      expect(api.createGuest).not.toHaveBeenCalled();
  - |
    AC5 (service/network error, no partial record) — test/guest-inline-hook.test.js
    mocks `api.createGuest` to resolve `{ ok: false, kind: 'service_error' }`
    (representing a network failure, since `createDefaultApi` never lets a
    rejection escape) for an otherwise-valid submit:
      await Promise.resolve(); await Promise.resolve();
      expect(document.getElementById('service-error-notice').hidden).toBe(false);
      expect(fieldName.value).toBe('Alex Rivera');
      expect(onLinked).not.toHaveBeenCalled();
    and test/guests.test.js asserts an unexpected store error persists nothing:
      jest.spyOn(guestsStore, 'createGuest').mockImplementation(() => { throw new Error('boom'); });
      const res = await request(app).post('/guests').set('x-staff-role', 'front_desk').send(validPayload);
      expect(res.status).toBe(500);
      expect(guestsStore.listGuests().length).toBe(guestsBefore);
  - |
    AC6 (permission denied, same outcome as direct creation) —
    test/guests-store.test.js, test/guests.test.js, and
    test/guest-inline-hook.test.js:
      expect(canCreateGuest('housekeeping')).toBe(false);
      expect(canCreateGuest('front_desk')).toBe(true);
      const res = await request(app).post('/guests').set('x-staff-role', 'housekeeping').send(validPayload);
      expect(res.status).toBe(403);
      expect(res.body).toEqual({ error: 'forbidden' });
      expect(listGuests().length).toBe(guestsBefore);
    and on the hook, opening with a denied role never renders the form or
    calls create:
      await hook.open();
      expect(document.getElementById('hook-form').hidden).toBe(true);
      expect(document.getElementById('permission-denied-notice').hidden).toBe(false);
      expect(api.createGuest).not.toHaveBeenCalled();
assumptions_or_open_questions:
  - |
    No authentication/session system exists anywhere in this codebase today
    (grepped src/ for "auth"/"role"/"permission" — the only hits are the
    hires engine-run fields, unrelated to staff identity). This plan carries
    the calling staff member's role as an explicit `x-staff-role` request
    header, mirroring how the design's own role-switcher simulates identity
    client-side (design lines 712-719, 955-958). A real embedding flow would
    presumably supply this from whatever session/auth mechanism it has, but
    none exists yet in Test_M1 to integrate with — flagging this as an
    explicit gap rather than inventing an auth system beyond this story's
    scope.
  - |
    Only two roles are named anywhere in the story or design: `front_desk`
    (allowed) and `housekeeping` (denied). Any other or missing role value
    fails closed (`canCreateGuest` returns false), since neither the ACs nor
    the design describe a third tier.
  - |
    AC5's "service or network error" has no real external dependency to fail
    against — unlike `src/hires/store.js`'s `engineClient`, the guest store
    is a pure in-memory CRUD with nothing to time out or reject. Per the
    design's own admission (the "Simulate service error" checkbox is
    "demo only, for AC5", design lines 762-767), this plan exercises AC5 at
    the hook/API boundary (a rejected or non-2xx/400/403 fetch) plus a
    backend test that an unexpected store exception still returns 500
    without persisting anything, rather than manufacturing a fake network
    dependency purely to have something to fail.
  - |
    The guest record shape is `{ id, name, email, phone }` only — the parent
    epic mentions "preferences, and booking history" but no AC in this story
    requires either field, so they're left out of `createGuest`'s shape to
    avoid speculative scope.
  - |
    The prototype's "Front Desk Console" host screen and its role-switcher
    are explicitly called out in the design itself as "illustrative
    only... not part of this story" (design lines 640-645, 670-676). This
    plan therefore does not add a demo host page/route — the hook is tested
    by mounting it directly into a bare container, which is also how a real
    future consumer would use it.
package_dependencies: []
notes: |
  This is the first "guest" concept anywhere in Test_M1 — there is no
  existing Guest/Reservation feature or route to extend, only the sibling
  `src/hires/` and `src/employees/` modules to mirror for conventions
  (in-memory `Map` store, `crypto.randomUUID()` ids, one router per
  resource mounted in `src/server.js`, and a `public/js/<feature>.js` module
  exporting an `init*`/`mount*` function plus a `createDefaultApi` fetch
  wrapper, tested under `@jest-environment jsdom` the same way
  test/hire-profile.test.js and test/expenses-create.test.js already do).

  Design gap carried over from the prototype's own comment (design lines
  338-351, previously flagged in TEST-M1-STORY-032/091 per that comment):
  the design system has no dedicated error/danger/success color token, so
  the hook's rendered validation errors, service-error notice, and
  permission-denied notice all must (and, per the design, already do) tell
  their states apart by icon (⚠ / ⛔ / ✓) + label text + emphasized border,
  never by color alone. Scope item 3 (public/js/guest-inline-hook.js) must
  preserve those exact icons/wording rather than substituting a color-only
  treatment.

  flowchart TD
    subgraph Frontend
      HOOK["public/js/guest-inline-hook.js<br/>mountGuestInlineHook / createDefaultApi"]
    end
    subgraph Backend
      SERVER["src/server.js<br/>app.use('/guests', ...)"]
      ROUTES["src/guests/routes.js<br/>GET /permission, GET /match, POST /"]
      STORE["src/guests/store.js<br/>createGuest, findGuestMatch, canCreateGuest"]
    end
    HOOK -- "fetch (x-staff-role header)" --> ROUTES
    SERVER -- "mounts router" --> ROUTES
    ROUTES -- "calls" --> STORE
    HIRES["src/hires/routes.js + store.js<br/>(existing sibling, mirrored not modified)"]
    SERVER -. "same app.use pattern" .-> HIRES

    classDef touched fill:#f96,color:#000
    class HOOK,SERVER,ROUTES,STORE touched
