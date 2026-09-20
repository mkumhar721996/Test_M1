summary: |
  This is the first code work item in an otherwise empty repository (only a CSS design system
  exists today; there is no package.json, tsconfig, src/, or test runner). The plan bootstraps a
  minimal TypeScript/Node toolchain and implements compile-time game configuration for a 5x3-reel
  slot engine: symbol definitions, reel strips, grid dimensions, 9 fixed pay-lines, and the
  {1,2,5,10} bet-level set, all expressed as hard-coded TypeScript literals (no file/env/network
  I/O) so they are embedded directly in the build output. A `validateConfig` function enforces
  every structural invariant (grid dimensions, payline bounds, symbol payout sign, duplicate
  symbol ids, reel-strip completeness, bet-level positivity) and is invoked synchronously inside
  the `GameEngine` constructor, so any invalid configuration throws before an engine instance ever
  exists — making `spin()` structurally unreachable on invalid config without needing spin logic
  itself to exist yet (RNG/reel-spin mechanics are a separate backlog item per the parent epic).
  Every acceptance criterion is covered by a failing-test-first unit test using Vitest.

scope:
  - description: |
      Bootstrap a minimal TypeScript + Vitest toolchain since no `package.json`/`tsconfig.json`
      exists in the repo yet. Add `package.json` with `build` (`tsc -p tsconfig.json`) and `test`
      (`vitest run`) scripts, `tsconfig.json` (strict mode, `target: ES2022`, `module: ES2022`,
      `moduleResolution: bundler`), and `vitest.config.ts` pointing at `tests/**/*.test.ts`.
    files:
      - package.json
      - tsconfig.json
      - vitest.config.ts
    rationale: |
      Every subsequent test/code step needs a compiler and test runner; there is currently no
      language toolchain committed to the repo (confirmed via glob: no `*.ts`/`*.js`/`package.json`
      anywhere except `design-system/.check_contrast.py`).

  - description: |
      Define shared config types.

      ```ts
      export interface SymbolDef {
        readonly id: string;
        readonly basePayout: number;
      }

      export interface GridDimensions {
        readonly reels: number;
        readonly rows: number;
      }

      export interface PayLine {
        readonly id: string;
        // one row index per reel; length must equal grid.reels
        readonly positions: readonly number[];
      }

      export interface GameConfig {
        readonly grid: GridDimensions;
        readonly symbols: readonly SymbolDef[];
        // length must equal grid.reels; each entry is one reel's strip of symbol ids
        readonly reelStrips: readonly (readonly string[])[];
        readonly paylines: readonly PayLine[];
        readonly betLevels: readonly number[];
      }
      ```
    files:
      - src/config/types.ts
    rationale: |
      Shared shape used by every config module, `validateConfig`, and `GameEngine`; defining it
      once keeps the plan's later code snippets and tests type-checkable against a single source
      of truth.

  - description: |
      Author the compile-time config data as plain exported `const` literals (no I/O, no env
      reads): `src/config/symbols.ts` (SYMBOLS: SymbolDef[]), `src/config/grid.ts`
      (GRID: GridDimensions = { reels: 5, rows: 3 }), `src/config/reelStrips.ts`
      (REEL_STRIPS: readonly string[][], 5 strips each referencing only ids from SYMBOLS),
      `src/config/paylines.ts` (PAYLINES: PayLine[], exactly 9 entries, standard 5x3 nine-line
      set: 3 horizontal rows, 2 V/inverted-V diagonals, and 4 zig-zag lines, each `positions`
      array of length 5 with values in `[0,3)`), `src/config/betLevels.ts`
      (BET_LEVELS: number[] = [1, 2, 5, 10]), and `src/config/index.ts` which assembles and
      exports `GAME_CONFIG: GameConfig` from the above.
    files:
      - src/config/symbols.ts
      - src/config/grid.ts
      - src/config/reelStrips.ts
      - src/config/paylines.ts
      - src/config/betLevels.ts
      - src/config/index.ts
    rationale: |
      AC1 requires symbols, reel strips, grid dimensions, paylines, and bet levels to be "fully
      embedded in the binary with no external configuration source" — plain TS module-level
      literals satisfy this directly (they compile into the build output; nothing is read from
      disk/env/network at startup). AC7/AC8 pin the paylines to exactly 9 and bet levels to
      exactly `[1,2,5,10]`, which this concrete data must satisfy and which is asserted directly
      against these exports (not just against the generic validator, since a generic validator
      cannot know "must be 9" is the intended business rule rather than an incidental count).

  - description: |
      Add `ConfigValidationError` used by `validateConfig` to signal any of the AC4/5/6/9/11/12/
      13/14 defects with a message identifying the offending element.

      ```ts
      export class ConfigValidationError extends Error {
        constructor(message: string) {
          super(message);
          this.name = 'ConfigValidationError';
        }
      }
      ```
    files:
      - src/engine/errors.ts
    rationale: |
      A dedicated error type lets tests assert `toThrow(ConfigValidationError)` rather than
      matching on generic `Error`, and lets callers distinguish "config is invalid" from other
      failure modes.

  - description: |
      Implement `validateConfig(config: GameConfig): void` — throws `ConfigValidationError` with
      a message identifying the offending element for: zero/negative `grid.reels` or `grid.rows`
      (AC9); any symbol with `basePayout < 0` (AC5); duplicate symbol ids (AC14); any reel strip
      that is empty (AC12); any reel strip shorter than `grid.rows` (AC13); any reel strip entry
      referencing a symbol id absent from `symbols` (AC11); any payline whose `positions` length
      does not equal `grid.reels` or whose row values fall outside `[0, grid.rows)` (AC4); any
      bet level `<= 0` (AC6). Returns normally (no throw) for a fully valid config (AC2 precondition).
    files:
      - src/engine/validateConfig.ts
    rationale: |
      Centralizing all structural checks in one pure function keeps `GameEngine` a thin
      orchestrator and makes each defect independently testable without constructing a full
      engine for every case.

  - description: |
      Implement `GameEngine`, whose constructor calls `validateConfig` synchronously before
      assigning `this.config`, so a throwing validation prevents the instance (and therefore any
      method on it, including a future `spin()`) from ever coming into existence.

      ```ts
      export class GameEngine {
        private readonly config: GameConfig;

        constructor(config: GameConfig = GAME_CONFIG) {
          validateConfig(config); // throws ConfigValidationError -> constructor never returns
          this.config = config;
        }

        getConfig(): Readonly<GameConfig> {
          return this.config;
        }
      }
      ```
    files:
      - src/engine/GameEngine.ts
    rationale: |
      Defaulting the constructor parameter to `GAME_CONFIG` means `new GameEngine()` requires no
      operator input at all (AC1/AC2), while still allowing tests to inject deliberately-broken
      configs for the AC4-14/AC10 negative cases. Exposing `getConfig()` satisfies AC3 ("all
      configured values are accessible to the spin logic") without implementing spin mechanics
      themselves, which belong to a separate reel-spin-logic story per the parent epic (see
      assumptions).

  - description: |
      Tests asserting the concrete production `GAME_CONFIG` matches AC1/AC7/AC8 exactly, and that
      it contains no runtime I/O.
    files:
      - tests/config/gameConfig.test.ts
    rationale: |
      These are content assertions against the real embedded data (distinct from the generic
      structural rules in `validateConfig`), directly covering AC1, AC7, and AC8.

  - description: |
      Tests for every `validateConfig` failure mode (AC4, AC5, AC6, AC9, AC11, AC12, AC13, AC14)
      plus the pass-through case for a valid config.
    files:
      - tests/engine/validateConfig.test.ts
    rationale: |
      Isolates each defect as an independent unit test against a minimally-broken clone of a
      valid fixture config, so failures point at exactly one violated rule.

  - description: |
      Tests for `GameEngine` initialisation success/config-accessibility (AC2, AC3) and for the
      "invalid config leaves no reachable instance" guarantee (AC10).
    files:
      - tests/engine/GameEngine.test.ts
    rationale: |
      Confirms the constructor-throws-before-assignment design actually satisfies AC2/AC3/AC10
      end-to-end, not just at the `validateConfig` unit level.

tests:
  - |
    AC1 (symbols/reels/grid/paylines/bet-levels embedded, no external source at runtime) —
    `tests/config/gameConfig.test.ts`:
    ```ts
    import { readFileSync } from 'node:fs';
    import { GAME_CONFIG } from '../../src/config';

    const CONFIG_FILES = [
      'src/config/symbols.ts', 'src/config/reelStrips.ts', 'src/config/grid.ts',
      'src/config/paylines.ts', 'src/config/betLevels.ts', 'src/config/index.ts',
    ];

    it('has no runtime I/O in config sources', () => {
      for (const file of CONFIG_FILES) {
        const src = readFileSync(file, 'utf8');
        expect(src).not.toMatch(/readFile|process\.env|fetch\(|require\(|import\(/);
      }
    });

    it('exposes a fully-populated GameConfig with no constructor arguments needed', () => {
      expect(GAME_CONFIG.grid).toEqual({ reels: 5, rows: 3 });
    });
    ```
    Minimal code to pass: `src/config/*.ts` literals as described in scope (no fs/env/fetch
    tokens anywhere in those files).
  - |
    AC2 (valid config initialises without error) — `tests/engine/GameEngine.test.ts`:
    ```ts
    it('initialises without error given the embedded valid config', () => {
      expect(() => new GameEngine()).not.toThrow();
    });
    ```
    Minimal code: `GameEngine` constructor + `validateConfig` passing on `GAME_CONFIG`.
  - |
    AC3 (configured values accessible to spin logic) — `tests/engine/GameEngine.test.ts`:
    ```ts
    it('exposes the full configuration for spin logic to consume', () => {
      const engine = new GameEngine();
      expect(engine.getConfig()).toEqual(GAME_CONFIG);
    });
    ```
    Minimal code: `GameEngine.getConfig()` returning `this.config`.
  - |
    AC4 (out-of-range payline reel/row halts init, names the payline) —
    `tests/engine/validateConfig.test.ts`:
    ```ts
    it('rejects a payline referencing a row outside the grid', () => {
      const bad = { ...validFixture, paylines: [{ id: 'line-1', positions: [0, 0, 3, 0, 0] }] };
      expect(() => validateConfig(bad)).toThrowError(/line-1/);
    });
    ```
    Minimal code: bounds-check each `payline.positions[i] < grid.rows` (and `positions.length ===
    grid.reels`) in `validateConfig`, including `payline.id` in the thrown message.
  - |
    AC5 (negative symbol payout halts init, names the symbol) —
    `tests/engine/validateConfig.test.ts`:
    ```ts
    it('rejects a symbol with a negative base payout', () => {
      const bad = { ...validFixture, symbols: [{ id: 'CHERRY', basePayout: -5 }] };
      expect(() => validateConfig(bad)).toThrowError(/CHERRY/);
    });
    ```
    Minimal code: `symbols.forEach(s => { if (s.basePayout < 0) throw new
    ConfigValidationError(...s.id...) })`.
  - |
    AC6 (bet level of zero halts init, names the invalid level) —
    `tests/engine/validateConfig.test.ts`:
    ```ts
    it('rejects a bet level of zero', () => {
      const bad = { ...validFixture, betLevels: [1, 0, 5] };
      expect(() => validateConfig(bad)).toThrowError(/bet level.*0/i);
    });
    ```
    Minimal code: `betLevels.forEach(b => { if (b <= 0) throw new ConfigValidationError(...) })`.
  - |
    AC7 (exactly 9 valid paylines in the real config) — `tests/config/gameConfig.test.ts`:
    ```ts
    it('defines exactly 9 paylines, all within grid bounds', () => {
      expect(GAME_CONFIG.paylines).toHaveLength(9);
      expect(() => validateConfig(GAME_CONFIG)).not.toThrow();
    });
    ```
    Minimal code: `PAYLINES` array in `src/config/paylines.ts` with exactly 9 entries, each
    `positions.length === 5` and values in `[0,3)`.
  - |
    AC8 (bet-level set is exactly {1,2,5,10}) — `tests/config/gameConfig.test.ts`:
    ```ts
    it('defines exactly the bet levels 1, 2, 5, and 10', () => {
      expect(GAME_CONFIG.betLevels).toEqual([1, 2, 5, 10]);
    });
    ```
    Minimal code: `export const BET_LEVELS = [1, 2, 5, 10];` in `src/config/betLevels.ts`.
  - |
    AC9 (zero/negative grid dimension halts init, names the invalid dimension) —
    `tests/engine/validateConfig.test.ts`:
    ```ts
    it('rejects a grid with zero reels', () => {
      const bad = { ...validFixture, grid: { reels: 0, rows: 3 } };
      expect(() => validateConfig(bad)).toThrowError(/reels/i);
    });
    it('rejects a grid with a negative row count', () => {
      const bad = { ...validFixture, grid: { reels: 5, rows: -1 } };
      expect(() => validateConfig(bad)).toThrowError(/rows/i);
    });
    ```
    Minimal code: `if (grid.reels <= 0) throw ...; if (grid.rows <= 0) throw ...;` at the top of
    `validateConfig`, before any per-reel/payline checks that assume positive dimensions.
  - |
    AC10 (invalid config leaves no reachable spin operation) — `tests/engine/GameEngine.test.ts`:
    ```ts
    it('never produces a usable engine instance from an invalid config', () => {
      let engine: GameEngine | undefined;
      expect(() => { engine = new GameEngine(invalidFixture); }).toThrow(ConfigValidationError);
      expect(engine).toBeUndefined();
    });
    ```
    Minimal code: none beyond the constructor-throws-before-assignment shape already in
    `GameEngine` — the test asserts the *structural* guarantee (no instance reference exists to
    call any method, spin included, on) rather than a `spin()` method's own behaviour, since
    spin logic is out of this story's scope (see assumptions).
  - |
    AC11 (reel strip references an undefined symbol, names reel and symbol) —
    `tests/engine/validateConfig.test.ts`:
    ```ts
    it('rejects a reel strip referencing an undefined symbol id', () => {
      const bad = { ...validFixture, reelStrips: [['CHERRY', 'GHOST', 'BAR'], ...rest] };
      expect(() => validateConfig(bad)).toThrowError(/reel 0.*GHOST/i);
    });
    ```
    Minimal code: for each reel index `i`, for each id in `reelStrips[i]`, if not present in the
    `symbols` id set, throw including both `i` and the undefined id.
  - |
    AC12 (empty reel strip, names reel and defect) — `tests/engine/validateConfig.test.ts`:
    ```ts
    it('rejects an empty reel strip', () => {
      const bad = { ...validFixture, reelStrips: [[], ...rest] };
      expect(() => validateConfig(bad)).toThrowError(/reel 0.*empty/i);
    });
    ```
    Minimal code: `if (strip.length === 0) throw new ConfigValidationError('reel ' + i + ' strip
    is empty')`.
  - |
    AC13 (reel strip shorter than grid.rows, names reel and defect) —
    `tests/engine/validateConfig.test.ts`:
    ```ts
    it('rejects a reel strip shorter than the configured row count', () => {
      const bad = { ...validFixture, reelStrips: [['CHERRY', 'BAR'], ...rest] }; // grid.rows = 3
      expect(() => validateConfig(bad)).toThrowError(/reel 0.*fewer|insufficient/i);
    });
    ```
    Minimal code: `if (strip.length < grid.rows) throw new ConfigValidationError('reel ' + i +
    ' has ' + strip.length + ' positions, fewer than the required ' + grid.rows)`.
  - |
    AC14 (duplicate symbol identifiers, names the duplicate) —
    `tests/engine/validateConfig.test.ts`:
    ```ts
    it('rejects duplicate symbol identifiers', () => {
      const bad = {
        ...validFixture,
        symbols: [{ id: 'CHERRY', basePayout: 1 }, { id: 'CHERRY', basePayout: 2 }],
      };
      expect(() => validateConfig(bad)).toThrowError(/CHERRY/);
    });
    ```
    Minimal code: track seen ids in a `Set`; on a repeat, throw including the duplicated id.

assumptions_or_open_questions:
  - |
    The story text does not specify concrete symbol identifiers, per-symbol payout values, or
    exact reel-strip contents. This plan treats those as placeholder game-design data (e.g.
    `CHERRY`, `BAR`, `BELL`, `SEVEN`, `WILD` with illustrative payouts) sufficient to prove the
    validation/embedding mechanics; final paytable numbers should be confirmed with
    product/design and are not a gate for this story's acceptance criteria, which are all about
    *validation behaviour*, not specific economy tuning.
  - |
    The 9 pay-line patterns are not specified beyond "9 fixed pay-line patterns" for a 5x3 grid.
    This plan uses the industry-standard 9-line set (3 horizontal, 2 diagonal V/inverted-V, 4
    zig-zag) as placeholder data; the exact shapes are a design decision that can be swapped
    later without touching `validateConfig` or `GameEngine`.
  - |
    "Compile-time configuration" is interpreted as: config values are hard-coded TS literals
    compiled into the build (no external file/env/network source), and are *validated* eagerly
    at `GameEngine` construction (process start), rather than as TypeScript type-level
    (`tsc`-time) validation of business invariants like "no duplicate ids" — the latter is not
    practical to express as a general type-level check against literal data of this shape.
    Flagging this reading explicitly since AC1 mentions "WHEN the build completes successfully"
    while AC4-14 all say "WHEN the engine initialises", which this plan reads as: build embeds
    the data, initialisation validates it.
  - |
    Actual spin mechanics (RNG, reel positioning, win evaluation, payout calculation) are
    explicitly called out as separate concerns in the parent epic and are NOT implemented here.
    `GameEngine` exposes `getConfig()` only, and AC10 ("no spin operation is reachable") is
    satisfied structurally (constructor throws before any instance exists) rather than by gating
    an actual `spin()` method, since no such method exists yet.
  - |
    No `package.json`/`tsconfig.json`/test runner exists anywhere in the repo yet, so this plan's
    first scope item bootstraps that toolchain (TypeScript + Vitest) as a prerequisite rather than
    assuming an existing convention to follow.

package_dependencies:
  - name: typescript
    version: ^5.6.0
    ecosystem: npm
    rationale: |
      No TS/JS toolchain exists in the repo yet; needed to compile the config/engine source and
      to type-check the `GameConfig`/`PayLine`/`SymbolDef` interfaces used throughout the plan.
  - name: vitest
    version: ^2.1.0
    ecosystem: npm
    rationale: |
      Chosen as the test runner for this plan's failing-test-first units (`*.test.ts`); no test
      framework currently exists in the repo. Vitest runs TS natively without a separate ts-node
      transpile step.
  - name: "@types/node"
    version: ^22.0.0
    ecosystem: npm
    rationale: |
      `tests/config/gameConfig.test.ts` uses `node:fs` (`readFileSync`) to assert the config
      modules contain no runtime I/O; Node type definitions are needed for this to type-check
      under `strict` mode.

notes: |
  Repo state at planning time: aside from `design-system/` (CSS tokens/style guide) and a
  `.check_contrast.py` script, there is no application code, so every file in this plan's scope
  is new. The diagram below shows the dependency shape once these files exist: config modules
  feed a single aggregated `GAME_CONFIG`, which both `GameEngine` (default parameter) and the
  config-content tests consume directly; `validateConfig` sits between `GameEngine` and the raw
  config, and is also exercised directly and in isolation by its own test file so each of the
  eight AC4/5/6/9/11/12/13/14 defects is independently attributable.

  ```mermaid
  flowchart TD
    symbols[src/config/symbols.ts]
    grid[src/config/grid.ts]
    reels[src/config/reelStrips.ts]
    paylines[src/config/paylines.ts]
    betLevels[src/config/betLevels.ts]
    configIndex[src/config/index.ts GAME_CONFIG]
    errors[src/engine/errors.ts ConfigValidationError]
    validate[src/engine/validateConfig.ts]
    engine[src/engine/GameEngine.ts]
    cfgTest[tests/config/gameConfig.test.ts]
    validateTest[tests/engine/validateConfig.test.ts]
    engineTest[tests/engine/GameEngine.test.ts]

    symbols --> configIndex
    grid --> configIndex
    reels --> configIndex
    paylines --> configIndex
    betLevels --> configIndex
    errors --> validate
    validate -- "throws before assignment" --> engine
    configIndex -- "default ctor param" --> engine
    configIndex -- "AC1/7/8 content assertions" --> cfgTest
    validate -- "AC4/5/6/9/11/12/13/14 per-defect" --> validateTest
    engine -- "AC2/3/10" --> engineTest

    classDef touched fill:#f96,color:#000
    class symbols,grid,reels,paylines,betLevels,configIndex,errors,validate,engine,cfgTest,validateTest,engineTest touched
  ```
