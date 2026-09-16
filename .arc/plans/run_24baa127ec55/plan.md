summary: |
  This repo currently contains no application code (only the `design-system/` CSS/tokens
  assets) — there is no language, package manifest, or test runner set up yet. This plan
  bootstraps a minimal TypeScript + Vitest project and implements a seeded, deterministic
  PRNG plus reel-stop selection logic for a 5-reel slot engine, satisfying
  TEST-M1-STORY-004. The engine exposes a single `spin()` function that: accepts an
  optional external seed (validated against a fixed numeric range) or auto-generates one
  when omitted, uses a deterministic PRNG seeded from that value to draw one stop index
  per reel uniformly from that reel's configured strip length, and returns a payload
  containing the seed used, the five stop indices, and the symbols configured at each stop.
  Reel-strip *content* (real symbol sets, pay-lines, bet levels) belongs to other stories in
  the Game Engine & Config epic; this story treats `ReelStrip[]` as an external input and
  only needs placeholder fixtures to test against.

scope:
  - description: |
      Bootstrap a minimal TypeScript + Vitest toolchain since no manifest or config exists
      in the repo yet: `package.json` (with `vitest` and `typescript` as devDependencies,
      a `test` script running `vitest run`), `tsconfig.json` (strict mode, ES2022 target),
      and `vitest.config.ts`.
    files:
      - package.json
      - tsconfig.json
      - vitest.config.ts
    rationale: |
      There is currently no build/test tooling in this repository at all (confirmed via
      glob — only design-system CSS/JSON assets exist). A test-first plan needs a runnable
      test command before any failing test can be written.

  - description: |
      Implement a deterministic PRNG (mulberry32, seeded from a 32-bit unsigned integer)
      and a helper to draw a uniformly-distributed integer in `[0, exclusiveMax)`.

      ```ts
      // src/engine/rng.ts
      export function createRng(seed: number): () => number
      export function nextInt(rng: () => number, exclusiveMax: number): number
      ```
    files:
      - src/engine/rng.ts
      - src/engine/rng.test.ts
    rationale: |
      AC1, AC2, and AC5 all depend on a PRNG that is reproducible from a seed and produces
      uniformly distributed values — this is the deterministic core everything else is
      built on.

  - description: |
      Implement seed validation and auto-generation.

      ```ts
      // src/engine/seed.ts
      export const SEED_MIN = 0;
      export const SEED_MAX = 2 ** 32 - 1;
      export class InvalidSeedError extends Error {}
      export function validateSeed(seed: unknown): number
      export function generateSeed(): number
      ```

      `validateSeed` throws `InvalidSeedError` when `seed` is not an integer `number`, or
      is outside `[SEED_MIN, SEED_MAX]`. `generateSeed` uses Node's built-in
      `crypto.randomInt(SEED_MIN, SEED_MAX + 1)` (no new dependency) to produce a seed when
      the caller doesn't supply one.
    files:
      - src/engine/seed.ts
      - src/engine/seed.test.ts
    rationale: |
      AC7 (auto-generate a seed when none supplied) and AC8 (reject a wrong-type/out-of-range
      seed) are both isolated, easily unit-testable concerns that `spin()` composes rather
      than reimplements.

  - description: |
      Implement the reel-strip type and per-reel stop/symbol selection.

      ```ts
      // src/engine/types.ts
      export interface ReelStrip { symbols: string[] }

      // src/engine/reels.ts
      export function pickStop(rng: () => number, strip: ReelStrip): number
      export function symbolsAtStop(strip: ReelStrip, stop: number): string[]
      ```

      `pickStop` delegates to `nextInt(rng, strip.symbols.length)`. `symbolsAtStop` returns
      `[strip.symbols[stop]]` — the single symbol configured at that position (no
      multi-row "window" concept is introduced; see assumptions).
    files:
      - src/engine/types.ts
      - src/engine/reels.ts
      - src/engine/reels.test.ts
      - src/engine/fixtures/reels.fixture.ts
    rationale: |
      AC2 requires each reel's stop to be drawn from *that reel's own* configured strip
      length (strips may differ in length per reel), and AC6 requires the displayed
      symbols to match the strip's configured content at the chosen stop. Keeping this in
      its own module lets both be unit-tested independently of seed/PRNG plumbing. The
      fixture file provides five strips of differing lengths purely for tests — it is not
      the production symbol config (owned by another story in this epic).

  - description: |
      Implement the `spin()` orchestration function that composes seed handling, the PRNG,
      and per-reel stop/symbol selection into the final result payload.

      ```ts
      // src/engine/spin.ts
      export interface SpinRequest { seed?: unknown; reels: ReelStrip[] }
      export interface SpinResult { seed: number; stops: number[]; symbols: string[][] }
      export function spin(request: SpinRequest): SpinResult
      ```

      Behavior: `seed = request.seed === undefined ? generateSeed() : validateSeed(request.seed)`;
      one `rng = createRng(seed)` is created per call and reused across all 5 reels (so
      reels 2-5 depend on the draws made for reels before them, all deterministically
      derived from the single seed); `stops[i] = pickStop(rng, request.reels[i])`;
      `symbols[i] = symbolsAtStop(request.reels[i], stops[i])`.
    files:
      - src/engine/spin.ts
      - src/engine/spin.test.ts
    rationale: |
      This is the integration point where AC1, AC3, AC4, AC5, AC6, AC7, and AC8 all become
      observable through one public entry point, matching how a caller (e.g. a future
      spin-request handler) will actually use this engine.

tests:
  - |
    **AC1 — same seed always produces the same stops across all 5 reels** (`spin.test.ts`):
    ```ts
    it('produces identical stops for the same seed across runs', () => {
      const first = spin({ seed: 999, reels: fiveReelFixture });
      const second = spin({ seed: 999, reels: fiveReelFixture });
      expect(first.stops).toEqual(second.stops);
    });
    ```
  - |
    **AC2 — each reel's stop is drawn uniformly from that reel's own strip length**
    (`reels.test.ts` unit-level + `spin.test.ts` integration; strips of differing lengths):
    ```ts
    it('keeps every draw within [0, exclusiveMax) over many samples', () => {
      const rng = createRng(7);
      for (let i = 0; i < 1000; i++) {
        const n = nextInt(rng, 20);
        expect(n).toBeGreaterThanOrEqual(0);
        expect(n).toBeLessThan(20);
      }
    });

    it('keeps each reel stop within that reel’s own strip bounds', () => {
      const result = spin({ seed: 555, reels: fiveReelFixture });
      result.stops.forEach((stop, i) => {
        expect(stop).toBeGreaterThanOrEqual(0);
        expect(stop).toBeLessThan(fiveReelFixture[i].symbols.length);
      });
    });
    ```
  - |
    **AC3 — result payload includes the seed used and the 5 per-reel stop indices**
    (`spin.test.ts`):
    ```ts
    it('includes the seed and one stop index per reel in the result', () => {
      const result = spin({ seed: 42, reels: fiveReelFixture });
      expect(result.seed).toBe(42);
      expect(result.stops).toHaveLength(5);
    });
    ```
  - |
    **AC4 — two different seeds yield differing stop-index sets** (`spin.test.ts`; this is
    deterministic, not flaky, since the same seed pair always produces the same outputs):
    ```ts
    it('differs in at least one reel stop between two different seeds', () => {
      const a = spin({ seed: 1, reels: fiveReelFixture });
      const b = spin({ seed: 2, reels: fiveReelFixture });
      expect(a.stops).not.toEqual(b.stops);
    });
    ```
  - |
    **AC5 — an external seed can be supplied to make subsequent spins reproducible**
    (`spin.test.ts`; same assertion shape as AC1 but framed as "supply seed, get the engine
    to reproduce it later", per the AC wording):
    ```ts
    it('reproduces the full result when the same external seed is supplied again', () => {
      const a = spin({ seed: 2024, reels: fiveReelFixture });
      const b = spin({ seed: 2024, reels: fiveReelFixture });
      expect(a).toEqual(b);
    });
    ```
  - |
    **AC6 — displayed symbols match the strip's configured symbols at the chosen stop**
    (`reels.test.ts` unit-level + `spin.test.ts` integration):
    ```ts
    it('returns the symbol configured at the chosen stop position', () => {
      const strip: ReelStrip = { symbols: ['A', 'B', 'C'] };
      expect(symbolsAtStop(strip, 1)).toEqual(['B']);
    });

    it('returns the symbols configured at each stop position for every reel', () => {
      const result = spin({ seed: 42, reels: fiveReelFixture });
      result.symbols.forEach((symbolsForReel, i) => {
        expect(symbolsForReel).toEqual([fiveReelFixture[i].symbols[result.stops[i]]]);
      });
    });
    ```
  - |
    **AC7 — spin without a supplied seed auto-generates one, present in the result**
    (`seed.test.ts` unit-level + `spin.test.ts` integration):
    ```ts
    it('generates a seed within the valid range when none is supplied', () => {
      const seed = generateSeed();
      expect(Number.isInteger(seed)).toBe(true);
      expect(seed).toBeGreaterThanOrEqual(SEED_MIN);
      expect(seed).toBeLessThanOrEqual(SEED_MAX);
    });

    it('auto-generates a seed and includes it in the result when none is supplied', () => {
      const result = spin({ reels: fiveReelFixture });
      expect(Number.isInteger(result.seed)).toBe(true);
    });
    ```
  - |
    **AC8 — a wrong-type or out-of-range seed is rejected with a validation error**
    (`seed.test.ts` unit-level + `spin.test.ts` integration):
    ```ts
    it('rejects a non-numeric seed', () => {
      expect(() => validateSeed('abc')).toThrow(InvalidSeedError);
    });

    it('rejects a seed outside the valid range', () => {
      expect(() => validateSeed(-1)).toThrow(InvalidSeedError);
      expect(() => validateSeed(2 ** 32)).toThrow(InvalidSeedError);
    });

    it('rejects a spin request carrying an invalid seed', () => {
      expect(() => spin({ seed: 'not-a-number', reels: fiveReelFixture })).toThrow(InvalidSeedError);
    });
    ```

assumptions_or_open_questions:
  - |
    No tech stack exists anywhere in the repo yet (no package manifest, no language files
    besides one Python contrast-checker script for the design system). This plan assumes
    TypeScript + Node + Vitest, matching the JS/web-oriented design-system tooling already
    present (tokens.json/tokens.css) and the epic's "baked into the build at compile time"
    phrasing. Please confirm this is the intended stack for the game engine before
    implementation, since it can't be inferred from existing code.
  - |
    AC5 ("GIVEN the engine initialises WHEN the PRNG is set up THEN an external seed can be
    supplied...") is implemented as a per-call `seed` argument on a stateless `spin()`
    function rather than a persistent stateful engine object whose PRNG stream advances
    across many spins without reseeding. This satisfies the observable behavior (external
    seed -> reproducible output) with the least code. If a long-lived, stateful engine
    instance is actually required (e.g. so a session can take many spins from one seeded
    stream without re-specifying the seed each time), that's a larger design and should be
    called out explicitly.
  - |
    AC6 is interpreted as one visible symbol per reel per stop (`symbolsAtStop` returns a
    single-element array). No AC or design doc specifies a multi-row visible "window" (e.g.
    3 symbols per reel), so that concept is not introduced here; it would belong to a
    win-line-evaluation story if the visible board is more than 1 row per reel.
  - |
    Reel-strip *content* (real symbols, counts, weighting) is treated as an external input
    to this story (`ReelStrip[]` parameter), not something this story defines. Only a small
    test fixture with 5 strips of differing lengths is added, to prove AC2 works per-reel
    independently. Production symbol/pay-line/bet-level config is assumed to be owned by a
    separate story in the Game Engine & Config epic.
  - |
    Seed valid range is assumed to be `[0, 2^32 - 1]` (unsigned 32-bit), matching mulberry32's
    native seed space. If the product/engine spec mandates a different valid range for
    seeds, `SEED_MIN`/`SEED_MAX` in `seed.ts` are the single place to adjust.
  - |
    Auto-generated seeds use Node's `crypto.randomInt`, chosen only for reasonable
    unpredictability of the seed itself — no cryptographic-fairness certification
    requirement was stated for this story.

package_dependencies:
  - name: typescript
    version: ^5.6.0
    ecosystem: npm
    rationale: |
      No language toolchain exists in the repo yet; the engine code and its type-checked
      interfaces (`ReelStrip`, `SpinRequest`, `SpinResult`) are written in TypeScript.
  - name: vitest
    version: ^2.1.0
    ecosystem: npm
    rationale: |
      No test runner exists in the repo yet; this is the test-first plan's execution
      engine for every `*.test.ts` file listed above.
  - name: "@types/node"
    version: ^22.7.0
    ecosystem: npm
    rationale: |
      `generateSeed()` uses Node's built-in `crypto.randomInt`; TypeScript needs Node's
      type definitions to type-check that import since none are present in the repo yet.

notes: |
  This is a greenfield addition — confirmed via `Glob` that the repo has no application
  code or package manifest outside `design-system/` (CSS/tokens/style-guide + one Python
  script). All files below are new; nothing pre-existing is modified or called into. The
  diagram shows the internal module wiring within this story's own scope only (fan-in to
  `spin.ts`), not an integration with any pre-existing subsystem.

  ```mermaid
  flowchart TD
    types["types.ts\nReelStrip / SpinRequest / SpinResult"]
    rng["rng.ts\ncreateRng / nextInt"]
    seed["seed.ts\nvalidateSeed / generateSeed"]
    reels["reels.ts\npickStop / symbolsAtStop"]
    spin["spin.ts\nspin()"]

    rng -->|"nextInt(rng, stripLength)"| reels
    types -->|"ReelStrip shape"| reels
    rng -->|"one rng per spin, drawn per reel"| spin
    seed -->|"seed used or validated"| spin
    reels -->|"stop + symbol per reel"| spin
    types -->|"SpinRequest / SpinResult shape"| spin

    classDef touched fill:#f96,color:#000
    class types,rng,seed,reels,spin touched
  ```

  Test execution: `npx vitest run` (wired as `npm test` in the new `package.json`).
