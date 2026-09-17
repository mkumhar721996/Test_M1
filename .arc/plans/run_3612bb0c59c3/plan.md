summary: |
  This repo is currently greenfield: only the design-system token/CSS bootstrap
  (TEST-M1-CHORE-002) exists, with no application code, no build tooling, and no test
  runner. This plan implements TEST-M1-STORY-017 (accessible Paytable display) end to
  end, test-first. It bootstraps the minimal project tooling needed to build and test a
  framework-free TypeScript component (Vite + Vitest/jsdom for unit/component logic,
  Playwright for real-browser checks that jsdom cannot faithfully simulate: 360px
  viewport overflow, focus-trap/keyboard behavior, computed contrast, and touch-target
  geometry). It also introduces the minimal local state stubs the paytable needs to
  gate itself correctly (game status idle/spinning/bonus, selected bet level) and a
  minimal engine-config loader (symbols, per-line payout multipliers, paylines) — scoped
  strictly to what this story's acceptance criteria require, not a full engine
  integration. The paytable itself is a plain TS component (no framework) that mirrors
  the existing design system's plain-CSS-token approach, is opened/closed via a
  controller with focus-trap and focus-return, scales displayed payouts by the current
  bet, and shows a dismissible inline error when configuration is missing or empty.

scope:
  - description: |
      Bootstrap project tooling from scratch: `package.json`, `tsconfig.json`,
      `vite.config.ts`, `vitest.config.ts` (jsdom environment, `test/setupTests.ts` for
      `@testing-library/dom` cleanup), `playwright.config.ts` (webServer running
      `vite preview`, `baseURL` for e2e specs), and `.gitignore` entries for
      `node_modules`/`dist`/`test-results`/`playwright-report`. `index.html` at the repo
      root wires `design-system/tokens.css` and `design-system/prototype-utils.css`
      alongside the new `src/main.ts` bundle entry, giving Playwright a real page to
      drive.
    files:
      - package.json
      - tsconfig.json
      - vite.config.ts
      - vitest.config.ts
      - playwright.config.ts
      - .gitignore
      - index.html
      - test/setupTests.ts
    rationale: |
      No build or test tooling exists yet. Every acceptance criterion needs either a
      unit-test harness (state/logic, AC1-4, AC12-15, AC18-19) or a real-browser harness
      (AC5-11, AC16-17) to be verifiable at all, so this is a hard prerequisite rather
      than optional scaffolding.

  - description: |
      Minimal engine-config types and loader: symbols with per-line-count payout
      multipliers, payline definitions, and a pure scaling function. No network/backend
      integration — callers inject the raw config object (a later story wires the real
      engine transport).
      `interface EngineSymbol { id: string; name: string; payoutPerLine: Record<number, number> }`
      `interface PaylineDef { id: string; positions: number[]; description: string }`
      `interface EngineConfig { symbols: EngineSymbol[]; paylines: PaylineDef[] }`
      `function loadEngineConfig(raw: unknown): EngineConfig | null`
      `function scalePayout(payoutMultiplier: number, betPerLine: number): number`
    files:
      - src/state/engineConfig.ts
    rationale: |
      AC2 and AC14/AC15 require displayed values to exactly match, and be scaled from,
      configured engine values; AC18 requires detecting missing/empty/malformed config.
      Keeping this a pure loader/scaler (no fetch, no caching) avoids building ahead of
      what this story needs.

  - description: |
      Minimal local game-status state: `idle | spinning | bonus`, with subscribe.
      `type GameStatus = 'idle' | 'spinning' | 'bonus'`
      `function createGameState(initial?: GameStatus): { getStatus(): GameStatus; setStatus(next: GameStatus): void; subscribe(fn: (s: GameStatus) => void): () => void }`
    files:
      - src/state/gameState.ts
    rationale: |
      AC1 and AC12/AC13 require gating the paytable control/open action on idle vs.
      non-idle status. This is a local stub standing in for the real engine-driven game
      state; a later spin/bonus-round story is expected to replace or wire it to actual
      engine events.

  - description: |
      Minimal bet-level state: an ordered list of bet-per-line amounts plus the
      currently selected index.
      `function createBetState(levels: number[], initialIndex?: number): { getBetPerLine(): number; getLevelIndex(): number; setLevel(index: number): void }`
    files:
      - src/state/betState.ts
    rationale: |
      AC14/AC15 require the paytable to reflect the currently selected bet level, both
      at open time and after the bet changes while the paytable is closed.

  - description: |
      The paytable component and its controller: renders a `role="dialog"` /
      `aria-modal="true"` view listing every symbol (name + payout, scaled by current
      bet) and every payline (visual + text description for screen readers), traps
      focus while open, restores focus to the triggering element on close, and shows a
      dismissible inline error/placeholder when `loadEngineConfig` returns `null`.
      `function createPaytableController(deps: { config: unknown; gameState: GameState; betState: BetState; mountPoint: HTMLElement }): { open(trigger: HTMLElement): void; close(): void; isOpen(): boolean; dismissError(): void }`
    files:
      - src/components/paytable/Paytable.ts
      - src/components/paytable/paytable.css
    rationale: |
      Core deliverable for AC1-6, AC8-11, AC14-19. Plain TS/DOM (no framework) to match
      the framework-free, token-driven convention already established by
      `design-system/prototype-utils.css`. `paytable.css` uses only existing
      `design-system/tokens.css` custom properties (`--color-fg` on `--color-bg` is
      already documented at 16.1:1 contrast) plus explicit `min-width`/`min-height: 44px`
      on interactive controls and `overflow-y: auto; overflow-x: hidden; max-width: 100vw`
      on the scrollable content region.

  - description: |
      The control that opens the paytable: a button that is disabled and/or hidden
      whenever `gameState` is not idle, and otherwise opens the paytable and records
      itself as the focus-return target.
      `function createPaytableControl(deps: { gameState: GameState; onOpen: (trigger: HTMLElement) => void }): HTMLButtonElement`
    files:
      - src/components/paytableControl/PaytableControl.ts
    rationale: |
      AC7 and AC12/13 require the trigger control itself to be keyboard-operable and to
      be disabled/hidden and functionally inert during non-idle states.

  - description: |
      Wire the demo app shell used by Playwright e2e specs and manual verification:
      instantiates `gameState`, `betState`, a sample `EngineConfig`, the control, and the
      paytable controller, and mounts them into `index.html`.
    files:
      - src/main.ts
    rationale: |
      Playwright needs a real served page to test viewport overflow, focus trap, and
      computed styles against; this is the minimal composition root, not a general app
      architecture.

  - description: |
      Unit/component tests (Vitest + jsdom + `@testing-library/dom` + `axe-core`)
      covering state/logic-level acceptance criteria.
    files:
      - test/unit/engineConfig.test.ts
      - test/unit/gameState.test.ts
      - test/unit/betState.test.ts
      - test/unit/paytable.render.test.ts
      - test/unit/paytable.lifecycle.test.ts
      - test/unit/paytable.a11y.test.ts
      - test/unit/paytableControl.test.ts
    rationale: |
      Fast, deterministic coverage for AC1-4, AC12-15, AC18-19, and a static a11y-role
      smoke check for AC6, run on every commit without a browser.

  - description: |
      Playwright e2e specs covering the acceptance criteria that require real layout,
      paint, and keyboard focus semantics that jsdom cannot faithfully simulate.
    files:
      - e2e/paytable.viewport.spec.ts
      - e2e/paytable.keyboard.spec.ts
      - e2e/paytable.contrast-touch-target.spec.ts
    rationale: |
      AC5 (360px overflow), AC7-11 (keyboard open/scroll/close/focus-trap/focus-return),
      and AC16-17 (computed contrast, computed touch-target geometry) depend on real
      browser layout and focus behavior that jsdom does not implement.

tests:
  - |
    AC1 — test/unit/paytable.render.test.ts: open the paytable while `gameState` is
    idle and assert every configured symbol/payout and every payline is present.
    ```ts
    const controller = createPaytableController({ config: fullConfig, gameState, betState, mountPoint });
    controller.open(triggerButton);
    expect(screen.getByRole('dialog', { name: /paytable/i })).toBeTruthy();
    fullConfig.symbols.forEach(s => {
      expect(screen.getByText(s.name)).toBeInTheDocument();
    });
    fullConfig.paylines.forEach(p => {
      expect(screen.getByText(p.description)).toBeInTheDocument();
    });
    ```
    Minimal code: `Paytable.ts` renders a `<table>` row per symbol and a list item per
    payline from the injected `EngineConfig`.
  - |
    AC2 — test/unit/paytable.render.test.ts: rendered payout values equal the exact
    scaled engine values, not an approximation.
    ```ts
    const expected = scalePayout(symbol.payoutPerLine[3], betState.getBetPerLine());
    expect(screen.getByTestId(`payout-${symbol.id}-3`).textContent).toBe(String(expected));
    ```
    Minimal code: `Paytable.ts` computes each cell via `scalePayout` from
    `engineConfig.ts`, never a hardcoded/rounded display value.
  - |
    AC3 — test/unit/paytable.lifecycle.test.ts: closing returns the game to its prior
    idle state (no status mutation from opening/closing the paytable).
    ```ts
    expect(gameState.getStatus()).toBe('idle');
    controller.open(triggerButton);
    controller.close();
    expect(gameState.getStatus()).toBe('idle');
    ```
    Minimal code: the paytable controller never calls `gameState.setStatus`.
  - |
    AC4 — test/unit/paytable.lifecycle.test.ts: bet selection survives an open/close
    cycle.
    ```ts
    betState.setLevel(2);
    controller.open(triggerButton);
    controller.close();
    expect(betState.getLevelIndex()).toBe(2);
    ```
    Minimal code: the paytable controller only reads `betState`, never writes it.
  - |
    AC5 — e2e/paytable.viewport.spec.ts: at a 360px viewport, the paytable has no
    horizontal overflow and is vertically scrollable.
    ```ts
    await page.setViewportSize({ width: 360, height: 640 });
    await page.getByRole('button', { name: /paytable/i }).click();
    const dialog = page.getByRole('dialog', { name: /paytable/i });
    const [scrollWidth, clientWidth] = await dialog.evaluate(el => [el.scrollWidth, el.clientWidth]);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
    ```
    Minimal code: `paytable.css` sets `max-width: 100vw` and `overflow-x: hidden` on the
    dialog root and `overflow-y: auto` on the content region.
  - |
    AC6 — test/unit/paytable.a11y.test.ts: automated accessibility scan finds no
    violations, and symbol/payout/payline text has proper semantic structure.
    ```ts
    const results = await axe.run(mountPoint);
    expect(results.violations).toEqual([]);
    expect(screen.getByRole('columnheader', { name: 'Payout' })).toBeInTheDocument();
    ```
    Minimal code: `Paytable.ts` uses a real `<table>` with `<th scope="col">` headers and
    a visually-hidden text description per payline (not only a graphical diagram).
  - |
    AC7 — e2e/paytable.keyboard.spec.ts: keyboard-only activation of the trigger opens
    the paytable.
    ```ts
    await page.getByRole('button', { name: /paytable/i }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog', { name: /paytable/i })).toBeVisible();
    ```
    Minimal code: `PaytableControl.ts` is a real `<button>` (native Enter/Space
    activation, no custom keydown handling needed).
  - |
    AC8 — e2e/paytable.keyboard.spec.ts: repeated Tab within the open paytable scrolls
    content so the last row becomes reachable/visible.
    ```ts
    for (let i = 0; i < focusableCountInDialog; i++) await page.keyboard.press('Tab');
    await expect(page.getByTestId('paytable-row-last')).toBeInViewport();
    ```
    Minimal code: each payout row/payline item is a focusable element (or contains one)
    inside the scrollable content region so native focus-follows-scroll applies.
  - |
    AC9 — e2e/paytable.keyboard.spec.ts: the close control closes the paytable via
    keyboard only.
    ```ts
    await page.getByRole('button', { name: /close paytable/i }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog', { name: /paytable/i })).toBeHidden();
    ```
    Minimal code: close button is a native `<button>` wired to `controller.close()`.
  - |
    AC10 — e2e/paytable.keyboard.spec.ts: focus never escapes the open dialog while
    tabbing.
    ```ts
    for (let i = 0; i < focusableCountInDialog + 3; i++) await page.keyboard.press('Tab');
    const stillInside = await page.evaluate(() =>
      document.querySelector('[data-testid="paytable-dialog"]').contains(document.activeElement)
    );
    expect(stillInside).toBe(true);
    ```
    Minimal code: `Paytable.ts` installs a `keydown` listener on the dialog root that
    wraps Tab/Shift+Tab between the first and last focusable descendant.
  - |
    AC11 — e2e/paytable.keyboard.spec.ts: closing returns focus to the control that
    opened the paytable.
    ```ts
    const opener = page.getByRole('button', { name: /paytable/i });
    await opener.focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Escape');
    await expect(opener).toBeFocused();
    ```
    Minimal code: `controller.open(trigger)` stores `trigger`, and `close()` calls
    `trigger.focus()`.
  - |
    AC12 — test/unit/paytableControl.test.ts: the control is disabled while not idle.
    ```ts
    gameState.setStatus('spinning');
    const button = createPaytableControl({ gameState, onOpen });
    expect(button).toBeDisabled();
    ```
    Minimal code: `PaytableControl.ts` subscribes to `gameState` and sets
    `button.disabled = status !== 'idle'`.
  - |
    AC13 — test/unit/paytable.lifecycle.test.ts: opening cannot succeed while not idle,
    even if invoked directly.
    ```ts
    gameState.setStatus('spinning');
    controller.open(triggerButton);
    expect(screen.queryByRole('dialog', { name: /paytable/i })).not.toBeInTheDocument();
    ```
    Minimal code: `controller.open` early-returns when `gameState.getStatus() !== 'idle'`.
  - |
    AC14 — test/unit/paytable.render.test.ts: payouts shown reflect the bet level
    selected before opening.
    ```ts
    betState.setLevel(3);
    controller.open(triggerButton);
    const expected = scalePayout(symbol.payoutPerLine[3], betState.getBetPerLine());
    expect(screen.getByTestId(`payout-${symbol.id}-3`).textContent).toBe(String(expected));
    ```
    Minimal code: covered by the same read-path as AC2; asserts it is bet-level-aware.
  - |
    AC15 — test/unit/paytable.lifecycle.test.ts: changing bet while closed is reflected
    on next open.
    ```ts
    betState.setLevel(1);
    controller.close();
    betState.setLevel(4);
    controller.open(triggerButton);
    const expected = scalePayout(symbol.payoutPerLine[3], betState.getBetPerLine());
    expect(screen.getByTestId(`payout-${symbol.id}-3`).textContent).toBe(String(expected));
    ```
    Minimal code: `Paytable.ts` re-reads `betState` on every `open()` call rather than
    caching values at construction time.
  - |
    AC16 — e2e/paytable.contrast-touch-target.spec.ts: rendered text meets 4.5:1
    contrast.
    ```ts
    const { color, backgroundColor } = await page.getByTestId('paytable-symbol-name').first()
      .evaluate(el => getComputedStyle(el));
    expect(contrastRatio(color, backgroundColor)).toBeGreaterThanOrEqual(4.5);
    ```
    Minimal code: `paytable.css` sets text color to `var(--color-fg)` on
    `var(--color-bg)`/`var(--color-surface)` only (both already documented as clearing
    AA in `design-system/tokens.json`); a companion unit test in
    `test/unit/paytable.a11y.test.ts` ports the contrast formula from
    `design-system/.check_contrast.py` into TS and asserts the same token pair as a fast
    regression guard.
  - |
    AC17 — e2e/paytable.contrast-touch-target.spec.ts: every interactive control in the
    paytable is at least 44x44px.
    ```ts
    const box = await page.getByRole('button', { name: /close paytable/i }).boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
    ```
    Minimal code: `paytable.css` sets `min-width: 44px; min-height: 44px;` on `.btn`
    instances used inside the paytable (close button, error-dismiss button).
  - |
    AC18 — test/unit/paytable.render.test.ts: missing/empty/invalid config shows an
    inline error.
    ```ts
    const controller = createPaytableController({ config: null, gameState, betState, mountPoint });
    controller.open(triggerButton);
    expect(screen.getByText(/paytable is currently unavailable/i)).toBeInTheDocument();
    ```
    Minimal code: `loadEngineConfig` returns `null` for missing/empty
    symbols/paylines, and `Paytable.ts` renders the error message in place of the table
    when `loadEngineConfig(config)` is `null`.
  - |
    AC19 — test/unit/paytable.render.test.ts: dismissing the inline error removes it.
    ```ts
    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));
    expect(screen.queryByText(/paytable is currently unavailable/i)).not.toBeInTheDocument();
    ```
    Minimal code: `Paytable.ts` tracks a local `errorDismissed` flag toggled by the
    dismiss button's click handler.

assumptions_or_open_questions:
  - "No engine/backend integration exists yet in this repo. `engineConfig.ts` and `gameState.ts`/`betState.ts` are minimal local stubs scoped to this story's needs (a caller injects the raw config/state); wiring them to the real engine transport and to reel-spin/bonus-round stories is left to those later stories in the epic."
  - "AC3 (\"returns to its previous idle state\") is interpreted as: opening/closing the paytable never mutates `gameState`'s status, and the game was already idle when the paytable was opened (enforced by AC12/13) — there is no separate view-history stack to restore."
  - "Bet levels/denominations are modeled as a flat ordered array of bet-per-line amounts (`betState.ts`); the real bet-selection UI/story may use a richer model (separate level and denomination), in which case `getBetPerLine()` is the integration seam."
  - "No UI framework (React/Vue/etc.) is present anywhere in the repo, so the paytable is implemented as plain TypeScript/DOM to match the existing framework-free, token-driven design-system convention rather than introducing a new frontend framework as part of this story."
  - "Playwright is introduced specifically because jsdom cannot faithfully verify real layout/paint concerns (AC5, AC8, AC10, AC16, AC17); Vitest+jsdom otherwise remains the primary fast unit-test loop."

package_dependencies:
  - name: typescript
    version: ^5.6.0
    ecosystem: npm
    rationale: Language for all new source and test files; no build tooling exists yet in this repo.
  - name: vite
    version: ^5.4.0
    ecosystem: npm
    rationale: Dev server/bundler for src/main.ts and index.html, and the base Playwright webServer target.
  - name: vitest
    version: ^2.1.0
    ecosystem: npm
    rationale: Unit/component test runner for state and paytable logic tests (AC1-4, AC12-15, AC18-19).
  - name: jsdom
    version: ^25.0.0
    ecosystem: npm
    rationale: DOM environment required by Vitest to render and query the paytable component in unit tests.
  - name: "@testing-library/dom"
    version: ^10.4.0
    ecosystem: npm
    rationale: Accessible query helpers (getByRole, getByText) used across all unit component tests.
  - name: "@testing-library/user-event"
    version: ^14.5.0
    ecosystem: npm
    rationale: Simulated click/keyboard interaction helper for dismiss/close handlers in unit tests.
  - name: axe-core
    version: ^4.10.0
    ecosystem: npm
    rationale: Automated accessibility violation scanning for AC6 in both unit and e2e a11y checks.
  - name: "@playwright/test"
    version: ^1.47.0
    ecosystem: npm
    rationale: Real-browser test runner for viewport overflow, keyboard focus-trap/focus-return, computed contrast, and touch-target geometry (AC5, AC7-11, AC16-17).

notes: |
  The repo currently contains only `design-system/` (tokens.json/tokens.css,
  prototype-utils.css, style-guide.html, .check_contrast.py) plus the README — no
  package.json, no src/, no tests. This plan's `scope` therefore includes bootstrapping
  the minimal build/test tooling alongside the feature itself, kept as small as the
  acceptance criteria require (no CI config, no linting setup, no unrelated app shell
  beyond what Playwright needs to drive a real page).

  Module/call-graph for the touched files:

  ```mermaid
  flowchart TD
    classDef touched fill:#f96,color:#000
    classDef context fill:#eee,color:#000

    tokens["design-system/tokens.css"]:::context
    utils["design-system/prototype-utils.css"]:::context
    index["index.html"]:::touched
    main["src/main.ts"]:::touched
    control["src/components/paytableControl/PaytableControl.ts"]:::touched
    paytable["src/components/paytable/Paytable.ts"]:::touched
    paytableCss["src/components/paytable/paytable.css"]:::touched
    gameState["src/state/gameState.ts"]:::touched
    betState["src/state/betState.ts"]:::touched
    engineConfig["src/state/engineConfig.ts"]:::touched

    index -->|loads tokens/utils for base styling| tokens
    index -->|loads tokens/utils for base styling| utils
    index -->|entry point| main
    main -->|instantiates and mounts| control
    main -->|instantiates and mounts| paytable
    control -->|subscribes to gate disabled state, AC12/13| gameState
    control -->|calls open on click/Enter, AC7| paytable
    paytable -->|reads status defensively, AC13| gameState
    paytable -->|reads current bet on open, AC14/15| betState
    paytable -->|loads/validates config, AC2/18| engineConfig
    paytable -->|uses design tokens for contrast/touch-target, AC16/17| paytableCss
    paytableCss -->|var references| tokens
  ```
