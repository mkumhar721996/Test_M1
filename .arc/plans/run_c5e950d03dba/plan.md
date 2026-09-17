summary: |
  Implement the win-line celebration behaviour described by TEST-M1-STORY-016: reacting to an
  engine result payload (`{ winningLines: WinningLine[], totalWin: number }`) by highlighting
  every winning pay-line on the reel grid and showing a clear win-amount banner, then clearing
  both the instant a new spin is initiated and returning the game to an idle state. The repo is
  currently greenfield outside of the design-token system (only `design-system/` and `README.md`
  exist — no `package.json`, no app source, no test tooling), so this plan also stands up the
  minimal TypeScript + Vitest scaffold needed to TDD this feature. Scope is deliberately narrowed
  to the celebration layer only: it attaches to the DOM contract shown in the approved prototype
  (`.arc/designs/TEST-M1-STORY-016-design.html`) — a `.reel-grid` of `.reel-cell[data-col][data-row]`
  cells with a nested `.payline-overlay` SVG, and a `.win-banner` element — rather than building
  full reel rendering or spin animation, which the parent epic lists as separate concerns/stories.

scope:
  - description: |
      Bootstrap the minimal project toolchain so a failing test can even run: `package.json`
      (name, `"type": "module"`, `test` script running `vitest run`), `tsconfig.json` (strict mode,
      DOM lib), and `vitest.config.ts` with `environment: 'jsdom'`. No production code here — this
      is pure scaffolding required because the repo currently has zero application code or test
      runner.
    files:
      - package.json
      - tsconfig.json
      - vitest.config.ts
    rationale: |
      `Glob` for `**/package.json` returned nothing and the only tracked files are
      `design-system/*` and `README.md` — there is no existing stack convention to follow, so one
      must be chosen before any test-first step can execute. Vanilla TypeScript (no UI framework)
      matches the approved prototype, which is plain DOM/CSS manipulation with no framework
      dependency.

  - description: |
      Define the engine result payload shape and a pure, DOM-free celebration state store that
      the rest of the feature is built on.

      ```ts
      export type GameState = 'idle' | 'celebrating';

      export interface WinningLine {
        id: string;
        name: string;
        symbol: string;
        amount: number;
        positions: Array<[number, number]>; // [col, row]
      }

      export interface EngineResultPayload {
        winningLines: WinningLine[];
        totalWin: number;
      }

      export interface CelebrationStore {
        getState(): GameState;
        getWinningLines(): WinningLine[];
        getTotalWin(): number;
        settle(payload: EngineResultPayload): void;
        startNewSpin(): void;
      }

      export function createCelebrationStore(): CelebrationStore;
      ```

      `settle()` sets state to `'celebrating'` with the payload's lines/total when
      `winningLines.length > 0`, otherwise sets state to `'idle'` and clears both. `startNewSpin()`
      unconditionally clears `winningLines`/`totalWin` and sets state back to `'idle'`.
    files:
      - src/celebration/types.ts
      - src/celebration/celebrationStore.ts
      - src/celebration/celebrationStore.test.ts
    rationale: |
      Field names and shapes (`winningLines`, `totalWin`, `id`/`name`/`symbol`/`amount`/`positions`
      as `[col,row]` pairs) are taken verbatim from the prototype's inline fixtures (e.g. the
      `singleWin`/`multiWin` fixtures in the `<script>` block), so the celebration store's
      contract matches the payload shape the design already assumes the engine emits.

  - description: |
      Render/clear the visual highlight layer on the reel grid: the `is-win` class on matching
      `.reel-cell` elements (which drives the prototype's `win-pulse` CSS animation), and the SVG
      `polyline` payline trace (`payline-secondary` dashed style for the 2nd+ simultaneous line).

      ```ts
      export function applyWinHighlights(gridEl: HTMLElement, winningLines: WinningLine[]): void;
      export function clearWinHighlights(gridEl: HTMLElement): void;
      export function renderPaylineOverlay(svgEl: SVGSVGElement, winningLines: WinningLine[]): void;
      export function clearPaylineOverlay(svgEl: SVGSVGElement): void;
      ```
    files:
      - src/celebration/reelHighlights.ts
      - src/celebration/reelHighlights.test.ts
    rationale: |
      Mirrors the prototype's `applyWinLines`/`clearWinLines` functions exactly: for each winning
      line, every `[col,row]` in `positions` gets its matching
      `.reel-cell[data-col="c"][data-row="r"]` marked `is-win`, and a `polyline` is appended to the
      `.payline-overlay` SVG with `payline-secondary` added when `idx > 0` (the design's own note
      that a second accent colour doesn't exist yet in `tokens.json`, so simultaneous lines are
      distinguished by dash pattern, not colour).

  - description: |
      Render/clear the win banner: total win amount and a per-line chip breakdown, shown/hidden
      via the `hidden` attribute exactly as `.win-banner[hidden]` does in the prototype CSS.

      ```ts
      export function showWinBanner(bannerEl: HTMLElement, payload: EngineResultPayload): void;
      export function hideWinBanner(bannerEl: HTMLElement): void;
      ```
    files:
      - src/celebration/winBanner.ts
      - src/celebration/winBanner.test.ts
    rationale: |
      Matches the prototype's `showBanner`/`hideBanner`: renders a `.win-label` ("Total Win"), a
      `.win-amount` formatted as `` $${totalWin.toFixed(2)} ``, and one `.chip` per winning line
      reading `` ${name} — $${amount.toFixed(2)} `` inside `.win-lines`; `hideWinBanner` sets
      `hidden = true` and empties the banner's content.

  - description: |
      Wire the store to the DOM layer: a controller that a future reel/game-shell component (built
      by a separate story) can call when the engine result payload arrives or when a new spin
      starts.

      ```ts
      export interface CelebrationDom {
        gridEl: HTMLElement;
        svgEl: SVGSVGElement;
        bannerEl: HTMLElement;
      }

      export function attachCelebration(
        store: CelebrationStore,
        dom: CelebrationDom
      ): { onResult(payload: EngineResultPayload): void; onNewSpin(): void };
      ```

      `onResult` calls `store.settle(payload)` then applies/clears highlights, overlay and banner
      to match; `onNewSpin` calls `store.startNewSpin()` then clears highlights, overlay and
      banner unconditionally.
    files:
      - src/celebration/celebrationController.ts
      - src/celebration/celebrationController.test.ts
    rationale: |
      This is the integration point that makes AC1–AC6 hold together end-to-end (state +
      highlights + banner in sync) without this story having to build the reel grid's own
      rendering, spin RNG, or spin animation, which the parent epic scopes to separate concerns
      ("reel rendering, spin animations" are listed alongside, not as part of, "win-line
      celebrations").

tests:
  - |
    AC1 — winning lines are highlighted on the grid. In `reelHighlights.test.ts`, build a 5x3 grid
    fixture of `.reel-cell[data-col][data-row]` elements, call
    `applyWinHighlights(grid, [{ id:'line-2', name:'Middle Row', symbol:'7️⃣', amount:12.5,
    positions:[[0,1],[1,1],[2,1],[3,1],[4,1]] }])`, then assert:
    `expect(grid.querySelectorAll('.reel-cell.is-win').length).toBe(5);`
    and that a polyline was traced:
    `expect(svg.querySelectorAll('polyline').length).toBe(1);`
  - |
    AC2 — win amount is displayed clearly. In `winBanner.test.ts`, call
    `showWinBanner(banner, { winningLines: [...], totalWin: 12.5 })` then assert:
    `expect(banner.hidden).toBe(false);` and
    `expect(banner.querySelector('.win-amount')?.textContent).toBe('$12.50');`
  - |
    AC3 — no winning lines means no highlights. In `celebrationStore.test.ts`:
    `store.settle({ winningLines: [], totalWin: 0 }); expect(store.getWinningLines()).toEqual([]);`
    and in `reelHighlights.test.ts`, calling `applyWinHighlights(grid, [])` then asserting:
    `expect(grid.querySelectorAll('.reel-cell.is-win').length).toBe(0);`
  - |
    AC4 — no winning lines means no win-amount display. In `winBanner.test.ts`:
    `hideWinBanner(banner); expect(banner.hidden).toBe(true); expect(banner.innerHTML).toBe('');`
    and in `celebrationController.test.ts`, calling
    `controller.onResult({ winningLines: [], totalWin: 0 })` then asserting
    `expect(bannerEl.hidden).toBe(true);`
  - |
    AC5 — new spin clears highlights. In `celebrationController.test.ts`, settle a multi-line win
    first, confirm highlights exist, then call `controller.onNewSpin()` and assert:
    `expect(gridEl.querySelectorAll('.reel-cell.is-win').length).toBe(0);` and
    `expect(svgEl.querySelectorAll('polyline').length).toBe(0);` and
    `expect(bannerEl.hidden).toBe(true);`
  - |
    AC6 — new spin returns to idle state. In `celebrationStore.test.ts`:
    `store.settle(multiWinPayload); expect(store.getState()).toBe('celebrating');
    store.startNewSpin(); expect(store.getState()).toBe('idle');`

assumptions_or_open_questions:
  - |
    Stack choice: the repo has no `package.json`/framework yet, so this plan introduces vanilla
    TypeScript + Vitest + jsdom, matching the prototype's own plain-DOM/CSS approach (no React/Vue
    hints anywhere in the repo or prototype). If a sibling "reel rendering" story has already
    chosen a different stack in a branch not visible here, this scaffolding step should be
    dropped/reconciled in favour of that one.
  - |
    This story does not build the reel grid's own population (symbols per cell, spin RNG) or the
    spin-in-progress animation — the parent epic lists "reel rendering" and "spin animations" as
    separate deliverables from "win-line celebrations." This plan's tests construct a minimal
    `.reel-grid`/`.reel-cell[data-col][data-row]`/`.payline-overlay` fixture directly rather than
    exercising a real reel component, and assumes a future story wires `attachCelebration` into
    the real game shell.
  - |
    AC6 ("the game returns to idle state" when a new spin is initiated) is implemented as an
    immediate, synchronous transition in this store. The prototype's own demo script instead shows
    a transient "spinning" chip state for 900ms before settling to idle/celebrating — that timing
    belongs to the separate "spin animations" story, not this one, so it is intentionally not
    replicated here. Flagging this in case the reviewer intended AC6 to describe the
    post-spin-animation idle state rather than an immediate one.
  - |
    Win amounts are assumed to be formatted as `$X.XX` (`toFixed(2)`), matching the prototype's
    `` $${amount.toFixed(2)} `` / `` $${totalWin.toFixed(2)} `` — no currency/locale requirement
    was stated elsewhere.
  - |
    The design prototype's own inline comment (around its `<style>` block) flags that
    `tokens.json`/`tokens.css` has no dedicated "win"/"success" colour yet, so celebration reuses
    `--color-primary` at varying opacity, and a second simultaneous payline is distinguished by a
    dashed stroke (`payline-secondary`) rather than a second colour. This plan preserves that
    choice as-is rather than introducing a new token, per the "do not invent design" instruction.

package_dependencies:
  - name: vitest
    version: ^2.1.4
    ecosystem: npm
    rationale: Test runner for the TDD steps above; no test tooling exists in the repo yet.
  - name: jsdom
    version: ^25.0.1
    ecosystem: npm
    rationale: |
      DOM environment for Vitest so `reelHighlights`/`winBanner`/`celebrationController` tests can
      exercise real `document`/`SVGSVGElement` APIs without a browser.
  - name: typescript
    version: ^5.6.3
    ecosystem: npm
    rationale: Language/compiler for all new source and test files; no build tooling exists yet.

notes: |
  Greenfield check: `Glob` for `**/package.json` returned no matches, and a full repo glob shows
  only `design-system/*`, `README.md`, and `.arc/**` — there is no existing "engine," "reel," or
  "game" module to integrate with today. This plan therefore introduces a self-contained
  `src/celebration/` module built strictly to the DOM contract the approved prototype defines, and
  explicitly avoids reaching into reel-rendering/spin-animation scope that the parent epic assigns
  elsewhere.

  ```mermaid
  flowchart TD
    A[celebrationStore.ts]
    B[reelHighlights.ts]
    C[winBanner.ts]
    D[celebrationController.ts]
    E[Reel grid / game shell - future sibling story, not built here]

    A -->|state: idle/celebrating, winningLines, totalWin| D
    B -->|apply/clear is-win + polyline overlay| D
    C -->|show/hide win banner| D
    D -->|onResult/onNewSpin called by| E

    classDef touched fill:#f96,color:#000
    class A,B,C,D touched
  ```
