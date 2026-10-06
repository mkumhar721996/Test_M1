summary: |
  Add a small, standalone arithmetic-evaluation module that evaluates expressions built only
  from the four basic operators (`+ - * /`) with standard BODMAS precedence (multiplication and
  division bind tighter than addition and subtraction; same-precedence operators are evaluated
  left-to-right), plus a single leading unary minus. This is evaluation logic only — no keypad,
  DOM, or display wiring (that surface is tracked separately per the parent epic). The repo
  already has two other arithmetic evaluators (`src/calc/engine.js` for the scientific engine
  with `^`, `()`, and constants; `public/js/calculator.js` for the on-screen keypad using `×`/`÷`
  glyphs and a hard overflow cap), but neither matches this story's exact contract: this story
  requires distinct error types (`DivisionByZeroError`, `InvalidExpressionError`) and requires
  that out-of-range results degrade to `Infinity`/`-Infinity` rather than throwing. Reusing or
  renaming either existing module would change their already-tested behavior, so this plan adds
  a new, narrowly-scoped module alongside them rather than extending either.
scope:
  - description: |
      Create `src/calc/basicEvaluator.js`, a pure CommonJS module exporting `evaluate(expression)`
      plus the two error classes. Internally: a tokenizer that reads NUMBER tokens (integers,
      decimals, and exponential notation like `1e308`) and OP tokens (`+ - * /`), then a
      recursive-descent parser with two precedence levels (`parseExpression` for `+`/`-`,
      `parseTerm` for `*`/`/`, `parseFactor` for a NUMBER or a single leading unary `-`).

      Signature:
      ```js
      function evaluate(expression) // returns a number, or throws DivisionByZeroError / InvalidExpressionError
      class DivisionByZeroError extends Error {}
      class InvalidExpressionError extends Error {}
      module.exports = { evaluate, DivisionByZeroError, InvalidExpressionError };
      ```

      Key rules the parser must enforce:
      - `*`/`/` bind tighter than `+`/`-`; both levels are left-associative.
      - A `-` is treated as unary ONLY when it is the very first token of the expression
        (there are no parentheses in scope, so no other unary position is reachable from the ACs).
      - Dividing by a literal `0` throws `DivisionByZeroError`.
      - Reaching end-of-input where an operand is expected (e.g. a trailing operator) throws
        `InvalidExpressionError` with a message containing "missing operand".
      - Encountering an operator where an operand is expected (e.g. two operators in a row)
        throws `InvalidExpressionError` with a message containing "consecutive operator".
      - No overflow check: if a computation overflows double range (e.g. `1e308 * 10`), the
        plain JS result (`Infinity`) is returned as-is, not converted into an error.
    files:
      - src/calc/basicEvaluator.js
    rationale: |
      A new file avoids colliding with `src/calc/engine.js` (already covers `^`/`()`/constants
      and throws a different `OverflowError` on overflow — behavior this story's AC13 explicitly
      forbids) and with `public/js/calculator.js` (keypad-facing, uses `×`/`÷` glyphs, caps
      results at a hard `OVERFLOW_LIMIT` rather than allowing `Infinity`). Both of those modules
      have their own passing test suites (`test/calc-engine.test.js`, `test/calculator.test.js`)
      that assert the behaviors this story's ACs explicitly contradict, so editing them in place
      would be a breaking, out-of-scope change.
  - description: |
      Create `test/calc-basic-evaluator.test.js` with one `test(...)` block per acceptance
      criterion, requiring `evaluate`, `DivisionByZeroError`, `InvalidExpressionError` from
      `../src/calc/basicEvaluator`.
    files:
      - test/calc-basic-evaluator.test.js
    rationale: |
      Mirrors the existing one-file-per-module test convention (`test/calc-engine.test.js` next
      to `src/calc/engine.js`) and gives every AC a single, directly-traceable failing test to
      write first.
tests:
  - |
    AC1 (both orderings give the same precedence-correct result):
    ```js
    expect(evaluate('2 + 3 * 4')).toBe(14);
    expect(evaluate('3 * 4 + 2')).toBe(14);
    ```
  - |
    AC2 (division binds tighter than subtraction):
    ```js
    expect(evaluate('10 - 4 / 2')).toBe(8);
    ```
  - |
    AC3 (division and multiplication are left-associative at equal precedence):
    ```js
    expect(evaluate('20 / 4 * 2')).toBe(10);
    ```
  - |
    AC4 (addition and subtraction are left-associative at equal precedence):
    ```js
    expect(evaluate('8 - 3 + 2')).toBe(7);
    ```
  - |
    AC5 (mixed-precedence chain):
    ```js
    expect(evaluate('6 + 2 * 5 - 3 / 1')).toBe(13);
    ```
  - |
    AC6 (negative result from higher-precedence multiplication):
    ```js
    expect(evaluate('3 - 5 * 2')).toBe(-7);
    ```
  - |
    AC7 (division yields a non-integer result):
    ```js
    expect(evaluate('7 / 2')).toBe(3.5);
    ```
  - |
    AC8 (leading unary minus combined with division):
    ```js
    expect(evaluate('-6 / 2')).toBe(-3);
    ```
  - |
    AC9 (decimal operand):
    ```js
    expect(evaluate('2.5 * 4')).toBe(10);
    ```
  - |
    AC10 (division by literal zero):
    ```js
    expect(() => evaluate('5 / 0')).toThrow(DivisionByZeroError);
    ```
  - |
    AC11 (trailing operator / missing operand):
    ```js
    expect(() => evaluate('3 +')).toThrow(InvalidExpressionError);
    expect(() => evaluate('3 +')).toThrow(/missing operand/i);
    ```
  - |
    AC12 (consecutive operators):
    ```js
    expect(() => evaluate('3 + * 2')).toThrow(InvalidExpressionError);
    expect(() => evaluate('3 + * 2')).toThrow(/consecutive operator/i);
    ```
  - |
    AC13 (overflow degrades to Infinity instead of throwing):
    ```js
    expect(evaluate('1e308 * 10')).toBe(Infinity);
    ```
assumptions_or_open_questions:
  - "Operators are the ASCII `+ - * /` characters shown in the ACs, not the Unicode `×`/`÷` glyphs used by the on-screen keypad in public/js/calculator.js — this story's evaluation logic is independent of that input surface per the stated scope."
  - "Unary minus is only recognized as the very first token of the whole expression, since the ACs give no example of unary minus appearing elsewhere and parentheses (the usual other unary position) are explicitly out of scope."
  - "Whitespace between tokens is optional and ignored by the tokenizer (ACs show spaced expressions like '2 + 3 * 4'); this is not itself asserted by a dedicated AC but is required for every AC's literal input to parse at all."
  - "No AC requires rejecting trailing garbage after a complete expression or a fully empty expression string; the parser naturally throws InvalidExpressionError in both cases as a byproduct of the recursive-descent structure, but no test is written specifically for them since no AC calls for it."
package_dependencies: []
notes: |
  Skipping the mermaid diagram: this plan adds exactly two new files (one module, one test file)
  and touches nothing else — no existing module, route, or layer boundary is modified.

  Research findings:
  - `src/calc/engine.js` already implements a superset grammar (`+ - * / ^ ()` plus `pi`/`e`
    constants) with error classes `MalformedExpressionError` / `DivideByZeroError` /
    `OverflowError`, and its own test suite `test/calc-engine.test.js` asserting that overflow
    (`10 ^ 1000`) throws `OverflowError`. That contradicts this story's AC13 (overflow must
    return `Infinity`, not throw), so that module cannot be reused/extended for this story.
  - `public/js/calculator.js` implements keypad-facing evaluation over `×`/`÷` glyphs, caps
    results at `OVERFLOW_LIMIT = 1e15` (throwing a `{ type: 'overflow' }` plain object, not an
    Error subclass), and its own test suite `test/calculator.test.js` asserts that cap. Also not
    reusable here for the same reason, plus this story is explicitly logic-only (no UI/input
    surface).
  - No design file exists for TEST-M1-STORY-186 under `.arc/designs/`, consistent with this
    story being UI-free per its stated scope.
review_focus: |
  Scope is evaluation logic only: `+ - * /` with BODMAS precedence and a single leading unary
  minus — no parentheses, exponentiation, constants, or any DOM/keypad wiring, even though two
  other calculator modules already exist in this repo with overlapping-looking behavior. Treat
  the new `src/calc/basicEvaluator.js` as intentionally separate from `src/calc/engine.js` and
  `public/js/calculator.js` rather than a missed reuse opportunity — this story's error types
  (`DivisionByZeroError`/`InvalidExpressionError`) and its overflow-to-`Infinity` behavior (AC13)
  directly conflict with both existing modules' tested behavior. The riskiest area is the unary
  minus / consecutive-operator parsing in `parseFactor`: confirm a leading `-` is accepted only
  at the very first token and that any other operator found where an operand is expected raises
  `InvalidExpressionError` rather than silently misparsing.
