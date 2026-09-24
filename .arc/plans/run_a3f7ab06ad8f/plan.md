summary: |
  Introduce a single client-side module, `public/js/apiClient.js`, that becomes the only place
  in the frontend allowed to touch `localStorage` or call `fetch`. It exposes two namespaces —
  `expenses` and `employees` — each with `list`/`read`/`create`/`update`/`remove` operations
  (employees additionally gets `reactivate`, an existing product action beyond plain CRUD).
  `public/js/expenses.js` currently reads/writes expense records straight to `localStorage`
  (its own `loadExpenses`/`persistExpenses`, i.e. the story description's "storage.js" pattern,
  even though no file by that literal name exists in this repo today), and
  `public/js/hire-profile.js`'s `createDefaultApi` makes raw inline `fetch()` calls to `/hires`.
  Both are rewired to go through the new module instead. Every failure path (a thrown
  `localStorage` write for expenses, a non-OK HTTP response for employees) is normalized into a
  single structured error shape (`Error` with a `.status` and `.message`) that calling code
  already catches to trigger its existing toast notifications. The work is test-first: for each
  AC, a failing test is added before the corresponding source change.
scope:
  - description: |
      New shared client module. Two domains, both exposing `list`, `read`, `create`, `update`,
      `remove` (employees also gets `reactivate`, mirroring the existing product action in
      `hire-profile.js`).

      `public/js/apiClient.js`:
      ```js
      function createApiError(message, status) {
        const err = new Error(message);
        err.status = typeof status === 'number' ? status : null;
        return err;
      }

      function requestJson(url, options) {
        return fetch(url, options).then((res) => {
          if (!res.ok) {
            return res.json().catch(() => ({})).then((body) => {
              throw createApiError(body.error || `Request to ${url} failed with status ${res.status}`, res.status);
            });
          }
          if (res.status === 204) return null;
          return res.json();
        });
      }

      const EXPENSES_STORAGE_KEY = 'expenses';
      const EXPENSES_SEED = [
        { id: 'exp_001', date: '2026-09-02', category: 'Travel', description: 'Flight to Chicago client site', amount: 482.50 },
        { id: 'exp_002', date: '2026-09-05', category: 'Meals', description: 'Team lunch — Q3 kickoff', amount: 96.18 },
        { id: 'exp_003', date: '2026-09-10', category: 'Software', description: 'Figma seat renewal', amount: 15.00 },
      ];

      function readExpenses() {
        try {
          const raw = localStorage.getItem(EXPENSES_STORAGE_KEY);
          if (raw) return JSON.parse(raw);
        } catch (e) { /* fall through to reseed */ }
        try {
          localStorage.setItem(EXPENSES_STORAGE_KEY, JSON.stringify(EXPENSES_SEED));
        } catch (e) { /* storage unavailable — fall back to in-memory defaults */ }
        return EXPENSES_SEED.map((e) => ({ ...e }));
      }

      function writeExpenses(list) {
        localStorage.setItem(EXPENSES_STORAGE_KEY, JSON.stringify(list));
      }

      const expenses = {
        list: () => readExpenses(),
        read: (id) => readExpenses().find((e) => e.id === id),
        create: (fields) => new Promise((resolve, reject) => {
          try {
            const current = readExpenses();
            const created = { ...fields, id: 'exp_' + String(current.length + 1).padStart(3, '0') };
            writeExpenses([created, ...current]);
            resolve(created);
          } catch (e) {
            reject(createApiError('Expense could not be saved.', null));
          }
        }),
        update: (id, changes) => new Promise((resolve, reject) => {
          try {
            const current = readExpenses();
            const idx = current.findIndex((e) => e.id === id);
            if (idx === -1) { reject(createApiError(`Expense ${id} not found.`, 404)); return; }
            const updated = { ...current[idx], ...changes };
            writeExpenses([...current.slice(0, idx), updated, ...current.slice(idx + 1)]);
            resolve(updated);
          } catch (e) {
            reject(createApiError('Expense could not be saved.', null));
          }
        }),
        remove: (id) => new Promise((resolve, reject) => {
          try {
            const current = readExpenses();
            writeExpenses(current.filter((e) => e.id !== id));
            resolve(null);
          } catch (e) {
            reject(createApiError('Expense could not be deleted.', null));
          }
        }),
      };

      const employees = {
        list: () => requestJson('/hires'),
        read: (id) => requestJson(`/hires/${id}`),
        create: (data) => requestJson('/hires', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        }),
        update: (id, changes) => requestJson(`/hires/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(changes),
        }),
        remove: (id) => requestJson(`/hires/${id}/deactivate`, { method: 'POST' }),
        reactivate: (id) => requestJson(`/hires/${id}/reactivate`, { method: 'POST' }),
      };

      module.exports = { expenses, employees, createApiError };
      ```

      `expenses.list`/`expenses.read` are synchronous (they just read `localStorage`, same as
      today's `loadExpenses`); `expenses.create`/`update`/`remove` are Promise-based so failures
      can reject with a structured error. `employees.*` are all Promise-based since they are real
      HTTP calls. This asymmetry is a deliberate scope-minimizing choice — see
      `assumptions_or_open_questions`.
    files:
      - public/js/apiClient.js
    rationale: |
      AC2 requires one module exposing create/read/update/delete for both domains. Centralizing
      both the `localStorage` access (today embedded in `public/js/expenses.js`) and the raw
      `fetch` calls (today embedded in `public/js/hire-profile.js`'s `createDefaultApi`) here is
      what AC1 means by routing every expense/employee mutation through "the shared API client
      module" instead of a storage helper or an inline fetch. Wrapping every failure in
      `createApiError` (a `.message` + `.status` on a real `Error`) is what AC3 asks for: a
      structured rejection the caller can branch on to show a toast, without changing today's
      call sites' `.catch(() => showToast(...))` behavior.
  - description: |
      Rewire `public/js/expenses.js` off direct `localStorage` access and onto `apiClient`.
      Remove the local `STORAGE_KEY`, `INITIAL_EXPENSES`, `loadExpenses`, `persistExpenses`
      (moved into `apiClient.js` above). Add `const apiClient = require('./apiClient');` and
      change the two save flows from synchronous persistence to `.then()/.catch()` on the
      client's Promise-returning methods:

      Edit-modal submit (inside the existing 350ms `setTimeout`, replacing the `persistExpenses`
      try/catch block):
      ```js
      apiClient.expenses.update(targetId, {
        amount: Math.round(parseFloat(amountRaw) * 100) / 100,
        date: dateValue,
        category: categoryValue,
        description: fieldDescription.value.trim(),
      }).then((updated) => {
        const idx = expenses.findIndex((e) => e.id === targetId);
        if (idx === -1) return;
        expenses[idx] = updated;
        lastUpdatedId = updated.id;
        closeModal();
        renderList();
        showToast('success', 'Expense updated');
      }).catch(() => {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save changes';
        showToast('error', 'Expense could not be saved — please try again');
      });
      ```

      Create-modal submit (same shape, `apiClient.expenses.create(fields)`):
      ```js
      apiClient.expenses.create({
        amount: Math.round(parseFloat(amountRaw) * 100) / 100,
        date: dateValue,
        category: categoryValue,
        description: descriptionValue,
      }).then((created) => {
        expenses = [created, ...expenses];
        lastAddedId = created.id;
        closeCreateModal();
        renderList();
        showToast('success', 'Expense added');
      }).catch(() => {
        createSaveBtn.disabled = false;
        createSaveBtn.textContent = 'Save expense';
        showToast('error', "Couldn't save expense — please try again");
      });
      ```

      Initial load changes from `let expenses = loadExpenses();` to
      `let expenses = apiClient.expenses.list();` — this stays synchronous (see the module note
      above), so every existing test's `beforeEach` (which asserts on already-rendered rows right
      after calling `initExpensesApp(document)`) keeps working unmodified.

      `module.exports` drops `STORAGE_KEY`/`loadExpenses`/`persistExpenses` (nothing outside this
      file imports them — verified via a repo-wide search) and keeps
      `{ CATEGORIES, formatUSD, validateExpenseFields, validateAmount, validateCreateExpenseFields, initExpensesApp }`.
    files:
      - public/js/expenses.js
    rationale: |
      This is the concrete fix for AC1's expense half: after this change `public/js/expenses.js`
      contains no reference to `localStorage` at all — every read/write goes through
      `apiClient.expenses`. Keeping `list`/`read` synchronous (module note above) means only the
      two mutation flows change shape, minimizing the blast radius on existing passing tests.
  - description: |
      Rewire `public/js/hire-profile.js`'s `createDefaultApi` off inline `fetch()` and onto
      `apiClient.employees`, and export it for direct testing (it was previously only reachable
      indirectly via the untested `DOMContentLoaded` bootstrap).

      Before:
      ```js
      function createDefaultApi(hireId) {
        const patch = (changes) => fetch(`/hires/${hireId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(changes),
        }).then((res) => res.json());
        return {
          saveStage: (hireStage) => patch({ hireStage }),
          updateRoleDepartment: (changes) => patch(changes),
          updateContact: (changes) => patch(changes),
          deactivate: () => fetch(`/hires/${hireId}/deactivate`, { method: 'POST' }).then((res) => res.json()),
          reactivate: () => fetch(`/hires/${hireId}/reactivate`, { method: 'POST' }).then((res) => res.json()),
        };
      }
      module.exports = { initHireProfileApp };
      if (typeof window !== 'undefined') {
        window.addEventListener('DOMContentLoaded', () => {
          fetch('/hires').then((res) => res.json())
            .then((hires) => initHireProfileApp(document, hires[0], createDefaultApi(hires[0].id)));
        });
      }
      ```

      After:
      ```js
      const apiClient = require('./apiClient');

      function createDefaultApi(hireId) {
        return {
          saveStage: (hireStage) => apiClient.employees.update(hireId, { hireStage }),
          updateRoleDepartment: (changes) => apiClient.employees.update(hireId, changes),
          updateContact: (changes) => apiClient.employees.update(hireId, changes),
          deactivate: () => apiClient.employees.remove(hireId),
          reactivate: () => apiClient.employees.reactivate(hireId),
        };
      }
      module.exports = { initHireProfileApp, createDefaultApi };
      if (typeof window !== 'undefined') {
        window.addEventListener('DOMContentLoaded', () => {
          apiClient.employees.list()
            .then((hires) => initHireProfileApp(document, hires[0], createDefaultApi(hires[0].id)));
        });
      }
      ```

      `initHireProfileApp` itself is untouched — it already takes an injected `api` object, which
      is why none of the existing `test/hire-profile.test.js` cases (they inject their own mock
      `api`, never `createDefaultApi`) need to change.
    files:
      - public/js/hire-profile.js
    rationale: |
      This is the concrete fix for AC1's employee half: after this change
      `public/js/hire-profile.js` contains no call to `fetch(` at all — every request goes
      through `apiClient.employees`. Exporting `createDefaultApi` makes the previously-untested
      wiring directly testable with a mocked `apiClient` instead of a real network call.
  - description: |
      Add `<script src="./js/apiClient.js" defer></script>` immediately before the existing
      domain `<script>` tag in each page, so the module is defined before the page script that
      `require()`s it runs (matching the existing `defer`-ordering convention these pages already
      rely on for script load order).
    files:
      - public/index.html
      - public/hire-profile.html
    rationale: |
      Both pages need the new module loaded. Note (see `assumptions_or_open_questions`):
      `public/js/*.js` already uses Node's `require`/`module.exports` today (e.g.
      `expenses.js` requires `./utils`) despite being loaded as plain, non-module `<script>`
      tags with no bundler — that mismatch pre-dates this story and isn't fixed here; this plan
      follows the exact same existing (Jest-only-tested) convention for the new file rather than
      introducing a different loading mechanism just for `apiClient.js`.
  - description: |
      New test file covering AC1 (static "no direct storage/fetch access" check on both domain
      files), AC2 (the client exposes create/read/update/delete for both domains), and AC3
      (a failing persistence call rejects with a structured error) directly against
      `public/js/apiClient.js`. See `tests` below for the literal assertions.
    files:
      - test/apiClient.test.js
    rationale: |
      These three ACs are properties of the client module and its two call sites, not of any one
      UI flow, so they get their own focused suite rather than being folded into the existing
      per-page test files.
  - description: |
      Update the expense-flow tests whose assertions run synchronously immediately after
      `jest.advanceTimersByTime(350)`. Because the save/create path now resolves through a real
      `Promise` (`apiClient.expenses.update`/`create`), the `.then()`/`.catch()` callback that
      updates the DOM fires on the microtask queue one tick after the fake timer fires, not
      synchronously within it. Each of the following tests needs its callback converted to
      `async` with `await Promise.resolve();` inserted right after
      `jest.advanceTimersByTime(350);`, with no change to any assertion:
      in `test/expenses.test.js` — "submitting with all required fields valid closes the modal",
      "a valid submit persists the updated record to localStorage", "the list row shows the
      updated amount immediately after saving", "the saved row displays the amount as USD with
      two decimals", and "a localStorage failure on save keeps the modal open, re-enables the
      save button, and shows an error toast".
      Example of the mechanical change:
      ```js
      test('a valid submit persists the updated record to localStorage', async () => {
        document.querySelector('[data-edit-id="exp_001"]').click();
        document.getElementById('field-amount').value = '512.50';
        document.getElementById('edit-form').dispatchEvent(new Event('submit', { cancelable: true }));
        jest.advanceTimersByTime(350);
        await Promise.resolve();
        const stored = JSON.parse(localStorage.getItem('expenses'));
        expect(stored.find((e) => e.id === 'exp_001').amount).toBe(512.5);
      });
      ```
      The other tests in this file (modal-open, validation-error, both cancel-related tests)
      never reach the `apiClient` call — they return early or never submit — so they are
      unaffected and stay exactly as-is.
    files:
      - test/expenses.test.js
    rationale: |
      Preserves every existing assertion and its intent; only the timing mechanics of observing
      an async save are updated, which is a direct, necessary consequence of routing the save
      through the new Promise-based client (AC1/AC3), not a behavior change.
  - description: |
      Same mechanical `await Promise.resolve();` addition, for the create-flow tests in
      `test/expenses-create.test.js` that submit the create form and then assert immediately:
      "submitting a valid expense adds it to the top of the table immediately", "a valid submit
      shows a success toast", "a localStorage failure on submit shows an error toast", "a
      localStorage failure keeps the modal open with entered values intact", and "a newly created
      expense is still present in localStorage after the save completes". The remaining tests in
      this file (modal-open, both validation-error tests, both cancel tests) never reach the
      `apiClient` call and are unaffected.
    files:
      - test/expenses-create.test.js
    rationale: |
      Same reasoning as the edit-flow test file above — timing-only change forced by the new
      Promise boundary, no assertion content changes.
  - description: |
      New test file exercising `createDefaultApi` (exported in the change above) with
      `apiClient` mocked via `jest.mock('../public/js/apiClient', ...)`, confirming each returned
      method (`saveStage`, `updateRoleDepartment`, `updateContact`, `deactivate`, `reactivate`)
      delegates to the corresponding `apiClient.employees` call instead of `fetch`.
    files:
      - test/hire-profile-api-client.test.js
    rationale: |
      `test/hire-profile.test.js` only ever injects its own mock `api` straight into
      `initHireProfileApp`, so it never exercised `createDefaultApi`'s real wiring — this was
      previously untested. A focused new file confirms AC1's employee half without touching the
      existing, already-passing suite.
tests:
  - |
    AC1 (expense half) — `test/apiClient.test.js`, static source check written to fail against
    today's `public/js/expenses.js` (which still contains `localStorage`):
    ```js
    const fs = require('fs');
    const path = require('path');
    test('AC1: expenses.js does not access localStorage directly', () => {
      const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'expenses.js'), 'utf8');
      expect(src).not.toMatch(/localStorage/);
    });
    ```
  - |
    AC1 (employee half) — `test/apiClient.test.js`, static source check written to fail against
    today's `public/js/hire-profile.js` (which still calls `fetch(`):
    ```js
    test('AC1: hire-profile.js does not perform inline fetch calls', () => {
      const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'hire-profile.js'), 'utf8');
      expect(src).not.toMatch(/\bfetch\(/);
    });
    ```
  - |
    AC1 (behavioral) — `test/hire-profile-api-client.test.js`, written to fail before
    `createDefaultApi` is rewired (today it calls the real global `fetch`, not `apiClient`):
    ```js
    jest.mock('../public/js/apiClient', () => ({
      employees: {
        update: jest.fn(() => Promise.resolve({})),
        remove: jest.fn(() => Promise.resolve({})),
        reactivate: jest.fn(() => Promise.resolve({})),
      },
    }));
    const apiClient = require('../public/js/apiClient');
    const { createDefaultApi } = require('../public/js/hire-profile');

    test('AC1: saveStage delegates to apiClient.employees.update, not fetch', () => {
      createDefaultApi('hire_1').saveStage('offer_accepted');
      expect(apiClient.employees.update).toHaveBeenCalledWith('hire_1', { hireStage: 'offer_accepted' });
    });
    ```
  - |
    AC2 (Expense domain surface) — `test/apiClient.test.js`, fails until `apiClient.js` exists:
    ```js
    const apiClient = require('../public/js/apiClient');
    test('AC2: the client exposes create/read/update/delete for the Expense domain', () => {
      expect(typeof apiClient.expenses.create).toBe('function');
      expect(typeof apiClient.expenses.read).toBe('function');
      expect(typeof apiClient.expenses.update).toBe('function');
      expect(typeof apiClient.expenses.remove).toBe('function');
    });
    ```
  - |
    AC2 (Employee domain surface) — `test/apiClient.test.js`:
    ```js
    test('AC2: the client exposes create/read/update/delete for the Employee domain', () => {
      expect(typeof apiClient.employees.create).toBe('function');
      expect(typeof apiClient.employees.read).toBe('function');
      expect(typeof apiClient.employees.update).toBe('function');
      expect(typeof apiClient.employees.remove).toBe('function');
    });
    ```
  - |
    AC3 (Expense domain failure) — `test/apiClient.test.js`, `/** @jest-environment jsdom */`:
    ```js
    test('AC3: a failed expense save rejects with a structured error', async () => {
      const setItemSpy = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('QuotaExceededError');
      });
      await expect(apiClient.expenses.create({ amount: 1, date: '2026-09-20', category: 'Travel', description: 'x' }))
        .rejects.toMatchObject({ message: expect.any(String) });
      setItemSpy.mockRestore();
    });
    ```
  - |
    AC3 (Employee domain failure) — `test/apiClient.test.js`:
    ```js
    test('AC3: a failed employee request rejects with a structured error including the HTTP status', async () => {
      global.fetch = jest.fn(() => Promise.resolve({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ error: 'hire not found' }),
      }));
      await expect(apiClient.employees.read('missing')).rejects.toMatchObject({
        status: 404,
        message: 'hire not found',
      });
    });
    ```
assumptions_or_open_questions:
  - |
    No file literally named `storage.js` exists anywhere in the repo today (confirmed via a
    repo-wide search) — the story description's "retiring storage.js" is read as referring to
    the `loadExpenses`/`persistExpenses` localStorage-access pair currently embedded directly in
    `public/js/expenses.js`, which is exactly the pattern this plan retires into `apiClient.js`.
  - |
    The repo has two differently-shaped backend modules that could plausibly be "the Employee
    domain": `src/employees/*` (bare `create`/`read` only, `POST`/`GET /employees`, zero frontend
    callers today) and `src/hires/*` (`list`/`create`/`read`/`update`/`deactivate`/`reactivate`,
    wired to the live `hire-profile.js` UI). This plan maps the client's `employees` namespace to
    `/hires`, because that is the only domain with real, live "ad-hoc fetch calls" for this story
    to retire (the literal `/employees` router has no frontend fetch calls to retire at all, and
    also has no update/delete routes, so satisfying AC2's "update and delete" against it would
    require adding new backend endpoints nothing today exercises). This is a naming mismatch
    worth the reviewer's explicit confirmation.
  - |
    `apiClient.employees.remove(id)` calls `POST /hires/:id/deactivate` rather than a literal
    HTTP `DELETE`, since `/hires` has no delete route and the product's only "remove an employee"
    affordance today is deactivation. AC2 only requires the client to expose a delete-shaped
    operation, not that the backend implement a literal `DELETE` verb.
  - |
    `apiClient.expenses.list`/`read` are synchronous (return values directly, not Promises) while
    `create`/`update`/`remove` are Promise-based, and `apiClient.employees.*` are all
    Promise-based. This asymmetry is deliberate: expense persistence is genuinely synchronous
    (`localStorage`), and keeping the initial list-load synchronous avoids rewriting every
    existing `test/expenses*.test.js` `beforeEach` (which asserts on already-rendered rows
    immediately after `initExpensesApp(document)`) to await a microtask. If the reviewer prefers
    full uniformity (all methods Promise-based on both domains), every existing expense test's
    setup would need the same `await Promise.resolve()` treatment already applied here to the
    mutation-flow tests.
  - |
    No real backend persistence is added for expenses in this plan — `apiClient.expenses.*`
    continues to use `localStorage` under the hood, just now fully encapsulated behind the shared
    client's async, structured-error-rejecting contract. Building a real `/expenses` backend API
    is treated as the separate "real persistence layer" goal called out at the epic level, not
    part of this specifically client-module-scoped story.
  - |
    AC1 refers to "the unified shell", but no single unified app shell exists yet in this repo —
    `public/index.html` (Expenses) and `public/hire-profile.html` (hire/employee profile) are
    still two separate static pages with a disabled cross-nav link. This plan does not build that
    shell (presumably a separate Foundation-epic story); it treats "the unified shell" as
    whichever page currently performs the expense/employee operation, and ensures that operation
    routes through the shared client regardless of page-shell consolidation status.
package_dependencies: []
notes: |
  No new runtime or dev dependencies are needed — `fetch` is already used by
  `public/js/hire-profile.js` today, and `jest`/`jest-environment-jsdom` already cover the new
  test file's needs.

  I was instructed to call a `validate_plan_yaml` tool with this file's exact content before
  ending the turn, but no such tool is available in this session's tool list (only Glob, Grep,
  Read, Write are exposed) — I was unable to invoke it. I hand-checked this document against the
  stated YAML rules (bare `files` paths, `|` block scalars on every multi-line/code-bearing
  string, no unescaped colons/backticks in flow scalars) instead.

  ```mermaid
  flowchart TD
    idx[public/index.html]
    hpHtml[public/hire-profile.html]
    apiClient[public/js/apiClient.js]
    expensesJs[public/js/expenses.js]
    hireProfileJs[public/js/hire-profile.js]
    utilsJs[public/js/utils.js]
    ls[(Browser localStorage)]
    hiresRoutes[src/hires/routes.js]
    hiresStore[src/hires/store.js]
    testApiClient[test/apiClient.test.js]
    testExpenses[test/expenses.test.js]
    testExpensesCreate[test/expenses-create.test.js]
    testHireProfileApi[test/hire-profile-api-client.test.js]

    idx -->|"script tag, defer, loaded before expenses.js"| apiClient
    idx -->|"script tag, defer"| expensesJs
    hpHtml -->|"script tag, defer, loaded before hire-profile.js"| apiClient
    hpHtml -->|"script tag, defer"| hireProfileJs
    expensesJs -->|"require('./apiClient') — replaces direct localStorage calls"| apiClient
    expensesJs -->|"require('./utils') — unchanged"| utilsJs
    hireProfileJs -->|"require('./apiClient') — replaces inline fetch()"| apiClient
    hireProfileJs -->|"require('./utils') — unchanged"| utilsJs
    apiClient -->|"expenses.list/read/create/update/remove"| ls
    apiClient -->|"employees.* via fetch"| hiresRoutes
    hiresRoutes --> hiresStore
    testApiClient -.->|"AC1/AC2/AC3"| apiClient
    testExpenses -.->|"await added around apiClient.expenses.update"| expensesJs
    testExpensesCreate -.->|"await added around apiClient.expenses.create"| expensesJs
    testHireProfileApi -.->|"AC1, mocks apiClient"| hireProfileJs

    classDef touched fill:#f96,color:#000
    class idx,hpHtml,apiClient,expensesJs,hireProfileJs,testApiClient,testExpenses,testExpensesCreate,testHireProfileApi touched
  ```

  Layering: `apiClient.js` is the only module with a direct edge to `localStorage` or to the
  `/hires` HTTP routes; both page scripts (`expenses.js`, `hire-profile.js`) now depend only on
  `apiClient` and `utils` for persistence/formatting, never on the storage/network primitives
  directly. `src/hires/routes.js` and `src/hires/store.js` are shown as existing, untouched
  context — this plan adds no backend routes or store changes.
