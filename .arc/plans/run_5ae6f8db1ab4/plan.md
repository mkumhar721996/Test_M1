summary: |
  Implement bet selection (TEST-M1-STORY-008): a player-facing control offering exactly four
  fixed bet levels (10, 20, 50, 100 credits), defaulting to the lowest level, that becomes the
  active bet for the next spin once confirmed, disables levels the current balance cannot cover,
  and rejects changes while a spin is in progress. The repo currently has no application code or
  toolchain at all (only `design-system/` tokens/CSS from the prior chore), so this plan also
  bootstraps the minimal TypeScript + Vite + Vitest setup needed to write and run the tests, and
  wires a minimal entry point so "the game is loaded" is a real, checkable state. Wallet balance
  and spin-in-progress are not yet owned by any built system (they belong to sibling stories in
  the Player Wallet & Betting epic), so `BetSelector` takes them as injectable state
  (`setBalance`/`setSpinInProgress`) rather than reading from a real wallet/spin module.

scope:
  - description: |
      Bootstrap the minimal project toolchain: `package.json`, `tsconfig.json`,
      `vitest.config.ts` (jsdom environment), `vite.config.ts`. Nothing currently exists to run
      TypeScript, a dev server, or a test suite.
    files:
      - package.json
      - tsconfig.json
      - vitest.config.ts
      - vite.config.ts
    rationale: |
      No build or test tooling exists in the repo yet (only `design-system/*.css|json|html` from
      the design-system-bootstrap commit). TDD for this story is impossible without it, and it is
      a hard prerequisite rather than speculative scope.

  - description: |
      Bet level domain logic as a plain, DOM-free state class so the balance/spin-in-progress
      rules are unit-testable in isolation.
      Signature:
      ```ts
      export const BET_LEVELS = [10, 20, 50, 100] as const;
      export type BetLevel = typeof BET_LEVELS[number];

      export class BetSelector {
        activeBet: BetLevel;
        constructor(private balance: number);
        isDisabled(level: BetLevel): boolean;   // true if spin in progress OR level > balance
        select(level: BetLevel): boolean;       // returns false and no-ops if isDisabled(level)
        setBalance(balance: number): void;
        setSpinInProgress(inProgress: boolean): void;
      }
      ```
    files:
      - src/betting/bet-selector.ts
      - src/betting/bet-selector.test.ts
    rationale: |
      Centralizing the balance-check and spin-lock rule inside `isDisabled` means the view layer,
      the click handler, and the tests all share one source of truth instead of duplicating the
      condition three times.

  - description: |
      Rendering: draws exactly four options from `BET_LEVELS` using the existing design-system
      `chip` component class, marks the active one, disables per `isDisabled`, and re-renders on
      confirmed selection.
      Signature: `export function renderBetSelector(container: HTMLElement, selector: BetSelector): void`
    files:
      - src/ui/bet-selector-view.ts
      - src/ui/bet-selector-view.test.ts
    rationale: |
      Reuses the `chip` component already defined in `design-system/prototype-utils.css` instead
      of inventing new markup/classes, keeping the control consistent with the bootstrapped
      design system.

  - description: |
      Add visual states to the existing `chip` component for "active" and "disabled" so AC4's
      "visually disabled" and AC2/AC3's "shown as active" requirements have a real, token-driven
      style (the design system currently has no such states).
      ```css
      .chip:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .chip.is-active {
        background: var(--color-primary);
        color: var(--color-primary-fg);
      }
      ```
    files:
      - design-system/prototype-utils.css
    rationale: |
      Keeps the new states "built exclusively from design tokens" per the file's existing header
      comment, rather than hard-coding colors in the view module.

  - description: |
      Minimal loadable entry point so "the game is loaded and the player views the bet selector"
      (AC1) is an actual reachable state, not just a unit test. Uses a placeholder balance
      constant until a real wallet module exists (sibling epic work).
    files:
      - index.html
      - src/main.ts
    rationale: |
      AC1 and AC2 are phrased as GIVEN the game is loaded; without any HTML entry point in the
      repo there is nothing to load. This is the smallest possible shell (one div, one script
      tag) — no routing, no wallet, no spin mechanic.

tests:
  - |
    AC1 (exactly four options: 10, 20, 50, 100) — two failing tests first:
    unit: `expect(BET_LEVELS).toEqual([10, 20, 50, 100]);` in `src/betting/bet-selector.test.ts`.
    DOM: in `src/ui/bet-selector-view.test.ts`:
    ```ts
    renderBetSelector(root, new BetSelector(1000));
    expect(root.querySelectorAll('[data-bet-level]').length).toBe(4);
    ```
    Minimal code to pass: `BET_LEVELS` constant plus `renderBetSelector` looping over it emitting
    one `<button data-bet-level>` per level.
  - |
    AC2 (default bet is the lowest level, pre-selected on load) — failing tests first:
    unit: `expect(new BetSelector(1000).activeBet).toBe(10);`
    DOM: `expect(root.querySelector('[data-bet-level="10"]')?.classList.contains('is-active')).toBe(true);`
    Minimal code to pass: initialize `activeBet = BET_LEVELS[0]` in the constructor; view adds
    `is-active` class when `level === selector.activeBet`.
  - |
    AC3 (selecting a level confirms it as the active bet for the next spin) — failing tests first:
    unit:
    ```ts
    const selector = new BetSelector(1000);
    expect(selector.select(50)).toBe(true);
    expect(selector.activeBet).toBe(50);
    ```
    DOM: click the `[data-bet-level="50"]` button and assert it gains `is-active` while `10`
    loses it: `expect(selector.activeBet).toBe(50);`
    Minimal code to pass: `select()` sets `this.activeBet = level` when not disabled; the view's
    click handler calls `selector.select(level)` and re-renders on success.
  - |
    AC4 (a level below the balance is visually disabled and unselectable) — failing tests first:
    unit:
    ```ts
    const selector = new BetSelector(15);
    expect(selector.isDisabled(50)).toBe(true);
    expect(selector.select(50)).toBe(false);
    expect(selector.activeBet).toBe(10);
    ```
    DOM: `expect((root.querySelector('[data-bet-level="50"]') as HTMLButtonElement).disabled).toBe(true);`
    Minimal code to pass: `isDisabled` returns `level > this.balance`; view sets the native
    `disabled` attribute (which also triggers the `.chip:disabled` style) from `isDisabled`.
  - |
    AC5 (bet selector rejects changes while a spin is in progress, until it completes) — failing
    tests first:
    unit:
    ```ts
    const selector = new BetSelector(1000);
    selector.setSpinInProgress(true);
    expect(selector.select(100)).toBe(false);
    expect(selector.activeBet).toBe(10);
    selector.setSpinInProgress(false);
    expect(selector.select(100)).toBe(true);
    ```
    DOM: click `[data-bet-level="100"]` while `setSpinInProgress(true)` and assert
    `selector.activeBet` is still `10` and the button has no `is-active` class.
    Minimal code to pass: fold `this.spinInProgress` into `isDisabled` (`spinInProgress ||
    level > balance`) so both the click handler and the rendered `disabled` attribute honor it
    uniformly.

assumptions_or_open_questions:
  - |
    The repo has no `package.json`/build tooling at all yet. This plan bootstraps a minimal
    TypeScript + Vite + Vitest (jsdom) setup as a prerequisite; if a different stack was already
    decided elsewhere (not visible in this repo), that should replace this bootstrap step.
  - |
    Real wallet balance and real spin-in-progress state are owned by sibling stories in the
    Player Wallet & Betting epic that don't exist yet. `BetSelector` exposes `setBalance` /
    `setSpinInProgress` as the integration seam; `src/main.ts` uses a placeholder balance constant
    (1000) until a real wallet module is wired in by that later story.
  - |
    AC2 says the default is "the lowest available level" — interpreted as the lowest of the four
    fixed levels (10), always, regardless of balance. Open question: if the player's balance is
    below 10 at load (so even the default is unaffordable), should the default auto-advance to
    the first affordable level, or stay on 10 in a disabled state? This plan implements the
    latter (stays on 10, disabled) since no AC specifies auto-advancing.
  - |
    Persisting the chosen bet level across reloads/sessions is not mentioned in any AC and is
    treated as out of scope.

package_dependencies:
  - name: vite
    version: ^5.4.10
    ecosystem: npm
    rationale: |
      Dev dependency: no dev server/bundler exists in the repo; needed so `index.html` /
      `src/main.ts` can actually be loaded in a browser to satisfy "the game is loaded" (AC1/AC2),
      and Vitest builds on the same config.
  - name: vitest
    version: ^2.1.4
    ecosystem: npm
    rationale: |
      Dev dependency: no test runner exists in the repo; used for all failing-test-first unit and
      DOM tests in this plan.
  - name: jsdom
    version: ^25.0.1
    ecosystem: npm
    rationale: |
      Dev dependency: Vitest's jsdom environment (used by `bet-selector-view.test.ts` to assert on
      rendered buttons/classes/disabled attributes) requires `jsdom` installed separately.
  - name: typescript
    version: ^5.6.3
    ecosystem: npm
    rationale: |
      Dev dependency: no TypeScript config/compiler exists in the repo; used for all new source
      and test files in this plan.

notes: |
  This is the first work item with any application code in this repo — `git log` shows only the
  initial commit and the design-system bootstrap (tokens/CSS/style-guide, no JS/TS, no
  `package.json`). Everything under `scope` items 1 and 5 (toolchain bootstrap, `index.html` /
  `src/main.ts`) exists solely to make the bet-selection ACs checkable at all; it intentionally
  stops short of any wallet, spin, or routing logic, which belong to other stories in the Player
  Wallet & Betting epic.

  The view reuses the `chip` component class already defined in
  `design-system/prototype-utils.css` (see `.chip` rule) rather than introducing new component
  CSS, and only adds the two missing states (`:disabled`, `.is-active`) it needs.

  ```mermaid
  flowchart TD
    index[index.html] -->|mounts app| main[src/main.ts]
    tokens[design-system/tokens.css] --- index
    main -->|"new BetSelector(placeholder balance)"| betSelector[src/betting/bet-selector.ts]
    main -->|renderBetSelector root, selector| view[src/ui/bet-selector-view.ts]
    view -->|reads activeBet / isDisabled| betSelector
    view -->|"emits .chip / .is-active / :disabled"| css[design-system/prototype-utils.css]
    index -->|link rel=stylesheet| css

    classDef touched fill:#f96,color:#000
    class index,main,betSelector,view,css touched
  ```
