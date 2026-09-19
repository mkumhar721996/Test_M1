summary: |
  This story implements the reel spin animation and result rendering for the slot game's web UI.
  The repository is currently greenfield for application code: only a static design-system token
  bootstrap (`design-system/tokens.css`, `prototype-utils.css`, `style-guide.html`) exists, with no
  `package.json`, no test runner, and no existing reel/spin/engine module anywhere in the codebase.
  This plan therefore (a) bootstraps a minimal vitest+jsdom test setup, and (b) implements a small,
  framework-free `SpinController` state machine plus a DOM `render.js` module that together satisfy
  the three acceptance criteria: reels start scrolling the instant a spin is requested, each reel
  comes to rest on the exact symbol positions from the engine result payload, and the rendered grid
  exactly matches those positions. Because no engine/backend module or API contract exists yet in
  this repo, the engine call is modeled as an injectable async function the caller supplies, so this
  story's animation/rendering logic is fully testable and does not block on, or invent, a backend
  contract that belongs to a different story.

scope:
  - description: |
      Bootstrap test tooling: add a root `package.json` and `vitest.config.js` configured with the
      `jsdom` test environment, plus an `npm test` script (`"test": "vitest run"`).
    files:
      - package.json
      - vitest.config.js
    rationale: |
      TDD requires a runnable test command before the first failing test can be written; nothing in
      the repo currently provides one (no `package.json` exists at all).

  - description: |
      Implement `SpinController`, a DOM-free state machine that models reel state transitions:
      `idle -> spinning -> stopped`. `startSpin` synchronously flips every reel to `'spinning'`
      before awaiting the injected engine call, then applies the resolved payload's symbols and
      flips every reel to `'stopped'`.

      ```js
      class SpinController {
        constructor({ reelCount = 3 } = {}) {}
        // requestEngineSpin: () => Promise<SpinResultPayload>
        async startSpin(requestEngineSpin) {}
        getReelStates() // => Array<'idle'|'spinning'|'stopped'>
        getFinalSymbols() // => Array<Array<string>> | Array<null>
      }
      ```
    files:
      - src/game/spinController.js
      - test/game/spinController.test.js
    rationale: |
      Encapsulating spin/result transitions independent of the DOM and independent of how the
      engine result is actually fetched lets AC1 (immediate animation start) and AC2 (exact stop
      positions) be asserted deterministically with a controllable fake promise, instead of
      depending on real network timing or CSS animation timing.

  - description: |
      Implement `render.js`, a pure DOM-rendering function that reads `SpinController` state and
      writes reel markup: while a reel is `'spinning'` it gets a `reel--spinning` class (which
      triggers the CSS scroll animation); once `'stopped'`, it renders exactly the symbols from
      `getFinalSymbols()` into per-cell elements tagged with `data-reel`/`data-row`/`data-symbol`.

      ```js
      // container: HTMLElement, state: { reelStates: string[], finalSymbols: (string[]|null)[] }
      function renderGrid(container, state) {}
      ```
    files:
      - src/game/render.js
      - test/game/render.test.js
    rationale: |
      Translating controller state into DOM markup is what actually makes AC1's "animation begins
      immediately" and AC3's "grid exactly matches payload" observable/testable in the UI layer,
      separate from the state-machine logic itself.

  - description: |
      Add `src/game/reels.css` with a `@keyframes reel-scroll` vertical-scroll animation applied via
      the `.reel--spinning` class, reusing existing design tokens (`--color-border`, `--radius-md`,
      `--space-2`) from `design-system/tokens.css` for borders/spacing so the reel grid matches the
      established visual language.
    files:
      - src/game/reels.css
    rationale: |
      Satisfies the "smooth scrolling animation" visual requirement in AC1 while staying consistent
      with the design system already established in `design-system/tokens.css` (verified tokens
      `--color-border`, `--radius-md`, `--space-2` are defined there).

  - description: |
      Add `index.html` at the repo root that mounts the reel grid container, links
      `design-system/tokens.css` and `src/game/reels.css`, and wires a "Spin" button's click handler
      to call `spinController.startSpin(requestEngineSpin)` followed by `renderGrid(...)` on every
      state change (immediately on click, and again once the injected promise resolves).
    files:
      - index.html
    rationale: |
      Provides the actual page where a player triggers a spin; keeps the real engine HTTP call as a
      small injected function since no engine API contract exists yet elsewhere in the codebase.

tests:
  - |
    AC1 (spinController.test.js) — reels begin scrolling immediately, before the engine responds:
    ```js
    import { describe, it, expect } from 'vitest';
    import { SpinController } from '../../src/game/spinController.js';

    describe('SpinController.startSpin', () => {
      it('sets every reel to spinning synchronously, before the engine promise resolves', () => {
        const controller = new SpinController({ reelCount: 3 });
        const neverResolves = new Promise(() => {});

        controller.startSpin(() => neverResolves);

        expect(controller.getReelStates()).toEqual(['spinning', 'spinning', 'spinning']);
      });
    });
    ```
    Minimal code to pass: `SpinController.startSpin` sets `this.reelStates` to `'spinning'` for all
    reels synchronously, before calling/awaiting `requestEngineSpin()`.

  - |
    AC1 (render.test.js) — the DOM reflects the spinning animation trigger immediately:
    ```js
    import { describe, it, expect } from 'vitest';
    import { renderGrid } from '../../src/game/render.js';

    describe('renderGrid while spinning', () => {
      it('applies the reel--spinning class to every reel element', () => {
        document.body.innerHTML = '<div id="grid"></div>';
        const container = document.getElementById('grid');

        renderGrid(container, { reelStates: ['spinning', 'spinning', 'spinning'], finalSymbols: [null, null, null] });

        const reelEls = [...container.querySelectorAll('[data-reel]')];
        expect(reelEls.every((el) => el.classList.contains('reel--spinning'))).toBe(true);
      });
    });
    ```
    Minimal code to pass: `renderGrid` adds `reel--spinning` to a reel's element when its state is
    `'spinning'` and omits it otherwise.

  - |
    AC2 (spinController.test.js) — each reel comes to rest on the exact payload positions:
    ```js
    it('stops each reel on the exact symbols from the engine result payload', async () => {
      const payload = {
        reels: [
          { symbols: ['CHERRY', 'BAR', 'SEVEN'] },
          { symbols: ['BELL', 'CHERRY', 'BAR'] },
          { symbols: ['SEVEN', 'SEVEN', 'BAR'] },
        ],
      };
      const controller = new SpinController({ reelCount: 3 });

      await controller.startSpin(() => Promise.resolve(payload));

      expect(controller.getReelStates()).toEqual(['stopped', 'stopped', 'stopped']);
      expect(controller.getFinalSymbols()).toEqual([
        ['CHERRY', 'BAR', 'SEVEN'],
        ['BELL', 'CHERRY', 'BAR'],
        ['SEVEN', 'SEVEN', 'BAR'],
      ]);
    });
    ```
    Minimal code to pass: on resolution of `requestEngineSpin()`, map `payload.reels[i].symbols`
    into `this.finalSymbols[i]` and flip `this.reelStates[i]` to `'stopped'`.

  - |
    AC3 (render.test.js) — the rendered grid exactly matches the payload positions once stopped:
    ```js
    it('renders a symbol grid that exactly matches the payload positions after reels stop', () => {
      document.body.innerHTML = '<div id="grid"></div>';
      const container = document.getElementById('grid');
      const finalSymbols = [
        ['CHERRY', 'BAR', 'SEVEN'],
        ['BELL', 'CHERRY', 'BAR'],
        ['SEVEN', 'SEVEN', 'BAR'],
      ];

      renderGrid(container, { reelStates: ['stopped', 'stopped', 'stopped'], finalSymbols });

      const cells = [...container.querySelectorAll('[data-reel][data-row]')];
      const rendered = cells.map((el) => el.dataset.symbol);
      expect(rendered).toEqual([
        'CHERRY', 'BAR', 'SEVEN',
        'BELL', 'CHERRY', 'BAR',
        'SEVEN', 'SEVEN', 'BAR',
      ]);
      expect(container.querySelector('.reel--spinning')).toBeNull();
    });
    ```
    Minimal code to pass: `renderGrid` writes one element per `(reel, row)` with `data-symbol` set
    from `finalSymbols[reel][row]`, and removes `reel--spinning` once a reel's state is `'stopped'`.

assumptions_or_open_questions:
  - |
    No engine/backend module or API contract exists anywhere in this codebase yet. This plan models
    the engine call as an injected async function `requestEngineSpin(): Promise<SpinResultPayload>`
    passed into `SpinController.startSpin`, so the real network integration (endpoint, auth, retry
    behavior) can be plugged in by whichever story owns the engine API contract, without this story
    inventing or blocking on it.
  - |
    Assumed a 3-reel x 3-row visible symbol grid and payload shape
    `{ reels: [{ symbols: [string, string, string] }, ...] }` with opaque string symbol IDs, since
    no schema for the "engine result payload" is defined anywhere in the repo. This may need
    reconciling once an actual engine contract is established.
  - |
    "Smooth scrolling animation" is implemented as a CSS `@keyframes` animation gated by a
    `reel--spinning` class. Automated tests verify the state/class transitions (applied immediately
    on spin, removed on stop) rather than pixel-level animation smoothness; visual smoothness should
    be manually verified in a browser during implementation.
  - |
    No `package.json` or build tooling exists in the repo. This plan introduces a minimal
    vitest+jsdom setup and plain ES modules/CSS/HTML to match the existing vanilla, framework-free
    convention in `design-system/`. If the team intends a specific UI framework for the broader
    "Game UI & Animations" epic, this vanilla-JS foundation may need revisiting in a later story.

package_dependencies:
  - name: vitest
    version: ^2.1.0
    ecosystem: npm
    rationale: |
      No test runner exists in the repo; vitest is needed to write and run the failing tests first,
      per the TDD requirement for every acceptance criterion.
  - name: jsdom
    version: ^25.0.0
    ecosystem: npm
    rationale: |
      `render.js` manipulates DOM elements and CSS classes; vitest needs a `jsdom` environment
      installed separately to run those DOM assertions under Node.

notes: |
  This mirrors the existing `design-system/` convention (plain HTML/CSS/vanilla JS, no framework,
  no build step) rather than introducing a UI framework, since nothing in the repo suggests one is
  in use yet. The engine's HTTP contract is intentionally left as an injected function boundary
  (`requestEngineSpin`) rather than a guessed `fetch('/api/spin')` call, to avoid hallucinating an
  API shape that belongs to a separate engine-integration story.

  Verified against current repo state: `design-system/tokens.css` defines `--color-border`,
  `--radius-md`, and `--space-2` (among others), confirming the token names referenced in
  `reels.css` exist. No `package.json`, `src/`, or `test/` directories exist yet, confirming the
  bootstrap step is still required.

  Implementation order (TDD): (1) bootstrap `package.json`/`vitest.config.js` and confirm `npm test`
  runs with zero tests, (2) write and fail the `spinController.test.js` AC1 test, then implement just
  enough of `SpinController` to pass it, (3) repeat for the AC2 test, (4) write and fail the
  `render.test.js` AC1 test, implement `render.js`'s spinning-class behavior, (5) write and fail the
  AC3 test, implement the final-grid rendering, (6) add `reels.css` keyframes and `index.html` wiring
  last, since neither is covered by an automated assertion and both should be checked manually in a
  browser.

  ```mermaid
  flowchart TD
    A[index.html] -->|"wires Spin button,\ninjects requestEngineSpin"| B[spinController.js]
    B -->|"reelStates + finalSymbols"| C[render.js]
    C -->|"applies reel--spinning /\nrenders grid markup"| D[reels.css]
    D -->|"var(--color-border), var(--radius-md),\nvar(--space-2) tokens"| E[design-system/tokens.css]

    classDef touched fill:#f96,color:#000
    class A,B,C,D touched
  ```
