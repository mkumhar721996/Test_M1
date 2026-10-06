summary: |
  Implement a pure, directly-unit-testable arithmetic expression engine at
  `src/calc/engine.js`: a hand-rolled tokenizer and recursive-descent
  parser/evaluator covering `+ - * / ^`, parentheses, and the constants `pi`
  and `e`, with correct precedence/associativity (parentheses highest, then
  right-associative `^`, then left-associative `*`/`/`, then left-associative
  `+`/`-`). Invalid input surfaces as one of three distinct, named `Error`
  subclasses — `DivideByZeroError`, `OverflowError`, `MalformedExpressionError`
  — mirroring the existing thrown-custom-error convention already used in
  `src/guests/store.js` (`GuestValidationError`, confirmed present at
  src/guests/store.js:14; the same pattern also appears in
  src/rooms/store.js and src/hires/store.js). No HTTP route, UI, or
  scientific-function support is added: every acceptance criterion is phrased
  as "WHEN it is evaluated" against the engine directly, not through a
  request or a page, and the parent epic explicitly carves scientific
  functions out to a later story built on top of this one.

scope:
  - description: |
      Add `test/calc-engine.test.js` first, with one failing test per
      acceptance criterion (plus a couple of malformed-expression variants),
      against the not-yet-existing module:
      ```js
      const { evaluate, DivideByZeroError, OverflowError, MalformedExpressionError } = require('../src/calc/engine');
      ```
      See the `tests` field below for the literal test bodies. The project
      uses Jest (`"test": "jest"` in package.json, existing suite lives
      under `test/*.test.js`), so this file follows that exact naming and
      `require`-based convention.
    files:
      - test/calc-engine.test.js
    rationale: |
      This file is written and run (red) before any engine code exists,
      pinning down the exact exported shape (`evaluate` plus the three
      error classes) the implementation in scope item 2 must satisfy.

  - description: |
      Add `src/calc/engine.js` implementing the engine:
      ```js
      class MalformedExpressionError extends Error {
        constructor(message) { super(message); this.name = 'MalformedExpressionError'; }
      }
      class DivideByZeroError extends Error {
        constructor(message) { super(message); this.name = 'DivideByZeroError'; }
      }
      class OverflowError extends Error {
        constructor(message) { super(message); this.name = 'OverflowError'; }
      }

      function evaluate(expression) { /* returns a number, or throws one of the above */ }
      module.exports = { evaluate, MalformedExpressionError, DivideByZeroError, OverflowError };
      ```
      Internals: a `tokenize(expression)` function producing a flat token
      list (`NUMBER`, `IDENTIFIER` for `pi`/`e`, and single-char
      operator/paren tokens), throwing `MalformedExpressionError` on an
      unrecognized character. A recursive-descent parser/evaluator with one
      function per precedence level, evaluated inline (no separate AST
      stage, since the grammar is small and flat):
      ```js
      function parseExpression(tokens) { /* + and - , left-assoc */ }
      function parseTerm(tokens) { /* * and / , left-assoc; throws DivideByZeroError when the evaluated right-hand operand === 0 */ }
      function parsePower(tokens) { /* ^ , right-assoc (parsePower calls itself on the exponent side) */ }
      function parsePrimary(tokens) { /* NUMBER | 'pi' | 'e' | '(' expression ')'; throws MalformedExpressionError on anything else (including running out of tokens) */ }
      ```
      `evaluate(expression)` tokenizes, calls `parseExpression` on a mutable
      cursor/position over the token list, throws `MalformedExpressionError`
      if tokens remain unconsumed after the top-level parse (trailing
      garbage) or if the token list is empty, and finally checks
      `Number.isFinite(result)` on the fully-reduced value — throwing
      `OverflowError` if not (this only triggers via `^`, since `/` already
      guards its own zero-divisor case before reaching this point, so a
      divide-by-zero expression is never also reported as overflow).
    files:
      - src/calc/engine.js
    rationale: |
      This is the actual engine under test for all 9 ACs. Splitting
      precedence levels into their own parse functions is the minimal
      structure needed to get `2 + 3 * 4 ^ 2` right (AC1) without a
      heavier parser-generator/AST dependency this project doesn't already
      have; checking the zero-divisor at the `/` operation itself (rather
      than only checking `isFinite` at the end) is what makes
      `DivideByZeroError` and `OverflowError` genuinely distinct for `5 / 0`
      (which would otherwise also read as `Infinity` / non-finite).

tests:
  - |
    AC1 — test/calc-engine.test.js:
    ```js
    test('AC1: respects */^ over + with right-associative exponentiation', () => {
      expect(evaluate('2 + 3 * 4 ^ 2')).toBe(50);
    });
    ```
  - |
    AC2 — test/calc-engine.test.js:
    ```js
    test('AC2: parentheses override default precedence', () => {
      expect(evaluate('(2 + 3) * 4')).toBe(20);
    });
    ```
  - |
    AC3 — test/calc-engine.test.js:
    ```js
    test('AC3: division and subtraction evaluate left-to-right at their precedence', () => {
      expect(evaluate('20 / 4 - 2')).toBe(3);
    });
    ```
  - |
    AC4 — test/calc-engine.test.js:
    ```js
    test('AC4: division and multiplication are left-associative at the same precedence', () => {
      expect(evaluate('20 / 4 * 2')).toBe(10);
    });
    ```
  - |
    AC5 — test/calc-engine.test.js:
    ```js
    test('AC5: the constant pi is recognized and usable in arithmetic', () => {
      expect(evaluate('2 * pi')).toBe(2 * Math.PI);
    });
    ```
  - |
    AC6 — test/calc-engine.test.js:
    ```js
    test('AC6: the constant e is recognized and usable in arithmetic', () => {
      expect(evaluate('e + 1')).toBe(Math.E + 1);
    });
    ```
  - |
    AC7 — test/calc-engine.test.js:
    ```js
    test('AC7: division by zero throws a distinct DivideByZeroError', () => {
      expect(() => evaluate('5 / 0')).toThrow(DivideByZeroError);
      expect(() => evaluate('5 / 0')).not.toThrow(OverflowError);
      expect(() => evaluate('5 / 0')).not.toThrow(MalformedExpressionError);
    });
    ```
  - |
    AC8 — test/calc-engine.test.js:
    ```js
    test('AC8: a result exceeding double-precision range throws a distinct OverflowError', () => {
      expect(() => evaluate('10 ^ 1000')).toThrow(OverflowError);
      expect(() => evaluate('10 ^ 1000')).not.toThrow(DivideByZeroError);
      expect(() => evaluate('10 ^ 1000')).not.toThrow(MalformedExpressionError);
    });
    ```
  - |
    AC9 — test/calc-engine.test.js:
    ```js
    test('AC9: a malformed expression throws a distinct MalformedExpressionError', () => {
      expect(() => evaluate('2 + * 3')).toThrow(MalformedExpressionError);
      expect(() => evaluate('2 + * 3')).not.toThrow(DivideByZeroError);
      expect(() => evaluate('2 + * 3')).not.toThrow(OverflowError);
    });

    test('AC9 (additional malformed shapes): unbalanced parens, trailing tokens, and empty input are all malformed', () => {
      expect(() => evaluate('(2 + 3')).toThrow(MalformedExpressionError);
      expect(() => evaluate('2 3')).toThrow(MalformedExpressionError);
      expect(() => evaluate('')).toThrow(MalformedExpressionError);
    });
    ```

assumptions_or_open_questions:
  - |
    No acceptance criterion mentions an HTTP endpoint, route, or UI screen —
    every AC is phrased as "WHEN it is evaluated" against the expression
    itself. This plan therefore adds only a pure backend module
    (`src/calc/engine.js`) with no `src/*/routes.js`, no `src/server.js`
    change, and no `public/*` page, on the reading that wiring this engine
    into a real calculator endpoint/UI belongs to whatever future story
    introduces that surface (the parent epic frames this story as the
    underlying "Calculation Engine", not a user-facing feature). A
    repo-wide search for `expression`/`evaluate`/`calc` under `src/`
    confirmed no such route or module exists yet.
  - |
    The ACs' "a ... error ... is returned" is implemented as a thrown custom
    `Error` subclass (caught via `expect(...).toThrow(...)`), matching the
    existing precedent for domain-specific error types in this codebase
    (`GuestValidationError` in src/guests/store.js, `RoomValidationError`
    and `RoomMaintenanceBlockedError` in src/rooms/store.js,
    `HireValidationError` in src/hires/store.js — all thrown rather than
    returned as a value) rather than introducing a new result/either-style
    return convention this project doesn't otherwise use.
  - |
    Division by zero is detected by checking the right-hand operand's
    evaluated value `=== 0` at the point of the `/` operation, regardless of
    the numerator — so `0 / 0` is also reported as `DivideByZeroError`
    (never surfaces as `NaN` or `OverflowError`), since no AC describes a
    `0/0` case separately from AC7's general "divide by zero" error.
  - |
    `pi` and `e` are matched case-sensitively and only as those exact
    identifiers (matching the ACs' lowercase examples); any other letter
    sequence (e.g. `pie`, `PI`, an unknown variable name) is treated as an
    unrecognized token and throws `MalformedExpressionError` rather than
    silently evaluating to `0`/`NaN` or being special-cased further — no
    other named constants are introduced.
  - |
    Decimal numeric literals (e.g. `3.5`) are supported by the tokenizer as
    a baseline part of "parses arithmetic expressions" even though no AC
    exercises a non-integer literal directly; this is the minimal number
    grammar an arithmetic engine needs, not an added feature.
  - |
    Unary minus/plus (e.g. `-5 + 2`, a leading `-` before a parenthesized
    group) is NOT supported — no AC exercises a leading/unary sign, and the
    parent epic's own scope note separates this story from the
    scientific-functions story built "on top of" it. An expression starting
    with `-` is treated as malformed under this plan. Flagging this
    explicitly in case the reviewer expects unary minus as baseline
    arithmetic rather than out of scope.
  - |
    Whitespace between tokens (as in all the AC examples, `"2 + 3 * 4 ^ 2"`)
    is skipped by the tokenizer; expressions with no whitespace (e.g.
    `"2+3*4^2"`) are not explicitly required by any AC but fall out of the
    same tokenizer for free and are not treated as a special case.

package_dependencies: []

notes: |
  This is the first calculation/expression-engine code in the repository —
  there is no existing parser, calculator route, or arithmetic utility to
  extend (verified via a repo-wide search for `expression`/`evaluate`/`calc`
  under `src/`, which found nothing besides this plan; confirmed the
  existing `src/` modules are employees, guests, hires, onboarding, rooms,
  runs, workflows, plus `src/index.js`/`src/server.js`). The implementation
  is intentionally a small hand-rolled recursive-descent parser rather than
  pulling in a third-party expression-parsing library: the grammar is tiny
  (five binary operators, one grouping construct, two named constants),
  `package.json` has only `express` as a runtime dependency and no existing
  parsing library, and the project's existing convention (e.g.
  src/guests/store.js, src/hires/store.js) is hand-rolled domain logic over
  a plain-object/`Map` store rather than pulling in libraries for small,
  well-understood problems — so no new `package_dependencies` are added.
  Test runner is confirmed as Jest (`"test": "jest"` in package.json, with
  existing specs under `test/*.test.js` such as test/guests-store.test.js
  and test/hires-validation.test.js), so `test/calc-engine.test.js` follows
  that exact convention.

  This plan deliberately stops at the engine boundary: `src/calc/engine.js`
  is new and self-contained, with no caller anywhere else in the codebase
  yet (no route, store, or frontend module imports it), so a
  scope/dependency diagram would have nothing but a single new node to show
  and is omitted per the "skip for small/purely-additive" guidance.

review_focus: |
  Scope is strictly the arithmetic engine itself — tokenizing/parsing
  `+ - * / ^`, parentheses, `pi`/`e`, and the three distinct error types.
  There is deliberately no HTTP route, store integration, or UI in this
  plan (see `assumptions_or_open_questions`); flag it only if the reviewer
  believes an AC implies a user-facing surface, since as written none do.
  The riskiest area is precedence/associativity interacting with the three
  error paths at once — specifically that `DivideByZeroError` is raised at
  the `/` operation itself (not via a generic post-hoc `isFinite` check),
  so a reviewer should confirm `5 / 0` never also satisfies the
  `OverflowError` check, and that `OverflowError` is reserved for a
  finite-but-out-of-range result (e.g. `10 ^ 1000`) rather than any
  non-finite value. Unary minus is a deliberate exclusion, not an
  oversight — called out explicitly for reviewer sign-off.
