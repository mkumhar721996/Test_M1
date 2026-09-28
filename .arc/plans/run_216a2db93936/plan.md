summary: |
  Add individual room management to the room inventory: a new `src/rooms` domain (in-memory
  `Map`-backed store + Express routes, following the exact shape already used by
  `src/guests`/`src/hires`) that lets staff create a room with a unique identifier assigned to
  an existing room type, and change that room's status among `available`, `maintenance`, and
  `out-of-order`. Because no "room type" concept exists anywhere in this codebase yet, this plan
  also adds a small, read-only `src/roomTypes` module (a seeded lookup of a few room types) —
  just enough for room creation to validate against and display "an existing room type"; full
  room-type CRUD is a separate backlog item under the same "Room & Rate Inventory" epic and is
  explicitly out of scope here. A new `requestBooking` inventory check (exposed as
  `POST /rooms/:id/booking-requests`) is the "inventory level" gate AC3 asks for: it rejects a
  booking request with a 409 and a clear reason whenever the targeted room's status isn't
  `available`, independent of any date/occupancy data (which this codebase has no model for at
  all, matching AC2's "regardless of its occupancy calendar"). The frontend is a new static page
  (`public/rooms.html` + `public/js/rooms.js`, styled by a new `public/css/rooms.css`) — there is
  no approved prototype/design file for this story (unlike TEST-M1-STORY-100/091/092), so the UI
  is designed directly from the acceptance criteria using the same table + modal + status-chip
  primitives already shared via `design-system/prototype-utils.css` and used by
  `guest-profiles.html`/`index.html`. Every behavior is driven by a failing test written first:
  `supertest`-against-`src/server.js` tests for the API contract (`test/rooms.test.js`), and
  jsdom tests for the page (`test/rooms-ui.test.js`), mirroring
  `test/guests.test.js`/`test/guest-profiles.test.js`.

scope:
  - description: |
      Create `src/roomTypes/store.js`: a small in-memory `Map` seeded with a fixed set of room
      types, read-only for this story (no create/edit/delete — that's a separate backlog item).
      ```js
      const roomTypes = new Map();
      [
        { id: 'rt_standard_king', name: 'Standard King' },
        { id: 'rt_deluxe_suite', name: 'Deluxe Suite' },
        { id: 'rt_twin', name: 'Twin' },
      ].forEach((rt) => roomTypes.set(rt.id, rt));

      function listRoomTypes() { return Array.from(roomTypes.values()); }
      function getRoomType(id) { return roomTypes.get(id); }

      module.exports = { listRoomTypes, getRoomType };
      ```
    files:
      - src/roomTypes/store.js
    rationale: |
      AC1 requires assigning a room "to an existing room type," which requires *some* existing
      room types to assign to and validate against. Mirrors the seeded-fixture pattern already
      used by `src/hires/store.js` (`hires.set('hire_2031', {...})`) rather than inventing a new
      persistence style. Kept intentionally minimal (no mutation API) since managing room types
      themselves is not one of this story's ACs.

  - description: |
      Create `src/roomTypes/routes.js`: a single read endpoint so the frontend (and tests) can
      discover valid room types to assign rooms to.
      ```
      GET /room-types -> 200 [{ id, name }, ...]
      ```
    files:
      - src/roomTypes/routes.js
    rationale: |
      The create-room form (AC1) needs a list of existing room types to populate its selector;
      exposing it as its own tiny router keeps the read-only room-type surface separate from the
      mutable `rooms` domain, matching how `src/employees`/`src/hires`/`src/guests` are each
      their own router+store pair.

  - description: |
      Create `src/rooms/store.js`: an in-memory `Map`-backed room store mirroring
      `src/guests/store.js`'s shape (plain functions, a `ValidationError` subclass with
      `.statusCode`, an ISO-timestamped `auditLog`). Room shape:
      ```js
      {
        id,                 // server-generated, crypto.randomUUID()
        identifier,         // staff-supplied, e.g. "101" — must be unique across all rooms
        roomTypeId,         // must reference an existing src/roomTypes room
        status: 'available' | 'maintenance' | 'out-of-order',
        createdAt, updatedAt,   // ISO strings
        auditLog: [{ ts, actor, action }],
      }
      ```
      Exports:
      ```js
      const STATUSES = ['available', 'maintenance', 'out-of-order'];

      function createRoom(data, actor) { /* validates + throws RoomValidationError */ }
      function getRoom(id) {}
      function listRooms() {}
      function updateRoomStatus(id, status, actor) { /* validates status enum */ }
      function requestBooking(roomId) { /* throws RoomUnavailableError when blocked */ }
      ```
      `createRoom` throws `RoomValidationError` (`.statusCode = 400`) when: `identifier` is
      empty/whitespace-only; `roomTypeId` doesn't resolve via `getRoomType` from
      `src/roomTypes/store.js`; or another room already has the same (trimmed, exact-match)
      `identifier` — in which case nothing is written (AC5). New rooms default to
      `status: 'available'`. `updateRoomStatus` throws `RoomValidationError` if `status` isn't
      one of `STATUSES`; a no-op (same status re-applied) returns the room unchanged without a
      new audit entry; otherwise it flips `status`, bumps `updatedAt`, and appends an audit entry
      `` `status changed from ${from} to ${status}` `` (AC2, AC4). `requestBooking(roomId)`
      returns `undefined` for an unknown id (mapped to 404 by the route), returns
      `{ roomId, accepted: true }` when `status === 'available'`, and otherwise throws
      `RoomUnavailableError` (`.statusCode = 409`) with a message naming the room and its current
      status, e.g. `` `room ${room.identifier} is unavailable for booking: status is
      '${room.status}'` `` (AC2/AC3) — this check only looks at `status`, never at any
      date/occupancy data, which is the concrete mechanism behind AC2's "regardless of its
      occupancy calendar" in a codebase with no occupancy-calendar model at all.
    files:
      - src/rooms/store.js
    rationale: |
      Same Map-store-plus-typed-error shape as `src/guests/store.js`
      (`GuestValidationError`/`RoomValidationError`) so the new domain fits the codebase's
      established pattern. `requestBooking` is deliberately a pure status gate with no
      date/range parameters, since AC3's "rejected at the inventory level" only needs to prove
      status blocks new bookings, and no booking/date module exists in this codebase to check
      against (see assumptions).

  - description: |
      Create `src/rooms/routes.js`: an Express router exposing:
      ```
      GET   /rooms                      -> 200 [room, ...]
      POST  /rooms                      -> 201 room | 400 { error }
      GET   /rooms/:id                  -> 200 room | 404 { error: 'room not found' }
      PATCH /rooms/:id/status           -> 200 room | 400 { error } | 404 { error: 'room not found' }
      POST  /rooms/:id/booking-requests -> 201 { roomId, accepted } | 404 { error: 'room not found' } | 409 { error }
      ```
      `POST /rooms` passes `req.body` and `req.body.actor` to `createRoom`; a caught
      `RoomValidationError` maps to `res.status(400).json({ error: err.message })`.
      `PATCH /rooms/:id/status` passes `req.body.status`/`req.body.actor` to
      `updateRoomStatus`; missing room -> 404, invalid status -> 400 (same error-mapping
      pattern). `POST /rooms/:id/booking-requests` calls `requestBooking(req.params.id)`;
      missing room -> 404, a caught `RoomUnavailableError` -> `res.status(409).json({ error:
      err.message })` (AC3), success -> 201.
    files:
      - src/rooms/routes.js
    rationale: |
      Same request/response contract shape as `src/guests/routes.js` (typed-error-to-status-code
      mapping, `{ error: 'X not found' }` 404 body) for consistency; `booking-requests` is
      modeled as its own sub-resource (like `hires`' `/:id/deactivate` action endpoints) rather
      than overloading `PATCH /rooms/:id`, since "request a booking" is an action with its own
      success/conflict semantics, not a room-field edit.

  - description: |
      Mount both new routers in `src/server.js`:
      ```js
      const roomTypesRouter = require('./roomTypes/routes');
      const roomsRouter = require('./rooms/routes');
      ...
      app.use('/room-types', roomTypesRouter);
      app.use('/rooms', roomsRouter);
      ```
    files:
      - src/server.js
    rationale: |
      `src/server.js` already mounts one router per domain (`/employees`, `/workflows`,
      `/runs`, `/hires`, `/guests`); `/room-types` and `/rooms` follow the same one-line
      registration pattern.

  - description: |
      Write `test/rooms.test.js` (supertest against `src/server.js`, no jsdom) with one test per
      backend-observable acceptance criterion (AC1–AC5) — see `tests` below for the concrete
      assertions. AC6 (empty-state UI copy) is proved at the UI layer in `test/rooms-ui.test.js`
      instead, since the live in-memory store is shared and mutated across tests in this file
      (matching `test/guests.test.js`'s existing style) and is never actually empty once earlier
      tests in the file have run.
    files:
      - test/rooms.test.js
    rationale: |
      Matches `test/guests.test.js`/`test/hires.test.js`'s existing supertest-against-the-real-
      app style; the rooms API is the source of truth for room state so its contract (creation,
      status transitions, booking-request gating, duplicate rejection) is verified at the HTTP
      layer.

  - description: |
      Create `public/rooms.html`: a single "Room list" screen (no approved design file exists
      for this story, so the markup is authored directly from the ACs, reusing existing shared
      classes from `design-system/prototype-utils.css` — `.app-topbar`, `.page`, `.card`,
      `.table-card`, `.btn`, `.field`, `.label`, `.input`, `.modal-overlay`/`.modal-wrap`/
      `.modal-panel`/`.modal-actions`, `.status-chip`, `.empty-state`, `.toast` — exactly as
      `public/guest-profiles.html` and `public/index.html` already do). Contents:
      - `.app-topbar` (brand "Room Inventory", nav "Rooms"), `.page-header` with `#new-room-btn`
        ("+ New room").
      - `table.room-table` in `#room-tbody` with columns Identifier / Room type / Status /
        Actions, wrapped in `#rooms-table-wrap`.
      - `#rooms-empty` (`.card.empty-state`, `hidden` by default): "No rooms yet" copy prompting
        staff to add a room, with a `#rooms-empty-add-btn` that opens the same create modal
        (AC6).
      - Create-room modal: `#create-room-overlay`/`#create-room-modal`, `#create-room-form` with
        `#field-room-identifier` (+ `#error-room-identifier`, reused for both "required" and
        "duplicate" copy — swapped by JS) and `#field-room-type` (`<select>`, populated from the
        room types passed in at init) + `#error-room-type`, `#create-room-cancel-btn`,
        `#create-room-save-btn`.
      - Per-row status control: a `<select class="room-status-select" data-id="...">` with
        options `available`/`maintenance`/`out-of-order` (AC2/AC4) — no confirmation dialog,
        since no AC requires one for a status change (contrast with the guest
        deactivate/reactivate confirm modals, which exist because that story's ACs asked for a
        consequence-copy step).
      - `#toast`/`#toast-message`.
      Links `../design-system/tokens.css`, `../design-system/prototype-utils.css`, the new
      `./css/rooms.css`, and loads `./js/rooms.js` with `defer` — same `<head>` wiring as
      `public/guest-profiles.html`.
    files:
      - public/rooms.html
    rationale: |
      Reusing the shared primitive classes keeps this page visually/structurally consistent with
      the rest of the app without a design file to port from; the empty-state card and duplicate-
      identifier error directly implement AC6 and AC5's UI-visible requirements.

  - description: |
      Create `public/css/rooms.css` with only the page-specific rules not already covered by
      `design-system/prototype-utils.css`: `.room-table` column widths, `.room-status-select`
      sizing/status-color variants (mirroring `.status-chip--active`/`--deactivated` variants
      already defined for guests), and empty-state icon spacing — following the same "shared
      primitives + one page-specific file" convention as `public/css/guest-profiles.css`.
    files:
      - public/css/rooms.css
    rationale: |
      Matches the established two-tier CSS convention; avoids redefining `.btn`/`.card`/`.modal-
      *`/`.empty-state` primitives that already live in `prototype-utils.css`.

  - description: |
      Create `public/js/rooms.js` exporting `initRoomsApp(doc, initialRooms, roomTypes, api)`
      and `createDefaultApi()`, following the dependency-injected-`api` pattern already used by
      `public/js/guest-profiles.js`/`public/js/hire-profile.js` (so tests can supply a mock `api`
      instead of hitting `fetch`). Uses `escapeHtml`/`formatDateDisplay` from `./utils` (the
      shared helper already used by `hire-profile.js`/`workflows` code), not a re-implemented
      copy. Responsibilities:
      - Render `#room-tbody` from the current room list, resolving each room's `roomTypeId` to a
        display name via the `roomTypes` list passed into `initRoomsApp` (AC1). When the list is
        empty, hide `#rooms-table-wrap` and show `#rooms-empty` instead (AC6):
        ```js
        function renderRooms(doc, rooms, roomTypesById) {
          const wrap = doc.getElementById('rooms-table-wrap');
          const empty = doc.getElementById('rooms-empty');
          if (rooms.length === 0) {
            wrap.hidden = true;
            empty.hidden = false;
            return;
          }
          wrap.hidden = false;
          empty.hidden = true;
          // ...populate #room-tbody
        }
        ```
      - `#create-room-form` submit: client-side requires a non-empty identifier and a selected
        room type (mirrors `#error-room-identifier`/`#error-room-type`); on success calls
        `api.create({ identifier, roomTypeId, actor: STAFF_NAME })`, prepends the returned room
        to the list, closes the modal, re-renders, and shows the success toast (AC1). On a
        rejected promise shaped `{ status: 400, error }`, shows `#error-room-identifier` with
        that message (e.g. "a room with identifier '101' already exists") and keeps the modal
        open with the typed values intact — nothing is added to the rendered list (AC5).
      - `.room-status-select` `change` event calls
        `api.updateStatus(select.dataset.id, select.value)`; on success, replaces that room in
        the local list with the response and re-renders its status chip (AC2, AC4); on failure,
        reverts the `<select>` to the room's last-known status and shows an error toast.
      `createDefaultApi()` wraps `fetch` for `GET /rooms`, `POST /rooms`, `PATCH
      /rooms/:id/status`, always attaching `actor: STAFF_NAME` (reusing the same hardcoded
      `'Priya Nair'` convention as `guest-profiles.js`) on mutating calls. Entry point: on
      `DOMContentLoaded`, `Promise.all([fetch('/rooms'), fetch('/room-types')])` then
      `initRoomsApp(document, rooms, roomTypes, createDefaultApi())`.
    files:
      - public/js/rooms.js
    rationale: |
      Dependency-injecting `api` is the exact pattern that makes `test/guest-profiles.test.js`/
      `test/hire-profile.test.js`-style jsdom tests possible without a real server; reusing
      `./utils`'s `escapeHtml` instead of a third re-implementation avoids drifting the codebase
      further from having one shared escaping helper.

  - description: |
      Write `test/rooms-ui.test.js` (jsdom, following `test/hire-profile.test.js`'s shape: load
      the real `public/rooms.html` into `document.documentElement.innerHTML`, `require` the JS
      module fresh per test via `jest.resetModules()`, call `initRoomsApp` with fixture data and
      a mock `api`). Covers AC1, AC2/AC4, AC5, and AC6's DOM-observable behavior — see `tests`
      below.
    files:
      - test/rooms-ui.test.js
    rationale: |
      The supertest suite proves the API contract; this suite proves `rooms.html`'s actual DOM
      (empty-state toggle, duplicate-identifier inline error, status-select wiring) behaves as
      specified, which an API-only test can't catch.

tests:
  - |
    AC1: creating a room with a unique identifier assigned to an existing room type makes it
    appear in the room list under that room type.
    ```js
    test('AC1: creating a room assigns it to an existing room type and it appears in the list', async () => {
      const typesRes = await request(app).get('/room-types');
      const roomType = typesRes.body[0];
      const res = await request(app).post('/rooms').send({ identifier: '101', roomTypeId: roomType.id, actor: 'Priya Nair' });
      expect(res.status).toBe(201);
      expect(res.body.roomTypeId).toBe(roomType.id);
      const listRes = await request(app).get('/rooms');
      expect(listRes.body.find((r) => r.id === res.body.id)).toMatchObject({ identifier: '101', roomTypeId: roomType.id });
    });
    ```
  - |
    AC2/AC3: setting an existing room's status to 'maintenance' blocks a booking request against
    it at the inventory level, with a clear unavailability reason.
    ```js
    test('AC2/AC3: a room in maintenance rejects booking requests with a clear reason', async () => {
      const typesRes = await request(app).get('/room-types');
      const roomType = typesRes.body[0];
      const createRes = await request(app).post('/rooms').send({ identifier: '202', roomTypeId: roomType.id, actor: 'Priya Nair' });
      const { id } = createRes.body;
      const statusRes = await request(app).patch(`/rooms/${id}/status`).send({ status: 'maintenance', actor: 'Priya Nair' });
      expect(statusRes.status).toBe(200);
      expect(statusRes.body.status).toBe('maintenance');
      const bookingRes = await request(app).post(`/rooms/${id}/booking-requests`).send({});
      expect(bookingRes.status).toBe(409);
      expect(bookingRes.body.error).toMatch(/unavailable/i);
    });
    ```
  - |
    AC3 (out-of-order counterpart): a room in 'out-of-order' also rejects booking requests at the
    inventory level.
    ```js
    test('AC3: a room out-of-order rejects booking requests', async () => {
      const typesRes = await request(app).get('/room-types');
      const roomType = typesRes.body[0];
      const createRes = await request(app).post('/rooms').send({ identifier: '303', roomTypeId: roomType.id, actor: 'Priya Nair' });
      const { id } = createRes.body;
      await request(app).patch(`/rooms/${id}/status`).send({ status: 'out-of-order', actor: 'Priya Nair' });
      const bookingRes = await request(app).post(`/rooms/${id}/booking-requests`).send({});
      expect(bookingRes.status).toBe(409);
      expect(bookingRes.body.error).toMatch(/out-of-order/);
    });
    ```
  - |
    AC4: setting a maintenance room's status back to 'available' makes it eligible for new
    bookings immediately.
    ```js
    test('AC4: reverting status to available makes the room bookable again', async () => {
      const typesRes = await request(app).get('/room-types');
      const roomType = typesRes.body[0];
      const createRes = await request(app).post('/rooms').send({ identifier: '404', roomTypeId: roomType.id, actor: 'Priya Nair' });
      const { id } = createRes.body;
      await request(app).patch(`/rooms/${id}/status`).send({ status: 'maintenance', actor: 'Priya Nair' });
      const revertRes = await request(app).patch(`/rooms/${id}/status`).send({ status: 'available', actor: 'Priya Nair' });
      expect(revertRes.body.status).toBe('available');
      const bookingRes = await request(app).post(`/rooms/${id}/booking-requests`).send({});
      expect(bookingRes.status).toBe(201);
      expect(bookingRes.body.accepted).toBe(true);
    });
    ```
  - |
    AC5: attempting to create a room with a duplicate identifier is rejected and the duplicate
    is not saved.
    ```js
    test('AC5: creating a room with a duplicate identifier is rejected and not saved', async () => {
      const typesRes = await request(app).get('/room-types');
      const roomType = typesRes.body[0];
      await request(app).post('/rooms').send({ identifier: 'DUP-1', roomTypeId: roomType.id, actor: 'Priya Nair' });
      const dupRes = await request(app).post('/rooms').send({ identifier: 'DUP-1', roomTypeId: roomType.id, actor: 'Priya Nair' });
      expect(dupRes.status).toBe(400);
      const listRes = await request(app).get('/rooms');
      expect(listRes.body.filter((r) => r.identifier === 'DUP-1')).toHaveLength(1);
    });
    ```
  - |
    AC1 (UI): submitting the create-room form with a valid identifier and room type adds the
    room to the rendered list.
    ```js
    test('AC1 UI: creating a room adds it to the rendered list', async () => {
      const roomTypes = [{ id: 'rt_standard_king', name: 'Standard King' }];
      const newRoom = { id: 'room_1', identifier: '101', roomTypeId: 'rt_standard_king', status: 'available' };
      const api = { create: jest.fn().mockResolvedValue(newRoom) };
      const { initRoomsApp } = require('../public/js/rooms');
      initRoomsApp(document, [], roomTypes, api);
      document.getElementById('new-room-btn').click();
      document.getElementById('field-room-identifier').value = '101';
      document.getElementById('field-room-type').value = 'rt_standard_king';
      document.getElementById('create-room-form').dispatchEvent(new Event('submit', { cancelable: true }));
      await Promise.resolve(); await Promise.resolve();
      expect(document.getElementById('room-tbody').textContent).toContain('101');
      expect(document.getElementById('room-tbody').textContent).toContain('Standard King');
    });
    ```
  - |
    AC2/AC4 (UI): changing a room's status select calls the api and updates the rendered status.
    ```js
    test('AC2/AC4 UI: changing the status select updates the rendered room status', async () => {
      const roomTypes = [{ id: 'rt_standard_king', name: 'Standard King' }];
      const room = { id: 'room_1', identifier: '101', roomTypeId: 'rt_standard_king', status: 'available' };
      const updated = { ...room, status: 'maintenance' };
      const api = { updateStatus: jest.fn().mockResolvedValue(updated) };
      const { initRoomsApp } = require('../public/js/rooms');
      initRoomsApp(document, [room], roomTypes, api);
      const select = document.querySelector('.room-status-select');
      select.value = 'maintenance';
      select.dispatchEvent(new Event('change', { cancelable: true }));
      await Promise.resolve(); await Promise.resolve();
      expect(api.updateStatus).toHaveBeenCalledWith('room_1', 'maintenance');
      expect(document.getElementById('room-tbody').textContent).toContain('maintenance');
    });
    ```
  - |
    AC5 (UI): a duplicate-identifier rejection from the api shows the inline error, keeps the
    modal open with the typed value intact, and does not add a row.
    ```js
    test('AC5 UI: a duplicate identifier shows the inline error and keeps the modal open', async () => {
      const roomTypes = [{ id: 'rt_standard_king', name: 'Standard King' }];
      const api = { create: jest.fn().mockRejectedValue({ status: 400, error: "a room with identifier '101' already exists" }) };
      const { initRoomsApp } = require('../public/js/rooms');
      initRoomsApp(document, [], roomTypes, api);
      document.getElementById('new-room-btn').click();
      document.getElementById('field-room-identifier').value = '101';
      document.getElementById('field-room-type').value = 'rt_standard_king';
      document.getElementById('create-room-form').dispatchEvent(new Event('submit', { cancelable: true }));
      await Promise.resolve(); await Promise.resolve();
      expect(document.getElementById('error-room-identifier').hidden).toBe(false);
      expect(document.getElementById('create-room-modal').hidden).toBe(false);
      expect(document.getElementById('field-room-identifier').value).toBe('101');
      expect(document.getElementById('room-tbody').textContent).not.toContain('101');
    });
    ```
  - |
    AC6: an empty room list shows an empty-state message prompting staff to add a room.
    ```js
    test('AC6: an empty room list shows the empty-state prompt', () => {
      const { initRoomsApp } = require('../public/js/rooms');
      initRoomsApp(document, [], [], { });
      expect(document.getElementById('rooms-table-wrap').hidden).toBe(true);
      expect(document.getElementById('rooms-empty').hidden).toBe(false);
      expect(document.getElementById('rooms-empty').textContent.toLowerCase()).toContain('room');
    });
    ```

assumptions_or_open_questions:
  - |
    No "room type" module exists anywhere in this codebase yet, and no story/design file for a
    room-types CRUD story was found under `.arc/plans` or `.arc/designs`. This plan adds the
    smallest possible read-only `src/roomTypes` module (a seeded fixture list, no create/edit
    API) purely so "assign to an existing room type" (AC1) and its validation are meaningful.
    If a separate room-types-management story lands later in this epic, `getRoomType`/
    `listRoomTypes` should keep the same signatures so `src/rooms` doesn't need to change.
  - |
    There is no bookings/reservations module anywhere in `src/`. AC2's "regardless of its
    occupancy calendar" and AC3's "booking request... rejected at the inventory level" are
    therefore implemented as a standalone `requestBooking(roomId)` status gate with no date
    parameters at all (there's no occupancy-calendar data to check against, which is itself
    consistent with "regardless of" it). A future bookings story would call this same gate (or
    its route) before persisting a reservation; this plan does not build that caller.
  - |
    "Unique identifier" (AC1/AC5) is modeled as a separate staff-supplied `identifier` string
    field, distinct from the server-generated `id` (`crypto.randomUUID()`) used for routing —
    matching how a real room number/code would be entered by staff and checked for duplicates,
    since a random UUID could never meaningfully collide. Uniqueness is checked as an exact
    match after trimming whitespace, not case-insensitively (not stated by any AC either way).
  - |
    No approved design/prototype file exists for TEST-M1-STORY-097 (unlike TEST-M1-STORY-100/
    091/092, which each had a `.arc/designs/*-design.html`). The room-list page markup in this
    plan is therefore authored directly from the ACs, reusing the shared primitive classes in
    `design-system/prototype-utils.css`, rather than ported verbatim from a prototype.
  - |
    A per-row `<select>` is used for status changes (AC2/AC4) with no confirmation dialog,
    since no AC asks for a consequence-copy confirm step before a status change (contrast with
    the guest deactivate/reactivate flow, whose confirm modals exist because that story's ACs
    asked for one). If the reviewer wants a confirm step before blocking a room, that's an easy
    follow-up but isn't required by the stated ACs.
  - |
    `POST /rooms/:id/booking-requests` is a synthetic "simulate a booking attempt against
    inventory" endpoint rather than a real reservation-creation endpoint, since no bookings
    module exists to actually create a reservation against. It exists solely to give AC3 a
    concrete, testable "booking request... rejected at the inventory level" surface; a future
    bookings story would likely supersede or wrap it.

package_dependencies: []

notes: |
  No new third-party dependencies are needed: `express`, `jest`, `jest-environment-jsdom`,
  `@testing-library/dom`, and `supertest` are already installed and cover both the backend and
  jsdom frontend test suites (verified in `package.json`).

  ```mermaid
  flowchart TD
    index[src/index.js] --> server[src/server.js]
    server --> guestsRouter[src/guests/routes.js]
    server --> hiresRouter[src/hires/routes.js]
    server --> roomTypesRouter[src/roomTypes/routes.js]
    server --> roomsRouter[src/rooms/routes.js]
    roomTypesRouter --> roomTypesStore[src/roomTypes/store.js]
    roomsRouter --> roomsStore[src/rooms/store.js]
    roomsStore -- "getRoomType(id) validates AC1" --> roomTypesStore
    html[public/rooms.html] --> js[public/js/rooms.js]
    js -- "fetch /rooms, /room-types" --> roomsRouter
    js -- "fetch /room-types" --> roomTypesRouter
    js -- "escapeHtml/formatDateDisplay" --> utils[public/js/utils.js]

    classDef touched fill:#f96,color:#000
    class server,roomTypesRouter,roomTypesStore,roomsRouter,roomsStore,html,js touched
  ```

  `server.js`, both new router+store pairs, `rooms.html`, and `rooms.js` are the only
  touched/new nodes (orange); `guests`/`hires` routers and `utils.js` are shown for context only
  (already-mounted siblings, and an existing shared helper this plan reuses rather than
  duplicates) and are not modified.

  I did not find a `validate_plan_yaml` tool exposed in this session's toolset (only
  Glob/Grep/Read/Write were available to me) — the same situation flagged in the prior
  `run_f3ccd8fef4c1` plan for this repo. I hand-verified this document's YAML shape (block
  scalars for every multi-line/code-bearing string via `key: |`, list items via `- |`, no bare
  colons/backticks/quotes on any `files:` path), but flagging this so the reviewer knows the
  automated validation pass did not run.
