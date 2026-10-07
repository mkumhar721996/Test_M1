summary: |
  Adds a Basic/Scientific keypad layout toggle to the existing on-screen calculator
  (`public/index.html` + `public/js/calculator.js` + `public/css/calculator.css`, built in
  TEST-M1-STORY-183). A segmented control above the display switches which button grid is
  rendered: Scientific reveals a 14-button function section (sin, cos, tan, asin, acos, atan,
  log, ln, square, square root, exponent, factorial, π, e) above the existing basic grid; Basic
  shows only digits/decimal/operators/equals/clear/clear-entry. The toggle never touches the
  expression text itself — switching layouts mid-entry (e.g. with "sin(" on screen) leaves the
  display untouched. Scientific function keys insert their literal opening text only; actually
  evaluating them is explicitly out of scope per the work item ("does not change expression
  evaluation itself"), so `src/calc/engine.js` (which has no trig/log/factorial support today)
  is not touched — the result row instead shows an "Evaluated by Calculation Engine" placeholder
  whenever the expression contains a non-arithmetic token, matching the approved prototype.
  The toggle's state change is exposed to assistive tech via a dedicated `aria-live="polite"`
  region (independent of `aria-pressed`), and keyboard users can Tab/Shift+Tab through the
  toggle and every visible key, activating any of them with Enter/Space because they are all
  native `<button>` elements.

scope:
  - description: |
      Add the layout-toggle UI and the scientific button grid to the calculator modal markup in
      `public/index.html`, and split the single existing "C" (clear) button into separate
      "CE" (clear-entry) and "C" (clear) buttons in the basic grid (AC4's "clear/clear-entry
      keys" is plural — the approved design implements these as two distinct buttons, not one).

      Concrete elements to add, taken directly from the approved prototype
      (`.arc/designs/TEST-M1-STORY-184-design.html` lines 793-861):
      - A `.layout-toggle-row` above the display containing a `.layout-toggle[role=group]` with
        two buttons: `id="toggle-basic"` (`aria-pressed="true"` by default) and
        `id="toggle-scientific"` (`aria-pressed="false"`), both labelled via
        `aria-labelledby="layout-toggle-label"`.
      - A visually-hidden `<div class="sr-only" aria-live="polite" id="layout-live-region">`
        directly after the toggle row, separate from the existing `#calc-live-region`.
      - A `<div id="scientific-section" hidden>` placed between the display and the basic grid,
        containing `<p class="calc-section-label">Scientific functions</p>` and
        `<div class="calc-keypad scientific" role="group" aria-label="Scientific function keys"
        id="scientific-keys">` with exactly these 14 buttons, each `class="calc-key sci"` and a
        `data-token` (not `data-key`): `sin(` (sin), `cos(` (cos), `tan(` (tan), `log(` (log),
        `asin(` (sin⁻¹), `acos(` (cos⁻¹), `atan(` (tan⁻¹), `ln(` (ln), `^2` (x²), `√(` (√),
        `^` (xʸ), `!` (n!), `π` (π), `e` (e) — each with the `aria-label` shown in the design
        (e.g. `aria-label="Sine"`, `aria-label="Inverse sine"`, `aria-label="Factorial"`).
      - `<p class="calc-section-label" id="basic-section-label">Basic operations</p>` before the
        basic grid (hidden unless Scientific is active, matching the design's "only show section
        labels once there are two sections to distinguish").
      - The basic grid's clear button split: replace the current
        `<button class="calc-key clear span-3" data-key="clear">C</button>` with
        `<button class="calc-key clear" data-key="clear-entry" aria-label="Clear entry">CE</button>`
        followed by `<button class="calc-key clear span-2" data-key="clear">C</button>`.
      - `calc-subtitle` id added to the modal header's descriptive `<p>` so its text can be
        swapped per layout (design lines 787-789).
    files:
      - public/index.html
    rationale: |
      This is the only record of the approved design (no structured design doc exists), and it
      names every id, class, data attribute, and button inventory required by AC1, AC3, AC4 and
      AC7. Splitting "C" into CE/C is a deliberate scope decision driven by AC4's plural wording
      plus the design's explicit two-button implementation (see assumptions).

  - description: |
      Add the layout-toggle, scientific-grid, and clear-entry styling to
      `public/css/calculator.css` (currently only has basic-grid/display rules — see the file's
      existing `.calc-keypad`/`.calc-key` block). New rules, values taken verbatim from the
      design's embedded `<style>` (lines 420-457, 491-555), except the design's proposed
      `--touch-target-min` CSS variable is NOT introduced (see assumptions) — literal `44px` is
      used instead, matching this file's and `public/styles.css`'s existing convention.

      ```css
      .layout-toggle-row { display: flex; align-items: center; justify-content: space-between;
        gap: var(--space-3); flex-wrap: wrap; margin-bottom: var(--space-3); }
      .layout-toggle-label { font-family: var(--font-family-base); font-size: var(--font-size-sm);
        font-weight: var(--font-weight-bold); color: var(--color-fg-muted); }
      .layout-toggle { display: inline-flex; border: 1px solid var(--color-border);
        border-radius: var(--radius-md); overflow: hidden; }
      .layout-toggle-btn { min-height: 44px; padding: var(--space-2) var(--space-4);
        font-family: var(--font-family-base); font-size: var(--font-size-sm);
        font-weight: var(--font-weight-bold); background: var(--color-bg);
        color: var(--color-fg-muted); border: none; cursor: pointer; }
      .layout-toggle-btn + .layout-toggle-btn { border-left: 1px solid var(--color-border); }
      .layout-toggle-btn[aria-pressed="true"] { background: var(--button-primary-background);
        color: var(--button-primary-foreground); }
      .layout-toggle-btn:focus-visible { outline: 2px solid var(--color-primary);
        outline-offset: 2px; }
      .calc-result.is-engine { color: var(--color-fg-muted);
        font-weight: var(--font-weight-regular); font-style: italic; }
      .calc-section-label { font-family: var(--font-family-base); font-size: var(--font-size-sm);
        font-weight: var(--font-weight-bold); color: var(--color-fg-muted);
        text-transform: uppercase; letter-spacing: 0.03em;
        margin: var(--space-3) 0 var(--space-2) 0; }
      .calc-section-label:first-of-type { margin-top: 0; }
      .calc-keypad.scientific { margin-bottom: var(--space-3); }
      .calc-key.sci { height: 48px; font-size: var(--font-size-md); }
      ```
    files:
      - public/css/calculator.css
    rationale: |
      `.calc-key.sci` only overrides `height`/`font-size`; it inherits `.calc-key`'s existing
      `min-height: 44px; min-width: 44px;` so scientific keys clear AC6's touch-target floor
      without duplicating that rule (48px height is itself above the 44px floor regardless).

  - description: |
      Extend `public/js/calculator.js`'s pure state module and DOM wiring:

      1. Add a `clear-entry` branch to `pressKey` (deletes the last character; a full reset if
         already finalized or empty, matching the design's interactive behaviour):
         ```js
         if (key === 'clear-entry') {
           if (state.finalized || !state.expression) return createInitialState();
           return { ...state, expression: state.expression.slice(0, -1), forcedSyntaxError: false };
         }
         ```
      2. Add `hasScientificToken` and `appendToken` pure helpers (exported for testing):
         ```js
         const SCI_TOKEN_PATTERN = /[^0-9+\-×÷.]/;
         function hasScientificToken(expression) { return SCI_TOKEN_PATTERN.test(expression); }
         function appendToken(state, token) {
           return { ...state, expression: state.expression + token, finalized: false, forcedSyntaxError: false };
         }
         ```
      3. Make `pressKey`'s `equals` branch a no-op (return `state` unchanged) when
         `hasScientificToken(expression)` is true, so the basic arithmetic evaluator is never
         asked to parse a scientific token (out of scope — see summary).
      4. In `render()`, add an early branch: when `hasScientificToken(state.expression)` is true,
         set the result row to `calc-result is-engine` / "Evaluated by Calculation Engine",
         disable `useBtn`, and return before running the existing preview/error logic.
      5. Fix `getFocusableElements` to treat a `hidden` *ancestor* (not just the element itself)
         as not focusable — required for AC4/AC5 so the `hidden` `#scientific-section`'s buttons
         are excluded from Tab order while Basic is active (jsdom does not compute layout, so
         `offsetParent`/visibility tricks won't work; this needs an explicit ancestor walk):
         ```js
         function isVisible(el) {
           for (let node = el; node; node = node.parentElement) {
             if (node.hidden) return false;
           }
           return true;
         }
         // ...
         .filter(isVisible); // replaces .filter((el) => !el.hidden)
         ```
         Export `getFocusableElements` from the module (currently internal only) so tests can
         assert on Tab order directly.
      6. In `initCalculatorApp`, add a `setLayout(layout, { announce = true } = {})` function that
         toggles `aria-pressed` on both toggle buttons, sets `scientificSection.hidden` and
         `basicSectionLabel.hidden`, updates `calcSubtitleEl.textContent`, and (unless
         `announce: false`) writes the announcement to `#layout-live-region`:
         ```js
         layoutLiveRegionEl.textContent = layout === 'scientific'
           ? 'Scientific layout active. 14 additional function buttons are now available: sine, cosine, tangent, inverse sine, inverse cosine, inverse tangent, log, ln, exponent, square, square root, pi, e, and factorial.'
           : 'Basic layout active. Only digits, decimal point, the four arithmetic operators, equals, and clear are shown.';
         ```
         Wire `toggle-basic`/`toggle-scientific` clicks to `setLayout`; call
         `setLayout('basic', { announce: false })` inside `open()` so every modal open starts
         Basic without a spurious announcement.
      7. Scope the existing basic-key click-listener loop to
         `#calculator-modal .calc-keypad:not(.scientific) .calc-key` (currently matches
         `.calc-keypad .calc-key`, which would now incorrectly also match scientific buttons),
         and add a second loop over `#scientific-keys .calc-key` that calls
         `appendToken(btn.dataset.token)` and re-renders. For `equals` specifically, check
         `hasScientificToken` on the *pre-press* expression to choose the announcement:
         ```js
         btn.addEventListener('click', () => {
           const key = btn.dataset.key;
           const hadSciToken = hasScientificToken(state.expression);
           state = pressKey(state, key);
           render(key === 'equals' && hadSciToken ? 'Evaluated by the Calculation Engine'
             : key === 'clear' ? 'Display cleared' : undefined);
         });
         ```
    files:
      - public/js/calculator.js
    rationale: |
      Keeps the existing pure-state/DOM-wiring split used throughout this file (AC-numbered
      tests in `test/calculator.test.js` already exercise `pressKey`/`previewEvaluate` directly).
      Scientific tokens are inserted as literal text per the design and the story's explicit
      "does not change expression evaluation" boundary — no change to `src/calc/engine.js` or to
      the basic `evaluate`/`previewEvaluate` arithmetic.

  - description: |
      Update `test/calculator.test.js`: fix the pre-existing TEST-M1-STORY-183 "AC10 exactly the
      17 approved keys" assertion (now 18 keys, since `C` is split into `clear-entry` + `clear`),
      and add new tests for every acceptance criterion of this story (listed in `tests` below).
    files:
      - test/calculator.test.js
    rationale: |
      The clear/clear-entry split changes the basic grid's button count, so the existing
      AC10 list `['clear', '÷', '7', ...]` would otherwise fail for a reason unrelated to a real
      regression; updating it is a required, deliberate side-effect of this story's scope, not a
      design choice being hidden from review.

tests:
  - |
    AC1 — toggle switches which keypad is rendered:
    ```js
    expect(document.getElementById('scientific-section').hidden).toBe(true);
    document.getElementById('toggle-scientific').click();
    expect(document.getElementById('scientific-section').hidden).toBe(false);
    expect(document.getElementById('toggle-scientific').getAttribute('aria-pressed')).toBe('true');
    expect(document.getElementById('toggle-basic').getAttribute('aria-pressed')).toBe('false');
    ```
  - |
    AC2 — toggling layout does not alter a partially-typed expression:
    ```js
    document.getElementById('toggle-scientific').click();
    document.querySelector('#scientific-keys .calc-key[data-token="sin("]').click();
    expect(expr()).toBe('sin(');
    document.getElementById('toggle-basic').click();
    expect(expr()).toBe('sin(');
    ```
  - |
    AC3 — scientific layout exposes exactly the 14 required function buttons, in reading order:
    ```js
    document.getElementById('toggle-scientific').click();
    const tokens = Array.from(document.querySelectorAll('#scientific-keys .calc-key'))
      .map((b) => b.dataset.token);
    expect(tokens).toEqual(['sin(', 'cos(', 'tan(', 'log(', 'asin(', 'acos(', 'atan(', 'ln(',
      '^2', '√(', '^', '!', 'π', 'e']);
    ```
  - |
    AC4 — basic layout exposes only digits/decimal/operators/equals/clear/clear-entry, and no
    scientific key is present or reachable:
    ```js
    const keys = Array.from(
      document.querySelectorAll('#calculator-modal .calc-keypad:not(.scientific) .calc-key'),
    ).map((b) => b.dataset.key);
    expect(keys).toEqual(['clear-entry', 'clear', '÷', '7', '8', '9', '×', '4', '5', '6', '-',
      '1', '2', '3', '+', '0', '.', 'equals']);
    const focusableIds = calc
      .getFocusableElements(document.getElementById('calculator-modal'))
      .map((el) => el.dataset.token || el.dataset.key || el.id);
    expect(focusableIds).not.toEqual(expect.arrayContaining(['sin(']));
    ```
  - |
    AC5 — Tab order places the toggle, then (when active) every scientific key, then every basic
    key; every focusable control is a native `<button>` so Enter/Space activate it natively:
    ```js
    document.getElementById('toggle-scientific').click();
    const order = calc
      .getFocusableElements(document.getElementById('calculator-modal'))
      .map((el) => el.dataset.token || el.dataset.key || el.id);
    expect(order.slice(0, 3)).toEqual(['calc-close', 'toggle-basic', 'toggle-scientific']);
    expect(order.slice(3, 17)).toEqual(['sin(', 'cos(', 'tan(', 'log(', 'asin(', 'acos(', 'atan(',
      'ln(', '^2', '√(', '^', '!', 'π', 'e']);
    calc.getFocusableElements(document.getElementById('calculator-modal'))
      .forEach((el) => expect(el.tagName).toBe('BUTTON'));
    ```
  - |
    AC6 — scientific keys meet the 44x44 touch-target floor (inherit `.calc-key`'s existing
    `min-height`/`min-width: 44px`; `.sci`'s own `height: 48px` stays above that floor):
    ```js
    const sciRule = css.match(/\.calc-key\.sci\s*\{[^}]*\}/)[0];
    expect(sciRule).toMatch(/height:\s*48px/);
    const baseRule = css.match(/\.calc-key\s*\{[^}]*\}/)[0];
    expect(baseRule).toMatch(/min-height:\s*44px/);
    expect(baseRule).toMatch(/min-width:\s*44px/);
    ```
  - |
    AC7 — the layout change is announced via a dedicated live region, independent of the visible
    button set:
    ```js
    const liveRegion = document.getElementById('layout-live-region');
    expect(liveRegion.getAttribute('aria-live')).toBe('polite');
    document.getElementById('toggle-scientific').click();
    expect(liveRegion.textContent).toMatch(/^Scientific layout active\./);
    document.getElementById('toggle-basic').click();
    expect(liveRegion.textContent).toMatch(/^Basic layout active\./);
    ```
  - |
    Existing-test fix — TEST-M1-STORY-183's "AC10 exactly the 17 approved keys" must become 18
    keys now that `clear` is split into `clear-entry` + `clear`:
    ```js
    expect(keys).toEqual(['clear-entry', 'clear', '÷', '7', '8', '9', '×', '4', '5', '6', '-',
      '1', '2', '3', '+', '0', '.', 'equals']);
    ```

assumptions_or_open_questions:
  - |
    AC4's "clear/clear-entry keys" (plural) is read as requiring two distinct buttons, matching
    the approved design's explicit `data-key="clear-entry"` (CE) and `data-key="clear"` (C)
    split. This changes the basic grid from today's single "C" `span-3` button to two buttons,
    and requires updating TEST-M1-STORY-183's existing AC10 key-list test — flagged explicitly
    since it's a behavior change to already-shipped UI, not purely additive.
  - |
    Scientific function keys insert literal opening text only (e.g. "sin(", "√("); no real
    evaluation of trig/log/factorial is implemented. `src/calc/engine.js` is untouched — it has
    no support for these functions today, and the work item states this story "does not change
    expression evaluation itself." The result row shows a static "Evaluated by Calculation
    Engine" placeholder whenever the expression contains a non-arithmetic token, per the design.
  - |
    The design's proposed `--touch-target-min: 44px` CSS variable is not introduced; this plan
    hardcodes `44px` to match the convention already used by `public/calculator.css` and
    `public/styles.css` (both already hardcode 44px rather than using a variable for this exact
    purpose in the previously-shipped TEST-M1-STORY-183 code).
  - |
    AC5's "can be activated [via Enter/Space]" is verified structurally (every focusable control
    is a native `<button>`, which the HTML spec activates on Enter/Space without any app-level
    keydown handling) rather than by dispatching synthetic keydown events in jsdom, since jsdom
    does not reliably simulate a native button's default Enter/Space-to-click behavior and the
    app has no custom handler to unit-test for this interaction.
  - |
    AC6 ("touch device") is verified via static CSS sizing only, consistent with how the
    equivalent AC12 was tested for the basic keypad in TEST-M1-STORY-183 — no touch-device
    detection or pointer-type branching is introduced.

package_dependencies: []

notes: |
  `src/calc/engine.js` (the actual "Calculation Engine" referenced by the epic) is a completely
  separate module from `public/js/calculator.js`'s self-contained arithmetic — the public
  calculator has never called into it (confirmed: only `test/calc-engine.test.js` requires it).
  This story does not change that; it only extends the public calculator's own UI/state module.

  ```mermaid
  flowchart TD
    HTML[public/index.html<br/>toggle + scientific-section markup]
    CSS[public/css/calculator.css<br/>.layout-toggle*, .calc-key.sci, .is-engine]
    JS[public/js/calculator.js<br/>setLayout, appendToken, hasScientificToken,<br/>getFocusableElements fix]
    TEST[test/calculator.test.js<br/>AC1-AC7 + AC10 fix]
    ENGINE[src/calc/engine.js<br/>Calculation Engine - untouched]

    HTML -->|DOM ids/classes JS wires up| JS
    CSS -->|styles the classes HTML renders| HTML
    TEST -->|exercises via jsdom| JS
    TEST -->|reads rules from| CSS
    JS -.scientific tokens never evaluated,<br/>explicit scope boundary.-> ENGINE

    classDef touched fill:#f96,color:#000
    classDef untouched fill:#eee,color:#333
    class HTML,CSS,JS,TEST touched
    class ENGINE untouched
  ```

review_focus: |
  In scope: the Basic/Scientific toggle, the 14-button scientific grid, the CE/C split, the
  layout-change live region, and keyboard/touch-target compliance — all confined to
  `public/index.html`, `public/css/calculator.css`, `public/js/calculator.js`, and
  `test/calculator.test.js`. Out of scope, deliberately: any real evaluation of sin/cos/tan/log/
  ln/√/factorial — those insert literal text only, and `src/calc/engine.js` is untouched. The
  riskiest change is `getFocusableElements`'s new ancestor-`hidden` walk (`isVisible`), since it
  changes focus-order computation used by the existing modal Tab-trap from TEST-M1-STORY-183 as
  well as this story's AC5 — verify the pre-existing "Tab wraps focus inside the calculator
  dialog" test still passes unmodified. Also flag-but-accept: the existing AC10 "17 approved
  keys" assertion is deliberately changed to 18 keys as a direct, intended consequence of
  splitting clear/clear-entry per AC4, not an unreviewed regression.
