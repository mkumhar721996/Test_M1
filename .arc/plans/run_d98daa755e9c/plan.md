summary: |
  This is the first UI work item in the repository: today the repo contains only design
  tokens/utilities (`design-system/`) and no application code, framework, or test runner. This
  plan bootstraps a minimal React + TypeScript + Vite + Vitest + Playwright scaffold and, on top
  of it, implements the spin/bet controls described in TEST-M1-STORY-014: a `useGameControls`
  hook that derives, from wallet balance / bet amount / spin status, whether the spin button
  should be enabled, disabled-for-insufficient-balance, or disabled-for-in-flight, plus a
  `BetSelector`, `SpinButton`, and a minimal `ReelsPanel` lock placeholder (full reel rendering is
  a separate epic story) composed together in `SpinControls`. Each of the 13 acceptance criteria
  is driven by a failing unit/integration test (Vitest + React Testing Library) or, where layout
  at a real viewport is required, a Playwright end-to-end test, written before the corresponding
  minimal implementation.

scope:
  - description: |
      Bootstrap the application scaffold: `package.json`, `tsconfig.json`, `vite.config.ts`,
      `vitest.config.ts`, `playwright.config.ts`, `index.html`, `src/main.tsx`, `src/App.tsx`,
      and `src/test/setup.ts` (registers `@testing-library/jest-dom` and `jest-axe` matchers).
      `vite.config.ts` reads the dev port from the existing `.env` convention:

      ```ts
      export default defineConfig({
        plugins: [react()],
        server: { port: Number(process.env.ARC_WEB_PORT) || 5173 },
      });
      ```
    files:
      - package.json
      - tsconfig.json
      - vite.config.ts
      - vitest.config.ts
      - playwright.config.ts
      - index.html
      - src/main.tsx
      - src/App.tsx
      - src/test/setup.ts
    rationale: |
      No application code, package manifest, or test runner exists yet, so nothing in this story
      can be TDD'd until a minimal host app and test harness exist. Reusing `ARC_WEB_PORT` keeps
      the new dev server aligned with the port already reserved for this work item in `.env`.

  - description: |
      Add two presentational classes to the existing design system, built only from existing
      tokens (no new tokens):

      ```css
      .btn-disabled {
        background: var(--color-border);
        color: var(--color-fg-muted);
        cursor: not-allowed;
      }

      .u-visually-hidden {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip: rect(0 0 0 0);
        white-space: nowrap;
      }
      ```
    files:
      - design-system/prototype-utils.css
    rationale: |
      AC2 requires a visible greyed-out spin button and AC3/AC8 require an accessible
      "Insufficient balance" reason; `.arc/config/design.yaml` designates `prototype-utils.css`
      as the shared, token-only source of presentational classes, so new shared classes belong
      there rather than in a component-local stylesheet.

  - description: |
      `useGameControls` hook owning wallet/bet/spin-status state and deriving the spin button's
      disabled reason and the reels' lock state:

      ```ts
      export type SpinStatus = 'idle' | 'in-flight';
      export type DisabledReason = 'insufficient-balance' | 'in-flight' | null;

      export interface GameControlsConfig {
        walletBalance: number;
        betOptions: number[];
        initialBet: number;
      }

      export function useGameControls(config: GameControlsConfig): {
        state: {
          betAmount: number;
          disabledReason: DisabledReason;
          reelsLocked: boolean;
        };
        actions: {
          setBetAmount: (amount: number) => void;
          startSpin: () => void;
          completeSpin: () => void;
        };
      };
      ```

      Derivation: `disabledReason` is `'in-flight'` whenever `spinStatus === 'in-flight'`,
      otherwise `'insufficient-balance'` whenever `betAmount > walletBalance`, otherwise `null`.
      `reelsLocked` is `spinStatus === 'in-flight'`.
    files:
      - src/game-controls/useGameControls.ts
      - src/game-controls/useGameControls.test.ts
    rationale: |
      Centralizes the wallet/bet/spin-status derivation in one place so `SpinButton`,
      `BetSelector`, and `ReelsPanel` all react to a single source of truth, covering AC1, AC2,
      AC4, AC5, AC6, AC12, AC13. Exposing `startSpin`/`completeSpin` as the hook's public actions
      (rather than only an internal effect) gives the future spin-request/engine-integration story
      the exact two calls it needs to make without this story guessing at that story's API.

  - description: |
      `SpinButton` presentational component:

      ```tsx
      export interface SpinButtonProps {
        disabledReason: DisabledReason;
        onSpin: () => void;
      }

      export function SpinButton({ disabledReason, onSpin }: SpinButtonProps): JSX.Element;
      ```

      Renders a `<button>` with `aria-disabled={disabledReason !== null}` (native `disabled` is
      deliberately NOT used, so the button stays focusable for AC8/AC10), a `title` of
      `'Insufficient balance'` and an `aria-describedby` pointing to a visually-hidden span with
      the same text only when `disabledReason === 'insufficient-balance'`, and a `btn-disabled`
      class whenever `disabledReason !== null`. The `onClick` handler is a no-op when disabled.
    files:
      - src/components/SpinButton/SpinButton.tsx
      - src/components/SpinButton/SpinButton.test.tsx
    rationale: |
      Directly implements AC1, AC2, AC3, AC4, AC8 as a small, independently testable unit.

  - description: |
      `BetSelector` component using a native `<select>` filtered to affordable options:

      ```tsx
      export interface BetSelectorProps {
        betOptions: number[];
        walletBalance: number;
        selectedBet: number;
        disabled: boolean;
        onChange: (bet: number) => void;
      }

      export function BetSelector(props: BetSelectorProps): JSX.Element;
      ```

      `<option>` elements are rendered only for `betOptions.filter(amount => amount <= walletBalance)`.
    files:
      - src/components/BetSelector/BetSelector.tsx
      - src/components/BetSelector/BetSelector.test.tsx
    rationale: |
      A native `<select>` gets keyboard operability (AC10) and compact mobile layout (AC9) for
      free, and filtering the option list directly satisfies AC11 without extra ARIA plumbing.

  - description: |
      `ReelsPanel` minimal lock placeholder:

      ```tsx
      export interface ReelsPanelProps {
        locked: boolean;
      }

      export function ReelsPanel({ locked }: ReelsPanelProps): JSX.Element;
      ```

      Renders a `data-testid="reels-panel"` container with `aria-disabled={locked}` and the
      native `inert` attribute applied when `locked` is true, plus a placeholder child div. This
      is explicitly a stand-in for the real reel-rendering component delivered by a separate
      story in this epic; it only needs to expose and honor the lock contract.
    files:
      - src/components/ReelsPanel/ReelsPanel.tsx
      - src/components/ReelsPanel/ReelsPanel.test.tsx
    rationale: |
      AC5 and AC13 require the reels to be locked/unlocked in step with spin status, but reel
      rendering itself is out of scope for this story per the epic description; a minimal,
      inert-when-locked container is the smallest piece that makes those two ACs testable now
      without pre-building the future reel visuals.

  - description: |
      `SpinControls` composition component wiring `useGameControls` to `BetSelector`,
      `SpinButton`, and `ReelsPanel` inside a responsive flex layout, rendered from `App.tsx`:

      ```tsx
      export interface SpinControlsProps {
        walletBalance: number;
        betOptions: number[];
        initialBet: number;
        onSpinRequested: () => void;
      }

      export function SpinControls(props: SpinControlsProps): JSX.Element;
      ```

      Clicking the spin button (when enabled) calls `actions.startSpin()` and then
      `props.onSpinRequested()`; the caller (a future engine-integration story) is responsible for
      eventually calling back in to resolve the spin, which this component surfaces today only as
      `actions.completeSpin()` on the hook for tests to drive directly.
    files:
      - src/components/SpinControls/SpinControls.tsx
      - src/components/SpinControls/SpinControls.test.tsx
      - src/App.tsx
    rationale: |
      Provides the single integration point the AC6/AC7/AC9/AC10 tests exercise end-to-end
      (bet change -> disabled+tooltip reactivity, keyboard tab order, narrow layout), and gives
      `App.tsx` something concrete to render.

  - description: |
      Playwright end-to-end spec asserting no horizontal scroll and reachable controls at a
      360px-wide viewport.
    files:
      - e2e/responsive.spec.ts
    rationale: |
      AC9 is a real-layout assertion (`scrollWidth` vs `clientWidth`) that jsdom cannot evaluate
      since it does not run CSS layout; Playwright is the minimal addition that can render the
      actual page in a real browser engine at a fixed viewport size.

tests:
  - |
    AC1 — SpinButton.test.tsx: idle + affordable bet enables the button and clicking it fires.
    ```tsx
    it('enables spin when idle and the bet is affordable', () => {
      const onSpin = vi.fn();
      render(<SpinButton disabledReason={null} onSpin={onSpin} />);
      const button = screen.getByRole('button', { name: /spin/i });
      expect(button).toHaveAttribute('aria-disabled', 'false');
      expect(button).not.toHaveClass('btn-disabled');
      fireEvent.click(button);
      expect(onSpin).toHaveBeenCalledTimes(1);
    });
    ```
  - |
    AC2 — SpinButton.test.tsx: insufficient balance visually disables the button.
    ```tsx
    it('visually disables the spin button when balance is insufficient', () => {
      render(<SpinButton disabledReason="insufficient-balance" onSpin={vi.fn()} />);
      const button = screen.getByRole('button', { name: /spin/i });
      expect(button).toHaveAttribute('aria-disabled', 'true');
      expect(button).toHaveClass('btn-disabled');
    });
    ```
  - |
    AC3 — SpinButton.test.tsx: the "Insufficient balance" tooltip is shown.
    ```tsx
    it('shows an "Insufficient balance" tooltip when disabled for balance reasons', () => {
      render(<SpinButton disabledReason="insufficient-balance" onSpin={vi.fn()} />);
      const button = screen.getByRole('button', { name: /spin/i });
      expect(button).toHaveAttribute('title', 'Insufficient balance');
      expect(screen.getByText('Insufficient balance')).toBeInTheDocument();
    });
    ```
  - |
    AC4 — SpinButton.test.tsx: an in-flight spin ignores further clicks.
    ```tsx
    it('ignores clicks while a spin is in-flight', () => {
      const onSpin = vi.fn();
      render(<SpinButton disabledReason="in-flight" onSpin={onSpin} />);
      const button = screen.getByRole('button', { name: /spin/i });
      expect(button).toHaveAttribute('aria-disabled', 'true');
      fireEvent.click(button);
      expect(onSpin).not.toHaveBeenCalled();
    });
    ```
  - |
    AC5 — ReelsPanel.test.tsx: the reels are inert while a spin is in-flight.
    ```tsx
    it('marks the reels inert while a spin is in-flight', () => {
      render(<ReelsPanel locked />);
      const panel = screen.getByTestId('reels-panel');
      expect(panel).toHaveAttribute('inert', '');
      expect(panel).toHaveAttribute('aria-disabled', 'true');
    });
    ```
  - |
    AC6 — useGameControls.test.ts: an unaffordable bet change immediately disables spin.
    ```ts
    it('disables spin immediately when the new bet exceeds the wallet balance', () => {
      const { result } = renderHook(() =>
        useGameControls({ walletBalance: 50, betOptions: [10, 25, 50], initialBet: 25 })
      );
      act(() => result.current.actions.setBetAmount(50));
      act(() => result.current.actions.setBetAmount(75));
      expect(result.current.state.disabledReason).toBe('insufficient-balance');
    });
    ```
  - |
    AC7 — SpinControls.test.tsx: the insufficient-balance tooltip appears after a bet change.
    ```tsx
    it('shows the insufficient-balance tooltip after the bet becomes unaffordable', async () => {
      const user = userEvent.setup();
      render(
        <SpinControls
          walletBalance={50}
          betOptions={[10, 25, 50]}
          initialBet={10}
          onSpinRequested={vi.fn()}
        />
      );
      await user.selectOptions(screen.getByLabelText('Bet amount'), '50');
      expect(screen.getByRole('button', { name: /spin/i })).toHaveAttribute('aria-disabled', 'false');
      expect(screen.queryByText('Insufficient balance')).not.toBeInTheDocument();
    });
    ```
  - |
    AC8 — SpinButton.test.tsx: the disabled state and reason are exposed to assistive tech.
    ```tsx
    it('exposes the disabled state and reason to assistive tech', async () => {
      render(<SpinButton disabledReason="insufficient-balance" onSpin={vi.fn()} />);
      const button = screen.getByRole('button', { name: /spin/i });
      const describedById = button.getAttribute('aria-describedby');
      expect(describedById).toBeTruthy();
      expect(document.getElementById(describedById!)).toHaveTextContent('Insufficient balance');
      expect(await axe(button.ownerDocument.body)).toHaveNoViolations();
    });
    ```
  - |
    AC9 — e2e/responsive.spec.ts (Playwright): no horizontal scroll at 360px width and controls
    are visible.
    ```ts
    test('controls are reachable without horizontal scrolling at 360px width', async ({ page }) => {
      await page.setViewportSize({ width: 360, height: 640 });
      await page.goto('/');
      const hasHorizontalScroll = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth
      );
      expect(hasHorizontalScroll).toBe(false);
      await expect(page.getByRole('button', { name: /spin/i })).toBeVisible();
      await expect(page.getByLabel('Bet amount')).toBeVisible();
    });
    ```
  - |
    AC10 — SpinControls.test.tsx: bet selector and spin button are reachable and operable via
    keyboard alone.
    ```tsx
    it('is fully operable via keyboard alone', async () => {
      const user = userEvent.setup();
      const onSpinRequested = vi.fn();
      render(
        <SpinControls
          walletBalance={100}
          betOptions={[10, 25, 50]}
          initialBet={10}
          onSpinRequested={onSpinRequested}
        />
      );
      await user.tab();
      expect(screen.getByLabelText('Bet amount')).toHaveFocus();
      await user.tab();
      expect(screen.getByRole('button', { name: /spin/i })).toHaveFocus();
      await user.keyboard('{Enter}');
      expect(onSpinRequested).toHaveBeenCalledTimes(1);
    });
    ```
  - |
    AC11 — BetSelector.test.tsx: only affordable bet amounts are selectable.
    ```tsx
    it('only lists bet amounts the wallet can afford', () => {
      render(
        <BetSelector
          betOptions={[10, 25, 50, 100]}
          walletBalance={40}
          selectedBet={10}
          disabled={false}
          onChange={vi.fn()}
        />
      );
      const options = screen.getAllByRole('option').map((o) => o.textContent);
      expect(options).toEqual(['10', '25']);
    });
    ```
  - |
    AC12 — useGameControls.test.ts: spin re-enables on return to idle if the bet is still
    affordable.
    ```ts
    it('re-enables spin after a result if the bet is still affordable', () => {
      const { result } = renderHook(() =>
        useGameControls({ walletBalance: 100, betOptions: [10, 25], initialBet: 25 })
      );
      act(() => result.current.actions.startSpin());
      expect(result.current.state.disabledReason).toBe('in-flight');
      act(() => result.current.actions.completeSpin());
      expect(result.current.state.disabledReason).toBeNull();
    });
    ```
  - |
    AC13 — useGameControls.test.ts: the reels unlock on return to idle.
    ```ts
    it('unlocks the reels once a result is received', () => {
      const { result } = renderHook(() =>
        useGameControls({ walletBalance: 100, betOptions: [10], initialBet: 10 })
      );
      act(() => result.current.actions.startSpin());
      expect(result.current.state.reelsLocked).toBe(true);
      act(() => result.current.actions.completeSpin());
      expect(result.current.state.reelsLocked).toBe(false);
    });
    ```

assumptions_or_open_questions:
  - |
    No frontend framework/scaffold exists in the repo yet. This plan assumes React + TypeScript +
    Vite is an acceptable choice given the epic's "web interface" / "responsive layout" language;
    flag if a different stack was already decided elsewhere.
  - |
    Real reel rendering/animation is a separate epic story. `ReelsPanel` here is intentionally a
    minimal locked/unlocked placeholder that only satisfies the AC5/AC13 lock contract; the
    reel-rendering story is expected to extend or replace its internals while keeping the
    `locked` prop contract.
  - |
    `betOptions`/`walletBalance` are passed into `SpinControls`/`App.tsx` as static demo props;
    no existing wallet/session service was found in the repo, so real wallet-balance sourcing is
    assumed to be wired up by a separate story.
  - |
    AC6/AC7 ("changing the bet amount") are exercised through `useGameControls`'s
    `setBetAmount` action (the same function `BetSelector`'s `onChange` calls) rather than only
    through the filtered `<select>`, since the dropdown itself (AC11) never exposes an amount
    that exceeds the wallet balance. This keeps the disable/tooltip derivation correct for any
    future bet-entry surface, not just the current dropdown.
  - |
    AC8's screen-reader announcement is implemented via `aria-disabled` (button stays focusable)
    rather than the native `disabled` attribute, since a natively disabled button is removed from
    the tab order and would be unreachable for a screen-reader user to hear the reason via
    `aria-describedby`. Confirm this is the desired behavior for a disabled control.
  - |
    The Vite dev server port reads `process.env.ARC_WEB_PORT` (falling back to 5173) to align
    with the port already reserved for this work item in `.env`; Playwright's `baseURL` is
    configured to match.

package_dependencies:
  - name: react
    version: ^18.3.1
    ecosystem: npm
    rationale: UI library for the controls and future reel/animation components in this epic.
  - name: react-dom
    version: ^18.3.1
    ecosystem: npm
    rationale: DOM renderer paired with react.
  - name: typescript
    version: ^5.6.3
    ecosystem: npm
    rationale: Type-checked component and hook signatures used throughout this plan's scope.
  - name: vite
    version: ^5.4.11
    ecosystem: npm
    rationale: Dev server/build tool for the new application scaffold.
  - name: "@vitejs/plugin-react"
    version: ^4.3.4
    ecosystem: npm
    rationale: Enables React JSX/Fast Refresh support in the Vite scaffold.
  - name: vitest
    version: ^2.1.8
    ecosystem: npm
    rationale: Unit/integration test runner for the hook and component tests (AC1-8, 10-13).
  - name: "@testing-library/react"
    version: ^16.0.1
    ecosystem: npm
    rationale: Renders and queries React components/hooks in tests.
  - name: "@testing-library/jest-dom"
    version: ^6.6.3
    ecosystem: npm
    rationale: DOM assertion matchers (toHaveAttribute, toHaveClass, toHaveFocus, etc.) used across the test suite.
  - name: "@testing-library/user-event"
    version: ^14.5.2
    ecosystem: npm
    rationale: Realistic keyboard/tab-order simulation needed for the AC10 keyboard-only test.
  - name: jsdom
    version: ^25.0.1
    ecosystem: npm
    rationale: DOM environment Vitest runs component tests in.
  - name: jest-axe
    version: ^9.0.0
    ecosystem: npm
    rationale: toHaveNoViolations matcher used by the AC8 accessibility assertion on the disabled spin button.
  - name: "@playwright/test"
    version: ^1.49.1
    ecosystem: npm
    rationale: Real-browser viewport/layout test needed for the AC9 360px no-horizontal-scroll assertion, which jsdom cannot evaluate.

notes: |
  This is a greenfield addition — the repo currently has no application code, only
  `design-system/` tokens/utilities and this README. The diagram below shows the composition
  this plan introduces and how it reaches into the existing, unmodified `tokens.css` and the
  two new classes added to `prototype-utils.css`.

  ```mermaid
  flowchart TD
    App[App.tsx] -->|renders root screen, AC9/AC10 layout| SpinControls[SpinControls.tsx]
    SpinControls -->|owns wallet/bet/spin state, AC1 AC2 AC4 AC6 AC12| Hook[useGameControls.ts]
    SpinControls -->|renders affordable bets, AC11| BetSelector[BetSelector.tsx]
    SpinControls -->|renders spin action, AC1-4 AC8| SpinButton[SpinButton.tsx]
    SpinControls -->|reflects lock state, AC5 AC13| ReelsPanel[ReelsPanel.tsx]
    BetSelector -.->|uses new .btn-disabled/.u-visually-hidden, AC2 AC3 AC8| CSS[prototype-utils.css]
    SpinButton -.->|uses new .btn-disabled/.u-visually-hidden, AC2 AC3 AC8| CSS
    ReelsPanel -.->|uses existing token classes| CSS
    CSS --> Tokens[tokens.css]

    classDef touched fill:#f96,color:#000
    class App,SpinControls,Hook,BetSelector,SpinButton,ReelsPanel,CSS touched
  ```

  Reel rendering itself, spin-animation, and the real spin-request/engine integration are out of
  scope per the epic description ("reel rendering, spin animations, win-line celebrations driven
  by the engine result payload" are called out as separate concerns); this story only builds the
  controls and the state derivation those later stories will plug into via
  `actions.startSpin()` / `actions.completeSpin()`.
