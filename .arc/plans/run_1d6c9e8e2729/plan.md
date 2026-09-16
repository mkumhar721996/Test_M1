summary: |
  This is the first code-bearing story in the Game Engine domain — the repository currently has
  no application code, no package manifest, and no test runner (only the design-system CSS/token
  assets and a chore commit). This plan bootstraps a minimal TypeScript + Vitest setup and
  implements win-line evaluation: given a derived 5-reel x 3-row symbol grid (the result of
  resolving RNG reel stops into visible symbol positions, which is out of scope for this story),
  check all 9 configured pay-lines for a run of 3+ identical symbols starting at the leftmost
  reel, and return a payout-ready list of winning lines (line index, winning symbol, match
  length). No wild/scatter substitution logic is written, since the story explicitly scopes to
  standard symbols only.

scope:
  - description: |
      Bootstrap a minimal TypeScript + Vitest project so failing tests can be written and run.
      Add `package.json` (name, `"type": "module"`, `test` script running `vitest run`),
      `tsconfig.json` (strict mode, ES2022 target), and `vitest.config.ts` (default node
      environment, no special config needed).
    files:
      - package.json
      - tsconfig.json
      - vitest.config.ts
    rationale: |
      No build/test tooling exists anywhere in the repo yet (confirmed: no package.json, no
      tsconfig, no *.ts/*.js source files). TDD for this story is impossible without a runnable
      test command.
  - description: |
      Define the shared domain types for the evaluator: the symbol grid shape, a pay-line
      definition, and the winning-line output shape.
      ```ts
      export type SymbolId = string;
      // symbolGrid[reelIndex][rowIndex] — the symbol already placed at that position,
      // derived from reel stops by the (separate) symbol-placement logic.
      export type SymbolGrid = readonly SymbolId[][];
      // one row index per reel, e.g. [1,1,1,1,1] is the straight middle-row line
      export type PayLine = readonly number[];
      export interface WinningLine {
        lineIndex: number;
        symbol: SymbolId;
        matchLength: number;
      }
      ```
    files:
      - src/engine/paylines/types.ts
    rationale: |
      AC2/AC6 require the winner record to carry "symbol identifier and match length" / "the
      index of each winning pay-line and the symbol combination" — for a run of identical
      symbols the combination is fully described by `symbol` + `matchLength`, so no larger
      structure (e.g. per-cell positions) is needed for payout calculation.
  - description: |
      Define the 9 configured pay-lines as a compile-time constant (5 reels x 3 rows, the
      standard classic-slot layout: 3 straight lines, 2 full V/inverted-V lines, and 4
      zig-zag lines).
      ```ts
      import type { PayLine } from './types';

      export const PAY_LINES: readonly PayLine[] = [
        [1, 1, 1, 1, 1],
        [0, 0, 0, 0, 0],
        [2, 2, 2, 2, 2],
        [0, 1, 2, 1, 0],
        [2, 1, 0, 1, 2],
        [0, 0, 1, 2, 2],
        [2, 2, 1, 0, 0],
        [1, 0, 0, 0, 1],
        [1, 2, 2, 2, 1],
      ];
      ```
    files:
      - src/engine/paylines/paylines.config.ts
    rationale: |
      AC1 requires "every one of the 9 configured pay-lines" to exist and be checked, so a
      concrete 9-line config must live in the codebase for the evaluator to consume and for
      tests to assert against. This is a placeholder default (5x3 grid, classic-slot shapes);
      see assumptions — it should be reconciled with the authoritative game-config source once
      that config-baking work item exists.
  - description: |
      Implement `evaluateWinLines`, which checks every pay-line for a run of 3+ identical
      symbols starting at reel 0 and returns the winners in line-index order.
      ```ts
      import { PAY_LINES } from './paylines.config';
      import type { PayLine, SymbolGrid, WinningLine } from './types';

      export function evaluateWinLines(
        symbolGrid: SymbolGrid,
        payLines: readonly PayLine[] = PAY_LINES,
      ): WinningLine[] {
        const winners: WinningLine[] = [];
        payLines.forEach((rowsPerReel, lineIndex) => {
          const sequence = rowsPerReel.map((row, reel) => symbolGrid[reel][row]);
          const firstSymbol = sequence[0];
          let matchLength = 1;
          while (matchLength < sequence.length && sequence[matchLength] === firstSymbol) {
            matchLength += 1;
          }
          if (matchLength >= 3) {
            winners.push({ lineIndex, symbol: firstSymbol, matchLength });
          }
        });
        return winners;
      }
      ```
    files:
      - src/engine/paylines/winLineEvaluator.ts
    rationale: |
      Plain equality comparison against `firstSymbol` is the entire matching rule — there is no
      wild/scatter branch, satisfying AC5 by simply not writing that code path. Iterating
      `payLines` (default `PAY_LINES`, length 9) with `forEach` and no early exit/short-circuit
      on the line list itself satisfies AC1 (every line is checked) and AC4 (independent winners
      for each line are all collected).
  - description: |
      Write the test suite covering all 6 acceptance criteria against a hand-built symbol grid
      where every unoverridden cell is a globally-unique filler symbol, so only the cells a test
      explicitly sets can produce a match.
    files:
      - src/engine/paylines/winLineEvaluator.test.ts
    rationale: |
      A shared `makeGrid` helper with globally-unique defaults (`U<reel><row>`) lets each test
      isolate exactly one pay-line's winning run without accidental cross-line matches from the
      zig-zag lines sharing rows.

tests:
  - |
    AC1 — "every one of the 9 configured pay-lines is checked". In
    `src/engine/paylines/winLineEvaluator.test.ts`:
    ```ts
    it('checks all 9 configured pay-lines, including the last one', () => {
      expect(PAY_LINES).toHaveLength(9);
      // only line 8 ([1,2,2,2,1]) is set up to win, proving the last line is evaluated
      const grid = makeGrid({ '0,1': 'BAR', '1,2': 'BAR', '2,2': 'BAR' });
      expect(evaluateWinLines(grid)).toEqual([
        { lineIndex: 8, symbol: 'BAR', matchLength: 3 },
      ]);
    });
    ```
    This fails against an evaluator that only loops `i < 8` or otherwise skips the boundary line.
  - |
    AC2 — "3+ consecutive matching symbols from the leftmost reel is recorded as a winner with
    symbol identifier and match length":
    ```ts
    it('records a winner with symbol id and match length for a 3-run from reel 0', () => {
      const grid = makeGrid({ '0,0': 'BAR', '1,0': 'BAR', '2,0': 'BAR' });
      expect(evaluateWinLines(grid)).toEqual([
        { lineIndex: 1, symbol: 'BAR', matchLength: 3 },
      ]);
    });
    ```
  - |
    AC3 — "no run of 3+ matching consecutive symbols starting from the leftmost reel means the
    line is not included":
    ```ts
    it('excludes a line with only a 2-symbol run from reel 0', () => {
      const grid = makeGrid({ '0,0': 'BAR', '1,0': 'BAR' });
      expect(evaluateWinLines(grid)).toEqual([]);
    });
    ```
  - |
    AC4 — "multiple pay-lines winning simultaneously are all independently identified":
    ```ts
    it('identifies multiple simultaneous winning lines independently', () => {
      const grid = makeGrid({
        '0,0': 'LEMON', '1,0': 'LEMON', '2,0': 'LEMON',
        '0,2': 'PLUM', '1,2': 'PLUM', '2,2': 'PLUM',
      });
      expect(evaluateWinLines(grid)).toEqual([
        { lineIndex: 1, symbol: 'LEMON', matchLength: 3 },
        { lineIndex: 2, symbol: 'PLUM', matchLength: 3 },
      ]);
    });
    ```
  - |
    AC5 — "no substitution or special-trigger logic is applied" (proven by a would-be-wild
    symbol breaking, not extending, the run):
    ```ts
    it('does not substitute a differing symbol into an otherwise-matching run', () => {
      const grid = makeGrid({ '0,1': 'BAR', '1,1': 'BAR', '2,1': 'WILD' });
      expect(evaluateWinLines(grid)).toEqual([]);
    });
    ```
  - |
    AC6 — "output includes the index of each winning pay-line and the symbol combination that
    triggered the win, ready for payout calculation":
    ```ts
    it('includes line index and the winning symbol combination for a 4-run', () => {
      const grid = makeGrid({ '0,1': 'SEVEN', '1,1': 'SEVEN', '2,1': 'SEVEN', '3,1': 'SEVEN' });
      const winners = evaluateWinLines(grid);
      expect(winners).toEqual([{ lineIndex: 0, symbol: 'SEVEN', matchLength: 4 }]);
      expect(winners[0]).toHaveProperty('lineIndex');
      expect(winners[0]).toHaveProperty('symbol');
      expect(winners[0]).toHaveProperty('matchLength');
    });
    ```

assumptions_or_open_questions:
  - |
    No reel/row count, pay-line layout, or symbol-set source of truth exists in the repo. This
    plan assumes the standard 5-reel x 3-visible-row grid and defines a placeholder classic-slot
    9-line layout in `paylines.config.ts`. If an authoritative game-config document or a sibling
    "game configuration" work item defines different values, `PAY_LINES` (and the grid
    dimensions assumed by the tests) will need to be reconciled with it.
  - |
    This story consumes an already-derived `SymbolGrid` (symbol positions resolved from reel
    stops) rather than raw reel stops + reel strips. Deriving the grid from reel stops is
    treated as the responsibility of the symbol-placement logic called out separately in the
    parent epic, and is out of scope here. AC1's "symbol positions derived from those stops" is
    satisfied by consuming that already-derived grid as input.
  - |
    No project-wide language/framework convention exists yet (no package.json, no source files
    at all besides the CSS design-system). TypeScript + Vitest was chosen as a conventional,
    lightweight default for engine/game logic; this is a project-setup decision, not something
    stated in the story, and may need to align with a broader stack decision if one gets made
    elsewhere.
  - |
    The winning-line output intentionally omits per-cell reel/row positions and carries only
    `lineIndex`, `symbol`, and `matchLength` — sufficient to key a payout table by
    symbol + match length, per AC6's "ready for payout calculation."

package_dependencies:
  - name: typescript
    version: ^5.6.3
    ecosystem: npm
    rationale: |
      No language tooling exists in the repo yet; the evaluator and its tests are written in
      TypeScript for type-checked domain types (SymbolId, PayLine, WinningLine).
  - name: vitest
    version: ^2.1.4
    ecosystem: npm
    rationale: |
      No test runner exists in the repo yet; Vitest is the test-first harness this plan's
      `tests` section is written against (`it(...)`, `expect(...).toEqual(...)`).

notes: |
  Repo state confirmed before drafting: no `package.json`, no `tsconfig.json`, no source files
  outside `design-system/` (CSS/HTML/JSON tokens) and a Python contrast-check script for that
  design system — none of it relevant to game-engine logic. This is a greenfield module, so the
  scope list starts with minimal tooling bootstrap rather than assuming an existing test command.

  Test isolation relies on `makeGrid`'s defaults being globally unique per cell
  (`U<reel><row>`), so every test above was hand-verified to not accidentally trigger any of the
  other 8 pay-lines besides the one(s) under test — the zig-zag lines (indices 3-8) share rows
  with the straight lines, so overlap is the main risk when hand-crafting fixtures.

  No diagram included: this is a single new, self-contained module (`src/engine/paylines/`)
  with no existing callers yet (payout calculation, which will consume `evaluateWinLines`, is a
  separate future work item) and no cross-layer calls to show.
