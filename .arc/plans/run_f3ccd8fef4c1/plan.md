summary: |
  Build the backend and frontend for guest profile CRUD with soft-delete, matching the
  approved prototype at .arc/designs/TEST-M1-STORY-100-design.html. This introduces a new
  `src/guests` domain (in-memory store + Express routes, following the exact shape already
  used by `src/hires`) exposing create, read, partial-update, deactivate, and reactivate
  operations, each of which appends an audit entry naming the acting staff member and a
  timestamp. The frontend is a single static page (`public/guest-profiles.html` +
  `public/js/guest-profiles.js`, styled by a new `public/css/guest-profiles.css`) that
  reproduces the design's "Guest Directory" and "Guest Profile" screens verbatim — search/lookup
  toolbar, create-guest modal, guest table, not-found panel, profile view/edit toggle,
  deactivate/reactivate confirm modals, booking history, and audit trail — talking to the new
  `/guests` API instead of the prototype's in-memory fixture array. The design's reviewer bar,
  "Reset demo data" button, and the non-interactive "Reference States" screen are prototype
  review scaffolding and are intentionally not built.

scope:
  - description: |
      Create `src/guests/store.js`: an in-memory `Map`-backed guest store mirroring the shape
      of `src/hires/store.js`. Guest shape:
      ```js
      {
        id, name, email, phone,
        status: 'active' | 'deactivated',
        createdAt, updatedAt,          // ISO strings
        preferences: { roomType, dietary, communication },
        bookingHistory: [],             // owned/displayed here, not mutated by this story
        auditLog: [{ ts, actor, action }],
      }
      ```
      Export `createGuest(data, actor)`, `getGuest(id)`, `listGuests()`,
      `updateGuest(id, changes, actor)`, `deactivateGuest(id, actor)`, `reactivateGuest(id, actor)`.
      `createGuest` and `updateGuest` enforce the standing invariant "name present AND at least
      one of email/phone present" by throwing a `GuestValidationError` (`.statusCode = 400`)
      when violated — for `updateGuest` this is checked against the *merged* result of existing
      + supplied changes, so clearing the name or removing the last contact detail via PATCH is
      rejected and nothing is written. `updateGuest` only writes fields that are keys of
      `changes` (partial-update semantics — AC4), appends one audit entry summarizing which
      fields changed, and no-ops the audit append when nothing actually changed value.
      `deactivateGuest`/`reactivateGuest` flip `status` and push a single audit entry each, with
      no side effects on `bookingHistory` or prior audit entries (AC6).
    files:
      - src/guests/store.js
    rationale: |
      Mirrors the existing `src/hires/store.js` pattern (Map store, plain functions, audit-less
      version already precedents `updateHire`'s "only supplied keys change" behavior via
      `Object.assign(hire, changes)`) so the new domain fits the codebase's established shape
      rather than inventing a new persistence pattern. Audit-log-on-every-mutation is new here
      (hires/employees have no audit trail) because AC9 requires it explicitly for this item.

  - description: |
      Create `src/guests/routes.js`: an Express router exposing:
      ```
      GET    /guests            -> 200 [guest, ...]
      POST   /guests             -> 201 guest | 400 { error }
      GET    /guests/:id         -> 200 guest | 404 { error: 'guest not found' }
      PATCH   /guests/:id         -> 200 guest | 400 { error } | 404 { error: 'guest not found' }
      POST   /guests/:id/deactivate -> 200 guest | 404 { error: 'guest not found' }
      POST   /guests/:id/reactivate -> 200 guest | 404 { error: 'guest not found' }
      ```
      `POST /guests` and `PATCH /guests/:id` read an `actor` field off `req.body` (the acting
      staff member's display name, e.g. `"Priya Nair"`) and pass it through to the store;
      `PATCH` only forwards a `PATCHABLE_FIELDS = ['name', 'email', 'phone', 'roomType',
      'dietary', 'communication']` allow-list via a `pickPatchableFields(body)` helper, exactly
      like `src/hires/routes.js`'s existing `pickPatchableFields`. A `GuestValidationError`
      (`.statusCode === 400`) thrown by the store is caught and mapped to a 400 JSON response;
      any other error is forwarded to `next(err)`.
    files:
      - src/guests/routes.js
    rationale: |
      Same request/response contract shape as `src/hires/routes.js` (same verbs, same 404 body
      shape, same PATCH allow-list technique) so the two domains stay consistent and reviewable
      by the same mental model.

  - description: |
      Mount the new router in `src/server.js`:
      ```js
      const guestsRouter = require('./guests/routes');
      ...
      app.use('/guests', guestsRouter);
      ```
    files:
      - src/server.js
    rationale: |
      `src/server.js` already mounts one router per domain (`/employees`, `/workflows`,
      `/runs`, `/hires`); `/guests` follows the same one-line registration.

  - description: |
      Write `test/guests.test.js` (supertest against `src/server.js`, no jsdom) with one test
      per acceptance criterion — see `tests` below for the concrete assertions.
    files:
      - test/guests.test.js
    rationale: |
      Matches `test/hires.test.js`'s existing supertest-against-the-real-app style; the guest
      API is the authoritative record so its contract is verified at the HTTP layer, not just
      via the store functions directly.

  - description: |
      Create `public/guest-profiles.html`, reproducing the design's "Guest Directory" and
      "Guest Profile" screens (`.arc/designs/TEST-M1-STORY-100-design.html` lines ~764–1063) as
      two sections in one page, toggled by JS instead of the prototype's reviewer `show(i)`
      slideshow. Concretely this ports (verbatim ids/classes, real data instead of the fixture
      array):
      - Directory: `.app-topbar` (brand "Guest Services", nav "Guests"/"Bookings"), `.toolbar`
        with `#search-input` ("Name, email, phone, or ID"), `#lookup-form`/`#lookup-input`
        ("Open profile by ID", placeholder "e.g. GST-1002")/`#lookup-btn`, `#new-guest-btn`
        ("+ New guest profile"); `table.guest-table` in `#guest-tbody` with columns
        Guest/Contact/Status/Last updated/Actions and a `.view-link-btn`; `#directory-empty`
        ("No guests match ..."); `#directory-not-found` (`role="alert"`, "No guest profile
        found for ID ..."), whose copy explicitly covers update/delete attempts too (AC10-12).
      - Create modal `#create-modal`: `#field-name`, `#field-email`, `#field-phone` (with
        `#error-name`/`#error-contact` per the design's inline validation), `#field-room`,
        `#field-dietary`, `#field-comm` (select: blank/Email/Phone/SMS).
      - Profile screen: `#profile-back-btn`, `#profile-name`, `#profile-meta`,
        `#profile-status-chip`, `#deactivated-banner`, `#edit-profile-btn`,
        `#deactivate-profile-btn`, `#reactivate-profile-btn` (hidden unless deactivated),
        `#details-view-mode` (`#kv-list`: Email/Phone/Room preference/Dietary notes/Preferred
        contact), `#details-edit-mode` (`#edit-form` with the same field set plus
        `#edit-error-name`/`#edit-error-contact`, and the design's exact copy "Only the fields
        you change will be updated."), `#booking-history` card, `#audit-list` card.
      - `#deactivate-modal`/`#reactivate-modal` confirm dialogs with `.consequence-note` copy
        panels, and `#toast`/`#profile-toast`.
      The reviewer bar, "Reset demo data" button, and the "Reference States" screen (design
      lines 1065–1184) are prototype-only and are NOT included.
      Links `../design-system/tokens.css`, `../design-system/prototype-utils.css`, and the new
      `./css/guest-profiles.css`, and loads `./js/guest-profiles.js` with `defer` — same
      `<head>` wiring as `public/hire-profile.html`.
    files:
      - public/guest-profiles.html
    rationale: |
      The design is the sole record of this UI and must be built as-is; citing exact element
      ids lets the frontend module (`guest-profiles.js`) and its tests bind to the same
      contract the design already established, and keeps CSS/JS hookable without re-deriving
      the layout.

  - description: |
      Create `public/css/guest-profiles.css` porting the page-specific rules from the design's
      third `<style>` block (toolbar, guest-table, status-chip, skeleton, empty/not-found/error
      states, consequence-note, deactivated-banner, kv-list/kv-row, booking-table, audit-list,
      field-error-text/input-error, back-link, profile-header-row/profile-actions, layout-grid,
      card-header-row) — everything used by the Directory/Profile screens. The reviewer-bar
      styles and the `.reference-grid`/`.ac-tag`/`.mini-card`/`.diff-*` rules (Reference States
      screen only) are excluded since that screen isn't being built. Base primitives
      (`.btn`, `.card`, `.input`, `.modal-*`, `.toast`, `.app-topbar`, `.page`, `.field`,
      `.label`) already live in `design-system/prototype-utils.css` and are reused, not
      redefined — matching how `public/css/hire-profile.css` and `public/css/expenses.css`
      layer their page-specific CSS on top of the shared file today.
    files:
      - public/css/guest-profiles.css
    rationale: |
      Keeps the same two-tier CSS convention (shared tokens/utils file + one page-specific file
      per page) already established by `hire-profile.css` and `expenses.css`, rather than
      inlining styles or duplicating the shared primitives.

  - description: |
      Create `public/js/guest-profiles.js` exporting `initGuestProfilesApp(doc, initialGuests,
      api)` and `createDefaultApi()`, following the `initHireProfileApp(doc, initialHire, api)`
      pattern in `public/js/hire-profile.js` (dependency-injected `api` object so tests can
      supply mocks/fakes instead of hitting `fetch`). Responsibilities:
      - Render the directory table from `initialGuests`; live-filter via `#search-input`
        (name/email/phone/id, case-insensitive substring) exactly like the design's
        `applySearchFilter`; show `#directory-empty` when a search matches nothing.
      - `#lookup-form` submit calls `api.get(id)`; on success opens that guest's profile
        (AC2); on a rejection shaped `{ status: 404 }` shows `#directory-not-found` with the
        looked-up id interpolated into `.nf-id` (AC10).
      - `#create-form` submit validates name-required and email-or-phone-required client-side
        (mirroring the design's `error-name`/`error-contact` behavior), else calls
        `api.create({ name, email, phone, roomType, dietary, communication, actor: STAFF_NAME
        })`; on success prepends the guest to the list and re-renders (AC1).
      - Opening a profile renders `#kv-list`, `#booking-history` (table or "No bookings on file
        yet." note), and `#audit-list` (newest first, with a `.audit-just-now` tag on the entry
        whose timestamp matches the most recent mutation) from the full guest object returned
        by the API (AC3).
      - `#edit-form` submit computes a diff against the currently-loaded guest and calls
        `api.update(id, changes)` with ONLY the changed keys present (never the unchanged ones)
        — the concrete mechanism behind AC4's "only the supplied fields change":
        ```js
        function diffChanges(guest, form) {
          const changes = {};
          if (form.name !== guest.name) changes.name = form.name;
          if (form.email !== (guest.email || '')) changes.email = form.email;
          if (form.phone !== (guest.phone || '')) changes.phone = form.phone;
          if (form.roomType !== guest.preferences.roomType) changes.roomType = form.roomType;
          if (form.dietary !== guest.preferences.dietary) changes.dietary = form.dietary;
          if (form.communication !== guest.preferences.communication) changes.communication = form.communication;
          return changes;
        }
        ```
      - `#deactivate-confirm-btn`/`#reactivate-confirm-btn` call `api.deactivate(id)` /
        `api.reactivate(id)`, re-render the status chip, `#deactivated-banner`, and swap which
        of `#deactivate-profile-btn`/`#reactivate-profile-btn` is visible (AC5, AC7, AC8);
        booking history and audit trail re-render from the same response so they stay visible
        without a special code path (AC6).
      `createDefaultApi()` wraps `fetch('/guests'...)` calls (GET/POST/PATCH/POST-deactivate/
      POST-reactivate) and always includes `actor: STAFF_NAME` (a hardcoded `'Priya Nair'`
      constant, matching the design's "Signed in as Priya Nair") in mutating request bodies.
      Entry point: on `DOMContentLoaded`, `fetch('/guests')` then `initGuestProfilesApp(document,
      guests, createDefaultApi())` — same bootstrap shape as `hire-profile.js`'s
      `DOMContentLoaded` handler.
    files:
      - public/js/guest-profiles.js
    rationale: |
      Dependency-injecting `api` (rather than calling `fetch` directly inside event handlers)
      is the exact pattern `public/js/hire-profile.js` already uses and is what makes
      `test/hire-profile.test.js`-style jsdom tests possible without a real server; reusing it
      keeps the new page testable the same way.

  - description: |
      Write `test/guest-profiles.test.js` (jsdom, following `test/hire-profile.test.js`'s
      shape: load the real HTML file into `document.documentElement.innerHTML`, `require` the
      JS module fresh per test, call `initGuestProfilesApp` with a fixture guest list and a
      mock `api`). Covers the interactive/UI-observable slice of AC1–AC10 — see `tests` below.
    files:
      - test/guest-profiles.test.js
    rationale: |
      The backend supertest suite proves the API contract; this suite proves the design's
      actual DOM (ids, hidden toggles, validation copy) behaves as specified, which an
      API-only test can't catch (e.g. a mistyped element id or a diff bug that sends
      unchanged fields).

tests:
  - |
    AC1 (POST /guests, valid payload): assigns a unique id.
    ```js
    test('AC1: creating a guest with name and a contact detail assigns a unique id', async () => {
      const res = await request(app).post('/guests').send({ name: 'Ana Cruz', email: 'ana@example.com', actor: 'Priya Nair' });
      expect(res.status).toBe(201);
      expect(typeof res.body.id).toBe('string');
      expect(res.body.id.length).toBeGreaterThan(0);
    });
    ```
  - |
    AC1 (validation counterpart): missing both email and phone is rejected and nothing is
    created.
    ```js
    test('AC1 (validation): a guest with no email or phone is rejected', async () => {
      const res = await request(app).post('/guests').send({ name: 'No Contact' });
      expect(res.status).toBe(400);
    });
    ```
  - |
    AC2: a newly created profile is immediately retrievable by its id.
    ```js
    test('AC2: a newly created guest profile is immediately retrievable by id', async () => {
      const createRes = await request(app).post('/guests').send({ name: 'Ben Ortiz', phone: '555-1', actor: 'Priya Nair' });
      const getRes = await request(app).get(`/guests/${createRes.body.id}`);
      expect(getRes.status).toBe(200);
      expect(getRes.body.name).toBe('Ben Ortiz');
    });
    ```
  - |
    AC3: GET returns name, contact details, preferences, and booking history together.
    ```js
    test('AC3: GET /guests/:id returns the full profile', async () => {
      const createRes = await request(app).post('/guests').send({
        name: 'Carla Nunez', email: 'c@x.com', roomType: 'Ocean view', dietary: 'Vegan', communication: 'Email', actor: 'Priya Nair',
      });
      const res = await request(app).get(`/guests/${createRes.body.id}`);
      expect(res.body).toMatchObject({
        name: 'Carla Nunez', email: 'c@x.com',
        preferences: { roomType: 'Ocean view', dietary: 'Vegan', communication: 'Email' },
      });
      expect(Array.isArray(res.body.bookingHistory)).toBe(true);
    });
    ```
  - |
    AC4: PATCH updates only the supplied field.
    ```js
    test('AC4: PATCH updates only the supplied field and leaves others unchanged', async () => {
      const createRes = await request(app).post('/guests').send({ name: 'Dana Price', email: 'd@x.com', phone: '555-2', roomType: 'High floor', actor: 'Priya Nair' });
      const { id } = createRes.body;
      const patchRes = await request(app).patch(`/guests/${id}`).send({ phone: '555-9999', actor: 'Priya Nair' });
      expect(patchRes.status).toBe(200);
      expect(patchRes.body.phone).toBe('555-9999');
      expect(patchRes.body.email).toBe('d@x.com');
      expect(patchRes.body.preferences.roomType).toBe('High floor');
    });
    ```
  - |
    AC5: deactivating an active profile sets status to deactivated.
    ```js
    test('AC5: deactivating an active profile changes status to deactivated', async () => {
      const createRes = await request(app).post('/guests').send({ name: 'Eli Frank', email: 'e@x.com', actor: 'Priya Nair' });
      const res = await request(app).post(`/guests/${createRes.body.id}/deactivate`).send({ actor: 'Priya Nair' });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('deactivated');
    });
    ```
  - |
    AC6: booking history stays retrievable after soft-delete.
    ```js
    test('AC6: booking history remains retrievable after soft-delete', async () => {
      const createRes = await request(app).post('/guests').send({ name: 'Faye Kim', email: 'f@x.com', actor: 'Priya Nair' });
      const { id } = createRes.body;
      await request(app).post(`/guests/${id}/deactivate`).send({ actor: 'Priya Nair' });
      const res = await request(app).get(`/guests/${id}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.bookingHistory)).toBe(true);
    });
    ```
  - |
    AC7: reactivating a deactivated profile returns status to active.
    ```js
    test('AC7: reactivating returns status to active', async () => {
      const createRes = await request(app).post('/guests').send({ name: 'Gus Ito', email: 'g@x.com', actor: 'Priya Nair' });
      const { id } = createRes.body;
      await request(app).post(`/guests/${id}/deactivate`).send({ actor: 'Priya Nair' });
      const res = await request(app).post(`/guests/${id}/reactivate`).send({ actor: 'Priya Nair' });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('active');
    });
    ```
  - |
    AC8: a reactivated profile is usable exactly like any other active profile (can be
    updated, then deactivated again).
    ```js
    test('AC8: a reactivated profile can be updated and deactivated again', async () => {
      const createRes = await request(app).post('/guests').send({ name: 'Hana Seo', email: 'h@x.com', actor: 'Priya Nair' });
      const { id } = createRes.body;
      await request(app).post(`/guests/${id}/deactivate`).send({ actor: 'Priya Nair' });
      await request(app).post(`/guests/${id}/reactivate`).send({ actor: 'Priya Nair' });
      const patchRes = await request(app).patch(`/guests/${id}`).send({ phone: '555-3', actor: 'Priya Nair' });
      expect(patchRes.status).toBe(200);
      const deactivateAgainRes = await request(app).post(`/guests/${id}/deactivate`).send({ actor: 'Priya Nair' });
      expect(deactivateAgainRes.status).toBe(200);
      expect(deactivateAgainRes.body.status).toBe('deactivated');
    });
    ```
  - |
    AC9: every mutating operation appends an audit record with actor and timestamp.
    ```js
    test('AC9: every mutating operation appends an audit record with actor and timestamp', async () => {
      const createRes = await request(app).post('/guests').send({ name: 'Ivy Leon', email: 'i@x.com', actor: 'Priya Nair' });
      const { id } = createRes.body;
      await request(app).patch(`/guests/${id}`).send({ phone: '555-4', actor: 'Priya Nair' });
      await request(app).post(`/guests/${id}/deactivate`).send({ actor: 'Priya Nair' });
      await request(app).post(`/guests/${id}/reactivate`).send({ actor: 'Priya Nair' });
      const res = await request(app).get(`/guests/${id}`);
      expect(res.body.auditLog).toHaveLength(4);
      res.body.auditLog.forEach((entry) => {
        expect(entry.actor).toBe('Priya Nair');
        expect(typeof entry.ts).toBe('string');
      });
    });
    ```
  - |
    AC10: viewing an unknown id returns not-found and no profile data.
    ```js
    test('AC10: GET /guests/:id for an unknown id returns 404 and no profile data', async () => {
      const res = await request(app).get('/guests/does-not-exist');
      expect(res.status).toBe(404);
      expect(res.body.name).toBeUndefined();
    });
    ```
  - |
    AC11: updating an unknown id returns not-found and changes nothing.
    ```js
    test('AC11: PATCH /guests/:id for an unknown id returns 404', async () => {
      const res = await request(app).patch('/guests/does-not-exist').send({ phone: '555-0' });
      expect(res.status).toBe(404);
    });
    ```
  - |
    AC12: soft-deleting an unknown id returns not-found and changes no status.
    ```js
    test('AC12: POST /guests/:id/deactivate for an unknown id returns 404', async () => {
      const res = await request(app).post('/guests/does-not-exist/deactivate').send({ actor: 'Priya Nair' });
      expect(res.status).toBe(404);
    });
    ```
  - |
    AC1 (UI): submitting the create form with no email or phone shows the design's inline
    `#error-contact` copy and never calls the API.
    ```js
    test('AC1 UI: no contact detail shows the inline error and does not call the api', () => {
      const api = { create: jest.fn() };
      const { initGuestProfilesApp } = require('../public/js/guest-profiles');
      initGuestProfilesApp(document, [], api);
      document.getElementById('new-guest-btn').click();
      document.getElementById('field-name').value = 'Kai Ward';
      document.getElementById('create-form').dispatchEvent(new Event('submit', { cancelable: true }));
      expect(document.getElementById('error-contact').hidden).toBe(false);
      expect(api.create).not.toHaveBeenCalled();
    });
    ```
  - |
    AC2 (UI): looking up an existing guest by id opens its profile.
    ```js
    test('AC2 UI: looking up an existing guest by ID opens its profile', async () => {
      const guest = fixtureGuest();
      const api = { get: jest.fn().mockResolvedValue(guest) };
      const { initGuestProfilesApp } = require('../public/js/guest-profiles');
      initGuestProfilesApp(document, [guest], api);
      document.getElementById('lookup-input').value = guest.id;
      document.getElementById('lookup-form').dispatchEvent(new Event('submit', { cancelable: true }));
      await Promise.resolve(); await Promise.resolve();
      expect(document.getElementById('profile-name').textContent).toBe(guest.name);
    });
    ```
  - |
    AC3 (UI): opening a profile displays name, contact details, preferences, and booking
    history together, per the design's kv-list/booking-history cards.
    ```js
    test('AC3 UI: opening a profile displays the full record', async () => {
      const guest = fixtureGuest();
      const api = { get: jest.fn().mockResolvedValue(guest) };
      const { initGuestProfilesApp } = require('../public/js/guest-profiles');
      initGuestProfilesApp(document, [guest], api);
      document.getElementById('lookup-input').value = guest.id;
      document.getElementById('lookup-form').dispatchEvent(new Event('submit', { cancelable: true }));
      await Promise.resolve(); await Promise.resolve();
      expect(document.getElementById('kv-list').textContent).toContain(guest.email);
      expect(document.getElementById('booking-history').textContent).toContain(guest.bookingHistory[0].item);
    });
    ```
  - |
    AC4 (UI): saving the edit form with only phone changed sends just that field to the api
    — this is the concrete UI-level proof behind `diffChanges`.
    ```js
    test('AC4 UI: editing only phone sends just the changed field', async () => {
      const guest = fixtureGuest();
      const api = { get: jest.fn().mockResolvedValue(guest), update: jest.fn().mockResolvedValue({ ...guest, phone: '555-9999' }) };
      const { initGuestProfilesApp } = require('../public/js/guest-profiles');
      initGuestProfilesApp(document, [guest], api);
      document.getElementById('lookup-input').value = guest.id;
      document.getElementById('lookup-form').dispatchEvent(new Event('submit', { cancelable: true }));
      await Promise.resolve(); await Promise.resolve();
      document.getElementById('edit-profile-btn').click();
      document.getElementById('edit-phone').value = '555-9999';
      document.getElementById('edit-form').dispatchEvent(new Event('submit', { cancelable: true }));
      await Promise.resolve(); await Promise.resolve();
      expect(api.update).toHaveBeenCalledWith(guest.id, expect.objectContaining({ phone: '555-9999' }));
      expect(api.update.mock.calls[0][1].name).toBeUndefined();
    });
    ```
  - |
    AC5/AC6 (UI): deactivating flips the status chip and shows the deactivated banner, while
    booking history stays visible underneath.
    ```js
    test('AC5/AC6 UI: deactivating flips status and keeps booking history visible', async () => {
      const guest = fixtureGuest();
      const deactivated = { ...guest, status: 'deactivated' };
      const api = { get: jest.fn().mockResolvedValue(guest), deactivate: jest.fn().mockResolvedValue(deactivated) };
      const { initGuestProfilesApp } = require('../public/js/guest-profiles');
      initGuestProfilesApp(document, [guest], api);
      document.getElementById('lookup-input').value = guest.id;
      document.getElementById('lookup-form').dispatchEvent(new Event('submit', { cancelable: true }));
      await Promise.resolve(); await Promise.resolve();
      document.getElementById('deactivate-profile-btn').click();
      document.getElementById('deactivate-confirm-btn').click();
      await Promise.resolve(); await Promise.resolve();
      expect(document.getElementById('deactivated-banner').hidden).toBe(false);
      expect(document.getElementById('booking-history').textContent).toContain(guest.bookingHistory[0].item);
    });
    ```
  - |
    AC7/AC8 (UI): reactivating returns to active and re-enables edit/deactivate actions.
    ```js
    test('AC7/AC8 UI: reactivating restores active-profile actions', async () => {
      const deactivatedGuest = { ...fixtureGuest(), status: 'deactivated' };
      const reactivated = { ...deactivatedGuest, status: 'active' };
      const api = { get: jest.fn().mockResolvedValue(deactivatedGuest), reactivate: jest.fn().mockResolvedValue(reactivated) };
      const { initGuestProfilesApp } = require('../public/js/guest-profiles');
      initGuestProfilesApp(document, [deactivatedGuest], api);
      document.getElementById('lookup-input').value = deactivatedGuest.id;
      document.getElementById('lookup-form').dispatchEvent(new Event('submit', { cancelable: true }));
      await Promise.resolve(); await Promise.resolve();
      document.getElementById('reactivate-profile-btn').click();
      document.getElementById('reactivate-confirm-btn').click();
      await Promise.resolve(); await Promise.resolve();
      expect(document.getElementById('deactivate-profile-btn').hidden).toBe(false);
      expect(document.getElementById('reactivate-profile-btn').hidden).toBe(true);
    });
    ```
  - |
    AC9 (UI): a successful edit appends a "Just now"-tagged audit entry naming the acting
    staff member, per the design's `.audit-just-now` tag.
    ```js
    test('AC9 UI: a successful edit appends a "Just now" audit entry', async () => {
      const guest = fixtureGuest();
      const updated = { ...guest, phone: '555-9999', auditLog: [...guest.auditLog, { ts: '2026-09-28T09:41:00.000Z', actor: 'Priya Nair', action: 'updated phone' }] };
      const api = { get: jest.fn().mockResolvedValue(guest), update: jest.fn().mockResolvedValue(updated) };
      const { initGuestProfilesApp } = require('../public/js/guest-profiles');
      initGuestProfilesApp(document, [guest], api);
      document.getElementById('lookup-input').value = guest.id;
      document.getElementById('lookup-form').dispatchEvent(new Event('submit', { cancelable: true }));
      await Promise.resolve(); await Promise.resolve();
      document.getElementById('edit-profile-btn').click();
      document.getElementById('edit-phone').value = '555-9999';
      document.getElementById('edit-form').dispatchEvent(new Event('submit', { cancelable: true }));
      await Promise.resolve(); await Promise.resolve();
      expect(document.getElementById('audit-list').textContent).toContain('Priya Nair');
      expect(document.getElementById('audit-list').querySelector('.audit-just-now')).not.toBeNull();
    });
    ```
  - |
    AC10 (UI): looking up an unknown id shows the not-found panel with the id interpolated,
    matching the design's shared not-found copy for AC10/AC11/AC12.
    ```js
    test('AC10 UI: an unknown ID shows the not-found panel', async () => {
      const api = { get: jest.fn().mockRejectedValue({ status: 404 }) };
      const { initGuestProfilesApp } = require('../public/js/guest-profiles');
      initGuestProfilesApp(document, [], api);
      document.getElementById('lookup-input').value = 'GST-9999';
      document.getElementById('lookup-form').dispatchEvent(new Event('submit', { cancelable: true }));
      await Promise.resolve(); await Promise.resolve();
      expect(document.getElementById('directory-not-found').hidden).toBe(false);
      expect(document.getElementById('directory-not-found').textContent).toContain('GST-9999');
    });
    ```

assumptions_or_open_questions:
  - |
    There is no authentication/session system anywhere in this codebase (checked employees,
    hires, runs, workflows). AC9's "acting staff member's identity" is therefore supplied by
    the client as an `actor` string on each mutating request/response, matching the design's
    hardcoded "Signed in as Priya Nair" — it is not derived from a real login. If this project
    later adds auth, this `actor` passthrough should be replaced by a server-derived identity.
  - |
    Booking history is treated as a read-only field owned by the guest record for this story
    (empty array on create, untouched by any operation here); there is no bookings module
    anywhere in `src/` to create or attach real bookings to a guest. AC6 ("retained and
    retrievable") is therefore verified as "the field survives deactivate/reactivate
    unchanged," not against seeded booking data — creating/managing bookings is a different
    backlog item per the parent epic.
  - |
    Guest ids are generated with `crypto.randomUUID()`, matching `src/employees/store.js` and
    `src/hires/store.js`, rather than the design's cosmetic sequential `GST-1001` fixture
    format — no AC requires a specific id format, and the design's IDs are prototype-fixture
    convenience, not a stated requirement.
  - |
    The design's reviewer bar, "Reset demo data" button, Prev/Next screen switcher, and the
    "Reference States" screen are prototype review scaffolding (confirmed by the design's own
    inline comments) and are intentionally excluded from the built page.
  - |
    Preference fields (`roomType`, `dietary`, `communication`) are modeled as flat top-level
    keys in the create/update request bodies (not a nested `preferences` object), so the same
    `PATCHABLE_FIELDS` allow-list technique used by `src/hires/routes.js` applies uniformly;
    the store nests them into `guest.preferences` internally.
  - |
    Update validation treats "name present AND at least one contact detail present" as a
    standing invariant re-checked on every PATCH (not just at create time) — clearing the name
    or removing the last contact method via PATCH is rejected with 400. This isn't stated
    explicitly by any AC but follows from AC1's invariant plus AC11 needing *some* validation
    story of its own; flagging in case the reviewer wants PATCH to allow a temporarily
    contact-less state.

package_dependencies: []

notes: |
  No new third-party dependencies are needed: `express`, `jest`, `jest-environment-jsdom`, and
  `supertest` are already installed and cover both the backend and jsdom frontend test suites.

  ```mermaid
  flowchart TD
    index[src/index.js] --> server[src/server.js]
    server --> employeesRouter[src/employees/routes.js]
    server --> workflowsRouter[src/workflows/routes.js]
    server --> runsRouter[src/runs/routes.js]
    server --> hiresRouter[src/hires/routes.js]
    server --> guestsRouter[src/guests/routes.js]
    guestsRouter --> guestsStore[src/guests/store.js]
    html[public/guest-profiles.html] --> js[public/js/guest-profiles.js]
    js -- "fetch /guests*" --> guestsRouter

    classDef touched fill:#f96,color:#000
    class server,guestsRouter,guestsStore,html,js touched
  ```

  `server.js`, `guests/routes.js`, `guests/store.js`, `guest-profiles.html`, and
  `guest-profiles.js` are the only touched/new nodes (orange); the sibling routers already
  mounted on `server.js` are shown for context only and are not modified.

  This item's frontend follows the `hire-profile.html`/`hire-profile.js` precedent (a
  backend-authoritative record with a dependency-injected `api` object) rather than the
  `expenses.js` precedent (client-only `localStorage`), because AC9's audit trail and AC2's
  "immediately retrievable by identifier" require a real server-side record, not a
  browser-local one.

  I could not find a `validate_plan_yaml` tool available in this session's toolset to run the
  required pre-submission validation pass — only Glob/Grep/Read/Write were exposed to me. I
  hand-verified this document's YAML shape (block scalars for every multi-line/code-bearing
  string, list items using `- |`, mapping values using `key: |`) but flagging this so the
  reviewer knows the automated check did not run.
