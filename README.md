# Test_M1

## Slot engine tech stack decision (TEST-M1-STORY-004)

The implementation plan for this story specified TypeScript + Vitest (plus
`typescript`, `vitest`, and `@types/node` as devDependencies). That stack could
not be installed in the sandbox this story was implemented in: `npm install`
fails with `403 Forbidden` against `registry.npmjs.org` (confirmed directly,
through the configured proxy, and via `--offline` against the local npm cache,
which has no cached copy of `typescript` or `vitest`) — there is no network
route to any package registry from this environment.

Given that constraint, `src/engine/` is implemented in plain JavaScript (ESM)
with zero devDependencies, and tests use Node's built-in `node:test` runner
(`node --test`, wired as `npm test`) instead of Vitest. This preserves the
plan's module boundaries and function signatures exactly (`rng.ts` → `rng.js`,
`seed.ts` → `seed.js`, `reels.ts` → `reels.js`, `spin.ts` → `spin.js`, one
`*.test.js` per module) and satisfies every acceptance criterion with a real,
non-fabricated test framework. If a future environment has registry access,
migrating to TypeScript + Vitest per the original plan is a mechanical change
(add `tsconfig.json`/`vitest.config.ts` + the three devDependencies, rename
`.js` to `.ts`, switch `assert`/`node:test` imports to `vitest`) since the
logic and module shape are already 1:1 with what the plan specified.