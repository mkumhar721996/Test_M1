summary: |
  Add a new `reservations` module (net-new, no existing foundation) that lets front-desk staff
  create a reservation linking a guest id, a room id, check-in/check-out dates, and a room rate.
  The store enforces that new reservations start in `booked` status, that the room rate captured
  at booking time is immutable thereafter, that a room cannot hold two overlapping `booked` or
  `checked_in` reservations (using half-open `[checkIn, checkOut)` interval semantics so a
  same-day turnover is allowed), and that only the `front_desk` role may create a reservation.
  The module mirrors the existing `guests` module's structure (in-memory Map store, a role
  permission gate keyed on `x-staff-role`, a validation error class with per-field messages) so
  it fits the codebase's established conventions.

scope:
  - description: |
      Create `src/reservations/store.js`: an in-memory reservations store with creation,
      retrieval, listing, and a rate-immutable update path, plus the overlap-prevention and
      role-permission logic.

      Key exports:
      ```js
      function createReservation(data, actor) { /* returns booked reservation */ }
      function getReservation(id) { /* returns reservation or undefined */ }
      function listReservations() { /* returns Reservation[] */ }
      function updateReservation(id, changes) { /* throws if changes.roomRate is present */ }
      function canCreateReservation(role) { /* true only for 'front_desk' */ }
      class ReservationValidationError extends Error { /* statusCode = 400, fields = {} */ }
      class ReservationConflictError extends Error { /* statusCode = 409 */ }
      class ReservationImmutableFieldError extends Error { /* statusCode = 400, fields = {} */ }
      ```

      `createReservation` validates that `guestId`, `roomId`, `checkInDate`, `checkOutDate`, and
      a numeric `roomRate` are present (and that `checkOutDate` is after `checkInDate`), throwing
      `ReservationValidationError` with a `fields` map on failure (mirrors
      `GuestValidationError` in `src/guests/store.js`). It then checks for an overlapping
      reservation on the same `roomId` using half-open interval overlap:
      ```js
      const ACTIVE_STATUSES = ['booked', 'checked_in'];
      function hasOverlap(roomId, checkInDate, checkOutDate) {
        const inTime = new Date(checkInDate).getTime();
        const outTime = new Date(checkOutDate).getTime();
        return Array.from(reservations.values()).some((r) =>
          r.roomId === roomId &&
          ACTIVE_STATUSES.includes(r.status) &&
          new Date(r.checkInDate).getTime() < outTime &&
          inTime < new Date(r.checkOutDate).getTime()
        );
      }
      ```
      and throws `ReservationConflictError` when `hasOverlap` is true. On success it stores
      `{ id, guestId, roomId, checkInDate, checkOutDate, roomRate, status: 'booked', createdAt,
      actor }`. `updateReservation(id, changes)` throws `ReservationImmutableFieldError` whenever
      `'roomRate' in changes`, so the rate recorded at booking time can never change.
    files:
      - src/reservations/store.js
    rationale: |
      Mirrors `src/guests/store.js`'s Map-backed store, `ROLE_PERMISSIONS`/`canCreate*` gate, and
      typed validation-error pattern so the new module is consistent with the rest of the
      codebase. There is no existing `rooms` module (per the epic, room inventory is a separate,
      not-yet-built story), so `roomId` is treated as an opaque caller-supplied string, not
      validated against a room catalog.

  - description: |
      Create `src/reservations/routes.js`: an Express router exposing `POST /`, `GET /:id`, and
      `PATCH /:id`, wired the same way `src/guests/routes.js` wires its store.

      ```js
      router.post('/', (req, res, next) => {
        if (!reservationsStore.canCreateReservation(req.headers['x-staff-role'])) {
          return res.status(403).json({ error: 'forbidden' });
        }
        try {
          const reservation = reservationsStore.createReservation(req.body, req.body.actor);
          res.status(201).json(reservation);
        } catch (err) {
          if (err instanceof ReservationValidationError) return res.status(400).json({ error: 'validation_error', fields: err.fields });
          if (err instanceof ReservationConflictError) return res.status(409).json({ error: 'conflict' });
          next(err);
        }
      });
      ```
      `PATCH /:id` calls `updateReservation` and maps `ReservationImmutableFieldError` to a 400
      response (any staff member may call it; the rejection comes from immutability, not role).
    files:
      - src/reservations/routes.js
    rationale: |
      Keeps HTTP status mapping (403 permission, 400 validation/immutable, 409 conflict) at the
      routes layer and business rules at the store layer, matching the guests module's split.

  - description: |
      Wire the new router into the Express app: add `const reservationsRouter =
      require('./reservations/routes');` and `app.use('/reservations', reservationsRouter);` next
      to the existing `guestsRouter` wiring.
    files:
      - src/server.js
    rationale: |
      `src/server.js` is the single place every existing feature router (`employees`,
      `workflows`, `runs`, `hires`, `guests`) is mounted; the new module must follow the same
      pattern to be reachable over HTTP.

  - description: |
      Add store-level unit tests mirroring `test/guests-store.test.js` / `test/hires-store.test.js`.
    files:
      - test/reservations-store.test.js
    rationale: |
      Store-level tests exercise the validation, immutability, and overlap logic directly without
      HTTP plumbing, matching the existing convention of pairing a `*-store.test.js` file with
      each store module.

  - description: |
      Add route-level tests using `supertest` mirroring `test/guests.test.js` / `test/hires.test.js`.
    files:
      - test/reservations.test.js
    rationale: |
      Confirms the role permission gate, status-code mapping, and end-to-end request/response
      shape through the real Express app, matching how `guests.test.js` covers `guests/routes.js`.

tests:
  - |
    AC1 (store): creating with valid guestId/roomId/dates/roomRate yields booked status.
    ```js
    const reservation = createReservation({
      guestId: 'gst_1005', roomId: 'room_101',
      checkInDate: '2026-10-01', checkOutDate: '2026-10-05', roomRate: 150,
    }, 'Priya Nair');
    expect(reservation.status).toBe('booked');
    ```
  - |
    AC2 (store): the submitted room rate is recorded on the created reservation.
    ```js
    const reservation = createReservation({
      guestId: 'gst_1005', roomId: 'room_102',
      checkInDate: '2026-10-01', checkOutDate: '2026-10-05', roomRate: 175,
    }, 'actor');
    expect(reservation.roomRate).toBe(175);
    ```
  - |
    AC3 (store): editing the room rate after booking is rejected and the original rate is retained.
    ```js
    const reservation = createReservation({
      guestId: 'gst_1005', roomId: 'room_103',
      checkInDate: '2026-10-01', checkOutDate: '2026-10-05', roomRate: 150,
    }, 'actor');
    expect(() => updateReservation(reservation.id, { roomRate: 200 })).toThrow(ReservationImmutableFieldError);
    expect(getReservation(reservation.id).roomRate).toBe(150);
    ```
  - |
    AC4 (store): booking the same room for an overlapping date range is rejected with a conflict error.
    ```js
    createReservation({ guestId: 'gst_1005', roomId: 'room_202', checkInDate: '2026-11-01', checkOutDate: '2026-11-10', roomRate: 100 }, 'actor');
    expect(() => createReservation({
      guestId: 'gst_1006', roomId: 'room_202', checkInDate: '2026-11-05', checkOutDate: '2026-11-12', roomRate: 120,
    }, 'actor')).toThrow(ReservationConflictError);
    ```
  - |
    AC5 (store): booking with check-in on the prior reservation's checkout date is accepted (same-day turnover).
    ```js
    createReservation({ guestId: 'gst_1005', roomId: 'room_303', checkInDate: '2026-12-01', checkOutDate: '2026-12-04', roomRate: 100 }, 'actor');
    const second = createReservation({
      guestId: 'gst_1006', roomId: 'room_303', checkInDate: '2026-12-04', checkOutDate: '2026-12-08', roomRate: 110,
    }, 'actor');
    expect(second.status).toBe('booked');
    ```
  - |
    AC6 (store): a housekeeping role is denied at the permission gate, front_desk is allowed.
    ```js
    expect(canCreateReservation('front_desk')).toBe(true);
    expect(canCreateReservation('housekeeping')).toBe(false);
    ```
  - |
    AC6 (route): POST /reservations with an `x-staff-role: housekeeping` header is denied with 403.
    ```js
    const res = await request(app).post('/reservations').set('x-staff-role', 'housekeeping').send({
      guestId: 'gst_1005', roomId: 'room_404', checkInDate: '2026-10-01', checkOutDate: '2026-10-03', roomRate: 100,
    });
    expect(res.status).toBe(403);
    ```
  - |
    AC1/AC2 (route): POST /reservations with `x-staff-role: front_desk` creates a booked
    reservation and returns the rate.
    ```js
    const res = await request(app).post('/reservations').set('x-staff-role', 'front_desk').send({
      guestId: 'gst_1005', roomId: 'room_505', checkInDate: '2026-10-01', checkOutDate: '2026-10-03', roomRate: 130,
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: 'booked', roomRate: 130 });
    ```
  - |
    AC4 (route): POST /reservations for an overlapping date range on the same room returns 409.
    ```js
    await request(app).post('/reservations').set('x-staff-role', 'front_desk').send({
      guestId: 'gst_1005', roomId: 'room_606', checkInDate: '2026-11-01', checkOutDate: '2026-11-10', roomRate: 100,
    });
    const res = await request(app).post('/reservations').set('x-staff-role', 'front_desk').send({
      guestId: 'gst_1006', roomId: 'room_606', checkInDate: '2026-11-08', checkOutDate: '2026-11-15', roomRate: 120,
    });
    expect(res.status).toBe(409);
    ```
  - |
    AC3 (route): PATCH /reservations/:id with a roomRate change is rejected with 400.
    ```js
    const createRes = await request(app).post('/reservations').set('x-staff-role', 'front_desk').send({
      guestId: 'gst_1005', roomId: 'room_707', checkInDate: '2026-10-01', checkOutDate: '2026-10-03', roomRate: 100,
    });
    const patchRes = await request(app).patch(`/reservations/${createRes.body.id}`).send({ roomRate: 250 });
    expect(patchRes.status).toBe(400);
    ```

assumptions_or_open_questions:
  - |
    No `rooms` module exists yet (per the epic, room inventory ownership is a separate, not-yet-
    built story), so `roomId` is accepted as an opaque string and not validated against a room
    catalog. Similarly `guestId` is checked for presence/format only, not cross-referenced against
    `src/guests/store.js`, consistent with how other modules (e.g. `hires`) don't cross-validate
    foreign ids today.
  - |
    "Valid ... check-in date, check-out date" (AC1) is interpreted as: both present, parseable as
    dates, and `checkOutDate` strictly after `checkInDate`. This wasn't explicitly stated but is
    needed for the overlap math in AC4/AC5 to be meaningful.
  - |
    AC6 ("a housekeeping staff member ... is denied") is implemented as a 403 at `POST
    /reservations` only; `PATCH /reservations/:id`'s rejection in AC3 is purely about immutability
    and is not role-gated, since the AC text says "any staff member" attempting the rate edit.
  - |
    Reservation and room-rate values are treated as plain numbers (no currency/rounding handling),
    since no currency requirement is stated in the acceptance criteria.
  - |
    `checked_in` is included in the overlap-blocking status set per AC4's wording, even though no
    story yet transitions a reservation into `checked_in` — that transition is out of scope here
    and belongs to a future check-in story.

package_dependencies: []

notes: |
  Reviewed the two closest existing modules for conventions: `src/guests/store.js` /
  `src/guests/routes.js` (Map-backed store, `ROLE_PERMISSIONS` + `canCreateGuest` gate keyed on
  `x-staff-role`, a `GuestValidationError` class with a `fields` map, `crypto.randomUUID()` ids)
  and `src/hires/store.js` (an `updateX` function that branches on which fields changed). The
  `hires` module's name is a red herring — it's employee onboarding "hires", unrelated to room
  reservations — so nothing there is reused directly, but its update-side-effect pattern
  confirmed how this codebase expects "some fields trigger extra rules on update" to be
  structured, which is what AC3's rate-immutability check follows.

  ```mermaid
  flowchart TD
    server[src/server.js]
    resRoutes[src/reservations/routes.js]
    resStore[src/reservations/store.js]
    guestsStore[src/guests/store.js]

    server -->|mounts new router at /reservations| resRoutes
    resRoutes -->|create/get/update reservation, role check| resStore
    resStore -.pattern mirrored, not called.-> guestsStore

    classDef touched fill:#f96,color:#000
    class server,resRoutes,resStore touched
  ```

review_focus: |
  In scope: a new, self-contained `reservations` module (store + routes + server wiring) covering
  booking creation, rate immutability on update, room/date overlap prevention, and the
  `front_desk`-only create permission. Out of scope: room inventory/catalog management, guest-id
  cross-validation, and check-in/check-out/cancel transitions — those belong to sibling stories
  under the same epic and should not be flagged as missing here.

  The riskiest area is the overlap-detection boundary math (`hasOverlap` in
  `src/reservations/store.js`): it must reject any true date-range overlap (AC4) while still
  accepting a same-day turnover where the new check-in equals a prior reservation's check-out
  (AC5). This is deliberately implemented as strict half-open-interval overlap (`existing.checkIn
  < new.checkOut && new.checkIn < existing.checkOut`) rather than an inclusive/`<=` comparison —
  a reviewer should not "fix" this to `<=`, as that would break AC5.
