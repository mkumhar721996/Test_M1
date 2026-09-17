summary: |
  This is the first story to introduce application code in this repository — today the
  repository only contains a design-token bootstrap (`design-system/tokens.json`,
  `tokens.css`, `prototype-utils.css`, `style-guide.html`) with no framework, app scaffold,
  or test runner. This plan therefore does two things together: (1) stands up the minimal
  React + TypeScript + Vite + Vitest scaffold and a bare spin flow (idle -> spinning ->
  complete) just deep enough to have something to freeze, and (2) implements engine error
  recovery on top of it per TEST-M1-STORY-018 — freezing reels immediately on an engine
  error, showing an accessible inline error with Retry/Reload actions, resuming from the
  frozen state on a successful Retry, returning to idle on Reload, and preserving a spin
  result that resolved server-side before Reload was pressed instead of discarding it.
  Win-line celebration, paytable, and full reel visuals are explicitly out of scope — this
  story only builds the reel/spin substrate needed to exercise error recovery.

scope:
  - description: |
      Bootstrap the build/test tooling since none exists in the repo yet: React 18 +
      TypeScript app served by Vite, with Vitest + React Testing Library configured for
      jsdom. `index.html` links the existing `design-system/tokens.css` and
      `prototype-utils.css` so new components can reuse existing `.btn`/`.card` classes
      rather than inventing new styling primitives.
    files:
      - package.json
      - tsconfig.json
      - vite.config.ts
      - vitest.setup.ts
      - index.html
      - src/main.tsx
    rationale: |
      No test runner or app entrypoint exists yet, so every test file below would fail to
      even execute without this. Reusing design-system tokens/classes keeps this story
      consistent with the already-merged design-system bootstrap (commit 08c828a) instead
      of introducing a second styling approach.

  - description: |
      Define the engine client contract the spin flow talks to: a swappable interface with
      a real fetch-backed implementation, decoupled from any assumed transport since no
      backend contract is defined yet.
      ```ts
      export interface SpinResult {
        spinId: string;
        reelPositions: number[];
        winAmount: number;
      }
      export interface EngineClient {
        requestSpin(): Promise<SpinResult>;
        retrySpin(spinId: string): Promise<SpinResult>;
      }
      export function createFetchEngineClient(baseUrl: string): EngineClient;
      ```
    files:
      - src/engine/engineClient.ts
      - src/engine/engineClient.test.ts
    rationale: |
      AC1/AC4/AC7 all hinge on distinguishing a failed vs. succeeded engine response and on
      retrying against the same in-flight spin — this interface is the seam the state
      machine and tests are written against.

  - description: |
      Spin state machine (pure reducer) covering idle -> spinning -> frozen-error ->
      retrying -> complete, and freezing reel positions at the exact tick they were at when
      the error arrived.
      ```ts
      export type SpinStatus = 'idle' | 'spinning' | 'frozen-error' | 'retrying' | 'complete';
      export interface SpinState {
        status: SpinStatus;
        spinId: string | null;
        reelPositions: number[];
        result: SpinResult | null;
        errorMessage: string | null;
      }
      export type SpinEvent =
        | { type: 'SPIN_REQUESTED'; spinId: string }
        | { type: 'REEL_TICK'; positions: number[] }
        | { type: 'ENGINE_ERROR'; message: string }
        | { type: 'RETRY_REQUESTED' }
        | { type: 'ENGINE_RESOLVED'; result: SpinResult }
        | { type: 'HYDRATE_FROM_PENDING'; result: SpinResult };
      export function spinReducer(state: SpinState, event: SpinEvent): SpinState;
      ```
    files:
      - src/state/spinMachine.ts
      - src/state/spinMachine.test.ts
    rationale: |
      AC1 requires the reels to freeze "in their current animated position immediately" —
      modeling this as a pure reducer lets the freeze test assert exact positions without
      timers, animation frames, or a rendered component.

  - description: |
      Pending-outcome persistence so a resolved spin result survives a page reload
      (sessionStorage, scoped to the tab/session rather than cross-session).
      ```ts
      export function savePendingOutcome(result: SpinResult): void;
      export function loadPendingOutcome(): SpinResult | null;
      export function clearPendingOutcome(): void;
      ```
    files:
      - src/state/pendingOutcomeStore.ts
      - src/state/pendingOutcomeStore.test.ts
    rationale: |
      AC7 requires that a result which resolved server-side before Reload is pressed is
      "preserved and made available" rather than discarded by the reload. Since Reload is a
      real page reload, in-memory state alone cannot survive it — this needs to be written
      to storage the moment a result is received.

  - description: |
      `useSpinController` hook: wires the reducer, engine client, and pending-outcome store
      together; exposes `spin()`, `retry()`, `reload()`. On mount it checks
      `loadPendingOutcome()` before deciding whether to start in `idle` or `complete`. Any
      successful engine response (from the original request, a retry, or a late resolution
      of the original in-flight promise after an error) is persisted via
      `savePendingOutcome` immediately, before it is reflected into UI state.
      ```ts
      export function useSpinController(engineClient: EngineClient): {
        state: SpinState;
        spin: () => Promise<void>;
        retry: () => Promise<void>;
        reload: () => void;
      };
      ```
    files:
      - src/state/useSpinController.ts
      - src/state/useSpinController.test.ts
    rationale: |
      This is the integration point for AC1, AC4, AC5, and AC7 — it is what actually calls
      the engine, catches the error, retries, and reloads, so it is the natural place to
      assert end-to-end behavior without a full DOM render.

  - description: |
      `ReelStrip` component: renders reel positions and pauses its CSS animation
      (`animation-play-state: paused`) when the controller status is `frozen-error`, so the
      reels visually stop exactly where they were.
    files:
      - src/components/ReelStrip.tsx
      - src/components/ReelStrip.test.tsx
      - src/components/reel.css
    rationale: |
      AC1's "freeze in their current animated position" is a visual requirement, not just a
      state one — this is the component that has to actually stop moving.

  - description: |
      `ErrorBanner` component: inline error message with `role="alert"` and
      `aria-live="assertive"` wrapping both the message and the two action buttons, styled
      with the existing `.card`/`.btn-primary`/`.btn-secondary` classes from
      `design-system/prototype-utils.css`.
      ```tsx
      interface ErrorBannerProps {
        message: string;
        onRetry: () => void;
        onReload: () => void;
      }
      export function ErrorBanner({ message, onRetry, onReload }: ErrorBannerProps): JSX.Element;
      ```
    files:
      - src/components/ErrorBanner.tsx
      - src/components/ErrorBanner.test.tsx
    rationale: |
      AC2, AC3, and AC6 are all about this one component: an inline (not modal/toast)
      message, both actions present, and screen-reader announcement via a live region that
      contains the actions so they are discoverable via the same announcement.

  - description: |
      `GameView` integration component: renders a spin trigger, `ReelStrip`, and
      conditionally `ErrorBanner` based on `useSpinController` state; wired into `App.tsx`.
    files:
      - src/components/GameView.tsx
      - src/components/GameView.test.tsx
      - src/App.tsx
    rationale: |
      Needed to prove the pieces above actually compose into the player-visible flow the
      acceptance criteria describe (inline error "within the game view", frozen reels
      visible alongside it, etc.) rather than only unit-testing each piece in isolation.

tests:
  - |
    AC1 — src/state/spinMachine.test.ts: freezes reel positions immediately on engine error.
    ```ts
    it('freezes reel positions immediately when the engine reports an error mid-spin', () => {
      let state = spinReducer(initialSpinState, { type: 'SPIN_REQUESTED', spinId: 'spin-1' });
      state = spinReducer(state, { type: 'REEL_TICK', positions: [12, 34, 56] });
      state = spinReducer(state, { type: 'ENGINE_ERROR', message: 'Spin failed to resolve.' });
      expect(state.status).toBe('frozen-error');
      expect(state.reelPositions).toEqual([12, 34, 56]);
    });
    ```
    Companion visual test in src/components/ReelStrip.test.tsx:
    ```tsx
    it('pauses reel animation when frozen due to an engine error', () => {
      render(<ReelStrip positions={[12, 34, 56]} status="frozen-error" />);
      expect(screen.getByTestId('reel-0')).toHaveStyle({ animationPlayState: 'paused' });
    });
    ```
  - |
    AC2 — src/components/GameView.test.tsx: inline error shown within the game view.
    ```tsx
    it('shows an inline error message inside the game view when the engine errors', async () => {
      const engineClient = { requestSpin: vi.fn().mockRejectedValue(new Error('boom')), retrySpin: vi.fn() };
      render(<GameView engineClient={engineClient} />);
      fireEvent.click(screen.getByRole('button', { name: /spin/i }));
      expect(await screen.findByRole('alert')).toHaveTextContent(/something went wrong/i);
    });
    ```
  - |
    AC3 — src/components/ErrorBanner.test.tsx: both Retry and Reload actions are present.
    ```tsx
    it('offers both a Retry and a Reload action', () => {
      render(<ErrorBanner message="Spin failed." onRetry={vi.fn()} onReload={vi.fn()} />);
      expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
    });
    ```
  - |
    AC4 — src/state/useSpinController.test.ts: retry succeeds and the spin resumes/completes
    from the frozen state.
    ```ts
    it('resumes and completes the spin from the frozen state when retry succeeds', async () => {
      const result = { spinId: 'spin-1', reelPositions: [1, 2, 3], winAmount: 0 };
      const engineClient = {
        requestSpin: vi.fn().mockRejectedValue(new Error('network drop')),
        retrySpin: vi.fn().mockResolvedValue(result),
      };
      const { result: hook } = renderHook(() => useSpinController(engineClient));
      await act(() => hook.current.spin());
      expect(hook.current.state.status).toBe('frozen-error');
      await act(() => hook.current.retry());
      expect(engineClient.retrySpin).toHaveBeenCalledWith(expect.any(String));
      expect(hook.current.state.status).toBe('complete');
      expect(hook.current.state.result).toEqual(result);
    });
    ```
  - |
    AC5 — src/state/useSpinController.test.ts: reload with nothing pending returns to idle;
    src/components/ErrorBanner.test.tsx: Reload button actually triggers a page reload.
    ```ts
    it('returns to idle state after reload when no spin resolved server-side', () => {
      sessionStorage.clear();
      const { result: hook } = renderHook(() => useSpinController(engineClient));
      expect(hook.current.state.status).toBe('idle');
    });
    ```
    ```tsx
    it('reloads the page when Reload is selected', () => {
      const reloadSpy = vi.fn();
      Object.defineProperty(window, 'location', { value: { reload: reloadSpy }, writable: true });
      render(<ErrorBanner message="x" onRetry={vi.fn()} onReload={() => window.location.reload()} />);
      fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
      expect(reloadSpy).toHaveBeenCalled();
    });
    ```
  - |
    AC6 — src/components/ErrorBanner.test.tsx: error and actions are announced to screen readers.
    ```tsx
    it('announces the error message and actions to screen readers', () => {
      render(<ErrorBanner message="Spin failed." onRetry={vi.fn()} onReload={vi.fn()} />);
      const region = screen.getByRole('alert');
      expect(region).toHaveAttribute('aria-live', 'assertive');
      expect(region).toContainElement(screen.getByRole('button', { name: 'Retry' }));
      expect(region).toContainElement(screen.getByRole('button', { name: 'Reload' }));
    });
    ```
  - |
    AC7 — src/state/pendingOutcomeStore.test.ts and src/state/useSpinController.test.ts:
    a result resolved server-side before Reload is preserved, not discarded.
    ```ts
    it('preserves a spin result that resolved server-side after the error but before reload', () => {
      savePendingOutcome({ spinId: 'spin-1', reelPositions: [7, 8, 9], winAmount: 25 });
      const { result: hook } = renderHook(() => useSpinController(engineClient));
      expect(hook.current.state.status).toBe('complete');
      expect(hook.current.state.result).toEqual({ spinId: 'spin-1', reelPositions: [7, 8, 9], winAmount: 25 });
      expect(loadPendingOutcome()).toBeNull();
    });
    ```
    ```ts
    it('persists the resolved result to storage as soon as the engine responds, even mid-error', async () => {
      const result = { spinId: 'spin-1', reelPositions: [1, 2, 3], winAmount: 10 };
      const engineClient = { requestSpin: vi.fn().mockRejectedValue(new Error('drop')), retrySpin: vi.fn().mockResolvedValue(result) };
      const { result: hook } = renderHook(() => useSpinController(engineClient));
      await act(() => hook.current.spin());
      await act(() => hook.current.retry());
      expect(sessionStorage.getItem('engine-pending-outcome')).not.toBeNull();
    });
    ```

assumptions_or_open_questions:
  - |
    No app framework, scaffold, or test runner exists in this repo yet — only the
    design-token bootstrap from commit 08c828a. This plan picks React 18 + TypeScript +
    Vite + Vitest + React Testing Library as that hasn't been decided anywhere in the repo;
    flag for confirmation before implementation since it is a foundational choice this and
    future stories will build on.
  - |
    "Engine result payload fails or returns an error" is modeled as any rejected promise
    from `EngineClient.requestSpin`/`retrySpin`. No backend/wire contract exists yet, so
    `EngineClient` is kept as a swappable interface with no assumption about HTTP vs.
    WebSocket transport.
  - |
    AC7's "resolved server-side before Reload" is modeled as: whichever promise the
    controller is waiting on (the original request, or a retry) is not abandoned when an
    error is shown, and if it later settles successfully before Reload is pressed, that
    result is persisted immediately. The story does not specify the actual out-of-band
    channel a server-side resolution would arrive on (e.g. a dedicated reconciliation poll
    or push channel); this plan does not build one, since none is specified — only the
    persistence/hydration contract that such a channel would eventually feed into.
  - |
    sessionStorage (not localStorage) is used for pending-outcome persistence since the ACs
    describe a same-tab reload, not durable cross-session recovery.
  - |
    Error message copy ("Something went wrong completing your spin.") is a placeholder
    pending confirmation from design/content; the exact wording is not specified in the
    story.
  - |
    No visual mock exists for the error banner, so this plan reuses the existing
    `.card`/`.btn-primary`/`.btn-secondary` classes from `design-system/prototype-utils.css`
    rather than introducing new component styles.

package_dependencies:
  - name: react
    version: ^18.3.1
    ecosystem: npm
    rationale: UI framework for GameView/ReelStrip/ErrorBanner; nothing in the repo currently depends on a UI framework.
  - name: react-dom
    version: ^18.3.1
    ecosystem: npm
    rationale: DOM renderer paired with react.
  - name: typescript
    version: ^5.5.4
    ecosystem: npm
    rationale: All new source files are TypeScript; no compiler is configured in the repo yet.
  - name: vite
    version: ^5.4.0
    ecosystem: npm
    rationale: Dev server/build tool for the new app; no bundler exists yet.
  - name: "@vitejs/plugin-react"
    version: ^4.3.1
    ecosystem: npm
    rationale: Enables JSX/Fast Refresh support for React components under Vite.
  - name: vitest
    version: ^2.0.5
    ecosystem: npm
    rationale: Test runner for every *.test.ts/tsx file in this plan; no test runner exists yet.
  - name: jsdom
    version: ^24.1.1
    ecosystem: npm
    rationale: DOM environment for Vitest so component tests can render and query the DOM.
  - name: "@testing-library/react"
    version: ^16.0.0
    ecosystem: npm
    rationale: Renders and queries React components (ReelStrip, ErrorBanner, GameView) in tests.
  - name: "@testing-library/jest-dom"
    version: ^6.4.8
    ecosystem: npm
    rationale: toHaveStyle/toHaveAttribute/toContainElement matchers used in the accessibility and freeze tests.
  - name: "@testing-library/user-event"
    version: ^14.5.2
    ecosystem: npm
    rationale: Simulates the player clicking Retry/Reload/Spin in integration tests.
  - name: "@types/react"
    version: ^18.3.3
    ecosystem: npm
    rationale: Type definitions for react, required for the TypeScript component files.
  - name: "@types/react-dom"
    version: ^18.3.0
    ecosystem: npm
    rationale: Type definitions for react-dom.

notes: |
  This story lands in a repo whose only prior commit is the design-system bootstrap
  (08c828a) — there is no existing spin/reel/engine code to extend, so this plan builds the
  minimal substrate (engine client, spin reducer, ReelStrip, GameView) needed to hang error
  recovery on, per the parent epic ("Game UI & Animations"). It intentionally does not
  build win-line celebration, paytable display, or full responsive layout — those belong to
  other stories under the same epic.

  ```mermaid
  flowchart TD
    classDef touched fill:#f96,color:#000

    App[App.tsx] --> GameView[GameView.tsx]
    GameView -->|drives spin/retry/reload| Controller[useSpinController.ts]
    Controller -->|dispatches events| Reducer[spinMachine.ts]
    Controller -->|requestSpin/retrySpin| EngineClient[engineClient.ts]
    Controller -->|save/load/clear on mount + on resolve| PendingStore[pendingOutcomeStore.ts]
    GameView -->|renders frozen/moving reels| ReelStrip[ReelStrip.tsx]
    GameView -->|shown when status=frozen-error| ErrorBanner[ErrorBanner.tsx]

    class App,GameView,Controller,Reducer,EngineClient,PendingStore,ReelStrip,ErrorBanner touched
  ```
