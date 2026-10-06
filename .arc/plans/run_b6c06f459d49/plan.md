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
  the acceptance criteria — no such engine exists anywhere else in this codebase, so
  this plan implements the minimal order-of-operations evaluator and
  divide-by-zero/overflow/syntax/domain error classification the ACs require, mirrored
  from the design's own embedded reference evaluator; and (2) DOM wiring in that same
  module that renders the expression/result/error display, the 17-button keypad, and a
  screen-reader live region into new static markup added to `public/index.html`, styled
  by a new `public/css/calculator.css` plus small additions to `public/css/expenses.css`
  for the launcher button. Scientific buttons, percentage/sign-toggle/memory keys, and
  physical-keyboard entry are explicitly out of scope per the work item.

scope:
  - description: |
      Add the pure, DOM-free arithmetic and keypad-state logic to a new
      `public/js/calculator.js` module — this is the stand-in "Calculation Engine"
      surface the rest of the module calls into. Mirrors the design's embedded
      reference evaluator (`.arc/designs/TEST-M1-STORY-183-design.html` lines
      1027–1096) exactly: × and ÷ resolved left-to-right before + and −, a strict
      `evaluate` used by "=" that throws on a dangling operator, and a lenient
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
      `pressKey` implements: digit/operator append (AC1), operator-stacking replaces the
      trailing operator rather than appending a second one, a leading operator on an
      empty expression is ignored (no sign-toggle in this story's scope), `.` is ignored
      when `currentSegment(expression)` already contains one (AC11) and seeds `0.` when
      starting a fresh segment, `clear` resets to `createInitialState()` (AC3), and
      `equals` either finalizes (`finalized: true, finalizedValue`) or sets
      `forcedSyntaxError: true` when the expression is empty or ends on an operator
      (AC4, AC8's Syntax Error case). `pressKey` never truncates or caps `expression`
      length, so AC7 (continued input past the display's width) falls out of the
      reducer having no length limit at all.
    files:
      - public/js/calculator.js
    rationale: |
      No "Calculation Engine" module or service exists anywhere in this repo today
      (confirmed by grepping the tree) — the ACs' divide-by-zero/overflow/syntax/domain
      error vocabulary and order-of-operations rule are only specified concretely in
      the prototype's own embedded evaluator, so this plan implements that logic as an
      isolated, pure module. Keeping it DOM-free makes ACs 2/4/8/9/11 testable as plain
      function calls, and isolates the one place a future dedicated Calculation Engine
      story would need to change.

  - description: |
      Add DOM rendering and event wiring to the same `public/js/calculator.js` module:
      a `fitExpressionFontSize(el, sizes)` helper and an `initCalculatorApp(doc)`
      self-mounting entry point (same self-mount convention as
      `public/js/expenses.js`'s closing `window.addEventListener('DOMContentLoaded', ...)`).

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
      `"Display cleared"`, `"Error: …"`, `"Result …, finalized"` (AC13). "Use this
      amount" writes `formatNumber(value)` into `#create-field-amount` and closes the
      modal; it is disabled whenever the display is blank or showing an error.
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

      In the existing create-expense form's Amount field block, wrap the current
      `.amount-input-wrap` (unchanged: `$` prefix + `#create-field-amount`) together
      with a new launcher button in a new `.amount-field-row`, and add a hint paragraph,
      matching the design's "Log a new expense" screen amount field exactly:
      ```html
      <div class="field">
        <label class="label" for="create-field-amount">Amount</label>
        <div class="amount-field-row">
          <div class="amount-input-wrap">
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
      The edit-expense modal's amount field is left exactly as-is (it keeps the bare
      `.amount-input-wrap` with no launcher) — the design only shows the calculator
      reachable from the create flow.

      Then add the calculator modal itself (own overlay/wrap ids, following the
      existing create/edit modal pattern of each modal owning independent ids), copied
      from the design's `#calculator-overlay`/`#calculator-modal-wrap` block
      (`.arc/designs/TEST-M1-STORY-183-design.html` lines 722–782) verbatim for the
      structural parts that satisfy the ACs: `role="dialog" aria-modal="true"`, the
      `.calc-display` with `#calc-expression` and `#calc-result-row`/`#calc-result`,
      the `aria-live="polite"` `#calc-live-region` (`sr-only`), the `.calc-keypad` with
      exactly the 17 `.calc-key[data-key]` buttons in the design's order/labels
      (`clear`→C, `÷`, `7` `8` `9`, `×`, `4` `5` `6`, `-`, `1` `2` `3`, `+`, `0`
      (span-2), `.`, `equals`→=), and the Cancel/"Use this amount" actions. The
      design's "Jump to error" demo-only panel and its separate non-interactive
      "Reference States" screen are reviewer aids only (explicitly labelled as such in
      the prototype) and are not carried into the shipped markup.

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
      never shows with a calculator.

  - description: |
      Add `public/css/calculator.css` for the display and keypad, and extend
      `public/css/expenses.css` for the new launcher row — both copied from the
      design's embedded `<style>` block (lines 338–526), which is itself built from
      `design-system/tokens.css` plus three new non-token custom properties the design
      proposes (its own comment, lines 338–346, flags these as a design-system gap:
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
      and `.sr-only` into `calculator.css` unchanged from the design.

      In `expenses.css`, add only the new launcher-row rules (the `.amount-input-wrap`/
      `.amount-prefix`/`.amount-input` rules already there are untouched since the
      edit modal still uses them as-is):
      ```css
      .amount-field-row { display: flex; gap: var(--space-2); align-items: stretch; }
      .amount-field-row .amount-input-wrap { position: relative; flex: 1; }
      .calc-launch-btn {
        flex: 0 0 auto; display: inline-flex; align-items: center; gap: var(--space-2);
        min-height: 44px; padding: 0 var(--space-3);
        background: var(--button-secondary-background); color: var(--button-secondary-foreground);
        border: 1px solid var(--button-secondary-border); border-radius: var(--button-primary-radius);
      }
      .field-hint { font-family: var(--font-family-base); font-size: var(--font-size-sm); color: var(--color-fg-muted); margin: var(--space-1) 0 0 0; }
      ```
    files:
      - public/css/calculator.css
      - public/css/expenses.css
    rationale: |
      `tokens.css` is marked "Do not edit directly, this file was auto-generated.", so
      the three new sizing values are added as local, non-token custom properties
      exactly the way the design's own comment proposes, rather than by editing the
      generated token files. Keeping the launcher-row CSS additive in `expenses.css`
      (new classes only, no edits to the existing `.amount-input-wrap` rule) avoids any
      risk of shifting the edit-expense modal's layout.

tests:
  - |
    AC1/engine: `pressKey` appends tapped digits/operators to `expression` in order.
    ```js
    let state = createInitialState();
    state = pressKey(state, '1');
    state = pressKey(state, '2');
    state = pressKey(state, '+');
    state = pressKey(state, '8');
    expect(state.expression).toBe('12+8');
    ```
  - |
    AC1/UI: tapping keys on the rendered keypad appends to the visible expression line.
    ```js
    document.getElementById('open-calculator').click();
    ['1', '2', '+', '8'].forEach((k) => document.querySelector(`.calc-key[data-key="${k}"]`).click());
    expect(document.getElementById('calc-expression').textContent).toBe('12+8');
    ```
  - |
    AC2/engine: `previewEvaluate` resolves × and ÷ before + and −.
    ```js
    expect(previewEvaluate('12+8×3')).toBe(36);
    expect(previewEvaluate('12+8×')).toBe(36); // trailing operator trimmed for the live preview
    ```
  - |
    AC2/UI: the result line updates live, before "=" is tapped, showing the preview style.
    ```js
    ['1', '2', '+', '8', '×', '3'].forEach((k) => document.querySelector(`.calc-key[data-key="${k}"]`).click());
    const result = document.querySelector('#calc-result-row .calc-result');
    expect(result.textContent).toBe('36');
    expect(result.classList.contains('is-preview')).toBe(true);
    ```
  - |
    AC3: tapping clear resets the expression and result to empty and announces it.
    ```js
    ['1', '2', '+', '8'].forEach((k) => document.querySelector(`.calc-key[data-key="${k}"]`).click());
    document.querySelector('.calc-key[data-key="clear"]').click();
    expect(document.getElementById('calc-expression').textContent).toBe('');
    expect(document.querySelector('#calc-result-row .calc-result').textContent).toBe('');
    expect(document.getElementById('calc-live-region').textContent).toBe('Display cleared');
    ```
  - |
    AC4: tapping equals finalizes the result (bold, not `.is-preview`).
    ```js
    ['1', '2', '+', '8', '×', '3', 'equals'].forEach((k) => document.querySelector(`.calc-key[data-key="${k}"]`).click());
    const result = document.querySelector('#calc-result-row .calc-result');
    expect(result.textContent).toBe('36');
    expect(result.classList.contains('is-preview')).toBe(false);
    ```
  - |
    AC5/engine: `fitExpressionFontSize` steps through sizes progressively as the
    (mocked) rendered width exceeds the element's width, stopping at the last size.
    ```js
    const el = document.createElement('div');
    const widthBySize = { 'max': 400, 'mid': 250, 'min': 180 };
    const sizes = ['max', 'mid', 'min'];
    Object.defineProperty(el, 'clientWidth', { value: 200, configurable: true });
    Object.defineProperty(el, 'scrollWidth', { get() { return widthBySize[el.style.fontSize]; }, configurable: true });
    expect(fitExpressionFontSize(el, sizes)).toBe('min');
    expect(el.style.fontSize).toBe('min');
    ```
  - |
    AC6: `.calc-expression`'s CSS keeps the newest character visible at minimum size
    without any JS-driven scrolling — asserted against the stylesheet source directly,
    since jsdom does not apply linked stylesheets to compute real layout/overflow.
    ```js
    const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'css', 'calculator.css'), 'utf8');
    const rule = css.match(/\.calc-expression\s*\{[^}]*\}/)[0];
    expect(rule).toMatch(/overflow-x:\s*hidden/);
    expect(rule).toMatch(/white-space:\s*nowrap/);
    expect(rule).toMatch(/text-align:\s*right/);
    ```
  - |
    AC7: `pressKey` never caps expression length, so a key tap is still accepted and
    appended once the expression is already far longer than any display could show
    at minimum font size.
    ```js
    let state = createInitialState();
    const longDigits = '1234567890123456789012345678901234567890';
    for (const ch of longDigits) state = pressKey(state, ch);
    state = pressKey(state, '1');
    expect(state.expression).toBe(longDigits + '1');
    ```
  - |
    AC8: `evaluate` classifies each named error exactly.
    ```js
    expect(() => evaluate('5÷0')).toThrow(expect.objectContaining({ type: 'divide-zero' }));
    expect(() => evaluate('99999999999999×99999999999999')).toThrow(expect.objectContaining({ type: 'overflow' }));
    expect(() => evaluate('12+')).toThrow(expect.objectContaining({ type: 'syntax' }));
    expect(ERROR_MESSAGES['divide-zero']).toBe('Divide by Zero');
    expect(ERROR_MESSAGES.overflow).toBe('Overflow');
    expect(ERROR_MESSAGES.syntax).toBe('Syntax Error');
    expect(ERROR_MESSAGES.domain).toBe('Domain Error');
    ```
  - |
    AC8/UI: a divide-by-zero expression shows "Divide by Zero" in place of the result,
    and an incomplete expression closed with "=" shows "Syntax Error".
    ```js
    ['5', '÷', '0'].forEach((k) => document.querySelector(`.calc-key[data-key="${k}"]`).click());
    expect(document.querySelector('.calc-error').textContent).toMatch(/Divide by Zero/);
    document.querySelector('.calc-key[data-key="clear"]').click();
    ['1', '2', '+', 'equals'].forEach((k) => document.querySelector(`.calc-key[data-key="${k}"]`).click());
    expect(document.querySelector('.calc-error').textContent).toMatch(/Syntax Error/);
    ```
  - |
    AC9: tapping clear, or continuing to type after an error, recovers the normal
    expression/result display.
    ```js
    ['5', '÷', '0'].forEach((k) => document.querySelector(`.calc-key[data-key="${k}"]`).click());
    document.querySelector('.calc-key[data-key="5"]').click();
    expect(document.getElementById('calc-expression').textContent).toBe('5÷05');
    expect(document.querySelector('.calc-error')).toBeNull();
    expect(document.querySelector('#calc-result-row .calc-result').textContent).toBe('1');
    ```
  - |
    AC10: the keypad renders exactly the 17 approved buttons — digits 0-9, `.`, the
    four operators, clear, and equals — and nothing else (no %, ±, or memory keys).
    ```js
    const keys = Array.from(document.querySelectorAll('#calculator-modal .calc-keypad .calc-key'))
      .map((b) => b.dataset.key);
    expect(keys).toEqual(['clear', '÷', '7', '8', '9', '×', '4', '5', '6', '-', '1', '2', '3', '+', '0', '.', 'equals']);
    expect(keys).not.toEqual(expect.arrayContaining(['%', '±', 'M+', 'M-', 'MR']));
    ```
  - |
    AC11: a repeated decimal point within the same number segment is ignored, but a
    new segment after an operator accepts a new decimal point.
    ```js
    let state = createInitialState();
    ['3', '.', '1', '4', '.'].forEach((k) => { state = pressKey(state, k); });
    expect(state.expression).toBe('3.14');
    state = pressKey(state, '+');
    state = pressKey(state, '.');
    expect(state.expression).toBe('3.14+0.');
    ```
  - |
    AC12: every `.calc-key` renders at least a 44×44pt touch target — asserted against
    the stylesheet source, since jsdom does not compute real box metrics for linked
    stylesheets.
    ```js
    const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'css', 'calculator.css'), 'utf8');
    const rule = css.match(/\.calc-key\s*\{[^}]*\}/)[0];
    expect(rule).toMatch(/min-height:\s*44px/);
    expect(rule).toMatch(/min-width:\s*44px/);
    ```
  - |
    AC13: the live region is `aria-live="polite"` and mirrors expression/result/error/
    clear/finalize changes.
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
    Integration: "Use this amount" writes the current value into the expense form's
    Amount field and closes the calculator modal.
    ```js
    ['2', '4', '.', '5'].forEach((k) => document.querySelector(`.calc-key[data-key="${k}"]`).click());
    document.getElementById('calc-use').click();
    expect(document.getElementById('create-field-amount').value).toBe('24.5');
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

package_dependencies: []

notes: |
  This story has no backend/route component — `public/index.html` has no
  server-rendered counterpart in `src/` (unlike `rooms`/`guests`/`hires`, which have
  both `src/<feature>/{routes,store}.js` and a `public/` UI), so this plan is entirely
  client-side, consistent with how `public/js/expenses.js` and
  `public/js/guest-inline-hook.js` already work (localStorage-backed, no server calls).

  ```mermaid
  flowchart TD
    classDef touched fill:#f96,color:#000
    classDef context fill:#eee,color:#000

    IndexHTML["public/index.html<br/>(launcher btn, calc modal markup)"]:::touched
    CalcJS["public/js/calculator.js<br/>(engine + pressKey + DOM wiring)"]:::touched
    CalcCSS["public/css/calculator.css<br/>(.calc-display/.calc-keypad)"]:::touched
    ExpCSS["public/css/expenses.css<br/>(+.amount-field-row/.calc-launch-btn)"]:::touched
    ExpJS["public/js/expenses.js<br/>(create-modal lifecycle)"]:::context

    IndexHTML -- "links/loads" --> CalcCSS
    IndexHTML -- "links/loads" --> CalcJS
    IndexHTML -- "already links" --> ExpJS
    IndexHTML -- "styles create-amount field" --> ExpCSS
    CalcJS -- "self-mounts on DOMContentLoaded,<br/>queries #open-calculator / .calc-key by id" --> IndexHTML
    CalcJS -- "writes formatted value into<br/>#create-field-amount on 'Use this amount'" --> IndexHTML
    ExpJS -- "owns #create-field-amount's<br/>validation + save (untouched)" --> IndexHTML
  ```

review_focus: |
  In scope: the keypad (17 buttons, no %/±/memory/scientific/keyboard entry), the live
  expression+result display with progressive font-shrink and clip-at-minimum behavior,
  the four named error states and recovery from them, the decimal-point-per-segment
  rule, the 44×44pt touch targets, and the screen-reader live region — all wired
  through a new, self-contained `public/js/calculator.js` reached only from the
  create-expense modal's Amount field. Out of scope and should not be flagged as
  missing: a real backend Calculation Engine (none exists in this repo; this plan's
  evaluator is a deliberate stand-in), the edit-expense modal, keyboard/physical-key
  entry, and the design's demo-only "Jump to error" shortcuts/"Reference States"
  screen. The riskiest area is AC5/AC6/AC7 (font-shrink + horizontal clipping): jsdom
  can't run real layout, so the shrink logic is tested against a detached element with
  `scrollWidth`/`clientWidth` overridden rather than true rendering, and the
  scroll-to-newest-character behavior is CSS-only (`overflow-x: hidden` +
  `text-align: right`) and verified by reading the stylesheet source rather than by
  observing real clipping — a reviewer should treat that as the deliberate limit of
  what an automated test can confirm here, not a gap to fill with more mocking.
