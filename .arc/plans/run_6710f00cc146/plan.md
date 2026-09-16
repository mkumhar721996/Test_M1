summary: |
  This repo currently has no application code at all — only the design-system tokens
  (design-system/tokens.css, prototype-utils.css) and the approved prototype for this story
  (.arc/designs/TEST-M1-STORY-012-design.html). There is no framework, bundler, or test runner
  yet. This plan therefore does two things: (1) stands up the minimal project scaffold
  (Vite + TypeScript + Vitest + Testing Library) needed to write and run tests at all, and
  (2) implements the Zero-Balance Recovery flow exactly as shown in Screen 3 ("Zero-Balance
  Recovery (interactive)") of the prototype — a persistent game view (reel grid, spin controls,
  status live-region, session stats) plus a Play Again affordance that appears only once balance
  drops below the 10-credit minimum bet, resets the session in place (no reload, no remount), and
  is keyboard-accessible and screen-reader-announced. The real spin/RNG mechanic and bet
  increment/decrement logic belong to sibling Wallet & Betting stories not yet built; this plan
  adds only the minimal `applySpinResult` seam needed to make "a spin result is applied" a
  concrete, testable trigger for the recovery flow, per the acceptance criteria.
scope:
  - description: |
      Add the minimal project scaffold: `package.json`, `tsconfig.json`, `vite.config.ts`
      (Vitest config lives here via the `test` key, `environment: 'jsdom'`), and
      `tests/setup.ts` importing `@testing-library/jest-dom` for matchers. Nothing in the repo
      currently declares a stack (no `package.json`, no `src/`), so this is a prerequisite for
      every other item below — no test in this plan can run without it.
    files:
      - package.json
      - tsconfig.json
      - vite.config.ts
      - tests/setup.ts
    rationale: |
      The repo is greenfield beyond the design tokens and the approved prototype; TDD requires
      a runnable test harness before any failing test can be written.
  - description: |
      Create the pure session-state module: `MIN_BET`/`DEFAULT_BALANCE` constants, the
      `SessionState` shape (balance, bet, lastBet, winTotal, spinHistory), `createInitialSession`,
      `applySpinResult(state, netDelta)`, `isBelowMinBet(state)`. This is the seam the UI layer
      calls on "spin result applied" (ACs 1-3) and "reset" (ACs 4, 11).

      ```ts
      export const MIN_BET = 10;
      export const DEFAULT_BALANCE = 1000;

      export interface SessionState {
        balance: number;
        bet: number;
        lastBet: number | null;
        winTotal: number;
        spinHistory: number[];
      }

      export function createInitialSession(): SessionState;
      export function applySpinResult(state: SessionState, netDelta: number): SessionState;
      export function isBelowMinBet(state: SessionState): boolean;
      ```
    files:
      - src/session/gameSession.ts
      - tests/session/gameSession.test.ts
    rationale: |
      Keeps the balance-threshold and reset-defaults logic (ACs 3, 4, 11) independently testable
      from the DOM, and gives the UI layer a single source of truth to reset to.
  - description: |
      Build the `GameApp` DOM controller that mounts the interactive Screen 3 markup from the
      prototype once (canvas panel with `.reel-grid`/`.reel-cell`, `#liveRegion`
      `role="status"`, `#playAgainWrap`/`#playAgainBtn`, `#spinBtn`/`#betDownBtn`/`#betUpBtn`
      spin controls, and the `.stat-list` session stats), then only mutates targeted nodes
      afterwards (never re-assigns `innerHTML` after the initial mount) so the panel's DOM
      identity survives a bust-and-recover cycle (AC 7). Wires: Play Again visibility gated on
      `isBelowMinBet` (AC 1, 3), spin-controls disable/enable in lockstep (AC 2, 5), focus
      management (AC 9), the disable-before-reset ordering (AC 12) and re-entrancy guard
      (AC 13), the combined live-region announcement copied verbatim from the prototype's
      simulation script (AC 10), and full ancillary-state reset (AC 4, 11).

      ```ts
      export interface GameAppOptions {
        initialState?: SessionState;
        resetSession?: () => SessionState;
      }

      export class GameApp {
        constructor(root: HTMLElement, options?: GameAppOptions);
        applySpinResult(netDelta: number): void;
        getState(): SessionState;
      }
      ```

      Click handler order (mirrors the prototype's `playAgainBtn` listener at design lines
      777-807, but synchronous — see assumptions):

      ```ts
      this.playAgainBtn.addEventListener('click', () => {
        if (this.playAgainBtn.disabled) return;      // AC 13
        this.playAgainBtn.disabled = true;            // AC 12 — before reset completes
        this.state = this.resetSession();             // AC 4, 11
        this.render();
        this.playAgainWrap.hidden = true;
        this.setControlsEnabled(true);                // AC 5
        this.liveRegion.textContent =
          'Balance reset to 1,000 credits. Spin controls re-enabled.'; // AC 10
        this.spinBtn.focus();
      });
      ```
    files:
      - src/ui/GameApp.ts
      - src/styles/app.css
      - src/main.ts
      - index.html
      - tests/ui/GameApp.test.ts
    rationale: |
      Implements Screen 3 of the approved design as a single persistent controller instance so
      "no remount" (AC 7) is true by construction, not by accident. `src/styles/app.css` carries
      over only the product-relevant page-specific rules from the prototype's inline
      `<style>` block (`.game-layout`, `.canvas-panel`, `.canvas-session-badge`, `.reel-grid`,
      `.reel-cell`, `.spin-controls`, `.status-banner`, `.play-again-wrap`, `.btn-play-again`,
      `.stat-list`/`.stat-row`/`.stat-label`/`.stat-value`, `.history-chips`,
      `.visually-hidden`) — the `.reviewer-bar`, `.app-nav`, `.demo-actions`, and
      `.reviewer-note` rules are prototype-only chrome the design itself marks as "not part of
      the product" / "not in scope for this story" and are excluded. `index.html` links
      `design-system/tokens.css` and `design-system/prototype-utils.css` so the `.btn`,
      `.btn-primary`, `.btn-secondary`, `.card`, `.chip` component classes render with the same
      tokens as the approved design.
  - description: |
      Add dedicated keyboard-activation coverage for the Play Again button using
      `@testing-library/user-event` (real `Tab`/`Enter`/`Space` simulation, not a synthetic
      `.click()`) to prove native button semantics work end-to-end per AC 8.
    files:
      - tests/ui/GameApp.keyboard.test.ts
    rationale: |
      AC 8 is specifically about keyboard operability; a `fireEvent.click` on the button element
      would pass even if the button were e.g. a non-focusable `div` with a click handler, so this
      needs its own real-focus/real-key-event test rather than being folded into the click-based
      assertions in `GameApp.test.ts`.
tests:
  - |
    AC1 — GIVEN balance is zero WHEN the spin result is applied THEN Play Again is displayed.
    tests/ui/GameApp.test.ts:
    ```ts
    it('shows Play Again once the balance hits zero', () => {
      const app = new GameApp(root, { initialState: { ...createInitialSession(), balance: 10 } });
      app.applySpinResult(-10);
      expect(root.querySelector<HTMLElement>('#playAgainWrap')!.hidden).toBe(false);
    });
    ```
  - |
    AC2 — GIVEN balance is zero WHEN the spin result is applied THEN spin controls are disabled.
    tests/ui/GameApp.test.ts:
    ```ts
    it('disables the spin controls once the balance hits zero', () => {
      const app = new GameApp(root, { initialState: { ...createInitialSession(), balance: 10 } });
      app.applySpinResult(-10);
      expect(root.querySelector<HTMLButtonElement>('#spinBtn')!.disabled).toBe(true);
      expect(root.querySelector<HTMLButtonElement>('#betDownBtn')!.disabled).toBe(true);
      expect(root.querySelector<HTMLButtonElement>('#betUpBtn')!.disabled).toBe(true);
    });
    ```
  - |
    AC3 — GIVEN balance is exactly 10 WHEN balance is updated THEN Play Again is NOT displayed.
    tests/ui/GameApp.test.ts:
    ```ts
    it('does not show Play Again when balance settles exactly at the minimum bet', () => {
      const app = new GameApp(root, { initialState: { ...createInitialSession(), balance: 20 } });
      app.applySpinResult(-10);
      expect(root.querySelector<HTMLElement>('#playAgainWrap')!.hidden).toBe(true);
      expect(root.querySelector<HTMLButtonElement>('#spinBtn')!.disabled).toBe(false);
    });
    ```
  - |
    AC4 — GIVEN Play Again is displayed WHEN activated THEN balance resets to 1,000.
    tests/ui/GameApp.test.ts:
    ```ts
    it('resets balance to 1000 credits on activation', () => {
      const app = new GameApp(root, { initialState: { ...createInitialSession(), balance: 10 } });
      app.applySpinResult(-10);
      fireEvent.click(root.querySelector<HTMLButtonElement>('#playAgainBtn')!);
      expect(app.getState().balance).toBe(1000);
    });
    ```
  - |
    AC5 — GIVEN Play Again is displayed WHEN activated THEN spin controls are re-enabled.
    tests/ui/GameApp.test.ts:
    ```ts
    it('re-enables the spin controls on activation', () => {
      const app = new GameApp(root, { initialState: { ...createInitialSession(), balance: 10 } });
      app.applySpinResult(-10);
      fireEvent.click(root.querySelector<HTMLButtonElement>('#playAgainBtn')!);
      expect(root.querySelector<HTMLButtonElement>('#spinBtn')!.disabled).toBe(false);
      expect(root.querySelector<HTMLButtonElement>('#betDownBtn')!.disabled).toBe(false);
      expect(root.querySelector<HTMLButtonElement>('#betUpBtn')!.disabled).toBe(false);
    });
    ```
  - |
    AC6 — GIVEN Play Again is displayed WHEN activated THEN no page reload occurs.
    tests/ui/GameApp.test.ts:
    ```ts
    it('does not trigger a page reload on activation', () => {
      const reloadSpy = vi.fn();
      Object.defineProperty(window, 'location', { value: { ...window.location, reload: reloadSpy }, writable: true });
      const app = new GameApp(root, { initialState: { ...createInitialSession(), balance: 10 } });
      app.applySpinResult(-10);
      fireEvent.click(root.querySelector<HTMLButtonElement>('#playAgainBtn')!);
      expect(reloadSpy).not.toHaveBeenCalled();
    });
    ```
  - |
    AC7 — GIVEN Play Again is displayed WHEN activated THEN the canvas/app state persist without
    a full component remount.
    tests/ui/GameApp.test.ts:
    ```ts
    it('keeps the same canvas-panel DOM node across a bust-and-recover cycle', () => {
      const app = new GameApp(root, { initialState: { ...createInitialSession(), balance: 10 } });
      const panelBefore = root.querySelector('.canvas-panel');
      app.applySpinResult(-10);
      fireEvent.click(root.querySelector<HTMLButtonElement>('#playAgainBtn')!);
      expect(root.querySelector('.canvas-panel')).toBe(panelBefore);
    });
    ```
  - |
    AC8 — GIVEN Play Again is displayed WHEN navigating by keyboard only THEN it can be focused
    and activated via Tab and Enter or Space.
    tests/ui/GameApp.keyboard.test.ts:
    ```ts
    it('activates Play Again via Enter once focused', async () => {
      const user = userEvent.setup();
      const app = new GameApp(root, { initialState: { ...createInitialSession(), balance: 10 } });
      app.applySpinResult(-10);
      const btn = root.querySelector<HTMLButtonElement>('#playAgainBtn')!;
      expect(document.activeElement).toBe(btn);
      await user.keyboard('{Enter}');
      expect(app.getState().balance).toBe(1000);
    });

    it('activates Play Again via Space once focused', async () => {
      const user = userEvent.setup();
      const app = new GameApp(root, { initialState: { ...createInitialSession(), balance: 10 } });
      app.applySpinResult(-10);
      root.querySelector<HTMLButtonElement>('#playAgainBtn')!.focus();
      await user.keyboard(' ');
      expect(app.getState().balance).toBe(1000);
    });
    ```
  - |
    AC9 — GIVEN balance falls below the minimum bet WHEN Play Again appears THEN keyboard focus
    moves to it automatically.
    tests/ui/GameApp.test.ts:
    ```ts
    it('moves focus to Play Again the moment it appears', () => {
      const app = new GameApp(root, { initialState: { ...createInitialSession(), balance: 10 } });
      app.applySpinResult(-10);
      expect(document.activeElement).toBe(root.querySelector('#playAgainBtn'));
    });
    ```
  - |
    AC10 — GIVEN Play Again is displayed WHEN activated THEN a role=status/aria-live region
    announces both the balance reset and the spin-controls re-enable.
    tests/ui/GameApp.test.ts:
    ```ts
    it('announces the balance reset and controls re-enable together', () => {
      const app = new GameApp(root, { initialState: { ...createInitialSession(), balance: 10 } });
      app.applySpinResult(-10);
      fireEvent.click(root.querySelector<HTMLButtonElement>('#playAgainBtn')!);
      const liveRegion = root.querySelector('#liveRegion')!;
      expect(liveRegion.getAttribute('role')).toBe('status');
      expect(liveRegion.textContent).toMatch(/balance reset to 1,000 credits/i);
      expect(liveRegion.textContent).toMatch(/spin controls re-enabled/i);
    });
    ```
  - |
    AC11 — GIVEN Play Again is displayed WHEN activated THEN ancillary session state (last bet,
    spin history, win totals) resets to its initial defaults.
    tests/ui/GameApp.test.ts:
    ```ts
    it('resets last bet, spin history, and win total to defaults on activation', () => {
      const seeded = { balance: 10, bet: 10, lastBet: 10, winTotal: 185, spinHistory: [25, -10, -10, 40, -10] };
      const app = new GameApp(root, { initialState: seeded });
      app.applySpinResult(-10);
      fireEvent.click(root.querySelector<HTMLButtonElement>('#playAgainBtn')!);
      const state = app.getState();
      expect(state.lastBet).toBeNull();
      expect(state.winTotal).toBe(0);
      expect(state.spinHistory).toEqual([]);
    });
    ```
  - |
    AC12 — GIVEN Play Again is displayed WHEN activated THEN the button is disabled/hidden
    immediately, before the balance reset completes.
    tests/ui/GameApp.test.ts:
    ```ts
    it('disables the button before the reset function runs', () => {
      let btn: HTMLButtonElement;
      const resetSpy = vi.fn(() => {
        expect(btn.disabled).toBe(true);
        return createInitialSession();
      });
      const app = new GameApp(root, {
        initialState: { ...createInitialSession(), balance: 10 },
        resetSession: resetSpy,
      });
      app.applySpinResult(-10);
      btn = root.querySelector<HTMLButtonElement>('#playAgainBtn')!;
      fireEvent.click(btn);
      expect(resetSpy).toHaveBeenCalledTimes(1);
    });
    ```
  - |
    AC13 — GIVEN Play Again has already been activated and is disabled WHEN activated again THEN
    no additional balance reset occurs.
    tests/ui/GameApp.test.ts:
    ```ts
    it('ignores a second activation while the button is already disabled', () => {
      const resetSpy = vi.fn(createInitialSession);
      const app = new GameApp(root, {
        initialState: { ...createInitialSession(), balance: 10 },
        resetSession: resetSpy,
      });
      app.applySpinResult(-10);
      const btn = root.querySelector<HTMLButtonElement>('#playAgainBtn')!;
      fireEvent.click(btn);
      fireEvent.click(btn);
      expect(resetSpy).toHaveBeenCalledTimes(1);
    });
    ```
assumptions_or_open_questions:
  - |
    No frontend framework or build tool exists anywhere in the repo (no `package.json`, no
    `src/`) — only `design-system/` and the design HTML prototype are committed. This plan
    introduces a minimal Vite + TypeScript + Vitest + Testing Library scaffold as the
    least-opinionated choice consistent with the prototype's own vanilla-JS/DOM approach (no
    React/Vue/etc. was implied by anything in the repo). Flagging this since it's a real
    technology decision the reviewer may want to redirect before implementation starts.
  - |
    AC 7 says "the game canvas" but the approved design (Screen 3, lines 602-606 and the
    `.reel-grid`/`.reel-cell` rules at lines 314-337) renders the reel display as a DOM grid of
    `<div class="reel-cell">` elements showing emoji — there is no HTML `<canvas>` element
    anywhere in the prototype. This plan treats "canvas" as that DOM game-view panel
    (`.canvas-panel`) per the approved design and asserts its node identity survives Play Again
    activation; flagging the terminology mismatch explicitly rather than silently picking one
    reading.
  - |
    The real spin outcome/RNG engine and the Bet −/+ increment logic belong to sibling
    Wallet & Betting stories (per the epic: "accept bet placement before each spin, and credit
    winnings after each spin result") that are not yet implemented. This plan adds only a
    minimal `applySpinResult(state, netDelta)` seam so "a spin result is applied" is a concrete,
    testable trigger for the recovery flow; it does not implement paytable/RNG logic or wire the
    Bet −/+ buttons to change the bet amount.
  - |
    The prototype's `setTimeout` delays around spin resolution (700ms) and Play Again reset
    (600ms) are fake latency for the standalone demo (no backend). This plan implements the
    reset synchronously inside the click handler, using statement order (disable, then reset)
    rather than a real async gap to satisfy AC 12/13 — functionally equivalent to the design's
    intent (button disabled before the visible balance changes) without inventing a delay the
    acceptance criteria don't ask for.
  - |
    `MIN_BET` (10) is hardcoded per the acceptance criteria and design; there is no existing
    settings/config surface for it, and none is introduced here.
package_dependencies:
  - name: vite
    version: ^5.4.0
    ecosystem: npm
    rationale: Dev server/bundler and the Vitest config host (`vite.config.ts` `test` key); repo has no build tooling yet.
  - name: typescript
    version: ^5.6.0
    ecosystem: npm
    rationale: Plan's session/UI modules are written in TypeScript for the `SessionState`/`GameAppOptions` shapes shown in scope.
  - name: vitest
    version: ^2.1.0
    ecosystem: npm
    rationale: Test runner for all failing-tests-first specs in `tests/`.
  - name: jsdom
    version: ^25.0.0
    ecosystem: npm
    rationale: DOM environment for Vitest so `GameApp` can be mounted and queried without a real browser.
  - name: "@testing-library/dom"
    version: ^10.4.0
    ecosystem: npm
    rationale: "`fireEvent` and query helpers used throughout `GameApp.test.ts`."
  - name: "@testing-library/user-event"
    version: ^14.5.2
    ecosystem: npm
    rationale: Real Tab/Enter/Space keyboard simulation required to test AC 8 against actual button focus/activation semantics.
  - name: "@testing-library/jest-dom"
    version: ^6.5.0
    ecosystem: npm
    rationale: "`toBeVisible`/`toBeDisabled`-style DOM matchers used in `tests/setup.ts` and the UI test suites."
notes: |
  The prototype (`.arc/designs/TEST-M1-STORY-012-design.html`) has three reviewer-navigable
  screens: Screen 1 "Active Session (baseline)" (context only, not bound to an AC), Screen 2
  "Minimum Bet Boundary" (static reference for AC 3), and Screen 3 "Zero-Balance Recovery
  (interactive)" (the fully interactive flow covering ACs 1, 2, 4-13). This plan builds Screen
  3's markup and behavior as the real `GameApp`, and validates AC 3's boundary case against the
  same controller rather than a separate static screen, since the acceptance criterion is a
  behavioral assertion (Play Again must not render), not a distinct static page.

  Copy for the combined live-region announcement (AC 10) is taken verbatim from the prototype's
  simulation script (design line 803): "Balance reset to 1,000 credits. Spin controls
  re-enabled." — reusing the approved wording rather than inventing new copy.

  ```mermaid
  flowchart TD
    idx[index.html] --> main[src/main.ts]
    main --> app[src/ui/GameApp.ts]
    app --> session[src/session/gameSession.ts]
    app --> css[src/styles/app.css]
    tokens[design-system/tokens.css<br/>+ prototype-utils.css] --> idx
    testApp[tests/ui/GameApp.test.ts] --> app
    testKb[tests/ui/GameApp.keyboard.test.ts] --> app
    testSession[tests/session/gameSession.test.ts] --> session

    classDef touched fill:#f96,color:#000
    class main,app,session,css,idx,testApp,testKb,testSession touched
  ```

  `main.ts`/`index.html`/`app.css` are touched only to mount and style `GameApp` (thin,
  effectively untested glue); `GameApp.ts` is the fan-in point for both test files and the sole
  caller of `gameSession.ts`, which is why it carries the bulk of the acceptance-criteria logic
  while `gameSession.ts` stays a small, independently-tested pure module.
