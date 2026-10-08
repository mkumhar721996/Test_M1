summary: |
  Adds a technician-facing "availability" signal (available / unavailable for new jobs) as its
  own small domain module (`src/availability/`), mirroring the existing per-domain
  store/routes/auth structure used by `src/jobs/`, `src/repairRequests/`, etc. The technician's
  own status is read/written through `GET/PUT /availability/me` (`x-user-id` identity, same
  fail-closed-in-production pattern as `src/jobs/auth.js`); a dispatcher-facing roster read is
  exposed through `GET /availability` (`x-staff-role: dispatcher`, same pattern as
  `src/repairRequests/auth.js`). A minimal `POST /jobs/:id/assign` endpoint is added to
  `src/jobs/` so AC4 ("assignment succeeds without restriction") is a real, falsifiable test
  rather than an assertion with nothing to assert against — it deliberately contains no
  availability check and no matching/notification logic, since the story's scope explicitly
  excludes "the dispatcher's assignment logic." On the frontend, only the technician-facing
  "My Availability" screen from the approved prototype is built (`public/availability.html` /
  `public/css/availability.css` / `public/js/availability.js`); the prototype's two
  "(internal preview)" dispatcher screens are reviewer-only scaffolding per the prototype's own
  comments ("ships with nothing in the real app") and are intentionally not built — AC1/AC2's
  "dispatcher's view" and AC4 are instead verified directly against the API.
scope:
  - description: |
      New `src/availability/store.js`: an in-memory `Map<technicianId, record>` of availability
      records, seeded for the same technician ids already seeded in `src/jobs/store.js`
      (`marcus-webb`, `dana-cole`) so a technician's availability and their assigned jobs line up
      in tests/demo data. Exposes:
      ```js
      function getAvailability(technicianId) {
        return availability.get(technicianId) || { technicianId, available: true, updatedAt: null };
      }
      function setAvailability(technicianId, available) {
        const record = { technicianId, available, updatedAt: new Date().toISOString() };
        availability.set(technicianId, record);
        return record;
      }
      function listAvailability() { return Array.from(availability.values()); }
      ```
      A technician never explicitly set defaults to `available: true` (never-set == available),
      since nothing in the story implies new technicians start unavailable.
    files:
      - src/availability/store.js
    rationale: |
      Mirrors the existing per-domain store convention (e.g. `src/jobs/store.js`,
      `src/repairRequests/store.js`) rather than introducing a shared/global store, consistent
      with how this codebase already keeps each domain's in-memory state local to that domain.
  - description: |
      New `src/availability/auth.js` with two gates, copied from the existing per-domain
      duplicated-auth convention (no shared auth module exists in this codebase — each domain
      keeps its own copy):
      `requireAuthenticatedUser` (client-asserted `x-user-id`, fails closed in production) copied
      from `src/jobs/auth.js`, used for the technician's own `GET/PUT /availability/me`.
      `requireDispatcherRole` (client-asserted `x-staff-role: dispatcher`, fails closed in
      production, 403 for any other role) copied from `src/repairRequests/auth.js`, used for the
      dispatcher-facing `GET /availability` roster read.
    files:
      - src/availability/auth.js
    rationale: |
      Keeps the same trust boundary already documented in `src/jobs/auth.js` and
      `src/repairRequests/auth.js` (self-asserted headers are not a production auth boundary;
      every route fails closed when `NODE_ENV === 'production'`) rather than inventing a new one.
  - description: |
      New `src/availability/routes.js`:
      ```js
      router.get('/me', requireAuthenticatedUser, (req, res, next) => { ... res.status(200).json(getAvailability(req.userId)); });
      router.put('/me', requireAuthenticatedUser, (req, res, next) => {
        if (typeof req.body.available !== 'boolean') {
          return res.status(400).json({ error: 'validation_error', fields: { available: 'available must be a boolean.' } });
        }
        res.status(200).json(setAvailability(req.userId, req.body.available));
      });
      router.get('/', requireDispatcherRole, (req, res, next) => { ... res.status(200).json(listAvailability()); });
      ```
      Mounted in `src/server.js` as `app.use('/availability', availabilityRouter);`, alongside
      the other domain routers (no `requestMetrics`, matching how `/jobs` is mounted today).
    files:
      - src/availability/routes.js
      - src/server.js
    rationale: |
      `GET/PUT /availability/me` is what AC1/AC2 exercise from the technician side; `GET
      /availability` is the dispatcher-facing roster read AC1/AC2 exercise from the dispatcher
      side (verified directly via API test since no dispatcher UI ships — see
      assumptions/review_focus).
  - description: |
      Add a minimal assignment mutation to the existing jobs domain so AC4 has something real to
      assert against: `assignJob(id, technicianId)` in `src/jobs/store.js`
      (`job.technicianId = technicianId; job.status = 'Assigned'; return job;`, `undefined` if
      the job id doesn't exist), a new `requireDispatcherRole` export added to `src/jobs/auth.js`
      (same copied pattern as `src/repairRequests/auth.js` / the new
      `src/availability/auth.js`), and a new route:
      ```js
      router.post('/:id/assign', requireDispatcherRole, (req, res, next) => {
        const technicianId = typeof req.body.technicianId === 'string' ? req.body.technicianId.trim() : '';
        if (!technicianId) {
          return res.status(400).json({ error: 'validation_error', fields: { technicianId: 'technicianId is required.' } });
        }
        const job = assignJob(req.params.id, technicianId);
        if (!job) return res.status(404).json({ error: 'job not found' });
        res.status(200).json(job);
      });
      ```
      This route never imports or queries `src/availability/store.js` — the absence of that
      check is the behavior AC4 requires, not an oversight.
    files:
      - src/jobs/store.js
      - src/jobs/auth.js
      - src/jobs/routes.js
    rationale: |
      The story's scope explicitly excludes "the dispatcher's assignment logic," so this is kept
      to the bare minimum needed to make "assignment succeeds without restriction" falsifiable —
      no matching rules, conflict checks, or notifications are added. See
      assumptions_or_open_questions for why this was judged necessary rather than skipped.
  - description: |
      Build the approved prototype's "My Availability" screen only
      (`.arc/designs/TEST-M1-STORY-207-design.html`, `data-name="My Availability"`) as
      `public/availability.html`, reusing `design-system/tokens.css` and
      `design-system/prototype-utils.css` exactly as `public/jobs.html` does. Structure/IDs taken
      directly from the prototype: `app-topbar` with brand "FieldOps" and a single active nav
      entry "Availability" (session-line "Signed in as Marcus Webb"); `#status-loading` skeleton
      → `#status-card-wrap` containing `.status-card` (`#status-icon`, `#status-heading`,
      `#status-sub`) and the `#avail-switch` (`role="switch"`, `.switch-track` / `.switch-knob`,
      `#switch-text-label`, `#switch-status-line`); `#save-error-banner` (role="alert") with
      `#save-retry-btn`; the "Your upcoming assignments" section with
      `#assignments-loading` / `#assignments-error` (+ `#assignments-retry-btn`) /
      `#assignments-empty` / `#assignments-list-wrap` > `#assignments-list` rendering
      `.assignment-item` rows (`.assignment-time`, `.assignment-customer`, `.assignment-address`,
      `.status-chip.status-assigned|status-accepted`); `#avail-live-region` (aria-live="polite").
      The prototype's "Reviewer tooling" demo-note panels and both "(internal preview)" dispatcher
      screens are NOT built — see assumptions_or_open_questions.
    files:
      - public/availability.html
    rationale: |
      Builds exactly the already-approved screen, nothing invented; mirrors how
      `public/jobs.html` is structured and linked.
  - description: |
      New `public/css/availability.css` containing only the page-specific rules from the
      prototype's third `<style>` block that apply to this screen (the rest — `.card`, `.btn`,
      `.input`, `.label`, `.app-topbar`, `.page`, etc. — already live in
      `design-system/prototype-utils.css`, exactly as `public/css/jobs.css` only carries its own
      page-specific rules today): `.status-card`/`.status-card-main`/`.status-icon` (+
      `.is-unavailable` variant), `.avail-switch-wrap`/`.avail-switch`/`.switch-track`/
      `.switch-knob`/`.switch-status-line` (including the `aria-checked="true"` selectors that
      move the knob and recolor the track), `.assignment-item`/`.assignment-main`/
      `.assignment-time`/`.assignment-customer`/`.assignment-address`, `.status-chip` +
      `.status-assigned`/`.status-accepted` (status is never color-only — icon + text label pairs
      with the chip, matching the prototype's own documented gap-note rationale), `.state-banner`,
      `.empty-state`, `.skeleton-block`/`@keyframes skeleton-pulse`, `.toast`, `.u-sr-only`, and
      `.page { max-width: 640px; }` to match the prototype's narrower single-column layout for
      this screen (overriding the 860px default).
    files:
      - public/css/availability.css
    rationale: |
      Keeps the same "tokens only, component classes mirror the prototype 1:1" approach already
      used by `public/css/jobs.css`; no new literal colors or an invented switch/toggle token are
      introduced, matching the prototype's own design-system-gap note.
  - description: |
      New `public/js/availability.js`, following the `initJobsApp(doc, api)` /
      `createDefaultApi()` pattern from `public/js/jobs.js`:
      ```js
      function initAvailabilityApp(doc, api) { ... }
      function createDefaultApi() {
        return {
          getStatus: () => fetch('/availability/me', { headers: { 'x-user-id': DEMO_TECHNICIAN_ID } })...,
          setStatus: (available) => fetch('/availability/me', { method: 'PUT', headers: {...}, body: JSON.stringify({ available }) })...,
          listAssignments: () => fetch('/jobs', { headers: { 'x-user-id': DEMO_TECHNICIAN_ID } })...,
        };
      }
      module.exports = { initAvailabilityApp, createDefaultApi };
      ```
      On init: show `#status-loading`, call `api.getStatus()`, render the status card/switch from
      the result, then call `api.listAssignments()` and render `#assignments-list` (reusing the
      existing `/jobs` endpoint — the same data AC3 must leave untouched). Switch click: disable
      the switch, set `#switch-status-line` to "Saving…", call `api.setStatus(!current)`; on
      success re-render the card/switch/toast and update `#avail-live-region`; on failure
      re-enable the switch, show `#save-error-banner`, and wire `#save-retry-btn` /
      `#assignments-retry-btn` to retry the same call. Assignment rendering never reads or
      depends on the switch's state, and toggling the switch never re-calls
      `api.listAssignments()` — this is what makes AC3 true by construction, matching the
      prototype's own behavior (`baseAssignments` is a fixed fixture, never touched by
      `toggleAvailability()`).
    files:
      - public/js/availability.js
    rationale: |
      Same structural pattern as `public/js/jobs.js` (loading/error/empty/success state
      switching, `aria-live` updates, a pure `init(doc, api)` function for testability), applied
      to this screen's two independent pieces of state (availability switch, assignments list).
tests:
  - |
    AC1 (API — technician toggles unavailable, dispatcher's view reflects it):
    ```js
    test('AC1: marking unavailable is reflected in the dispatcher roster view', async () => {
      await request(app).put('/availability/me').set('x-user-id', 'marcus-webb').send({ available: false });
      const res = await request(app).get('/availability').set('x-staff-role', 'dispatcher');
      expect(res.status).toBe(200);
      expect(res.body.find((r) => r.technicianId === 'marcus-webb')).toMatchObject({ available: false });
    });
    ```
  - |
    AC2 (API — technician toggles back available, dispatcher's view reflects it):
    ```js
    test('AC2: marking available again is reflected in the dispatcher roster view', async () => {
      await request(app).put('/availability/me').set('x-user-id', 'marcus-webb').send({ available: false });
      await request(app).put('/availability/me').set('x-user-id', 'marcus-webb').send({ available: true });
      const res = await request(app).get('/availability').set('x-staff-role', 'dispatcher');
      expect(res.body.find((r) => r.technicianId === 'marcus-webb')).toMatchObject({ available: true });
    });
    ```
  - |
    AC3 (API — existing assignments unchanged by a toggle over their period):
    ```js
    test('AC3: existing job assignments are unchanged when the technician marks unavailable', async () => {
      const before = await request(app).get('/jobs').set('x-user-id', 'marcus-webb');
      await request(app).put('/availability/me').set('x-user-id', 'marcus-webb').send({ available: false });
      const after = await request(app).get('/jobs').set('x-user-id', 'marcus-webb');
      expect(after.body).toEqual(before.body);
    });
    ```
  - |
    AC4 (API — assigning a new job to an unavailable technician succeeds without restriction):
    ```js
    test('AC4: a dispatcher can assign a new job to an unavailable technician', async () => {
      await request(app).put('/availability/me').set('x-user-id', 'dana-cole').send({ available: false });
      const res = await request(app).post('/jobs/JOB-9002/assign').set('x-staff-role', 'dispatcher').send({ technicianId: 'dana-cole' });
      expect(res.status).toBe(200);
      expect(res.body.technicianId).toBe('dana-cole');
    });
    ```
  - |
    AC1/AC2 (UI — the switch optimistically reflects each state after it saves):
    ```js
    test('AC1/AC2: clicking the switch flips the heading and aria-checked once the save resolves', async () => {
      const api = {
        getStatus: jest.fn().mockResolvedValue({ technicianId: 'marcus-webb', available: true, updatedAt: null }),
        setStatus: jest.fn().mockResolvedValue({ technicianId: 'marcus-webb', available: false, updatedAt: 'Just now' }),
        listAssignments: jest.fn().mockResolvedValue([]),
      };
      initAvailabilityApp(document, api);
      await flush();
      document.getElementById('avail-switch').click();
      await flush();
      expect(api.setStatus).toHaveBeenCalledWith(false);
      expect(document.getElementById('avail-switch').getAttribute('aria-checked')).toBe('false');
      expect(document.getElementById('status-heading').textContent).toMatch(/unavailable/i);
    });
    ```
  - |
    AC3 (UI — toggling the switch never re-fetches or alters the assignments list):
    ```js
    test('AC3: toggling availability does not reload or change the assignments list', async () => {
      const job = { id: 'JOB-1', customerName: 'Dana Whitfield', address: '1 Main St', scheduledStart: '2026-10-09T09:00:00', scheduledEnd: '2026-10-09T10:00:00', status: 'Assigned' };
      const api = {
        getStatus: jest.fn().mockResolvedValue({ technicianId: 'marcus-webb', available: true, updatedAt: null }),
        setStatus: jest.fn().mockResolvedValue({ technicianId: 'marcus-webb', available: false, updatedAt: 'Just now' }),
        listAssignments: jest.fn().mockResolvedValue([job]),
      };
      initAvailabilityApp(document, api);
      await flush();
      const before = document.getElementById('assignments-list').innerHTML;
      document.getElementById('avail-switch').click();
      await flush();
      expect(api.listAssignments).toHaveBeenCalledTimes(1);
      expect(document.getElementById('assignments-list').innerHTML).toBe(before);
    });
    ```
assumptions_or_open_questions:
  - |
    Mechanism is unsettled per the work item's own scope note. Following the already-approved
    prototype (which the work item says to build), this plan implements the "safest common
    denominator": a single on/off "available for new jobs" signal. Date-specific windows or
    recurring working hours are explicitly NOT designed in the prototype and are out of scope
    here; if business confirmation lands on one of those mechanisms, this switch becomes one more
    input alongside a schedule rather than being replaced (per the prototype's own gap note).
  - |
    AC4 needs a real job-assignment action to test against, and none existed anywhere in the
    codebase before this plan. Added the smallest possible `POST /jobs/:id/assign` (set
    `technicianId`/`status`, no availability check, no matching/notification logic) solely to make
    "assignment succeeds without restriction" falsifiable. This does touch `src/jobs/`, which is
    outside this story's nominal domain — flagging for explicit reviewer confirmation that this is
    the right minimal seam rather than, e.g., a hypothetical future "assign job" story being
    expected to add it instead.
  - |
    The prototype's two "(internal preview)" dispatcher screens (Team Availability, Assign Job)
    are, per the prototype's own comments, reviewer-only scaffolding that "ships with nothing in
    the real app," and the story's scope note excludes "the dispatcher's assignment logic." This
    plan therefore does not build any dispatcher-facing frontend; AC1/AC2's "dispatcher's view"
    and AC4 are verified directly against the `GET /availability` and `POST /jobs/:id/assign` APIs
    instead. Flagging in case the reviewer actually wants a minimal dispatcher page built.
  - |
    A technician with no availability record yet defaults to `available: true` — nothing in the
    story suggests a newly-seen technician should default to unavailable.
  - |
    Seeded technician ids (`marcus-webb`, `dana-cole`) reuse the ids already seeded in
    `src/jobs/store.js`, so a technician's availability and their assigned jobs correspond in
    tests and demo data.
package_dependencies: []
notes: |
  Read the full approved prototype at
  `.arc/designs/TEST-M1-STORY-207-design.html` before planning the UI scope above — its own
  inline comments (lines ~338-560) were treated as authoritative for what's in vs. out of scope
  for the shipped frontend (single on/off switch; dispatcher screens are reviewer-only preview
  scaffolding; status is always icon+label, never color alone, per the design-system gap note
  about missing semantic status colors).

  ```mermaid
  flowchart TD
    server[src/server.js]
    availRoutes[src/availability/routes.js]
    availAuth[src/availability/auth.js]
    availStore[src/availability/store.js]
    jobsRoutes[src/jobs/routes.js]
    jobsAuth[src/jobs/auth.js]
    jobsStore[src/jobs/store.js]
    availJs[public/js/availability.js]
    availHtml[public/availability.html]

    server --> availRoutes
    server --> jobsRoutes
    availRoutes --> availAuth
    availRoutes --> availStore
    jobsRoutes -->|new: requireDispatcherRole| jobsAuth
    jobsRoutes -->|new: assignJob, no availability check| jobsStore
    availJs -->|GET/PUT /availability/me| availRoutes
    availJs -->|GET /jobs, reused as-is for AC3| jobsRoutes
    availHtml --> availJs

    classDef touched fill:#f96,color:#000;
    class availRoutes,availAuth,availStore,jobsRoutes,jobsAuth,jobsStore,availJs,availHtml touched;
  ```
review_focus: |
  In scope: the technician's own availability toggle (`GET/PUT /availability/me`), a
  dispatcher-facing roster read (`GET /availability`), and the "My Availability" screen from the
  approved prototype. Out of scope (deliberately): any dispatcher-facing frontend (the
  prototype's dispatcher screens are reviewer-only scaffolding, not shipped), and any
  assignment/matching business logic beyond the bare `POST /jobs/:id/assign` mutation this plan
  adds. The riskiest/most unusual part of this change is that last point — `POST
  /jobs/:id/assign` is intentionally added with NO availability check at all; that absence is the
  behavior AC4 requires, not a gap to flag. A reviewer should instead check that this route stays
  that minimal (no matching rules, no notifications) rather than growing scope, and that nothing
  in `src/availability/` ever gets imported into the job-assignment path. Also worth confirming:
  whether adding this assign endpoint to `src/jobs/` at all is acceptable, versus treating AC4 as
  a documentation-only acceptance criterion pending a future dispatch story (see
  assumptions_or_open_questions).
