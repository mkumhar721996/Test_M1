summary: |
  This item implements the pure calculation/assembly layer of the slot engine's payout
  step: given a winning line's configured base payout and the active bet level, compute
  the credit award (AC1), and given a completed spin's seed, reel-stop indices, bet
  level, and the set of winning lines already identified by (out-of-scope) win-line
  evaluation, assemble the complete result payload the UI consumes (AC2-AC6), including
  empty-result and multi-line-sum-and-sort behavior. The repository currently has no
  application code or build tooling at all (only a design-system asset folder and the
  approved design prototype), so this plan also bootstraps the minimal TypeScript
  scaffolding needed to write and run the failing tests first.

  DEVIATION (implementation pass): the plan originally specified Vitest as the test
  runner. The sandbox's npm registry access is blocked (`npm install` returns HTTP 403
  Forbidden from the outbound proxy for every package, verified on two separate
  passes), so no npm dependency — including `typescript` and `vitest` — can be
  installed. The implementation instead uses Node.js's built-in test runner
  (`node --experimental-strip-types --test`), which ships with Node itself and
  requires zero installed dependencies, while still writing real TypeScript source
  and running a real project test framework. `package_dependencies` below is retained
  for traceability of original intent but was not actually installable; see the
  updated dependency entries and `package.json`'s `engines` field for the resulting
  constraint.

scope:
  - description: |
      Bootstrap a minimal TypeScript project skeleton so the engine module can be
      written and tested. Add `package.json` (name, `"type": "module"`, `test` script
      running `node --experimental-strip-types --test src/**/*.test.ts`, and an
      `engines.node` constraint documenting the `--experimental-strip-types`
      requirement) and a `tsconfig.json` (strict mode, ES2022 target/module). No
      production code goes here — this is purely enabling infrastructure. (Originally
      planned as Vitest; changed per the DEVIATION note above because the sandbox
      cannot reach the npm registry.)
    files:
      - package.json
      - tsconfig.json
    rationale: |
      `Glob`/`Grep` over the whole worktree found zero source files, manifests, or test
      config anywhere in the repo (only `design-system/*`, `.arc/*`, `README.md`). There
      is no existing stack to follow, so a minimal one must be introduced before any
      test-first work can run. See `assumptions_or_open_questions` — this choice is
      flagged for reviewer confirmation since nothing in the repo dictates it.

  - description: |
      Implement `calculatePayout` — the credit-award formula for AC1 — as a small pure
      function.

      ```ts
      export function calculatePayout(basePayout: number, betLevel: number): number {
        return basePayout * betLevel;
      }
      ```
    files:
      - src/engine/payout.ts
      - src/engine/payout.test.ts
    rationale: |
      AC1 is a single deterministic formula (base payout × bet level) with no
      dependency on spin state, so it is isolated as its own unit for direct testing
      and reuse by the payload assembler in the next scope item.

  - description: |
      Implement `assembleSpinResult`, which takes the already-evaluated winning lines
      for a completed spin (lineIndex + basePayout — win-line detection itself is a
      separate, already-existing-per-the-epic concern and out of scope here) plus the
      spin's seed, reel-stop indices, and bet level, and produces the full result
      payload: bet-scaled credit award per line, ascending sort by pay-line index, and
      the summed total.

      ```ts
      export interface WinningLineInput {
        lineIndex: number;
        basePayout: number;
      }

      export interface WinningLineResult {
        lineIndex: number;
        basePayout: number;
        creditAward: number;
      }

      export interface SpinResultInput {
        seed: string;
        reelStops: number[];
        betLevel: number;
        winningLines: WinningLineInput[];
      }

      export interface SpinResultPayload {
        seed: string;
        reelStops: number[];
        winningLines: WinningLineResult[];
        totalCreditsWon: number;
      }

      export function assembleSpinResult(input: SpinResultInput): SpinResultPayload {
        const winningLines = [...input.winningLines]
          .sort((a, b) => a.lineIndex - b.lineIndex)
          .map((line) => ({
            lineIndex: line.lineIndex,
            basePayout: line.basePayout,
            creditAward: calculatePayout(line.basePayout, input.betLevel),
          }));

        const totalCreditsWon = winningLines.reduce((sum, line) => sum + line.creditAward, 0);

        return {
          seed: input.seed,
          reelStops: input.reelStops,
          winningLines,
          totalCreditsWon,
        };
      }
      ```
    files:
      - src/engine/spinResult.ts
      - src/engine/spinResult.test.ts
    rationale: |
      Covers AC2-AC6 in one cohesive unit: the payload shape (AC2), empty-winning-lines
      behavior (AC3/AC4), multi-line summation (AC5), and ascending sort-by-index (AC6)
      are all facets of the same assembly step and share the same test fixture data, so
      splitting them into separate modules would fragment a single responsibility.

tests:
  - |
    AC1 — `src/engine/payout.test.ts`:
    ```ts
    import { calculatePayout } from './payout';

    it('multiplies base payout by bet level', () => {
      expect(calculatePayout(25, 3)).toBe(75);
    });
    ```
    Written first against a not-yet-existing `./payout` module so it fails on import,
    then `calculatePayout` is added to make it pass.
  - |
    AC2 — `src/engine/spinResult.test.ts`:
    ```ts
    it('assembles the full result payload for a single winning line', () => {
      const result = assembleSpinResult({
        seed: '7f3a9c21-4b6e-4d10-9e2a-51c8d6f0a933',
        reelStops: [12, 45, 3, 27, 8],
        betLevel: 3,
        winningLines: [{ lineIndex: 7, basePayout: 40 }],
      });

      expect(result).toEqual({
        seed: '7f3a9c21-4b6e-4d10-9e2a-51c8d6f0a933',
        reelStops: [12, 45, 3, 27, 8],
        winningLines: [{ lineIndex: 7, basePayout: 40, creditAward: 120 }],
        totalCreditsWon: 120,
      });
    });
    ```
  - |
    AC3 — `src/engine/spinResult.test.ts`:
    ```ts
    it('returns an empty winning-lines list when there are no wins', () => {
      const result = assembleSpinResult({
        seed: 'd4a1c7e2-9f5b-4e8a-b3d6-2f7a8c1e4b90',
        reelStops: [17, 33, 5, 41, 22],
        betLevel: 5,
        winningLines: [],
      });

      expect(result.winningLines).toEqual([]);
    });
    ```
  - |
    AC4 — `src/engine/spinResult.test.ts`:
    ```ts
    it('totals zero credits when there are no wins', () => {
      const result = assembleSpinResult({
        seed: 'd4a1c7e2-9f5b-4e8a-b3d6-2f7a8c1e4b90',
        reelStops: [17, 33, 5, 41, 22],
        betLevel: 5,
        winningLines: [],
      });

      expect(result.totalCreditsWon).toBe(0);
    });
    ```
  - |
    AC5 — `src/engine/spinResult.test.ts`, using the design prototype's
    "Multiple winning lines" fixture (seed `7f3a9c21-...`, reel stops
    `[12, 45, 3, 27, 8]`, bet level 3, lines at index 7/base 40, index 2/base 25,
    index 9/base 100):
    ```ts
    it('sums bet-scaled credit amounts across all winning lines', () => {
      const result = assembleSpinResult({
        seed: '7f3a9c21-4b6e-4d10-9e2a-51c8d6f0a933',
        reelStops: [12, 45, 3, 27, 8],
        betLevel: 3,
        winningLines: [
          { lineIndex: 7, basePayout: 40 },
          { lineIndex: 2, basePayout: 25 },
          { lineIndex: 9, basePayout: 100 },
        ],
      });

      expect(result.totalCreditsWon).toBe(40 * 3 + 25 * 3 + 100 * 3);
    });
    ```
  - |
    AC6 — `src/engine/spinResult.test.ts`, same fixture, asserting ascending order
    even though the input (mirroring the design's documented raw evaluation order
    `[7, 2, 9]`) is not sorted:
    ```ts
    it('orders winning lines ascending by pay-line index regardless of input order', () => {
      const result = assembleSpinResult({
        seed: '7f3a9c21-4b6e-4d10-9e2a-51c8d6f0a933',
        reelStops: [12, 45, 3, 27, 8],
        betLevel: 3,
        winningLines: [
          { lineIndex: 7, basePayout: 40 },
          { lineIndex: 2, basePayout: 25 },
          { lineIndex: 9, basePayout: 100 },
        ],
      });

      expect(result.winningLines.map((l) => l.lineIndex)).toEqual([2, 7, 9]);
    });
    ```

assumptions_or_open_questions:
  - |
    The repo has zero existing application code, manifest, or test tooling (verified via
    a full-repo glob and grep — only `design-system/*`, `.arc/*`, and `README.md`
    exist). This plan assumes TypeScript + Vitest as the implementation/test stack
    since nothing in the repo dictates a stack and the epic implies a compiled/typed
    engine. If a different language/stack is intended, this plan's scaffolding step
    needs to change accordingly — please confirm or redirect.
  - |
    The approved design (`.arc/designs/TEST-M1-STORY-006-design.html`) is a
    self-contained "Spin Result Inspector" prototype driven entirely by inline fixture
    data, and its own embedded comments state it explicitly: "no live spin engine
    behind this prototype" and "this story has no end-user-facing screen of its own —
    the payout engine output is consumed by the spin UI elsewhere in the product." None
    of the six acceptance criteria require any rendering/UI behavior — they are all
    about calculation and payload shape. I am therefore treating the HTML file as a
    reviewer-facing visualization of the expected payload/table shape (which the tests
    above mirror using its exact fixture values), not as a UI component to build for
    this story. If a shippable inspector tool was actually intended as part of this
    story's scope, please say so explicitly and I will add that as a task.
  - |
    `WinningLineInput` is assumed to carry only `{ lineIndex, basePayout }` — the
    minimum AC2 requires. The design's table also shows `symbol`, `count`, and `cells`
    per winning line, but those are fixture/display fields for the reviewer tool and
    are produced by win-line evaluation (a different concern per the epic), not
    required by any AC on this story's payload. If the real payload contract needs to
    pass those fields through, that should be added as an explicit AC.
  - |
    Bet level and reel-stop indices are assumed to already be validated upstream
    (bet-level selection and reel-spin logic are separate epic concerns); this story's
    functions do not perform range/bounds validation on them.

package_dependencies:
  - name: (none — see DEVIATION note)
    version: n/a
    ecosystem: npm
    rationale: |
      Originally planned: `typescript@^5.5.0` and `vitest@^2.0.0`, for type tooling and
      the failing-test-first suite for `payout.ts` and `spinResult.ts`. Neither was
      installable: the sandbox's npm registry access returns HTTP 403 Forbidden for
      every package. The implementation instead relies solely on Node.js's built-in
      `--experimental-strip-types` and `--test` capabilities (Node >=22.6.0, declared
      via `engines` in `package.json`), adding zero npm dependencies.

notes: |
  Implementation order (strict TDD): scaffold tooling first (nothing to test without
  it) → `payout.test.ts` fails on missing module → implement `calculatePayout` →
  `spinResult.test.ts` (AC2-AC6, written together since they share fixtures) fails on
  missing module/behavior → implement `assembleSpinResult` on top of `calculatePayout`.

  All fixture values used in the tests above (seed, reel stops, line indices, base
  payouts) are taken directly from the approved design's `scenarios` array in
  `.arc/designs/TEST-M1-STORY-006-design.html` (the "Multiple winning lines" and "No
  winning lines" scenarios) so the test suite's expected numbers are traceable to the
  reviewed prototype rather than invented.

  No mermaid diagram is included: this is a purely additive, greenfield change (two new
  modules plus scaffolding, no existing callers or cross-layer integration to depict).
