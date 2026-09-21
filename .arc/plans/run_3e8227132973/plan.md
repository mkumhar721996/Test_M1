summary: |
  The repository currently contains no application code at all — only a design-token CSS system
  (design-system/tokens.css, prototype-utils.css, style-guide.html) and a placeholder README.
  There is no expense list, no CRUD, no storage, no test runner, and no package.json. This story
  (TEST-M1-STORY-033) asks for "delete with confirmation" on an expense list, which presupposes a
  list already exists. Since no prior story has landed that vertical slice yet, this plan scaffolds
  the minimal pieces needed to make the five acceptance criteria true and testable: a vanilla-JS,
  localStorage-backed expense store, a list renderer with a custom confirmation dialog (built from
  the existing .card/.btn design-system classes, no new CSS component), and a Vitest+jsdom test
  suite that drives the delete/confirm/cancel/reload/empty-state behavior. It deliberately does NOT
  build create/edit forms, validation, or currency handling — those belong to sibling CRUD stories
  under the same epic. Test fixtures seed expense records directly through the store module rather
  than through a UI, since no "add expense" flow exists yet.
scope:
  - description: |
      Create the project manifest and test tooling. No package.json exists yet in the repo.
      Add Vitest (test runner) + jsdom (DOM environment) + @testing-library/dom (role/text queries
      and fireEvent) as devDependencies, an ESM `"type": "module"` package, and a `test` script.

      ```json
      {
        "name": "test-m1",
        "private": true,
        "type": "module",
        "scripts": {
          "test": "vitest run"
        },
        "devDependencies": {
          "vitest": "^2.1.0",
          "jsdom": "^25.0.0",
          "@testing-library/dom": "^10.4.0"
        }
      }
      ```
    files:
      - package.json
    rationale: |
      Nothing in the repo currently declares a JS toolchain or test runner; TDD for this story is
      impossible without one. Vitest+jsdom is the lightest option that lets AC3 ("remains deleted
      after reload") be verified by re-invoking the render entrypoint against the same in-memory
      jsdom localStorage, without standing up a browser/e2e harness for a single story.
  - description: |
      Add a Vitest config pointing the `test` environment at jsdom and the test glob at
      `test/**/*.test.js`.

      ```js
      import { defineConfig } from 'vitest/config';

      export default defineConfig({
        test: {
          environment: 'jsdom',
          include: ['test/**/*.test.js'],
        },
      });
      ```
    files:
      - vitest.config.js
    rationale: |
      Vitest defaults to a `node` environment; the tests need `document`/`localStorage` (jsdom).
  - description: |
      Add the persistence layer: a thin localStorage-backed store for expense records. This is the
      only module that touches `localStorage` directly.

      ```js
      export const STORAGE_KEY = 'expenses';

      export function loadExpenses() {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
      }

      export function saveExpenses(expenses) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(expenses));
      }

      export function deleteExpense(id) {
        const remaining = loadExpenses().filter((expense) => expense.id !== id);
        saveExpenses(remaining);
        return remaining;
      }
      ```
    files:
      - src/expenses/store.js
    rationale: |
      AC3 requires deletion to survive a reload, which means the source of truth cannot live only
      in JS memory. localStorage is the only persistence mechanism available (no backend exists in
      this repo). Tests seed fixture data by calling `saveExpenses(...)` directly, since no
      "create expense" UI exists yet to seed data through.
  - description: |
      Add the list renderer and delete/confirm/cancel interaction. Exposes a single entrypoint:

      `export function renderApp(root)` — reads current expenses from the store on every call,
      and renders either the list or the empty state into `root`. Internal `pendingDeleteId` state
      is scoped to the function call (reset on every invocation), so calling `renderApp(root)` a
      second time behaves exactly like a fresh page load reading persisted localStorage state —
      this is how AC3's reload is simulated in tests.

      Each expense row gets a delete button: `<button aria-label="Delete ${description}">Delete</button>`.
      Clicking it does not delete immediately — it shows a confirmation region with
      `role="alertdialog"`, the text `Delete "${description}" permanently? This cannot be undone.`,
      and two buttons: `Confirm delete` (class `btn btn-primary`) and `Cancel` (class `btn
      btn-secondary`). Confirm calls `deleteExpense(id)` from the store and re-renders; Cancel just
      clears the pending state and re-renders, leaving the list untouched. When the resulting list
      is empty (either on initial render or after a delete), render the exact text `No expenses
      yet` instead of the list. Rows and the dialog reuse existing `.card`/`.btn` classes from
      design-system/prototype-utils.css — no new CSS is added.
    files:
      - src/expenses/list.js
    rationale: |
      This is the module under test for all five ACs: it owns showing the confirmation prompt,
      wiring confirm/cancel, and rendering the empty state.
  - description: |
      Add the browser entrypoint that mounts the app on page load, wiring `renderApp` from
      `list.js` to the `#app` element.

      ```js
      import { renderApp } from './list.js';

      document.addEventListener('DOMContentLoaded', () => {
        renderApp(document.getElementById('app'));
      });
      ```
    files:
      - src/expenses/app.js
    rationale: |
      Separates the "how to render" module (list.js, unit-tested directly) from "when to mount"
      (app.js, real page load), matching how the tests invoke `renderApp` directly without going
      through a DOM `DOMContentLoaded` event.
  - description: |
      Add the static HTML entry page: links the existing design-system tokens/utility CSS, an
      `<div id="app"></div>` mount point, and loads `app.js` as an ES module. No build step
      required since this is a single native ES module import.
    files:
      - index.html
    rationale: |
      Gives the story a real page to view the expense list in, consistent with AC1's "viewing the
      expense list" framing, and lets the existing design-system CSS be exercised end to end.
  - description: |
      Write the failing tests first (see `tests` below for the actual assertions), covering all
      five acceptance criteria, before writing `store.js`/`list.js`/`app.js` above.
    files:
      - test/expenses/delete-expense.test.js
    rationale: |
      TDD ordering: this file is written and run (red) before the implementation files in this
      scope list are written, then implementation is added until it goes green.
tests:
  - |
    AC1 — activating delete shows a confirmation prompt.
    ```js
    import { beforeEach, describe, expect, it } from 'vitest';
    import { fireEvent, screen } from '@testing-library/dom';
    import { saveExpenses } from '../../src/expenses/store.js';
    import { renderApp } from '../../src/expenses/list.js';

    beforeEach(() => {
      localStorage.clear();
      document.body.innerHTML = '<div id="app"></div>';
    });

    it('shows a confirmation prompt when the delete action is activated', () => {
      saveExpenses([{ id: '1', amount: 12.5, date: '2026-01-01', category: 'Food', description: 'Coffee' }]);
      renderApp(document.getElementById('app'));

      fireEvent.click(screen.getByRole('button', { name: /delete coffee/i }));

      expect(screen.getByRole('alertdialog')).toBeTruthy();
      expect(screen.getByRole('button', { name: /confirm delete/i })).toBeTruthy();
    });
  - |
    AC2 — confirming deletion removes the record from the list.
    ```js
    it('removes the record from the list once deletion is confirmed', () => {
      saveExpenses([{ id: '1', amount: 12.5, date: '2026-01-01', category: 'Food', description: 'Coffee' }]);
      renderApp(document.getElementById('app'));

      fireEvent.click(screen.getByRole('button', { name: /delete coffee/i }));
      fireEvent.click(screen.getByRole('button', { name: /confirm delete/i }));

      expect(screen.queryByText('Coffee')).toBeNull();
    });
  - |
    AC3 — the record stays deleted after a (simulated) page reload.
    ```js
    it('keeps the record deleted after the page is reloaded', () => {
      saveExpenses([{ id: '1', amount: 12.5, date: '2026-01-01', category: 'Food', description: 'Coffee' }]);
      const root = document.getElementById('app');
      renderApp(root);
      fireEvent.click(screen.getByRole('button', { name: /delete coffee/i }));
      fireEvent.click(screen.getByRole('button', { name: /confirm delete/i }));

      root.innerHTML = '';
      renderApp(root); // fresh render against persisted localStorage, mirrors a real reload

      expect(screen.queryByText('Coffee')).toBeNull();
    });
  - |
    AC4 — cancelling leaves the record and the list unchanged.
    ```js
    it('keeps the record when cancel is chosen', () => {
      saveExpenses([{ id: '1', amount: 3, date: '2026-01-02', category: 'Misc', description: 'Snack' }]);
      renderApp(document.getElementById('app'));

      fireEvent.click(screen.getByRole('button', { name: /delete snack/i }));
      fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

      expect(screen.getByText('Snack')).toBeTruthy();
      expect(screen.queryByRole('alertdialog')).toBeNull();
    });
  - |
    AC5 — deleting the last record shows the empty state.
    ```js
    it('shows the empty state once the last record is deleted', () => {
      saveExpenses([{ id: '1', amount: 3, date: '2026-01-02', category: 'Misc', description: 'Snack' }]);
      renderApp(document.getElementById('app'));

      fireEvent.click(screen.getByRole('button', { name: /delete snack/i }));
      fireEvent.click(screen.getByRole('button', { name: /confirm delete/i }));

      expect(screen.getByText('No expenses yet')).toBeTruthy();
    });
assumptions_or_open_questions:
  - |
    No app scaffold, framework, or backend exists anywhere in the repo today — only the
    design-system CSS/tokens and a one-line README. This plan introduces the minimal vanilla-JS +
    localStorage structure needed to exercise delete/confirm, since no prior "list/create expense"
    story has landed. If a framework choice (React, etc.) or backend is decided elsewhere before
    this is implemented, this plan's file layout (not its test intent) would need to change.
  - |
    No "create expense" UI exists yet, so tests seed fixture rows by calling `saveExpenses(...)`
    from the store module directly rather than driving a real creation flow.
  - |
    AC3's "after the page is reloaded" is verified by clearing the mount node and calling
    `renderApp(root)` again against the same jsdom `localStorage`, rather than a real browser
    navigation/e2e reload — no e2e infra (e.g. Playwright) exists in the repo, and introducing one
    for a single story felt like scope creep beyond what the ACs require.
  - |
    Assumed expense records need at minimum `id`, `amount`, `date`, `category`, `description`
    fields, matching the parent epic's field list plus an `id` for identifying which row to delete.
  - |
    Assumed a custom in-page confirmation region (`role="alertdialog"`, built from the existing
    `.card`/`.btn`/`.btn-primary`/`.btn-secondary` design-system classes) satisfies "a confirmation
    prompt appears," rather than the native `window.confirm()` — chosen for testability with
    Testing Library and visual consistency with the existing design system, since native
    `confirm()` cannot be styled and is awkward to assert on in jsdom.
package_dependencies:
  - name: vitest
    version: ^2.1.0
    ecosystem: npm
    rationale: |
      Test runner for the TDD suite; nothing in the repo currently runs any tests.
  - name: jsdom
    version: ^25.0.0
    ecosystem: npm
    rationale: |
      DOM environment for Vitest so `document`/`localStorage` are available to the list renderer
      and store tests without a real browser.
  - name: '@testing-library/dom'
    version: ^10.4.0
    ecosystem: npm
    rationale: |
      Provides `screen`/`fireEvent`/role-based queries used by every test in this plan to find the
      delete button, the confirmation dialog, and its confirm/cancel buttons.
notes: |
  This is a greenfield repo: `git log` shows only three "design system bootstrap" commits and an
  initial commit, and there is no `package.json`, `src/`, or `test/` directory anywhere yet. The
  only reusable asset is `design-system/` (tokens.css, prototype-utils.css, style-guide.html),
  which defines `.btn`/`.btn-primary`/`.btn-secondary`/`.card`/`.card-title`/`.card-body` classes
  built from CSS custom properties — this plan reuses those verbatim for expense rows and the
  confirmation dialog rather than adding any new CSS, since nothing about "delete with
  confirmation" requires new visual primitives.

  Because this touches 6 new files across a UI → persistence boundary, here is the call shape:

  ```mermaid
  flowchart TD
    index[index.html] -->|loads as ES module| app[src/expenses/app.js]
    app -->|mounts on DOMContentLoaded| list[src/expenses/list.js]
    list -->|read/write on delete/confirm| store[src/expenses/store.js]
    store -->|getItem/setItem| ls[(browser localStorage)]
    test[test/expenses/delete-expense.test.js] -->|drives renderApp directly| list
    test -->|seeds fixtures via saveExpenses| store

    classDef touched fill:#f96,color:#000
    class index,app,list,store,test touched
  ```

  `list.js` is the only module under direct test; `store.js` is exercised indirectly through it
  plus directly for fixture seeding. `app.js`/`index.html` exist so the story has a real page to
  view, per AC1's "viewing the expense list" framing, but are not covered by automated tests since
  they contain no logic beyond wiring `DOMContentLoaded` to `renderApp`.
