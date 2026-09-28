summary: |
  Add arc pipeline degradation handling to a brand-new HR dashboard. Today the repo has no
  dashboard route, no arc/pipeline client, and no dashboard frontend at all — the closest
  precedent is `src/onboarding/engineClient.js`, a stub client the `hires` store calls to
  simulate an external onboarding engine. This plan builds the minimal analogous pieces for
  "arc": a stub `arcClient.fetchPipelineStatus()`, an in-memory `dashboard/store.js` that caches
  the last successful response and timestamp, a `GET /dashboard` route that serves cached data
  with a `stale`/`significantlyStale` flag when arc fails, and a server-rendered dashboard page
  (`public/dashboard.html` + `public/js/dashboard.js`, following the existing
  `initXApp(doc, initialData, api)` testable-frontend pattern used by `hire-profile.js` and
  `guest-profiles.js`) that shows a warning banner instead of an error screen. The goal is to
  preserve HR visibility during transient arc outages, per the parent Reporting & Observability
  epic, without building the full bottleneck/SLA dashboard (out of scope for this story).
scope:
  - description: |
      Add `src/dashboard/arcClient.js`, a stub client analogous to `src/onboarding/engineClient.js`,
      exposing `async function fetchPipelineStatus()` that resolves to an array of per-hire
      pipeline status records: `[{ hireId, name, stage, updatedAt }]`. In real operation this
      always resolves (like `engineClient`); tests substitute failures via `jest.mock`. This is
      the seam AC1/AC3/AC4 degradation logic reads through.
    files:
      - src/dashboard/arcClient.js
    rationale: |
      No arc/pipeline client exists in the codebase today (grepped for "arc|pipeline|dashboard"
      across src/ and public/ — no matches). Mirroring `engineClient.js`'s shape keeps the new
      integration consistent with the one existing external-system stub in this repo.
  - description: |
      Add `src/dashboard/store.js` holding a single module-level cache (`{ data, lastFetchedAt }`,
      `null` until the first successful fetch) and exporting:

      ```js
      async function getDashboardData() {
        try {
          const data = await arcClient.fetchPipelineStatus();
          cache = { data, lastFetchedAt: new Date().toISOString() };
          return { data, stale: false, lastFetchedAt: cache.lastFetchedAt, significantlyStale: false };
        } catch (err) {
          if (!cache) throw err;
          const ageMs = Date.now() - new Date(cache.lastFetchedAt).getTime();
          return {
            data: cache.data,
            stale: true,
            lastFetchedAt: cache.lastFetchedAt,
            significantlyStale: ageMs > SIGNIFICANT_STALENESS_MS,
          };
        }
      }
      ```

      `SIGNIFICANT_STALENESS_MS` is a named constant (`24 * 60 * 60 * 1000`) exported for tests.
      This function is the single place AC1, AC3, and AC4 are decided.
    files:
      - src/dashboard/store.js
    rationale: |
      Centralizing cache + staleness math in one store function (rather than in the route)
      matches the existing convention where `hires/store.js` / `runs/store.js` hold all
      state/business logic and routes stay thin pass-throughs.
  - description: |
      Add `src/dashboard/routes.js`:

      ```js
      router.get('/', async (req, res, next) => {
        try {
          const result = await getDashboardData();
          res.status(200).json(result);
        } catch (err) {
          res.status(503).json({ error: 'arc pipeline integration unavailable' });
        }
      });
      ```

      Mount it in `src/server.js` alongside the other routers:
      `app.use('/dashboard', dashboardRouter);`
    files:
      - src/dashboard/routes.js
      - src/server.js
    rationale: |
      Follows the exact router-per-resource + `app.use('/x', xRouter)` pattern already used for
      `/hires`, `/runs`, `/guests`, etc. in `src/server.js`.
  - description: |
      Add the dashboard frontend: `public/dashboard.html` (app-topbar + page + card, reusing
      shared `design-system/prototype-utils.css` classes, with a `#stale-banner` element hidden
      by default, a `#pipeline-tbody` table body, and a `#refresh-btn`), `public/css/dashboard.css`
      (page-specific styles: `.stale-banner` uses a dashed border + icon, `.stale-banner--significant`
      uses a bolder/solid border — severity conveyed by border style/width, never color alone, per
      the existing `status-chip--error`/`status-chip--blocked` convention), and
      `public/js/dashboard.js` exporting:

      ```js
      function initDashboardApp(doc, initialPayload, api) { /* renders table + banner, wires #refresh-btn */ }
      module.exports = { initDashboardApp };
      ```

      plus a `window.DOMContentLoaded` bootstrap using a `createDefaultApi()` that calls
      `fetch('/dashboard').then(res => res.json())`.
    files:
      - public/dashboard.html
      - public/css/dashboard.css
      - public/js/dashboard.js
    rationale: |
      Matches the existing testable-frontend convention (`initHireProfileApp(doc, initialHire, api)`
      in `public/js/hire-profile.js`, `initGuestProfilesApp` in `public/js/guest-profiles.js`):
      DOM + injected async `api` object, so jsdom tests can drive it with `jest.fn().mockResolvedValue/mockRejectedValue`
      without a real network call.
  - description: |
      Backend tests: `test/dashboard-store.test.js` (unit, mocks `arcClient` directly) and
      `test/dashboard.test.js` (supertest, mocks `arcClient` and hits the real `/dashboard` route
      through `src/server.js`). Frontend test: `test/dashboard-ui.test.js` (jsdom, mirrors
      `test/hire-profile.test.js` structure).
    files:
      - test/dashboard-store.test.js
      - test/dashboard.test.js
      - test/dashboard-ui.test.js
    rationale: |
      Keeps store-unit, API, and UI tests in three files, matching the existing split
      (`hires-store.test.js` vs `hires.test.js` vs `hire-profile.test.js`).
tests:
  - |
    AC1 (store unit) — `test/dashboard-store.test.js`, with `jest.mock('../src/dashboard/arcClient')`:
    seed one successful fetch, then reject the next call, and assert the cached data comes back
    instead of the store throwing:
      arcClient.fetchPipelineStatus.mockResolvedValueOnce([{ hireId: 'hire_2031', stage: 'offer' }]);
      await getDashboardData();
      arcClient.fetchPipelineStatus.mockRejectedValueOnce(new Error('arc unreachable'));
      const result = await getDashboardData();
      expect(result.data).toEqual([{ hireId: 'hire_2031', stage: 'offer' }]);
      expect(result.stale).toBe(true);
  - |
    AC1 (API) — `test/dashboard.test.js`, with `jest.mock('../src/dashboard/arcClient')`:
      arcClient.fetchPipelineStatus.mockResolvedValueOnce([{ hireId: 'hire_2031', stage: 'offer' }]);
      await request(app).get('/dashboard');
      arcClient.fetchPipelineStatus.mockRejectedValueOnce(new Error('arc down'));
      const res = await request(app).get('/dashboard');
      expect(res.status).toBe(200);
      expect(res.body.stale).toBe(true);
      expect(res.body.data).toEqual([{ hireId: 'hire_2031', stage: 'offer' }]);
  - |
    AC2 (UI) — `test/dashboard-ui.test.js`, jsdom, asserting the banner shows the last-fetch
    timestamp:
      const payload = { data: [], stale: true, lastFetchedAt: '2026-09-27T10:00:00.000Z', significantlyStale: false };
      const api = { fetchDashboard: jest.fn() };
      initDashboardApp(document, payload, api);
      expect(document.getElementById('stale-banner').hidden).toBe(false);
      expect(document.getElementById('stale-banner-text').textContent).toContain('2026-09-27');
  - |
    AC3 (UI) — a successful manual refresh clears the banner and swaps in fresh data:
      const stalePayload = { data: [{ hireId: 'hire_1', stage: 'offer' }], stale: true, lastFetchedAt: '2026-09-27T10:00:00.000Z', significantlyStale: false };
      const freshPayload = { data: [{ hireId: 'hire_1', stage: 'background_check' }], stale: false, lastFetchedAt: '2026-09-28T09:00:00.000Z', significantlyStale: false };
      const api = { fetchDashboard: jest.fn().mockResolvedValue(freshPayload) };
      initDashboardApp(document, stalePayload, api);
      document.getElementById('refresh-btn').click();
      await Promise.resolve(); await Promise.resolve();
      expect(document.getElementById('stale-banner').hidden).toBe(true);
      expect(document.getElementById('pipeline-tbody').textContent).toContain('background_check');
  - |
    AC4 (store unit) — staleness beyond `SIGNIFICANT_STALENESS_MS` is flagged, using fake timers:
      jest.useFakeTimers().setSystemTime(new Date('2026-09-01T00:00:00.000Z'));
      arcClient.fetchPipelineStatus.mockResolvedValueOnce([{ hireId: 'hire_2031' }]);
      await getDashboardData();
      jest.setSystemTime(new Date('2026-09-05T00:00:00.000Z'));
      arcClient.fetchPipelineStatus.mockRejectedValueOnce(new Error('down'));
      const result = await getDashboardData();
      expect(result.significantlyStale).toBe(true);
      jest.useRealTimers();
  - |
    AC4 (UI) — significantly-stale data renders the stronger warning copy and modifier class:
      const payload = { data: [], stale: true, significantlyStale: true, lastFetchedAt: '2026-09-01T00:00:00.000Z' };
      const api = { fetchDashboard: jest.fn() };
      initDashboardApp(document, payload, api);
      expect(document.getElementById('stale-banner').classList.contains('stale-banner--significant')).toBe(true);
      expect(document.getElementById('stale-banner-text').textContent).toMatch(/significantly out of date/i);
assumptions_or_open_questions:
  - "\"Arc pipeline integration\" is modeled as a new stub client, `src/dashboard/arcClient.js`, analogous to the existing `src/onboarding/engineClient.js` stub — there is no prior arc client, dashboard route, or dashboard frontend anywhere in the repo (confirmed via grep across src/, public/, and .arc/designs/)."
  - "No `.arc/designs/TEST-M1-STORY-083-design.html` mockup exists (unlike STORY-055/091/092/etc.), so the dashboard's visual shape (topbar + card + table + banner) is derived from the existing app-topbar/card/table conventions in `public/index.html` and `public/hire-profile.html` rather than a story-specific design file."
  - "The cache is a single in-memory 'last known good' dashboard snapshot (not keyed per-hire), matching this story's narrow scope (fetch/cache/stale-banner mechanics only) — the parent epic's fuller per-hire bottleneck/SLA dashboard fields are explicitly out of scope here."
  - "The 'threshold' in AC4 is not given a value by the ACs. This plan sets `SIGNIFICANT_STALENESS_MS = 24 * 60 * 60 * 1000` (24 hours) as a single named, easily-adjustable constant in `src/dashboard/store.js`."
  - "AC1-AC4 all presuppose a prior successful fetch exists to fall back to. On a true cold start (arc fails before any cache has ever been populated) there is nothing to display; the route returns 503 with a JSON error body rather than crashing — this path is not covered by the ACs and is called out here rather than silently guessed at."
  - "AC3's 'next scheduled or manual refresh' is implemented as a manual Refresh button only. No polling/scheduled-refresh timer is added, since no interval is specified anywhere in the story and adding one would be speculative scope beyond the ACs."
package_dependencies: []
notes: |
  Research: grepped the whole repo for `dashboard|reporting|pipeline|sla|Arc|bottleneck` — the
  only hits were unrelated CSS/lockfile noise and other stories' design mockups, confirming this
  story starts from zero existing dashboard/arc code. Read `src/onboarding/engineClient.js`,
  `src/hires/store.js`, and `src/hires/routes.js` as the closest precedent for "thin route calls
  store calls external-system stub client", and `public/js/hire-profile.js` +
  `test/hire-profile.test.js` as the precedent for the testable `initXApp(doc, data, api)`
  frontend pattern with `jest.fn().mockResolvedValue/mockRejectedValue` — both are followed
  directly rather than inventing a new shape.

  ```mermaid
  flowchart TD
    server["src/server.js"]
    dashRoutes["src/dashboard/routes.js\nGET /dashboard"]
    dashStore["src/dashboard/store.js\ncache + staleness calc"]
    arcClient["src/dashboard/arcClient.js\nfetchPipelineStatus()"]
    dashHtml["public/dashboard.html"]
    dashJs["public/js/dashboard.js\ninitDashboardApp()"]
    hiresRoutes["src/hires/routes.js\n(existing sibling pattern)"]
    engineClient["src/onboarding/engineClient.js\n(existing sibling stub)"]

    server -->|mounts /dashboard| dashRoutes
    dashRoutes -->|calls getDashboardData| dashStore
    dashStore -->|calls fetchPipelineStatus| arcClient
    dashJs -->|fetch GET /dashboard| dashRoutes
    dashHtml -->|loads| dashJs
    server -.->|existing sibling mount| hiresRoutes
    hiresRoutes -.->|existing sibling call| engineClient

    classDef touched fill:#f96,color:#000
    class server,dashRoutes,dashStore,arcClient,dashHtml,dashJs touched
  ```
