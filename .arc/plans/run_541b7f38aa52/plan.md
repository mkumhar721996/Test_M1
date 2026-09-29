summary: |
  This repo has no rooms, room-types, or booking/inventory domain at all today — only
  `src/employees`, `src/hires` (onboarding, unrelated), and `src/guests` (guest profile CRUD).
  This plan adds a new `src/rooms` domain (in-memory store + Express router, mirroring the
  exact shape of `src/guests/store.js` / `src/guests/routes.js`) that lets staff create
  individual rooms against a fixed, seeded set of room types, list rooms grouped by room type,
  flip a room's status between `available` / `maintenance` / `out-of-order`, and exposes the
  room-level inventory gate a future booking flow would call (`POST /rooms/:id/booking-requests`),
  which rejects with a clear reason whenever the targeted room isn't `available`. There is no
  approved design file for TEST-M1-STORY-097 under `.arc/designs/` (checked — only 030, 031,
  032, 055, 091, 092, 094, 100, 103 exist), so the frontend (`public/room-management.html` +
  `public/js/room-management.js` + `public/css/room-management.css`) is built from this repo's
  own established page-shell conventions (`app-topbar`, `.card`, `.modal-*`, `.toast`,
  `.empty-state`, `.status-chip` already in `design-system/prototype-utils.css`, plus the
  dependency-injected-`api` frontend pattern from `public/js/guest-profiles.js`) rather than
  ported from a specific comp. Room-type *management* (creating/editing room types) and a real
  booking/reservation domain are explicitly out of scope — both belong to sibling stories under
  the "Room & Rate Inventory" epic; this story only needs *existing* room types to assign rooms
  to, and only needs the inventory-level accept/reject decision a booking flow would consult.

scope:
  - description: |
      Create `src/rooms/store.js`: an in-memory `Map`-backed room store, mirroring
      `src/guests/store.js`'s shape (plain exported functions, a structured validation error
      class, `crypto.randomUUID()` ids). Also seeds a small fixed, read-only list of room types
      (no CRUD — see `assumptions_or_open_questions`):
      ```js
      const ROOM_TYPES = [
        { id: 'rt_standard', name: 'Standard Queen' },
        { id: 'rt_deluxe', name: 'Deluxe King' },
        { id: 'rt_suite', name: 'Executive Suite' },
      ];
      ```
      Room shape:
      ```js
      { id, identifier, roomTypeId, status: 'available' | 'maintenance' | 'out-of-order', createdAt, updatedAt }
      ```
      Exports:
      ```js
      function listRoomTypes() {}
      function createRoom({ identifier, roomTypeId }, actor) {}   // throws RoomValidationError (400)
      function getRoom(id) {}
      function listRooms() {}
      function updateRoomStatus(id, status, actor) {}             // returns undefined if id unknown
      function checkRoomBookable(id) {}                           // -> { bookable, reason }
      function requestBooking(id) {}                              // throws RoomUnavailableError (409) or returns { roomId, status: 'accepted' }
      ```
      `createRoom` throws `RoomValidationError` (`.statusCode = 400`, `.fields`) when
      `identifier` is blank, when `identifier` (trimmed, case-insensitive) already belongs to
      another room, or when `roomTypeId` doesn't match a seeded room type — and creates nothing
      in any of those cases (AC5). New rooms are created with `status: 'available'` (AC1).
      `updateRoomStatus` throws `RoomValidationError` if `status` isn't one of the three valid
      values, else flips `status`/`updatedAt` unconditionally — no occupancy/calendar check of
      any kind exists anywhere in this codebase, so "blocked regardless of its occupancy
      calendar" (AC2) is satisfied by there being no calendar to consult in the first place.
      `checkRoomBookable`/`requestBooking` are the inventory-level gate: bookable only when
      `status === 'available'`; otherwise `reason` names the room's identifier and current
      status in plain language (AC2, AC3, AC4).
    files:
      - src/rooms/store.js
    rationale: |
      Mirrors `src/guests/store.js`'s established pattern (Map store, structured validation
      error, actor-agnostic mutation functions) so the new domain fits the codebase's shape.
      Room types are seeded as a flat constant (same technique as `INITIAL_EXPENSES` in
      `public/js/expenses.js`) rather than given their own store/CRUD, since AC1 only requires
      assigning a room to an *existing* room type, not managing room types themselves.

  - description: |
      Create `src/rooms/routes.js`: an Express router mounted at `/rooms`:
      ```
      GET    /rooms/room-types             -> 200 [{ id, name }, ...]
      GET    /rooms                        -> 200 [room, ...]
      POST   /rooms                        -> 201 room | 400 { error: 'validation_error', fields }
      GET    /rooms/:id                    -> 200 room | 404 { error: 'room not found' }
      PATCH  /rooms/:id/status             -> 200 room | 400 { error, fields } | 404 { error: 'room not found' }
      POST   /rooms/:id/booking-requests   -> 201 { roomId, status: 'accepted' } | 404 { error: 'room not found' } | 409 { error: 'room_unavailable', reason }
      ```
      `GET /rooms/room-types` is registered before `GET /rooms/:id` so the literal segment
      isn't swallowed by the `:id` param route. `POST /rooms/:id/booking-requests` first calls
      `getRoom(id)` and returns 404 if missing, then calls `requestBooking(id)`, mapping a
      thrown `RoomUnavailableError` (`.statusCode = 409`, `.reason`) to
      `{ error: 'room_unavailable', reason: err.reason }` (AC3). A thrown `RoomValidationError`
      from `POST /rooms` or `PATCH /rooms/:id/status` is caught and mapped to
      `{ error: 'validation_error', fields: err.fields }`; any other error goes to `next(err)`.
    files:
      - src/rooms/routes.js
    rationale: |
      Same request/response contract shape as `src/guests/routes.js` (structured 400 for
      validation, 404 body shape, error classes mapped in the route handler) so the domain is
      consistent with the rest of the codebase.

  - description: |
      Mount the new router in `src/server.js`:
      ```js
      const roomsRouter = require('./rooms/routes');
      ...
      app.use('/rooms', roomsRouter);
      ```
    files:
      - src/server.js
    rationale: |
      `src/server.js` already mounts one router per domain (`/employees`, `/workflows`,
      `/runs`, `/hires`, `/guests`); `/rooms` follows the same one-line registration.

  - description: |
      Write `test/rooms-store.test.js`: unit tests against `src/rooms/store.js` directly (no
      HTTP layer), mirroring `test/guests-store.test.js`'s style. Covers AC1, AC2, AC5 at the
      store level — see `tests` below for the concrete assertions.
    files:
      - test/rooms-store.test.js
    rationale: |
      Matches the existing `test/guests-store.test.js` precedent of testing store-level
      validation/mutation logic directly, separately from the HTTP contract.

  - description: |
      Write `test/rooms.test.js`: supertest tests against `src/server.js`, mirroring
      `test/hires.test.js` / `test/guests.test.js`'s style. Covers AC1, AC2, AC3, AC4, AC5 at
      the HTTP layer — see `tests` below for the concrete assertions.
    files:
      - test/rooms.test.js
    rationale: |
      The `/rooms` API is the authoritative record and the inventory-gate endpoint
      (`POST /rooms/:id/booking-requests`) is only meaningfully testable end-to-end through the
      real Express app, matching how `test/hires.test.js`/`test/guests.test.js` verify their
      routers today.

  - description: |
      Create `public/room-management.html`: a single page with two sections toggled by JS — a
      room list screen and a create-room modal (no separate "profile" screen is needed; there's
      no per-room detail beyond identifier/type/status). Ports the established shell from
      `public/guest-profiles.html` (`.app-topbar` with brand "Room Inventory" and an inert
      "Room Types"/"Rates" nav, `.page`/`.page-header`) and adds:
      - `#new-room-btn` ("+ Add room") opening `#create-modal` with `#create-form`: `#field-identifier`
        (text, e.g. "204"), `#field-room-type` (`<select>` populated from the seeded room types,
        first option blank/disabled "Select a room type"), each paired with a hidden
        `<p class="field-error-text" role="alert">` (`#error-identifier`, `#error-room-type`).
      - `#room-list-wrap` containing one `<div class="card room-type-group" data-room-type-id="...">`
        per room type that has at least one room, each with an `<h2 class="card-title">` (the
        room type's name) and a `table.room-table` with columns Room / Status / Actions; each
        row is `<tr data-room-id="...">` with a `<select class="input room-status-select"
        data-id="...">` (options: Available / Maintenance / Out of order) as the status control
        (AC2, AC4).
      - `#room-list-empty` (`class="card empty-state"`, `hidden`): "No rooms yet" heading plus
        "Add a room to get started." copy and a `#empty-add-room-btn` that opens the same create
        modal (AC6).
      - `#toast` confirmation/error banner, same pattern as `guest-profiles.html`'s `#toast`.
      Links `../design-system/tokens.css`, `../design-system/prototype-utils.css`, the new
      `./css/room-management.css`, and loads `./js/room-management.js` with `defer`.
    files:
      - public/room-management.html
    rationale: |
      No approved design exists for this story (confirmed by listing `.arc/designs/` — only
      9 unrelated story ids are present), so the page is assembled from this repo's own shared
      primitives and the closest existing precedent (`guest-profiles.html`'s directory/modal/
      empty-state shell) rather than invented from scratch or a nonexistent comp.

  - description: |
      Create `public/css/room-management.css`: only the page-specific rules not already covered
      by `design-system/prototype-utils.css` (which already supplies `.btn`, `.card`,
      `.card-title`, `.input`, `.label`, `.modal-*`, `.toast`, `.empty-state`, `.field-error-text`,
      `.input-error`, `.app-topbar`, `.app-nav`, `.page`, `.page-header`) — namely
      `.room-type-group` spacing, `table.room-table` column/border rules (reusing
      `guest-profiles.css`'s `.guest-table` rules as the direct template), and
      `.room-status-select` sizing.
    files:
      - public/css/room-management.css
    rationale: |
      Keeps the same two-tier CSS convention already established by `guest-profiles.css`,
      `hire-profile.css`, and `expenses.css` (shared primitives + one page-specific file),
      instead of redefining primitives that already exist.

  - description: |
      Create `public/js/room-management.js` exporting `initRoomManagementApp(doc, roomTypes,
      initialRooms, api)` and `createDefaultApi()`, following the dependency-injected-`api`
      pattern in `public/js/guest-profiles.js` (`initGuestProfilesApp(doc, initialGuests, api)`).
      Responsibilities:
      - Render `#room-list-wrap` as one group per room type that has ≥1 room (room type name as
        heading, a table row per room with a status `<select>` bound to that room's current
        status); when `initialRooms`/current in-memory list is empty, hide `#room-list-wrap` and
        show `#room-list-empty` instead (AC6).
      - `#create-form` submit does client-side required-field checks (blank identifier, no room
        type selected) exactly like `guest-profiles.js`'s `createForm` handler, then calls
        `api.create({ identifier, roomTypeId, actor: STAFF_NAME })`; on success, appends the
        room to the in-memory list, closes the modal, and re-renders (AC1). On a rejection
        shaped `{ status: 400, fields }`, shows the server's message inline on
        `#error-identifier` (or `#error-room-type`) without closing the modal and without adding
        a row (AC5) — this is the concrete UI proof of the duplicate-identifier rejection:
        ```js
        function showFieldErrors(fields) {
          if (fields.identifier) {
            const el = doc.getElementById('error-identifier');
            el.textContent = `⚠ ${fields.identifier}`;
            el.hidden = false;
            doc.getElementById('field-identifier').classList.add('input-error');
          }
          if (fields.roomTypeId) {
            const el = doc.getElementById('error-room-type');
            el.textContent = `⚠ ${fields.roomTypeId}`;
            el.hidden = false;
          }
        }
        ```
      - A `change` listener delegated on `#room-list-wrap` for `.room-status-select`: calls
        `api.updateStatus(id, select.value)`; on success updates the in-memory room and
        re-renders the status chip/select; on failure reverts the `<select>` to the room's prior
        value and shows an error toast (AC2, AC4).
      `createDefaultApi()` wraps `fetch` calls to `/rooms/room-types`, `/rooms` (GET/POST), and
      `/rooms/:id/status` (PATCH), parsing the JSON error body on a non-2xx `POST /rooms`
      response so `fields` is available to the catch handler above:
      ```js
      create: (data) => fetch('/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, actor: STAFF_NAME }),
      }).then(async (res) => {
        if (!res.ok) return Promise.reject({ status: res.status, ...(await res.json()) });
        return res.json();
      }),
      ```
      Entry point: on `DOMContentLoaded`, fetch room types + rooms, then call
      `initRoomManagementApp(document, roomTypes, rooms, createDefaultApi())` — same bootstrap
      shape as `guest-profiles.js`.
    files:
      - public/js/room-management.js
    rationale: |
      Reuses the exact dependency-injected-`api` technique `guest-profiles.js` already
      established, which is what makes `test/room-management.test.js` able to drive real DOM
      interactions against mocked `api` functions without a running server.

  - description: |
      Write `test/room-management.test.js`: jsdom tests (opted in via
      `/** @jest-environment jsdom */`), loading the real `public/room-management.html` markup
      into `document.documentElement.innerHTML` via `fs.readFileSync`, `require`-ing
      `initRoomManagementApp` fresh per test (`jest.resetModules()`), following the exact shape
      of `test/guest-profiles.test.js`. Covers AC1, AC2/AC4, AC5, AC6 at the UI level — see
      `tests` below.
    files:
      - test/room-management.test.js
    rationale: |
      Matches `test/guest-profiles.test.js`'s precedent: the backend suites prove the API
      contract, this suite proves the actual page markup (ids, hidden toggles) behaves as
      specified — a mistyped id or a status-select wiring bug wouldn't be caught by an API-only
      test.

tests:
  - |
    AC1 (store): createRoom assigns a room to an existing room type and it's returned by
    listRooms.
    ```js
    test('AC1: createRoom assigns to an existing room type and appears in listRooms', () => {
      const { createRoom, listRoomTypes, listRooms } = require('../src/rooms/store');
      const roomTypeId = listRoomTypes()[0].id;
      const room = createRoom({ identifier: '101', roomTypeId });
      expect(room.roomTypeId).toBe(roomTypeId);
      expect(listRooms().find((r) => r.id === room.id)).toMatchObject({ identifier: '101', roomTypeId, status: 'available' });
    });
    ```
    Fails until `src/rooms/store.js` exists with `createRoom`/`listRoomTypes`/`listRooms`.
  - |
    AC1 (API): POST /rooms creates a room under an existing room type and it shows up in
    GET /rooms.
    ```js
    test('AC1: POST /rooms creates a room under an existing room type', async () => {
      const request = require('supertest');
      const app = require('../src/server');
      const typesRes = await request(app).get('/rooms/room-types');
      const roomTypeId = typesRes.body[0].id;
      const res = await request(app).post('/rooms').send({ identifier: '204', roomTypeId, actor: 'Priya Nair' });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ identifier: '204', roomTypeId, status: 'available' });
      const listRes = await request(app).get('/rooms');
      expect(listRes.body.find((r) => r.id === res.body.id)).toBeDefined();
    });
    ```
    Fails until `src/rooms/routes.js` exists and is mounted at `/rooms` in `src/server.js`.
  - |
    AC1 (UI): creating a room adds a row to the list under that room type's group heading.
    ```js
    test('AC1 UI: creating a room adds it under its room type heading', async () => {
      document.documentElement.innerHTML = require('fs').readFileSync(require('path').join(__dirname, '..', 'public', 'room-management.html'), 'utf8');
      const roomTypes = [{ id: 'rt_standard', name: 'Standard Queen' }];
      const api = { create: jest.fn().mockResolvedValue({ id: 'room_1', identifier: '305', roomTypeId: 'rt_standard', status: 'available' }) };
      const { initRoomManagementApp } = require('../public/js/room-management');
      initRoomManagementApp(document, roomTypes, [], api);
      document.getElementById('new-room-btn').click();
      document.getElementById('field-identifier').value = '305';
      document.getElementById('field-room-type').value = 'rt_standard';
      document.getElementById('create-form').dispatchEvent(new Event('submit', { cancelable: true }));
      await Promise.resolve(); await Promise.resolve();
      const group = document.querySelector('[data-room-type-id="rt_standard"]');
      expect(group.textContent).toContain('305');
    });
    ```
    Fails until `public/room-management.html`/`public/js/room-management.js` exist and render
    a group per room type with the newly created room inside it.
  - |
    AC2 (store): setting status to maintenance blocks the room from booking regardless of any
    occupancy state.
    ```js
    test('AC2: a maintenance room is reported as not bookable', () => {
      const { createRoom, listRoomTypes, updateRoomStatus, checkRoomBookable } = require('../src/rooms/store');
      const room = createRoom({ identifier: '102', roomTypeId: listRoomTypes()[0].id });
      updateRoomStatus(room.id, 'maintenance');
      expect(checkRoomBookable(room.id)).toMatchObject({ bookable: false });
    });
    ```
    Fails until `updateRoomStatus`/`checkRoomBookable` exist and are status-driven only.
  - |
    AC2 (API): PATCH /rooms/:id/status to out-of-order is reflected on the room record.
    ```js
    test('AC2: PATCH /rooms/:id/status sets the room to out-of-order', async () => {
      const request = require('supertest');
      const app = require('../src/server');
      const typesRes = await request(app).get('/rooms/room-types');
      const createRes = await request(app).post('/rooms').send({ identifier: '405', roomTypeId: typesRes.body[0].id });
      const res = await request(app).patch(`/rooms/${createRes.body.id}/status`).send({ status: 'out-of-order' });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('out-of-order');
    });
    ```
  - |
    AC3 (API): a booking request against a maintenance/out-of-order room is rejected at the
    inventory level with a clear unavailability reason.
    ```js
    test('AC3: a booking request against a maintenance room is rejected with a clear reason', async () => {
      const request = require('supertest');
      const app = require('../src/server');
      const typesRes = await request(app).get('/rooms/room-types');
      const createRes = await request(app).post('/rooms').send({ identifier: '410', roomTypeId: typesRes.body[0].id });
      await request(app).patch(`/rooms/${createRes.body.id}/status`).send({ status: 'maintenance' });
      const res = await request(app).post(`/rooms/${createRes.body.id}/booking-requests`).send({});
      expect(res.status).toBe(409);
      expect(res.body.error).toBe('room_unavailable');
      expect(res.body.reason).toEqual(expect.stringContaining('410'));
    });
    ```
    Fails until `requestBooking`/`RoomUnavailableError` exist and the route maps it to a 409
    with `reason`.
  - |
    AC4 (API): setting status back to available makes the room bookable immediately.
    ```js
    test('AC4: a room set back to available accepts a booking request', async () => {
      const request = require('supertest');
      const app = require('../src/server');
      const typesRes = await request(app).get('/rooms/room-types');
      const createRes = await request(app).post('/rooms').send({ identifier: '411', roomTypeId: typesRes.body[0].id });
      await request(app).patch(`/rooms/${createRes.body.id}/status`).send({ status: 'maintenance' });
      await request(app).patch(`/rooms/${createRes.body.id}/status`).send({ status: 'available' });
      const res = await request(app).post(`/rooms/${createRes.body.id}/booking-requests`).send({});
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ roomId: createRes.body.id, status: 'accepted' });
    });
    ```
  - |
    AC2/AC4 (UI): changing a room's status via the select immediately updates its rendered
    status.
    ```js
    test('AC2/AC4 UI: changing the status select calls the api and re-renders the new status', async () => {
      document.documentElement.innerHTML = require('fs').readFileSync(require('path').join(__dirname, '..', 'public', 'room-management.html'), 'utf8');
      const roomTypes = [{ id: 'rt_standard', name: 'Standard Queen' }];
      const rooms = [{ id: 'room_1', identifier: '305', roomTypeId: 'rt_standard', status: 'available' }];
      const api = { updateStatus: jest.fn().mockResolvedValue({ id: 'room_1', identifier: '305', roomTypeId: 'rt_standard', status: 'maintenance' }) };
      const { initRoomManagementApp } = require('../public/js/room-management');
      initRoomManagementApp(document, roomTypes, rooms, api);
      const select = document.querySelector('.room-status-select[data-id="room_1"]');
      select.value = 'maintenance';
      select.dispatchEvent(new Event('change'));
      await Promise.resolve(); await Promise.resolve();
      expect(api.updateStatus).toHaveBeenCalledWith('room_1', 'maintenance');
      expect(document.querySelector('.room-status-select[data-id="room_1"]').value).toBe('maintenance');
    });
    ```
  - |
    AC5 (store): creating a room with a duplicate identifier throws and saves nothing.
    ```js
    test('AC5: createRoom rejects a duplicate identifier and creates nothing', () => {
      const { createRoom, listRoomTypes, listRooms, RoomValidationError } = require('../src/rooms/store');
      const roomTypeId = listRoomTypes()[0].id;
      createRoom({ identifier: 'DUP-1', roomTypeId });
      const before = listRooms().length;
      expect(() => createRoom({ identifier: 'DUP-1', roomTypeId })).toThrow(RoomValidationError);
      expect(listRooms().length).toBe(before);
    });
    ```
  - |
    AC5 (API): POST /rooms with a duplicate identifier returns 400 and the duplicate is not
    saved.
    ```js
    test('AC5: POST /rooms with a duplicate identifier is rejected', async () => {
      const request = require('supertest');
      const app = require('../src/server');
      const typesRes = await request(app).get('/rooms/room-types');
      const roomTypeId = typesRes.body[0].id;
      await request(app).post('/rooms').send({ identifier: 'DUP-2', roomTypeId });
      const before = (await request(app).get('/rooms')).body.length;
      const res = await request(app).post('/rooms').send({ identifier: 'DUP-2', roomTypeId });
      expect(res.status).toBe(400);
      const after = (await request(app).get('/rooms')).body.length;
      expect(after).toBe(before);
    });
    ```
  - |
    AC5 (UI): submitting a duplicate identifier shows an inline error and does not add a row.
    ```js
    test('AC5 UI: a duplicate identifier shows an inline error and adds no row', async () => {
      document.documentElement.innerHTML = require('fs').readFileSync(require('path').join(__dirname, '..', 'public', 'room-management.html'), 'utf8');
      const roomTypes = [{ id: 'rt_standard', name: 'Standard Queen' }];
      const existing = [{ id: 'room_1', identifier: '305', roomTypeId: 'rt_standard', status: 'available' }];
      const api = { create: jest.fn().mockRejectedValue({ status: 400, fields: { identifier: 'Room 305 already exists. Choose a different identifier.' } }) };
      const { initRoomManagementApp } = require('../public/js/room-management');
      initRoomManagementApp(document, roomTypes, existing, api);
      document.getElementById('new-room-btn').click();
      document.getElementById('field-identifier').value = '305';
      document.getElementById('field-room-type').value = 'rt_standard';
      document.getElementById('create-form').dispatchEvent(new Event('submit', { cancelable: true }));
      await Promise.resolve(); await Promise.resolve();
      expect(document.getElementById('error-identifier').hidden).toBe(false);
      expect(document.querySelectorAll('[data-room-id="room_1"]').length).toBe(1);
    });
    ```
  - |
    AC6 (UI): an empty room list shows an empty-state message prompting staff to add a room.
    ```js
    test('AC6 UI: an empty room list shows an empty-state prompting staff to add a room', () => {
      document.documentElement.innerHTML = require('fs').readFileSync(require('path').join(__dirname, '..', 'public', 'room-management.html'), 'utf8');
      const { initRoomManagementApp } = require('../public/js/room-management');
      initRoomManagementApp(document, [{ id: 'rt_standard', name: 'Standard Queen' }], [], {});
      expect(document.getElementById('room-list-empty').hidden).toBe(false);
      expect(document.getElementById('room-list-empty').textContent).toMatch(/add a room/i);
    });
    ```
    Fails until `initRoomManagementApp` hides the list and shows `#room-list-empty` when the
    room list is empty.

assumptions_or_open_questions:
  - |
    There is no room-type management module anywhere in this codebase, and no design file for
    TEST-M1-STORY-097 exists under `.arc/designs/` (only 030, 031, 032, 055, 091, 092, 094, 100,
    103 do). This plan seeds a small fixed list of room types directly in `src/rooms/store.js`
    (`ROOM_TYPES`) — read-only, no create/edit/delete — so AC1's "assign it to an existing room
    type" has something real to assign to. Building room-type CRUD is a separate backlog item
    under the "Room & Rate Inventory" epic, not this story.
  - |
    There is no booking/reservation domain anywhere in this codebase (only `src/hires`, which is
    employee onboarding, not guest bookings). AC3's "a booking request targets that room" is
    therefore modeled as the minimal room-level inventory gate a future booking flow would call —
    `POST /rooms/:id/booking-requests` — which accepts/rejects based solely on the room's
    `status` and does not persist an actual reservation record. Building the real booking/
    reservation domain (dates, guests, rate plans) is out of scope for this story per the parent
    epic's own breakdown (room types / individual rooms / rate plans / availability are listed as
    separate concerns).
  - |
    "regardless of its occupancy calendar" (AC2) is interpreted as: there is no occupancy
    calendar in this codebase to consult, so a status of `maintenance`/`out-of-order` blocks
    bookings unconditionally — the inventory check only ever looks at `status`, never at any
    date range or prior booking state, which doesn't exist yet.
  - |
    Duplicate-identifier detection trims and lowercases before comparing (matching the
    normalization style already used for guest email/phone in `src/guests/store.js`), so `"101"`
    and `" 101 "` collide but `"101"` and `"102"` do not. No AC specifies exact-match vs.
    normalized comparison; normalized was chosen to avoid silently-accepted near-duplicates.
  - |
    No authentication/session system exists anywhere in this codebase (same as prior stories);
    the acting staff member is passed as a hardcoded `actor: 'Priya Nair'` constant from the
    client, matching the existing `guest-profiles.js`/`hire-profile.js` convention, not derived
    from a real login.
  - |
    A room has no fields beyond `identifier`, `roomTypeId`, and `status` (no floor, no capacity,
    no notes) since no AC requires them; adding them is left to a future story if needed.

package_dependencies: []

notes: |
  No new third-party dependencies are needed: `express`, `jest`, `jest-environment-jsdom`,
  `supertest`, and `@testing-library/dom` are already installed and cover both the backend and
  jsdom frontend test suites for this plan.

  This plan's scope crosses from the server's router mounting down into a browser-only client
  module and its own store, so the shape is worth diagramming:

  ```mermaid
  flowchart TD
    index["src/index.js"] --> server["src/server.js"]
    server --> employeesRouter["src/employees/routes.js"]
    server --> guestsRouter["src/guests/routes.js"]
    server --> hiresRouter["src/hires/routes.js"]
    server --> roomsRouter["src/rooms/routes.js"]
    roomsRouter --> roomsStore["src/rooms/store.js"]
    html["public/room-management.html"] --> js["public/js/room-management.js"]
    js -- "fetch /rooms, /rooms/room-types, /rooms/:id/status, /rooms/:id/booking-requests" --> roomsRouter

    classDef touched fill:#f96,color:#000
    class server,roomsRouter,roomsStore,html,js touched
  ```

  `server.js`, `rooms/routes.js`, `rooms/store.js`, `room-management.html`, and
  `room-management.js` are the only touched/new nodes (orange); the sibling routers already
  mounted on `server.js` are shown for context only and are not modified.

  I could not find a `validate_plan_yaml` tool in this session's exposed toolset (only
  Glob/Grep/Read/Write were available) to run the required pre-submission validation pass. I
  hand-checked this document's YAML shape (block scalars for every multi-line/code-bearing
  string via `key: |`, list items via `- |`, no bare colons/backticks/quotes on any `files:`
  entry) but am flagging this so the reviewer knows the automated check did not run.

review_focus: |
  In scope: a new `src/rooms` store+routes domain (create room, list rooms/room-types, flip
  status among available/maintenance/out-of-order, and a room-level booking-inventory gate), plus
  a new `public/room-management.html` page. Out of scope, deliberately: room-type CRUD (room
  types are a small hardcoded seed list, not a managed resource) and any real booking/reservation
  persistence (`POST /rooms/:id/booking-requests` is a stateless accept/reject check, not a
  booking record). No approved design file exists for this story, so the HTML/CSS was assembled
  from this repo's existing shared primitives and the `guest-profiles.html` precedent rather than
  a specific comp — a reviewer shouldn't expect pixel parity with anything in `.arc/designs/`.
  The riskiest area is the inventory-gate logic in `src/rooms/store.js` (`checkRoomBookable`/
  `requestBooking`): it's intentionally status-only with no notion of dates or concurrent
  requests, since neither exists in this codebase yet — that's a scope boundary, not an oversight.
