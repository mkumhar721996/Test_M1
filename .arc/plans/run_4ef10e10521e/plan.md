summary: |
  A prior draft of this plan assumed a greenfield repo with only design-system CSS, and scoped a
  vanilla-JS/localStorage browser app with a Vitest+jsdom test suite. That assumption is now
  stale: a sibling story (TEST-M1-STORY-036) has since merged a real Node.js/Express backend
  (src/server.js, src/index.js), a Jest+Supertest test suite, and an `employees` module
  (src/employees/store.js + routes.js) implemented as a headless in-memory-store REST API with
  no frontend at all — no HTML, no browser, no DOM tooling exists anywhere in the repo. This plan
  replaces the stale draft: it implements expense deletion-with-confirmation as a REST API on the
  same Express app, following the exact module shape already established by `employees`
  (a `store.js` owning an in-memory Map, a `routes.js` owning HTTP concerns, mounted from
  `src/server.js`), and reuses the already-installed jest/supertest/express — no new
  dependencies. Because the acceptance criteria are worded in UI language ("viewing the expense
  list", "a confirmation prompt appears", "the page is reloaded", "the empty state ... is
  displayed") but the only real architecture in this repo is a stateless JSON API, this plan
  translates each AC to its API-level equivalent (a two-step DELETE confirmed via a `confirm`
  query flag, a GET /expenses list response, and an empty-state message field) and calls this
  translation out explicitly as the single biggest open question for the reviewer, since it is a
  significant interpretive choice, not a fact derivable from the code.
scope:
  - description: |
      Add the expenses persistence layer, mirroring `src/employees/store.js` exactly (in-memory
      `Map`, `crypto.randomUUID()` ids). Adds a `clearExpenses` export purely for test isolation
      between cases (the employees store doesn't need this today because its tests never assert
      on the full collection, but the empty-state AC here requires a clean slate per test).

      ```js
      const crypto = require('crypto');

      const expenses = new Map();

      function createExpense(data) {
        const expense = { ...data, id: crypto.randomUUID() };
        expenses.set(expense.id, expense);
        return expense;
      }

      function listExpenses() {
        return Array.from(expenses.values());
      }

      function getExpense(id) {
        return expenses.get(id);
      }

      function deleteExpense(id) {
        return expenses.delete(id);
      }

      function clearExpenses() {
        expenses.clear();
      }

      module.exports = { createExpense, listExpenses, getExpense, deleteExpense, clearExpenses };
      ```
    files:
      - src/expenses/store.js
    rationale: |
      Matches the established persistence pattern in src/employees/store.js so the codebase stays
      consistent. `createExpense` is exported so tests can seed fixture rows directly (there is no
      "add expense" HTTP endpoint in scope for this story — that belongs to a sibling CRUD story
      under the same epic per the parent epic description).
  - description: |
      Add the expenses HTTP routes: `GET /` (list, with an empty-state message) and `DELETE /:id`
      (two-step delete, confirmed via a `confirm=true` query flag).

      ```js
      const express = require('express');
      const { listExpenses, getExpense, deleteExpense } = require('./store');

      const router = express.Router();

      router.get('/', (req, res) => {
        const expenses = listExpenses();
        if (expenses.length === 0) {
          return res.status(200).json({ expenses: [], message: 'No expenses yet' });
        }
        res.status(200).json({ expenses });
      });

      router.delete('/:id', (req, res) => {
        const expense = getExpense(req.params.id);
        if (!expense) {
          return res.status(404).json({ error: 'expense not found' });
        }

        if (req.query.confirm !== 'true') {
          return res.status(200).json({
            id: expense.id,
            status: 'confirmation_required',
            message: 'Delete this expense permanently? This action cannot be undone.',
          });
        }

        deleteExpense(req.params.id);
        res.status(204).end();
      });

      module.exports = router;
      ```
    files:
      - src/expenses/routes.js
    rationale: |
      `DELETE /:id` without `?confirm=true` is the API-level equivalent of AC1's "a confirmation
      prompt appears": it does not delete, it returns the prompt payload. `DELETE
      /:id?confirm=true` is the equivalent of the user confirming (AC2/AC3). Not sending the
      confirmed request at all is the equivalent of the user cancelling (AC4) — there is no
      separate cancel endpoint because no server-side "pending" state is stored between the two
      requests, keeping each request stateless like the existing employees routes. `GET /` is new
      (employees has no list route) because AC2/AC4/AC5 all talk about "the list", which has no
      other observable surface in this headless API.
  - description: |
      Mount the new router on the existing Express app, alongside the existing employees router.

      Before:
      ```js
      app.use('/employees', employeesRouter);
      ```
      After:
      ```js
      const expensesRouter = require('./expenses/routes');
      // ...
      app.use('/employees', employeesRouter);
      app.use('/expenses', expensesRouter);
      ```
    files:
      - src/server.js
    rationale: |
      `src/server.js` is the single place the existing employees router is wired in; the same
      app factory must mount the new expenses router for it to be reachable, and this keeps
      `src/index.js` (the process entrypoint) untouched.
  - description: |
      Write the failing tests first (see `tests` below for the actual assertions), covering all
      five acceptance criteria, before writing `store.js`/`routes.js` above or the `server.js`
      change.
    files:
      - test/expenses.test.js
    rationale: |
      TDD ordering: this file is written and run (red, currently 404s since no `/expenses` route
      exists) before the implementation files in this scope list are added, then implementation
      is added until it goes green.
tests:
  - |
    AC1 — activating delete (an unconfirmed DELETE) shows a confirmation prompt and does not delete.
    ```js
    const request = require('supertest');
    const app = require('../src/server');
    const { createExpense, clearExpenses } = require('../src/expenses/store');

    beforeEach(() => {
      clearExpenses();
    });

    test('DELETE without confirm shows a confirmation prompt and does not delete', async () => {
      const expense = createExpense({ amount: 12.5, date: '2026-01-01', category: 'Food', description: 'Coffee' });

      const res = await request(app).delete(`/expenses/${expense.id}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('confirmation_required');
      expect(res.body.message).toMatch(/permanently/i);

      const listRes = await request(app).get('/expenses');
      expect(listRes.body.expenses).toEqual([expense]);
    });
    ```
  - |
    AC2 — confirming deletion (`?confirm=true`) removes the record from the list.
    ```js
    test('DELETE with confirm=true removes the record from the list', async () => {
      const expense = createExpense({ amount: 12.5, date: '2026-01-01', category: 'Food', description: 'Coffee' });

      await request(app).delete(`/expenses/${expense.id}`);
      const confirmRes = await request(app).delete(`/expenses/${expense.id}`).query({ confirm: 'true' });
      expect(confirmRes.status).toBe(204);

      const listRes = await request(app).get('/expenses');
      expect(listRes.body.expenses.find((e) => e.id === expense.id)).toBeUndefined();
    });
    ```
  - |
    AC3 — the record remains deleted across independent, subsequent list requests (simulated reload).
    ```js
    test('a deleted record remains deleted on subsequent list requests', async () => {
      const expense = createExpense({ amount: 12.5, date: '2026-01-01', category: 'Food', description: 'Coffee' });
      await request(app).delete(`/expenses/${expense.id}`).query({ confirm: 'true' });

      const firstReload = await request(app).get('/expenses');
      const secondReload = await request(app).get('/expenses');
      expect(firstReload.body.expenses.find((e) => e.id === expense.id)).toBeUndefined();
      expect(secondReload.body.expenses.find((e) => e.id === expense.id)).toBeUndefined();
    });
    ```
  - |
    AC4 — cancelling (never sending the confirmed request) leaves the record and the list unchanged.
    ```js
    test('not confirming leaves the record and the list unchanged', async () => {
      const expense = createExpense({ amount: 3, date: '2026-01-02', category: 'Misc', description: 'Snack' });

      await request(app).delete(`/expenses/${expense.id}`);

      const listRes = await request(app).get('/expenses');
      expect(listRes.body.expenses).toEqual([expense]);
    });
    ```
  - |
    AC5 — deleting the last record shows the empty state.
    ```js
    test('deleting the last record shows the empty state', async () => {
      const expense = createExpense({ amount: 3, date: '2026-01-02', category: 'Misc', description: 'Snack' });
      await request(app).delete(`/expenses/${expense.id}`).query({ confirm: 'true' });

      const listRes = await request(app).get('/expenses');
      expect(listRes.body.expenses).toEqual([]);
      expect(listRes.body.message).toBe('No expenses yet');
    });
    ```
assumptions_or_open_questions:
  - |
    Biggest open question: the acceptance criteria are worded as UI behavior ("viewing the
    expense list", "a confirmation prompt appears", "the page is reloaded", "the empty state ...
    is displayed"), but the repo has no frontend, browser test tooling, or HTML anywhere — only a
    headless Express/Jest/Supertest backend (from the merged TEST-M1-STORY-036) and a
    design-system CSS asset that nothing currently loads. This plan treats every AC as describing
    the API contract a future UI would consume, mirroring how the already-merged employees story
    treated "persisted in the system" as backend behavior. If a frontend is actually planned to
    land separately (and consume this API), that's outside this story's stated scope; if instead
    a UI was expected to be built as PART of this story, this plan's whole approach would need to
    change.
  - |
    "Activate the delete action" (AC1) and "confirms deletion" (AC2/AC3) are modeled as two
    separate `DELETE /expenses/:id` requests distinguished by a `confirm=true` query flag, rather
    than a stateful two-endpoint flow (e.g. a separate `POST /expenses/:id/confirm-delete`). This
    keeps every request stateless (no "pending deletion" flag persisted on the record between
    requests), matching the stateless style of the existing employees routes.
  - |
    "Cancels" (AC4) has no dedicated endpoint or server-side state to clear: because nothing is
    marked pending after the unconfirmed DELETE, cancelling is simply the client never sending the
    confirmed request. This is the simplest reading consistent with the stateless design above.
  - |
    "The record disappears from the list" / "the empty state is displayed" (AC2/AC5) are modeled
    via a new `GET /expenses` route returning `{ expenses: [...] }`, with an added `message: 'No
    expenses yet'` field when the array is empty. Employees has no equivalent list route today;
    this is a new but minimal addition needed because no other part of this API currently exposes
    "the list" as an observable response.
  - |
    "After the page is reloaded" (AC3) is modeled as two independent, sequential `GET /expenses`
    requests against the same running server process, since there is no browser/session/cache
    layer in this architecture — the in-memory store persists for the life of the process exactly
    as already accepted for the employees store's "persisted in the system" behavior.
  - |
    No "create expense" HTTP endpoint is added in this plan (out of scope per the parent epic,
    which assigns create/edit to sibling CRUD stories); `createExpense` is exported from the store
    purely so tests can seed fixture rows directly, mirroring how store functions are already
    unit-importable in this codebase.
  - |
    Assumed expense records need at minimum `amount`, `date`, `category`, `description` fields
    (matching the parent epic's field list) plus a generated `id`, matching the shape already used
    for employee records.
package_dependencies: []
notes: |
  This repo diverged significantly since the original TEST-M1-STORY-033 plan was drafted: `git
  log` shows TEST-M1-STORY-036 merged an Express/Jest/Supertest backend and an `employees` module
  in the interim (package.json now declares `express`, `jest`, `supertest`; there is still no
  frontend, build step, or browser tooling anywhere). This plan reuses that existing tooling
  as-is and adds no new package dependencies.

  ```mermaid
  flowchart TD
    Index[src/index.js] --> Server[src/server.js]
    Server --> EmpRoutes[src/employees/routes.js]
    Server --> ExpRoutes[src/expenses/routes.js]
    ExpRoutes --> ExpStore[src/expenses/store.js]
    EmpRoutes --> EmpStore[src/employees/store.js]
    Test[test/expenses.test.js] -->|supertest against exported app| Server
    Test -->|seeds fixtures directly| ExpStore

    classDef touched fill:#f96,color:#000
    class Server,ExpRoutes,ExpStore,Test touched
  ```

  `src/server.js` is touched only to add one `app.use('/expenses', ...)` line alongside the
  existing employees mount. `src/expenses/routes.js` and `src/expenses/store.js` are new, built to
  mirror `src/employees/routes.js`/`store.js` exactly in shape (Map-backed store, Express router
  delegating all persistence to the store). `src/index.js` and the employees module are shown for
  context only and are not modified.
