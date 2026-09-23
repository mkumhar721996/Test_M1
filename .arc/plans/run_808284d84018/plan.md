summary: |
  The repository is no longer greenfield: TEST-M1-STORY-036 already merged a Node/Express
  backend (`package.json`, `src/server.js`, `src/employees/{routes,store}.js`) tested with
  Jest + Supertest (CommonJS `require`/`module.exports`, `"test": "jest"`). This story adds the
  first frontend surface on top of that backend: an expense list view with an "Add Expense"
  button that opens a modal form (amount, date, category dropdown, optional description),
  required-field validation with inline errors and visual invalid-state styling, save-then-
  prepend-to-list behavior, cancel/dismiss-without-saving behavior, and USD currency formatting
  for any displayed amount. No AC in this story mentions server-side persistence for expenses
  (unlike the prior employees story's explicit "persisted in the system" AC), so expenses are
  held in an in-memory array inside the frontend module only. Frontend files live under a new
  `public/` directory served by the existing Express app via `express.static`, and DOM tests
  reuse the project's existing Jest runner (adding only the `jsdom` environment package) rather
  than introducing a second test runner. Every behavior is driven by a failing test written
  first: pure-function unit tests for validation/currency (plain Jest/Node), and DOM integration
  tests via `@testing-library/dom` under Jest's jsdom environment for the modal/list
  interactions.
scope:
  - description: |
      Add the two devDependencies needed to run DOM-based tests under the project's existing
      Jest runner: `jest-environment-jsdom` (Jest 28+ moved the jsdom environment out of core,
      so it must be installed explicitly) and `@testing-library/dom` (accessible queries and
      `fireEvent` for `test/app.test.js`). No `jest.config.js` is added; `test/app.test.js`
      opts into jsdom per-file via the docblock pragma `/** @jest-environment jsdom */`, so the
      existing Node-environment `test/employees.test.js` is unaffected.
    files:
      - package.json
    rationale: |
      `package.json` already declares Jest + Supertest and `"test": "jest"`
      (verified: `test/employees.test.js` uses `require('supertest')` against
      `require('../src/server')`). This story's ACs are UI/DOM-only; reusing Jest instead of
      adding Vitest avoids two competing test runners in one repo for no functional gain.
  - description: |
      Pure currency-formatting helper used everywhere an amount is displayed. CommonJS to match
      the codebase's existing module style (`src/employees/store.js` uses `module.exports`), plus
      a bare global function declaration so the same file also works unmodified as a classic
      `<script>` in the browser (no bundler exists or is introduced by this plan):
      ```js
      function formatCurrencyUSD(amount) {
        return '$' + amount.toFixed(2);
      }

      if (typeof module !== 'undefined') {
        module.exports = { formatCurrencyUSD };
      }
      ```
      `formatCurrencyUSD(9.999) === '$10.00'`.
    files:
      - public/currency.js
    rationale: |
      AC8 requires every displayed amount to be formatted as USD with a `$` and two decimals.
      Isolating this as a pure function lets it be unit-tested directly and reused by the list
      renderer in `public/app.js`.
  - description: |
      Pure form-validation helper, same dual browser-global/CommonJS export shape as
      `public/currency.js`:
      ```js
      function validateExpenseForm(values) {
        const errors = {};
        if (!values.amount) errors.amount = 'Amount is required.';
        if (!values.date) errors.date = 'Date is required.';
        if (!values.category) errors.category = 'Category is required.';
        return { valid: Object.keys(errors).length === 0, errors };
      }

      if (typeof module !== 'undefined') {
        module.exports = { validateExpenseForm };
      }
      ```
      Only checks that amount/date/category are non-empty (per the ACs, which describe the
      failure case as "left empty/unselected"); `description` is never validated.
    files:
      - public/validation.js
    rationale: |
      ACs 2-4 require detecting empty amount/date/category and producing a per-field message.
      A pure function gives a fast, framework-free unit test for the validation rule itself,
      independent of DOM highlighting.
  - description: |
      App shell and wiring: builds the list view (heading, "Add Expense" button, `<ul
      id="expense-list">`) and the modal form (amount/date/category/description fields, Save
      and Cancel buttons) into a container element, and wires all interaction logic.
      Signature: `function renderApp(root) { ... }`, exported the same dual way as the other
      two modules. Pulls in the pure helpers via a require-or-window shim so the file works
      both under Jest (`require` exists) and as a classic browser script loaded after
      `currency.js`/`validation.js` (where they're already globals):
      ```js
      const { formatCurrencyUSD } = typeof module !== 'undefined' ? require('./currency') : window;
      const { validateExpenseForm } = typeof module !== 'undefined' ? require('./validation') : window;
      ```
      Category `<select>` starts with a blank `<option value="">` so it can be "unselected",
      followed by exactly Food, Transport, Housing, Entertainment, Other.
      Behavior: clicking "Add Expense" un-hides the modal (`role="dialog"`, toggled via the
      `hidden` attribute, not the native `<dialog>` element — see
      assumptions_or_open_questions); clicking Save runs `validateExpenseForm`, and on failure
      keeps the modal open, adds a `field-invalid` class to each invalid input/select, and
      renders that field's message into an adjacent `<p class="field-error">`; on success it
      builds an expense object, prepends a rendered `<li>` (amount run through
      `formatCurrencyUSD`) to `#expense-list`, resets the form, and hides the modal; clicking
      Cancel or pressing Escape hides the modal and resets the form without touching the list.
    files:
      - public/app.js
    rationale: |
      This is the single integration point ACs 1-7 exercise. `renderApp` builds all markup in
      JS (rather than duplicating it in `public/index.html`) so the exact same code path is
      used by both the real page and the Jest/jsdom tests.
  - description: |
      Modal, invalid-field, and inline-error styling. Reuses the existing `.btn`, `.btn-primary`,
      `.btn-secondary`, `.input`, and `.label` classes from `design-system/prototype-utils.css`
      (verified present) for the base look, and adds only the modal-overlay layout and
      `.field-invalid`/`.field-error` rules that don't already exist anywhere in the design
      system.
    files:
      - public/styles.css
    rationale: |
      AC3 requires the invalid field to be visually distinct. `design-system/tokens.json` /
      `tokens.css` (verified) define no danger/error color — `--color-primary` is the brand
      yellow (`#eab308`), not red, so it is not reused here as the earlier draft of this plan
      incorrectly assumed. A hardcoded, WCAG-AA-checked red (`#f87171` text/border on the
      existing dark `--color-bg`) is used instead and flagged below as an open question for the
      design system to formalize later.
  - description: |
      The actual page users open, plus wiring it into the existing Express app so it's
      reachable without any extra tooling: `public/index.html` loads
      `design-system/tokens.css`, `design-system/prototype-utils.css`, and `public/styles.css`,
      then `<script>`-tags `currency.js`, `validation.js`, `app.js` in that order, then calls
      `renderApp(document.getElementById('root'))` in a final inline script. `src/server.js` is
      updated to serve `public/` as static files:
      ```js
      const path = require('path');
      const express = require('express');
      const employeesRouter = require('./employees/routes');

      const app = express();
      app.use(express.json());
      app.use(express.static(path.join(__dirname, '..', 'public')));
      app.use('/employees', employeesRouter);

      module.exports = app;
      ```
    files:
      - public/index.html
      - src/server.js
    rationale: |
      `src/server.js` (verified, current contents shown above minus the static line) is the
      Express app factory already used by both `src/index.js` and
      `test/employees.test.js`/supertest; adding `express.static` here is the minimal change
      that makes the new UI actually load at `/` when the app runs, without touching the
      `/employees` API surface or introducing a separate frontend dev server.
  - description: |
      Failing-tests-first for the pure helpers, plain Jest/Node (no jsdom needed), matching the
      `require`-based style of `test/employees.test.js`.
    files:
      - test/currency.test.js
      - test/validation.test.js
    rationale: |
      Fast, DOM-free unit tests written before their implementations, covering AC8's formatting
      rule and ACs 2-4's "empty/unselected" validation rule in isolation.
  - description: |
      Failing-tests-first for the modal/list DOM integration, using `@testing-library/dom`
      queries (`getByRole`, `getByLabelText`, `queryByText`) against a jsdom document under
      Jest, opted in via `/** @jest-environment jsdom */` at the top of the file.
    files:
      - test/app.test.js
    rationale: |
      Covers ACs 1, 2, 3, 4, 5, 6, and 7 end to end: opening the modal, submitting empty
      required fields, submitting valid fields, and cancelling.
tests:
  - |
    AC8 — tests/currency.test.js, USD formatting with two decimal places:
    ```js
    const { formatCurrencyUSD } = require('../public/currency');

    test('formats a number as USD with two decimal places', () => {
      expect(formatCurrencyUSD(12.5)).toBe('$12.50');
    });
    test('rounds to two decimal places', () => {
      expect(formatCurrencyUSD(9.999)).toBe('$10.00');
    });
    ```
    Minimal code to pass: `function formatCurrencyUSD(amount) { return '$' + amount.toFixed(2); }`
    in `public/currency.js`.
  - |
    ACs 2-4 — tests/validation.test.js, required-field detection (pure logic):
    ```js
    const { validateExpenseForm } = require('../public/validation');

    test('flags amount, date, and category as invalid when empty', () => {
      const result = validateExpenseForm({ amount: '', date: '', category: '', description: '' });
      expect(result.valid).toBe(false);
      expect(result.errors.amount).toBe('Amount is required.');
      expect(result.errors.date).toBe('Date is required.');
      expect(result.errors.category).toBe('Category is required.');
    });
    test('is valid when amount, date, and category are provided', () => {
      const result = validateExpenseForm({ amount: '25.00', date: '2026-09-21', category: 'Food', description: '' });
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual({});
    });
    ```
  - |
    AC1 — tests/app.test.js, the Add Expense button opens a modal with the four required fields
    and the exact category options:
    ```js
    /** @jest-environment jsdom */
    const { getByRole, getByLabelText, fireEvent } = require('@testing-library/dom');
    const { renderApp } = require('../public/app');

    test('opens the modal with amount, date, category, and description fields', () => {
      document.body.innerHTML = '<div id="root"></div>';
      const root = document.getElementById('root');
      renderApp(root);
      fireEvent.click(getByRole(root, 'button', { name: 'Add Expense' }));
      const modal = getByRole(root, 'dialog');
      expect(modal.hidden).toBe(false);
      expect(getByLabelText(modal, 'Amount')).toBeTruthy();
      expect(getByLabelText(modal, 'Date')).toBeTruthy();
      const category = getByLabelText(modal, 'Category');
      expect(Array.from(category.options).map(o => o.value).filter(Boolean))
        .toEqual(['Food', 'Transport', 'Housing', 'Entertainment', 'Other']);
      expect(getByLabelText(modal, 'Description (optional)')).toBeTruthy();
    });
    ```
  - |
    ACs 2 and 3 — tests/app.test.js, submitting with required fields empty keeps the modal open
    and marks each invalid field:
    ```js
    fireEvent.click(getByRole(modal, 'button', { name: 'Save' }));
    expect(modal.hidden).toBe(false);
    expect(getByLabelText(modal, 'Amount').classList.contains('field-invalid')).toBe(true);
    expect(getByLabelText(modal, 'Date').classList.contains('field-invalid')).toBe(true);
    expect(getByLabelText(modal, 'Category').classList.contains('field-invalid')).toBe(true);
    ```
  - |
    AC4 — tests/app.test.js, an inline error message renders below each invalid field:
    ```js
    const { queryByText } = require('@testing-library/dom');
    expect(queryByText(modal, 'Amount is required.')).toBeTruthy();
    expect(queryByText(modal, 'Date is required.')).toBeTruthy();
    expect(queryByText(modal, 'Category is required.')).toBeTruthy();
    ```
  - |
    ACs 5, 6, and 8 — tests/app.test.js, a valid submit closes the modal and prepends a
    correctly-formatted expense to the list:
    ```js
    const { getAllByRole } = require('@testing-library/dom');
    fireEvent.change(getByLabelText(modal, 'Amount'), { target: { value: '42.5' } });
    fireEvent.change(getByLabelText(modal, 'Date'), { target: { value: '2026-09-21' } });
    fireEvent.change(getByLabelText(modal, 'Category'), { target: { value: 'Food' } });
    fireEvent.click(getByRole(modal, 'button', { name: 'Save' }));
    expect(modal.hidden).toBe(true);
    const items = getAllByRole(root, 'listitem');
    expect(items[0].textContent).toContain('$42.50');
    expect(items[0].textContent).toContain('Food');
    ```
  - |
    AC7 — tests/app.test.js, cancelling the modal creates no expense:
    ```js
    fireEvent.click(getByRole(modal, 'button', { name: 'Cancel' }));
    expect(modal.hidden).toBe(true);
    expect(root.querySelectorAll('#expense-list li').length).toBe(0);
    ```
assumptions_or_open_questions:
  - |
    This repo already has an Express/Jest/Supertest backend from TEST-M1-STORY-036
    (`package.json`, `src/server.js`, `src/employees/*`, `test/employees.test.js`, all
    verified present and CommonJS-based), unlike an earlier draft of this plan which assumed
    a fully greenfield repo with no `package.json`. This story's ACs are UI/DOM-only, so this
    plan reuses the existing Jest runner (adding only `jest-environment-jsdom`) rather than
    introducing Vitest as a second test runner.
  - |
    No frontend exists yet anywhere in the repo. New frontend files are placed under `public/`
    (not `src/`, which so far only holds backend request-handling code) so they can be served
    directly by the existing Express app via `express.static`, rather than shipping as a
    disconnected, unwired app.
  - |
    There is no bundler in the repo and this plan does not add one. Each frontend module
    (`currency.js`, `validation.js`, `app.js`) is written as a plain global-declaring script
    for the browser, with an `if (typeof module !== 'undefined') module.exports = {...}` guard
    so the same unmodified file is also `require`-able from Jest tests. This is a deliberate
    trade-off to avoid introducing build tooling; worth confirming it's acceptable versus
    adding a bundler in a later story.
  - |
    `design-system/tokens.json`/`tokens.css` (verified) define no dedicated danger/error color
    — `--color-primary` is the brand yellow `#eab308`, not red. Invalid-field/error styling in
    `public/styles.css` therefore uses a hardcoded red (`#f87171`) rather than a design token.
    If a dedicated error token is added to the design system later, `public/styles.css` should
    switch to it.
  - |
    Amount validation only checks for presence (non-empty), not that the value is a valid
    positive number, since ACs 2-4 describe the failure condition strictly as "empty/
    unselected". Whether non-numeric/zero/negative amounts should also be rejected is not
    specified by this story.
  - |
    Expenses live in an in-memory array inside `public/app.js` and are lost on reload. No
    server-side persistence endpoint is added for expenses, unlike the employees resource's
    explicit "persisted in the system" AC — no AC in this story mentions expenses surviving a
    reload or being retrievable via an API.
  - |
    The modal is a plain `<div role="dialog">` toggled via the `hidden` attribute rather than
    the native `<dialog>` element, because jsdom's `showModal()`/`close()` support is
    inconsistent across versions and would make tests environment-fragile; Escape-key handling
    is wired manually to satisfy AC7's "dismiss" wording.
  - |
    Date field is a native `<input type="date">` with only a required check — no min/max or
    future-date restriction is implied by the ACs.
package_dependencies:
  - name: jest-environment-jsdom
    version: ^29.7.0
    ecosystem: npm
    rationale: |
      Jest 28+ moved the jsdom test environment out of the core `jest` package into its own
      module. `test/app.test.js` opts into it per-file via `/** @jest-environment jsdom */` to
      run button-click/form-submit/modal-visibility assertions against `public/app.js` without
      a real browser, without changing the default environment used by the existing
      Node-environment `test/employees.test.js`.
  - name: "@testing-library/dom"
    version: ^10.4.0
    ecosystem: npm
    rationale: |
      Accessible queries (`getByRole`, `getByLabelText`, `queryByText`) and `fireEvent` used in
      `test/app.test.js` to interact with the rendered modal/list the same way a user would.
notes: |
  TEST-M1-STORY-036 already merged the backend scaffold (`git log` shows commit `698bd41`);
  this story adds the first frontend surface on top of it. The diagram shows how the new
  `public/` modules connect to each other, to the untouched `src/employees/*` backend, and to
  the existing Express app factory that now also serves them as static files.

  ```mermaid
  flowchart TD
    Server["src/server.js"] -->|express.static, new| Public["public/index.html"]
    Server -->|unchanged| EmployeesRouter["src/employees/routes.js"]
    Public -->|script tags, then renderApp root| App["public/app.js"]
    App -->|validateExpenseForm on submit| Validation["public/validation.js"]
    App -->|formatCurrencyUSD for list items| Currency["public/currency.js"]
    Public -->|link rel=stylesheet| Styles["public/styles.css"]
    Styles -->|var references, unchanged| Tokens["design-system/tokens.css"]
    TestApp["test/app.test.js"] -->|jsdom + testing-library| App
    TestCurrency["test/currency.test.js"] --> Currency
    TestValidation["test/validation.test.js"] --> Validation

    classDef touched fill:#f96,color:#000
    class Server,Public,App,Validation,Currency,Styles,TestApp,TestCurrency,TestValidation touched
  ```

  Layering rationale: `src/server.js` gains one line (`express.static`) so the new UI is
  reachable at `/` without a separate dev server or touching the `/employees` API mount;
  `public/app.js` is the only module ACs 1-7 exercise directly, delegating validation and
  formatting to the two pure helper modules so those rules stay unit-testable in isolation from
  DOM concerns, exactly mirroring how `src/employees/routes.js` delegates persistence to
  `src/employees/store.js` in the existing backend code.
