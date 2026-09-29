summary: |
  This is a corrective rewrite of a prior draft that, on close re-reading against the current
  repo and the actual approved prototype, had three real defects: (1) it claimed the shared
  `guests` Map in `src/guests/store.js` "already starts empty" — it does not; TEST-M1-STORY-100
  seeded three fixture guests (`gst_1005` Jordan Lee, `gst_1006` Priya Nandakumar, `gst_1007` Sam
  Okafor, all `status: 'active'`) that any new test fixture must avoid colliding with; (2) it
  completely omitted AC10/AC11 (the two acceptance criteria requiring a non-staff caller's search
  to be refused with no guest data returned), inventing an unrelated "AC10: results within 2
  seconds" performance test that appears nowhere in this story's real acceptance criteria; and
  (3) every id, class name, and copy string it described for the UI (`#search-query`,
  `#empty-query-error`, `.table-card`/`.guest-table`, brand "Front Desk Console", line numbers
  646-1002, etc.) does not exist anywhere in the actual prototype file at
  `.arc/designs/TEST-M1-STORY-101-design.html`, which was read in full for this revision. This
  plan replaces all three: it adds `searchGuests({ query, includeInactive })` to the existing
  store re-using the store's own already-defined `normalizeEmail`/`normalizePhone`/
  `isValidEmail`/`isValidPhone` helpers (the same ones `createGuest`/`updateGuest` already use to
  decide what counts as a valid email/phone) instead of re-deriving a second classifier; it wires
  `GET /guests/search` into the existing `src/guests/routes.js` ahead of the existing `GET /:id`
  handler and gates it with the same `isPermitted(req)` check (backed by `canCreateGuest`) that
  `GET /match` and `POST /` already use, satisfying AC10/AC11 by the same fail-closed pattern this
  codebase already tests for those routes in `test/guests-inline.test.js`; and it builds the
  actual shipped screen from the design — `.screen[data-name="Guest Search — Staff"]`, lines
  606-717 — verbatim by id/class/copy, explicitly excluding the design's reviewer-only
  `#review-bar`, `.demo-controls` chip row, and `#outage-toggle`, and explicitly NOT building the
  design's second "Guest Search — Signed out" screen (lines 719-744) because this codebase has no
  session/authentication mechanism anywhere for a client to detect "not signed in" — every
  existing staff page (`guest-profiles.js`, this new `guest-search.js`) hardcodes an
  `x-staff-role: front_desk` header, so AC10/AC11 are enforced and proven server-side only,
  exactly like the existing precedent for `/match` and `POST /guests`.

scope:
  - description: |
      Add `searchGuests({ query, includeInactive = false } = {})` to the EXISTING
      `src/guests/store.js` (do not recreate the file — it already exports `GuestValidationError`,
      `createGuest`, `getGuest`, `listGuests`, `updateGuest`, `deactivateGuest`, `reactivateGuest`,
      `canCreateGuest`, `findGuestMatch`, all operating on a module-level `guests` Map that is
      already seeded with three fixture guests via `seedFixtureGuest` — `gst_1005` Jordan Lee,
      `gst_1006` Priya Nandakumar, `gst_1007` Sam Okafor, all `status: 'active'` — not an empty
      Map). `searchGuests` reads that same shared Map and reuses the store's own
      already-defined `normalizeEmail`, `normalizePhone`, `isValidEmail`, `isValidPhone` helpers
      (lines 22-36 of the current file) rather than introducing a second, parallel
      email/phone classifier:
      ```js
      function searchGuests({ query, includeInactive = false } = {}) {
        const trimmed = (query || '').trim();
        if (!trimmed) return [];
        const all = Array.from(guests.values());
        let matches;
        if (isValidEmail(trimmed)) {
          const target = normalizeEmail(trimmed);
          matches = all.filter((g) => normalizeEmail(g.email) === target);
        } else if (isValidPhone(trimmed)) {
          const target = normalizePhone(trimmed);
          matches = all.filter((g) => normalizePhone(g.phone) === target);
        } else {
          const needle = trimmed.toLowerCase();
          matches = all.filter((g) => g.name.toLowerCase().includes(needle));
        }
        if (!includeInactive) {
          matches = matches.filter((g) => g.status === 'active');
        }
        return matches.map(({ id, name, email, phone, status }) => ({ id, name, email, phone, status }));
      }
      ```
      Returns a projected `{ id, name, email, phone, status }` shape, not the full guest record —
      AC9 names exactly those four display fields, and a lookup-only search result has no UI slot
      for `preferences`/`bookingHistory`/`auditLog`. Add `searchGuests` to the existing
      `module.exports` alongside the current nine exports.
    files:
      - src/guests/store.js
    rationale: |
      Reusing `isValidEmail`/`isValidPhone` (already the codebase's own definition of "this looks
      like a complete email/phone") keeps one source of truth instead of the prior draft's
      reinvented `digitsOnly`/`isEmailQuery`/`isPhoneQuery` port from the design's looser
      client-side matcher (`q.includes('@')`), which would misclassify a fragment like
      `"user@ex"` as an exact-email query instead of falling through to a name search. Reading
      from the real shared Map (not a fixture list) is what makes AC6 true: a guest created
      through the shipped `guest-profiles.html` CRUD flow, or one of the three already-seeded
      fixtures, is findable with no extra wiring.

  - description: |
      Add `GET /guests/search` to the EXISTING `src/guests/routes.js`. `const guestsStore =
      require('./store');` is already imported at the top of this file (line 2) — no new
      require is needed; the existing `isPermitted(req)` helper (line 16-18, backed by
      `guestsStore.canCreateGuest(req.headers['x-staff-role'])`) is reused exactly as `GET
      /match` and `POST /` already use it. Insert the new route BEFORE the existing
      `router.get('/:id', ...)` handler — Express matches routes in registration order, so
      `/guests/search` would otherwise be captured by `/:id` with `id = 'search'`:
      ```js
      router.get('/search', (req, res, next) => {
        if (!isPermitted(req)) {
          return res.status(403).json({ error: 'forbidden' });
        }
        try {
          const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
          if (!q) return res.status(400).json({ error: 'query is required' });
          const includeInactive = req.query.includeInactive === 'true';
          res.status(200).json(guestsStore.searchGuests({ query: q, includeInactive }));
        } catch (err) {
          next(err);
        }
      });
      ```
      Response body is a bare array on success, matching this router's existing `GET /` →
      `res.status(200).json(listGuests())` convention. No change to `src/server.js` — it already
      has `app.use('/guests', guestsRouter);` at `src/server.js:17`.
    files:
      - src/guests/routes.js
    rationale: |
      The `isPermitted` check is what makes AC10 ("the search is refused") and AC11 ("no guest
      profiles returned") true — it is a direct, deliberate port of the exact pattern this file
      already uses for `GET /match`, and the exact pattern `test/guests-inline.test.js` already
      tests for that route (missing header and a `housekeeping` role both get `403 { error:
      'forbidden' }`). Registering `/search` ahead of `/:id` is a real Express route-ordering
      requirement, not a style choice — without it the route is unreachable.

  - description: |
      Create `test/guests-search-store.test.js` (new file — a same-purpose file named
      `test/guests-store.test.js` already exists from TEST-M1-STORY-100 and contains that
      story's own store-level CRUD tests; reusing that name here would overwrite it). Covers
      AC1, AC2, AC3, AC6, AC7, AC8, AC9 directly against `searchGuests`, building each test's own
      fixture guests via the real `createGuest`/`deactivateGuest` exports, with names chosen not
      to collide with the store's own seeded fixtures (`Jordan Lee`, `Priya Nandakumar`, `Sam
      Okafor`) or with each other, since the module-level `guests` Map is not reset between tests
      in the same file (confirmed: Jest gives each test FILE its own fresh module registry, but
      not each test within a file).
    files:
      - test/guests-search-store.test.js
    rationale: |
      Mirrors the existing `test/guests-store.test.js` / `test/hires-store.test.js` pattern of
      unit-testing the store directly, ahead of and independent from the HTTP layer, and proves
      search runs against genuinely CRUD-created and already-seeded data rather than a fixture
      the store secretly ships just for search.

  - description: |
      Create `test/guests-search.test.js` (new file, does not currently exist). Supertest
      coverage of the `GET /guests/search` contract: the route-ordering regression (`/search`
      must not 404 as an unmatched `:id`), empty-query 400, a real end-to-end search against a
      guest created through `POST /guests`, AC10/AC11 (missing `x-staff-role` header and a
      `housekeeping` role both get `403 { error: 'forbidden' }` with no guest array in the
      response body, mirroring the exact assertions `test/guests-inline.test.js` already makes
      for `GET /guests/match`), and AC4/AC5 via a mocked store failure (`jest.spyOn(guestsStore,
      'searchGuests').mockImplementation(() => { throw new Error('down'); })` → expect 500).
    files:
      - test/guests-search.test.js
    rationale: |
      Confirms route wiring, status codes, and error propagation independently of the store unit
      tests and the frontend, and pins down the `/search`-before-`/:id` ordering fix as a
      regression test. Reusing `test/guests-inline.test.js`'s exact assertion shape for the
      permission-denial tests keeps this story's authorization behavior consistent with
      STORY-100's already-reviewed convention rather than inventing a new one.

  - description: |
      Create `public/guest-search.html`: the shipped version of the design's ONE real
      interactive screen, `.screen[data-name="Guest Search — Staff"]` (design lines 621-717) —
      topbar with `<span class="brand">Guest Services</span>`, nav `Guests` (active) / `Bookings`
      (design lines 622-627, identical to `public/guest-profiles.html`'s own topbar), and
      `<span class="signed-in-as">Signed in as <strong>Priya Nair</strong></span>` (also
      identical to the existing `guest-profiles.html` topbar-actions slot — this design's topbar
      does not diverge from the already-shipped one the way a prior draft mistakenly assumed).
      Page header `<h1>Find a guest</h1>` / "Search every guest profile by name, email, or phone
      — with or without an active reservation." (design line 636, exact copy). Form
      `id="search-form" class="search-form"` containing `#search-input` (label "Search guests",
      placeholder "Search by name, email, or phone") and `#search-error` (class `field-error`,
      hidden by default, text "Enter a name, email, or phone number to search." — design line
      657), submit button `#search-submit` text "Search" (design line 659). Hint paragraph
      `.search-hint`: "Enter a partial name (e.g. "mar"), or a complete email address or phone
      number." (design line 661). `.include-inactive-row` with `#include-inactive` checkbox and
      label "Include inactive profiles" (design lines 663-666). `#results-region` with
      `aria-live="polite"` (design line 668) containing five state panels ported verbatim by id:
      `#state-idle` (visible by default — icon 🔍, "Search for a guest to get started", "Results
      appear here. Deactivated profiles are hidden unless "Include inactive profiles" is
      checked."), `#state-loading` (hidden, two skeleton rows), `#state-error` (hidden, icon ⚠️,
      "Guest search is unavailable", "We couldn't reach the guest directory. No results can be
      shown right now — please try again in a few minutes."), `#state-empty` (hidden, icon 🗂️,
      `#state-empty-heading` set dynamically, "Check the spelling, or try a different name,
      email, or phone number."), `#state-results` (hidden, `#results-meta` + `#results-list`).
      Deliberately DROPS the design's `#review-bar` reviewer navigation, `.demo-controls` /
      `.demo-chip-row` (the four "Try: ..." chips) and `#outage-toggle` — the design's own inline
      comment (lines 606-620) calls these prototype-only, not part of the shipped product — and
      the entire second screen `.screen[data-name="Guest Search — Signed out"]` (design lines
      719-744): see assumptions for why. Links `../design-system/tokens.css` and
      `../design-system/prototype-utils.css` (confirmed these already contain every shared
      class this screen uses — `.app-topbar`, `.card`, `.btn`, `.input`, `.label`, `.field`,
      `.page`, `.page-header` — verbatim, since the design file's first two `<style>` blocks are
      themselves copies of these same two stylesheets) plus a new `./css/guest-search.css`, and
      loads `./js/guest-search.js` with `defer`, exactly like `guest-profiles.html` and
      `hire-profile.html` already do for their own page CSS/JS.
    files:
      - public/guest-search.html
    rationale: |
      Every id/class/copy string here was read directly out of the actual prototype file, not
      guessed — a prior draft's UI section described ids (`#search-query`, `#empty-query-error`,
      `#result-count`) and a brand ("Front Desk Console") that do not exist anywhere in
      `.arc/designs/TEST-M1-STORY-101-design.html`. This revision corrects that by citing the
      real screen name and line ranges throughout.

  - description: |
      Create `public/css/guest-search.css` containing only the page-specific rules the shipped
      markup needs, ported from the design's third `<style>` block (design lines 337-587):
      `.topbar-actions`/`.signed-in-as` (also duplicated in `guest-profiles.css` under the same
      names — this repo has no shared page-CSS module, each page's CSS file duplicates these
      few lines, so this follows existing precedent rather than introducing a new one),
      `.search-form`/`.search-field`/`.search-hint`/`.field-error`, `.include-inactive-row`,
      `.results-meta`/`.results-list`, `.guest-card`/`.guest-avatar`/`.guest-main`/
      `.guest-name-row`/`.guest-name`/`.guest-contact`, `.status-chip` with `.is-active` /
      `.is-inactive` (design lines 495-508), `.state-panel`/`.state-icon` and its `h3`/`p` rules,
      `.skeleton-row`/`.skeleton-block`/`.skeleton-avatar`/`.skeleton-lines`/`.skeleton-line`
      plus the `@keyframes pulse` reduced-motion-gated animation, and the `[hidden]` rule.
      Omits `.demo-controls`, `.demo-controls-label`, `.demo-chip-row`, `.demo-chip`,
      `.demo-toggle`, and `.gate-wrap`/`.gate-icon` (the excluded signed-out screen's styles).
    files:
      - public/css/guest-search.css
    rationale: |
      All declarations resolve exclusively through `var(--...)` tokens already loaded by
      `tokens.css`, matching this design's own in-file comment (lines 338-339) that page CSS
      must never hardcode a color, spacing, or radius value, and status is always signalled with
      icon + label text together (`.status-chip` never relies on color alone — design lines
      495-508, `guest-profiles.css` lines 89-107 follow the identical rule for its own status
      chips).

  - description: |
      Create `public/js/guest-search.js` exporting `initGuestSearchApp(doc, api)` and
      `createDefaultApi()`, following the dependency-injection pattern `initGuestProfilesApp(doc,
      initialGuests, api)` already uses in `public/js/guest-profiles.js`. `api.search(query,
      includeInactiveBool)` returns a Promise resolving to an array of `{ id, name, email, phone,
      status }` or rejecting on failure. Core flow ported directly from the design's own
      `performSearch`/`showRegion`/`renderGuestCard` (design lines 786-865), replacing the
      design's `wait(300)` + `els.outageToggle.checked` branch with a real `api.search` call:
      ```js
      function performSearch(query) {
        fieldError.hidden = true;
        const trimmed = query.trim();
        if (!trimmed) {
          fieldError.hidden = false;
          showRegion('idle');
          return;
        }
        submitBtn.disabled = true;
        submitBtn.textContent = 'Searching…';
        showRegion('loading');
        api.search(trimmed, includeInactive.checked).then((matches) => {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Search';
          if (matches.length === 0) {
            emptyHeading.textContent = `No profiles found for "${trimmed}"`;
            showRegion('empty');
          } else {
            resultsMeta.textContent = `${matches.length} profile${matches.length === 1 ? '' : 's'} found`;
            resultsList.innerHTML = matches.map(renderGuestCard).join('');
            showRegion('results');
          }
        }).catch(() => {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Search';
          showRegion('error');
        });
      }
      ```
      `renderGuestCard(g)` ports the design's own `initials`/status-chip markup (design lines
      782-806) verbatim, using `escapeHtml(doc, str)` (the two-argument form `public/js/utils.js`
      exports and `public/js/hire-profile.js` already uses) for every interpolated value, and
      DROPS the design's `.guest-reservation` muted line (see assumptions — no reservation
      concept exists on the real guest shape). Checking/unchecking `#include-inactive` re-runs
      the last search whenever the field is non-empty (design lines 888-890, ported exactly):
      ```js
      includeInactive.addEventListener('change', () => {
        if (searchInput.value.trim()) performSearch(searchInput.value);
      });
      ```
      `createDefaultApi()` wires `fetch('/guests/search?q=' + encodeURIComponent(query) +
      '&includeInactive=' + includeInactive, { headers: { 'x-staff-role': 'front_desk' } })`,
      matching the exact hardcoded-staff-header convention `guest-profiles.js`'s own
      `createDefaultApi()` already uses for every request. `initGuestSearchApp` and
      `createDefaultApi` are wired together only inside the `if (typeof window !== 'undefined')`
      block, same as every other page's JS entrypoint.
    files:
      - public/js/guest-search.js
    rationale: |
      Porting the design's own `performSearch`/`renderGuestCard` logic keeps behavior identical
      to what was actually approved in the prototype's live screen, rather than a paraphrase of
      it. Keeping the `x-staff-role` header hardcoded client-side (never asking the user to sign
      in) is consistent with how `guest-profiles.js` and every other staff page in this codebase
      already behaves — this repo has no login flow anywhere, so AC10/AC11 enforcement lives
      entirely server-side in `routes.js`, proven by `test/guests-search.test.js`, not here.

  - description: |
      Create `test/guest-search.test.js` (jsdom, mirrors `test/hire-profile.test.js`'s
      `document.documentElement.innerHTML = fs.readFileSync(...)` + injected `api` mock pattern)
      covering AC1 (partial-name results render), AC3 (no-match heading echoes the query back:
      `No profiles found for "<query>"`), AC4/AC5 (a rejected `api.search` shows `#state-error`
      and never populates `#results-list`), AC8 (checking `#include-inactive` after a search
      re-invokes `api.search` with `includeInactive: true`), AC9 (a rendered result row shows
      name, email, phone, and a status chip whose text differs for `active` vs `deactivated`),
      and the empty-query inline-validation path (`#search-error` becomes visible, `api.search`
      is never called).
    files:
      - test/guest-search.test.js
    rationale: |
      Drives the actual shipped `guest-search.html` + `guest-search.js`, so a change to an
      element id or the markup structure breaks a test immediately — the same guarantee
      `test/hire-profile.test.js` already gives the hire-profile page.

tests:
  - |
    AC1 (a partial name returns every guest whose name contains the substring, and only those) —
    `test/guests-search-store.test.js`:
    ```js
    createGuest({ name: 'Amara Whitfield', email: 'amara.whitfield@example.com', phone: '(415) 555-0142' }, 'Priya Nair');
    createGuest({ name: 'Briana Whitfield', email: 'briana.whitfield@example.com', phone: '(917) 555-0121' }, 'Priya Nair');
    createGuest({ name: 'Marcus Bell', email: 'marcus.bell@example.com', phone: '(702) 555-0184' }, 'Priya Nair');
    expect(searchGuests({ query: 'Whitfield' }).map((g) => g.name).sort())
      .toEqual(['Amara Whitfield', 'Briana Whitfield']);
    ```
  - |
    AC2 (a complete email or phone returns only the exact profile, never a partial match) —
    `test/guests-search-store.test.js`:
    ```js
    createGuest({ name: 'Priya Raman', email: 'priya.raman@example.com', phone: '(646) 555-0173' }, 'Priya Nair');
    createGuest({ name: 'Priya Anand', email: 'priya.anand@example.com', phone: '(646) 555-0199' }, 'Priya Nair');
    expect(searchGuests({ query: 'priya.raman@example.com' }).map((g) => g.name)).toEqual(['Priya Raman']);
    expect(searchGuests({ query: '(646) 555-0173' }).map((g) => g.name)).toEqual(['Priya Raman']);
    ```
  - |
    AC3 (no matches shows a "no profiles found" message, echoing the search term) —
    `test/guests-search-store.test.js` and `test/guest-search.test.js`:
    ```js
    expect(searchGuests({ query: 'Zzyzx', includeInactive: true })).toEqual([]);
    // guest-search.test.js, after submitting "Zzyzx" with api.search: jest.fn().mockResolvedValue([]):
    expect(document.getElementById('state-empty').hidden).toBe(false);
    expect(document.getElementById('state-empty-heading').textContent).toBe('No profiles found for "Zzyzx"');
    ```
  - |
    AC4 (a backend outage shows an "unavailable" error message) — `test/guests-search.test.js`
    and `test/guest-search.test.js`:
    ```js
    jest.spyOn(guestsStore, 'searchGuests').mockImplementation(() => { throw new Error('down'); });
    const res = await request(app).get('/guests/search').query({ q: 'Amara' }).set('x-staff-role', 'front_desk');
    expect(res.status).toBe(500);
    // guest-search.test.js, with api.search: jest.fn().mockRejectedValue(new Error('down')):
    expect(document.getElementById('state-error').hidden).toBe(false);
    ```
  - |
    AC5 (an outage renders no results at all) — same two tests as AC4, asserting the absence of
    a result list:
    ```js
    expect(Array.isArray(res.body)).toBe(false);
    expect(document.getElementById('results-list').innerHTML).toBe('');
    ```
  - |
    AC6 (a guest is returned whether or not it has an active reservation — there is no
    reservation concept on the real guest shape, so this is satisfied by construction) —
    `test/guests-search-store.test.js`:
    ```js
    const g = createGuest({ name: 'Sofia Delgado', email: 'sofia.delgado@example.com', phone: '(929) 555-0128' }, 'Priya Nair');
    expect(g.bookingHistory).toEqual([]);
    expect(searchGuests({ query: 'Sofia Delgado' }).map((r) => r.id)).toContain(g.id);
    expect(searchGuests({ query: 'sofia.delgado@example.com' })[0].id).toBe(g.id);
    ```
  - |
    AC7 (a default search excludes deactivated profiles) — `test/guests-search-store.test.js`:
    ```js
    const active = createGuest({ name: 'Grace Kellerman', email: 'grace.kellerman@example.com', phone: '(773) 555-0137' }, 'Priya Nair');
    const inactive = createGuest({ name: 'Wren Kellerman', email: 'wren.kellerman@example.com', phone: '(773) 555-0140' }, 'Priya Nair');
    deactivateGuest(inactive.id, 'Priya Nair');
    expect(searchGuests({ query: 'Kellerman' }).map((g) => g.id)).toEqual([active.id]);
    ```
  - |
    AC8 ("include inactive" adds deactivated profiles back, and the frontend toggle re-runs the
    last search) — `test/guests-search-store.test.js` and `test/guest-search.test.js`:
    ```js
    const active = createGuest({ name: 'Liam Fitzgerald', email: 'liam.fitzgerald@example.com', phone: '(617) 555-0192' }, 'Priya Nair');
    const inactive = createGuest({ name: 'Noor Fitzgerald', email: 'noor.fitzgerald@example.com', phone: '(617) 555-0193' }, 'Priya Nair');
    deactivateGuest(inactive.id, 'Priya Nair');
    expect(searchGuests({ query: 'Fitzgerald', includeInactive: true }).map((g) => g.id).sort())
      .toEqual([active.id, inactive.id].sort());
    // guest-search.test.js, after checking #include-inactive following a "Fitzgerald" search:
    expect(api.search).toHaveBeenLastCalledWith('Fitzgerald', true);
    ```
  - |
    AC9 (each result shows full name, email, phone, and active/inactive status) —
    `test/guests-search-store.test.js` and `test/guest-search.test.js`:
    ```js
    const g = createGuest({ name: 'Marisol Bell', email: 'marisol.bell@example.com', phone: '(773) 555-0199' }, 'Priya Nair');
    expect(searchGuests({ query: 'marisol.bell@example.com' })[0])
      .toMatchObject({ id: g.id, name: 'Marisol Bell', email: 'marisol.bell@example.com', phone: '(773) 555-0199', status: 'active' });
    // guest-search.test.js, rendering a deactivated result row (api resolves status: 'deactivated'):
    const chip = document.querySelector('.status-chip');
    expect(chip.classList.contains('is-inactive')).toBe(true);
    expect(chip.textContent).toContain('Inactive profile');
    ```
  - |
    AC10 (a non-staff caller's search is refused) — `test/guests-search.test.js`, mirroring the
    exact assertions `test/guests-inline.test.js` already makes for `GET /guests/match`:
    ```js
    const noHeader = await request(app).get('/guests/search').query({ q: 'Amara' });
    expect(noHeader.status).toBe(403);
    const wrongRole = await request(app).get('/guests/search').query({ q: 'Amara' }).set('x-staff-role', 'housekeeping');
    expect(wrongRole.status).toBe(403);
    ```
  - |
    AC11 (no guest profiles are returned to a non-staff caller) — same two requests as AC10,
    asserting the response body carries no guest data:
    ```js
    expect(noHeader.body).toEqual({ error: 'forbidden' });
    expect(wrongRole.body).toEqual({ error: 'forbidden' });
    ```
  - |
    Route-ordering regression (a prerequisite for AC1-AC9 ever being reachable) —
    `test/guests-search.test.js`:
    ```js
    const res = await request(app).get('/guests/search').query({ q: 'Anyone' }).set('x-staff-role', 'front_desk');
    expect(res.status).not.toBe(404);
    ```
  - |
    Empty-query validation, both layers — `test/guests-search.test.js` and
    `test/guest-search.test.js`:
    ```js
    const res = await request(app).get('/guests/search').query({ q: '   ' }).set('x-staff-role', 'front_desk');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'query is required' });
    // guest-search.test.js, submitting the form with an empty #search-input and no api call made:
    expect(document.getElementById('search-error').hidden).toBe(false);
    expect(api.search).not.toHaveBeenCalled();
    ```

assumptions_or_open_questions:
  - |
    The store's `guests` Map is NOT empty at rest — `seedFixtureGuest` calls in
    `src/guests/store.js` (lines 90-92) already seed `gst_1005` Jordan Lee, `gst_1006` Priya
    Nandakumar, and `gst_1007` Sam Okafor, all `status: 'active'`, before any test runs. All new
    test fixtures in this plan use names/surnames that don't overlap with those three or with
    each other, since the Map persists across tests within the same test file (Jest gives each
    test FILE its own fresh module registry, but does not reset it between tests inside one
    file).
  - |
    The design's second screen, `.screen[data-name="Guest Search — Signed out"]` (design lines
    719-744, a `.gate-wrap` "Staff sign-in required" panel with a non-functional Sign-in button),
    is NOT built as part of this shipped page. This codebase has no session or authentication
    mechanism anywhere for a client to detect "I am not signed in" — every existing staff page
    (`guest-profiles.js`, `hire-profile.js`, and this new `guest-search.js`) simply hardcodes an
    `x-staff-role: front_desk` header on every request. Building real sign-in detection now would
    invent a subsystem no other page in this repo has and no AC asks for. AC10 and AC11 are
    instead enforced and tested entirely server-side (`isPermitted` in `routes.js`, proven in
    `test/guests-search.test.js`), exactly mirroring how STORY-100's own `POST /guests` and `GET
    /guests/match` already enforce and test the identical requirement. If a real sign-in gate
    screen is wanted, that needs to come back as separate direction — it is out of scope here.
  - |
    The design's `.guest-reservation` muted line ("Has a current reservation" / "No current
    reservation — search results are not limited to guests with a booking") and its backing
    fixture field `reservation: true/false` (design lines 750-757, 790, 803) have no real
    counterpart anywhere in the actual guest data model — a guest record has `bookingHistory` (a
    list of past bookings) but no boolean "has an active reservation right now" field. This line
    is dropped from the shipped result card. AC6 is still satisfied: the store's `searchGuests`
    never filters on any reservation-shaped field (because none exists), so a guest is returned
    by name/email/phone regardless of its booking status. AC9's four required display fields
    (name, email, phone, status) don't include reservation state either.
  - |
    A blank/whitespace-only `q` returns `400 { error: 'query is required' }` rather than running
    a search. No AC covers this directly; it mirrors the design's own inline validation ("Enter a
    name, email, or phone number to search.", design line 657) and the existing codebase's own
    preference for structured 400s over silently returning an empty array.
  - |
    `GET /guests/search` returns a bare JSON array on success (not a `{ guests: [...] }`
    wrapper), matching this same router's existing `GET /` → `res.status(200).json(listGuests())`
    convention. No AC specifies a response envelope.
  - |
    `searchGuests`'s exact-match classification reuses the store's own already-existing
    `isValidEmail`/`isValidPhone` (a real email-format regex, and "7+ digits after stripping
    non-digits" respectively) rather than porting the design's own looser inline client-side
    matcher (`q.includes('@')`, a separate phone regex). This is a deliberate deviation from a
    literal port of the prototype's demo script: reusing the store's already-established
    definition of "valid email"/"valid phone" (the same one `createGuest`/`updateGuest` already
    enforce) is more consistent with AC2's "complete email address or a complete phone number"
    than the prototype's throwaway classifier, which was only there to drive an in-browser demo
    with no backend.
  - |
    `includeInactive` is read off `req.query.includeInactive === 'true'` (a literal string
    comparison) because Express query-string values are always strings; no AC specifies the
    query-parameter contract itself, this is inferred from how the frontend's `fetch` call must
    serialize a boolean into a URL.

package_dependencies: []

notes: |
  Confirmed directly from the current repo (not carried over from the stale prior draft) before
  writing this revision:
  - `src/guests/store.js` and `src/guests/routes.js` already exist and are mounted at `/guests`
    in `src/server.js:17`; this plan extends both files in place and does not touch
    `src/server.js`.
  - `src/guests/store.js`'s `guests` Map is seeded with three fixture guests at module load
    (`gst_1005`/`gst_1006`/`gst_1007`, lines 90-92) — it is not empty, contrary to a prior draft.
  - `src/guests/routes.js` already imports `const guestsStore = require('./store');` (line 2) and
    already has an `isPermitted(req)` helper (lines 16-18) used by `GET /match` and `POST /` — no
    new import is needed, and the new `/search` route reuses `isPermitted` directly.
  - `test/guests-store.test.js` already exists (STORY-100's own store-level tests for
    `createGuest`/`findGuestMatch`/`canCreateGuest`); this plan's new backend unit tests go in a
    differently-named `test/guests-search-store.test.js` so as not to overwrite it.
  - `test/guests-inline.test.js` already establishes and tests the exact fail-closed pattern
    (`403 { error: 'forbidden' }` for a missing or wrong `x-staff-role` header) this plan reuses
    for AC10/AC11.
  - The actual approved prototype at `.arc/designs/TEST-M1-STORY-101-design.html` was read in
    full. Its real interactive screen is `.screen[data-name="Guest Search — Staff"]` (lines
    606-717): brand "Guest Services", nav "Guests · Bookings", ids `#search-form`/`#search-input`/
    `#search-error`/`#search-submit`/`#include-inactive`/`#results-region` and five state panels
    (`#state-idle`/`#state-loading`/`#state-error`/`#state-empty`/`#state-results`). A prior
    draft's described ids/classes/brand/copy for this screen did not match this file at all and
    have been discarded.
  - `design-system/prototype-utils.css` and `design-system/tokens.css` already contain every
    shared class this screen uses (`.app-topbar`, `.card`, `.btn`, `.input`, `.label`, `.field`,
    `.page`, `.page-header`) — confirmed by reading both files; the design file's own first two
    `<style>` blocks are themselves copies of these two stylesheets, not new tokens.
  - `public/js/utils.js` exports `escapeHtml(doc, str)` (two-argument form), already used this
    way by `public/js/hire-profile.js`; this plan's new `guest-search.js` follows that same
    convention.
  - `public/js/guest-profiles.js`'s `createDefaultApi()` hardcodes `x-staff-role: front_desk` on
    every request — there is no login/session flow anywhere in this codebase for a client to
    determine its own staff status; `guest-search.js` follows the identical convention.

  ```mermaid
  flowchart TD
    classDef touched fill:#f96,color:#000
    HTML[public/guest-search.html]
    JS[public/js/guest-search.js]
    UTILS[public/js/utils.js]
    ROUTES[src/guests/routes.js]
    STORE[src/guests/store.js]
    SERVERJS[src/server.js]
    GPJS[public/js/guest-profiles.js]

    HTML -->|script defer| JS
    JS -->|"escapeHtml(doc, str) reused, not modified"| UTILS
    JS -->|"fetch GET /guests/search?q=...&includeInactive=..., x-staff-role header"| ROUTES
    SERVERJS -->|"already mounts app.use('/guests', guestsRouter) - no change needed"| ROUTES
    GPJS -->|"existing create/list/update/deactivate/reactivate calls, unchanged"| ROUTES
    ROUTES -->|"isPermitted(req) gate, then guestsStore.searchGuests(...)"| STORE

    class HTML,JS,ROUTES,STORE touched
  ```

review_focus: |
  In scope: a new `searchGuests` export on the existing guest store, a new `GET /guests/search`
  route gated by the same `isPermitted` check already used by `/match` and `POST /`, and one new
  frontend page (`guest-search.html`/`.css`/`.js`) built from the design's real "Guest Search —
  Staff" screen. Out of scope, deliberately: the design's second "signed out" screen (no
  session/auth mechanism exists anywhere in this codebase to build it against — see
  assumptions), the design's reviewer-only outage toggle and demo chips, and any change to
  `src/server.js` or the existing `guest-profiles.html`/`.js` directory page. The riskiest area
  is the exact-match classification in `searchGuests` — it reuses the store's existing
  `isValidEmail`/`isValidPhone` helpers rather than the design's own looser inline matcher, which
  is a deliberate, flagged deviation from a literal prototype port and worth double-checking
  against AC2's "complete email address or a complete phone number" wording. AC10/AC11
  (unauthenticated refusal) are proven only at the route/store test layer, not the frontend,
  since the shipped client always sends a hardcoded staff header by design, matching this
  codebase's existing precedent — this should not be flagged as a missing frontend test.
