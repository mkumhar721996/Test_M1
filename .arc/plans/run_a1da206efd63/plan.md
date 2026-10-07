summary: |
  Extend the existing pure arithmetic engine at `src/calc/engine.js` (built in
  TEST-M1-STORY-181) with scientific operations: `sin`/`cos`/`tan` and their
  inverses (`arcsin`/`arccos`/`arctan`, aliased to `asin`/`acos`/`atan`) under a
  selectable degrees/radians angle mode, `ln` and base-10 `log`, `exp` (e^x),
  `sqrt`/`cbrt`/arbitrary `root(x, n)`, and postfix factorial (`n!`) — all
  composable with the core `+ - * / ^ ()` grammar and `pi`/`e` constants
  already in place. Domain violations (out-of-range inverse trig input,
  non-positive logarithm input, negative square/even-root input, negative
  factorial input) each surface as their own distinct, named `Error`
  subclass, mirroring the `MalformedExpressionError`/`DivideByZeroError`/
  `OverflowError` convention story 181 already established. No HTTP route or
  UI is added — every acceptance criterion is phrased against evaluation
  itself, and the engine still has no caller anywhere in the codebase.

scope:
  - description: |
      Extend `test/calc-engine.test.js` with one failing test per acceptance
      criterion, added after the existing story-181 `AC1`..`AC9` tests
      (which stay untouched) and prefixed `Sci-AC*` to avoid name collision
      with the existing arithmetic `AC1`..`AC9` tests in the same file. Add
      the new error classes to the top `require`:
      ```js
      const {
        evaluate,
        DivideByZeroError,
        OverflowError,
        MalformedExpressionError,
        TrigDomainError,
        LogarithmDomainError,
        RootDomainError,
        FactorialDomainError,
      } = require('../src/calc/engine');
      ```
      See the `tests` field below for the literal new test bodies (one block
      per AC, several with multiple `expect`s where the AC names two or more
      example inputs, matching the existing file's style of combining
      closely related assertions under one AC-labeled test).
    files:
      - test/calc-engine.test.js
    rationale: |
      Pins down the exact new exported shape (4 new error classes, plus the
      existing `evaluate` now accepting an optional second `options`
      argument) before any scientific-function code exists, and keeps the
      story-181 regression tests in the same file passing untouched —
      proving the extension is additive, not a breaking rewrite.

  - description: |
      Extend `src/calc/engine.js`:

      1. Add four new error classes alongside the existing three, same
         shape:
         ```js
         class TrigDomainError extends Error {
           constructor(message) { super(message); this.name = 'TrigDomainError'; }
         }
         class LogarithmDomainError extends Error {
           constructor(message) { super(message); this.name = 'LogarithmDomainError'; }
         }
         class RootDomainError extends Error {
           constructor(message) { super(message); this.name = 'RootDomainError'; }
         }
         class FactorialDomainError extends Error {
           constructor(message) { super(message); this.name = 'FactorialDomainError'; }
         }
         ```
      2. Widen the tokenizer pattern to also match `,` and `!`:
         ```js
         const pattern = /\s*(?:(\d+\.?\d*|\.\d+)|([A-Za-z_]\w*)|([+\-*/^(),!]))/y;
         ```
      3. Add a function-name table, angle-mode helpers, and the per-function
         domain/compute logic:
         ```js
         const UNARY_FUNCTIONS = new Set([
           'sin', 'cos', 'tan',
           'asin', 'arcsin', 'acos', 'arccos', 'atan', 'arctan',
           'ln', 'log', 'exp', 'sqrt', 'cbrt',
         ]);
         const BINARY_FUNCTIONS = new Set(['root']);
         const FUNCTION_NAMES = new Set([...UNARY_FUNCTIONS, ...BINARY_FUNCTIONS]);

         function toRadians(x, angleMode) {
           return angleMode === 'degrees' ? (x * Math.PI) / 180 : x;
         }
         function fromRadians(x, angleMode) {
           return angleMode === 'degrees' ? (x * 180) / Math.PI : x;
         }
         function nthRoot(x, n) {
           if (n % 2 === 0 && x < 0) {
             throw new RootDomainError(`Even root (index ${n}) is undefined for negative numbers, got ${x}`);
           }
           return x < 0 ? -Math.pow(-x, 1 / n) : Math.pow(x, 1 / n);
         }
         function factorial(n) {
           if (!Number.isInteger(n) || n < 0) {
             throw new FactorialDomainError(`Factorial is only defined for non-negative integers, got ${n}`);
           }
           let result = 1;
           for (let i = 2; i <= n; i++) result *= i;
           return result;
         }
         function applyFunction(name, args, angleMode) {
           switch (name) {
             case 'sin': return Math.sin(toRadians(args[0], angleMode));
             case 'cos': return Math.cos(toRadians(args[0], angleMode));
             case 'tan': return Math.tan(toRadians(args[0], angleMode));
             case 'asin':
             case 'arcsin':
               if (args[0] < -1 || args[0] > 1) throw new TrigDomainError(`arcsin domain is [-1, 1], got ${args[0]}`);
               return fromRadians(Math.asin(args[0]), angleMode);
             case 'acos':
             case 'arccos':
               if (args[0] < -1 || args[0] > 1) throw new TrigDomainError(`arccos domain is [-1, 1], got ${args[0]}`);
               return fromRadians(Math.acos(args[0]), angleMode);
             case 'atan':
             case 'arctan':
               return fromRadians(Math.atan(args[0]), angleMode);
             case 'ln':
               if (args[0] <= 0) throw new LogarithmDomainError(`ln is only defined for positive numbers, got ${args[0]}`);
               return Math.log(args[0]);
             case 'log':
               if (args[0] <= 0) throw new LogarithmDomainError(`log is only defined for positive numbers, got ${args[0]}`);
               return Math.log10(args[0]);
             case 'exp': return Math.exp(args[0]);
             case 'sqrt':
               if (args[0] < 0) throw new RootDomainError(`Square root is undefined for negative numbers, got ${args[0]}`);
               return Math.sqrt(args[0]);
             case 'cbrt': return Math.cbrt(args[0]);
             case 'root': return nthRoot(args[0], args[1]);
             default: throw new MalformedExpressionError(`Unknown function '${name}'`);
           }
         }
         ```
      4. Insert a postfix-factorial precedence level between `parsePower`
         and `parsePrimary`, and route function calls through `parsePrimary`:
         ```js
         function parsePower(state) {
           const base = parseFactorial(state);
           if (peekOp(state, ['^'])) {
             state.pos++;
             return Math.pow(base, parsePower(state));
           }
           return base;
         }

         function parseFactorial(state) {
           let value = parsePrimary(state);
           while (peekOp(state, ['!'])) {
             state.pos++;
             value = factorial(value);
           }
           return value;
         }

         function parseFunctionCall(state, name) {
           state.pos++; // consume '('
           const args = [parseExpression(state)];
           while (peekOp(state, [','])) {
             state.pos++;
             args.push(parseExpression(state));
           }
           if (!peekOp(state, [')'])) throw new MalformedExpressionError('Missing closing parenthesis');
           state.pos++;
           const expectedArity = BINARY_FUNCTIONS.has(name) ? 2 : 1;
           if (args.length !== expectedArity) {
             throw new MalformedExpressionError(`Function '${name}' expects ${expectedArity} argument(s), got ${args.length}`);
           }
           return applyFunction(name, args, state.angleMode);
         }

         function parsePrimary(state) {
           const t = state.tokens[state.pos++];
           if (!t) throw new MalformedExpressionError('Unexpected end of expression');
           if (t.type === 'NUMBER') return t.value;
           if (t.type === 'IDENTIFIER' && FUNCTION_NAMES.has(t.value)) {
             if (!peekOp(state, ['('])) throw new MalformedExpressionError(`Expected '(' after function '${t.value}'`);
             return parseFunctionCall(state, t.value);
           }
           if (t.type === 'IDENTIFIER' && Object.hasOwn(CONSTANTS, t.value)) return CONSTANTS[t.value];
           if (t.type === 'OP' && t.value === '(') {
             const value = parseExpression(state);
             if (!peekOp(state, [')'])) throw new MalformedExpressionError('Missing closing parenthesis');
             state.pos++;
             return value;
           }
           throw new MalformedExpressionError(`Unexpected token '${t.value}'`);
         }
         ```
      5. Thread an angle mode through `evaluate`, defaulting to radians (so
         every existing story-181 call site with a single argument keeps
         working unchanged):
         ```js
         function evaluate(expression, options = {}) {
           const angleMode = options.angleMode === 'degrees' ? 'degrees' : 'radians';
           const tokens = tokenize(String(expression));
           if (tokens.length === 0) throw new MalformedExpressionError('Empty expression');
           const state = { tokens, pos: 0, angleMode };
           const result = parseExpression(state);
           if (state.pos < tokens.length) {
             throw new MalformedExpressionError(`Unexpected token '${tokens[state.pos].value}'`);
           }
           if (!Number.isFinite(result)) throw new OverflowError('Result exceeds representable range');
           return result;
         }
         ```
      6. Export the four new error classes alongside the existing ones.
    files:
      - src/calc/engine.js
    rationale: |
      Function calls and postfix factorial are parsed at (or directly above)
      `parsePrimary` — the engine's existing highest-precedence level,
      already used for numbers/constants/parenthesized groups — so they
      automatically bind tighter than `^`/`*`/`/`/`+`/`-` without touching
      `parseExpression`/`parseTerm` at all; this is what makes AC14's
      "correct order of operations between the scientific function and the
      arithmetic operators" fall out for free rather than needing new
      precedence-interaction logic. Domain checks are raised at the point of
      each function's own computation (same pattern story 181 used for
      divide-by-zero at the `/` operator), which is what keeps each domain
      error distinct rather than collapsing them into one generic
      "math error". `angleMode` is a plain per-call option on `evaluate`
      (not module-level mutable state) so the engine stays a pure function
      with no hidden state between calls, consistent with its current
      design.

tests:
  - |
    Sci-AC1 (default angle mode is radians) — test/calc-engine.test.js:
    ```js
    test('Sci-AC1: sin/cos/tan default to radians when no angle mode is set', () => {
      expect(evaluate('sin(pi / 2)')).toBeCloseTo(1, 10);
      expect(evaluate('cos(pi)')).toBeCloseTo(-1, 10);
    });
    ```
  - |
    Sci-AC2 (explicit degrees mode) — test/calc-engine.test.js:
    ```js
    test('Sci-AC2: sin/cos/tan use degrees when angle mode is explicitly degrees', () => {
      expect(evaluate('sin(90)', { angleMode: 'degrees' })).toBeCloseTo(1, 10);
      expect(evaluate('cos(180)', { angleMode: 'degrees' })).toBeCloseTo(-1, 10);
    });
    ```
  - |
    Sci-AC3 (inverse trig returns angle in selected mode) — test/calc-engine.test.js:
    ```js
    test('Sci-AC3: arcsin/arccos/arctan return the angle in the currently selected mode', () => {
      expect(evaluate('arcsin(1)')).toBeCloseTo(Math.PI / 2, 10);
      expect(evaluate('arcsin(1)', { angleMode: 'degrees' })).toBeCloseTo(90, 10);
      expect(evaluate('arccos(0)', { angleMode: 'degrees' })).toBeCloseTo(90, 10);
      expect(evaluate('arctan(1)', { angleMode: 'degrees' })).toBeCloseTo(45, 10);
    });
    ```
  - |
    Sci-AC4 (inverse trig domain error) — test/calc-engine.test.js:
    ```js
    test('Sci-AC4: arcsin/arccos outside [-1, 1] throw a distinct TrigDomainError', () => {
      expect(() => evaluate('arcsin(2)')).toThrow(TrigDomainError);
      expect(() => evaluate('arcsin(2)')).not.toThrow(LogarithmDomainError);
      expect(() => evaluate('arcsin(2)')).not.toThrow(MalformedExpressionError);
    });
    ```
  - |
    Sci-AC5 (ln/log of a positive number) — test/calc-engine.test.js:
    ```js
    test('Sci-AC5: ln and log base-10 return the correct value for a positive input', () => {
      expect(evaluate('ln(e)')).toBeCloseTo(1, 10);
      expect(evaluate('log(100)')).toBeCloseTo(2, 10);
    });
    ```
  - |
    Sci-AC6 (ln/log domain error) — test/calc-engine.test.js:
    ```js
    test('Sci-AC6: ln/log of zero or a negative number throw a distinct LogarithmDomainError', () => {
      expect(() => evaluate('ln(0)')).toThrow(LogarithmDomainError);
      expect(() => evaluate('log(0 - 5)')).toThrow(LogarithmDomainError);
      expect(() => evaluate('ln(0)')).not.toThrow(RootDomainError);
    });
    ```
  - |
    Sci-AC7 (e^x) — test/calc-engine.test.js:
    ```js
    test('Sci-AC7: exp returns the correct value for any real exponent', () => {
      expect(evaluate('exp(0)')).toBe(1);
      expect(evaluate('exp(2)')).toBeCloseTo(Math.E ** 2, 10);
    });
    ```
  - |
    Sci-AC8 (square root of a non-negative number) — test/calc-engine.test.js:
    ```js
    test('Sci-AC8: sqrt returns the correct value for a non-negative input', () => {
      expect(evaluate('sqrt(16)')).toBe(4);
      expect(evaluate('sqrt(0)')).toBe(0);
    });
    ```
  - |
    Sci-AC9 (square root domain error) — test/calc-engine.test.js:
    ```js
    test('Sci-AC9: sqrt of a negative number throws a distinct RootDomainError', () => {
      expect(() => evaluate('sqrt(0 - 4)')).toThrow(RootDomainError);
      expect(() => evaluate('sqrt(0 - 4)')).not.toThrow(LogarithmDomainError);
      expect(() => evaluate('sqrt(0 - 4)')).not.toThrow(FactorialDomainError);
    });
    ```
  - |
    Sci-AC10 (cube root and arbitrary nth root) — test/calc-engine.test.js:
    ```js
    test('Sci-AC10: cbrt and the generic nth root return the correct value for a positive input', () => {
      expect(evaluate('cbrt(8)')).toBeCloseTo(2, 10);
      expect(evaluate('root(32, 5)')).toBeCloseTo(2, 10);
    });
    ```
  - |
    Sci-AC11 (even nth root domain error) — test/calc-engine.test.js:
    ```js
    test('Sci-AC11: an even-indexed root of a negative number throws a distinct RootDomainError', () => {
      expect(() => evaluate('root(0 - 16, 4)')).toThrow(RootDomainError);
      expect(() => evaluate('root(0 - 16, 4)')).not.toThrow(TrigDomainError);
    });
    ```
  - |
    Sci-AC12 (factorial of a non-negative integer) — test/calc-engine.test.js:
    ```js
    test('Sci-AC12: factorial returns the correct value for a non-negative integer', () => {
      expect(evaluate('5!')).toBe(120);
      expect(evaluate('0!')).toBe(1);
    });
    ```
  - |
    Sci-AC13 (factorial domain error) — test/calc-engine.test.js:
    ```js
    test('Sci-AC13: factorial of a negative integer throws a distinct FactorialDomainError', () => {
      expect(() => evaluate('(0 - 3)!')).toThrow(FactorialDomainError);
      expect(() => evaluate('(0 - 3)!')).not.toThrow(RootDomainError);
      expect(() => evaluate('(0 - 3)!')).not.toThrow(MalformedExpressionError);
    });
    ```
  - |
    Sci-AC14 (order of operations with core arithmetic) — test/calc-engine.test.js:
    ```js
    test('Sci-AC14: a scientific function combined with arithmetic respects order of operations', () => {
      expect(evaluate('2 + sqrt(16) * 3')).toBe(14);
      expect(evaluate('2 * 3! + 1')).toBe(13);
    });
    ```

assumptions_or_open_questions:
  - |
    Unary minus is still not supported, matching story 181's explicit
    exclusion (confirmed still true by reading the current
    `src/calc/engine.js`: `parsePrimary` has no leading-`-` case). Negative
    inputs to domain-checked functions are therefore written via
    subtraction inside the call, e.g. `sqrt(0 - 4)`, `(0 - 3)!` — this is a
    test-authoring workaround, not a new engine feature, and every AC's
    "negative number" example is reachable this way without adding unary
    minus.
  - |
    Both the "arc-" spelling the acceptance criteria use (`arcsin`,
    `arccos`, `arctan`) and the shorter conventional spelling (`asin`,
    `acos`, `atan`, matching `Math.asin`/`Math.acos`/`Math.atan`) are
    accepted as the same function. No AC requires the short form, but it's
    a one-line addition to the function-name set and avoids surprising a
    reviewer who expects the common calculator/JS naming.
  - |
    `log` is base-10 and `ln` is natural log, per the story's own scope
    text ("ln and log base-10"); arbitrary-base `log` and hyperbolic
    trig (`sinh`/`cosh`/`tanh`/...) are explicitly out of scope per the
    story description and are not added.
  - |
    Factorial also rejects non-integer operands (e.g. `3.5!`) via the same
    `FactorialDomainError`, even though the ACs only name the non-negative
    vs. negative integer cases — the story explicitly scopes factorial
    without a gamma-function extension, so a non-integer input has no
    defined result under this plan and is treated as a domain violation
    rather than silently truncating or throwing a different error type.
  - |
    Angle mode is a per-call option, `evaluate(expression, { angleMode:
    'degrees' | 'radians' })`, defaulting to `'radians'` — not persisted
    module-level state — since the engine is otherwise a pure function and
    no AC describes a mode that must persist across separate `evaluate`
    calls. This keeps every existing story-181 single-argument call site
    (`evaluate('2 + 3 * 4 ^ 2')`) working unchanged.
  - |
    No HTTP route, store, or UI change is included — as in story 181, every
    AC is phrased as "WHEN it is evaluated" against the engine directly,
    and a repo-wide check confirms `src/calc/engine.js` still has no
    caller anywhere else in `src/` or `public/`.

package_dependencies: []

notes: |
  All new math (`Math.sin/cos/tan/asin/acos/atan/log/log10/exp/sqrt/cbrt/pow`)
  is covered by JavaScript's built-in `Math` object, so no new runtime
  dependency is needed — consistent with story 181's precedent of
  hand-rolled logic over a parsing/math library.

  This plan is a direct, same-module extension of `src/calc/engine.js` and
  `test/calc-engine.test.js` (both already read in full as part of this
  planning pass) — no new files, no other module touched, and the engine
  still has zero callers elsewhere in the repo, so a scope diagram is
  skipped per the "small/purely-additive" guidance.

  Verified by reading the current `src/calc/engine.js` (113 lines) and
  `test/calc-engine.test.js` (57 lines) that both match the shape described
  in story 181's own plan (`.arc/plans/run_16a73af18012/plan.md`) exactly —
  `evaluate`/`MalformedExpressionError`/`DivideByZeroError`/`OverflowError`
  are the only current exports, `parseExpression`/`parseTerm`/`parsePower`/
  `parsePrimary` are the only current parse functions, and there is no
  existing function-call or postfix-operator support to conflict with.

review_focus: |
  In scope: four new domain-specific error types, trig/inverse-trig with a
  per-call degrees/radians option, `ln`/`log`/`exp`, `sqrt`/`cbrt`/generic
  `root(x, n)`, and postfix factorial — all layered onto the existing
  `src/calc/engine.js` grammar with no HTTP/UI surface. Explicitly out of
  scope (per the story description, not an oversight): hyperbolic trig,
  arbitrary-base log, and unary minus (negative literals for domain-error
  tests are written as `0 - n` subtractions instead). The riskiest area is
  precedence: factorial is parsed as a new level between `^` and primaries
  (so `2^3!` means `2^(3!)` and `3!^2` means `(3!)^2`), and function calls
  are parsed inside `parsePrimary` (so they're already highest-precedence,
  same as parentheses) — a reviewer should double check `2 + sqrt(16) * 3`
  and `2 * 3! + 1` both land on the expected single value rather than a
  looser binding. Also worth confirming: `angleMode` is a stateless
  per-call option (default `'radians'`), not mutable module state, and
  `sqrt`/`root` reuse the same `RootDomainError` for both the
  dedicated-square-root case and the generic-even-root case since they're
  the same underlying domain violation, not "different" domain errors in
  the sense the ACs mean by "distinct from other domain errors" (that
  phrase is read as distinct *families* — trig vs. log vs. root vs.
  factorial — not a separate class per function name).
