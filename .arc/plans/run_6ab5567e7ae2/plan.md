summary: |
  Add an Onboarding Dashboard that surfaces stalled/overdue pipeline stages so HR admins can spot
  where intervention is needed without opening each hire profile. Today `src/hires/store.js` only
  tracks a binary `hireStage` (`draft` | `offer_accepted`) with no concept of a multi-stage
  pipeline, SLA thresholds, or activity recency — none of that exists anywhere in the codebase, so
  this plan introduces it. It extends the hire record with `stageEnteredAt`/`lastActivityAt`
  timestamps, adds a new `src/dashboard/` module that computes per-hire overdue/stalled flags and
  per-stage bottleneck status from those timestamps, exposes it over `GET /dashboard`, and builds
  the "Onboarding Dashboard" screen from
  `.arc/designs/TEST-M1-STORY-079-design.html` (stage groups, status chips, bottleneck
  banner/badge, legend, and stage drill-in modal) to render it. The design's separate "Reference
  States" screen (loading/empty/error) is not built — no AC calls for it, see
  `assumptions_or_open_questions`.

scope:
  - description: |
      Add pipeline stage configuration as the single source of truth for stage order and SLA
      thresholds, plus the global stall threshold. Values are taken verbatim from the design's
      `FIXTURES` fixture block (`.arc/designs/TEST-M1-STORY-079-design.html` lines 556-563).

      New file `src/dashboard/stages.js`:
      ```js
      const STAGES = [
        { id: 'offer_accepted', name: 'Offer accepted', slaDays: 2 },
        { id: 'background_check', name: 'Background check', slaDays: 5 },
        { id: 'paperwork', name: 'Paperwork', slaDays: 3 },
        { id: 'it_provisioning', name: 'IT provisioning', slaDays: 2 },
        { id: 'orientation_scheduled', name: 'Orientation scheduled', slaDays: 2 },
      ];
      const STALL_THRESHOLD_DAYS = 4;
      module.exports = { STAGES, STALL_THRESHOLD_DAYS };
      ```
    files:
      - src/dashboard/stages.js
    rationale: |
      No stage/SLA config exists anywhere in `src/` today (confirmed by grep for
      stage|SLA|activity across `src/`, which only matches `src/hires/*`). The design's own
      fixture data is the only source of truth for names/order/SLA-days, so it's copied exactly
      rather than invented.

  - description: |
      Extend the hire record with two new timestamp fields and add the pure flag-computation
      function that AC1, AC4 and AC5 depend on.

      `src/hires/store.js` changes:
      - `createHire`: set `stageEnteredAt` and `lastActivityAt` to `now.toISOString()` unless the
        caller already supplied them (`data.stageEnteredAt`/`data.lastActivityAt`), so HTTP-level
        dashboard tests can seed historical values via `POST /hires` (which spreads `req.body`
        into the hire as-is, same as today).
      - `updateHire`: whenever `hireStage` changes, refresh `stageEnteredAt` to "now" (entering a
        new stage resets the SLA clock) unless the caller supplied an explicit value. On every
        call, refresh `lastActivityAt` to "now" unless the caller supplied one explicitly
        (`'lastActivityAt' in changes`) — patching a hire is the only "activity" signal that
        exists anywhere in this codebase (no audit/event log), so this is the proxy used; an
        explicit `null` lets tests represent the design's "activity data unavailable" case.

      New file `src/dashboard/bottleneck.js` (pure, no store access — takes hires as an argument
      so it's unit-testable without HTTP or the in-memory store):
      ```js
      const MS_PER_DAY = 24 * 60 * 60 * 1000;
      const { STAGES, STALL_THRESHOLD_DAYS } = require('./stages');
      const STAGE_BY_ID = Object.fromEntries(STAGES.map((s) => [s.id, s]));

      function daysBetween(now, iso) {
        return Math.floor((now.getTime() - new Date(iso).getTime()) / MS_PER_DAY);
      }

      function computeHireFlags(hire, stage, now) {
        const daysInStage = daysBetween(now, hire.stageEnteredAt);
        const overdueBy = daysInStage - stage.slaDays;
        const isOverdue = overdueBy > 0;
        const activityUnknown = hire.lastActivityAt == null;
        const daysSinceActivity = activityUnknown ? null : daysBetween(now, hire.lastActivityAt);
        const isStalled = !isOverdue && !activityUnknown && daysSinceActivity >= STALL_THRESHOLD_DAYS;
        const isPartial = activityUnknown && !isOverdue;
        return { daysInStage, overdueBy: isOverdue ? overdueBy : 0, isOverdue, isStalled, isPartial, daysSinceActivity };
      }

      function buildDashboard(hires, now = new Date()) {
        const eligible = hires.filter((h) => h.profileStatus === 'active' && STAGE_BY_ID[h.hireStage]);
        const stageGroups = STAGES.map((stage) => {
          const rows = eligible
            .filter((h) => h.hireStage === stage.id)
            .map((hire) => ({ hire, flags: computeHireFlags(hire, stage, now) }));
          const flaggedCount = rows.filter((r) => r.flags.isOverdue || r.flags.isStalled).length;
          return { stage, hires: rows, flaggedCount, isBottleneck: flaggedCount >= 2 };
        });
        const totalFlagged = stageGroups.reduce((sum, g) => sum + g.flaggedCount, 0);
        return { stages: stageGroups, totalHires: eligible.length, totalFlagged, generatedAt: now.toISOString() };
      }

      module.exports = { computeHireFlags, buildDashboard };
      ```
      This mirrors the design's own `computeFlags`/render-time grouping logic
      (design lines 743-786) 1:1, just driven by real timestamps instead of the prototype's
      static `daysInStage`/`daysSinceActivity` fixture fields.
    files:
      - src/hires/store.js
      - src/dashboard/stages.js
      - src/dashboard/bottleneck.js
    rationale: |
      Keeps the SLA/bottleneck math as a pure, dependency-free function so AC1/AC2/AC4/AC5 can
      each get a direct unit test with an injected `now`, instead of only being reachable through
      HTTP or the DOM (which would make the "N days" boundary math slow and flaky to test).

  - description: |
      Wire the computation to the store and expose it over HTTP as its own resource, distinct
      from `/hires`, so it doesn't collide with the existing `GET /hires/:id` route.

      New `src/dashboard/store.js`:
      ```js
      const { listHires } = require('../hires/store');
      const { buildDashboard } = require('./bottleneck');
      function getDashboard(now = new Date()) {
        return buildDashboard(listHires(), now);
      }
      module.exports = { getDashboard };
      ```

      New `src/dashboard/routes.js`:
      ```js
      const express = require('express');
      const { getDashboard } = require('./store');
      const router = express.Router();
      router.get('/', (req, res, next) => {
        try {
          res.status(200).json(getDashboard());
        } catch (err) {
          next(err);
        }
      });
      module.exports = router;
      ```

      `src/server.js`: add `const dashboardRouter = require('./dashboard/routes');` and
      `app.use('/dashboard', dashboardRouter);`, following the same
      require-router/mount-at-plural-name pattern already used for `/hires`, `/workflows`,
      `/runs`, `/guests`.
    files:
      - src/dashboard/store.js
      - src/dashboard/routes.js
      - src/server.js
    rationale: |
      Matches the existing per-domain `store.js` + `routes.js` + mount-in-`server.js` structure
      used by every other resource in this app (`src/hires`, `src/workflows`, `src/runs`,
      `src/guests`).

  - description: |
      Build the "Onboarding Dashboard" screen exactly as shown in
      `.arc/designs/TEST-M1-STORY-079-design.html` (the `data-name="Onboarding Dashboard"`
      screen, lines 621-658 for markup and 660-676 for the drill-in modal), driven by the new
      `GET /dashboard` payload instead of the prototype's local `FIXTURES`/`computeFlags`.

      New `public/dashboard.html`: app-topbar/nav (Dashboard active, Profiles/Runs/Settings
      inert, matching `hire-profile.html`'s nav), `.page-header` with the exact copy from the
      design ("Onboarding dashboard" / "Spot stalled or overdue hires by pipeline stage, without
      checking every profile by hand."), `#banner-slot`, `#attention-summary`, the
      `.controls-row` segmented "All hires"/"Needs attention" filter
      (`#filter-all-btn`/`#filter-attention-btn`), the static `.legend` block (three
      `.legend-item`s: overdue ⚠, stalled ⏸, bottleneck ▲ — copied verbatim from design lines
      651-654, since this is what AC3 requires as the persistent non-colour reference), an empty
      `#stage-groups` container, and the drill-in modal markup
      (`#drill-overlay`, `#drill-modal`, `#drill-modal-title`, `#drill-modal-sub`,
      `#drill-hire-list`, `#drill-close-btn`, `#drill-done-btn`) with ids preserved from the
      design.

      New `public/css/dashboard.css`: the dashboard-specific classes from the design's third
      `<style>` block (lines 337-541) — `.bottleneck-banner`, `.controls-row`/`.segmented`,
      `.legend`/`.legend-swatch--*`, `.stage-group`/`.stage-group-header`/`.bottleneck-badge`,
      `.hire-row`/`.hire-identity`/`.hire-avatar`/`.hire-progress`/`.hire-status`,
      `.status-chip`/`.status-chip--overdue`/`.status-chip--stalled`, `.drill-hire-row`, and the
      `@media (max-width: 480px)` stacking rule — including the locally-scoped
      `--status-danger-*`/`--status-warning-*` custom properties the design defines in its own
      `:root` block (lines 351-358). These are explicitly flagged in the design's own comment
      (lines 338-350) as a proposal not yet in `design-system/tokens.json`/`tokens.css`, matching
      the precedent already set in `public/css/hire-profile.css` (lines 1-6) of noting the
      design-system's missing danger/warning colors and relying on icon+label instead of hue
      alone — this plan does not modify `design-system/tokens.json`.

      New `public/js/dashboard.js`, following the `initHireProfileApp(doc, initialData, api)` /
      `createDefaultApi` pattern from `public/js/hire-profile.js`:
      ```js
      function initDashboardApp(doc, dashboardData, options = {}) {
        let filterMode = 'all';
        // render(): banner-slot, attention-summary, stage-groups — ported from the design's
        // own render() (design lines 774-869), but consuming dashboardData.stages[].hires[]
        // = [{ hire, flags }] and dashboardData.stages[].isBottleneck directly instead of
        // recomputing computeFlags() client-side.
        // statusChipMarkup(hire, flags) reproduces the design's exact chip strings:
        //   "⚠ Overdue by N days" / "⏸ Stalled — no activity in N days".
        // openDrillModal(stageId)/closeDrillModal() ported from design lines 876-909
        // (focus management: focus #drill-close-btn on open, restore focus on close, Esc closes).
      }
      module.exports = { initDashboardApp };
      if (typeof window !== 'undefined') {
        window.addEventListener('DOMContentLoaded', () => {
          fetch('/dashboard').then((res) => res.json()).then((data) => initDashboardApp(document, data));
        });
      }
      ```
    files:
      - public/dashboard.html
      - public/css/dashboard.css
      - public/js/dashboard.js
    rationale: |
      This is the only UI record for this story; every class/id/copy string is taken from the
      approved prototype rather than invented, following the same structural pattern
      (`initXApp(doc, data, api)` + `createDefaultApi` + `DOMContentLoaded` bootstrap) already
      used by `public/js/hire-profile.js` and `public/js/guest-profiles.js` so the module stays
      unit-testable under jsdom without a real fetch.

  - description: |
      Failing-test-first coverage for the flag computation, the HTTP contract, and the rendered
      screen (see `tests` for the concrete assertions).
    files:
      - test/dashboard-bottleneck.test.js
      - test/dashboard.test.js
      - test/dashboard-page.test.js
    rationale: |
      Mirrors the existing split in this repo between pure store/logic tests
      (`test/hires-store.test.js`), HTTP tests (`test/hires.test.js`), and jsdom page tests
      (`test/hire-profile.test.js`).

tests:
  - |
    AC1 (unit, `test/dashboard-bottleneck.test.js`) — a hire whose days-in-stage exceed the
    stage's SLA is flagged overdue with the correct overdue-by count:
    ```js
    const { computeHireFlags } = require('../src/dashboard/bottleneck');
    test('AC1: exceeding the stage SLA flags the hire overdue', () => {
      const stage = { id: 'background_check', name: 'Background check', slaDays: 5 };
      const now = new Date('2026-09-29T00:00:00.000Z');
      const hire = { stageEnteredAt: '2026-09-21T00:00:00.000Z', lastActivityAt: '2026-09-28T00:00:00.000Z' };
      const flags = computeHireFlags(hire, stage, now);
      expect(flags.isOverdue).toBe(true);
      expect(flags.overdueBy).toBe(3);
    });
    ```
  - |
    AC2 (unit, `test/dashboard-bottleneck.test.js`) — a stage with 2+ flagged hires is a
    bottleneck; a stage with exactly 1 flagged hire is not:
    ```js
    const { buildDashboard } = require('../src/dashboard/bottleneck');
    test('AC2: 2+ flagged hires in a stage is a bottleneck, 1 is an individual outlier', () => {
      const now = new Date('2026-09-29T00:00:00.000Z');
      const back = (days) => new Date(now.getTime() - days * 86400000).toISOString();
      const hires = [
        { id: 'h1', hireStage: 'background_check', profileStatus: 'active', stageEnteredAt: back(8), lastActivityAt: back(1) },
        { id: 'h2', hireStage: 'background_check', profileStatus: 'active', stageEnteredAt: back(7), lastActivityAt: back(2) },
        { id: 'h3', hireStage: 'it_provisioning', profileStatus: 'active', stageEnteredAt: back(4), lastActivityAt: back(0) },
      ];
      const dashboard = buildDashboard(hires, now);
      const bgCheck = dashboard.stages.find((s) => s.stage.id === 'background_check');
      const itProv = dashboard.stages.find((s) => s.stage.id === 'it_provisioning');
      expect(bgCheck).toMatchObject({ isBottleneck: true, flaggedCount: 2 });
      expect(itProv).toMatchObject({ isBottleneck: false, flaggedCount: 1 });
    });
    ```
  - |
    AC3 (jsdom, `test/dashboard-page.test.js`) — the overdue chip pairs a non-colour icon element
    with a plain-text label, and the legend documents each icon:
    ```js
    test('AC3: the overdue chip pairs an icon with a text label, not colour alone', () => {
      initDashboardApp(document, fixtureDashboard());
      const chip = document.querySelector('.status-chip--overdue');
      expect(chip.querySelector('.status-chip-icon')).not.toBeNull();
      expect(chip.textContent).toMatch(/Overdue by \d+ day/);
    });
    test('AC3: the legend lists a non-colour cue for overdue, stalled, and bottleneck', () => {
      document.documentElement.innerHTML = fs.readFileSync(HTML_PATH, 'utf8');
      const items = Array.from(document.querySelectorAll('.legend-item')).map((el) => el.textContent);
      expect(items.some((t) => /Overdue/.test(t))).toBe(true);
      expect(items.some((t) => /Stalled/.test(t))).toBe(true);
      expect(items.some((t) => /Bottleneck/.test(t))).toBe(true);
    });
    ```
  - |
    AC4 (unit + jsdom) — a hire within its SLA with recent activity gets no overdue/stalled flag
    and no chip renders for it:
    ```js
    test('AC4: within SLA with recent activity is not flagged', () => {
      const stage = { id: 'paperwork', name: 'Paperwork', slaDays: 3 };
      const now = new Date('2026-09-29T00:00:00.000Z');
      const hire = { stageEnteredAt: '2026-09-28T00:00:00.000Z', lastActivityAt: '2026-09-29T00:00:00.000Z' };
      const flags = computeHireFlags(hire, stage, now);
      expect(flags.isOverdue).toBe(false);
      expect(flags.isStalled).toBe(false);
    });
    ```
    and in `test/dashboard-page.test.js`:
    ```js
    test('AC4: an on-track hire row shows no status chip', () => {
      initDashboardApp(document, fixtureDashboard());
      const row = Array.from(document.querySelectorAll('.hire-row')).find((r) => r.textContent.includes('Alicia Chen'));
      expect(row.querySelector('.status-chip')).toBeNull();
    });
    ```
  - |
    AC5 (unit + jsdom) — a hire within SLA but with no activity for at least the stall threshold
    is flagged stalled (not overdue), with its own icon+label:
    ```js
    test('AC5: within SLA but stale activity is flagged stalled', () => {
      const stage = { id: 'paperwork', name: 'Paperwork', slaDays: 3 };
      const now = new Date('2026-09-29T00:00:00.000Z');
      const hire = { stageEnteredAt: '2026-09-27T00:00:00.000Z', lastActivityAt: '2026-09-23T00:00:00.000Z' };
      const flags = computeHireFlags(hire, stage, now);
      expect(flags.isOverdue).toBe(false);
      expect(flags.isStalled).toBe(true);
      expect(flags.daysSinceActivity).toBe(6);
    });
    test('AC5: the stalled chip is visually and textually distinct from overdue', () => {
      initDashboardApp(document, fixtureDashboard());
      const chip = document.querySelector('.status-chip--stalled');
      expect(chip.querySelector('.status-chip-icon')).not.toBeNull();
      expect(chip.textContent).toMatch(/Stalled — no activity in \d+ days/);
    });
    ```
  - |
    HTTP contract (`test/dashboard.test.js`, supertest against `src/server`) — seeds hires via
    `POST /hires` with explicit `stageEnteredAt`/`lastActivityAt`, then asserts `GET /dashboard`
    reflects the computed flags end-to-end:
    ```js
    const request = require('supertest');
    const app = require('../src/server');
    test('GET /dashboard reflects an overdue hire created via POST /hires', async () => {
      const past = new Date(Date.now() - 8 * 86400000).toISOString();
      await request(app).post('/hires').send({
        name: 'Jordan Reyes', email: 'j@x.com', phone: '1', startDate: '2026-10-05',
        department: 'Engineering', role: 'SE II', hireStage: 'background_check',
        stageEnteredAt: past, lastActivityAt: new Date().toISOString(),
      });
      const res = await request(app).get('/dashboard');
      const stage = res.body.stages.find((s) => s.stage.id === 'background_check');
      expect(stage.hires.some((h) => h.hire.name === 'Jordan Reyes' && h.flags.isOverdue)).toBe(true);
    });
    ```

assumptions_or_open_questions:
  - |
    No pipeline-stage, SLA, or activity-tracking concept exists anywhere in the current codebase
    — `hireStage` today only distinguishes `draft`/`offer_accepted` for Run-triggering purposes
    (`src/hires/store.js`). This plan extends `hireStage`'s accepted values to also include the
    design's four post-offer stages (`background_check`, `paperwork`, `it_provisioning`,
    `orientation_scheduled`) and adds `stageEnteredAt`/`lastActivityAt` to the hire record. This
    is a bigger data-model change than the acceptance criteria state explicitly, but is required
    to make AC1/AC2/AC4/AC5 computable at all — flagging for reviewer confirmation before
    implementation starts.
  - |
    "Activity" has no existing event/audit log to read from. This plan treats "the hire record
    was patched" as the only available activity signal and stores it as `lastActivityAt`,
    refreshed on every `updateHire` call unless the caller supplies an explicit value (used by
    tests to simulate staleness or the design's "activity data unavailable" partial state via
    `lastActivityAt: null`). If a richer activity source exists or is planned, this should be
    reconsidered.
  - |
    The design's "Reference States" screen (loading skeleton, empty pipeline, fetch-error retry —
    design lines 678-735) is explicitly a separate, non-interactive documentation screen, and no
    AC (1-5) mentions a fetch-loading, empty-pipeline, or fetch-error scenario. This plan does not
    implement those states for `dashboard.html`/`dashboard.js` to avoid speculative work beyond
    the ACs. Flagging so the reviewer can pull it in as an explicit follow-up if desired.
  - |
    The design's "Needs attention" segmented filter and the stage drill-in modal are part of the
    single "Onboarding Dashboard" screen (not a separate screen), and the drill-in modal is the
    design's concrete mechanism for AC2's "identifiable as a systemic bottleneck" (enumerating
    exactly which hires are driving it). This plan builds both as part of that one screen rather
    than treating them as speculative additions. Flagging in case the reviewer wants them split
    into a separate story.
  - |
    Dashboard eligibility is assumed to be `profileStatus === 'active'` hires whose `hireStage`
    matches one of the five pipeline stages (i.e., excluding `draft` and deactivated profiles).
    No AC states this explicitly; it is the natural reading of "hire's current stage" combined
    with the existing `profileStatus` field already used elsewhere (e.g. `hires/store.js`
    deactivate/reactivate).
  - |
    `GET /dashboard` is unauthenticated and unpaginated, matching every other route in this app
    (`/hires`, `/workflows`, `/runs`, `/guests` have no auth/pagination either).

package_dependencies: []

notes: |
  Data flow for this story (new/changed modules only; grey nodes are existing code read but not
  modified):

  ```mermaid
  flowchart TD
    classDef touched fill:#f96,color:#000;
    classDef existing fill:#ddd,color:#000;

    HiresStore["src/hires/store.js<br/>(+stageEnteredAt, +lastActivityAt)"]:::touched
    Stages["src/dashboard/stages.js<br/>(STAGES, STALL_THRESHOLD_DAYS)"]:::touched
    Bottleneck["src/dashboard/bottleneck.js<br/>(computeHireFlags, buildDashboard)"]:::touched
    DashStore["src/dashboard/store.js<br/>(getDashboard)"]:::touched
    DashRoutes["src/dashboard/routes.js<br/>GET /"]:::touched
    Server["src/server.js<br/>mounts /dashboard"]:::touched
    HiresRoutes["src/hires/routes.js<br/>(unchanged)"]:::existing
    DashJS["public/js/dashboard.js<br/>initDashboardApp"]:::touched
    DashHTML["public/dashboard.html"]:::touched

    HiresRoutes -->|"createHire/updateHire\n(unchanged call sites)"| HiresStore
    DashStore -->|"listHires()"| HiresStore
    DashStore -->|"buildDashboard(hires, now)"| Bottleneck
    Bottleneck -->|"stage config + SLA/stall thresholds"| Stages
    DashRoutes -->|"getDashboard()"| DashStore
    Server -->|"app.use('/dashboard', ...)"| DashRoutes
    DashJS -->|"fetch('/dashboard')"| DashRoutes
    DashHTML -->|"loads"| DashJS
  ```

  The design's fixture-driven `computeFlags`/render logic (design lines 743-869) is the reference
  implementation for both `src/dashboard/bottleneck.js` (the math) and `public/js/dashboard.js`
  (the markup) — the split between "server computes flags, client only renders them" is a
  deliberate departure from the prototype (which computes everything client-side from a hardcoded
  `FIXTURES` object) so the SLA/stall-threshold logic has one tested implementation instead of
  being duplicated or left client-only.

review_focus: |
  In scope: the new `src/dashboard/*` computation + route, the `stageEnteredAt`/`lastActivityAt`
  additions to `src/hires/store.js`, and the `dashboard.html`/`.css`/`.js` screen. Out of scope
  (see `assumptions_or_open_questions`): the design's loading/empty/error reference states, and
  any change to `PATCHABLE_FIELDS` in `src/hires/routes.js` (stage/activity timestamps are only
  settable via direct `POST /hires` body or internal store calls, not real PATCH from the UI —
  there is no UI in this story for editing them). The riskiest area is the day-boundary math in
  `computeHireFlags` (`Math.floor` on a millisecond difference) combined with the `>` vs `>=`
  asymmetry between "overdue" (`overdueBy > 0`) and "stalled" (`daysSinceActivity >=
  STALL_THRESHOLD_DAYS`) — both boundaries are taken directly from the design's own
  `computeFlags` (design lines 743-750) and should not be "fixed" to be symmetric. Also
  deliberate: `isOverdue` always takes priority over `isStalled` (a hire past its SLA is never
  also shown as merely "stalled"), matching the design's `!isOverdue &&` guard.
