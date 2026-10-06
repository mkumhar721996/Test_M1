summary: |
  Implement the basic on-screen calculator keypad and live display described in
  TEST-M1-STORY-183, matching the approved prototype at
  `.arc/designs/TEST-M1-STORY-183-design.html`. The design shows the calculator as a
  modal launched from an "Open calculator" button next to the Amount field on the
  existing "Log a new expense" create-expense flow (`public/index.html` /
  `public/js/expenses.js`) — there is no other route to a calculator anywhere in this
  product yet, so that is the one concrete, already-approved place this component is
  wired in. The work splits into (1) a pure, DOM-free arithmetic/state module
  (`public/js/calculator.js`) standing in for the "Calculation Engine" referenced by
  the acceptance criteria — no such engine exists anywhere else in this codebase
  (confirmed by searching the tree), so this plan implements the minimal
  order-of-operations evaluator and divide-by-zero/overflow/syntax/domain error
  classification the ACs require, mirrored line-for-line from the design's own
  embedded reference evaluator (`.arc/designs/TEST-M1-STORY-183-design.html` lines
  1027-1224); and (2) DOM wiring in that same module that renders the
  expression/result/error display, the 17-button keypad, and a screen-reader live
  region into new static markup added to `public/index.html`, styled by a new
  `public/css/calculator.css` plus faithful extensions to `public/css/expenses.css`
  for the launcher row (reusing the design's own `.amount-input-wrap`/
  `.amount-input-inner`/`.calc-launch-btn` class names rather than inventing new
  ones). Scientific buttons, percentage/sign-toggle/memory keys, and
  physical-keyboard entry are explicitly out of scope per the work item.
scope:
  - description: |
      Add the pure, DOM-free arithmetic and keypad-state logic to a new
      `public/js/calculator.js` module — this is the stand-in "Calculation Engine"
      surface the rest of the module calls into. Mirrors the design's embedded
      reference evaluator exactly: × and ÷ resolved left-to-right before + and −, a
      strict `evaluate` used by "=" that throws on a dangling operator, and a lenient
      `previewEvaluate` used for the live result that trims a trailing operator
      instead of erroring while the user is still typing.

      Exported shape:
      ```js
      const OPERATORS = ['+', '-', '×', '÷'];
      function isOperator(ch) { /* ... */ }
      function currentSegment(expr) { /* text since the last operator */ }
      function evaluate(expr) { /* throws { type: 'syntax'|'divide-zero'|'overflow' }; returns number */ }
      function previewEvaluate(expr) { /* returns number|null; throws same shape as evaluate */ }
      function formatNumber(n) { /* rounds to 1e-9 and stringifies */ }
      const ERROR_MESSAGES = {
        'divide-zero': 'Divide by Zero',
        'overflow': 'Overflow',
        'syntax': 'Syntax Error',
        'domain': 'Domain Error',
      };
      function createInitialState() {
        return { expression: '', finalized: false, finalizedValue: null, forcedSyntaxError: false };
      }
      function pressKey(state, key) { /* returns a new state; no DOM access */ }
      ```
      `pressKey` implements: digit/operator append (AC1); operator-stacking replaces
      the trailing operator rather than appending a second one (e.g. `'12+'` then `'×'`
      becomes `'12×'`); a leading operator on an empty expression is ignored (no
      sign-toggle in this story's scope); `.` is ignored when `currentSegment(expression)`
      already contains one (AC11) and seeds `'0.'` when starting from an empty
      expression or a fresh segment after an operator; `clear` resets to
      `createInitialState()` (AC3); `equals` either finalizes
      (`finalized: true, finalizedValue`) or sets `forcedSyntaxError: true` when the
      expression is empty or ends on an operator (AC4, AC8's Syntax Error case); and
      pressing a digit, operator, or `.` right after a finalized result starts a new
      expression from that finalized value rather than concatenating onto it (digit
      replaces entirely, operator appends to `formatNumber(finalizedValue)`, `.`
      resets to `'0.'`) — mirroring the design's own `if (calcState.finalized) { ... }`
      branches in each of its three key-handling paths. `pressKey` never truncates or
      caps `expression` length, so AC7 (continued input past the display's width)
      falls out of the reducer having no length limit at all.
    files:
      - public/js/calculator.js
    rationale: |
      No "Calculation Engine" module or service exists anywhere in this repo today
      (confirmed by grepping the tree) — the ACs' divide-by-zero/overflow/syntax/domain
      error vocabulary and order-of-operations rule are only specified concretely in
      the prototype's own embedded evaluator, so this plan implements that logic as an
      isolated, pure module. Keeping it DOM-free makes ACs 2/4/8/9/11 testable as plain
      function calls, and isolates the one place a future dedicated Calculation Engine
      story would need to change. The design's own evaluator mutates a module-level
      `calcState` object directly inside `pressKey(key)`; this plan reshapes that into
      a pure `pressKey(state, key) -> newState` reducer purely for unit-testability —
      the visual behavior and every branch of logic is otherwise unchanged from the
      design's script.

  - description: |
      Add DOM rendering and event wiring to the same `public/js/calculator.js` module:
      a `fitExpressionFontSize(el, sizes)` helper and an `initCalculatorApp(doc)`
      self-mounting entry point (same self-mount convention as
      `public/js/expenses.js`'s closing
      `if (typeof window !== 'undefined') { window.addEventListener('DOMContentLoaded', () => initExpensesApp()); }`).

      ```js
      const EXPR_SIZES = ['var(--calc-display-expr-size-max)', 'var(--calc-display-expr-size-mid)', 'var(--font-size-md)'];
      function fitExpressionFontSize(el, sizes) {
        let i = 0;
        el.style.fontSize = sizes[0];
        while (el.scrollWidth > el.clientWidth && i < sizes.length - 1) {
          i += 1;
          el.style.fontSize = sizes[i];
        }
        return sizes[i];
      }
      function initCalculatorApp(doc = document) { /* wires #open-calculator, .calc-key[data-key], #calc-close/#calc-cancel/#calc-use, Escape, overlay click */ }
      ```
      `initCalculatorApp` renders into the markup added to `public/index.html` in the
      next scope item: it sets `#calc-expression` textContent and calls
      `fitExpressionFontSize` on it after every key press (AC5), relies on that
      element's CSS (`overflow-x: hidden; white-space: nowrap; text-align: right`,
      added in the CSS scope item below) to keep the newest character visible once at
      minimum size (AC6), renders either the live/finalized result or a
      `.calc-error`-styled message in `#calc-result-row` depending on `pressKey`/
      `evaluate` output (AC2, AC4, AC8, AC9), and mirrors every change into
      `#calc-live-region` (`aria-live="polite"`, already present in the markup) via the
      same announcement strings the design uses: `"Expression …, result …"`,
      `"Display cleared"`, `"Error: …"`, `"Result …, finalized"` (AC13). Opening the
      modal resets to `createInitialState()` every time (matching the design's
      `openCalculator()`), so a previous session's expression never leaks into a fresh
      open. "Use this amount" writes `formatNumber(value)` into `#create-field-amount`
      and closes the modal; it is disabled whenever the display is blank or showing an
      error (mirrored from the design's `useBtnEl.disabled` toggling inside
      `renderCalculator`), and this plan applies the value immediately with no
      artificial delay — the design's 260ms "Applying…" button-text animation is a
      cosmetic flourish not required by any AC and is not carried over.
    files:
      - public/js/calculator.js
    rationale: |
      Keeping rendering in the same file as the pure engine (rather than a second
      module) matches this codebase's per-feature file convention (`expenses.js`,
      `rooms.js` each bundle their own store/validation and UI wiring in one file).
      Self-mounting independently of `expenses.js` — rather than having `expenses.js`
      import and call it — mirrors the existing `public/js/guest-inline-hook.js`
      precedent of a separate hook module that wires itself into page markup by
      element id, so this story's code never has to touch `expenses.js`'s create-modal
      lifecycle logic at all.

  - description: |
      Add the calculator's launcher button and modal markup to `public/index.html`,
      and link the new script/stylesheet.

      The current create-expense Amount field (`public/index.html` lines 165-172)
      wraps its `$` prefix and `#create-field-amount` input directly inside a bare
      `.amount-input-wrap`, with no inner wrapper or launcher. The design's own
      "Log a new expense" screen (design lines 698-710) instead makes
      `.amount-input-wrap` the flex row that holds a new `.amount-input-inner`
      (the relatively-positioned prefix+input pairing) alongside the
      `#open-calculator` button, plus a `.field-hint` paragraph underneath. This plan
      follows the design's structure and class names exactly rather than inventing a
      new wrapper class:
      ```html
      <div class="field">
        <label class="label" for="create-field-amount">Amount</label>
        <div class="amount-input-wrap">
          <div class="amount-input-inner">
            <span class="amount-prefix" aria-hidden="true">$</span>
            <input class="input amount-input" id="create-field-amount" name="amount" type="text" inputmode="decimal" placeholder="0.00" aria-describedby="create-error-amount create-amount-hint" />
          </div>
          <button type="button" class="calc-launch-btn" id="open-calculator" aria-haspopup="dialog" aria-controls="calculator-modal">
            <span aria-hidden="true">🧮</span> Open calculator
          </button>
        </div>
        <p class="field-hint" id="create-amount-hint">Opens a basic keypad — digits, + − × ÷, decimal, clear, equals.</p>
        <p class="field-error" id="create-error-amount" role="alert" hidden>⚠ Amount is required.</p>
      </div>
      ```
      (`aria-describedby` lists both the hint and the existing error paragraph, since
      the real product form — unlike the design's simplified standalone form — already
      has a validation-error paragraph on this field that must stay associated.)

      The edit-expense modal's amount field (`#field-amount`, lines 110-117) is left
      exactly as-is — it keeps the single-child `.amount-input-wrap` with no inner
      wrapper or launcher, since the design only shows the calculator reachable from
      the create flow. This still renders correctly once `.amount-input-wrap` becomes
      `display: flex` in the CSS scope item below, because a lone flex child with
      `width: 100%` from `.input` behaves the same as the current non-flex layout.

      Then add the calculator modal itself (own overlay/wrap ids, following the
      existing create/edit modal pattern of each modal owning independent ids), copied
      from the design's `#calculator-overlay`/`#calculator-modal-wrap` block (design
      lines 722-782) verbatim for the structural parts that satisfy the ACs:
      `role="dialog" aria-modal="true"`, the `.calc-display` with `#calc-expression`
      and `#calc-result-row`/`#calc-result`, the `aria-live="polite"`
      `#calc-live-region` (`sr-only`), the `.calc-keypad` with exactly the 17
      `.calc-key[data-key]` buttons in the design's order/labels (`clear`→C, `÷`,
      `7` `8` `9`, `×`, `4` `5` `6`, `-`, `1` `2` `3`, `+`, `0` (span-2), `.`,
      `equals`→=), and the Cancel/"Use this amount" actions. The design's
      "Jump to error" demo-only panel (design lines 767-775) and its separate
      non-interactive "Reference States" screen (design lines 787-1022) are reviewer
      aids only (explicitly labelled as such in the prototype) and are not carried
      into the shipped markup.

      Link the new assets:
      ```html
      <link rel="stylesheet" href="./css/calculator.css" />
      <script src="./js/calculator.js" defer></script>
      ```
    files:
      - public/index.html
    rationale: |
      Building this as static markup that `calculator.js` queries by id (rather than
      template-injecting it from JS) matches the convention `expenses.js`/`rooms.js`
      already use for their own modals, and keeps the markup's structure directly
      diffable against the approved design. Scoping the launcher to the create flow
      only avoids speculatively touching the edit-expense modal, which the design
      never shows with a calculator. Reusing the design's exact class names
      (`.amount-input-wrap`/`.amount-input-inner`) instead of a new
      `.amount-field-row` keeps the CSS in step 4 a faithful, line-for-line copy of
      the approved design rather than a paraphrase of it.

  - description: |
      Add `public/css/calculator.css` for the display and keypad, and extend
      `public/css/expenses.css` for the new launcher row — both copied from the
      design's embedded `<style>` block (lines 338-526), which is itself built from
      `design-system/tokens.css` plus three new non-token custom properties the design
      proposes (its own comment, lines 338-346, flags these as a design-system gap:
      tokens.json has no "hero" numeric size or an expression size above
      `--font-size-lg`, so these are defined locally rather than added to the
      generated `tokens.css`/`tokens.json`):
      ```css
      :root {
        --calc-display-result-size: 2.25rem;
        --calc-display-expr-size-max: 1.75rem;
        --calc-display-expr-size-mid: 1.375rem;
      }
      .calc-expression {
        width: 100%; overflow-x: hidden; white-space: nowrap; text-align: right;
        direction: ltr; font-size: var(--calc-display-expr-size-max);
        transition: font-size 180ms ease-out;
      }
      .calc-key {
        min-height: 44px; /* AC12 */
        min-width: 44px;
        height: 58px;
      }
      ```
      Carry over `.calc-display`, `.calc-expression`, `.calc-result-row`,
      `.calc-result`/`.calc-result.is-preview`, `.calc-error`/`.calc-error-icon`,
      `.calc-keypad`, `.calc-key` and its `.op`/`.clear`/`.equals`/`.span-2` variants,
      and `.sr-only` into `calculator.css` unchanged from the design. The design's
      `.calc-result-label` rule (line 438) is not referenced by any element in the
      shipped markup (it only ever appears in the design's unused CSS, not in any
      HTML the interactive screen renders), so it is intentionally left out rather
      than copied dead.

      In `expenses.css`, replace the current single-purpose `.amount-input-wrap {
      position: relative; }` rule (line 157) with the design's flex-row version and
      add the new `.amount-input-inner`/`.calc-launch-btn`/`.field-hint` rules,
      copied verbatim from the design (lines 367-396):
      ```css
      .amount-input-wrap { position: relative; display: flex; gap: var(--space-2); align-items: stretch; }
      .amount-input-inner { position: relative; flex: 1; }
      .calc-launch-btn {
        flex: 0 0 auto; display: inline-flex; align-items: center; gap: var(--space-2);
        min-height: 44px; padding: 0 var(--space-3);
        background: var(--button-secondary-background); color: var(--button-secondary-foreground);
        border: 1px solid var(--button-secondary-border); border-radius: var(--button-primary-radius);
        font-family: var(--font-family-base); font-size: var(--font-size-sm); font-weight: var(--font-weight-bold);
        cursor: pointer;
      }
      .calc-launch-btn:hover { background: var(--color-surface); }
      .field-hint { font-family: var(--font-family-base); font-size: var(--font-size-sm); color: var(--color-fg-muted); margin: var(--space-1) 0 0 0; }
      ```
      The existing `.amount-prefix`/`.amount-input` rules are untouched; they continue
      to apply unchanged to both the edit modal's lone input and the create modal's
      `.amount-input-inner`-wrapped input.
    files:
      - public/css/calculator.css
      - public/css/expenses.css
    rationale: |
      `tokens.css` is marked "Do not edit directly, this file was auto-generated.", so
      the three new sizing values are added as local, non-token custom properties
      exactly the way the design's own comment proposes, rather than by editing the
      generated token files. Redefining `.amount-input-wrap` in place (rather than
      adding a second, differently-named wrapper class) keeps the edit-expense modal
      and the create-expense modal sharing one rule, exactly as the design intends —
      verified safe because the edit modal has only one flex child, so `display: flex`
      changes nothing about its rendered layout.
tests:
  - |
    AC1/engine — `pressKey` appends tapped digits/operators to `expression` in order:
    ```js
    let state = createInitialState();
    state = pressKey(state, '1');
    state = pressKey(state, '2');
    state = pressKey(state, '+');
    state = pressKey(state, '8');
    expect(state.expression).toBe('12+8');
    ```
  - |
    AC1/UI — tapping keys on the rendered keypad appends to the visible expression line
    (test file carries the standard `/** @jest-environment jsdom */` pragma, loads
    `public/index.html` via `fs.readFileSync` into `document.documentElement.innerHTML`,
    then `require('../public/js/calculator').initCalculatorApp(document)`, matching
    `test/expenses-create.test.js`'s existing harness):
    ```js
    document.getElementById('open-calculator').click();
    ['1', '2', '+', '8'].forEach((k) => document.querySelector(`.calc-key[data-key="${k}"]`).click());
    expect(document.getElementById('calc-expression').textContent).toBe('12+8');
    ```
  - |
    AC2/engine — `previewEvaluate` resolves × and ÷ before + and −, and trims a
    trailing operator rather than throwing while the user is mid-type:
    ```js
    expect(previewEvaluate('12+8×3')).toBe(36);
    expect(previewEvaluate('12+8×3×')).toBe(36); // trailing operator trimmed for the live preview
    expect(previewEvaluate('')).toBeNull();
    ```
  - |
    AC2/UI — the result line updates live, before "=" is tapped, showing the preview style:
    ```js
    ['1', '2', '+', '8', '×', '3'].forEach((k) => document.querySelector(`.calc-key[data-key="${k}"]`).click());
    const result = document.querySelector('#calc-result-row .calc-result');
    expect(result.textContent).toBe('36');
    expect(result.classList.contains('is-preview')).toBe(true);
    ```
  - |
    AC3 — tapping clear resets the expression and result to empty and announces it:
    ```js
    ['1', '2', '+', '8'].forEach((k) => document.querySelector(`.calc-key[data-key="${k}"]`).click());
    document.querySelector('.calc-key[data-key="clear"]').click();
    expect(document.getElementById('calc-expression').textContent).toBe('');
    expect(document.querySelector('#calc-result-row .calc-result').textContent).toBe('');
    expect(document.getElementById('calc-live-region').textContent).toBe('Display cleared');
    ```
  - |
    AC4 — tapping equals finalizes the result (bold, not `.is-preview`):
    ```js
    ['1', '2', '+', '8', '×', '3', 'equals'].forEach((k) => document.querySelector(`.calc-key[data-key="${k}"]`).click());
    const result = document.querySelector('#calc-result-row .calc-result');
    expect(result.textContent).toBe('36');
    expect(result.classList.contains('is-preview')).toBe(false);
    ```
  - |
    AC4 edge case/engine — typing a digit, operator, or decimal right after a finalized
    result starts fresh from that value instead of concatenating onto it:
    ```js
    let state = createInitialState();
    ['1', '2', '+', '8', 'equals'].forEach((k) => { state = pressKey(state, k); });
    expect(state.finalized).toBe(true);
    let afterDigit = pressKey(state, '5');
    expect(afterDigit.expression).toBe('5');
    expect(afterDigit.finalized).toBe(false);
    let afterOp = pressKey(state, '+');
    expect(afterOp.expression).toBe('20+');
    let afterDecimal = pressKey(state, '.');
    expect(afterDecimal.expression).toBe('0.');
    ```
  - |
    Edge case/engine — a leading operator on an empty expression is ignored (no
    sign-toggle in this story's scope), and operator-stacking replaces the trailing
    operator rather than appending a second one:
    ```js
    let state = createInitialState();
    state = pressKey(state, '+');
    expect(state.expression).toBe('');
    state = pressKey(state, '1');
    state = pressKey(state, '2');
    state = pressKey(state, '+');
    state = pressKey(state, '×');
    expect(state.expression).toBe('12×');
    ```
  - |
    AC5/engine — `fitExpressionFontSize` steps through sizes progressively as the
    (mocked) rendered width exceeds the element's width, stopping at the last size,
    and never shrinks past the first size when the text already fits:
    ```js
    const el = document.createElement('div');
    const widthBySize = { 'max': 400, 'mid': 250, 'min': 180 };
    const sizes = ['max', 'mid', 'min'];
    Object.defineProperty(el, 'clientWidth', { value: 200, configurable: true });
    Object.defineProperty(el, 'scrollWidth', { get() { return widthBySize[el.style.fontSize]; }, configurable: true });
    expect(fitExpressionFontSize(el, sizes)).toBe('min');
    expect(el.style.fontSize).toBe('min');

    const fitsEl = document.createElement('div');
    Object.defineProperty(fitsEl, 'clientWidth', { value: 400, configurable: true });
    Object.defineProperty(fitsEl, 'scrollWidth', { value: 100, configurable: true });
    expect(fitExpressionFontSize(fitsEl, sizes)).toBe('max');
    ```
  - |
    AC6 — `.calc-expression`'s CSS keeps the newest character visible at minimum size
    without any JS-driven scrolling — asserted against the stylesheet source directly,
    since jsdom does not apply linked stylesheets to compute real layout/overflow:
    ```js
    const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'css', 'calculator.css'), 'utf8');
    const rule = css.match(/\.calc-expression\s*\{[^}]*\}/)[0];
    expect(rule).toMatch(/overflow-x:\s*hidden/);
    expect(rule).toMatch(/white-space:\s*nowrap/);
    expect(rule).toMatch(/text-align:\s*right/);
    ```
  - |
    AC7 — `pressKey` never caps expression length, so both a digit tap and an operator
    tap are still accepted and appended once the expression is already far longer than
    any display could show at minimum font size:
    ```js
    let state = createInitialState();
    const longDigits = '1234567890123456789012345678901234567890';
    for (const ch of longDigits) state = pressKey(state, ch);
    let afterDigit = pressKey(state, '1');
    expect(afterDigit.expression).toBe(longDigits + '1');
    let afterOp = pressKey(state, '+');
    expect(afterOp.expression).toBe(longDigits + '+');
    ```
  - |
    AC8/engine — `evaluate` classifies each named error exactly, including malformed
    expressions that can't arise from `pressKey` but are part of the evaluator's own
    contract:
    ```js
    expect(() => evaluate('5÷0')).toThrow(expect.objectContaining({ type: 'divide-zero' }));
    expect(() => evaluate('99999999999999×99999999999999')).toThrow(expect.objectContaining({ type: 'overflow' }));
    expect(() => evaluate('12+')).toThrow(expect.objectContaining({ type: 'syntax' }));
    expect(() => evaluate('')).toThrow(expect.objectContaining({ type: 'syntax' }));
    expect(() => evaluate('12..3')).toThrow(expect.objectContaining({ type: 'syntax' }));
    expect(ERROR_MESSAGES['divide-zero']).toBe('Divide by Zero');
    expect(ERROR_MESSAGES.overflow).toBe('Overflow');
    expect(ERROR_MESSAGES.syntax).toBe('Syntax Error');
    expect(ERROR_MESSAGES.domain).toBe('Domain Error');
    ```
  - |
    AC8/UI — a divide-by-zero expression shows "Divide by Zero" in place of the result,
    and an incomplete expression closed with "=" shows "Syntax Error":
    ```js
    ['5', '÷', '0'].forEach((k) => document.querySelector(`.calc-key[data-key="${k}"]`).click());
    expect(document.querySelector('.calc-error').textContent).toMatch(/Divide by Zero/);
    document.querySelector('.calc-key[data-key="clear"]').click();
    ['1', '2', '+', 'equals'].forEach((k) => document.querySelector(`.calc-key[data-key="${k}"]`).click());
    expect(document.querySelector('.calc-error').textContent).toMatch(/Syntax Error/);
    ```
  - |
    AC8/UI edge case — "Use this amount" is disabled and inert while an error is shown,
    so it's impossible to apply an invalid value to the Amount field:
    ```js
    ['5', '÷', '0'].forEach((k) => document.querySelector(`.calc-key[data-key="${k}"]`).click());
    expect(document.getElementById('calc-use').disabled).toBe(true);
    document.getElementById('create-field-amount').value = '';
    document.getElementById('calc-use').click();
    expect(document.getElementById('create-field-amount').value).toBe('');
    ```
  - |
    AC9 — tapping clear, or continuing to type after an error, recovers the normal
    expression/result display:
    ```js
    ['5', '÷', '0'].forEach((k) => document.querySelector(`.calc-key[data-key="${k}"]`).click());
    document.querySelector('.calc-key[data-key="5"]').click();
    expect(document.getElementById('calc-expression').textContent).toBe('5÷05');
    expect(document.querySelector('.calc-error')).toBeNull();
    expect(document.querySelector('#calc-result-row .calc-result').textContent).toBe('1');
    ```
  - |
    AC10 — the keypad renders exactly the 17 approved buttons — digits 0-9, `.`, the
    four operators, clear, and equals — and nothing else (no %, ±, or memory keys):
    ```js
    const keys = Array.from(document.querySelectorAll('#calculator-modal .calc-keypad .calc-key'))
      .map((b) => b.dataset.key);
    expect(keys).toEqual(['clear', '÷', '7', '8', '9', '×', '4', '5', '6', '-', '1', '2', '3', '+', '0', '.', 'equals']);
    expect(keys).not.toEqual(expect.arrayContaining(['%', '±', 'M+', 'M-', 'MR']));
    ```
  - |
    AC11 — a repeated decimal point within the same number segment is ignored, a new
    segment after an operator accepts a new decimal point, and a decimal point as the
    very first keypress on an empty expression seeds a leading zero:
    ```js
    let state = createInitialState();
    ['3', '.', '1', '4', '.'].forEach((k) => { state = pressKey(state, k); });
    expect(state.expression).toBe('3.14');
    state = pressKey(state, '+');
    state = pressKey(state, '.');
    expect(state.expression).toBe('3.14+0.');

    expect(pressKey(createInitialState(), '.').expression).toBe('0.');
    ```
  - |
    AC12 — every `.calc-key` renders at least a 44×44pt touch target — asserted against
    the stylesheet source, since jsdom does not compute real box metrics for linked
    stylesheets:
    ```js
    const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'css', 'calculator.css'), 'utf8');
    const rule = css.match(/\.calc-key\s*\{[^}]*\}/)[0];
    expect(rule).toMatch(/min-height:\s*44px/);
    expect(rule).toMatch(/min-width:\s*44px/);
    ```
  - |
    AC13 — the live region is `aria-live="polite"` and mirrors expression/result/error/
    clear/finalize changes:
    ```js
    expect(document.getElementById('calc-live-region').getAttribute('aria-live')).toBe('polite');
    ['1', '2', '+', '8'].forEach((k) => document.querySelector(`.calc-key[data-key="${k}"]`).click());
    expect(document.getElementById('calc-live-region').textContent).toBe('Expression 12+8, result 20');
    document.querySelector('.calc-key[data-key="equals"]').click();
    expect(document.getElementById('calc-live-region').textContent).toBe('Result 20, finalized');
    document.querySelector('.calc-key[data-key="clear"]').click();
    expect(document.getElementById('calc-live-region').textContent).toBe('Display cleared');
    ```
  - |
    Integration — "Use this amount" writes the current value into the expense form's
    Amount field and closes the calculator modal:
    ```js
    ['2', '4', '.', '5'].forEach((k) => document.querySelector(`.calc-key[data-key="${k}"]`).click());
    document.getElementById('calc-use').click();
    expect(document.getElementById('create-field-amount').value).toBe('24.5');
    expect(document.getElementById('calculator-modal-wrap').hidden).toBe(true);
    ```
  - |
    Integration/edge case — reopening the calculator always starts from a blank
    display, even if a prior session was left mid-expression (no state leaks across
    opens), and both Escape and clicking the overlay close it without applying a value:
    ```js
    document.getElementById('open-calculator').click();
    ['1', '2', '3'].forEach((k) => document.querySelector(`.calc-key[data-key="${k}"]`).click());
    document.getElementById('calc-cancel').click();
    expect(document.getElementById('calculator-modal-wrap').hidden).toBe(true);
    document.getElementById('open-calculator').click();
    expect(document.getElementById('calc-expression').textContent).toBe('');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(document.getElementById('calculator-modal-wrap').hidden).toBe(true);

    document.getElementById('open-calculator').click();
    document.getElementById('calculator-overlay').click();
    expect(document.getElementById('calculator-modal-wrap').hidden).toBe(true);
    ```
assumptions_or_open_questions:
  - |
    No "Calculation Engine" module, service, or API exists anywhere in this codebase
    today (confirmed by searching the whole tree). This plan therefore implements the
    minimal evaluation logic the ACs require as a local, pure module
    (`public/js/calculator.js`), mirroring the design's own embedded reference
    evaluator. If a separate Calculation Engine component is introduced by a later
    story, this module's exported function signatures (`evaluate`, `previewEvaluate`,
    `ERROR_MESSAGES`) are the seam it would replace.
  - |
    "Domain Error" is included in `ERROR_MESSAGES` for completeness per AC8's four
    named errors, but — exactly as the design's own "Reference States" screen notes —
    it is not reachable through this story's digit/+/-/×/÷-only keypad (it needs a
    scientific function like √ of a negative number). No test exercises reaching it
    through the UI; only the message-mapping itself is tested.
  - |
    The calculator is wired to the create-expense modal's Amount field only (the one
    screen the design shows), not the edit-expense modal, since no AC or design
    screen calls for the latter.
  - |
    The design's "Jump to error" demo buttons and its second, non-interactive
    "Reference States" screen are explicitly labelled in the prototype as reviewer/
    demo-only aids and are not part of the shipped markup this plan adds.
  - |
    "Use this amount" applies the value immediately with no artificial delay, unlike
    the prototype's 260ms "Applying…" animation — that delay isn't required by any AC.
  - |
    jsdom does not run a real layout engine, so `scrollWidth`/`clientWidth` are always
    0 on real elements. AC5's progressive font-shrink and AC12's 44×44pt touch target
    are therefore verified either via a detached element with those properties
    overridden by `Object.defineProperty` (AC5), or by asserting the literal CSS
    declaration exists in the stylesheet source (AC12, and the overflow/alignment
    rules backing AC6).
  - |
    `.amount-input-wrap` is redefined from `position: relative` to a flex row (per the
    design) and is shared by both the create and edit expense modals today. This is
    verified safe for the edit modal because it has only one child inside that wrapper
    (no inner wrapper, no button), so flex layout renders it identically to the
    current non-flex layout — but this is a cross-cutting CSS change worth a reviewer's
    explicit sign-off since it touches a rule the edit modal also depends on.
package_dependencies: []
review_focus: |
  In scope: the keypad (17 buttons, no %/±/memory/scientific/keyboard entry), the live
  expression+result display with progressive font-shrink and clip-at-minimum behavior,
  the four named error states and recovery from them, the decimal-point-per-segment
  rule (including the leading-decimal and post-finalize edge cases), operator-stacking
  and leading-operator-on-empty behavior, the 44×44pt touch targets, and the
  screen-reader live region — all wired through a new, self-contained
  `public/js/calculator.js` reached only from the create-expense modal's Amount field.
  Out of scope and should not be flagged as missing: a real backend Calculation Engine
  (none exists in this repo; this plan's evaluator is a deliberate stand-in), the
  edit-expense modal, keyboard/physical-key entry, and the design's demo-only
  "Jump to error" shortcuts/"Reference States" screen. Two things a reviewer should
  treat as deliberate rather than a gap: (1) AC5/AC6/AC7 (font-shrink + horizontal
  clipping) — jsdom can't run real layout, so the shrink logic is tested against a
  detached element with `scrollWidth`/`clientWidth` overridden rather than true
  rendering, and the scroll-to-newest-character behavior is CSS-only and verified by
  reading the stylesheet source, not by observing real clipping; (2) redefining the
  shared `.amount-input-wrap` rule in `expenses.css` to a flex row, which also affects
  the edit-expense modal's (unchanged) markup — verified harmless because that modal
  has only one child in the wrapper, but it's a cross-cutting rule change worth
  double-checking visually rather than assuming from the diff alone.
notes: |
  This story has no backend/route component — `public/index.html` has no
  server-rendered counterpart in `src/` (unlike `rooms`/`guests`/`hires`, which have
  both `src/<feature>/{routes,store}.js` and a `public/` UI), so this plan is entirely
  client-side, consistent with how `public/js/expenses.js` and
  `public/js/guest-inline-hook.js` already work (localStorage-backed, no server
  calls). Test harness conventions (confirmed by reading `test/expenses-create.test.js`
  and `package.json`): Jest + `jest-environment-jsdom`, a `/** @jest-environment jsdom */`
  pragma at the top of the test file, `public/index.html` loaded via
  `fs.readFileSync(...)` into `document.documentElement.innerHTML`, and the module
  required via CommonJS (`require('../public/js/calculator')`) with a trailing
  `module.exports = { ... }` plus a `typeof window !== 'undefined'` guarded
  `DOMContentLoaded` self-mount, exactly mirroring `public/js/expenses.js`'s own ending.

  ```mermaid
  flowchart TD
    classDef touched fill:#f96,color:#000
    classDef context fill:#eee,color:#000

    IndexHTML["public/index.html<br/>(launcher btn, calc modal markup)"]:::touched
    CalcJS["public/js/calculator.js<br/>(engine + pressKey + DOM wiring)"]:::touched
    CalcCSS["public/css/calculator.css<br/>(.calc-display/.calc-keypad)"]:::touched
    ExpCSS["public/css/expenses.css<br/>(.amount-input-wrap redefined,<br/>+.amount-input-inner/.calc-launch-btn)"]:::touched
    ExpJS["public/js/expenses.js<br/>(create + edit modal lifecycle,<br/>owns #create-field-amount validation)"]:::context

    IndexHTML -- "links/loads" --> CalcCSS
    IndexHTML -- "links/loads" --> CalcJS
    IndexHTML -- "already links" --> ExpJS
    IndexHTML -- "edit modal's .amount-input-wrap<br/>also restyled (1-child, safe)" --> ExpCSS
    CalcJS -- "self-mounts on DOMContentLoaded,<br/>queries #open-calculator / .calc-key by id" --> IndexHTML
    CalcJS -- "writes formatted value into<br/>#create-field-amount on 'Use this amount'" --> IndexHTML
    ExpJS -- "owns #create-field-amount's<br/>validation + save (untouched)" --> IndexHTML
  ```
