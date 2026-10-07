summary: |
  Corrects an earlier version of this plan that assumed no Basic/Scientific toggle existed yet.
  It already does: TEST-M1-STORY-185 ("Keyboard Entry") shipped a `role=tablist` toggle
  (`#tab-basic`/`#tab-scientific`), a `#scientific-keys` grid, and the matching
  `public/css/calculator.css` rules and `public/js/calculator.js` wiring (`setLayout`,
  keyboard-only scientific keys, a "Scientific tab reveals keypad and preserves expression"
  test). This story's real remaining scope is: (1) complete the scientific button inventory to
  match AC3 exactly (asin/acos/atan/factorial were missing), (2) fix a focus-order bug that
  let the hidden Scientific grid's buttons leak into Tab order while Basic was active, (3) add
  an explicit AC7 announcement for the layout switch (today only `aria-selected` changed, with
  nothing read out via the live region), and (4) fix a cross-test event-listener leak in
  `public/js/calculator.js` that was failing ~20 pre-existing tests whenever the full suite ran
  together (each `beforeEach` re-initializes the app without removing the previous instance's
  document-level `keydown` capture listener, so stale listeners from earlier tests call
  `stopImmediatePropagation()` before the current test's listener runs).

scope:
  - description: |
      Add the four missing scientific buttons required by AC3 (asin, acos, atan, factorial) to
      the existing `#scientific-keys` grid in `public/index.html`, as a fourth row matching the
      existing buttons' conventions exactly (`class="calc-key fn"`, `data-key`, `aria-label`):
      `asin(` ("Inverse sine"), `acos(` ("Inverse cosine"), `atan(` ("Inverse tangent"), and `!`
      ("Factorial", `class="calc-key fn op"` like the existing `^` power key). No new markup
      pattern is introduced — this only extends the grid already shipped in TEST-M1-STORY-185.
    files:
      - public/index.html
    rationale: |
      AC3 requires sin, cos, tan, asin, acos, atan, log, ln, exponent, square, square root, π, e,
      and factorial. The existing grid already had everything except asin/acos/atan/factorial.

  - description: |
      Fix `getFocusableElements` in `public/js/calculator.js` to treat a `hidden` *ancestor* (not
      just the element itself) as not focusable, via a new `isVisible` ancestor walk. Without
      this, `#scientific-keys`' buttons (which are not individually `hidden` — only their
      container is) were included in Tab order and in the modal's Tab-trap first/last
      calculation even while Basic layout was active, violating AC4/AC5. Export
      `getFocusableElements` (previously internal-only) so tests can assert on Tab order
      directly.
    files:
      - public/js/calculator.js
    rationale: |
      jsdom does not compute layout, so `offsetParent`-style visibility checks aren't available;
      an explicit ancestor walk is the only reliable way to detect "invisible because a container
      is hidden" in both the browser and the test environment.

  - description: |
      Add an AC7 announcement: `setLayout(layout, { announce = true } = {})` now writes a
      sentence to the existing `#calc-live-region` (`aria-live="polite"`) whenever the layout
      changes — "Scientific layout active" / "Basic layout active" — so the switch is exposed to
      assistive technology independent of the visible button set. `open()` passes
      `{ announce: false }` for its internal reset-to-Basic so reopening the modal doesn't emit a
      spurious announcement ahead of "Calculator opened". No new live region is introduced; the
      story's AC7 only requires *some* dedicated exposure, and one already exists and is already
      used for every other calculator state change.
    files:
      - public/js/calculator.js
    rationale: |
      Previously `setLayout` only toggled `aria-selected` on the tab buttons — a sighted user
      sees the button set change, but nothing was read out to a screen reader user.

  - description: |
      Fix a pre-existing cross-test pollution bug uncovered while verifying the above: the
      document-level `keydown` capture listener added in `initCalculatorApp` was never removed
      between re-initializations. `test/calculator.test.js`'s `beforeEach` legitimately calls
      `initCalculatorApp(document)` fresh for every test (via `jest.resetModules()` +
      `document.documentElement.innerHTML = ...`), but `document` itself persists across tests in
      jsdom, so every prior test's listener stayed attached and fired on every subsequent test's
      keydown events — the oldest listener's stale `modalWrap.hidden` check would often pass and
      call `stopImmediatePropagation()`, silently swallowing the event before the current test's
      own listener ran. Fixed by stashing the handler on `doc.__calcKeydownHandler` and removing
      any previous one before attaching a new one. This was failing ~20 of the suite's existing
      keyboard-entry and focus-trap tests whenever the full file ran (vs. passing in isolation),
      independent of anything specific to this story.
    files:
      - public/js/calculator.js
    rationale: |
      This story's own new tests (and several pre-existing ones) exercise keydown dispatch
      across multiple tests in the same file; without this fix the full suite could not pass
      green regardless of what else this story changed.

  - description: |
      Extend `test/calculator.test.js` with a new `scientific layout toggle (TEST-M1-STORY-184)`
      describe block covering AC1, AC3, AC4, AC4/AC5 (hidden-ancestor focus exclusion), AC5
      (visual Tab order once Scientific is active), and AC7 (live-region announcement); add an
      AC2 test asserting a literal `sin(` survives a layout toggle unchanged; add an AC6 CSS test
      confirming the new `.fn` buttons inherit `.calc-key`'s 44x44 floor; and fix the pre-existing
      `AC5 fitExpressionFontSize steps down progressively` test, whose fixture used non-CSS
      strings (`'max'/'mid'/'min'`) that jsdom's `CSSStyleDeclaration` silently rejects as invalid
      `font-size` values (unrelated to this story, but blocking a green full-suite run).
    files:
      - test/calculator.test.js
    rationale: |
      Every acceptance criterion needs a corresponding automated check, and the two unrelated
      pre-existing failures (listener leak, invalid CSS fixture) had to be fixed for the full
      suite to pass at all.

tests:
  - |
    AC1 — toggle switches which keypad is rendered (already partly covered by an existing test;
    this adds the explicit hidden/aria-pressed assertions):
    ```js
    expect(document.getElementById('scientific-keys').hidden).toBe(true);
    document.getElementById('tab-scientific').click();
    expect(document.getElementById('scientific-keys').hidden).toBe(false);
    expect(document.getElementById('tab-scientific').getAttribute('aria-selected')).toBe('true');
    ```
  - |
    AC2 — a literal "sin(" survives toggling back and forth:
    ```js
    document.querySelector('#scientific-keys .calc-key[data-key="sin("]').click();
    expect(expr()).toBe('sin(');
    document.getElementById('tab-basic').click();
    expect(expr()).toBe('sin(');
    ```
  - |
    AC3 — every required scientific button is present:
    ```js
    const sciKeys = [...document.querySelectorAll('#scientific-keys .calc-key')].map((b) => b.dataset.key);
    ['sin(','cos(','tan(','asin(','acos(','atan(','log(','ln(','^','^2','√(','π','e','!']
      .forEach((required) => expect(sciKeys).toContain(required));
    ```
  - |
    AC4 — Basic exposes exactly the 18 approved keys (pre-existing test, unchanged), plus: the
    Scientific grid's buttons are excluded from focus order while Basic is active.
  - |
    AC5 — once Scientific is active, close button, then the toggle, then every scientific key,
    then equals, all appear in that relative order in `getFocusableElements`, and every entry is
    a native `<button>`.
  - |
    AC6 — `.calc-key.fn` inherits `.calc-key`'s existing `min-height`/`min-width: 44px`.
  - |
    AC7 — toggling emits "Scientific layout active" / "Basic layout active" into
    `#calc-live-region`.

assumptions_or_open_questions:
  - |
    AC4's "clear/clear-entry keys" (plural) is satisfied by the Basic grid's existing two
    distinct keys — `clear` ("C") and `backspace` ("⌫") — shipped in TEST-M1-STORY-185. No
    markup change was needed for this; the earlier version of this plan incorrectly assumed a
    single "C" button needed splitting into "CE"/"C", which does not match what is actually
    shipped (confirmed via the existing, passing "AC10 exactly the 18 approved Basic keys" test).
  - |
    Scientific function keys insert literal opening text only (e.g. "sin(", "asin("); no real
    evaluation of trig/log/factorial is added. Pressing "=" with such a token present falls
    through to the existing arithmetic `evaluate()`, which cannot tokenize letters and reports
    "Syntax Error" — acceptable per the story's explicit "does not change expression evaluation
    itself" boundary. `src/calc/engine.js` is untouched.
  - |
    `test/rooms-role-enforcement.test.js` and `test/rooms-ui.test.js` fail on this branch
    independent of any file this story touches (confirmed failing in isolation, unrelated
    domain/module, not part of this diff) — out of scope for this PR.

package_dependencies: []

notes: |
  `.arc/designs/TEST-M1-STORY-184-design.html` (an earlier prototype iteration) describes a
  different markup shape (`#toggle-basic`/`#toggle-scientific`, `data-token`, a
  `#scientific-section` wrapper, an "Evaluated by Calculation Engine" placeholder) than what was
  actually implemented and shipped in TEST-M1-STORY-185 (`#tab-basic`/`#tab-scientific`,
  `data-key`, `#scientific-keys`). This plan deliberately keeps the shipped implementation's
  conventions rather than reconciling them with the older prototype file, since rewriting a
  working, tested toggle to match a superseded design would be pure churn with no behavioral
  benefit and would risk every acceptance criterion the shipped version already satisfies.

review_focus: |
  In scope: completing the scientific button inventory (asin/acos/atan/factorial), the
  hidden-ancestor focus-order fix, the AC7 live-region announcement, and the keydown-listener
  cross-test leak fix — all confined to `public/index.html`, `public/js/calculator.js`, and
  `test/calculator.test.js`. The riskiest change is `getFocusableElements`'s new ancestor-`hidden`
  walk, since it changes focus-order computation used by the existing modal Tab-trap — verify
  "Tab wraps focus inside the calculator dialog instead of escaping it" still passes (it does).
  Out of scope, deliberately: any real evaluation of sin/cos/tan/log/ln/factorial (literal text
  only); reconciling `public/css/calculator.css` or markup conventions with the superseded design
  prototype; the two pre-existing, unrelated `rooms-*` test failures.
