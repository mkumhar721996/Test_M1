summary: |
  Add a read-only "Stay history" section to the guest profile page (`public/guest-profiles.html`)
  that shows a loading indicator while fetching, an error state scoped to just that card if the
  Room & Reservation Management dependency is unavailable (leaving the rest of the profile fully
  usable), and a "No stay history yet" placeholder when a guest has no past stays — exactly as
  shown in the approved prototype at `.arc/designs/TEST-M1-STORY-130-design.html`. Since Room &
  Reservation Management has no real integration in this codebase yet, the backend adds a small
  `stayHistoryClient` seam that today always reports the dependency as unavailable (this is the
  literal, current truth), while the frontend still implements and unit-tests all three fetch
  outcomes (loading/error/empty, plus a not-yet-AC'd "populated" render used only once that
  dependency starts returning data) so the shell is "ready to be populated" per the story
  description without any further UI rework.

scope:
  - description: |
      Add `src/guests/stayHistoryClient.js`: a placeholder boundary to the (not yet built) Room &
      Reservation Management service. `fetchStayHistory(guestId)` always rejects with
      `StayHistoryUnavailableError` today, since that dependency doesn't exist in this codebase —
      this is the real, current behavior, not a stub for a future case.

      ```js
      class StayHistoryUnavailableError extends Error {
        constructor(message = 'Room & Reservation Management is not available') {
          super(message);
        }
      }

      async function fetchStayHistory(guestId) {
        throw new StayHistoryUnavailableError();
      }

      module.exports = { fetchStayHistory, StayHistoryUnavailableError };
      ```
    files:
      - src/guests/stayHistoryClient.js
    rationale: |
      Isolates the "dependency unavailable" behavior required by AC2/AC3 behind a seam that a
      future Room & Reservation Management integration story can swap the implementation of
      without touching the route or the frontend at all.

  - description: |
      Add `GET /guests/:id/stay-history` to `src/guests/routes.js`, guarded by the same
      `enforceFrontDeskRole` middleware already used on every other `/guests/:id...` route (401 no
      role, 403 non-front-desk role) for consistency with TEST-M1-STORY-126's role enforcement.
      404 if the guest doesn't exist; 502 `{ error: 'stay_history_unavailable' }` if
      `stayHistoryClient` throws `StayHistoryUnavailableError`; 200 `{ stays: [...] }` on success.

      ```js
      const stayHistoryClient = require('./stayHistoryClient');
      // ...
      router.get('/:id/stay-history', enforceFrontDeskRole, async (req, res, next) => {
        try {
          const guest = getGuest(req.params.id);
          if (!guest) {
            return res.status(404).json({ error: 'guest not found' });
          }
          const stays = await stayHistoryClient.fetchStayHistory(guest.id);
          res.status(200).json({ stays });
        } catch (err) {
          if (err instanceof stayHistoryClient.StayHistoryUnavailableError) {
            return res.status(502).json({ error: 'stay_history_unavailable' });
          }
          next(err);
        }
      });
      ```
    files:
      - src/guests/routes.js
    rationale: |
      Gives the frontend a real endpoint to call. Reuses the existing role-enforcement middleware
      rather than leaving a new guest route unprotected next to already-protected siblings.

  - description: |
      Add a "Stay history" card to `public/guest-profiles.html`, placed in `.layout-grid` right
      after the Contact & preferences view/edit cards and before Booking history — matching the
      design's card content and copy exactly (card title "Stay history", subtitle "Synced from
      Room &amp; Reservation Management. Read-only.", a `stay-history-region` container with
      `aria-live="polite"` for the loading/error/empty/populated states to be rendered into by JS):

      ```html
      <div class="card">
        <div class="card-header-row">
          <h2 class="card-title" style="margin-bottom:0;">Stay history</h2>
        </div>
        <p class="card-subtitle">Synced from Room &amp; Reservation Management. Read-only.</p>
        <div id="stay-history-region" aria-live="polite"><!-- rendered by JS --></div>
      </div>
      ```

      The design's own "Prototype control" scenario-picker panel is explicitly prototype-only (its
      own comment says it "stands in for the real fetch, which staff never see") and is
      deliberately NOT carried into this markup.
    files:
      - public/guest-profiles.html
    rationale: |
      Placement after Contact & preferences mirrors the design screen's only visible ordering
      (Contact & preferences, then Stay history); the design has no Booking history/Audit trail
      cards to anchor against since it's a single-purpose prototype, so where those two fit
      relative to the new card is this plan's own placement call, flagged as an assumption below.

  - description: |
      Add render + fetch-orchestration logic to `public/js/guest-profiles.js`, wired into
      `openProfileFromGuest` (the single place both the directory-row click-through and the
      lookup-by-ID flow already funnel through, so both paths get the loading/error/empty
      handling for free):

      ```js
      let stayHistoryRequestId = 0;

      function renderStayHistoryLoading() { /* spinner caption + 3 skeleton rows, per design */ }
      function renderStayHistoryError() { /* error-state + Retry button, per design copy */ }
      function renderStayHistoryEmpty() { /* empty-state, "No stay history yet", per design copy */ }
      function renderStayHistorySuccess(stays) { /* stay-table, per design's "Populated" reference state */ }

      function loadStayHistory(guestId) {
        const requestId = ++stayHistoryRequestId;
        renderStayHistoryLoading();
        return api.getStayHistory(guestId).then((stays) => {
          if (requestId !== stayHistoryRequestId) return; // a newer profile open superseded this fetch
          if (stays.length === 0) renderStayHistoryEmpty();
          else renderStayHistorySuccess(stays);
        }).catch(() => {
          if (requestId !== stayHistoryRequestId) return;
          renderStayHistoryError();
        });
      }
      ```

      `openProfileFromGuest(guest)` calls `loadStayHistory(guest.id)` after (not awaiting)
      `renderProfileView(guest)`, so the rest of the profile renders and is interactive
      immediately regardless of how the stay-history fetch resolves (AC3). The error state's
      "Retry" button calls `loadStayHistory(currentGuest.id)` again, matching the design's retry
      behavior. `createDefaultApi()` gains:

      ```js
      getStayHistory: (id) => fetch(`/guests/${id}/stay-history`, { headers: { 'x-staff-role': 'front_desk' } })
        .then((res) => (res.ok ? res.json() : Promise.reject({ status: res.status })))
        .then((body) => body.stays),
      ```
    files:
      - public/js/guest-profiles.js
    rationale: |
      The `stayHistoryRequestId` guard mirrors the defensive pattern already present in the
      approved prototype's own script (`if (currentScenario !== scenario) return;`) — without it,
      opening guest A then quickly opening guest B could let guest A's late-resolving fetch
      overwrite guest B's stay-history card. This isn't covered by a named AC, so it isn't
      separately tested, but omitting it would leave an obvious bug the design itself already
      guards against.

  - description: |
      Add CSS to `public/css/guest-profiles.css` for the new states, taking colors/spacing
      directly from the design's tokens: `.card-subtitle` (font-size-sm, color-fg-muted,
      margin `0 0 var(--space-3) 0`), `.loading-caption` + `.spinner` + `@keyframes spin` (14px
      spinner, 2px border, `border-top-color: var(--color-primary)`, reduced-motion fallback of
      static `opacity: 0.9`), a `.stay-history-skeleton-row` (4-column grid skeleton row, distinct
      name from the pre-existing `.skeleton-row`/`.skeleton-bar` table-row-skeleton classes to
      avoid colliding with their `<tr>`-based layout), `.stay-table`/`.stay-table-scroll`/
      `.confirmation-code` for the populated state, and scoped overrides
      (`#stay-history-region .error-state`, `#stay-history-region .empty-state`) for the smaller
      `font-size-md` heading and the error state's dashed border that the design uses for this
      nested-in-a-card context — scoped rather than edited globally so the existing full-page
      `.empty-state`/`.not-found-panel` (font-size-lg, no border) used on the guest directory
      screen are untouched. Also tightens `.card-header-row`'s `margin-bottom` from
      `var(--space-3)` to the design's `var(--space-1)` — safe because that class is currently
      unused anywhere in `guest-profiles.html`.
    files:
      - public/css/guest-profiles.css
    rationale: |
      Reusing the existing `.skeleton-row`/`.skeleton-bar` class names as-is (design's version is
      `display: grid` on the row) would have broken the pre-existing directory-table loading-row
      CSS, which targets a `<tr>`. New, distinctly-named classes avoid that regression while still
      matching the design's visual result for this card.

  - description: |
      Test-first: extend `test/guest-profiles.test.js` with the three UI-behavior tests below
      (see `tests`), and add a `createDefaultApi` test mirroring the existing `get()` header test:

      ```js
      test('getStayHistory() sends the x-staff-role header', async () => {
        global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ stays: [] }) });
        const { createDefaultApi } = require('../public/js/guest-profiles');
        await createDefaultApi().getStayHistory('gst_1');
        expect(global.fetch).toHaveBeenCalledWith(
          '/guests/gst_1/stay-history',
          expect.objectContaining({ headers: expect.objectContaining({ 'x-staff-role': 'front_desk' }) })
        );
      });
      ```
    files:
      - test/guest-profiles.test.js
    rationale: |
      Matches this file's existing convention of injecting a mock `api` object into
      `initGuestProfilesApp` rather than hitting the real network layer.

  - description: |
      Test-first: add `test/guests-stay-history.test.js` covering the route's status codes and
      its interaction with role enforcement and the guest store (see `tests`).
    files:
      - test/guests-stay-history.test.js
    rationale: |
      Follows the existing pattern in `test/guests.test.js` / `test/guests-role-enforcement.test.js`
      of hitting the real Express app via `supertest`.

  - description: |
      Test-first: add `test/stay-history-client.test.js` asserting `fetchStayHistory` rejects with
      `StayHistoryUnavailableError` — pinning down today's real (not simulated) behavior of the
      dependency seam so a future integration story can't silently change this contract without a
      failing test pointing at it.
    files:
      - test/stay-history-client.test.js
    rationale: ""

tests:
  - |
    AC1 (loading indicator): in `test/guest-profiles.test.js`, mock `api.getStayHistory` with a
    promise that doesn't resolve immediately, open the profile, flush microtasks, and assert the
    loading copy is showing before resolving:
    ```js
    const api = {
      get: jest.fn().mockResolvedValue(guest),
      getStayHistory: jest.fn(() => new Promise((resolve) => { resolveStayHistory = resolve; })),
    };
    // ...open profile, flush microtasks...
    expect(document.getElementById('stay-history-region').textContent).toContain('Loading stay history');
    ```
  - |
    AC2 + AC3 (error confined to the section; rest of profile stays functional): mock
    `api.getStayHistory` to reject, open the profile, flush microtasks, and assert both the
    error copy and that unrelated profile actions still work:
    ```js
    const api = { get: jest.fn().mockResolvedValue(guest), getStayHistory: jest.fn().mockRejectedValue({ status: 502 }) };
    // ...open profile, flush microtasks...
    expect(document.getElementById('stay-history-region').textContent).toContain('Stay history unavailable');
    expect(document.getElementById('kv-list').textContent).toContain(guest.email);
    document.getElementById('edit-profile-btn').click();
    expect(document.getElementById('details-edit-mode').hidden).toBe(false);
    ```
  - |
    AC4 (empty placeholder): mock `api.getStayHistory` to resolve `[]`, open the profile, flush
    microtasks, and assert the exact placeholder copy:
    ```js
    const api = { get: jest.fn().mockResolvedValue(guest), getStayHistory: jest.fn().mockResolvedValue([]) };
    // ...open profile, flush microtasks...
    expect(document.getElementById('stay-history-region').textContent).toContain('No stay history yet');
    ```
  - |
    Backend support for AC2/AC3 — `test/guests-stay-history.test.js`:
    ```js
    test('AC2/AC3: responds 502 when the dependency is unavailable, without mutating the guest record', async () => {
      const guest = seedGuest();
      const res = await request(app).get(`/guests/${guest.id}/stay-history`).set('x-staff-role', 'front_desk');
      expect(res.status).toBe(502);
      expect(res.body).toEqual({ error: 'stay_history_unavailable' });
      expect(guestsStore.getGuest(guest.id)).toMatchObject({ name: 'Stay Guest' });
    });
    test('unknown guest id returns 404', async () => {
      const res = await request(app).get('/guests/does-not-exist/stay-history').set('x-staff-role', 'front_desk');
      expect(res.status).toBe(404);
    });
    test('a non-front-desk role gets 403', async () => {
      const guest = seedGuest();
      const res = await request(app).get(`/guests/${guest.id}/stay-history`).set('x-staff-role', 'housekeeping');
      expect(res.status).toBe(403);
    });
    ```
  - |
    Dependency-seam contract — `test/stay-history-client.test.js`:
    ```js
    test('fetchStayHistory currently always rejects because Room & Reservation Management has no integration yet', async () => {
      const { fetchStayHistory, StayHistoryUnavailableError } = require('../src/guests/stayHistoryClient');
      await expect(fetchStayHistory('gst_1')).rejects.toBeInstanceOf(StayHistoryUnavailableError);
    });
    ```

assumptions_or_open_questions:
  - |
    Design/AC tension worth flagging explicitly: the prototype's own comment says its scenario
    picker "stands in for the real fetch, which staff never see," implying a real fetch that can
    genuinely succeed today. But Room & Reservation Management has no integration anywhere in
    this codebase — the epic description itself says this shell is "ready to be populated once
    Room & Reservation Management exposes the data," i.e. it isn't populated yet. This plan
    resolves the tension by making `stayHistoryClient.fetchStayHistory` honestly always reject
    for now (so AC2/AC3 are the only outcomes reachable through the real HTTP path today), while
    still fully implementing and unit-testing the empty (AC4) and populated render paths against
    a mocked `api.getStayHistory` so no further UI work is needed once a real integration ships.
  - |
    Card placement: the design screen only shows Contact & preferences followed by Stay history
    (it has no Booking history/Audit trail cards to anchor against). This plan places the new
    Stay history card between Contact & preferences and Booking history in the real page's
    `.layout-grid`. A reviewer with a different preferred ordering should say so.
  - |
    The populated ("has past stays") render path and its table markup are implemented per the
    design's own "Populated" reference screen, but that screen is explicitly labeled "Design
    baseline — data shape for a future integration story," not covered by any AC. It's included
    here only because `loadStayHistory`'s success branch needs *some* non-empty handling to be
    complete, not as new in-scope functionality — it is not separately tested beyond what AC4
    already requires of the empty branch.
  - |
    Assumed the new route should carry the same `enforceFrontDeskRole` gate as every sibling
    `/guests/:id...` route for consistency with TEST-M1-STORY-126, even though no AC in this
    story mentions access control. Flagging in case front-desk-only access wasn't intended to
    extend to this new route.

package_dependencies: []

notes: |
  Read `.arc/designs/TEST-M1-STORY-130-design.html` in full, including its fixture data, both
  screens ("Guest Profile" interactive + "Reference States"), and its script's render functions
  (`renderLoading`/`renderError`/`renderEmpty`/`renderSuccess` and the `loadStayHistory` scenario
  dispatcher) — the frontend implementation plan above mirrors that script's structure and copy
  verbatim (including the exact error/empty copy strings and the skeleton/spinner markup), minus
  the prototype-only scenario-picker panel, which its own comment marks as not part of the real
  product.

  ```mermaid
  flowchart TD
    classDef touched fill:#f96,color:#000

    guestProfileHtml["public/guest-profiles.html<br/>+ Stay history card"]:::touched
    guestProfileJs["public/js/guest-profiles.js<br/>openProfileFromGuest, loadStayHistory,<br/>createDefaultApi.getStayHistory"]:::touched
    guestProfileCss["public/css/guest-profiles.css<br/>+ loading/error/empty/table styles"]:::touched
    routes["src/guests/routes.js<br/>+ GET /:id/stay-history"]:::touched
    client["src/guests/stayHistoryClient.js<br/>fetchStayHistory (always rejects today)"]:::touched
    store["src/guests/store.js<br/>getGuest (existing, unchanged)"]
    server["src/server.js<br/>mounts guestsRouter (unchanged)"]

    guestProfileHtml -->|renders into| guestProfileJs
    guestProfileJs -->|styled by| guestProfileCss
    guestProfileJs -->|"fetch('/guests/:id/stay-history')"| routes
    routes -->|"getGuest(id) — 404 if missing"| store
    routes -->|"fetchStayHistory(id) — 502 on StayHistoryUnavailableError"| client
    server --> routes
  ```

review_focus: |
  In scope: the Stay history card's loading/error/empty rendering, the new
  `GET /guests/:id/stay-history` route and its `stayHistoryClient` seam, and their tests. Out of
  scope: any real Room & Reservation Management integration (deliberately not built — the client
  always rejects today) and the "populated" table's visual polish (implemented from the design's
  own baseline but not AC-driven or separately tested). Riskiest area: the
  `stayHistoryRequestId` race-guard in `loadStayHistory` — it's untested directly (no AC calls for
  it) but exists to stop a stale fetch for a previously-viewed guest from overwriting the
  currently-viewed guest's card; don't flag its absence of a dedicated test as a gap without
  reading why it's there. Also note the new route intentionally reuses `enforceFrontDeskRole`
  even though no AC in this story mentions role access — treat that as a deliberate consistency
  choice with the sibling routes, not scope creep.
