summary: |
  Add physical-keyboard entry to the calculator modal introduced in TEST-M1-STORY-183, so
  digits, operators, Enter, Escape and Backspace all drive the same `pressKey`/`render`
  pipeline the on-screen keys already use. The production codebase today only has a Basic
  keypad with 17 keys and no Backspace button, and no Scientific layout at all (confirmed by
  reading public/index.html, public/js/calculator.js and test/calculator.test.js) — but
  several of this story's acceptance criteria are phrased as "in either the basic or
  scientific layout" and AC10 is scientific-layout-specific, so those ACs cannot be true (or
  tested) without that layout existing. The approved design
  (.arc/designs/TEST-M1-STORY-185-design.html) is the only record of what that layout and the
  Backspace key look like, so this plan builds exactly the UI shell it shows (layout tabs,
  scientific keypad panel, "⌫" key) alongside the keyboard wiring itself, while deliberately
  not adding scientific (trig/log) computation to the arithmetic engine — no AC here asks for
  that, and the story's own scope note says typed function-name shortcuts are still "pending
  team confirmation." It also implements the design's explicit, documented decision that
  Escape now clears the expression instead of closing the calculator dialog (AC4), which is a
  deliberate change to previously-passing test behaviour. This revision adds a broader set of
  edge-case tests (operator/backspace interaction with a just-finalized result, dangling-
  operator Enter, modal-closed guarding, error recovery via keyboard, extended Scientific-only
  key gating) on top of the one-test-per-AC baseline.
scope:
  - description: |
      Add a Backspace ("⌫") on-screen key to the Basic keypad and a `pressKey(state, 'backspace')`
      branch that deletes the last character — or, if the previous action was "=", first
      falls back to the finalized value's string form, then deletes its last character — so
      AC5/AC7 have a real on-screen equivalent to "match."

      New branch (inserted after the existing `equals` branch, before the operator branch):
      ```js
      if (key === 'backspace') {
        const expr = state.finalized ? formatNumber(state.finalizedValue) : expression;
        return { ...next, expression: expr.slice(0, -1), finalized: false };
      }
      ```
      `''.slice(0, -1)` is `''`, so this also satisfies AC7 (empty expression stays empty)
      without a separate length check. `formatNumber(-3).slice(0, -1)` is `'-'`, so a backspace
      immediately after a negative finalized result leaves a valid, still-editable expression.
    files:
      - public/js/calculator.js
      - public/index.html
      - public/css/calculator.css
    rationale: |
      AC5/AC7 require keyboard Backspace to match "the on-screen delete-last-character button
      behaviour," but no such button exists today — test/calculator.test.js's "AC10 exactly
      the 17 approved keys" test enumerates the current keypad as
      `['clear', '÷', '7', '8', '9', '×', '4', '5', '6', '-', '1', '2', '3', '+', '0', '.', 'equals']`,
      with no backspace key. The approved design shows the exact replacement markup: the old
      `clear` key's `span-3` becomes `span-2`, and a new
      `<button class="calc-key backspace" data-key="backspace" aria-label="Delete last character">⌫</button>`
      fills the freed cell, ahead of the existing "÷" key — design lines ~859-862.

  - description: |
      Add the minimal Basic/Scientific layout toggle shown in the approved design: a
      `role="tablist"` pair of tabs ("Basic" / "Scientific") above the display, and a second,
      initially-hidden `.calc-keypad.scientific-rows` panel containing the function keys
      (sin(, cos(, tan(, (, log(, ln(, √(, ), x², ^, π, e), each wired through the same
      generic click handler the Basic keypad already uses. Track the active layout as a
      module-level variable in `initCalculatorApp` (not part of the pure `pressKey` state),
      defaulting to "basic" on every open, so a tab switch only toggles panel visibility and
      `aria-selected` — it never resets or mutates the expression.
    files:
      - public/index.html
      - public/css/calculator.css
      - public/js/calculator.js
    rationale: |
      AC1, AC2, AC6, AC8 and AC9 are all phrased as holding "in either the basic or scientific
      layout," and AC10 is scientific-layout-specific — none of that is meaningfully testable
      without a real second layout to switch into. The approved design is the only record of
      what that layout looks like (tabs: `#tab-basic` / `#tab-scientific`, design lines
      ~822-825; scientific panel `#scientific-keys`, lines ~842-857), so this plan builds that
      shell faithfully. It deliberately stops at the UI + the existing generic
      "append this literal token to the expression" fallback already in `pressKey` (the final
      `// digit` branch handles any unrecognized string key, including "sin(", "π", "(", etc.,
      with no code change needed) — it does NOT add trigonometric/log parsing to `evaluate()`.
      No acceptance criterion in this story requires sin/cos/log/√ to compute a correct
      result, and the work item's own scope note leaves "typed scientific function names"
      pending team confirmation; teaching the engine real scientific math is a separate,
      larger capability.

  - description: |
      Wire physical-keyboard `keydown` handling into the modal's existing capture-phase
      listener (it currently only handles Escape-closes/Tab-trap): digits `0`-`9`, `.`,
      `+ - * /` (mapped to the `+ - × ÷` button keys), `Enter` (→ `equals`), `Backspace` (→
      `backspace`), and — only when `currentLayout === 'scientific'` — `(`, `)`, `^`. Every
      mapped key calls the exact same `pressKey` + `render` pair the on-screen click handler
      calls, so "matching the on-screen button behaviour" holds by construction. Any other
      key (letters, F-keys, Tab, Shift, etc., and anything held with Ctrl/Cmd/Alt) falls
      through untouched: no `pressKey` call, no `render` call, no `preventDefault` — zero DOM
      mutation. The listener's existing `if (modalWrap.hidden) return;` guard applies to all
      of these new branches unchanged, so keystrokes are inert whenever the calculator isn't
      open.
    files:
      - public/js/calculator.js
    rationale: |
      This is the actual Keyboard Entry capability (AC1, AC2, AC3, AC5, AC6, AC8, AC9, AC10).
      Routing every mapped key through the SAME `pressKey`/`render` functions the buttons use
      is what makes AC1-AC5 "match the on-screen button behaviour" true without duplicating
      logic — including the existing engine's edge-case handling for a leading operator with
      no left operand, operator-stacking/replace, decimal-per-segment, and continuing from a
      finalized result, all of which keyboard input now exercises for free. This is also why
      AC6 (click then type combine into one expression) holds for free — both input methods
      mutate the same `state` object. Gating `(` `)` `^` behind `currentLayout` matches the
      design's own reference table (design lines ~939-948): those three have "no on-screen
      equivalent in Basic, so unmapped there." The Ctrl/Cmd/Alt guard mirrors the design's
      explicit handling and keeps browser/OS shortcuts (e.g. Ctrl+1 tab-switching) from being
      silently hijacked by the digit regex, in the spirit of AC8/AC9's "no mapped action" for
      anything without an on-screen equivalent.

  - description: |
      Change what Escape does inside the calculator modal: instead of closing the dialog, it
      now calls `pressKey(state, 'clear')` + `render('Display cleared')`, same as clicking "C".
      The modal's Tab focus-trap handling is untouched. Closing the calculator now requires
      the "×" button, "Cancel", or a backdrop click.
    files:
      - public/js/calculator.js
      - test/calculator.test.js
    rationale: |
      AC4 requires Escape to clear the expression. The design's own authoring comment calls
      this out explicitly as a deliberate override of the "Escape closes the dialog" modal
      convention used elsewhere in this product, specifically so Escape stays consistent with
      every other on-screen clear action once the calculator is focused. This directly
      contradicts an existing passing assertion in
      test/calculator.test.js ("reopening starts blank; Escape and overlay close": it currently
      dispatches `Escape` and asserts `calculator-modal-wrap.hidden` becomes `true`), which this
      plan updates rather than treating as a regression.

  - description: |
      Extend test/calculator.test.js: (a) re-scope the existing "AC10 exactly the 17 approved
      keys" assertion to the Basic keypad only — e.g.
      `document.querySelectorAll('#calculator-modal .calc-keypad:not(.scientific-rows) .calc-key')`
      — and update the expected array to the 18 keys including `backspace`, since a second
      `.calc-keypad` (scientific) now exists and the same bare selector used before would match
      both; (b) replace the "Escape...close" assertion with one for the new clear-not-close
      behaviour; (c) add new tests for every AC in this story (1-10), covering both layouts,
      continuous click-then-type entry, Backspace-on-empty no-op, and zero DOM mutation on an
      unmapped key; (d) add the edge-case tests listed under `tests` below covering
      operator/backspace interaction with a just-finalized result, dangling-operator Enter,
      modal-closed guarding, keyboard-driven error recovery, and extended Scientific-only key
      gating.
    files:
      - test/calculator.test.js
    rationale: |
      TDD: these are the failing tests written first, listed in full under `tests` below.
package_dependencies: []
tests:
  - |
    AC1 (digit, Basic layout):
    ```js
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '7', bubbles: true, cancelable: true }));
    expect(expr()).toBe('7');
    ```
  - |
    AC1 (digit, Scientific layout):
    ```js
    document.getElementById('tab-scientific').click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '7', bubbles: true, cancelable: true }));
    expect(expr()).toBe('7');
    ```
  - |
    AC2 (operator key appends after a number, both layouts):
    ```js
    tap(['1', '2']);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '+', bubbles: true, cancelable: true }));
    expect(expr()).toBe('12+');

    document.getElementById('tab-scientific').click();
    tap(['3']);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '*', bubbles: true, cancelable: true }));
    expect(expr()).toBe('12+3×');
    ```
  - |
    AC3 (Enter evaluates like "="):
    ```js
    tap(['1', '2', '+', '8']);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    expect(result().textContent).toBe('20');
    expect(result().classList.contains('is-preview')).toBe(false);
    ```
  - |
    AC4 (Escape clears the expression, modal stays open):
    ```js
    tap(['1', '2', '3']);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(expr()).toBe('');
    expect(document.getElementById('calculator-modal-wrap').hidden).toBe(false);
    document.getElementById('calc-close').click();
    expect(document.getElementById('calculator-modal-wrap').hidden).toBe(true);
    ```
  - |
    AC5 (Backspace removes exactly the last character):
    ```js
    tap(['1', '2', '3']);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true }));
    expect(expr()).toBe('12');
    ```
  - |
    AC6 (click then type combine into one continuous expression):
    ```js
    key('1'); key('+');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '2', bubbles: true, cancelable: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    expect(expr()).toBe('1+2');
    expect(result().textContent).toBe('3');
    ```
  - |
    AC7 (Backspace on an empty expression is a no-op):
    ```js
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true }));
    expect(expr()).toBe('');
    ```
  - |
    AC8/AC9 (unmapped letter key: expression and live region untouched):
    ```js
    tap(['4', '2']);
    const before = live();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'q', bubbles: true, cancelable: true }));
    expect(expr()).toBe('42');
    expect(live()).toBe(before);
    ```
  - |
    AC10 (typed letters toward a function name never insert it, Scientific layout) — mirrors
    the approved design's own reference example (0.5+ before/after typing s, i, n):
    ```js
    document.getElementById('tab-scientific').click();
    tap(['0', '.', '5', '+']);
    ['s', 'i', 'n'].forEach((k) =>
      document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })),
    );
    expect(expr()).toBe('0.5+');
    ```
  - |
    Supporting infrastructure test: "(" ")" "^" keyboard keys are mapped only in Scientific
    layout, per the design's reference table:
    ```js
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '(', bubbles: true, cancelable: true }));
    expect(expr()).toBe('');
    document.getElementById('tab-scientific').click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '(', bubbles: true, cancelable: true }));
    expect(expr()).toBe('(');
    ```
  - |
    Supporting infrastructure test: Basic keypad now has 18 approved keys (adds backspace),
    scoped away from the new scientific keypad:
    ```js
    const keys = Array.from(
      document.querySelectorAll('#calculator-modal .calc-keypad:not(.scientific-rows) .calc-key'),
    ).map((b) => b.dataset.key);
    expect(keys).toEqual(['clear', 'backspace', '÷', '7', '8', '9', '×', '4', '5', '6', '-', '1', '2', '3', '+', '0', '.', 'equals']);
    ```
  - |
    Supporting infrastructure test: switching to the Scientific tab reveals its keypad and
    preserves the expression:
    ```js
    tap(['1', '2']);
    document.getElementById('tab-scientific').click();
    expect(document.getElementById('scientific-keys').hidden).toBe(false);
    expect(expr()).toBe('12');
    ```
  - |
    Edge case: a keyboard operator with no left operand yet is ignored, same as clicking it
    (leading-operator rule), rather than inserting a stray operator:
    ```js
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '+', bubbles: true, cancelable: true }));
    expect(expr()).toBe('');
    ```
  - |
    Edge case: a second keyboard operator replaces the first instead of stacking (matching the
    on-screen "stacked operators replace" rule):
    ```js
    tap(['1', '2']);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '+', bubbles: true, cancelable: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '-', bubbles: true, cancelable: true }));
    expect(expr()).toBe('12−');
    ```
  - |
    Edge case: Backspace removes a trailing operator character, not just a digit:
    ```js
    tap(['1', '2', '+']);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true }));
    expect(expr()).toBe('12');
    ```
  - |
    Edge case: after Enter finalizes a negative result, Backspace edits the finalized value's
    string form instead of being a no-op or clearing it outright:
    ```js
    tap(['2', '-', '5']);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    expect(result().textContent).toBe('-3');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true }));
    expect(expr()).toBe('-');
    expect(result().classList.contains('is-preview')).toBe(true);
    ```
  - |
    Edge case: pressing Enter on a dangling-operator expression forces the same Syntax Error
    state as clicking "=" does, rather than silently doing nothing:
    ```js
    tap(['1', '2', '+']);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    expect(document.querySelector('.calc-error').textContent).toMatch(/Syntax Error/);
    ```
  - |
    Edge case: a keyboard digit right after a finalized result starts a fresh expression
    (mirrors the existing click-based "AC4 digit/operator/decimal after a finalized result"
    engine test, exercised here through the DOM/keydown path):
    ```js
    tap(['1', '2', '+', '8']);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '5', bubbles: true, cancelable: true }));
    expect(expr()).toBe('5');
    ```
  - |
    Edge case: a keyboard operator right after a finalized result continues from that result
    instead of starting fresh:
    ```js
    tap(['1', '2', '+', '8']);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '+', bubbles: true, cancelable: true }));
    expect(expr()).toBe('20+');
    ```
  - |
    Edge case: keydown is entirely inert once the calculator modal is closed — no expression
    is created or mutated in the background:
    ```js
    document.getElementById('calc-cancel').click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '5', bubbles: true, cancelable: true }));
    document.getElementById('open-calculator').click();
    expect(expr()).toBe('');
    ```
  - |
    Edge case: a second keyboard "." within the same number segment is ignored, matching the
    on-screen "." key's one-decimal-per-segment rule:
    ```js
    tap(['3', '.', '1', '4']);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '.', bubbles: true, cancelable: true }));
    expect(expr()).toBe('3.14');
    ```
  - |
    Edge case: Escape on an already-empty expression is idempotent — it stays empty and still
    announces "Display cleared" rather than erroring or doing nothing silently:
    ```js
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(expr()).toBe('');
    expect(live()).toBe('Display cleared');
    ```
  - |
    Edge case: typing a digit on the keyboard after an error is showing recovers the display,
    same as the existing click-based recovery test:
    ```js
    tap(['5', '÷', '0']);
    expect(document.querySelector('.calc-error')).not.toBeNull();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '5', bubbles: true, cancelable: true }));
    expect(expr()).toBe('5÷05');
    expect(document.querySelector('.calc-error')).toBeNull();
    ```
  - |
    Edge case: Ctrl/Cmd/Alt-held Enter, Backspace and Escape are all left unmapped too (not
    just digits), so OS-level shortcuts on those keys aren't hijacked:
    ```js
    tap(['1', '2', '3']);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', ctrlKey: true, bubbles: true, cancelable: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', metaKey: true, bubbles: true, cancelable: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', altKey: true, bubbles: true, cancelable: true }));
    expect(expr()).toBe('123');
    ```
  - |
    Edge case: ")" and "^" are Scientific-only too, extending the "(" coverage above to the
    other two scientific-only keys from the design's reference table:
    ```js
    tap(['2']);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: ')', bubbles: true, cancelable: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '^', bubbles: true, cancelable: true }));
    expect(expr()).toBe('2');

    document.getElementById('tab-scientific').click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '^', bubbles: true, cancelable: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: ')', bubbles: true, cancelable: true }));
    expect(expr()).toBe('2^)');
    ```
  - |
    Edge case: continuous entry also holds when the on-screen half of the input is a
    Scientific function button rather than a digit/operator — clicking "sin(" then continuing
    on the keyboard builds one expression (extends AC6 beyond digits/operators):
    ```js
    document.getElementById('tab-scientific').click();
    document.querySelector('.calc-key[data-key="sin("]').click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '0', bubbles: true, cancelable: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '.', bubbles: true, cancelable: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '5', bubbles: true, cancelable: true }));
    expect(expr()).toBe('sin(0.5');
    ```
assumptions_or_open_questions:
  - |
    The production codebase currently has only a Basic keypad (17 keys, confirmed via
    test/calculator.test.js's "AC10 exactly the 17 approved keys" test and public/index.html)
    and no Backspace key or Scientific layout at all. This story's ACs presuppose both exist
    ("matching the on-screen...button equivalent," "in either the basic or scientific
    layout"). This plan therefore builds the minimal UI shell the approved design shows
    (Backspace key, Basic/Scientific tabs, scientific keypad panel) as a prerequisite, rather
    than treating "the layouts already exist" as a given.
  - |
    This plan does NOT add scientific (trig/log/sqrt) computation to the arithmetic engine.
    The scientific keypad's function buttons (sin(, cos(, etc.) append their literal token via
    the existing generic fallback in `pressKey`, matching the approved design's on-screen
    behaviour, but `evaluate()` still can't parse them — clicking "sin(", typing a number, and
    pressing "=" will continue to show a Syntax Error, unchanged from today. No AC in this
    story requires a correct numeric result from those buttons; teaching the engine real
    scientific math looks like a separate, future story under this epic's "toggling between
    basic and scientific button layouts" capability.
  - |
    AC10's "pending team confirmation" question (whether typed function names like "sin("
    should work as a keyboard shortcut) is resolved per the approved design's stated default:
    no — letter keys are never mapped to a function insert in either layout. If the team later
    confirms shortcuts should work, the design notes only the Scientific keydown branch would
    need a small keyword-matching addition; the key map, display and error states here would
    not change.
  - |
    The design's own demo script additionally binds the literal "=" key to equals, alongside
    Enter, but its own reference table (screen 2) lists only Enter, and AC3 only mentions
    Enter. This plan maps Enter only, treating the extra "=" binding as incidental to the
    prototype rather than a documented requirement.
  - |
    Ctrl/Cmd/Alt-modified keystrokes are left unmapped entirely (checked before any key
    comparison), so e.g. Ctrl+1 doesn't get hijacked as digit "1" and break a browser/OS
    shortcut. This isn't literally spelled out by an AC but follows directly from AC8/AC9's
    "no mapped action" intent and the design's own explicit handling.
notes: |
  Two lightly-related facts worth recording since they shaped scoping decisions above:
  src/calc/engine.js (from TEST-M1-STORY-181, "Core Arithmetic Expression Engine") already
  supports `+ - * / ^ ( )` and `pi`/`e` constants, but isn't wired into the UI at all — the
  calculator modal's `evaluate()` in public/js/calculator.js is a separate, simpler
  implementation (Unicode `× ÷` only, no parens, no `^`, no constants). Reconciling those two
  is out of scope here; this plan doesn't touch src/calc/engine.js.

  The design file also ships reviewer-only tooling explicitly marked as such in its own HTML
  comments — a "Keyboard activity log" panel, "Preset" seed buttons, and the screen-navigation
  bar — none of that is shipped UI and none of it is built by this plan.

  The edge-case tests added in this revision deliberately lean on behaviour the existing
  `pressKey` engine already implements for click input (leading-operator rule, operator
  stacking/replace, one-decimal-per-segment, continuing from/after a finalized result, error
  recovery) — keyboard input is exercising the same pure function, so these are regression
  guards proving parity rather than new engine logic.

  ```mermaid
  flowchart TD
    HTML["public/index.html<br/>keypad + tabs + scientific panel markup"]
    CSS["public/css/calculator.css<br/>.layout-tab, .calc-key.backspace, .scientific-rows"]
    JS["public/js/calculator.js<br/>initCalculatorApp: click + keydown wiring"]
    PK["pressKey(state, key)<br/>pure state transition"]
    RD["render(announcement)<br/>DOM + live-region update"]
    TEST["test/calculator.test.js"]

    HTML -->|"markup read/queried by"| JS
    CSS -->|"styles"| HTML
    JS -->|"dispatches on click + keydown"| PK
    PK -->|"new state"| RD
    TEST -->|"exercises"| JS
    TEST -->|"asserts DOM from"| HTML

    classDef touched fill:#f96,color:#000
    class HTML,CSS,JS,PK,RD,TEST touched
  ```
review_focus: |
  In scope: the on-screen Backspace key + `pressKey('backspace')`, the minimal Basic/Scientific
  tab toggle and scientific keypad shell (per the approved design), and physical-keyboard
  handling for digits/operators/Enter/Escape/Backspace (plus Scientific-only `(` `)` `^`)
  routed through the same `pressKey`/`render` pipeline the existing click handlers use, plus a
  broad edge-case test layer (operator/backspace interaction with a just-finalized result,
  dangling-operator Enter, modal-closed guarding, keyboard-driven error recovery, extended
  Scientific-only key gating, continuous entry starting from a function-button click).
  Deliberately out of scope: real scientific (trig/log/sqrt) computation — the function
  buttons append their literal token but `evaluate()` is untouched, so using them still ends
  in a Syntax Error, which is a pre-existing gap this plan does not fix — and typed
  function-name keyboard shortcuts (resolved as "no" per the design's stated default, pending
  final team confirmation per the work item's own scope note). The riskiest/most
  reviewer-relevant change is AC4: Escape now clears the expression instead of closing the
  calculator dialog, a deliberate, design-documented departure from this app's usual
  Escape-closes-modal convention, which also required changing a previously-passing test
  assertion — don't flag that test change as an unintended regression. The edge-case tests are
  deliberately regression-style (proving keyboard parity with already-approved click
  behaviour) rather than new production logic, so a reviewer should not expect new `pressKey`
  branches beyond `backspace`.
