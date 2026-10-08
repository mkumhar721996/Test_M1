summary: |
  Add a read-only "My Jobs" screen so a signed-in technician can see every job currently assigned
  to them — any status from Assigned through In Progress — in one list sorted by scheduled time
  ascending, with each card showing customer name, address, scheduled time window, problem
  description, captured service category (when present), and any customer-submitted photos. This
  introduces a brand-new `jobs` domain (no existing code references jobs/technicians today),
  mirroring the existing `defects` domain's shape: an in-memory store + Express router on the
  backend, and a static HTML/CSS/JS page on the frontend that fetches from it. The already-approved
  design lives at `.arc/designs/TEST-M1-STORY-205-design.html` (the "My Jobs" screen) and is the
  only source for layout/classes/copy used below. Accept/decline and status-change actions are
  explicitly out of scope (separate stories), so this plan only ever reads jobs, never mutates them.

scope:
  - description: |
      Create the `jobs` backend domain: `src/jobs/store.js` holding an in-memory `Map` of jobs
      (mirrors `src/defects/store.js`'s `Map`-based style) seeded with fixture jobs assigned to the
      demo technician `marcus-webb` (ids `JOB-5021`..`JOB-5026`, copied from the design's own
      `#fixture-jobs` data so card content matches the approved design exactly: customer names,
      addresses, scheduled windows, problem descriptions, service categories incl. two `null`
      cases, statuses Assigned/Accepted/In Progress, and photo arrays incl. one job with zero
      photos), plus two extra fixture jobs used only to prove filtering: `JOB-9001` assigned to a
      different technician (`dana-cole`), and `JOB-9002` assigned to `marcus-webb` but with status
      `Completed`. Export `listAssignedJobs(technicianId)`:
      ```js
      const ASSIGNED_STATUSES = ['Assigned', 'Accepted', 'In Progress'];
      function listAssignedJobs(technicianId) {
        return Array.from(jobs.values())
          .filter((j) => j.technicianId === technicianId && ASSIGNED_STATUSES.includes(j.status))
          .sort((a, b) => new Date(a.scheduledStart) - new Date(b.scheduledStart));
      }
      ```
    files:
      - src/jobs/store.js
    rationale: |
      Matches the existing per-domain store convention (`src/defects/store.js`, `src/runs/store.js`)
      rather than a shared/generic store. Seeding with the design's own fixture ids keeps the
      backend data and the approved design's example content consistent, which matters because
      AC2/AC3/AC4 are about exactly which fields a card shows.

  - description: |
      Create `src/jobs/auth.js`, copying `src/defects/auth.js`'s `requireAuthenticatedUser`
      pattern verbatim (client-asserted `x-user-id` header, rejected outright in production or
      when absent, `req.userId` set otherwise). Each domain in this codebase owns its own copy of
      this check (defects, runs, leave all do), so this plan follows suit rather than extracting a
      shared helper.
    files:
      - src/jobs/auth.js
    rationale: |
      Technician identity for this view is "whoever is making the request" (`req.userId`), used
      directly to filter `listAssignedJobs`. No new auth concept is introduced.

  - description: |
      Create `src/jobs/routes.js` with a single `GET /` route, and mount it in `src/server.js`
      at `/jobs` (next to the other `app.use('/<domain>', ...)` lines):
      ```js
      router.get('/', requireAuthenticatedUser, (req, res, next) => {
        try {
          res.status(200).json(listAssignedJobs(req.userId));
        } catch (err) { next(err); }
      });
      ```
      `src/server.js` gains `const jobsRouter = require('./jobs/routes');` and
      `app.use('/jobs', jobsRouter);`, following the exact pattern already used for
      `defectsRouter`/`runsRouter`.
    files:
      - src/jobs/routes.js
      - src/server.js
    rationale: |
      No pagination is shown in the design and none of the ACs ask for it, so this returns a plain
      JSON array (same shape as `GET /runs`), not the paginated `{items,...}` envelope `defects`
      uses — that envelope exists there specifically for defects' pagination UI, which has no
      equivalent in this design.

  - description: |
      Create `public/jobs.html`: the "My Jobs" screen from the design, reusing its concrete markup —
      `.app-topbar` with brand "FieldOps" and single nav item "My Jobs" (`aria-current="page"`),
      `.page-header-row` with `<h1 id="list-heading">Today's jobs</h1>` and `<span id="job-count">`,
      the `#list-live-region` `aria-live="polite"` region, the `#list-loading` skeleton cards, the
      `#list-error` `.state-banner[role=alert]` with a Retry button, the `#job-list-empty`
      `.empty-state`, and the `#job-list` success container — all copied structurally from the
      design's `<div class="screen" data-name="My Jobs">` block. The reviewer-only "Reviewer
      tooling" demo-note block and the fixture `<script id="fixture-jobs">` are prototype
      scaffolding per the design's own HTML comment ("ships with nothing in the real app") and are
      NOT carried into this file — the real page fetches from `GET /jobs` instead. Links
      `../design-system/tokens.css`, `../design-system/prototype-utils.css`,
      `./css/jobs.css`, and `./js/utils.js` + `./js/jobs.js` (deferred), matching `defects.html`'s
      `<head>` structure.
    files:
      - public/jobs.html
    rationale: |
      Static per-domain HTML page is the established convention (`public/defects.html`,
      `public/rooms.html`, etc.) — there is no shared app shell/router across domains in this repo.

  - description: |
      Create `public/css/jobs.css` porting the design's job-list-specific rules verbatim (token-only,
      no literal colors, matching the design's own "gap note" comment): `.status-chip` plus its
      three variants `.status-assigned` / `.status-accepted` / `.status-in-progress` (shape+icon+label,
      never color alone), `.job-card` / `.job-card-head` / `.job-time` / `.job-customer` /
      `.job-address` / `.job-category-row` / `.job-description-label` / `.job-description`, the
      photo strip (`.photo-section`, `.photo-strip`, `.photo-thumb`, `.photo-thumb-broken`,
      `.photo-caption`), `.empty-state`, `.state-banner`, and the skeleton-loading rules
      (`.skeleton-card`, `.skeleton-block`, `@keyframes skeleton-pulse`). The design's `.photo-warning`
      / `.retry-link` / `.demo-note` / partial-banner rules are NOT ported — see the open question
      below on the partial/broken-photo-retry UX, which this plan treats as out of scope.
    files:
      - public/css/jobs.css
    rationale: |
      Keeps the same visual language already approved for this screen (dark theme via
      `design-system/tokens.css`) without inventing new colors or components.

  - description: |
      Create `public/js/jobs.js` with `initJobsApp(doc, api)` (mirrors `public/js/defects.js`'s
      shape: an injectable `api` object so UI tests can mock it, a `createDefaultApi()` using
      `fetch`, and `module.exports` for tests / `window.addEventListener('DOMContentLoaded', ...)`
      for the real page). Fixed demo technician id `marcus-webb` ("Signed in as Marcus Webb" in the
      design) is sent as the `x-user-id` header on every request, exactly like `defects.js`'s fixed
      `DEMO_USER_ID`/`REPORTER` pattern:
      ```js
      function createDefaultApi() {
        return {
          list: () => fetch('/jobs', { headers: { 'x-user-id': DEMO_TECHNICIAN_ID } })
            .then((res) => res.json().catch(() => ([])).then((data) => (
              res.ok ? data : Promise.reject({ status: res.status })
            ))),
        };
      }
      ```
      `renderJobList(jobs)` builds each card's HTML via a `jobCardHTML(job)` helper that follows the
      design's `jobCardHTML`/`photoSectionHTML` functions field-for-field: time window via
      `formatTimeWindow(start, end)`, a `statusChipHTML(status)` using the design's own
      `STATUS_META` icon/class map (`○`/status-assigned, `✓`/status-accepted, `◐`/status-in-progress),
      customer name, address, a `.job-category-row` with a `.chip` **only** when
      `job.serviceCategory` is truthy (AC3/AC4 — omitted entirely otherwise, no "Not specified"
      placeholder, matching the design's explicit note), the "Reported problem" label + description,
      and a photo strip when `job.photos.length > 0` (omitted entirely otherwise, per the design's
      JOB-5023/JOB-5026 no-photo cases). Each rendered `<img class="photo-thumb">` gets an `error`
      listener (added via `addEventListener`, not inline `onerror`, to avoid building HTML from
      untrusted caption text) that swaps it for the design's `.photo-thumb-broken` placeholder via
      DOM methods. `setListState('loading'|'error'|'empty'|'success')` drives the four
      loading/error/empty/success panels exactly as the design's own `setListState` does (minus the
      `partial` branch — see open question). All text content is inserted via the existing
      `escapeHtml(doc, str)` helper from `public/js/utils.js`, same as every other domain's JS.
    files:
      - public/js/jobs.js
    rationale: |
      Reuses the established inject-an-`api`-object test seam from `defects.js` so UI tests can
      drive every list state deterministically without a real server, and reuses `utils.js`'s
      `escapeHtml` rather than reintroducing string-escaping.

tests:
  - |
    API — AC1 (`test/jobs.test.js`, supertest against `src/server.js`, modeled on `test/defects.test.js`):
    ```js
    test('AC1: returns only this technician's Assigned/Accepted/In Progress jobs, sorted ascending by scheduled time', async () => {
      const res = await request(app).get('/jobs').set('x-user-id', 'marcus-webb');
      expect(res.status).toBe(200);
      expect(res.body.every((j) => ['Assigned', 'Accepted', 'In Progress'].includes(j.status))).toBe(true);
      expect(res.body.find((j) => j.id === 'JOB-9001')).toBeUndefined(); // another technician's job
      expect(res.body.find((j) => j.id === 'JOB-9002')).toBeUndefined(); // this technician's but Completed
      const times = res.body.map((j) => new Date(j.scheduledStart).getTime());
      expect(times).toEqual([...times].sort((a, b) => a - b));
    });
    ```
    This is written first and will fail (404, no `/jobs` route) until `src/jobs/*` and the
    `server.js` mount exist.
  - |
    UI — AC2 (`test/jobs-list-ui.test.js`, jsdom, modeled on `test/defects-list-detail-ui.test.js`):
    ```js
    test('AC2: a job card shows customer name, address, time window, problem description and photos', async () => {
      const job = { id: 'JOB-1', customerName: 'Dana Whitfield', address: '142 Birchwood Ln, Rosedale',
        scheduledStart: '2026-10-08T08:00:00', scheduledEnd: '2026-10-08T09:00:00',
        problemDescription: 'Kitchen faucet has been dripping steadily for about a week.',
        serviceCategory: 'Plumbing', status: 'Accepted',
        photos: [{ id: 'p1', caption: 'Faucet handle', url: 'https://example.test/p1.jpg' }] };
      const api = { list: jest.fn().mockResolvedValue([job]) };
      initJobsApp(document, api);
      await flush();
      const card = document.querySelector('.job-card');
      expect(card.textContent).toContain('Dana Whitfield');
      expect(card.textContent).toContain('142 Birchwood Ln, Rosedale');
      expect(card.textContent).toContain('Kitchen faucet has been dripping steadily for about a week.');
      const img = card.querySelector('img.photo-thumb');
      expect(img.alt).toBe('Customer photo: Faucet handle');
    });
    ```
  - |
    UI — AC3 (`test/jobs-list-ui.test.js`):
    ```js
    test('AC3: the service category is shown when one was captured at booking', async () => {
      const api = { list: jest.fn().mockResolvedValue([{ ...baseJob, serviceCategory: 'Electrical' }]) };
      initJobsApp(document, api);
      await flush();
      expect(document.querySelector('.job-category-row .chip').textContent).toBe('Electrical');
    });
    ```
  - |
    UI — AC4 (`test/jobs-list-ui.test.js`):
    ```js
    test('AC4: no service category is shown when none was captured at booking', async () => {
      const api = { list: jest.fn().mockResolvedValue([{ ...baseJob, serviceCategory: null }]) };
      initJobsApp(document, api);
      await flush();
      expect(document.querySelector('.job-category-row')).toBeNull();
    });
    ```
  - |
    UI — AC5 (`test/jobs-list-ui.test.js`):
    ```js
    test('AC5: at most one job in the list is shown with an In Progress status', async () => {
      const jobs = [
        { ...baseJob, id: 'JOB-1', status: 'Assigned', scheduledStart: '2026-10-08T08:00:00' },
        { ...baseJob, id: 'JOB-2', status: 'Accepted', scheduledStart: '2026-10-08T09:00:00' },
        { ...baseJob, id: 'JOB-3', status: 'In Progress', scheduledStart: '2026-10-08T10:00:00' },
      ];
      const api = { list: jest.fn().mockResolvedValue(jobs) };
      initJobsApp(document, api);
      await flush();
      expect(document.querySelectorAll('.status-chip.status-in-progress').length).toBeLessThanOrEqual(1);
    });
    ```
    This deliberately does not assert the backend *enforces* the invariant (the design's own note
    says the view assumes that's enforced by the separate status-change story) — it only asserts
    the list renders whatever the backend returned without ever introducing a second In Progress
    chip client-side.
  - |
    Supporting, not an independently numbered AC but required for AC1's list to behave correctly
    when it's empty (`test/jobs-list-ui.test.js`):
    ```js
    test('shows the empty state when the technician has no assigned jobs', async () => {
      const api = { list: jest.fn().mockResolvedValue([]) };
      initJobsApp(document, api);
      await flush();
      expect(document.getElementById('job-list-empty').hidden).toBe(false);
    });
    ```
  - |
    Supporting, same reasoning as above but for the network-failure path shown in the design's
    `#list-error` banner (`test/jobs-list-ui.test.js`):
    ```js
    test('shows the error banner with a retry action when the jobs request fails', async () => {
      const api = { list: jest.fn().mockRejectedValue({ status: 500 }) };
      initJobsApp(document, api);
      await flush();
      expect(document.getElementById('list-error').hidden).toBe(false);
    });
    ```

assumptions_or_open_questions:
  - |
    The design's "partial" state (some customer photos fail to load, shown via a dismissable
    `.photo-warning` "Retry" link per photo plus a page-level `.state-banner` and a live-region
    announcement) is fully designed but not required by any of the five stated ACs — AC2 only
    requires photos to display when present. This plan implements a plain broken-image fallback
    (swap to the design's `.photo-thumb-broken` placeholder on `<img>` `error`) but does NOT
    implement the retry-link/partial-banner machinery, since that's meaningfully more surface area
    than "display photos." Flagging this explicitly per instructions rather than silently picking a
    side — if the reviewer wants the full partial-state UX in this story rather than a follow-up,
    say so and it'll be added.
  - |
    Treated "jobs assigned to them" (AC1) as meaning jobs whose `technicianId` matches the
    requesting user's `x-user-id`, reusing the same client-asserted-header identity model
    `src/defects/auth.js` already uses — there's no real auth/session system anywhere in this
    codebase yet, so this isn't a regression, just consistency with existing precedent.
  - |
    Assumed no pagination is needed (design shows a single scrollable list of six jobs, no
    pagination controls anywhere in the "My Jobs" screen), unlike `defects.html`'s paginated list.
  - |
    Assumed service-category and photo fields are stored directly on the job record (no separate
    "booking" entity exists anywhere in this codebase to join against), since the story only
    requires showing whatever category/photos were "captured at booking," not managing bookings.

package_dependencies: []

notes: |
  Research: read `src/defects/{store,routes,auth}.js`, `public/defects.html`,
  `public/css/defects.css`, `public/js/defects.js`, and `test/defects.test.js` /
  `test/defects-list-detail-ui.test.js` as the closest existing analog (a recently-added,
  per-domain, store+router+static-page list/detail feature with its own test-injected `api` seam).
  Also checked `src/runs/routes.js` (plain-array list response, no pagination) and
  `src/projects/store.js` (membership-style filtering precedent for `listProjectIdsForUser`,
  analogous to this plan's `technicianId` filtering). Confirmed via `Grep` that no `jobs` or
  `technician` concept exists anywhere in `src/` today, and confirmed `public/index.html` does not
  link to any of the other per-domain pages (`defects.html`, `rooms.html`, etc.), so `jobs.html`
  is correctly a new, unlinked standalone entry point like its peers.

  ```mermaid
  flowchart TD
    serverjs["src/server.js"]
    jobsroutes["src/jobs/routes.js"]
    jobsauth["src/jobs/auth.js"]
    jobsstore["src/jobs/store.js"]
    jobshtml["public/jobs.html"]
    jobsjs["public/js/jobs.js"]
    jobscss["public/css/jobs.css"]
    utilsjs["public/js/utils.js"]

    serverjs -->|mounts /jobs| jobsroutes
    jobsroutes -->|requireAuthenticatedUser| jobsauth
    jobsroutes -->|listAssignedJobs req.userId| jobsstore
    jobshtml -->|loads| jobsjs
    jobshtml -->|loads| jobscss
    jobsjs -->|escapeHtml| utilsjs
    jobsjs -->|"fetch GET /jobs (x-user-id header)"| jobsroutes

    classDef touched fill:#a855f7,color:#000000;
    class serverjs,jobsroutes,jobsauth,jobsstore,jobshtml,jobsjs,jobscss touched;
  ```

review_focus: |
  In scope: a new read-only `jobs` domain (store + router + static page) returning/rendering only
  jobs assigned to the requesting technician with status Assigned/Accepted/In Progress, sorted
  ascending by `scheduledStart`. Out of scope (don't flag as missing): accept/decline, any
  status-change action, pagination, and the design's full "partial" broken-photo-retry UX (see
  open question — only a plain broken-image fallback is implemented). Riskiest area: the photo
  rendering/omission logic and the service-category omission logic (AC2–AC4) — both must render
  *nothing* (no empty section, no "Not specified" placeholder) when the data is absent, which is
  easy to get subtly wrong by rendering an empty wrapper element instead of skipping it entirely.
  The `x-user-id`-header identity model is deliberately copied from `src/defects/auth.js`'s
  existing precedent, not a new weakening of auth — there is no real session system elsewhere in
  this codebase to be consistent with instead.
