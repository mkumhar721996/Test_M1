summary: |
  Today `GET /guests` (src/guests/store.js `listGuests`/src/guests/routes.js) returns every guest
  regardless of status, and the guest directory frontend (public/js/guest-profiles.js) renders and
  searches whatever array it was handed with no status filter at all — so a deactivated guest
  currently shows up in the default directory and in search results, and there is no "refresh"
  affordance at all. Direct ID lookup (`GET /guests/:id` and the profile screen's deactivated
  banner) already ignores status and already renders a full deactivated profile, so AC3 is already
  satisfied by existing behavior from TEST-M1-STORY-100 — this plan adds a regression test to lock
  that in rather than changing it. The approved prototype
  (.arc/designs/TEST-M1-STORY-128-design.html) demonstrates the required behavior end-to-end on its
  "Guest Directory" screen: an `activeGuests()`/`isActive()` filter applied before every render
  (initial load, search, refresh, clear-search), a `results-count` line that makes the filtering
  visible ("Showing N active guest profiles. M deactivated profiles are hidden from this view —
  open one directly by ID."), an updated empty-state message when a search matches only deactivated
  guests, and an explicit "⟳ Refresh directory" action (design lines 727, 730, 990-1020, 1091-1099).
  This plan wires that same filtering into the real (non-prototype) guest directory at both the
  backend (`GET /guests` defaults to active-only, a new capability, additive alongside the
  unfiltered `listGuests()` other callers already rely on) and the frontend (mirroring the design's
  `activeGuests()` pattern so the existing jsdom test harness, which injects raw guest arrays
  directly into `initGuestProfilesApp`, can prove the filter holds regardless of what array it's
  handed), and adds the design's refresh button and results-count line to
  public/guest-profiles.html/css/js. It also fixes a bug this change would otherwise expose:
  reactivating a guest that was reached only via direct ID lookup (because it was deactivated,
  hence absent from the locally cached guest list) never re-added it to that list, so it would
  silently stay missing from the directory after reactivation until a hard page reload.

scope:
  - description: |
      Add `listActiveGuests()` to the guest store as a new, additive export — it does not change
      `listGuests()`, which several existing tests (test/guests-inline.test.js) call directly as an
      unfiltered count baseline and must keep returning every guest regardless of status.

      ```js
      function listActiveGuests() {
        return listGuests().filter((g) => g.status === 'active');
      }
      ```
    files:
      - src/guests/store.js
    rationale: |
      Gives the route layer (and any future backend consumer) a single, testable source of truth
      for "active guests only" without touching the existing unfiltered listing behavior other
      tests depend on.

  - description: |
      Change the `GET /guests` route handler to call `guestsStore.listActiveGuests()` instead of
      `guestsStore.listGuests()`, so the default listing endpoint the frontend fetches from now
      excludes deactivated guests by default (AC1). `GET /guests/:id` is untouched — it already
      calls `getGuest(id)` with no status filter, which is exactly what AC3 requires, and
      `GET /guests/match`, `/permission`, and the mutating routes are untouched.
    files:
      - src/guests/routes.js
    rationale: |
      This is the single real behavior change needed to make the directory's data source
      active-only; everything downstream (frontend rendering/search) inherits it once wired.

  - description: |
      Mirror the design's `activeGuests()`/`isActive()` filtering pattern inside
      public/js/guest-profiles.js so the directory is guaranteed active-only at render time
      regardless of what's in the in-memory `guests` array (defense in depth, and what makes the
      existing jsdom test harness — which calls `initGuestProfilesApp(document, initialGuests, api)`
      with a raw array, bypassing any fetch — able to prove AC1/AC2 directly):

      ```js
      function isActive(g) { return g.status === 'active'; }
      function activeGuests(list) { return list.filter(isActive); }
      ```

      `renderDirectory(list, query)` gains a `query` parameter (matching the design, design line
      990) and now also updates a new `results-count` element using the design's exact copy
      formulas (design lines 1005-1009):
      - with a query: `` `Showing ${list.length} active guest ${list.length === 1 ? 'match' : 'matches'} for "${query}". Deactivated profiles are excluded from search results.` ``
      - without a query: `` `Showing ${list.length} active guest profiles. ${deactivatedTotal} deactivated ${deactivatedTotal === 1 ? 'profile is' : 'profiles are'} hidden from this view — open one directly by ID.` ``
      where `deactivatedTotal = guests.length - activeGuests(guests).length`. Note the design's
      `query` value passed into this copy is already lowercased (it comes from
      `applySearchFilter`'s `q`), so the rendered `results-count` text shows the lowercased search
      term verbatim, not the user's original casing — this plan mirrors that literally rather than
      "fixing" it, since it's the approved design's exact behavior (design line 1023, 1031).

      `applySearchFilter` now filters over `activeGuests(guests)` (not the raw `guests` array,
      mirroring design line 1024 `var pool = activeGuests();`) before matching the query, so a
      deactivated guest can never surface in search results even if it happens to be sitting in the
      cached array (AC2). Every other call site that previously did `renderDirectory(guests)` — the
      initial paint at the end of `initGuestProfilesApp`, the `clear-search-btn` handler, the
      `nf-back-btn` handler, and `profile-back-btn` — is updated to
      `renderDirectory(activeGuests(guests), '')` (AC1, including "back to directory" after viewing
      a profile, which is a `renderDirectory` call site today and must not resurrect a
      just-deactivated guest from the cached array).
    files:
      - public/js/guest-profiles.js
    rationale: |
      The production app's only real data source (`GET /guests`) is now active-only per the scope
      item above, so this filtering is technically redundant for the live fetch path — but it is
      exactly what the design's reference implementation does at every render call site, and it is
      the only way the existing unit-test harness (which injects arrays directly, not through
      fetch) can exercise and lock in AC1/AC2 as unit tests rather than requiring end-to-end
      supertest coverage for every UI assertion.

  - description: |
      Add an explicit "Refresh directory" action, matching the design's `refresh-btn`
      (`⟳ Refresh directory`, design line 727), wired to actually re-fetch from the backend rather
      than simulate a delay against static fixture data (the design's version has no real backend
      to refetch from, since it is a static fixture-driven prototype — this app does). Add `list()`
      to the api object built by `createDefaultApi()`:

      ```js
      list: () => fetch('/guests', { headers: { 'x-staff-role': 'front_desk' } }).then((res) => {
        if (!res.ok) return Promise.reject({ status: res.status });
        return res.json();
      }),
      ```

      and use it both for the initial `DOMContentLoaded` load (replacing the ad hoc `fetch('/guests')`
      call there) and for a new `refresh-btn` click handler that disables the button, sets its text
      to "Refreshing…" (mirroring the design's button-text swap at design line 1093, without the
      design's skeleton-row animation — production's other async actions such as ID lookup already
      skip that affordance, see assumptions), replaces the local `guests` array with the fresh
      response, restores the button, and re-renders — reapplying the current search query via
      `applySearchFilter()` if one is present, or `renderDirectory(activeGuests(guests), '')`
      otherwise. A failed refresh shows the existing directory toast ("Directory could not be
      refreshed — please try again") and leaves the current list untouched.
    files:
      - public/js/guest-profiles.js
      - public/guest-profiles.html
    rationale: |
      AC1 explicitly covers "loaded or refreshed" and today's directory has no refresh mechanism at
      all — a real re-fetch (rather than a client-side no-op) is the only way to guarantee a
      deactivated-elsewhere guest cannot linger in view after a refresh, and it directly matches the
      design's Guest Directory toolbar layout (search-field, lookup-field, refresh-btn, design lines
      714-728).

  - description: |
      Fix the reactivate handler so a guest reactivated after being reached via direct ID lookup
      (and therefore absent from the locally cached `guests` array, since that guest was
      deactivated and excluded from the last `GET /guests` fetch) is added back into the array
      instead of being silently dropped:

      ```js
      const idx = guests.findIndex((g) => g.id === guest.id);
      if (idx !== -1) guests[idx] = guest; else guests.push(guest);
      ```

      (today's code at public/js/guest-profiles.js:413-414 only does
      `if (idx !== -1) guests[idx] = guest;`, so the `else` branch is new.) The deactivate handler
      needs no equivalent change: the guest stays in the array with `status: 'deactivated'`, and
      `activeGuests()` filtering at render time already excludes it.
    files:
      - public/js/guest-profiles.js
    rationale: |
      This is a direct, necessary corollary of making `GET /guests` active-only: before this
      change, a deactivated guest was always present in the initially-fetched array (so
      reactivating it was just an in-place status flip); after this change, a deactivated guest is
      never in that array to begin with, so reactivating it requires an explicit add — without this
      fix, reactivating a guest via ID lookup would leave it invisible in the directory until a
      hard page reload, silently reintroducing a correctness gap this same story is meant to close.

  - description: |
      Update public/guest-profiles.html copy and layout to match the approved design's Guest
      Directory screen: add `<p class="results-count" id="results-count" aria-live="polite"></p>`
      between the toolbar and the `table-card` (design line 730); update the page-header subtitle
      to "Search active guest profiles by name, email, or phone. Deactivated profiles are hidden
      here — look one up by ID if you need to reopen it." (design line 711); update the empty-state
      panel's heading to `No active guests match "<span class="empty-query"></span>"` and add the
      design's explanatory paragraph "Deactivated profiles are excluded from search results. If
      you're looking for a former guest, open their profile directly by ID instead." (design lines
      755-756). Add matching CSS for `.results-count` and `.refresh-btn` (design lines 369-376) to
      public/css/guest-profiles.css.
    files:
      - public/guest-profiles.html
      - public/css/guest-profiles.css
    rationale: |
      These are the concrete, approved-design elements that make the active-only filtering visible
      and intentional to front-desk staff rather than a silent, unexplained absence — exactly the
      role the design's results-count and empty-state copy play on its Guest Directory screen.

  - description: |
      New backend test file exercising the directory/search filtering contract end-to-end through
      the real HTTP routes (supertest), following the existing per-concern test file convention
      (e.g. test/expenses-filter.test.js). Covers the happy-path AC1/AC3 cases plus the edge cases
      called out in `tests` below: a reactivated guest reappearing in the default listing, and an
      unknown ID still returning a genuine 404 rather than being conflated with "hidden by status".
    files:
      - test/guests-directory-filter.test.js
    rationale: |
      Locks in AC1 (default listing excludes deactivated) and AC3 (direct ID lookup for a
      deactivated guest still returns the full profile even though it's excluded from the listing)
      at the route level, independent of the frontend's own defensive filtering, and guards the two
      adjacent edge cases (reactivation round-trip, true not-found) that are easy to accidentally
      break while making the listing status-aware.

  - description: |
      Extend test/guests-store.test.js with unit tests for `listActiveGuests()` (including the
      deactivate/reactivate round trip) and extend test/guest-profiles.test.js with jsdom unit
      tests for the frontend filtering, results-count copy (including its singular/plural
      branches), search-by-email/search-by-phone exclusion, refresh success and failure paths,
      clear-search/not-found-back-button restoration, and the reactivate array-sync fix.
    files:
      - test/guests-store.test.js
      - test/guest-profiles.test.js
    rationale: |
      Each layer (store, route, frontend render/search/refresh) gets its own failing-first test so
      a regression in any one layer is caught even if the others still happen to mask it in
      practice, and the additional edge-case tests close the gaps a reviewer would otherwise have
      to spot manually (grammar branches in generated copy, every render call site, and the two
      "hidden vs. truly absent" distinctions for both listing and ID lookup).

tests:
  - |
    // test/guests-store.test.js — AC1 (store layer)
    test('AC1: listActiveGuests excludes deactivated profiles but includes active ones', () => {
      const { createGuest, deactivateGuest, listActiveGuests } = require('../src/guests/store');
      const deactivated = createGuest({ name: 'Wei Zhang', email: 'wei.zhang@example.com' });
      deactivateGuest(deactivated.id, 'Priya Nair');
      const active = createGuest({ name: 'Sofia Torres', email: 'sofia.torres@example.com' });
      const result = listActiveGuests();
      expect(result.some((g) => g.id === deactivated.id)).toBe(false);
      expect(result.some((g) => g.id === active.id)).toBe(true);
    });
  - |
    // test/guests-store.test.js — AC1/AC3 edge case: deactivate/reactivate round trip
    test('AC1/AC3 edge case: a guest excluded from listActiveGuests after deactivation reappears after reactivation', () => {
      const { createGuest, deactivateGuest, reactivateGuest, listActiveGuests } = require('../src/guests/store');
      const guest = createGuest({ name: 'Round Trip Guest', email: 'roundtrip@example.com' });
      deactivateGuest(guest.id, 'Priya Nair');
      expect(listActiveGuests().some((g) => g.id === guest.id)).toBe(false);
      reactivateGuest(guest.id, 'Priya Nair');
      expect(listActiveGuests().some((g) => g.id === guest.id)).toBe(true);
    });
  - |
    // test/guests-directory-filter.test.js — AC1 (route layer)
    test('AC1: GET /guests excludes a deactivated guest from the default listing', async () => {
      const createRes = await request(app).post('/guests').set('x-staff-role', 'front_desk').send({ name: 'Wei Zhang', email: 'wei.zhang@example.com', actor: 'Priya Nair' });
      const { id } = createRes.body;
      await request(app).post(`/guests/${id}/deactivate`).send({ actor: 'Priya Nair' });
      const res = await request(app).get('/guests');
      expect(res.status).toBe(200);
      expect(res.body.some((g) => g.id === id)).toBe(false);
    });
  - |
    // test/guests-directory-filter.test.js — AC1 edge case: reactivation round trip at the route layer
    test('AC1 edge case: a reactivated guest reappears in GET /guests default listing', async () => {
      const createRes = await request(app).post('/guests').set('x-staff-role', 'front_desk').send({ name: 'Noah Park', email: 'noah.park@example.com', actor: 'Priya Nair' });
      const { id } = createRes.body;
      await request(app).post(`/guests/${id}/deactivate`).send({ actor: 'Priya Nair' });
      await request(app).post(`/guests/${id}/reactivate`).send({ actor: 'Priya Nair' });
      const res = await request(app).get('/guests');
      expect(res.status).toBe(200);
      expect(res.body.some((g) => g.id === id)).toBe(true);
    });
  - |
    // test/guests-directory-filter.test.js — AC3 (route layer regression guard)
    test('AC3: GET /guests/:id returns a deactivated guest in full even though it is excluded from the listing', async () => {
      const createRes = await request(app).post('/guests').set('x-staff-role', 'front_desk').send({ name: 'Elena Kim', phone: '555-7300', actor: 'Priya Nair' });
      const { id } = createRes.body;
      await request(app).post(`/guests/${id}/deactivate`).send({ actor: 'Priya Nair' });
      const listRes = await request(app).get('/guests');
      expect(listRes.body.some((g) => g.id === id)).toBe(false);
      const getRes = await request(app).get(`/guests/${id}`);
      expect(getRes.status).toBe(200);
      expect(getRes.body).toMatchObject({ id, name: 'Elena Kim', status: 'deactivated' });
    });
  - |
    // test/guests-directory-filter.test.js — AC3 edge case: hidden-by-status vs. truly nonexistent
    test('AC3 edge case: GET /guests/:id for a truly unknown ID returns a genuine 404, not a false hidden-by-status response', async () => {
      const res = await request(app).get('/guests/does-not-exist-id');
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'guest not found' });
    });
  - |
    // test/guest-profiles.test.js — AC1 (frontend render)
    test('AC1 UI: the default directory listing excludes deactivated guests', () => {
      const active = fixtureGuest();
      const deactivated = { ...fixtureGuest(), id: 'GST-2003', name: 'Wei Zhang', status: 'deactivated' };
      const { initGuestProfilesApp } = require('../public/js/guest-profiles');
      initGuestProfilesApp(document, [active, deactivated], {});
      expect(document.getElementById('guest-tbody').textContent).not.toContain('Wei Zhang');
      expect(document.getElementById('guest-tbody').textContent).toContain(active.name);
    });
  - |
    // test/guest-profiles.test.js — AC2 (frontend search, matching name excluded when deactivated)
    test('AC2 UI: searching by a name that matches both an active and a deactivated guest excludes the deactivated one', () => {
      const active = { ...fixtureGuest(), id: 'GST-2002', name: 'Daniel Kim' };
      const deactivated = { ...fixtureGuest(), id: 'GST-2005', name: 'Elena Kim', status: 'deactivated' };
      const { initGuestProfilesApp } = require('../public/js/guest-profiles');
      initGuestProfilesApp(document, [active, deactivated], {});
      document.getElementById('search-input').value = 'Kim';
      document.getElementById('search-input').dispatchEvent(new Event('input'));
      expect(document.getElementById('guest-tbody').textContent).toContain('Daniel Kim');
      expect(document.getElementById('guest-tbody').textContent).not.toContain('Elena Kim');
    });
  - |
    // test/guest-profiles.test.js — AC2 edge case: search by email excludes a deactivated match
    test('AC2 UI edge case: searching by email excludes a deactivated guest with a matching email', () => {
      const deactivated = { ...fixtureGuest(), id: 'GST-3002', name: 'Omar Reyes', email: 'omar.reyes@example.com', status: 'deactivated' };
      const { initGuestProfilesApp } = require('../public/js/guest-profiles');
      initGuestProfilesApp(document, [deactivated], {});
      document.getElementById('search-input').value = 'omar.reyes';
      document.getElementById('search-input').dispatchEvent(new Event('input'));
      expect(document.getElementById('guest-tbody').textContent).not.toContain('Omar Reyes');
      expect(document.getElementById('directory-empty').hidden).toBe(false);
    });
  - |
    // test/guest-profiles.test.js — AC2 edge case: search by phone excludes a deactivated match
    test('AC2 UI edge case: searching by phone excludes a deactivated guest with a matching phone', () => {
      const deactivated = { ...fixtureGuest(), id: 'GST-3003', name: 'Lucia Ferro', phone: '555-8123', status: 'deactivated' };
      const { initGuestProfilesApp } = require('../public/js/guest-profiles');
      initGuestProfilesApp(document, [deactivated], {});
      document.getElementById('search-input').value = '555-8123';
      document.getElementById('search-input').dispatchEvent(new Event('input'));
      expect(document.getElementById('guest-tbody').textContent).not.toContain('Lucia Ferro');
    });
  - |
    // test/guest-profiles.test.js — AC2 (search yields zero results when only a deactivated guest matches)
    test('AC2 UI: searching a term that only matches a deactivated guest shows the empty state, not that guest', () => {
      const deactivated = { ...fixtureGuest(), id: 'GST-2003', name: 'Wei Zhang', email: 'wei.zhang@example.com', status: 'deactivated' };
      const { initGuestProfilesApp } = require('../public/js/guest-profiles');
      initGuestProfilesApp(document, [deactivated], {});
      document.getElementById('search-input').value = 'wei.zhang';
      document.getElementById('search-input').dispatchEvent(new Event('input'));
      expect(document.getElementById('directory-empty').hidden).toBe(false);
      expect(document.getElementById('guest-tbody').textContent).not.toContain('Wei Zhang');
    });
  - |
    // test/guest-profiles.test.js — AC1 edge case: results-count singular copy (exactly one deactivated hidden)
    test('AC1 UI edge case: results-count uses singular copy when exactly one deactivated profile is hidden', () => {
      const active = fixtureGuest();
      const deactivated = { ...fixtureGuest(), id: 'GST-2003', name: 'Wei Zhang', status: 'deactivated' };
      const { initGuestProfilesApp } = require('../public/js/guest-profiles');
      initGuestProfilesApp(document, [active, deactivated], {});
      expect(document.getElementById('results-count').textContent).toBe('Showing 1 active guest profiles. 1 deactivated profile is hidden from this view — open one directly by ID.');
    });
  - |
    // test/guest-profiles.test.js — AC1 edge case: results-count plural copy (more than one deactivated hidden)
    test('AC1 UI edge case: results-count uses plural copy when more than one deactivated profile is hidden', () => {
      const active = fixtureGuest();
      const deactivatedOne = { ...fixtureGuest(), id: 'GST-2003', name: 'Wei Zhang', status: 'deactivated' };
      const deactivatedTwo = { ...fixtureGuest(), id: 'GST-2005', name: 'Elena Kim', status: 'deactivated' };
      const { initGuestProfilesApp } = require('../public/js/guest-profiles');
      initGuestProfilesApp(document, [active, deactivatedOne, deactivatedTwo], {});
      expect(document.getElementById('results-count').textContent).toBe('Showing 1 active guest profiles. 2 deactivated profiles are hidden from this view — open one directly by ID.');
    });
  - |
    // test/guest-profiles.test.js — AC2 edge case: results-count singular "match" copy for search
    test('AC2 UI edge case: results-count uses singular "match" copy for exactly one active search result', () => {
      const active = { ...fixtureGuest(), id: 'GST-4001', name: 'Single Match' };
      const { initGuestProfilesApp } = require('../public/js/guest-profiles');
      initGuestProfilesApp(document, [active], {});
      document.getElementById('search-input').value = 'Single';
      document.getElementById('search-input').dispatchEvent(new Event('input'));
      expect(document.getElementById('results-count').textContent).toBe('Showing 1 active guest match for "single". Deactivated profiles are excluded from search results.');
    });
  - |
    // test/guest-profiles.test.js — AC1 (refresh re-fetches and reflects newly-deactivated state)
    test('AC1 UI: Refresh directory re-fetches from the backend and drops a guest deactivated since the last load', async () => {
      const staleActive = { ...fixtureGuest(), id: 'GST-2001', name: 'Maria Alvarez' };
      const api = { list: jest.fn().mockResolvedValue([]) };
      const { initGuestProfilesApp } = require('../public/js/guest-profiles');
      initGuestProfilesApp(document, [staleActive], api);
      expect(document.getElementById('guest-tbody').textContent).toContain('Maria Alvarez');
      document.getElementById('refresh-btn').click();
      await Promise.resolve(); await Promise.resolve();
      expect(api.list).toHaveBeenCalled();
      expect(document.getElementById('directory-empty').hidden).toBe(false);
    });
  - |
    // test/guest-profiles.test.js — AC1 edge case: a failed refresh leaves the current list untouched
    test('AC1 UI edge case: a failed refresh shows the directory toast and leaves the current list untouched', async () => {
      const active = fixtureGuest();
      const api = { list: jest.fn().mockRejectedValue({ status: 500 }) };
      const { initGuestProfilesApp } = require('../public/js/guest-profiles');
      initGuestProfilesApp(document, [active], api);
      document.getElementById('refresh-btn').click();
      await Promise.resolve(); await Promise.resolve();
      expect(document.getElementById('toast-message').textContent).toBe('Directory could not be refreshed — please try again');
      expect(document.getElementById('guest-tbody').textContent).toContain(active.name);
    });
  - |
    // test/guest-profiles.test.js — AC1 edge case: clear-search restores the active-only listing
    test('AC1 UI edge case: clearing the search restores the active-only listing, not the raw cached array', () => {
      const active = fixtureGuest();
      const deactivated = { ...fixtureGuest(), id: 'GST-2003', name: 'Wei Zhang', status: 'deactivated' };
      const { initGuestProfilesApp } = require('../public/js/guest-profiles');
      initGuestProfilesApp(document, [active, deactivated], {});
      document.getElementById('search-input').value = active.name;
      document.getElementById('search-input').dispatchEvent(new Event('input'));
      document.getElementById('clear-search-btn').click();
      expect(document.getElementById('guest-tbody').textContent).not.toContain('Wei Zhang');
    });
  - |
    // test/guest-profiles.test.js — AC1 edge case: returning from a not-found lookup restores the active-only listing
    test('AC1 UI edge case: returning from a not-found ID lookup restores the active-only listing', async () => {
      const active = fixtureGuest();
      const deactivated = { ...fixtureGuest(), id: 'GST-2003', name: 'Wei Zhang', status: 'deactivated' };
      const api = { get: jest.fn().mockRejectedValue({ status: 404 }) };
      const { initGuestProfilesApp } = require('../public/js/guest-profiles');
      initGuestProfilesApp(document, [active, deactivated], api);
      document.getElementById('lookup-input').value = 'GST-9999';
      document.getElementById('lookup-form').dispatchEvent(new Event('submit', { cancelable: true }));
      await Promise.resolve(); await Promise.resolve();
      document.getElementById('nf-back-btn').click();
      expect(document.getElementById('guest-tbody').textContent).not.toContain('Wei Zhang');
    });
  - |
    // test/guest-profiles.test.js — AC3 (direct ID lookup for a deactivated guest, regression guard)
    test('AC3 UI: looking up a deactivated guest by ID still opens its full profile', async () => {
      const deactivatedGuest = { ...fixtureGuest(), status: 'deactivated' };
      const api = { get: jest.fn().mockResolvedValue(deactivatedGuest) };
      const { initGuestProfilesApp } = require('../public/js/guest-profiles');
      initGuestProfilesApp(document, [], api);
      document.getElementById('lookup-input').value = deactivatedGuest.id;
      document.getElementById('lookup-form').dispatchEvent(new Event('submit', { cancelable: true }));
      await Promise.resolve(); await Promise.resolve();
      expect(document.getElementById('profile-name').textContent).toBe(deactivatedGuest.name);
      expect(document.getElementById('deactivated-banner').hidden).toBe(false);
    });
  - |
    // test/guest-profiles.test.js — array-sync fix (necessary corollary of AC1)
    test('reactivating a guest reached via ID lookup adds it back into the directory listing', async () => {
      const deactivatedGuest = { ...fixtureGuest(), status: 'deactivated' };
      const reactivated = { ...deactivatedGuest, status: 'active' };
      const api = { get: jest.fn().mockResolvedValue(deactivatedGuest), reactivate: jest.fn().mockResolvedValue(reactivated) };
      const { initGuestProfilesApp } = require('../public/js/guest-profiles');
      initGuestProfilesApp(document, [], api);
      document.getElementById('lookup-input').value = deactivatedGuest.id;
      document.getElementById('lookup-form').dispatchEvent(new Event('submit', { cancelable: true }));
      await Promise.resolve(); await Promise.resolve();
      document.getElementById('reactivate-profile-btn').click();
      document.getElementById('reactivate-confirm-btn').click();
      await Promise.resolve(); await Promise.resolve();
      document.getElementById('profile-back-btn').click();
      expect(document.getElementById('guest-tbody').textContent).toContain(reactivated.name);
    });

assumptions_or_open_questions:
  - |
    The design's H1 for this screen reads "Guest directory" (design line 710), but the shipped
    production page (from TEST-M1-STORY-100) titles it "Guest profiles" (public/guest-profiles.html
    line 29). I kept the existing H1 unchanged since renaming it isn't required by any acceptance
    criterion and this same screen also hosts create/edit/deactivate/reactivate flows the design
    deliberately excludes as out-of-scope for this story — I only updated the subtitle `<p>` copy
    beneath it to the design's active-only messaging. Flagging in case the reviewer wants the H1
    renamed to match anyway.
  - |
    The design's directory-loading skeleton-row state (~300ms shimmer, design lines 980-988) and
    its "Looking up…" button text swap during ID lookup (design line 1083) aren't implemented —
    production's existing lookup-form handler already skips that affordance today (no
    disabled/relabeled state during `api.get`), and no acceptance criterion depends on a loading
    indicator, so I matched the existing lighter-weight pattern for the new refresh button (disable
    + relabel text, no skeleton) rather than introducing a heavier affordance nothing else in this
    screen uses.
  - |
    I assumed `GET /guests` becoming active-only by default has no other consumers to break: it's
    only fetched from public/js/guest-profiles.js today (confirmed via grep across public/js), and
    no test asserts it returns deactivated guests. `listGuests()` itself is left unfiltered since
    test/guests-inline.test.js calls it directly as an unfiltered count baseline.
  - |
    AC2 lists name, email, and phone as searchable fields; the existing `applySearchFilter` also
    matches on guest ID substrings (not mentioned in the AC or in the design's search behavior,
    which only matches name/email/phone per design lines 1026-1030). I left that extra ID-matching
    behavior in place rather than removing it, since narrowing search behavior isn't something this
    story's ACs ask for and removing it could be its own regression.
  - |
    The design's `results-count` copy is grammatically literal, not fully polished: the "active
    guest profiles" phrase is never singularized against `list.length` (so a single active result
    still reads "Showing 1 active guest profiles..."), while the deactivated-count phrase and the
    search-match phrase each do pluralize correctly. I mirrored this exactly (see the two new
    results-count edge-case tests) rather than "fixing" the grammar, since the story is about
    filtering behavior, not proofreading the approved design's copy — flagging in case the
    reviewer wants that grammar corrected as a follow-up.
  - |
    `GET /guests/match` (duplicate-detection lookup used by guest creation, from
    TEST-M1-STORY-103) is untouched by this plan and still matches against guests regardless of
    status. Neither the ACs nor the design mention duplicate detection, and narrowing it could
    itself be a regression (e.g. re-creating a profile for a guest who was deactivated specifically
    because staff wanted a fresh one), so I left it out of scope rather than assuming it should
    also become active-only.

package_dependencies: []

notes: |
  The design prototype (.arc/designs/TEST-M1-STORY-128-design.html) is a fully self-contained,
  fixture-driven HTML file with no live backend — its "Guest Directory" screen's JS
  (`activeGuests()`, `renderDirectory(list, query)`, the refresh button's simulated 300ms delay
  against the same static fixture array) is the authoritative reference for layout, copy, and
  filtering behavior, but its "refresh" is necessarily a no-op replay over static data since there
  is nothing behind it to actually change. This plan's refresh button is wired to a real re-fetch
  of `GET /guests` instead, which is strictly more correct for the real app and still satisfies the
  same design layout/copy. The design's "Guest Profile" screen is explicitly read-only by design
  (its own comment: "editing, deactivating, and reactivating guest profiles are covered by
  TEST-M1-STORY-100, not duplicated here" — design lines 777-778), which matches production
  reality: those mutations already exist from TEST-M1-STORY-100 and are out of scope here except
  for the one array-sync bug fix this change's own data-flow makes necessary (see scope). The
  design's third screen, "Reference States," is a static non-interactive reviewer aid (side-by-side
  snapshots labelled with which AC each satisfies) and doesn't correspond to any screen to build.
  This revision adds edge-case coverage on top of the original happy-path plan: a deactivate/
  reactivate round trip at both the store and route layers, the "hidden by status" vs. "truly
  nonexistent" distinction for direct ID lookup, explicit email/phone search exclusion (AC2 names
  all three fields, but the original draft only exercised name-based search), the results-count
  copy's singular/plural branches on both the "hidden" and "match" phrasings, a failed-refresh path
  that must leave the current list untouched, and the clear-search/not-found-back-button render
  call sites that must also stay active-only rather than reverting to the raw cached array.

  ```mermaid
  flowchart TD
    A["GET /guests route\nsrc/guests/routes.js"] -->|"now calls"| B["listActiveGuests()\nsrc/guests/store.js (new)"]
    B -->|"filters"| C["listGuests()\nsrc/guests/store.js (unchanged)"]
    D["GET /guests/:id route\nsrc/guests/routes.js (unchanged)"] --> E["getGuest(id)\nsrc/guests/store.js (unchanged)"]
    F["public/js/guest-profiles.js\ninitGuestProfilesApp"] -->|"fetch('/guests') via api.list()"| A
    F -->|"fetch('/guests/:id') via api.get()"| D
    F --> G["renderDirectory(activeGuests(guests), query)"]
    F --> H["applySearchFilter (pool = activeGuests(guests))"]
    F --> I["refresh-btn handler -> api.list() -> re-render"]
    F --> J["reactivate handler -> guests.push if missing (fix)"]

    classDef touched fill:#f96,color:#000
    class A,B,F,G,H,I,J touched
  ```

review_focus: |
  In scope: making `GET /guests` and the directory's render/search paths active-only by default
  (AC1/AC2), and locking in with a regression test that direct ID lookup (AC3) still returns a full
  deactivated profile — that behavior already existed pre-plan and is not being changed. Out of
  scope: any change to create/edit/deactivate/reactivate flows themselves, beyond the one
  array-sync fix in the reactivate handler that this change's data-flow directly necessitates (see
  scope item 5) — that fix is deliberate, not scope creep, and a reviewer should expect it. Also out
  of scope: `GET /guests/match` duplicate detection, which intentionally still matches deactivated
  guests. The riskiest area is the frontend's dual filtering (backend now filters `GET /guests`,
  and the frontend independently re-filters via `activeGuests()` before every render) — this is
  intentional defense-in-depth to keep the existing jsdom test harness (which injects raw arrays
  bypassing fetch) able to prove the behavior directly, not redundant dead code to flag for
  removal. The expanded edge-case tests (deactivate/reactivate round trips, not-found-vs-hidden,
  per-field search exclusion, results-count grammar branches, failed refresh, and every
  render-call-site restoration path) are the second-riskiest area — a reviewer should expect all
  of them to be genuinely failing before implementation and genuinely passing after, not treated as
  redundant with the original happy-path tests.
