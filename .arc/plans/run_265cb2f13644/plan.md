summary: |
  Today `employees` is an in-memory `Map` (`src/employees/store.js`) that resets on every
  restart, and `expenses` has no server-side existence at all — `public/js/expenses.js` reads
  and writes a `localStorage['expenses']` key directly and there is no `/expenses` (or
  `/api/expenses`) route mounted in `src/server.js`. This story adds a SQLite-backed
  persistence layer (`src/db/connection.js`, using `better-sqlite3`) shared by both resources,
  rewrites `src/employees/store.js` to read/write SQLite instead of the `Map`, and — the larger
  half of the work — builds a brand-new Express API for expenses (`src/expenses/store.js` +
  `src/expenses/routes.js`, mounted at `/api/expenses` per the approved design) and rewrites
  `public/js/expenses.js` to fetch from that API instead of `localStorage`, with explicit
  loading/error states and a one-time migration that deletes the stale `localStorage['expenses']`
  key. Both APIs return an HTTP 500 on a simulated SQLite I/O failure instead of throwing
  unhandled, and the client shows a toast instead of silently falling back to stale/local data.
  The approved prototype at `.arc/designs/TEST-M1-STORY-087-design.html` is the only design
  record for this item and was read in full; every UI-facing task below cites the exact screen,
  markup, and copy it is built from.
scope:
  - description: |
      Add `better-sqlite3` as a dependency in `package.json` (no SQLite driver exists in the
      repo today — `grep -r sqlite` across the worktree returns nothing).
    files:
      - package.json
    rationale: |
      `better-sqlite3` is synchronous, which lets `src/employees/store.js` keep its current
      synchronous function signatures (`createEmployee`, `getEmployee`) with zero changes to
      `src/employees/routes.js`'s calling convention beyond adding error handling — avoiding a
      cascade of `async`/`await` changes through code that doesn't otherwise need it.
  - description: |
      Add the SQLite connection module. New file `src/db/connection.js`:
      ```js
      const fs = require('fs');
      const path = require('path');
      const Database = require('better-sqlite3');

      let db;

      function resolveDbPath() {
        return process.env.SQLITE_DB_PATH || path.join(__dirname, '..', '..', 'data', 'app.db');
      }

      function getDb() {
        if (!db) {
          const dbPath = resolveDbPath();
          fs.mkdirSync(path.dirname(dbPath), { recursive: true });
          db = new Database(dbPath);
          db.exec(`
            CREATE TABLE IF NOT EXISTS employees (id TEXT PRIMARY KEY, data TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS expenses (id TEXT PRIMARY KEY, data TEXT NOT NULL);
          `);
        }
        return db;
      }

      function closeDb() {
        if (db) { db.close(); db = undefined; }
      }

      module.exports = { getDb, closeDb };
      ```
      Each row stores its full record as a JSON blob under `data`, keyed by `id`. This mirrors
      the current `Map`'s flexibility (both employees and hires today do `{ ...data, id }` with
      no fixed field list) rather than hard-coding a column per field.
    files:
      - src/db/connection.js
    rationale: |
      A single shared module is the "real persistence layer that all other epics build on" per
      the parent epic description — future stores (hires, runs, workflows) can call `getDb()`
      and `CREATE TABLE IF NOT EXISTS` their own table without touching this file.
      `resolveDbPath()` reads `SQLITE_DB_PATH` so tests can point at an isolated temp file
      instead of the real `data/app.db`, and `closeDb()` exists specifically so tests can
      simulate "the server restarted" by closing the handle and letting the next `getDb()` call
      (after `jest.resetModules()`) reopen the same on-disk file.
  - description: |
      Add `data/` to `.gitignore` (the SQLite file, and its `-wal`/`-shm` sidecar files, must
      not be committed).
    files:
      - .gitignore
    rationale: ""
  - description: |
      Rewrite `src/employees/store.js` to persist through `getDb()` instead of the module-level
      `Map`, keeping the exact same exported function names/signatures so `src/employees/routes.js`
      needs no signature changes:
      ```js
      const crypto = require('crypto');
      const { getDb } = require('../db/connection');

      function createEmployee(data) {
        const employee = { ...data, id: crypto.randomUUID() };
        getDb().prepare('INSERT INTO employees (id, data) VALUES (?, ?)').run(employee.id, JSON.stringify(employee));
        return employee;
      }

      function getEmployee(id) {
        const row = getDb().prepare('SELECT data FROM employees WHERE id = ?').get(id);
        return row ? JSON.parse(row.data) : undefined;
      }

      module.exports = { createEmployee, getEmployee };
      ```
    files:
      - src/employees/store.js
    rationale: |
      Satisfies AC1 for employees. The `Map` is deleted entirely — there is no dual-write
      fallback, since nothing else in the repo reads `src/employees/store.js`'s internal `Map`
      directly (only `routes.js` calls the two exported functions).
  - description: |
      Wrap both `src/employees/routes.js` handlers in `try/catch` so a thrown SQLite error
      becomes an HTTP 500 instead of an unhandled exception:
      ```js
      router.post('/', (req, res) => {
        try {
          res.status(201).json(createEmployee(req.body));
        } catch (err) {
          res.status(500).json({ error: 'failed to persist employee' });
        }
      });

      router.get('/:id', (req, res) => {
        try {
          const employee = getEmployee(req.params.id);
          if (!employee) return res.status(404).json({ error: 'employee not found' });
          res.status(200).json(employee);
        } catch (err) {
          res.status(500).json({ error: 'failed to load employee' });
        }
      });
      ```
    files:
      - src/employees/routes.js
    rationale: |
      Satisfies AC3 for the employees API. Handling the SQLite error explicitly inside each
      route (rather than relying on `src/server.js`'s catch-all error middleware picking up a
      synchronous throw) keeps the error body consistent and labeled the same way the new
      expenses routes below handle it.
  - description: |
      Add the expenses store. New file `src/expenses/store.js`:
      ```js
      const crypto = require('crypto');
      const { getDb } = require('../db/connection');

      function listExpenses() {
        return getDb().prepare('SELECT data FROM expenses ORDER BY rowid DESC')
          .all().map((r) => JSON.parse(r.data));
      }

      function createExpense(data) {
        const expense = { ...data, id: 'exp_' + crypto.randomUUID() };
        getDb().prepare('INSERT INTO expenses (id, data) VALUES (?, ?)').run(expense.id, JSON.stringify(expense));
        return expense;
      }

      function updateExpense(id, changes) {
        const row = getDb().prepare('SELECT data FROM expenses WHERE id = ?').get(id);
        if (!row) return undefined;
        const updated = { ...JSON.parse(row.data), ...changes, id };
        getDb().prepare('UPDATE expenses SET data = ? WHERE id = ?').run(JSON.stringify(updated), id);
        return updated;
      }

      module.exports = { listExpenses, createExpense, updateExpense };
      ```
    files:
      - src/expenses/store.js
    rationale: |
      No expenses store exists today — expenses have only ever lived in the browser. `ORDER BY
      rowid DESC` reproduces the current client behavior of showing newly-created rows first
      (see `public/js/expenses.js`'s `[newExpense, ...expenses]`).
  - description: |
      Add the expenses API. New file `src/expenses/routes.js`, mounted at `/api/expenses` (see
      `src/server.js` change below):
      ```js
      const express = require('express');
      const { listExpenses, createExpense, updateExpense } = require('./store');

      const router = express.Router();

      router.get('/', (req, res) => {
        try { res.status(200).json(listExpenses()); }
        catch (err) { res.status(500).json({ error: 'failed to load expenses' }); }
      });

      router.post('/', (req, res) => {
        try { res.status(201).json(createExpense(req.body)); }
        catch (err) { res.status(500).json({ error: 'failed to save expense' }); }
      });

      router.patch('/:id', (req, res) => {
        try {
          const updated = updateExpense(req.params.id, req.body);
          if (!updated) return res.status(404).json({ error: 'expense not found' });
          res.status(200).json(updated);
        } catch (err) { res.status(500).json({ error: 'failed to save expense' }); }
      });

      module.exports = router;
      ```
    files:
      - src/expenses/routes.js
    rationale: |
      Satisfies AC3 for expenses (500 on I/O failure) and gives the client (AC5) something real
      to fetch from. The design's own error-state copy is explicit about the path:
      `GET /api/expenses → 500 Internal Server Error` and `POST /api/expenses → 500 Internal
      Server Error` (design lines 799, 930-931) — that `/api/expenses` prefix is followed
      exactly, even though every other resource in this repo (`/employees`, `/hires`,
      `/workflows`, `/runs`) is mounted without an `/api` prefix. This is a real inconsistency
      between the approved design and the rest of the app's routing convention; flagged rather
      than silently resolved — see `assumptions_or_open_questions`.
  - description: |
      Mount the new expenses router in `src/server.js`:
      ```js
      const expensesRouter = require('./expenses/routes');
      ...
      app.use('/api/expenses', expensesRouter);
      ```
    files:
      - src/server.js
    rationale: ""
  - description: |
      Rewrite `public/js/expenses.js` to fetch from the API instead of `localStorage`, following
      the same dependency-injection shape `public/js/hire-profile.js` already uses
      (`initHireProfileApp(doc, initialHire, api)` / `createDefaultApi(hireId)`), so tests inject
      a fake `api` instead of mocking `fetch` or `localStorage`:
      ```js
      function createDefaultApi() {
        const withStatus = (promise) => promise.then((res) => (
          res.ok ? res.json() : Promise.reject({ status: res.status })
        ));
        return {
          listExpenses: () => withStatus(fetch('/api/expenses')),
          createExpense: (data) => withStatus(fetch('/api/expenses', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
          })),
          updateExpense: (id, data) => withStatus(fetch(`/api/expenses/${id}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
          })),
        };
      }

      function initExpensesApp(doc = document, api = createDefaultApi()) { /* ... */ }

      function migrateLegacyExpenseStorage(doc = document) {
        let hadKey = false;
        try { hadKey = localStorage.getItem(STORAGE_KEY) !== null; } catch (e) { /* unavailable */ }
        if (hadKey) {
          try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* unavailable */ }
        }
        return hadKey;
      }
      ```
      `initExpensesApp` renders the design's loading state immediately (skeleton rows +
      `.loading-caption` with spinner, `aria-busy="true"` on the table — design lines 541-580),
      then calls `api.listExpenses()`. On success it renders the real rows (unchanged
      row-markup/edit/create logic from the current file). On failure with no rows yet rendered
      it swaps `#expenses-table-scroll` for `#expenses-error-state` (design lines 777-811: icon,
      "Couldn't load expenses", body copy, `.error-detail` showing
      `GET /api/expenses → ${status} ...`, and a "Try again" button that re-runs the same load)
      and fires the toast `Couldn't load expenses — server error (${status}). Try again.`
      (design line 809). On a failed create/edit (AC3/AC4) the modal stays open, the save button
      re-enables, and the toast `Couldn't save expense — server error (${status}). Try again.`
      fires (design lines 1189-1190, 1274) — the table keeps its last known-good rows; it never
      swaps in `localStorage` or stale data. `loadExpenses`/`persistExpenses`/`INITIAL_EXPENSES`
      are deleted — there is no seed data anymore, a fresh `data/app.db` starts with zero
      expense rows and the existing `.empty-row` "No expenses yet." state (already in the file)
      covers that. `window.addEventListener('DOMContentLoaded', ...)` now calls
      `migrateLegacyExpenseStorage(document)` before `initExpensesApp()`.
    files:
      - public/js/expenses.js
    rationale: |
      Satisfies AC2 (migration), AC3/AC4 (error status → toast, no fallback), and AC5 (fetch,
      not localStorage). Reusing the hire-profile DI pattern rather than mocking global `fetch`
      keeps this file's tests consistent with the rest of the test suite's style
      (`test/hire-profile.test.js` already does this for the same reason: controllable promise
      timing without a `fetch` polyfill in the jsdom test environment).
  - description: |
      Add two new static state containers to `public/index.html` inside the existing
      `.card.table-card` div, transcribed from the approved design (loading: lines 558-560;
      error: lines 794-804), plus ids the rewritten JS needs to select and toggle:
      ```html
      <div class="card table-card">
        <div class="loading-caption" id="expenses-loading-caption" hidden>
          <span class="spinner" aria-hidden="true"></span> Loading expenses from the server…
        </div>
        <div class="table-scroll" id="expenses-table-scroll">
          <table class="expense-table" id="expense-table">
            <!-- thead unchanged -->
            <tbody id="expense-tbody"><!-- rendered by JS --></tbody>
          </table>
        </div>
        <div class="error-state" id="expenses-error-state" role="alert" hidden>
          <div class="error-state-icon" aria-hidden="true">⚠</div>
          <h2 class="error-state-title">Couldn't load expenses</h2>
          <p class="error-state-body">The server couldn't read expense records from its database. Your existing data is safe — try again in a moment.</p>
          <div class="error-detail" id="expenses-error-detail"></div>
          <div><button type="button" class="btn btn-primary" id="expenses-error-retry-btn">Try again</button></div>
        </div>
      </div>
      ```
    files:
      - public/index.html
    rationale: |
      The existing static markup only ever had a `<table>` — there was never an error state or
      a loading caption because the old code read `localStorage` synchronously and could never
      "fail" or take observable time. JS toggles `hidden` on `#expenses-loading-caption` /
      `#expenses-table-scroll` / `#expenses-error-state` per state rather than injecting this
      structural markup at runtime, keeping the static HTML the single source of truth for it
      (only `#expense-tbody`'s rows and `#expenses-error-detail`'s text stay JS-rendered, as
      before).
  - description: |
      Add the skeleton/spinner/error-state CSS to `public/css/expenses.css`, transcribed from
      the design's inlined page-specific `<style>` block (design lines 381-427) — token-only,
      no hardcoded colors, matching UI guideline §0/§3:
      ```css
      .skeleton-row td { padding: var(--space-4); border-bottom: 1px solid var(--color-border); }
      .skeleton-bar {
        height: 14px; border-radius: var(--radius-sm); background: var(--color-surface);
        background-image: linear-gradient(90deg, var(--color-surface) 0%, var(--color-border) 50%, var(--color-surface) 100%);
        background-size: 200% 100%;
        animation: skeleton-shimmer 1.4s ease-in-out infinite;
      }
      @keyframes skeleton-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
      @media (prefers-reduced-motion: reduce) { .skeleton-bar { animation: none; } }
      .loading-caption { display: flex; align-items: center; gap: var(--space-2); padding: var(--space-3) var(--space-4); font-family: var(--font-family-base); font-size: var(--font-size-sm); color: var(--color-fg-muted); border-bottom: 1px solid var(--color-border); }
      .spinner { width: 14px; height: 14px; border-radius: 50%; border: 2px solid var(--color-border); border-top-color: var(--color-primary); animation: spin 0.8s linear infinite; flex: 0 0 auto; }
      @keyframes spin { to { transform: rotate(360deg); } }
      @media (prefers-reduced-motion: reduce) { .spinner { animation: none; } }
      .error-state { text-align: center; padding: var(--space-4) var(--space-3); background: var(--card-default-background); border: 1px solid var(--card-default-border); border-radius: var(--card-default-radius); }
      .error-state-icon { margin: 0 auto var(--space-3); width: 48px; height: 48px; display: flex; align-items: center; justify-content: center; font-size: 28px; color: var(--color-primary); }
      .error-state-title { font-family: var(--font-family-base); font-size: var(--font-size-lg); font-weight: var(--font-weight-bold); color: var(--color-fg); margin: 0 0 var(--space-2); }
      .error-state-body { font-family: var(--font-family-base); font-size: var(--font-size-md); color: var(--color-fg-muted); max-width: 48ch; margin: 0 auto var(--space-4); }
      .error-detail { display: inline-block; margin: 0 auto var(--space-4); padding: var(--space-2) var(--space-3); background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-sm); font-family: monospace; font-size: var(--font-size-sm); color: var(--color-fg-muted); }
      ```
      The design's demo-only classes (`.demo-panel*`, `.persist-badge`, `.restart-overlay`,
      `.migration-card`, `.storage-inspector`, `.status-row`/`.status-dot`, `.reference-grid`,
      `.mini-card`, `.ac-tag`) are not ported — those exist only to power the prototype's
      "Simulate server restart" / "Simulate SQLite I/O error" demo controls and the reference-
      states screen, not the real product UI (see design lines 429-506, 813-966).
    files:
      - public/css/expenses.css
    rationale: ""
  - description: |
      New test file covering AC1 for both resources by simulating a server restart: close the
      shared SQLite handle, `jest.resetModules()`, re-require the store module against the same
      on-disk (temp) file, and confirm the record is still there.
      ```js
      test('AC1: an employee created before "restart" is still readable after the module reloads', () => {
        const { createEmployee } = require('../src/employees/store');
        const employee = createEmployee({ name: 'Ada Lovelace', email: 'ada@example.com', jobTitle: 'Engineer' });
        require('../src/db/connection').closeDb();
        jest.resetModules();
        process.env.SQLITE_DB_PATH = dbPath;
        const { getEmployee } = require('../src/employees/store');
        expect(getEmployee(employee.id)).toEqual(employee);
      });
      ```
    files:
      - test/db-persistence.test.js
    rationale: |
      A literal new OS process isn't available inside a Jest test; closing the `better-sqlite3`
      handle and forcing a fresh `require` of every module in the chain (so `getDb()`'s
      module-level `db` singleton is gone) and re-opening the same file on disk is the closest
      faithful stand-in — the assertion only passes if the data actually round-tripped through
      the file, not through any in-memory cache.
  - description: |
      Add an AC3 test to the existing employees test file: simulate a SQLite I/O error and
      assert the API responds with an HTTP error status instead of crashing.
      ```js
      test('AC3: a SQLite failure on POST /employees responds with an HTTP error status', async () => {
        const { getDb } = require('../src/db/connection');
        const prepareSpy = jest.spyOn(getDb(), 'prepare').mockImplementation(() => {
          throw new Error('SQLITE_IOERR: disk I/O error');
        });
        const res = await request(app).post('/employees').send({ name: 'A', email: 'a@x.com', jobTitle: 'Eng' });
        expect(res.status).toBe(500);
        prepareSpy.mockRestore();
      });
      ```
    files:
      - test/employees.test.js
    rationale: ""
  - description: |
      New test file for the expenses API: CRUD against the real (temp-file) SQLite db for AC1,
      plus the AC3 I/O-failure case for all three routes.
      ```js
      test('AC1: a created expense is returned by a subsequent GET /api/expenses', async () => {
        const created = await request(app).post('/api/expenses').send({ date: '2026-09-20', category: 'Travel', description: 'Taxi', amount: 24.5 });
        const list = await request(app).get('/api/expenses');
        expect(list.body).toContainEqual(created.body);
      });

      test('AC3: a SQLite failure on GET /api/expenses responds with an HTTP error status', async () => {
        const { getDb } = require('../src/db/connection');
        const prepareSpy = jest.spyOn(getDb(), 'prepare').mockImplementation(() => { throw new Error('SQLITE_IOERR: disk I/O error'); });
        const res = await request(app).get('/api/expenses');
        expect(res.status).toBe(500);
        prepareSpy.mockRestore();
      });
      ```
    files:
      - test/expenses-api.test.js
    rationale: ""
  - description: |
      Rewrite the edit-expense jsdom suite to inject a fake `api` (mirroring
      `test/hire-profile.test.js`'s pattern) instead of asserting against `localStorage`, and add
      the AC4 failure-toast/no-fallback case:
      ```js
      test('AC4: a failed save keeps the modal open, re-enables Save, and shows an error toast — the row is not changed', async () => {
        const api = { listExpenses: () => Promise.resolve([fixtureExpense()]), updateExpense: () => Promise.reject({ status: 500 }) };
        const { initExpensesApp } = require('../public/js/expenses');
        initExpensesApp(document, api);
        await Promise.resolve(); await Promise.resolve();
        document.querySelector('[data-edit-id="exp_001"]').click();
        document.getElementById('field-amount').value = '999.99';
        document.getElementById('edit-form').dispatchEvent(new Event('submit', { cancelable: true }));
        await Promise.resolve(); await Promise.resolve();
        expect(document.getElementById('modal-wrap').hidden).toBe(false);
        expect(document.getElementById('modal-save-btn').disabled).toBe(false);
        expect(document.getElementById('toast-message').textContent).toMatch(/Couldn.?t save expense — server error \(500\)/);
      });
      ```
      Existing assertions that just check "the row shows the new value" / "the modal closes" /
      "a success toast fires" are kept, but re-pointed at the injected `api.updateExpense`
      resolving instead of a `persistExpenses` + `localStorage.getItem` check.
    files:
      - test/expenses.test.js
    rationale: |
      The current file's very premise — reload the page via
      `document.documentElement.innerHTML = fs.readFileSync(HTML_PATH...)` and re-`require` the
      module to prove `localStorage` persistence — no longer applies once persistence has moved
      to the server; those specific "survives a reload" assertions are superseded by
      `test/db-persistence.test.js`'s AC1 coverage instead.
  - description: |
      Rewrite the create-expense jsdom suite the same way — inject a fake `api.createExpense`,
      assert the AC4 failure toast, drop the `Storage.prototype.setItem` spy-based tests.
    files:
      - test/expenses-create.test.js
    rationale: ""
  - description: |
      Rewrite the filter suite so its fixture list comes from an injected
      `api.listExpenses()` resolving with a known 3-row fixture (replacing the old
      `INITIAL_EXPENSES`-via-`localStorage` seeding), and add `await Promise.resolve()` twice
      after `initExpensesApp(document, api)` before the first assertion so the initial fetch has
      resolved. `filterExpenses`'s own pure-function tests are unchanged — that function's
      contract doesn't change.
    files:
      - test/expenses-filter.test.js
    rationale: ""
  - description: |
      New test file for AC5 (loading state, fetched not localStorage) and the load-failure half
      of AC3/AC4:
      ```js
      test('AC5: skeleton rows and a loading caption are shown before the fetch resolves, and the request is what populates the table (not localStorage)', () => {
        localStorage.setItem('expenses', JSON.stringify([{ id: 'exp_999', date: '2026-01-01', category: 'Other', description: 'should never appear', amount: 1 }]));
        let resolveList;
        const api = { listExpenses: () => new Promise((resolve) => { resolveList = resolve; }) };
        const { initExpensesApp } = require('../public/js/expenses');
        initExpensesApp(document, api);
        expect(document.getElementById('expenses-loading-caption').hidden).toBe(false);
        expect(document.getElementById('expense-table').getAttribute('aria-busy')).toBe('true');
        expect(document.body.textContent).not.toMatch(/should never appear/);
      });

      test('AC3/AC4: a failed initial load shows the error state and toast, never the localStorage fallback', async () => {
        const api = { listExpenses: () => Promise.reject({ status: 500 }) };
        const { initExpensesApp } = require('../public/js/expenses');
        initExpensesApp(document, api);
        await Promise.resolve(); await Promise.resolve();
        expect(document.getElementById('expenses-error-state').hidden).toBe(false);
        expect(document.getElementById('expenses-table-scroll').hidden).toBe(true);
        expect(document.getElementById('toast-message').textContent).toMatch(/Couldn.?t load expenses — server error \(500\)/);
      });
      ```
    files:
      - test/expenses-loading.test.js
    rationale: ""
  - description: |
      New test file for AC2 (migration):
      ```js
      test('AC2: a stale localStorage expenses key is removed when the app loads', () => {
        localStorage.setItem('expenses', JSON.stringify([{ id: 'exp_001' }]));
        const { migrateLegacyExpenseStorage } = require('../public/js/expenses');
        migrateLegacyExpenseStorage(document);
        expect(localStorage.getItem('expenses')).toBeNull();
      });

      test('AC2 (contrast): no localStorage key present is a no-op, not an error', () => {
        const { migrateLegacyExpenseStorage } = require('../public/js/expenses');
        expect(() => migrateLegacyExpenseStorage(document)).not.toThrow();
        expect(localStorage.getItem('expenses')).toBeNull();
      });
      ```
    files:
      - test/expenses-migration.test.js
    rationale: ""
tests:
  - "AC1 (employees): `expect(getEmployee(employee.id)).toEqual(employee);` after `closeDb()` + `jest.resetModules()` + re-require against the same on-disk file — see `test/db-persistence.test.js`."
  - "AC1 (expenses): `expect(listAfterRestart()).toContainEqual(expense);` after the same close/reset/re-require cycle."
  - "AC1 (API-level, create+list round trip): `expect(list.body).toContainEqual(created.body);` in `test/expenses-api.test.js`, run against the real (temp-file) SQLite db, not a mock."
  - "AC2: `localStorage.setItem('expenses', ...); migrateLegacyExpenseStorage(document); expect(localStorage.getItem('expenses')).toBeNull();` in `test/expenses-migration.test.js`."
  - "AC3 (employees): `jest.spyOn(getDb(), 'prepare').mockImplementation(() => { throw new Error('SQLITE_IOERR: disk I/O error'); }); const res = await request(app).post('/employees')...; expect(res.status).toBe(500);` in `test/employees.test.js`."
  - "AC3 (expenses): same spy pattern against `GET /api/expenses`, `POST /api/expenses`, and `PATCH /api/expenses/:id` in `test/expenses-api.test.js`, each asserting `expect(res.status).toBe(500)`."
  - "AC4 (load failure): `expect(document.getElementById('toast-message').textContent).toMatch(/Couldn.?t load expenses — server error \\(500\\)/);` after an injected `api.listExpenses` rejection, in `test/expenses-loading.test.js` — paired with `expect(document.getElementById('expenses-table-scroll').hidden).toBe(true);` to prove no fallback content is shown."
  - "AC4 (save failure): `expect(document.getElementById('toast-message').textContent).toMatch(/Couldn.?t save expense — server error \\(500\\)/); expect(document.getElementById('modal-wrap').hidden).toBe(false);` after an injected `api.updateExpense` rejection, in `test/expenses.test.js`."
  - "AC5: `expect(document.getElementById('expenses-loading-caption').hidden).toBe(false); expect(document.getElementById('expense-table').getAttribute('aria-busy')).toBe('true');` immediately after `initExpensesApp(document, api)` with an unresolved `api.listExpenses()` promise, plus `expect(document.body.textContent).not.toMatch(/should never appear/);` against a `localStorage`-seeded decoy record, in `test/expenses-loading.test.js`."
assumptions_or_open_questions:
  - "The design's error-detail copy names an exact path — `GET /api/expenses → 500 Internal Server Error` (design line 799) and `POST /api/expenses → 500 Internal Server Error` (line 930-931) — so the new expenses router is mounted at `/api/expenses`. Every other resource in this repo (`/employees`, `/hires`, `/workflows`, `/runs`) is mounted without an `/api` prefix. This plan does NOT rename those existing routes to match (no AC asks for it, and it would be a larger, unrelated breaking change) — flagging the inconsistency rather than silently picking one convention repo-wide."
  - "AC4's \"the client displays a toast error notification\" is only meaningful for expenses: employees has no client-facing page anywhere in the repo (confirmed via `public/*.html` — only `index.html` and `hire-profile.html` exist), and the design's own nav comment (design lines 508-513) states this explicitly. The employees half of AC3/AC4 is therefore satisfied at the HTTP layer only (500 status), with no corresponding client assertion, matching the design's own scoping note."
  - "Chose one generic `(id TEXT PRIMARY KEY, data TEXT)` JSON-blob table per resource rather than fixed columns per field, so the schema doesn't need to be revisited every time a field is added to an employee or expense record — this mirrors the current `Map`-based stores' `{ ...data, id }` flexibility. A future story that needs to query on a specific field (e.g. filter expenses server-side by category) would need a follow-up migration to real columns; today's filtering stays client-side and pure (`filterExpenses`), unchanged."
  - "`INITIAL_EXPENSES` (the 3 canned demo rows) is deleted with no server-side seed replacement — a fresh `data/app.db` starts with zero expense rows and users see the existing \"No expenses yet.\" empty state. No AC asks for seed data, and shipping fake rows as if they were real persisted records would contradict AC1's premise. Flagging in case the reviewer wants a one-time seed for local/demo environments."
  - "The migration toast copy (\"Old browser-saved expenses removed — this list now loads from the server.\", design line 873) is included even though AC2's text only requires the key's removal, not a toast — because the design explicitly authored that copy for this exact event and UI guideline section 4 (\"every action produces visible feedback\") applies. If the reviewer considers this out of AC2's literal scope, it can be dropped from `public/js/expenses.js` without touching `migrateLegacyExpenseStorage`'s core contract (key removal), since the toast call would be a one-line addition at the call site."
  - "SQLite file lives at `data/app.db`, created on first `getDb()` call (`fs.mkdirSync(..., { recursive: true })`), overridable via `SQLITE_DB_PATH` for test isolation. `data/` is added to `.gitignore`."
  - "\"Simulate a server restart\" in tests means: close the `better-sqlite3` handle, `jest.resetModules()`, and re-require every module in the chain against the same on-disk file — not a literal new OS process, which Jest cannot spawn mid-test. This is the standard technique for this kind of persistence assertion and is judged a faithful stand-in since it forces a fully fresh module-level `db` singleton and proves the data round-tripped through the file, not an in-memory cache."
package_dependencies:
  - name: better-sqlite3
    version: ^11.3.0
    ecosystem: npm
    rationale: |
      Synchronous SQLite driver for Node — keeps `src/employees/store.js` and the new
      `src/expenses/store.js` synchronous (no `async`/`await` ripple into `routes.js` beyond the
      `try/catch` needed for AC3 regardless), and is the most widely-used, actively-maintained
      SQLite binding for this use case.
notes: |
  ```mermaid
  flowchart TD
    JS["public/js/expenses.js\n(initExpensesApp, createDefaultApi,\nmigrateLegacyExpenseStorage)"]
    HTML["public/index.html\n(#expenses-loading-caption,\n#expenses-table-scroll,\n#expenses-error-state)"]
    ExpRoutes["src/expenses/routes.js\nGET/POST/PATCH /api/expenses"]
    ExpStore["src/expenses/store.js\nlistExpenses/createExpense/updateExpense"]
    EmpRoutes["src/employees/routes.js"]
    EmpStore["src/employees/store.js"]
    Conn["src/db/connection.js\ngetDb/closeDb"]
    Server["src/server.js\n(mounts routers)"]
    DBFile[("data/app.db\nSQLite file")]
    LS[("browser localStorage\n'expenses' key")]

    HTML --> JS
    JS -- "fetch GET/POST/PATCH" --> ExpRoutes
    JS -- "migrateLegacyExpenseStorage:\nreads + removes stale key" --> LS
    Server -- "app.use('/api/expenses', ...)" --> ExpRoutes
    Server -- "app.use('/employees', ...)" --> EmpRoutes
    ExpRoutes --> ExpStore
    EmpRoutes --> EmpStore
    ExpStore --> Conn
    EmpStore --> Conn
    Conn --> DBFile

    classDef touched fill:#f96,color:#000;
    class JS,HTML,ExpRoutes,ExpStore,EmpRoutes,EmpStore,Conn,Server touched;
  ```
  Nodes in orange are touched by this plan; `data/app.db` and browser `localStorage` are
  external/untouched endpoints shown for context. `EmpRoutes`/`EmpStore` are touched only for
  the persistence swap + AC3 error handling — their HTTP contract (paths, status codes on
  success, 404 on missing id) is otherwise unchanged, so nothing upstream of them (there is no
  employees UI) needs to change.
