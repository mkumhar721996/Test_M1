summary: |
  Add server-side duplicate detection for new guest profiles (matching on
  normalized email or phone against all existing guests, active or
  deactivated) and surface it in the "New guest profile" modal before a
  create request is sent. A new non-mutating `GET /guests/duplicates` route
  backed by a pure `findDuplicateGuests` matcher in `src/guests/store.js`
  lets the client check for matches; the modal then either shows a
  duplicate-warning step (Link to an existing profile, or confirm-and-proceed
  to create a new one anyway) or creates the profile immediately when there
  is no match, exactly as today. The interaction pattern, banner/match-card
  layout, and styling are taken from the approved prototype at
  `.arc/designs/TEST-M1-STORY-102-design.html`, adapted to this app's real
  guest data model and existing Guest Profiles screens (see
  `assumptions_or_open_questions` for the specific adaptations and the
  design/AC mismatch this surfaced).

scope:
  - description: |
      Add a pure `findDuplicateGuests(candidate, guests)` function to
      `src/guests/store.js` and export it. Mirrors the prototype's own
      `findDuplicates()`: case/whitespace-insensitive email match, digit-only
      phone match, returns one entry per matching guest with the reason(s)
      it matched on.

      ```js
      function normalizePhone(phone) { return String(phone || '').replace(/\D/g, ''); }

      function findDuplicateGuests(candidate, guests) {
        const email = String(candidate.email || '').trim().toLowerCase();
        const phone = normalizePhone(candidate.phone);
        const matches = [];
        guests.forEach((g) => {
          const reasons = [];
          if (email && String(g.email || '').trim().toLowerCase() === email) reasons.push('email');
          if (phone && normalizePhone(g.phone) === phone) reasons.push('phone');
          if (reasons.length) matches.push({ guest: g, reasons });
        });
        return matches;
      }
      ```
    files:
      - src/guests/store.js
    rationale: |
      AC1 requires surfacing likely duplicates on email-or-phone match before
      save. Keeping the matcher pure and separate from `createGuest` means the
      check never mutates state, matching AC6/AC7 ("no matching profiles ->
      no warning, created normally") and letting the route below stay a
      simple `GET`.

  - description: |
      Add a non-mutating `GET /guests/duplicates` route to
      `src/guests/routes.js`, registered before `GET /:id` so `duplicates`
      is never swallowed by the `:id` param route. Reads `email`/`phone`
      query params, calls `findDuplicateGuests` against `listGuests()`.

      ```js
      router.get('/duplicates', (req, res, next) => {
        try {
          const matches = findDuplicateGuests(
            { email: req.query.email, phone: req.query.phone },
            listGuests(),
          );
          res.status(200).json({ matches });
        } catch (err) {
          next(err);
        }
      });
      ```
    files:
      - src/guests/routes.js
    rationale: |
      This is the endpoint the create-modal calls before submitting. It must
      be read-only (AC1 says "before the new record is saved") and must not
      be shadowed by the existing `GET /:id` route, so it has to be declared
      above it in the router.

  - description: |
      Restructure the "New guest profile" modal in `public/guest-profiles.html`
      into two steps, following the prototype's screen-0 live modal
      (`#step-details` / `#step-duplicates`):
      - `#step-details` wraps the existing `#create-form` unchanged.
      - `#step-duplicates` (new, initially `hidden`) adds: a
        `.duplicate-banner` (role="alert", ⚠ icon, title + copy — copied
        1:1 from the prototype's `#dup-banner-title`/`#dup-banner-copy`
        structure), a `#dup-cards` container for one `.match-card` per
        match, a `.dup-proceed-row` with "← Edit details" and "Proceed
        anyway — create new profile" buttons, and a `.dup-confirm-inline`
        (hidden by default) with the "Create a separate profile ... even
        though it may match" copy and Cancel / "Yes, create new profile"
        buttons — all structurally identical to the prototype's
        `#dup-proceed-confirm`.
      - Each `.match-card` (rendered by JS, see next scope item) shows the
        existing guest's name, an Active/Deactivated status label (the
        prototype's card also shows `role · department`, which guests don't
        have — dropped, see assumptions), the email/phone that matched, a
        `.chip.match-chip` naming the match reason ("Matched on email" /
        "Matched on phone" / "Matched on email & phone"), and a "Link to
        this profile" button.
    files:
      - public/guest-profiles.html
    rationale: |
      This is the DOM the prototype's screen 0 (the "fully working" modal,
      per its own comment: "used for the live walkthrough of AC1-AC7") uses
      to drive Link / Proceed-anyway / plain-create. Reusing its ids/classes
      keeps the CSS below a drop-in match to the approved layout instead of
      an invented one.

  - description: |
      Add the duplicate-step styles to `public/css/guest-profiles.css`,
      copied from the prototype's inlined `<style>` block (same tokens,
      same class names): `.duplicate-banner`, `.match-card` (+
      `-header`/`-name`/`-contact`/`-actions`), `.match-chip`,
      `.dup-proceed-row`, `.dup-confirm-inline` (+ `[hidden]` and
      `.dup-confirm-actions`). `.chip`/`.card`/`.btn*`/`.field` primitives
      already exist in `design-system/prototype-utils.css` and are reused,
      not redefined.
    files:
      - public/css/guest-profiles.css
    rationale: |
      Matches this repo's existing split (shared primitives in
      `design-system/prototype-utils.css`, page-specific composed classes in
      `guest-profiles.css` — see the file's own `consequence-note`/
      `deactivated-banner` blocks for the precedent) and reproduces the
      prototype's colours/spacing/border-style signalling (dashed
      `--color-primary` border = "needs a decision", per the prototype's own
      design-system-gap comment) exactly rather than inventing new tokens.

  - description: |
      Wire the duplicate check into `public/js/guest-profiles.js`:
      - `createDefaultApi()` gets a `checkDuplicates(email, phone)` method:
        `fetch('/guests/duplicates?' + new URLSearchParams({ email, phone }))`
        parsed as JSON, matching the `get`/`create`/`update` pattern already
        there.
      - The `create-form` submit handler validates as today, then calls
        `api.checkDuplicates(email, phone)` instead of calling `api.create`
        directly:
        - On failure to reach the check itself: proceed straight to the
          existing `api.create(...)` call (fail-open — see assumptions).
        - `matches.length === 0`: unchanged existing behaviour — call
          `api.create`, close modal, refresh table, toast (AC6, AC7).
        - `matches.length > 0`: render `#dup-cards` from the matches, show
          `#step-duplicates`, hide `#step-details` (AC1).
      - `#dup-cards` click delegate for `[data-link-id]`: never calls
        `api.create`; instead resolves the matched guest object already in
        hand, closes the create modal, calls the existing
        `openProfileFromGuest(guest)`, and shows a toast, e.g. `` `Linked to
        ${guest.name}'s existing profile — no new profile was created.` ``
        (AC2, AC3).
      - `#dup-proceed-btn` reveals `.dup-confirm-inline`; its Cancel button
        hides it again; `#dup-proceed-confirm-btn` calls the same
        `api.create({ name, email, phone, roomType, dietary, communication,
        actor })` used by the no-match path with the originally-submitted
        values, then closes the modal (which hides `#step-duplicates` with
        it — AC5), refreshes the table, and toasts (AC4).
      - Modal close/reset (`closeCreateModal`, the existing Escape handler,
        and reopening via `new-guest-btn`) also resets `#step-details`
        visible / `#step-duplicates` + `.dup-confirm-inline` hidden, so a
        fresh "New guest profile" always starts on the details step.
    files:
      - public/js/guest-profiles.js
    rationale: |
      Keeps the existing `api.create`/toast/table-refresh plumbing from
      STORY-091/100 as the single creation path for both the no-match and
      proceed-anyway cases, so duplicate detection is purely an extra gate in
      front of it rather than a second code path.

  - description: |
      Backend tests in `test/guests.test.js` for the new route (AC1, AC6).
    files:
      - test/guests.test.js
    rationale: ""

  - description: |
      Frontend tests in `test/guest-profiles.test.js` for the modal's
      duplicate-detection flow (AC1-AC7 as they apply client-side).
    files:
      - test/guest-profiles.test.js
    rationale: ""

tests:
  - |
    AC1 — GET /guests/duplicates surfaces a match by email (case-insensitive)
    before anything is saved, and creates nothing itself:
    ```js
    test('AC1: GET /guests/duplicates surfaces a match by email without creating anything', async () => {
      const createRes = await request(app).post('/guests').send({ name: 'Nora Diaz', email: 'nora@example.com', actor: 'Priya Nair' });
      const before = await request(app).get('/guests');
      const res = await request(app).get('/guests/duplicates').query({ email: 'NORA@example.com', phone: '' });
      expect(res.status).toBe(200);
      expect(res.body.matches).toHaveLength(1);
      expect(res.body.matches[0].guest.id).toBe(createRes.body.id);
      expect(res.body.matches[0].reasons).toEqual(['email']);
      const after = await request(app).get('/guests');
      expect(after.body.length).toBe(before.body.length);
    });
    ```
    Frontend companion — submitting a form whose email matches shows the
    duplicate step and never calls create:
    ```js
    expect(document.getElementById('step-duplicates').hidden).toBe(false);
    expect(api.create).not.toHaveBeenCalled();
    ```
  - |
    AC2 — choosing "Link to this profile" never calls create:
    ```js
    document.querySelector('#dup-cards [data-link-id]').click();
    await Promise.resolve(); await Promise.resolve();
    expect(api.create).not.toHaveBeenCalled();
    ```
  - |
    AC3 — after linking, the existing profile is the one shown as the record
    to use:
    ```js
    expect(document.getElementById('profile-name').textContent).toBe(existingGuest.name);
    expect(document.getElementById('profile-screen').hidden).toBe(false);
    ```
  - |
    AC4 — "Proceed anyway" requires the inline confirmation, then creates a
    new profile with the originally-submitted data:
    ```js
    document.getElementById('dup-proceed-btn').click();
    expect(document.getElementById('dup-proceed-confirm').hidden).toBe(false);
    document.getElementById('dup-proceed-confirm-btn').click();
    await Promise.resolve(); await Promise.resolve();
    expect(api.create).toHaveBeenCalledWith(expect.objectContaining({ name: 'New Person', email: existingGuest.email }));
    ```
  - |
    AC5 — confirming "Proceed anyway" dismisses the duplicate warning (the
    create modal, including `#step-duplicates`, is closed):
    ```js
    expect(document.getElementById('create-modal').hidden).toBe(true);
    ```
  - |
    AC6 — GET /guests/duplicates with no matching email/phone returns no
    matches, and the UI never shows the duplicate step for a non-matching
    submission:
    ```js
    test('AC6: GET /guests/duplicates returns no matches when nothing matches', async () => {
      const res = await request(app).get('/guests/duplicates').query({ email: 'nobody@example.com', phone: '5550000000' });
      expect(res.body.matches).toEqual([]);
    });
    ```
    ```js
    expect(document.getElementById('step-duplicates').hidden).toBe(true);
    ```
  - |
    AC7 — a non-matching submission creates the profile normally, exactly
    once:
    ```js
    expect(api.create).toHaveBeenCalledTimes(1);
    expect(document.getElementById('guest-tbody').textContent).toContain('New Person');
    ```

assumptions_or_open_questions:
  - |
    Design/AC mismatch, flagged rather than silently resolved: the approved
    prototype at `.arc/designs/TEST-M1-STORY-102-design.html` renders a
    different app ("Onboarding") and a different entity ("hire profiles" —
    fields are name/email/phone/department/role/startDate, ids look like
    `hire_2031`) than the one this story's ACs and the rest of this codebase
    describe (this repo's real "Guest Services" app — guests have
    name/email/phone/roomType/dietary/communication, ids like `GST-1002`,
    booking history, an audit trail — see `public/guest-profiles.html` /
    `src/guests/store.js`, built in TEST-M1-STORY-091/092/094/100). There is
    no guest-domain version of this prototype. This plan therefore takes the
    prototype's *interaction pattern and component styling* (duplicate
    banner, match cards with a match-reason chip, Link vs. Proceed-anyway
    with a single inline confirmation, toast + table refresh) — which
    directly implements AC1-AC7 regardless of domain — and maps it onto the
    real guest fields and the existing Guest Profiles screens, rather than
    copying the "hire"/"Onboarding"/department/role/startDate content
    verbatim, which would contradict the guest data model already in this
    repo.
  - |
    The prototype's match-card shows a `role · department · status` line;
    guests have no role/department, so the equivalent line in this
    implementation shows only the Active/Deactivated status label.
  - |
    The prototype's live flow (screen 0) navigates to three separate
    full-page confirmation screens (Linked / Proceeded / No-match),
    reachable only via its reviewer bar, not through any in-app navigation.
    This app has no such pages, and STORY-091/100 already established the
    real pattern for feedback after a mutation: toast + stay on (or return
    to) the list. This plan follows that existing pattern — Proceed-anyway
    and no-match close the modal and refresh the directory table with a
    toast; Link navigates into the already-built guest Profile screen
    (STORY-100) plus a toast, since that screen *is* this app's "existing
    profile is now the record to use" view.
  - |
    If the `GET /guests/duplicates` request itself fails (network/5xx), the
    plan proceeds straight to `api.create` rather than blocking guest
    creation on the health of the duplicate check — no AC covers this, and
    refusing to let staff create a guest because the *duplicate check*
    failed to load would be a worse outcome than an occasional missed
    duplicate warning. Existing create-failure handling (error toast) covers
    the rest.
  - |
    Deactivated guests are still surfaced as possible duplicates (mirrors
    the prototype's own "Sam Okafor — deactivated" match example). No AC
    excludes them, and linking to a deactivated profile is a valid, existing
    action in this app (its profile screen already supports reactivating
    from there per STORY-100).

package_dependencies: []

notes: |
  This story adds one new read-only route and one new client-side gate in
  front of an already-existing, already-tested creation path (`POST
  /guests`, built in TEST-M1-STORY-091, and its directory/table refresh from
  TEST-M1-STORY-100) — it does not change how a guest profile is actually
  created, only whether/when the create call is made and what's shown first.

  ```mermaid
  flowchart TD
    routes[src/guests/routes.js]:::touched
    store[src/guests/store.js]:::touched
    html[public/guest-profiles.html]:::touched
    js[public/js/guest-profiles.js]:::touched
    css[public/css/guest-profiles.css]:::touched
    server[src/server.js]
    profileScreen[existing profile-screen / openProfileFromGuest]

    server -->|mounts /guests| routes
    routes -->|"findDuplicateGuests(), listGuests()"| store
    js -->|"GET /guests/duplicates"| routes
    js -->|"POST /guests (unchanged)"| routes
    html -->|DOM read/written by| js
    css -->|styles| html
    js -->|"Link -> openProfileFromGuest(guest)"| profileScreen

    classDef touched fill:#f96,color:#000
  ```
