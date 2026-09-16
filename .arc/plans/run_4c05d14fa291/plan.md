summary: |
  This repository currently has no application code at all — only a design-system CSS/token
  bootstrap (`design-system/`) and a placeholder README. There is no wallet, no bet-placement
  flow, no game-engine client, no package manifest, and no test runner. This plan implements
  TEST-M1-STORY-011 (refund the deducted bet when the game engine errors) by introducing the
  minimal slice of the "Player Wallet & Betting" epic needed to make the three acceptance
  criteria testable and true: a `Wallet` balance store, a `GameEngine` contract (interface +
  result type, mocked in tests since no real engine exists yet), and a `SpinService` that
  deducts the bet, invokes the engine, and credits the bet back only when the engine reports
  failure. Crediting winnings on success and the upstream "place a bet" UI/API are explicitly
  out of scope — AC3 only requires that a successful engine response does NOT trigger a refund,
  not that payouts are applied. Because no tooling exists yet, this plan also bootstraps a
  minimal TypeScript project so the failing tests can actually run. The npm registry was not
  reachable from the implementation environment (proxy returned 403 Forbidden for every
  package, confirmed with an unrelated probe package), so the runner is Node's built-in
  `node:test` with `--experimental-strip-types` rather than Vitest — this requires zero
  installed dependencies. This mirrors the same deviation already adopted by sibling stories
  in this repo (e.g. TEST-M1-STORY-006) that hit the same registry block.

scope:
  - description: |
      Bootstrap minimal project tooling so tests can be written and run at all: a `package.json`
      with a `test` script and a `tsconfig.json`. No `vitest.config.ts` or npm devDependencies
      are needed since the test script runs on Node's native TypeScript-stripping test runner.

      `package.json`:
      ```json
      {
        "name": "test-m1",
        "version": "0.0.0",
        "private": true,
        "type": "module",
        "engines": {
          "node": ">=22.6.0"
        },
        "scripts": {
          "test": "node --experimental-strip-types --test src/**/*.test.ts"
        }
      }
      ```
    files:
      - package.json
      - tsconfig.json
    rationale: |
      No manifest, compiler config, or test runner exists in the repo yet. Every acceptance
      criterion is expressed as an automated test, so a runnable test harness is a hard
      prerequisite before any failing test can even be written. Node's built-in test runner
      with `--experimental-strip-types` (Node >=22.6) satisfies this without requiring any
      npm install, which the implementation environment could not perform.

  - description: |
      Add a `Wallet` class representing the player's in-session play-money balance, with
      `deduct` and `credit` operations.

      ```ts
      export class Wallet {
        private _balance: number;
        constructor(initialBalance: number) {
          this._balance = initialBalance;
        }
        get balance(): number {
          return this._balance;
        }
        deduct(amount: number): void {
          this._balance -= amount;
        }
        credit(amount: number): void {
          this._balance += amount;
        }
      }
      ```
    files:
      - src/wallet/wallet.ts
    rationale: |
      All three ACs are phrased in terms of the player's balance before/after a spin. The
      wallet is the smallest unit of state the SpinService needs to mutate to satisfy them;
      nothing in the epic's wallet/betting code exists yet to build on.

  - description: |
      Define the `GameEngine` contract: a discriminated-union result type distinguishing
      success from error, and the interface `SpinService` depends on.

      ```ts
      export type GameEngineResult =
        | { success: true; payout: number; outcome: unknown }
        | { success: false; error: string };

      export interface GameEngine {
        spin(bet: number): Promise<GameEngineResult>;
      }
      ```
    files:
      - src/betting/gameEngine.ts
    rationale: |
      The story's trigger is "the game engine returns an error response" vs. "a successful
      response." There is no real engine implementation in this repo to call; a typed contract
      lets SpinService branch on success/error and lets tests supply a fake/mocked engine
      without depending on unbuilt infrastructure.

  - description: |
      Add `SpinService`, which orchestrates a spin: deduct the bet from the wallet, call the
      engine, and credit the bet back to the wallet only if the engine result is an error.

      ```ts
      export class SpinService {
        private wallet: Wallet;
        private engine: GameEngine;

        constructor(wallet: Wallet, engine: GameEngine) {
          this.wallet = wallet;
          this.engine = engine;
        }

        async spin(bet: number): Promise<GameEngineResult> {
          this.wallet.deduct(bet);
          const result = await this.engine.spin(bet);
          if (!result.success) {
            this.wallet.credit(bet);
          }
          return result;
        }
      }
      ```
    files:
      - src/betting/spinService.ts
    rationale: |
      This is the actual refund behavior the story requires: deduct-then-conditionally-refund
      in one place, so the wallet is never left short due to a technical failure but a
      genuine successful spin's deduction stands. Fields are assigned explicitly in the
      constructor body rather than via TypeScript parameter-property shorthand, since Node's
      `--experimental-strip-types` mode does not support that syntax.

tests:
  - |
    AC1 — refund on engine error, `src/betting/spinService.test.ts`:
    ```ts
    test('credits the deducted bet back to balance when engine errors', async () => {
      const wallet = new Wallet(100);
      const engine: GameEngine = {
        spin: async (): Promise<GameEngineResult> => ({ success: false, error: 'ENGINE_TIMEOUT' }),
      };
      const spinService = new SpinService(wallet, engine);

      await spinService.spin(10);

      assert.equal(wallet.balance, 100);
    });
    ```
    This fails before `SpinService` exists / before it calls `wallet.credit(bet)` on error.
    (Uses `node:test` + `node:assert/strict`, not Vitest — see summary for why.)

  - |
    AC2 — balance restored exactly to its pre-spin value, `src/betting/spinService.test.ts`:
    ```ts
    test('restores balance to exactly its pre-spin value after a refund', async () => {
      const wallet = new Wallet(37.5);
      const balanceBeforeSpin = wallet.balance;
      const engine: GameEngine = {
        spin: async (): Promise<GameEngineResult> => ({ success: false, error: 'ENGINE_DOWN' }),
      };
      const spinService = new SpinService(wallet, engine);

      await spinService.spin(12.5);

      assert.equal(wallet.balance, balanceBeforeSpin);
    });
    ```
    This is deliberately a separate test from AC1 (compares against a captured pre-spin value
    rather than a hard-coded number) so an implementation that refunds the wrong amount but
    coincidentally matches a literal in AC1's test would still be caught.

  - |
    AC3 — no refund on engine success, `src/betting/spinService.test.ts`:
    ```ts
    test('does not credit the bet back when the engine succeeds', async () => {
      const wallet = new Wallet(100);
      const engine: GameEngine = {
        spin: async (): Promise<GameEngineResult> => ({ success: true, payout: 0, outcome: {} }),
      };
      const spinService = new SpinService(wallet, engine);

      await spinService.spin(10);

      assert.equal(wallet.balance, 90);
    });
    ```
    This fails if a naive implementation always credits back regardless of the result's
    `success` flag.

assumptions_or_open_questions:
  - "The repo has no existing wallet, bet-placement, or game-engine code to integrate with (confirmed by search: only design-system/ and README.md exist). This plan therefore builds the minimal SpinService/Wallet/GameEngine slice needed for this story's ACs from scratch, rather than modifying pre-existing bet-placement code."
  - "No project tooling (package.json, TypeScript, test runner) exists yet, so this plan also bootstraps a minimal TypeScript setup. The npm registry returned 403 Forbidden for every package tried (confirmed with an unrelated probe package, not just typescript/vitest), so no npm devDependencies could be installed; the test runner is Node's built-in `node:test` with `--experimental-strip-types` (Node >=22.6) instead of Vitest. If a different stack is intended for this codebase, or if registry access is restored, this bootstrap should be revised accordingly."
  - "Crediting winnings on a successful spin (applying `payout` to the wallet) is treated as out of scope for this story — AC3 only requires that the bet is NOT refunded on success, not that winnings are applied. That is presumably covered by a separate 'credit winnings' story under the same epic."
  - "Bet amounts/balances are plain JS `number`s for this minimal slice. Floating-point subtraction-then-addition of the same value is not always bit-exact in IEEE 754 for arbitrary decimals; if bets/balances need exact decimal accuracy in production, a follow-up story should switch to integer minor-units (cents) or a decimal library. Not addressed here since no AC requires non-integer bet precision."
  - "The GameEngine here is a typed interface only, mocked in tests — no real engine implementation exists in this repo, and building one is out of scope for this story."

package_dependencies: []
# No npm packages were installed. The npm registry was unreachable (403 Forbidden) from the
# implementation environment, so this plan uses Node's built-in `node:test` runner with
# `--experimental-strip-types` for TypeScript, requiring zero installed dependencies.

notes: |
  This is a greenfield story: the repo's only existing artifacts are `design-system/` (CSS
  tokens, style guide, contrast-check script) and a placeholder `README.md` — there is no prior
  wallet, betting, or engine code to reuse or conform to. Because the plan introduces three new
  modules plus new project tooling (5+ files) across two conceptual layers (state: `Wallet`;
  orchestration: `SpinService` + `GameEngine` contract), a diagram is included below to show the
  call direction the tests exercise. Every node is new for this story.

  ```mermaid
  flowchart TD
    classDef touched fill:#f96,color:#000

    Test["spinService.test.ts\n(AC1/AC2/AC3)"]:::touched
    Spin["SpinService.spin(bet)"]:::touched
    Wallet["Wallet\n.deduct / .credit / .balance"]:::touched
    Engine["GameEngine (mocked in tests)\n.spin(bet)"]:::touched

    Test -->|"drives"| Spin
    Spin -->|"deduct bet, then credit back only on error"| Wallet
    Spin -->|"await engine.spin(bet)"| Engine
  ```
