summary: |
  This is the first feature story in the repo (only the design-system token bootstrap exists so
  far — no application code, package manifest, or test runner has been created yet). The plan
  bootstraps a minimal Node/Vitest project and implements the winnings-credit behavior as three
  small, test-first modules: a pure wallet function that adds engine winnings to the player's
  balance, a UI helper that renders the updated balance, and a spin-result orchestrator that
  wires the two together and only re-enables the next spin once the new balance has been
  displayed. Scope is deliberately narrow: crediting winnings after a spin and making the updated
  balance visible before the next spin, per the three acceptance criteria. Bet deduction, balance
  initialization on visit, and the game engine itself belong to sibling stories in the "Player
  Wallet & Betting" epic and are out of scope here; this story only consumes their outputs
  (a post-deduction balance and an engine-provided winning amount) via plain function arguments.
scope:
  - description: |
      Bootstrap a minimal Node package and Vitest test runner, since no `package.json` or test
      framework exists anywhere in the repo yet.
    files:
      - "package.json"
    rationale: |
      A test-first plan needs a runnable test command before any failing test can be written.
      Nothing in the repo currently provides one (confirmed via glob: only design-system CSS/HTML
      and a Python contrast-checker script exist).
  - description: |
      Add a pure `creditWinnings` function in the wallet domain that adds a winning amount to the
      current balance, with no side effects.
      Signature: `export function creditWinnings(currentBalance, winningAmount)` returning a
      `number`.
    files:
      - "src/wallet/creditWinnings.js"
      - "src/wallet/creditWinnings.test.js"
    rationale: |
      Covers AC1 and AC2 in isolation: crediting a positive win, and crediting zero (no change),
      as a pure unit with no DOM/engine coupling so the arithmetic is trivially testable.
  - description: |
      Add a UI helper that renders the current balance into a container element.
      Signature: `export function updateBalanceDisplay(container, balance)`.
    files:
      - "src/ui/balanceDisplay.js"
      - "src/ui/balanceDisplay.test.js"
    rationale: |
      AC1 and AC3 both require the updated total to be "displayed" / "visible to the player" —
      this isolates the rendering concern from the arithmetic so each can be tested independently.
  - description: |
      Add a spin-result orchestrator that credits winnings, updates the balance display, and only
      then re-enables the next spin.
      Signature: `export function handleSpinResult({ postDeductionBalance, winningAmount,
      balanceContainer, spinButton })` returning the new balance (`number`).
    files:
      - "src/spin/handleSpinResult.js"
      - "src/spin/handleSpinResult.test.js"
    rationale: |
      This is the integration point AC3 actually tests: it must call `updateBalanceDisplay`
      before flipping `spinButton.disabled` back to `false`, so the new balance is guaranteed
      visible before the player can trigger another spin. It composes the two lower-level
      modules rather than duplicating their logic.
tests:
  - |
    AC1 (win credited and displayed) — `src/wallet/creditWinnings.test.js`:
    ```js
    import { describe, it, expect } from 'vitest';
    import { creditWinnings } from './creditWinnings.js';

    describe('creditWinnings', () => {
      it('adds a positive winning amount to the current balance', () => {
        expect(creditWinnings(100, 25)).toBe(125);
      });
    });
    ```
    Paired with `src/spin/handleSpinResult.test.js` asserting the displayed total:
    ```js
    it('displays the updated balance after a win', () => {
      const balanceContainer = { textContent: '' };
      const spinButton = { disabled: true };
      const newBalance = handleSpinResult({
        postDeductionBalance: 100,
        winningAmount: 25,
        balanceContainer,
        spinButton,
      });
      expect(newBalance).toBe(125);
      expect(balanceContainer.textContent).toBe('125');
    });
    ```
  - |
    AC2 (zero winnings, no further change) — `src/wallet/creditWinnings.test.js`:
    ```js
    it('leaves the balance unchanged when winnings are zero', () => {
      expect(creditWinnings(100, 0)).toBe(100);
    });
    ```
    Paired with an orchestrator-level assertion in `src/spin/handleSpinResult.test.js`:
    ```js
    it('keeps the post-deduction balance when the engine returns zero winnings', () => {
      const balanceContainer = { textContent: '' };
      const spinButton = { disabled: true };
      const newBalance = handleSpinResult({
        postDeductionBalance: 80,
        winningAmount: 0,
        balanceContainer,
        spinButton,
      });
      expect(newBalance).toBe(80);
      expect(balanceContainer.textContent).toBe('80');
    });
    ```
  - |
    AC3 (new balance visible before next spin can be initiated) —
    `src/spin/handleSpinResult.test.js`, asserting ordering rather than just end state:
    ```js
    it('re-enables the spin button only after the balance display has been updated', () => {
      const order = [];
      const balanceContainer = {
        set textContent(value) {
          order.push(['display', value]);
        },
      };
      const spinButton = {
        _disabled: true,
        get disabled() { return this._disabled; },
        set disabled(value) {
          order.push(['button-disabled', value]);
          this._disabled = value;
        },
      };
      handleSpinResult({
        postDeductionBalance: 50,
        winningAmount: 10,
        balanceContainer,
        spinButton,
      });
      expect(order).toEqual([
        ['display', '60'],
        ['button-disabled', false],
      ]);
    });
    ```
assumptions_or_open_questions:
  - "No package.json, source tree, or test runner exists in the repo yet (verified via glob for **/package.json and **/*.{js,ts,jsx,tsx,py}); this plan bootstraps the minimal Node + Vitest scaffold under src/ rather than assuming a pre-existing app structure."
  - "No game engine or bet-placement/balance-initialization code exists yet (sibling stories in the same epic). This story treats the post-deduction balance and the engine's winning amount as plain function inputs (postDeductionBalance, winningAmount) rather than importing a real engine or wallet-state module, since those don't exist yet and are out of this story's scope."
  - "Balance is rendered as a plain integer string (e.g. \"125\") with no currency symbol or locale formatting, consistent with the epic description calling it an in-session 'play-money' balance rather than real currency."
  - "The spin button's disabled/enabled lifecycle before/during a spin (i.e. disabling it when a spin starts) belongs to the bet-placement story; this story only owns re-enabling it after the winnings credit + display update, per AC3's literal wording ('before the next spin can be initiated')."
  - "Vitest is chosen as the test runner because it requires no additional config for plain ESM JS and is currently the lightest-weight standard choice for a from-scratch Node project; no existing convention in the repo dictates a runner."
  - "DEVIATION FROM PLAN: the implementation uses Node's built-in `node:test` runner (via `node --test`) instead of the vitest@^2.1.0 devDependency specified above. `npm install vitest` fails in the execution environment with a 403 Forbidden from the npm registry (no network access to install any new package), so vitest could not actually be installed. `node:test`/`node:assert/strict` ship with the installed Node 22 runtime with zero external dependencies, satisfy the same test-first requirement, and `npm test` (`node --test`) runs and passes all suites. If a future story needs vitest-specific features (snapshot testing, jsdom environment, etc.) and registry access is restored, the test files would need to be migrated from `node:test`/`node:assert` syntax to `describe/it/expect`."
package_dependencies:
  - name: vitest
    version: "^2.1.0"
    ecosystem: npm
    rationale: "No test runner exists anywhere in the repo yet; Vitest is needed as the devDependency to write and run the failing tests this plan specifies."
    status: "NOT INSTALLED — see assumptions_or_open_questions deviation note. `node --test` (built-in, zero dependencies) is used instead because the execution environment has no npm registry access."
notes: |
  This is a greenfield story: `design-system/` currently contains only CSS tokens and a static
  HTML style guide (no JS/TS application code, no `package.json`). This plan introduces the
  smallest possible application slice needed to satisfy the three ACs, without pulling in a
  frontend framework, bundler, or the not-yet-built game engine / wallet-state / bet-placement
  modules from sibling stories in the "Player Wallet & Betting" epic.

  ```mermaid
  flowchart TD
    classDef touched fill:#f96,color:#000

    CW["src/wallet/creditWinnings.js<br/>creditWinnings(balance, winnings)"]:::touched
    BD["src/ui/balanceDisplay.js<br/>updateBalanceDisplay(container, balance)"]:::touched
    SR["src/spin/handleSpinResult.js<br/>handleSpinResult(...)"]:::touched
    CWT["creditWinnings.test.js"]:::touched
    BDT["balanceDisplay.test.js"]:::touched
    SRT["handleSpinResult.test.js"]:::touched

    SR -->|"credits winnings first"| CW
    SR -->|"then renders new balance"| BD
    SR -->|"only then re-enables spinButton (AC3)"| SR

    CWT -->|"unit tests AC1/AC2 arithmetic"| CW
    BDT -->|"unit tests rendering"| BD
    SRT -->|"integration tests AC1/AC2/AC3 ordering"| SR
  ```

  Future stories (bet deduction/placement, engine result generation, balance initialization on
  visit) will need to call into `handleSpinResult` and `creditWinnings`; this plan keeps their
  interfaces as plain, dependency-free function signatures precisely so those stories can wire in
  real engine/wallet-state objects later without changing this story's tested contract.
