summary: |
  Add a standalone "guests" domain (store + search route) and a new front-desk "Guest search"
  page that lets staff find existing guest profiles by partial name or exact email/phone,
  independently of any reservation, per the approved prototype at
  `.arc/designs/TEST-M1-STORY-101-design.html` (the "Guest Search (Live)" screen). The codebase
  today has no guest, reservation, or front-desk concept anywhere (see
  `assumptions_or_open_questions` for the domain mismatch this surfaces) — this plan follows the
  existing per-domain `store.js` + `routes.js` + `public/<page>.html` + `public/js/<page>.js`
  conventions already used by `src/hires` and `public/hire-profile.html` so the new guest-search
  feature fits the app's real structure rather than inventing new patterns. All ten acceptance
  criteria are covered test-first across a backend store unit-test layer, a supertest API layer,
  and a jsdom frontend layer that drives the real `guest-search.html` markup exactly like
  `test/hire-profile.test.js` does today.

scope:
  - description: |
      Create `src/guests/store.js`: an in-memory `Map` of guest profiles (mirrors
      `src/hires/store.js`'s `Map`-based pattern), seeded with the same 10-guest fixture set the
      approved design's demo script uses verbatim (design lines 836-847: Amara Whitfield/Chen/Osei,
      Daniel Osei, Priya Raman, Marcus Bell, Sofia Delgado, Wei Zhang, Grace Okafor, Liam
      Fitzgerald), each `{ id, name, email, phone, status }` with `status` `'active'`|`'inactive'`.
      Port the design's classifier/matcher functions (design lines 856-879: `digitsOnly`,
      `isEmailQuery`, `isPhoneQuery`, and the match-then-filter-by-status flow) into a
      `searchGuests({ query, includeInactive = false })` export:
      ```js
      function searchGuests({ query, includeInactive = false } = {}) {
        const trimmed = (query || '').trim();
        if (!trimmed) return [];
        const all = Array.from(guests.values());
        let matches;
        if (isEmailQuery(trimmed)) {
          matches = all.filter((g) => g.email.toLowerCase() === trimmed.toLowerCase());
        } else if (isPhoneQuery(trimmed)) {
          const qDigits = digitsOnly(trimmed);
          matches = all.filter((g) => digitsOnly(g.phone) === qDigits);
        } else {
          const needle = trimmed.toLowerCase();
          matches = all.filter((g) => g.name.toLowerCase().includes(needle));
        }
        return includeInactive ? matches : matches.filter((g) => g.status === 'active');
      }
      module.exports = { searchGuests };
      ```
      No `createGuest`/reservation linkage is added — guest creation and reservations are out of
      scope for this story (see assumptions).
    files:
      - src/guests/store.js
    rationale: |
      Matches the existing per-domain store convention (`src/hires/store.js`,
      `src/employees/store.js`) and keeps the matching semantics identical to what the reviewer
      already approved in the design's live demo, so backend behavior and the prototype agree.

  - description: |
      Create `src/guests/routes.js` exposing `GET /guests/search`. Call the store via the module
      object (not a destructured reference) so a test can `jest.spyOn` it after the app is
      already loaded:
      ```js
      const express = require('express');
      const guestsStore = require('./store');

      const router = express.Router();

      router.get('/search', (req, res, next) => {
        try {
          const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
          if (!q) return res.status(400).json({ error: 'query is required' });
          const includeInactive = req.query.includeInactive === 'true';
          res.status(200).json(guestsStore.searchGuests({ query: q, includeInactive }));
        } catch (err) {
          next(err);
        }
      });

      module.exports = router;
      ```
      Response body is a bare array on success (matching `GET /hires`'s bare-array convention in
      `src/hires/routes.js`), not a wrapper object — see assumptions.
    files:
      - src/guests/routes.js
    rationale: |
      Follows the existing `try { ... } catch (err) { next(err) }` pattern already used in
      `src/hires/routes.js` and `src/employees/routes.js`, so an unexpected store failure reaches
      the app's existing generic 500 handler in `src/server.js` without any new error-handling
      code.

  - description: |
      Wire the new router into the app: add `const guestsRouter = require('./guests/routes');`
      and `app.use('/guests', guestsRouter);` to `src/server.js`, next to the existing
      `app.use('/hires', hiresRouter);` line.
    files:
      - src/server.js
    rationale: Mirrors how every other domain router is mounted in this file.

  - description: |
      Write `test/guests-store.test.js` covering AC1, AC2, AC3, AC6, AC7, AC8, AC9, AC10 directly
      against `searchGuests` (see `tests` for the literal assertions).
    files:
      - test/guests-store.test.js
    rationale: |
      Mirrors `test/hires-store.test.js`'s pattern of unit-testing the store directly, ahead of
      and independent from the HTTP layer.

  - description: |
      Write `test/guests.test.js` (supertest, mirrors `test/hires.test.js`) covering the
      `GET /guests/search` contract: success with/without `includeInactive`, empty-query 400, and
      AC4/AC5 (a mocked store failure returns 500 with no guest array in the body).
    files:
      - test/guests.test.js
    rationale: |
      Confirms the route wiring, status codes, and error propagation independently of the store
      unit tests and of the frontend.

  - description: |
      Create `public/guest-search.html`: the shipped version of the design's "Guest Search
      (Live)" screen (design lines 646-703) — topbar with brand "Front Desk Console" and
      Guests/Reservations nav (Guests active), page header "Guest search" /
      "Find any guest profile by name, email, or phone — with or without an active reservation.",
      the `role="search"` form with `#search-query` input, `#search-btn` submit button, the
      `#empty-query-error` inline validation paragraph (exact copy: "Enter a name, email, or
      phone number to search."), the `.search-help` hint paragraph, the `#include-inactive`
      checkbox in a `.toolbar-row`, `#result-count` (`aria-live="polite"`), and the
      `#results-panel` container rendered by JS. Deliberately drops the design's `#review-bar`,
      the "Reviewer control: Simulate outage" toggle (design lines 683-687, explicitly
      reviewer-only), and the "Quick tries" chip row (design lines 689-695) — see assumptions.
      Links `../design-system/tokens.css` and `../design-system/prototype-utils.css` plus a new
      `./css/guest-search.css`, and loads `./js/guest-search.js` with `defer`, exactly like
      `public/hire-profile.html` does for its own page-specific CSS/JS.
    files:
      - public/guest-search.html
    rationale: |
      Reuses the shared design-system token/utility stylesheets already linked by every other
      page instead of re-declaring `:root` tokens, and follows the existing one-HTML-page-per-
      feature convention (`public/index.html`, `public/hire-profile.html`).

  - description: |
      Create `public/css/guest-search.css` containing only the page-specific rules from the
      design's third `<style>` block (design lines 337-591) needed by the shipped markup:
      `.sr-only`, the `.btn, .input { min-height: 44px; }` touch-target bump, `.search-bar` /
      `.search-field` / `.search-actions-field` / `.search-help` / `.field-error`,
      `.toolbar-row` / `.checkbox-field`, `.list-count`, the `.table-card` /
      `.guest-table` / `.status-chip` (with `.is-active`) result-table rules, `.skeleton-row` /
      `.skeleton-bar` / `@keyframes shimmer`, and `.state-panel` / `.state-icon` / `.state-title` /
      `.state-body` / `.error-panel` / `.response-time`. Omits `.quick-tries`, `.chip-btn`,
      `.outage-toggle`, `.ref-grid`, and `.ref-card-label`, which belong only to the excluded
      reviewer affordances and the design's "Reference States" gallery screen (never a shipped
      page — design lines 705-814).
    files:
      - public/css/guest-search.css
    rationale: |
      All values are `var(--...)` references into the shared tokens already loaded by
      `tokens.css`, matching the design's own comment (design lines 337-345) that page CSS must
      resolve exclusively through tokens, never hardcode colors.

  - description: |
      Create `public/js/guest-search.js` exporting `initGuestSearchApp(doc, api)`, following the
      `initHireProfileApp(doc, initialHire, api)` dependency-injection pattern in
      `public/js/hire-profile.js`. `api.search(query, includeInactiveBool)` returns a Promise
      resolving to an array of `{ id, name, email, phone, status }` or rejecting on failure — all
      email/phone/name classification now lives server-side in `searchGuests`; the client only
      forwards the raw trimmed query string (see assumptions). Reuses `escapeHtml` from
      `./utils.js` (already used by `hire-profile.js` and `expenses.js`) instead of a third local
      copy. Behavior ported from the design's demo script (design lines 900-1002):
      ```js
      function performSearch(rawQuery) {
        emptyError.hidden = true;
        const query = rawQuery.trim();
        if (!query) { emptyError.hidden = false; queryInput.focus(); return; }
        searchedYet = true;
        renderLoading();
        const started = performance.now();
        api.search(query, includeInactive.checked).then((results) => {
          const elapsed = Math.round(performance.now() - started);
          searchBtn.disabled = false; searchBtn.textContent = 'Search';
          if (results.length === 0) renderNoResults(query);
          else renderResults(results, elapsed);
        }).catch(() => {
          searchBtn.disabled = false; searchBtn.textContent = 'Search';
          renderError();
        });
      }
      ```
      `renderResults` builds one `<tr>` per guest with `.guest-name`, email, phone, and a
      `.col-status` cell using the design's exact check/slash-icon status-chip markup (design
      lines 881-886) — status is always shown as icon + word, never color alone, per the design's
      explicit accessibility note (design lines 341-344). `renderNoResults` echoes the trimmed
      query back into the message (design lines 931-939). `renderError` shows "Search is
      unavailable" / the exact unavailable copy from design lines 921-929 and never renders a
      table (AC5). Checking/unchecking `#include-inactive` re-runs the last search only if one has
      already been performed (design lines 998-1002). `createDefaultApi()` wires the real
      `fetch('/guests/search?q=...&includeInactive=...')` call for production use, following
      `createDefaultApi(hireId)` in `hire-profile.js`; `initGuestSearchApp` and `createDefaultApi`
      are wired together only inside the `if (typeof window !== 'undefined')` block, exactly like
      every other page's JS entrypoint.
    files:
      - public/js/guest-search.js
    rationale: |
      Keeping all matching logic server-side (rather than porting the design's client-side
      `runMatch`/`isEmailQuery`/`isPhoneQuery` verbatim into the browser bundle too) avoids
      duplicating the same classification rules in two languages/runtimes and keeps the contract
      the client depends on identical to what `test/guests-store.test.js` already pins down.

  - description: |
      Write `test/guest-search.test.js` (jsdom, mirrors `test/hire-profile.test.js`'s
      `document.documentElement.innerHTML = fs.readFileSync(...)` + injected `api` pattern)
      covering AC1, AC3, AC4, AC5, AC7/AC8, AC9, and the empty-query inline-validation path (see
      `tests` for literal assertions).
    files:
      - test/guest-search.test.js
    rationale: |
      Drives the actual shipped `guest-search.html` + `guest-search.js`, so a change to element
      ids or markup structure breaks a test immediately, the same guarantee
      `hire-profile.test.js` gives the hire-profile page today.

tests:
  - |
    AC1 (partial name matches every guest whose name contains the substring) —
    `test/guests-store.test.js`:
    ```js
    expect(searchGuests({ query: 'Amara', includeInactive: true }).map(g => g.name).sort())
      .toEqual(['Amara Chen', 'Amara Osei', 'Amara Whitfield']);
    ```
  - |
    AC2 (a complete email or phone returns only the exact profile, never a partial match) —
    `test/guests-store.test.js`:
    ```js
    expect(searchGuests({ query: 'priya.raman@example.com' })).toHaveLength(1);
    expect(searchGuests({ query: '(206) 555-0110' })[0].name).toBe('Amara Chen');
    ```
  - |
    AC3 (no matches shows a "no profiles found" message with the term echoed back) —
    `test/guests-store.test.js` plus `test/guest-search.test.js`:
    ```js
    expect(searchGuests({ query: 'Zzyzx', includeInactive: true })).toEqual([]);
    // guest-search.test.js, after submitting "Zzyzx" with a resolved-empty-array api.search:
    expect(document.querySelector('.state-title').textContent).toBe('No profiles found');
    expect(document.querySelector('.state-body').textContent).toContain('Zzyzx');
    ```
  - |
    AC4 (a backend outage shows an "unavailable" error message) — `test/guests.test.js` and
    `test/guest-search.test.js`:
    ```js
    jest.spyOn(guestsStore, 'searchGuests').mockImplementation(() => { throw new Error('down'); });
    const res = await request(app).get('/guests/search').query({ q: 'Amara' });
    expect(res.status).toBe(500);
    // guest-search.test.js, with api.search: jest.fn().mockRejectedValue(new Error('down')):
    expect(document.querySelector('.state-title').textContent).toBe('Search is unavailable');
    ```
  - |
    AC5 (an outage renders no results at all) — same two tests as AC4, asserting the absence of
    a result list:
    ```js
    expect(Array.isArray(res.body)).toBe(false);
    expect(document.querySelector('.guest-table')).toBeNull();
    ```
  - |
    AC6 (a guest with no active reservation is still returned, by any of the three search modes)
    — `test/guests-store.test.js`, using "Priya Raman", the fixture guest that carries no
    reservation reference anywhere in the guest model or the design (design line 848-849):
    ```js
    expect(searchGuests({ query: 'Priya' }).map(g => g.name)).toContain('Priya Raman');
    expect(searchGuests({ query: 'priya.raman@example.com' })[0].name).toBe('Priya Raman');
    expect(searchGuests({ query: '(646) 555-0173' })[0].name).toBe('Priya Raman');
    ```
  - |
    AC7 (a default search excludes deactivated profiles) — `test/guests-store.test.js`:
    ```js
    expect(searchGuests({ query: 'Amara' }).map(g => g.name).sort())
      .toEqual(['Amara Chen', 'Amara Whitfield']);
    ```
  - |
    AC8 ("include inactive" adds deactivated profiles, and toggling it re-runs the last search)
    — `test/guests-store.test.js` and `test/guest-search.test.js`:
    ```js
    expect(searchGuests({ query: 'Amara', includeInactive: true }).map(g => g.name))
      .toContain('Amara Osei');
    // guest-search.test.js, after checking #include-inactive following an "Amara" search:
    expect(api.search).toHaveBeenLastCalledWith('Amara', true);
    ```
  - |
    AC9 (each result shows full name, email, phone, and active/inactive status) —
    `test/guests-store.test.js` and `test/guest-search.test.js`:
    ```js
    expect(searchGuests({ query: 'priya.raman@example.com' })[0])
      .toMatchObject({ name: 'Priya Raman', email: 'priya.raman@example.com', phone: '(646) 555-0173', status: 'active' });
    // guest-search.test.js, rendering an inactive result row:
    expect(row.querySelector('.status-chip').textContent.trim()).toBe('Inactive');
    expect(row.querySelector('.status-chip').classList.contains('is-active')).toBe(false);
    ```
  - |
    AC10 (results return within 2 seconds under normal load) — `test/guests-store.test.js`, a
    proxy smoke test against the fixture-sized in-memory directory (see assumptions for why this
    cannot be a real 2-second SLA test):
    ```js
    const started = Date.now();
    searchGuests({ query: 'a', includeInactive: true });
    expect(Date.now() - started).toBeLessThan(500);
    ```

assumptions_or_open_questions:
  - |
    Domain mismatch: this codebase's only existing domains are HR-onboarding ones
    (`src/hires`, `src/employees`, `src/workflows`, `src/runs`, expense tracking) — there is no
    guest, reservation, or front-desk concept anywhere in `src/` or `public/` today. The story,
    its acceptance criteria, and the approved design (a "Front Desk Console" with a
    Guests/Reservations nav) describe a hospitality domain that shares no existing code with this
    repo. This plan treats guest search as a new, self-contained domain module using this
    repo's existing per-domain conventions (matching `src/hires`'s `store.js` + `routes.js`
    shape) rather than trying to force-fit it onto the hiring/onboarding model. Flagging this
    explicitly rather than silently building on top of an unrelated domain.
  - |
    The design's `#review-bar`, the "Reviewer control: Simulate outage" toggle, and the
    "Quick tries" chip row (design lines 601-608, 683-695) are treated as review/demo scaffolding
    and are not part of the shipped page — they exist only so a human reviewer can drive every
    state without a real backend. Likewise the design's second screen, "Reference States"
    (design lines 705-814), is a static side-by-side gallery for reviewers, not a page this story
    ships. If this reading is wrong and any of these should ship as real staff-facing controls,
    that needs to come back as feedback before implementation.
  - |
    `GET /guests/search` returns a bare JSON array on success (`res.status(200).json(guests)`),
    matching `GET /hires`'s bare-array convention in `src/hires/routes.js`, rather than a
    `{ guests: [...] }` wrapper. No AC specifies a response envelope.
  - |
    A blank/whitespace-only `q` returns `400 { error: 'query is required' }` rather than running
    a search. No AC covers this directly; it's inferred from the design's own client-side inline
    validation ("Enter a name, email, or phone number to search.", design lines 671-674, 959-964).
  - |
    AC10's "within 2 seconds" is a performance NFR that cannot be meaningfully proven by a unit
    test against a 10-row in-memory `Map` — the store-level timing assertion in `tests` is a
    smoke-test proxy (fails fast if something pathological is introduced), not a real latency
    guarantee under production load.
  - |
    AC6 ("no active reservation") is satisfied by construction: the guest model has no
    reservation field or foreign key at all, since no reservation concept exists in this
    codebase. "Priya Raman" is kept in the fixture set specifically because she has no
    reservation-shaped data anywhere near her, mirroring the design's own framing (design line
    848-849).
  - |
    Guest profiles are seeded as static in-memory fixture data (mirroring how `src/hires/store.js`
    seeds `hire_2031`), since no prior "create a guest profile" feature exists yet. The parent
    epic explicitly scopes inline guest creation during booking/check-in as separate future work,
    so no `createGuest` endpoint is added here.
  - |
    The design's client-side `isEmailQuery`/`isPhoneQuery`/name-substring classifier (design
    lines 856-879) is ported into `searchGuests` and runs server-side only; the shipped client
    just forwards the raw query string. This is a deliberate improvement over the design's
    self-contained demo script (which had no real backend to talk to) rather than a deviation
    from any AC.

package_dependencies: []

notes: |
  Existing conventions confirmed by reading the codebase before planning:
  - Per-domain `store.js` (in-memory `Map`, plain functions) + `routes.js` (Express `Router`,
    `try { ... } catch (err) { next(err) }`) pattern from `src/hires/store.js` /
    `src/hires/routes.js`, wired into `src/server.js` via `app.use('/<domain>', <domain>Router)`.
  - Per-page `public/<page>.html` + `public/css/<page>.css` + `public/js/<page>.js`, where the JS
    module exports an `init<X>App(doc, ..., api)` function for testability and wires a real
    `fetch`-based `createDefaultApi()` only inside `if (typeof window !== 'undefined')` — copied
    directly from `public/hire-profile.html` / `public/js/hire-profile.js`.
  - Frontend tests load the real HTML file into `document.documentElement.innerHTML` under
    `/** @jest-environment jsdom */` and call the exported init function with an injected `api`
    mock, exactly as `test/hire-profile.test.js` does — this plan's `test/guest-search.test.js`
    follows the same shape.
  - `src/guests/routes.js` must call `guestsStore.searchGuests(...)` through the required module
    object rather than a destructured local reference, specifically so
    `jest.spyOn(require('../src/guests/store'), 'searchGuests')` in `test/guests.test.js` can
    intercept the same function the route actually calls (a destructured `const { searchGuests }`
    would capture the pre-mock reference and the spy would silently do nothing).

  ```mermaid
  flowchart TD
    classDef touched fill:#f96,color:#000
    HTML[public/guest-search.html]
    JS[public/js/guest-search.js]
    UTILS[public/js/utils.js]
    SERVERJS[src/server.js]
    ROUTES[src/guests/routes.js]
    STORE[src/guests/store.js]

    HTML -->|script defer| JS
    JS -->|escapeHtml reused, not modified| UTILS
    JS -->|"fetch GET /guests/search?q=...&includeInactive=..."| ROUTES
    SERVERJS -->|"app.use('/guests', guestsRouter) — new line"| ROUTES
    ROUTES -->|guestsStore.searchGuests query, includeInactive| STORE

    class HTML,JS,SERVERJS,ROUTES,STORE touched
  ```
