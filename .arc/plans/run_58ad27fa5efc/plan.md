summary: |
  Implements read-only list and detail viewing for already-logged defects (story TEST-M1-STORY-195),
  building the already-approved `.arc/designs/TEST-M1-STORY-195-design.html` prototype on top of the
  existing `public/defects.html` / `public/js/defects.js` / `public/css/defects.css` trio and the
  `src/defects` module shipped by story 194 (Log a Defect). This introduces, for the first time in
  this codebase, two concepts the design requires but that don't exist yet: an authenticated-user
  gate on reading defects (AC4) and project membership as a visibility boundary (AC5, AC9). Both are
  added at the smallest scope that satisfies the acceptance criteria — a header-based auth check
  mirroring the existing `x-staff-role` convention used by rooms/guests/leave/runs, and a minimal
  `src/projects/store.js` membership lookup, not a full projects feature. The list becomes
  server-paginated (AC6) and sorted by `updatedAt` descending (AC5); "live" updates (AC3) are done via
  client-side polling of the existing GET endpoints, since there is no push/websocket infrastructure
  anywhere in this app. An id that doesn't exist and an id that exists but belongs to a project the
  caller isn't a member of return the identical 404 shape, so the detail view can't be used to probe
  for other projects' defects (AC8 + AC9 together, matching the design's explicit intent).

scope:
  - description: |
      Add the smallest possible project-membership store: create a project, add a member, and look
      up which project ids a given user belongs to. This is a brand-new concept in this codebase
      (confirmed: no existing "project" module anywhere) — it is scoped to exactly what AC5/AC9 need,
      not a projects CRUD feature.
    files:
      - src/projects/store.js
    rationale: |
      AC9 requires that only defects in projects the signed-in user is a member of are ever visible,
      and AC5 requires sorting across every project the user belongs to. Both need a place to ask
      "which projects is this user in," which does not exist today.

  - description: |
      Add a `requireAuthenticatedUser` middleware that reads an `x-user-id` request header; absent
      header -> `401 { error: 'unauthorized' }` with no body data, matching the existing pattern in
      `src/leave/auth.js` / `src/runs/auth.js` (role header -> 401 if missing) but keyed on identity
      rather than role, since list/detail visibility depends on *who* is asking, not what they're
      allowed to do.
    files:
      - src/defects/auth.js
    rationale: |
      AC4 requires that an unauthenticated request never receives defect data. This codebase has no
      session/login system anywhere (confirmed via grep for auth/session/JWT patterns) — every
      existing authorization check in this repo is a request header checked by middleware, so this
      follows the same shape rather than inventing a new mechanism.

  - description: |
      Extend the defect record with `projectId` (optional on create, defaults to `''` for
      backward compatibility with story 194's existing create flow, which has no project field),
      `updatedAt` (full ISO timestamp) and `updatedBy`. Add `updateDefect(id, changes)` (bumps
      `updatedAt`) for use by future edit/status-transition stories and by this story's own tests to
      simulate "updated elsewhere." Change `listDefects()` to sort by `updatedAt` descending instead
      of insertion-order reverse.
    files:
      - src/defects/store.js
    rationale: |
      AC2 requires every logged detail to be shown, including project; AC3/AC5 require an
      updated-at-driven sort and a way for "elsewhere" updates to be reflected. `updateDefect` is not
      exposed over HTTP by this plan — editing/status transitions belong to a separate, not-yet-built
      story in the Defect Tracking & Lifecycle epic — but the store function is needed so tests can
      simulate a concurrent update without inventing a PATCH contract this story doesn't own.
    
  - description: |
      Wire `requireAuthenticatedUser` onto `GET /` and `GET /:id`. `GET /` filters defects to those
      with no `projectId` ("unassigned", visible to everyone — see assumptions) or a `projectId` the
      caller is a member of, paginates at a fixed page size of 5 (matching the design's
      `PAGE_SIZE = 5`), and returns
      `{ items, page, pageSize, totalItems, totalPages }` instead of a bare array. `GET /:id` applies
      the identical membership check and returns `404 { error: 'defect not found' }` — the same shape
      used for a genuinely nonexistent id — when the defect exists but belongs to a project the
      caller isn't a member of.
    files:
      - src/defects/routes.js
    rationale: |
      This is where auth (AC4), pagination (AC6), ordering (AC5) and project-scoped visibility
      (AC9) actually get enforced server-side — the one place a client can't bypass it.

  - description: |
      Add `x-user-id: 'test-user'` to this file's two existing unauthenticated `GET` calls so they
      keep passing once `GET /defects` and `GET /defects/:id` require authentication. No other
      change — story 194's create/validation behavior is untouched.
    files:
      - test/defects.test.js
    rationale: |
      These tests currently call the GET endpoints with no headers and expect 200; that contract
      changes under AC4, so the existing coverage needs to reflect the new requirement rather than
      silently start failing.

  - description: |
      New backend test file covering all 9 ACs at the HTTP/store layer: id/title/status on every
      row (AC1), full field set on detail (AC2), a store-level update is served on the very next
      read (AC3's server half), 401 with no leaked data when unauthenticated (AC4), newest-updated
      first ordering across member projects (AC5), pagination at page size 5 (AC6), an empty
      `items` array when a member's projects have no defects (AC7), 404 for a nonexistent id (AC8),
      and identical 404 for an id in a non-member project plus exclusion from the list (AC9).
    files:
      - test/defects-view.test.js
    rationale: |
      Pins the exact response shapes (`items`/`page`/`pageSize`/`totalItems`/`totalPages`,
      `{error:'defect not found'}`, `{error:'unauthorized'}`) before the route/store code is written.

  - description: |
      Add the list screen's loading skeleton (`#list-loading`), error banner (`#list-error` /
      `#list-retry`), a "sign in to view defects" message block (`#list-signed-out`, reusing the
      existing `.empty-state` markup pattern with a lock icon, since this app has no real sign-in
      screen to route to — see assumptions), the success container already present
      (`#defect-list`), and pagination controls (`#list-pagination`). Add the detail screen's
      loading skeleton (`#detail-loading`), error banner (`#detail-error` / `#detail-retry`),
      not-found block (`#detail-not-found`, with the design's exact copy "That defect doesn't
      exist, or it isn't in a project you belong to."), a matching `#detail-signed-out` block, and
      extend the existing success block with a `Project` field and "Reported by … / Last updated
      by …" meta lines, taken directly from the design's `.detail-grid`/`.detail-meta-line`
      structure.
    files:
      - public/defects.html
    rationale: |
      These are the concrete elements the approved design shows for every list/detail state
      (loading, error, empty, not-found, success, pagination) that don't exist in the current
      194-era markup, which only has a success state and a bare empty-state.

  - description: |
      Port the matching rules from the design's embedded `<style>` block verbatim (token-only, no
      new literal colors, matching this file's existing "Design-system gap note" comment):
      `.skeleton-row`/`.skeleton-block`/`@keyframes skeleton-pulse`, `.state-banner`, `.pagination`/
      `.pagination-status`, `.not-found-state`, `.detail-meta-line`, `.defect-row-updated`, and the
      `.defect-row.just-updated` / `@keyframes row-flash` highlight the design uses to call out a
      row that just changed.
    files:
      - public/css/defects.css
    rationale: |
      Every one of these classes is referenced by the markup added above and is already proven out,
      token-only, and accessible (status never color-only) in the approved design — reusing it
      exactly avoids inventing new visual language.

  - description: |
      Rewrite the list/detail logic to be state-driven and server-backed instead of working off a
      synchronously-passed array: `initDefectsApp(doc, api)` (drops the `initialDefects` parameter)
      now calls `api.list(page)` / `api.get(id)` itself, shows the loading skeleton immediately, and
      renders loading/error/empty/signed-out/success based on the result. Add hash-based routing
      (`#/defects` and `#/defects/:id`) so a defect's detail view can be opened directly, matching
      the design's deep-linking. Add a single `setInterval(poll, POLL_INTERVAL_MS)` (exported as
      `POLL_INTERVAL_MS`) that silently re-fetches whichever of list/detail is currently on screen
      and re-renders in place — this is AC3's "without any manual refresh step." Update the
      create-defect flow to refresh the list from the server (instead of a local `unshift`) after a
      successful POST, then jump to the new defect's detail view. `createDefaultApi()` gains a
      `get(id)` method, a `list(page)` that includes `?page=`, and attaches a hardcoded
      `x-user-id` header to every request (this app has no real signed-in-user concept yet — see
      assumptions).
    files:
      - public/js/defects.js
    rationale: |
      This is the behavioral core of AC1/AC2/AC3/AC4/AC6/AC7/AC8 on the client: what renders, when,
      and how it stays current without a manual refresh.

  - description: |
      Update the 3 existing story-194 UI tests to the new `initDefectsApp(doc, api)` signature:
      supply `api.list` resolving to the new paginated shape and await the initial load before
      asserting, since the module now fetches its own data on init rather than receiving it as an
      argument.
    files:
      - test/defects-ui.test.js
    rationale: |
      These tests currently call `initDefectsApp(document, [], api)` synchronously with no
      `api.list`; that contract no longer exists once list data is server-driven.

  - description: |
      New frontend jsdom test file covering: id/title/status per row (AC1), a row's status
      changing after a simulated poll tick with no function call standing in for "the user hit
      refresh" (AC3), a 401 from `api.list`/`api.get` showing the sign-in message with zero
      rendered rows (AC4), pagination controls calling `api.list` with the next/previous page and
      disabling at the ends (AC6), the empty-state message when `items` is `[]` (AC7), and the
      "Defect not found" message rendering inside the detail screen's layout for both a 404 from a
      bad id and a 404 from a non-member-project id, since the client can't tell them apart (AC8 +
      AC9).
    files:
      - test/defects-list-detail-ui.test.js
    rationale: |
      Pins the exact DOM-visible behavior for every state the design specifies, independent of the
      backend tests which pin the HTTP contract.

tests:
  - |
    AC1 + AC5 (backend): every row in a member project's list carries id/title/status and the
    newest-`updatedAt` defect sorts first.
    ```js
    test('AC1/AC5: list shows id, title, status for every member-project defect, newest-updated first', async () => {
      const project = projectsStore.createProject('Checkout Experience');
      projectsStore.addMember(project.id, 'dana');
      const older = defectsStore.createDefect({ title: 'Older bug', projectId: project.id });
      const newer = defectsStore.createDefect({ title: 'Newer bug', projectId: project.id });
      defectsStore.updateDefect(newer.id, { status: 'In Progress' });
      const res = await request(app).get('/defects').set('x-user-id', 'dana');
      expect(res.status).toBe(200);
      expect(res.body.items.map((d) => d.id)).toEqual([newer.id, older.id]);
      expect(res.body.items[0]).toMatchObject({ id: newer.id, title: 'Newer bug', status: 'In Progress' });
    });
    ```
  - |
    AC2 (backend): detail view returns every logged field plus current status, including the
    resolved project name.
    ```js
    test('AC2: detail view returns every logged field plus current status', async () => {
      const project = projectsStore.createProject('Search & Discovery');
      projectsStore.addMember(project.id, 'dana');
      const defect = defectsStore.createDefect({
        title: 'Bug', description: 'Desc', steps: 'Steps', environment: 'Env',
        severity: 'High', reportedBy: 'Priya Nair', projectId: project.id,
      });
      const res = await request(app).get(`/defects/${defect.id}`).set('x-user-id', 'dana');
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        id: defect.id, title: 'Bug', description: 'Desc', steps: 'Steps',
        environment: 'Env', severity: 'High', status: 'New', projectName: 'Search & Discovery',
      });
    });
    ```
  - |
    AC3 (backend half — the server always serves the latest state; the "no manual refresh"
    requirement is pinned by the frontend polling test below).
    ```js
    test('AC3: a change made after the view was first loaded is served on the very next read', async () => {
      const project = projectsStore.createProject('Checkout Experience');
      projectsStore.addMember(project.id, 'dana');
      const defect = defectsStore.createDefect({ title: 'Bug', projectId: project.id });
      await request(app).get(`/defects/${defect.id}`).set('x-user-id', 'dana');
      defectsStore.updateDefect(defect.id, { status: 'Closed' });
      const res = await request(app).get(`/defects/${defect.id}`).set('x-user-id', 'dana');
      expect(res.body.status).toBe('Closed');
    });
    ```
  - |
    AC4 (backend): no `x-user-id` header is rejected and leaks nothing.
    ```js
    test('AC4: no x-user-id header returns 401 and leaks no defect data', async () => {
      const project = projectsStore.createProject('Checkout Experience');
      projectsStore.addMember(project.id, 'dana');
      const defect = defectsStore.createDefect({ title: 'Secret bug', projectId: project.id });
      const listRes = await request(app).get('/defects');
      expect(listRes.status).toBe(401);
      expect(listRes.body).toEqual({ error: 'unauthorized' });
      const detailRes = await request(app).get(`/defects/${defect.id}`);
      expect(detailRes.status).toBe(401);
      expect(JSON.stringify(detailRes.body)).not.toContain('Secret bug');
    });
    ```
  - |
    AC6 (backend): pagination splits results at a fixed page size of 5.
    ```js
    test('AC6: pagination splits results across pages of 5', async () => {
      const project = projectsStore.createProject('Checkout Experience');
      projectsStore.addMember(project.id, 'dana');
      for (let i = 0; i < 7; i += 1) defectsStore.createDefect({ title: `Bug ${i}`, projectId: project.id });
      const page1 = await request(app).get('/defects?page=1').set('x-user-id', 'dana');
      expect(page1.body.items).toHaveLength(5);
      expect(page1.body.totalPages).toBe(2);
      const page2 = await request(app).get('/defects?page=2').set('x-user-id', 'dana');
      expect(page2.body.items).toHaveLength(2);
    });
    ```
  - |
    AC7 (backend): a member of projects with zero defects gets an explicit empty result.
    ```js
    test('AC7: a member of a project with no defects gets an empty items array', async () => {
      const project = projectsStore.createProject('Empty Project');
      projectsStore.addMember(project.id, 'casey');
      const res = await request(app).get('/defects').set('x-user-id', 'casey');
      expect(res.body).toEqual({ items: [], page: 1, pageSize: 5, totalItems: 0, totalPages: 1 });
    });
    ```
  - |
    AC8 (backend): a nonexistent id 404s.
    ```js
    test('AC8: an id that does not correspond to any defect returns 404', async () => {
      const res = await request(app).get('/defects/DEF-does-not-exist').set('x-user-id', 'dana');
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'defect not found' });
    });
    ```
  - |
    AC9 (backend): a defect in a non-member project is excluded from the list and 404s identically
    to a nonexistent id in the detail view.
    ```js
    test('AC9: a non-member-project defect is excluded from the list and indistinguishable from not-found in detail', async () => {
      const memberProject = projectsStore.createProject('Checkout Experience');
      const otherProject = projectsStore.createProject('Mobile App');
      projectsStore.addMember(memberProject.id, 'dana');
      const hidden = defectsStore.createDefect({ title: 'Mobile-only bug', projectId: otherProject.id });
      const listRes = await request(app).get('/defects').set('x-user-id', 'dana');
      expect(listRes.body.items.find((d) => d.id === hidden.id)).toBeUndefined();
      const detailRes = await request(app).get(`/defects/${hidden.id}`).set('x-user-id', 'dana');
      expect(detailRes.status).toBe(404);
      expect(detailRes.body).toEqual({ error: 'defect not found' });
    });
    ```
  - |
    AC1 (frontend): each rendered row shows id, title and status.
    ```js
    test('AC1: each row shows id, title and status', async () => {
      const api = { list: jest.fn().mockResolvedValue({
        items: [{ id: 'DEF-1046', title: 'Payment bug', status: 'In Progress', updatedAt: '2026-10-07T09:12:00Z', projectName: 'Checkout Experience' }],
        page: 1, pageSize: 5, totalItems: 1, totalPages: 1,
      }) };
      initDefectsApp(document, api);
      await flush();
      const row = document.querySelector('.defect-row');
      expect(row.textContent).toContain('DEF-1046');
      expect(row.textContent).toContain('Payment bug');
      expect(row.textContent).toContain('In Progress');
    });
    ```
  - |
    AC3 (frontend): a status changed "elsewhere" shows up after the next poll tick with no manual
    refresh call.
    ```js
    test('AC3: a status change made elsewhere appears without any manual refresh step', async () => {
      jest.useFakeTimers();
      const api = { list: jest.fn()
        .mockResolvedValueOnce({ items: [{ id: 'DEF-1038', title: 'Email bug', status: 'In Progress', updatedAt: 't1' }], page: 1, pageSize: 5, totalItems: 1, totalPages: 1 })
        .mockResolvedValueOnce({ items: [{ id: 'DEF-1038', title: 'Email bug', status: 'Closed', updatedAt: 't2' }], page: 1, pageSize: 5, totalItems: 1, totalPages: 1 }) };
      initDefectsApp(document, api);
      await flushFakeTimers();
      expect(document.querySelector('.defect-row').textContent).toContain('In Progress');
      jest.advanceTimersByTime(POLL_INTERVAL_MS);
      await flushFakeTimers();
      expect(document.querySelector('.defect-row').textContent).toContain('Closed');
      jest.useRealTimers();
    });
    ```
  - |
    AC4 (frontend): a 401 shows the sign-in message with zero rendered rows.
    ```js
    test('AC4: a 401 from the API shows a sign-in message and no defect rows', async () => {
      const api = { list: jest.fn().mockRejectedValue({ status: 401, error: 'unauthorized' }) };
      initDefectsApp(document, api);
      await flush();
      expect(document.querySelectorAll('.defect-row')).toHaveLength(0);
      expect(document.getElementById('list-signed-out').hidden).toBe(false);
    });
    ```
  - |
    AC6 (frontend): pagination controls call `api.list` with the next page and disable at the ends.
    ```js
    test('AC6: pagination controls move between pages', async () => {
      const api = { list: jest.fn()
        .mockResolvedValueOnce({ items: makeItems(5), page: 1, pageSize: 5, totalItems: 7, totalPages: 2 })
        .mockResolvedValueOnce({ items: makeItems(2), page: 2, pageSize: 5, totalItems: 7, totalPages: 2 }) };
      initDefectsApp(document, api);
      await flush();
      document.getElementById('pg-next').click();
      await flush();
      expect(api.list).toHaveBeenLastCalledWith(2);
      expect(document.querySelector('.pagination-status').textContent).toBe('Page 2 of 2');
      expect(document.getElementById('pg-next').disabled).toBe(true);
    });
    ```
  - |
    AC7 (frontend): an empty result shows the explicit empty-state message.
    ```js
    test('AC7: no defects for any member project shows an explicit empty-state message', async () => {
      const api = { list: jest.fn().mockResolvedValue({ items: [], page: 1, pageSize: 5, totalItems: 0, totalPages: 1 }) };
      initDefectsApp(document, api);
      await flush();
      expect(document.getElementById('defect-list-empty').hidden).toBe(false);
    });
    ```
  - |
    AC8 + AC9 (frontend): a 404 for a bad id, and a 404 for a non-member-project id, both render
    "Defect not found" inside the detail layout — the client can't and shouldn't distinguish them.
    ```js
    test("AC8/AC9: a defect id the API 404s on shows 'Defect not found' inside the detail layout", async () => {
      const api = {
        list: jest.fn().mockResolvedValue({ items: [], page: 1, pageSize: 5, totalItems: 0, totalPages: 1 }),
        get: jest.fn().mockRejectedValue({ status: 404, error: 'defect not found' }),
      };
      initDefectsApp(document, api);
      window.location.hash = '#/defects/DEF-9999';
      await flush();
      expect(document.getElementById('detail-not-found').hidden).toBe(false);
      expect(document.getElementById('detail-not-found').textContent).toContain('Defect not found');
    });
    ```

assumptions_or_open_questions:
  - |
    This codebase has no real authentication/session system anywhere (confirmed by grep: every
    existing check is a request header read by middleware — `x-staff-role` for rooms/guests/leave/
    runs). AC4 is enforced the same way, via a new `x-user-id` header checked by
    `requireAuthenticatedUser`. The approved design's full "Signed Out" screen with a working "Sign
    in" button is explicitly reviewer scaffolding per the design file's own comment ("'Sign in' is
    reviewer scaffolding... in the real app this would be the product's actual sign-in flow"), so
    this plan does not build a real sign-in flow — the frontend shows the design's lock-icon
    message text when a request is denied, without a functioning button. Flagging this as a gap for
    product/eng: there's no real login anywhere yet to wire a "Sign in" action to.
  - |
    Project membership is entirely new (no existing "project" module in this codebase). The
    `src/projects/store.js` added here is the smallest store that satisfies AC5/AC9 (create project,
    add member, list a user's member project ids) — it is not a projects feature/CRUD API, and
    provisioning real projects/memberships for production use is left to a future story.
  - |
    Story 194's "Log a Defect" form has no project field in its approved design, so a defect created
    through it has no way to be assigned to a project. To avoid breaking that shipped behavior, a
    defect with no `projectId` is treated as visible to every authenticated user ("unassigned");
    only a defect explicitly created with a `projectId` is restricted to that project's members.
    Flagging for product: a project-selection step on the Log a Defect form is a likely necessary
    follow-up once this ships.
  - |
    AC3's "without any manual refresh step" is implemented as client-side polling (fixed interval,
    chosen as 5 seconds = `POLL_INTERVAL_MS`) against the existing GET endpoints — there is no
    websocket/SSE/push infrastructure anywhere in this app, and building one felt disproportionate
    to a read-only viewing story. The interval value is an engineering choice, not specified by any
    AC or the design.
  - |
    Pagination page size is fixed at 5 (server-enforced, no query override), matching the approved
    design's embedded fixture script (`const PAGE_SIZE = 5;`) — the design has no page-size control,
    so none is added.
  - |
    The 404 body is deliberately identical for "no such defect" and "exists but in a non-member
    project" (`{ error: 'defect not found' }` in both cases) — this is the design's explicit intent
    (its reviewer notes say attempting a hidden "Mobile App" defect id "reads exactly like a
    nonexistent id"), satisfying AC8 and AC9 together without ever confirming a hidden defect's
    existence.
  - |
    Hash-based deep linking (`#/defects`, `#/defects/DEF-xxxx`) is added to the frontend router
    since the approved design relies on it for navigating directly to a defect's detail view, and
    it's the cleanest way to open a specific defect id for AC8/AC9 testing without requiring a list
    row click first.

package_dependencies: []

notes: |
  No new third-party packages are needed — `crypto.randomUUID()` (already used by `rooms`/`guests`
  stores), `express`, `supertest` and `jest`/jsdom are already in the project.

  ```mermaid
  flowchart TD
    html[public/defects.html] --> js[public/js/defects.js]
    js -->|"GET /defects?page=N, GET /defects/:id (+ polling)"| routes[src/defects/routes.js]
    server[src/server.js] -->|already mounts /defects| routes
    routes --> auth[src/defects/auth.js]
    routes --> dstore[src/defects/store.js]
    routes --> pstore[src/projects/store.js]

    classDef touched fill:#f96,color:#000
    class html,js,routes,auth,dstore,pstore touched
  ```

  `src/server.js` already mounts `defectsRouter` at `/defects` and needs no change — shown only to
  make the call direction clear. `routes.js` is the only module that talks to both stores; `dstore`
  and `pstore` stay independent of each other, matching the rest of this codebase's one-store-per-
  domain convention.

review_focus: |
  Scope is strictly read-only viewing: list + detail rendering, pagination, ordering,
  authentication-gated visibility, and project-membership-gated visibility. Out of scope and
  untouched: editing a defect, status transitions, search/filtering, comments/attachments, and any
  real login UI (the design's "Sign in" button is reviewer scaffolding, not shipped). The riskiest
  area is the AC8/AC9 interaction: a nonexistent id and a real id from a project the caller can't
  see must return byte-identical 404 responses, and it's easy to accidentally leak a distinguishing
  signal (a different message, a 403 instead of 404, a timing difference) — check that both paths
  in `src/defects/routes.js` go through the exact same "not visible" branch. The other non-obvious
  decision to hold this plan to rather than flag as a regression: defects with no `projectId`
  (everything created through story 194's existing form) are intentionally visible to all
  authenticated users rather than hidden by default, to avoid breaking already-shipped behavior.
