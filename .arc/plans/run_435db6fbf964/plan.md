summary: |
  Add a Room Inventory Management feature so front-desk staff have a durable source of truth for
  room number, type, and status. This adds a new `src/rooms` module (in-memory store + Express
  router, mirroring the existing `src/guests` and `src/hires` modules) and a new `public/rooms.html`
  page (mirroring `public/guest-profiles.html`) built from the single approved prototype at
  `.arc/designs/TEST-M1-STORY-131-design.html`. Rooms can be created, edited, and deactivated
  (soft-delete, never hard-deleted) by front-desk staff only; housekeeping staff are denied every
  action (view, create, update, deactivate) with an action-specific message. A room cannot be moved
  to "maintenance" status while it has any booked or checked-in reservation — this is enforced in
  the store (authoritative) and pre-checked client-side for the instant feedback the prototype
  demonstrates. There is no reservations/booking module anywhere in this codebase yet (confirmed via
  grep — only `src/guests/store.js` mentions the word "reservation", in a comment), so reservation
  data is modeled as a small embedded, read-only-via-this-API array on each room record, exactly as
  the prototype's fixture data shows it; full reservation lifecycle management is explicitly a
  separate, not-yet-built epic-level capability.

scope:
  - description: |
      Create the rooms store: `src/rooms/store.js`, an in-memory `Map`-based store mirroring
      `src/guests/store.js` (error classes with a `.statusCode`, permission-check function,
      CRUD + deactivate/reactivate functions). Exports:
      ```js
      class RoomValidationError extends Error {
        constructor(message, fields = {}) { super(message); this.statusCode = 400; this.fields = fields; }
      }
      class RoomMaintenanceBlockedError extends Error {
        constructor(message, conflictingReservations = []) {
          super(message); this.statusCode = 409; this.conflictingReservations = conflictingReservations;
        }
      }
      function canManageRooms(role) { return ROLE_PERMISSIONS[role] === true; } // front_desk: true, else false
      function createRoom(data) { /* number, type, status required; duplicate number rejected;
        reservations defaults to [] but is accepted through if passed (internal/test seam only —
        the HTTP layer below whitelists to number/type/status per AC1) */ }
      function getRoom(id) {}
      function listRooms() {} // returns ALL rooms, active and inactive — active/inactive
        // filtering for the "active inventory list" is a client-side concern (see rooms.js scope
        // item), matching how guests/store.js and hires/store.js also return everything and let
        // callers decide what to show.
      function updateRoom(id, changes) { /* validates number/type/status; rejects duplicate
        number; if changes.status === 'maintenance' and room.reservations.length > 0, throws
        RoomMaintenanceBlockedError naming the conflicting reservation(s) — AC8/AC9 */ }
      function deactivateRoom(id) { /* sets active=false, deactivatedAt=ISO string; record stays
        in the Map — AC3/AC4 */ }
      function reactivateRoom(id) { /* sets active=true, clears deactivatedAt — see
        assumptions_or_open_questions: not covered by any AC, included because the approved
        design implements it on every inactive row */ }
      module.exports = { RoomValidationError, RoomMaintenanceBlockedError, canManageRooms,
        createRoom, getRoom, listRooms, updateRoom, deactivateRoom, reactivateRoom };
      ```
    files:
      - src/rooms/store.js
      - test/rooms-store.test.js
    rationale: |
      Mirrors the established in-memory store pattern (`src/guests/store.js`, `src/hires/store.js`,
      `src/employees/store.js`, all read and confirmed present): a `Map`, plain exported functions,
      a typed validation error with `.statusCode` the router can branch on — exactly how
      `GuestValidationError` (`src/guests/store.js:14-20`) is shaped. Keeping the maintenance-
      transition check here (not just in the UI) makes it authoritative — the UI's instant check in
      `rooms.js` is a duplicate optimistic pre-check, not the source of truth.

  - description: |
      Create the rooms HTTP API: `src/rooms/routes.js`, an Express router mirroring
      `src/guests/routes.js`'s permission-gate-then-delegate-to-store shape.
      ```js
      const CREATABLE_FIELDS = ['number', 'type', 'status'];
      const PATCHABLE_FIELDS = ['number', 'type', 'status'];
      const DENIED_MESSAGE = {
        view: "You don't have permission to view the room inventory",
        create: "You don't have permission to create rooms",
        update: "You don't have permission to update rooms",
        deactivate: "You don't have permission to deactivate rooms",
      };
      function isPermitted(req) { return roomsStore.canManageRooms(req.headers['x-staff-role']); }
      ```
      Routes: `GET /` (403 with `DENIED_MESSAGE.view` if not permitted, else `listRooms()`),
      `POST /` (403 `.create` if not permitted; else whitelist `CREATABLE_FIELDS`, catch
      `RoomValidationError` -> 400 `{ error: 'validation_error', fields }`), `PATCH /:id` (403
      `.update`; catch `RoomValidationError` -> 400; catch `RoomMaintenanceBlockedError` -> 409
      `{ error: 'maintenance_blocked', message: err.message, conflictingReservations:
      err.conflictingReservations }`), `POST /:id/deactivate` (403 `.deactivate`), `POST
      /:id/reactivate` (403 `.update` — see assumptions: the design's denial-message map has no
      dedicated "reactivate" entry, only view/create/update/deactivate, so reactivate reuses
      `.update`). Every denial response body is `{ error: 'forbidden', message: <action message> }` —
      this deliberately differs from `src/guests/routes.js`'s bare `{ error: 'forbidden' }` (no
      message), because AC7 explicitly requires "an appropriate error message" for every denied
      action, which the existing guests convention doesn't need to satisfy.
    files:
      - src/rooms/routes.js
      - test/rooms.test.js
      - test/rooms-role-enforcement.test.js
    rationale: |
      Matches `src/guests/routes.js`'s `isPermitted(req)` + per-route 403 shape and
      `pickPatchableFields`-style whitelisting exactly, so the new module reads like the rest of the
      codebase. Distinct messages per action satisfy AC6/AC7's requirement that a housekeeping
      denial for create, update, deactivate, OR view be shown with "an appropriate error message" —
      using the exact copy the approved design already shows in its `DENIED_COPY` map
      (`.arc/designs/TEST-M1-STORY-131-design.html:1090-1095`) so the API and the UI agree
      word-for-word. `test/rooms-role-enforcement.test.js` is a new, separate file mirroring the
      sibling `test/guests-role-enforcement.test.js` (added for guests in TEST-M1-STORY-126, read
      and confirmed present), which already establishes a `describe.each` pattern across every
      mutating + read endpoint for exactly this kind of cross-cutting permission requirement.

  - description: |
      Register the new router in `src/server.js`: add `const roomsRouter = require('./rooms/routes');`
      beside the other five router requires, and `app.use('/rooms', roomsRouter);` beside the other
      five `app.use` calls. Static file serving (already `app.use(express.static(...))`, registered
      before the routers) will continue to serve `public/rooms.html` at `/rooms.html` without any
      change; it does not collide with the `/rooms` API prefix, exactly as `guest-profiles.html` and
      the `/guests` router already coexist today.
    files:
      - src/server.js
    rationale: |
      Every existing feature module is wired in this one file (confirmed by reading
      `src/server.js:1-17`: employees, workflows, runs, hires, guests each get one require line +
      one `app.use` line); rooms follows the same one-line-per-module convention.

  - description: |
      Build `public/rooms.html` from the approved prototype's "Room Inventory" screen (the first
      `.screen` in `.arc/designs/TEST-M1-STORY-131-design.html`, lines 689-907; the second screen,
      "Reference States" at lines 914-1016, is a static reviewer-only reference grid and is
      explicitly NOT built — see assumptions). Link `../design-system/tokens.css`,
      `../design-system/prototype-utils.css`, `./css/rooms.css`, and `./js/rooms.js` (`defer`),
      matching `public/guest-profiles.html`'s `<head>` exactly (`<link>`/`<script>` order confirmed
      at `public/guest-profiles.html:7-10`). Carry over from the prototype: the `app-topbar` with
      brand "Guest Services", nav (Guests / Rooms active / Bookings), the role-switcher select
      (`front_desk` / `housekeeping`) and "Reset demo data" link in `.topbar-actions`; the
      `.page-header` ("Room inventory" / "The source of truth for every room's number, type, and
      status."); the `#denied-panel` error-state with its `.denied-tabs` (view/create/update/
      deactivate); the `.toolbar` (search input, "Show inactive rooms" toggle, "+ New room" button);
      the `.room-table` (Room / Type / Status / Reservations / Actions columns) with its skeleton-row
      loading state, `#rooms-empty-created` and `#rooms-empty-search` empty states, and the
      "Clear all rooms (demo)" reset link; the create-room modal (`#create-modal`, number/type/
      status fields, inline field errors); the edit-room modal (`#edit-modal`, same three fields
      plus the `#edit-block-note` maintenance-conflict notice); the deactivate-confirm modal
      (`#deactivate-modal`, `.consequence-note`); and the `#toast`. IDs, structure, and copy are
      taken verbatim from the prototype so `rooms.js` (below) can bind to the same element IDs the
      prototype's inline script already uses.
    files:
      - public/rooms.html
    rationale: |
      This is the already-approved design; the task is to carry it over into the real page shell
      used elsewhere in this app (external stylesheet/script links instead of inlined `<style>`/
      `<script>`, and dropping the reviewer-only prev/next screen bar and fixture-data `<script>`
      tag, which are prototype-tooling artifacts, not part of the shipped page).

  - description: |
      Create `public/css/rooms.css` with every component class the prototype defines that is NOT
      already in `design-system/prototype-utils.css` (confirmed present at that path; already
      supplies `.app-topbar`, `.app-nav`, `.page`, `.page-header`, `.modal-*`, `.icon-btn`, `.field`,
      `.toast`, `.btn*`, `.card*`, `.input`, `.label`): `.role-switcher` / `.topbar-actions` /
      `.reset-link`, `.toolbar` / `.search-field` / `.toggle-field`, `.table-card` / `.table-scroll` /
      `.room-table` and its cells / `.new-badge` / `.col-actions` / `.row-action-btn` /
      `.reservation-chip-stack` / `.no-reservations-note`, `.status-chip` and its `--available` /
      `--occupied` / `--maintenance` / `--deactivated` / `--booked` / `--checked-in` modifiers (each
      carries meaning via border style + icon + label, never color alone — confirmed by reading
      `design-system/tokens.json`, which has no status-hue tokens, matching the prototype's own
      comment), `.skeleton-row` / `.skeleton-bar` (+ `@keyframes pulse`, gated behind
      `@media (prefers-reduced-motion: no-preference)`), `.empty-state` / `.error-state` /
      `.denied-tabs`, `.consequence-note`, `.block-note`, `.field-error-text` / `.input-error` /
      `.field-hint`. Copied verbatim from the prototype's inlined `<style>` (lines 373-545 of the
      design file), following the same "page-specific styles live in their own file, shared shell
      lives in prototype-utils.css" split already used by `public/css/guest-profiles.css` (confirmed
      present).
    files:
      - public/css/rooms.css
    rationale: |
      Keeps the design-system boundary consistent with every other page in this repo — no page
      duplicates shell primitives that already exist centrally.

  - description: |
      Build `public/js/rooms.js`, mirroring `public/js/guest-profiles.js`'s shape (confirmed by
      reading `public/js/guest-profiles.js:50, 435-469`):
      ```js
      function initRoomsApp(doc, initialRooms, api) { /* ... */ }
      function createDefaultApi(getRole) {
        function jsonRequest(url, method, body) {
          return fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json', 'x-staff-role': getRole() },
            body: JSON.stringify(body),
          }).then((res) => res.json().then((json) => {
            if (!res.ok) return Promise.reject({ status: res.status, body: json });
            return json;
          }));
        }
        return {
          create: (data) => jsonRequest('/rooms', 'POST', data),
          update: (id, changes) => jsonRequest(`/rooms/${id}`, 'PATCH', changes),
          deactivate: (id) => jsonRequest(`/rooms/${id}/deactivate`, 'POST', {}),
          reactivate: (id) => jsonRequest(`/rooms/${id}/reactivate`, 'POST', {}),
        };
      }
      module.exports = { initRoomsApp, createDefaultApi };
      if (typeof window !== 'undefined') {
        window.addEventListener('DOMContentLoaded', () => { /* fetch('/rooms', { headers: {
          'x-staff-role': currentRole } }) then initRoomsApp(document, rooms, api); handle a 403
          by rendering the denied panel with zero room data, per AC6/AC7 */ });
      }
      ```
      Unlike `guest-profiles.js`'s `createDefaultApi()` (zero-arg, hardcodes
      `'x-staff-role': 'front_desk'` on every call — confirmed at `public/js/guest-profiles.js:439,450`),
      `createDefaultApi(getRole)` takes a role getter because this page's role is switchable at
      runtime; every request must reflect whichever role is currently selected. It also parses the
      JSON body on error responses (not just success), because `rooms.js` needs to read
      `err.body.message` (403 denial copy, AC7) and `err.body.conflictingReservations` (409
      maintenance-block, AC9) — `guest-profiles.js`'s wrapper only rejects with `{ status }` since
      guests' 403 body carries no message to read.
      Behavior to port from the prototype's inline script (`.arc/designs/TEST-M1-STORY-131-design.html`
      lines 1020-1413): role-select toggling between the front-desk content and `#denied-panel`
      (switching role re-fetches `/rooms` so a 403 is real, not simulated); `.denied-tabs` clicks
      updating the shown per-action denial copy; `filteredRooms()` search + "show inactive"
      filtering (inactive rooms hidden by default — this is what satisfies AC3's "no longer appears
      in the active inventory list"; toggling the checkbox is the only way to see AC4's retained
      record); `renderRoomsTable()`; create-room modal validation (required number/type,
      duplicate-number inline error) then `api.create(...)`; edit-room modal validation plus an
      optimistic client-side maintenance-conflict pre-check reusing the room's own `reservations`
      array (recomputing the same "Can't move Room {number} to Maintenance — it has {summary}
      ({guest}, {dates}). Resolve or reassign the conflicting reservation(s) first." copy the
      prototype hard-codes) — but the actual save always goes through `api.update(...)`, and a
      `409 maintenance_blocked` response also populates `#edit-block-note` from the server's
      message, so a stale client-side `reservations` array can never bypass the server's
      authoritative check; deactivate-confirm modal then `api.deactivate(...)`; reactivate action
      then `api.reactivate(...)`; toasts on success/failure for every mutation, matching
      `guest-profiles.js`'s try/catch-then-toast pattern.
    files:
      - public/js/rooms.js
      - test/rooms-ui.test.js
    rationale: |
      Reuses the exact `init<Feature>App(doc, initialData, api)` / `createDefaultApi()` seam
      `guest-profiles.js` already established, which is what makes `test/guest-profiles.test.js`'s
      jsdom-with-injected-fake-api pattern possible — `test/rooms-ui.test.js` follows the same
      recipe.

tests:
  - |
    AC1 (store): createRoom adds a room with the exact submitted number/type/status.
    ```js
    const room = createRoom({ number: '220', type: 'Suite', status: 'available' });
    expect(listRooms()).toContainEqual(expect.objectContaining({ number: '220', type: 'Suite', status: 'available' }));
    ```
  - |
    AC1 (route): POST /rooms as front_desk creates the room and returns it with those attributes; 400 on a duplicate number.
    ```js
    const res = await request(app).post('/rooms').set('x-staff-role', 'front_desk').send({ number: '220', type: 'Suite', status: 'available' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ number: '220', type: 'Suite', status: 'available' });
    ```
  - |
    AC2 (store): updateRoom reflects new number, type, and status.
    ```js
    const room = createRoom({ number: '205', type: 'Deluxe', status: 'available' });
    const updated = updateRoom(room.id, { number: '206', type: 'Suite', status: 'occupied' });
    expect(updated).toMatchObject({ number: '206', type: 'Suite', status: 'occupied' });
    expect(getRoom(room.id)).toMatchObject({ number: '206', type: 'Suite', status: 'occupied' });
    ```
  - |
    AC3 (store + UI): a deactivated room is excluded from the default (active-only) rendered list.
    ```js
    const room = createRoom({ number: '402', type: 'Deluxe', status: 'available' });
    deactivateRoom(room.id);
    expect(getRoom(room.id).active).toBe(false);
    // UI: initRoomsApp(document, [deactivatedRoomFixture], api) with the "Show inactive rooms"
    // checkbox left unchecked (its default state)
    expect(document.getElementById('rooms-tbody').textContent).not.toContain('402');
    ```
  - |
    AC4 (store + UI): the deactivated room record is retained, not deleted, and is visible via "Show inactive rooms".
    ```js
    expect(listRooms().some((r) => r.id === room.id)).toBe(true);
    // UI: check the show-inactive-toggle, then re-render
    document.getElementById('show-inactive-toggle').checked = true;
    document.getElementById('show-inactive-toggle').dispatchEvent(new Event('change'));
    expect(document.getElementById('rooms-tbody').textContent).toContain('402');
    ```
  - |
    AC5 (UI): an inventory with zero rooms ever created shows the "No rooms yet" prompt.
    ```js
    initRoomsApp(document, [], api);
    expect(document.getElementById('rooms-empty-created').hidden).toBe(false);
    expect(document.getElementById('rooms-empty-created').textContent).toContain('Create the first room');
    ```
  - |
    AC6/AC7 (store + route, all four actions in one describe.each — mirroring
    test/guests-role-enforcement.test.js exactly, since the current story's AC6/AC7 cover create,
    update, deactivate, AND view denial together, not as separate criteria):
    ```js
    const ENDPOINTS = [
      { name: 'view', build: () => ({ method: 'get', path: '/rooms' }) },
      { name: 'create', build: () => ({ method: 'post', path: '/rooms', body: { number: '901', type: 'Standard', status: 'available' } }) },
      { name: 'update', build: (id) => ({ method: 'patch', path: `/rooms/${id}`, body: { type: 'Suite' } }) },
      { name: 'deactivate', build: (id) => ({ method: 'post', path: `/rooms/${id}/deactivate`, body: {} }) },
    ];
    describe.each(ENDPOINTS)('$name', ({ name, build }) => {
      test('housekeeping is denied with an action-specific message and nothing changes', async () => {
        const room = createRoom({ number: '150', type: 'Standard', status: 'available' });
        const { method, path, body } = build(room.id);
        const res = await request(app)[method](path).set('x-staff-role', 'housekeeping').send(body);
        expect(res.status).toBe(403);
        expect(res.body).toEqual({ error: 'forbidden', message: DENIED_MESSAGE[name] });
        expect(listRooms().some((r) => r.number === '901')).toBe(false);
        expect(getRoom(room.id)).toMatchObject({ number: '150', type: 'Standard', status: 'available' });
      });
    });
    ```
  - |
    AC8/AC9 (store): updateRoom rejects a maintenance transition while any reservation is active, naming the conflict.
    ```js
    const room = createRoom({ number: '102', type: 'Standard', status: 'occupied',
      reservations: [{ id: 'RES-1', state: 'checked_in', guest: 'Maria Alvarez', dates: 'Sep 28 – Sep 30, 2026' }] });
    expect(() => updateRoom(room.id, { status: 'maintenance' })).toThrow(RoomMaintenanceBlockedError);
    try { updateRoom(room.id, { status: 'maintenance' }); } catch (err) {
      expect(err.message).toMatch(/resolve.*conflicting reservation/i);
      expect(err.conflictingReservations).toHaveLength(1);
    }
    expect(getRoom(room.id).status).toBe('occupied');
    ```
  - |
    AC6/AC7 (UI): switching the role-select to housekeeping shows #denied-panel and hides
    #front-desk-content, with no room data reaching the client.
    ```js
    initRoomsApp(document, [], apiThatWouldRejectAllCallsWith403);
    document.getElementById('role-select').value = 'housekeeping';
    document.getElementById('role-select').dispatchEvent(new Event('change'));
    // ... after the re-fetch/403 resolves:
    expect(document.getElementById('denied-panel').hidden).toBe(false);
    expect(document.getElementById('front-desk-content').hidden).toBe(true);
    ```

assumptions_or_open_questions:
  - |
    No reservations/booking module exists anywhere in this codebase yet (verified by grepping
    `src/` for "reservation" — the only hit is an unrelated comment in `src/guests/store.js`), and
    the parent epic frames the full reservation lifecycle as separate, not-yet-built scope. This
    plan therefore models reservations only as a small embedded array on each room record
    (`{ id, state: 'booked' | 'checked_in', guest, dates }`), settable through `createRoom`'s data
    (an internal/test seam) but never exposed for direct create/update through this story's HTTP
    API. If a future Booking/Reservation story introduces its own store, that store should own
    writes to a room's reservations and this plan's read-only usage of them should be revisited.
  - |
    The approved prototype's own inline HTML comments label the view-denial state as "AC10, AC11"
    and the create/update/deactivate-denial state as "AC6, AC7" (see
    `.arc/designs/TEST-M1-STORY-131-design.html` lines 715, 671-673, 988-1001). This does not match
    the current story's actual acceptance-criteria list, which only goes up to AC9 and defines AC6/
    AC7 as covering ALL FOUR actions — create, update, deactivate, AND view — together as a single
    pair of criteria. Read literally, the prototype was authored against an earlier or different AC
    breakdown where view-denial was its own separate pair (AC10/AC11) from the other three actions
    (AC6/AC7). This plan resolves the conflict by treating every one of the four denial states the
    design implements (view/create/update/deactivate) as satisfying today's AC6/AC7 jointly — the
    design's UI and copy are unaffected either way, only the test/requirement labeling changes — but
    flagging this explicitly since a silent "AC10/AC11" reference elsewhere in this plan would point
    at criteria that don't exist in this story.
  - |
    Room number uniqueness and required-field validation (number, type, status) are not literally
    named in any AC, but the approved design's create/edit forms both implement them (inline
    duplicate-number error, required-field errors) — treated as in-scope since building "the room
    appears... with those attributes" (AC1) sensibly requires a room to be unambiguously
    identifiable, and the design already committed to this UX.
  - |
    No AC covers reactivating a deactivated room, but the approved design's Room Inventory screen
    implements a working "Reactivate" action on every inactive row (`data-reactivate`,
    `reactivateRoom()`). Built as shown, gated by the same front-desk-only permission check, to
    avoid shipping a dead button — but this is flagged explicitly since it is design-driven, not
    AC-driven scope.
  - |
    This codebase has no authentication/session system. Per the existing convention in
    `src/guests/store.js` / `src/guests/routes.js` (`req.headers['x-staff-role']`), the approved
    design's "Signed in as" role-select is the only real mechanism by which a user of this page can
    ever exercise the housekeeping-denied paths (AC6/AC7) — so, unlike `guest-profiles.js` (which
    hardcodes `x-staff-role: 'front_desk'`), `rooms.js` must send the role-select's current value as
    the header on every request for those paths to be reachable at all, not just cosmetic.
  - |
    `src/guests/routes.js` distinguishes a missing `x-staff-role` header (401 unauthorized) from a
    present-but-wrong-role header (403 forbidden). This plan deliberately does NOT copy that split
    for rooms — `canManageRooms(role)` returns `false` (and therefore a 403) for any role that isn't
    `front_desk`, including `undefined` — because no AC in this story distinguishes "no role
    provided" from "wrong role provided," and the design's role-switcher always sends one of the two
    known roles. If a future story needs the 401 distinction for rooms too, this simplification
    should be revisited.
  - |
    Room `type` (Standard/Deluxe/Suite) and `status` (available/occupied/maintenance) are treated
    as closed enums matching the design's `<select>` options exactly, since no AC calls for
    extensibility and the design offers no free-text alternative.
  - |
    The prototype's second screen ("Reference States") is explicitly a static, non-interactive
    reviewer aid (its own in-file comment says so) and is not built as a real page.
  - |
    I was able to read the approved prototype at `.arc/designs/TEST-M1-STORY-131-design.html`
    directly (it exists in this worktree at that exact path), so all UI scope above is grounded in
    it rather than guessed. I also re-verified every file/line citation in this plan against the
    current repository state (src/guests/store.js, src/guests/routes.js, src/server.js,
    public/guest-profiles.html, public/js/guest-profiles.js, design-system/tokens.json,
    test/guests-role-enforcement.test.js, package.json) before finalizing this revision.

package_dependencies: []

notes: |
  Every dependency this plan needs (`express`, `jest`, `jest-environment-jsdom`, `supertest`,
  `@testing-library/dom`) is already in `package.json` (confirmed by reading it); no new packages
  are required.

  ```mermaid
  flowchart TD
    server[src/server.js]
    roomsRoutes[src/rooms/routes.js]
    roomsStore[src/rooms/store.js]
    roomsHtml[public/rooms.html]
    roomsJs[public/js/rooms.js]
    roomsCss[public/css/rooms.css]
    guestsStore[src/guests/store.js]
    guestsRoutes[src/guests/routes.js]

    server -->|"new: app.use('/rooms', roomsRouter)"| roomsRoutes
    roomsRoutes -->|"delegates CRUD + permission check"| roomsStore
    roomsHtml -->|"links css + defer script"| roomsCss
    roomsHtml -->|"links defer script"| roomsJs
    roomsJs -->|"fetch('/rooms', ...) with live x-staff-role header"| roomsRoutes
    guestsStore -.->|"pattern reference only — not modified"| roomsStore
    guestsRoutes -.->|"pattern reference only — not modified"| roomsRoutes

    classDef touched fill:#f96,color:#000;
    class server,roomsRoutes,roomsStore,roomsHtml,roomsJs,roomsCss touched;
  ```

review_focus: |
  In scope: a new `src/rooms` store + router (create/update/deactivate/list, front-desk-only
  permission gate with per-action denial messages, server-side maintenance-transition blocking)
  and a new `public/rooms.html` + `rooms.css` + `rooms.js` page built from the single approved
  prototype screen. Out of scope: any reservation/booking CRUD (reservations are read-only
  fixture-style data embedded on the room), any real authentication (role is a client-supplied
  header, matching `src/guests`'s existing convention, deliberately without guests' 401-vs-403
  split — see assumptions), and the prototype's second "Reference States" screen (static reviewer
  aid, not implemented).

  Riskiest area: AC8/AC9's maintenance-block is intentionally checked in two places — an
  optimistic client-side pre-check for the instant feedback the prototype shows, and the
  authoritative server-side check in `updateRoom` — a reviewer should confirm the client-side copy
  is only ever a preview and that every actual state change is gated by the server's `409
  maintenance_blocked` response, not by the client check alone.

  Also flag, don't silently accept: (1) the "Reactivate" action and the room-number/required-field
  validation are both included even though no AC names them, solely because the approved design
  already implements them; (2) the rooms 403 body shape (`{ error: 'forbidden', message }`)
  intentionally differs from guests' bare `{ error: 'forbidden' }`, driven by AC7's explicit
  message requirement; (3) this plan's tests treat AC6/AC7 as covering view-denial as well as
  create/update/deactivate-denial, correcting the prototype's own inline comments which cite a
  now-nonexistent "AC10/AC11" for view-denial — there is no AC10 or AC11 in this story.
