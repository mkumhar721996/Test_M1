summary: |
  Surface a labelled, boundary-respecting deep link from the onboarding dashboard to arc's
  native run/eval view, per the approved prototype at
  `.arc/designs/TEST-M1-STORY-084-design.html` (Screens 1 "Pipeline Dashboard" and 2 "Hire
  Pipeline Detail" — Screen 3 "Reference & Edge States" is explicitly reviewer-only per its own
  code comment and is not built). Today the codebase has no multi-hire pipeline view at all —
  only a single-hire `public/hire-profile.html` for profile CRUD — and `hire.run` objects
  (created via `src/onboarding/engineClient.js`) carry no notion of an arc URL. This plan adds
  (a) an `arcRunUrl` field to the Run objects the onboarding engine stub issues, so it flows
  untouched through the existing `src/hires/store.js` and `src/hires/routes.js` layers with no
  route changes, and (b) a new static page (`public/pipeline.html` + `.css` + `.js`, following
  the exact `initXApp(doc, data, api)` / screen-toggle-via-`hidden` pattern already used by
  `public/js/guest-profiles.js`) that lists hires and renders the arc deep link in its three
  possible states (available / disabled / absent), plus a read-only detail view carrying the
  same link, a boundary card, and a security note — with no arc controls or iframes ever
  rendered onboarding-side.

scope:
  - description: |
      Give a triggered Run an arc deep-link URL. `triggerRun` in `src/onboarding/engineClient.js`
      currently returns a Run object with no URL field at all:
      ```js
      async function triggerRun({ hireId, department, role }) {
        seq += 1;
        return {
          id: `run_${7200 + seq}`,
          hireId, department, role,
          status: 'active',
          startedAt: new Date().toISOString(),
          tasksDone: 0,
        };
      }
      ```
      Add a deterministic `arcRunUrl` derived from the run's own id, matching the URL shape
      shown in the approved prototype (`https://arc.example.com/runs/run_8823/eval`):
      ```js
      async function triggerRun({ hireId, department, role }) {
        seq += 1;
        const id = `run_${7200 + seq}`;
        return {
          id, hireId, department, role,
          status: 'active',
          startedAt: new Date().toISOString(),
          tasksDone: 0,
          arcRunUrl: `https://arc.example.com/runs/${id}/eval`,
        };
      }
      ```
      This is the only backend change required: `src/hires/store.js` already does
      `hire.run = run` verbatim (createHire, updateHire, reactivateHire all call
      `engineClient.triggerRun` and assign its return value directly), and
      `src/hires/routes.js` GET `/hires` / GET `/hires/:id` already serialize the hire object
      as-is, so `arcRunUrl` reaches the frontend with zero store/route edits.
    files:
      - src/onboarding/engineClient.js
    rationale: |
      AC1 is gated on "the arc run URL is available for that hire" — that URL has to originate
      somewhere real, and `engineClient.triggerRun` is the single place a Run (and thus its
      arc identity) is created today. Deriving the URL from the run's own id keeps it
      consistent with `engineClient`'s existing fully-synchronous stub style (no other field
      on this object is async-issued either).

  - description: |
      Unit-test the new field in isolation before wiring anything else to it.
    files:
      - test/engine-client.test.js
    rationale: |
      Test-first: this is the one true source of the arc URL, so it gets its own focused test
      ahead of the store/route/frontend work that consumes it.

  - description: |
      Add one end-to-end assertion to the existing per-AC store test suite confirming
      `arcRunUrl` survives `createHire` unmodified, matching this file's established
      one-test-per-behavior convention (see its existing `AC1`..`AC8` tests).
    files:
      - test/hires-store.test.js
    rationale: |
      `test/hires-store.test.js` already asserts Run shape after `createHire`
      (`expect(getHire(hire.id).run).toMatchObject({ status: 'active', ... })`); extending it
      confirms the store layer doesn't need to (and doesn't) touch or strip the new field.

  - description: |
      Build the Pipeline Dashboard (prototype Screen 1) and Hire Pipeline Detail (prototype
      Screen 2) as one new static page, following the exact two-screen-toggled-by-`hidden`
      pattern `public/guest-profiles.html` / `public/js/guest-profiles.js` already use for
      "directory-screen" + "profile-screen" (back-link included). New files:
      - `public/pipeline.html` — `<div id="dashboard-screen">` (app-topbar with nav
        "Pipeline" active / "Hires" / "Settings" per the prototype; page-header with the
        prototype's exact copy "Hire pipeline status" / "Arc runs and scores each hire's
        onboarding pipeline. Use "View run in arc" to inspect the full run and eval detail in
        arc's own workspace."; an empty-state card for zero hires; `<div id="hire-list">`
        rendered by JS) and `<div id="detail-screen" hidden>` (back-link
        "← Back to pipeline dashboard"; `<div id="detail-body">` rendered by JS; a toast for
        the AC2 "opening in a new tab" confirmation, exactly as the prototype's Screen 2 shows).
      - `public/css/pipeline.css` — ports the prototype's own `.hire-list` / `.hire-row` /
        `.hire-main` / `.hire-name-row` / `.hire-name` / `.hire-role` / `.open-detail-btn` /
        `.arc-link-cell` / `.arc-link-btn` / `.arc-link-caption` / `.arc-link-absent` /
        `.layout-grid` / `.summary-row` / `.boundary-card` / `.security-note` / `.back-link` /
        `.state-card` rules verbatim (all already token-only in the prototype's inlined CSS);
        `.btn`, `.btn-secondary`, `.card`, `.card-title`, `.app-topbar`, `.page`,
        `.page-header`, `.toast` are reused as-is from `design-system/prototype-utils.css`
        (same convention `hire-profile.css` / `guest-profiles.css` already follow — those
        files don't redefine the shared shell either).
      - `public/js/pipeline.js` — exports `initPipelineApp(doc, initialHires)`:
        ```js
        function arcLinkMarkup(doc, run) {
          if (!run) {
            return '<p class="arc-link-absent"><strong>No arc run yet.</strong> A deep link ' +
              'will appear here once this hire’s pipeline starts.</p>';
          }
          if (!run.arcRunUrl) {
            return `
              <button class="btn btn-secondary arc-link-btn" type="button" disabled aria-disabled="true">
                <span aria-hidden="true">↗</span> View run in arc
              </button>
              <p class="arc-link-caption">Not clickable yet — available once arc issues a run URL for this hire.</p>
            `;
          }
          return `
            <a class="btn btn-secondary arc-link-btn" href="${escapeHtml(doc, run.arcRunUrl)}" target="_blank" rel="noopener noreferrer" data-arc-link>
              <span aria-hidden="true">↗</span> View run in arc
            </a>
            <p class="arc-link-caption">Opens in a new tab using this run's own URL — no onboarding credentials are shared.</p>
          `;
        }
        ```
        Dashboard rows render `arcLinkMarkup(doc, hire.run)` in an `.arc-link-cell`, plus a
        "View pipeline detail →" button (`data-open-detail="${hire.id}"`) that swaps
        `dashboard-screen`/`detail-screen` visibility via `hidden`, exactly like
        `guest-profiles.js`'s `openProfile`/back-link pair. The detail screen renders the same
        `arcLinkMarkup` result plus a static boundary card ("Re-run, prompt tuning, and eval
        scoring are never embedded or proxied here — they only exist in arc, reached via the
        link above.") and security note ("Opening the link passes no onboarding credentials or
        session tokens to arc — only the run's own URL."), both copied from the prototype's
        Screen 2. The `[data-arc-link]` click handler (when present) only calls
        `showToast(...)` — it never calls `preventDefault()` or touches the anchor's `href`,
        so default `target="_blank"` navigation is never blocked (AC2). Bootstraps itself via
        `fetch('/hires')` on `DOMContentLoaded`, matching `hire-profile.js` / `guest-profiles.js`.
    files:
      - public/pipeline.html
      - public/css/pipeline.css
      - public/js/pipeline.js
    rationale: |
      This is the only screen in the codebase today that shows *all* hires' pipeline status at
      once (AC1's "viewing a hire's pipeline status" precondition) — `hire-profile.html` only
      ever shows one hire (`hires[0]` from `/hires`). The prototype's Screen 1 + Screen 2 are
      the only committed design record for this, so the dashboard is built new rather than
      grafted onto the unrelated single-hire profile-CRUD page.

  - description: |
      Cover the new page with jsdom tests, one per AC, following
      `test/hire-profile.test.js` / `test/guest-profiles.test.js`'s existing pattern of loading
      the real HTML file into `document.documentElement.innerHTML` and driving
      `initPipelineApp` directly.
    files:
      - test/pipeline.test.js
    rationale: |
      Matches this repo's established frontend-testing convention exactly (no new test
      tooling needed).

tests:
  - |
    AC1 (backend) — `test/engine-client.test.js`:
    ```js
    const { triggerRun } = require('../src/onboarding/engineClient');
    test("triggerRun issues an arc run URL derived from the run's own id", async () => {
      const run = await triggerRun({ hireId: 'hire_1', department: 'Engineering', role: 'SWE II' });
      expect(run.arcRunUrl).toBe(`https://arc.example.com/runs/${run.id}/eval`);
    });
    ```
    Fails today because `triggerRun`'s returned object has no `arcRunUrl` key at all.
  - |
    AC1 (store, end to end) — new case appended to `test/hires-store.test.js`:
    ```js
    test('AC1 (arc deep link): a triggered Run carries an arc run URL derived from its own run id', async () => {
      const hire = await createHire({ name: 'A', email: 'a@x.com', phone: '1', startDate: '2026-10-05', department: 'Engineering', role: 'Engineer II', hireStage: 'offer_accepted' });
      const run = getHire(hire.id).run;
      expect(run.arcRunUrl).toBe(`https://arc.example.com/runs/${run.id}/eval`);
    });
    ```
  - |
    AC1 (UI) — `test/pipeline.test.js`, dashboard shows a labelled link when the URL is available:
    ```js
    test('AC1: dashboard shows a labelled arc deep link when the run URL is available', () => {
      const hire = { id: 'hire_1', name: 'Jordan Reyes', department: 'Engineering', role: 'Software Engineer II', hireStage: 'offer_accepted', profileStatus: 'active', runHistory: [], run: { id: 'run_1', status: 'active', arcRunUrl: 'https://arc.example.com/runs/run_1/eval' } };
      const { initPipelineApp } = require('../public/js/pipeline');
      initPipelineApp(document, [hire]);
      const link = document.querySelector('[data-arc-link]');
      expect(link.textContent).toContain('View run in arc');
      expect(link.getAttribute('href')).toBe('https://arc.example.com/runs/run_1/eval');
    });
    ```
    Fails until `public/pipeline.html`/`.js` exist.
  - |
    AC2 (UI) — activating the link opens in a new tab without being blocked:
    ```js
    test("AC2: activating the arc link opens arc's view in a new tab and does not block default navigation", () => {
      const hire = { id: 'hire_1', name: 'Jordan Reyes', department: 'Engineering', role: 'Software Engineer II', hireStage: 'offer_accepted', profileStatus: 'active', runHistory: [], run: { id: 'run_1', status: 'active', arcRunUrl: 'https://arc.example.com/runs/run_1/eval' } };
      const { initPipelineApp } = require('../public/js/pipeline');
      initPipelineApp(document, [hire]);
      const link = document.querySelector('[data-arc-link]');
      expect(link.getAttribute('target')).toBe('_blank');
      expect(link.getAttribute('rel')).toBe('noopener noreferrer');
      const evt = new MouseEvent('click', { bubbles: true, cancelable: true });
      link.dispatchEvent(evt);
      expect(evt.defaultPrevented).toBe(false);
    });
    ```
  - |
    AC3 (UI) — the link carries no credentials or tokens beyond the run's own URL:
    ```js
    test("AC3: the arc link href is exactly the run's own URL, nothing appended", () => {
      const rawUrl = 'https://arc.example.com/runs/run_1/eval';
      const hire = { id: 'hire_1', name: 'Jordan Reyes', department: 'Engineering', role: 'Software Engineer II', hireStage: 'offer_accepted', profileStatus: 'active', runHistory: [], run: { id: 'run_1', status: 'active', arcRunUrl: rawUrl } };
      const { initPipelineApp } = require('../public/js/pipeline');
      initPipelineApp(document, [hire]);
      const link = document.querySelector('[data-arc-link]');
      expect(link.getAttribute('href')).toBe(rawUrl);
      expect([...link.attributes].map((a) => a.name)).toEqual(expect.arrayContaining(['class', 'href', 'target', 'rel', 'data-arc-link']));
      expect(link.hasAttribute('data-auth-token')).toBe(false);
    });
    ```
  - |
    AC4 (UI) — disabled when a Run exists but arc hasn't issued a URL yet:
    ```js
    test('AC4: link is disabled, not broken, when the run exists but has no arc URL yet', () => {
      const hire = { id: 'hire_2', name: 'Miguel Ortiz', department: 'Sales', role: 'AE', hireStage: 'offer_accepted', profileStatus: 'active', runHistory: [], run: { id: 'run_2', status: 'active', arcRunUrl: null } };
      const { initPipelineApp } = require('../public/js/pipeline');
      initPipelineApp(document, [hire]);
      expect(document.querySelector('[data-arc-link]')).toBeNull();
      const btn = document.querySelector('.arc-link-btn');
      expect(btn.tagName).toBe('BUTTON');
      expect(btn.disabled).toBe(true);
    });
    ```
  - |
    AC4 (UI) — absent, not broken, when there is no run at all:
    ```js
    test('AC4: link is absent, not broken, when the hire has no run yet', () => {
      const hire = { id: 'hire_3', name: 'Sam Whitfield', department: 'People Ops', role: 'Recruiter', hireStage: 'draft', profileStatus: 'active', runHistory: [], run: null };
      const { initPipelineApp } = require('../public/js/pipeline');
      initPipelineApp(document, [hire]);
      expect(document.querySelector('[data-arc-link]')).toBeNull();
      expect(document.querySelector('.arc-link-btn')).toBeNull();
      expect(document.querySelector('.arc-link-absent')).not.toBeNull();
    });
    ```
  - |
    AC5 (UI) — no arc controls or embeds anywhere on the detail screen:
    ```js
    test('AC5: no re-run/prompt-tuning/eval controls or iframes are embedded on the detail screen', () => {
      const hire = { id: 'hire_1', name: 'Jordan Reyes', department: 'Engineering', role: 'Software Engineer II', hireStage: 'offer_accepted', profileStatus: 'active', runHistory: [], run: { id: 'run_1', status: 'active', arcRunUrl: 'https://arc.example.com/runs/run_1/eval' } };
      const { initPipelineApp } = require('../public/js/pipeline');
      initPipelineApp(document, [hire]);
      document.querySelector('[data-open-detail]').click();
      expect(document.querySelectorAll('iframe').length).toBe(0);
      expect(document.body.textContent.toLowerCase()).not.toMatch(/re-run|prompt tuning|eval scoring/);
    });
    ```

assumptions_or_open_questions:
  - >
    The prototype's dashboard stage-chip taxonomy (active/done/pending/blocked/draft, each with
    its own icon) does not map onto the real hire data model, which only has `hireStage`
    (draft/offer_accepted), `profileStatus` (active/deactivated), and `run.status`
    (active/cancelled from `engineClient`). Rather than invent new enum values purely for chip
    cosmetics — none of AC1–AC5 require a stage chip at all — the dashboard/detail rows show a
    simplified status label derived from the fields that actually exist. Flagging this as a
    deliberate prototype/data-model gap rather than silently fabricating the richer taxonomy.
  - >
    AC4 says the link must be "absent or disabled"; the prototype actually shows two visually
    distinct "no URL" states ("disabled — run starting" vs "absent — run blocked upstream") that
    carry identical underlying fixture data (arcRunUrl: null, runId: null) and differ only by an
    unrelated stage label. Since the real data model can't distinguish those two cases today,
    this plan maps hire.run === null to absent (no button at all) and hire.run present but
    arcRunUrl falsy to disabled (visible disabled button), and does not add a third state.
  - >
    The prototype's dashboard loading/error-with-retry skeleton states are demoed via a
    dev-toolbar that its own code comment marks as "a reviewer-only harness (not part of the
    real product)". No existing page in this codebase (hire-profile.js, guest-profiles.js)
    implements a loading/error skeleton for its initial bootstrap fetch either — both just
    fetch(...).then((res) => res.json()).then(init...) with no catch. Since no AC requires
    dashboard-level loading/error handling, this plan matches the existing bootstrap convention
    (success + empty-list states only) rather than adding new error-handling scope beyond what
    any other page here does.
  - >
    Screen 3 ("Reference & Edge States") in the prototype is explicitly reviewer-only per its
    own comment ("for reviewers who want a quick scan without driving the full script") and is
    excluded from the build, per the instruction that reviewer-only harness elements aren't
    part of the real product UI.
  - >
    engineClient.triggerRun's new arcRunUrl is synchronous and deterministic
    (https://arc.example.com/runs/${run.id}/eval), matching this stub's existing
    fully-synchronous style — there is no real arc integration in this codebase today, so this
    is a stand-in exactly as triggerRun/cancelRun already are for the onboarding engine.
  - >
    No authentication/session/token mechanism exists anywhere in this codebase today (grepped
    src/ for token|session|auth|cookie — no matches), so AC3 is satisfied structurally by
    construction (bare href = run.arcRunUrl, target="_blank", rel="noopener noreferrer", no
    fetch/XHR call to arc's origin) rather than by stripping something from an existing
    credential-passing path.

package_dependencies: []

notes: |
  No new third-party packages are needed — this stays entirely within the existing
  express/jest/jsdom/supertest stack already used by every sibling page and route.

  ```mermaid
  flowchart TD
    EC[src/onboarding/engineClient.js]
    HS[src/hires/store.js]
    HR[src/hires/routes.js]
    PH[public/pipeline.html]
    PC[public/css/pipeline.css]
    PJ[public/js/pipeline.js]

    EC -->|triggerRun return value now includes arcRunUrl| HS
    HS -->|hire.run = run, assigned verbatim, unchanged| HR
    HR -->|GET /hires and GET /hires/:id serialize hire as-is| PJ
    PH -->|DOM ids consumed by initPipelineApp| PJ
    PC -->|styles hire-list/arc-link-btn/etc.| PH

    classDef touched fill:#f96,color:#000
    class EC,PH,PC,PJ touched
  ```

  `src/hires/store.js` and `src/hires/routes.js` are shown for context (they're the real,
  already-existing path the new `arcRunUrl` field travels through) but are not modified by
  this plan — both already pass the full hire/run object through untouched.
