summary: |
  This repo currently has one feature module (src/employees/{routes,store}.js, mounted from
  src/server.js, tested end-to-end with supertest against the exported Express app — see
  test/employees.test.js and the prior plan at .arc/plans/run_64983a1a91f9/plan.md). There is no
  categories or expenses concept anywhere in the codebase yet, and no server-rendered views or
  frontend client of any kind — the app is a pure JSON API. This plan adds a new
  src/categories/{routes,store}.js module, mirroring the employees module's shape, that lets a
  caller create a category, set/remove an optional positive spend limit on it, record expenses
  against it, and fetch a serialized view of the category (id, name, totalSpend, limit, warning,
  warningLabel) that is recomputed fresh on every GET. The field names and validation copy are
  taken directly from the approved prototype at
  .arc/designs/TEST-M1-STORY-038-design.html so that whichever frontend eventually renders this
  API can reproduce the approved screens byte-for-byte; this plan does not build or re-author any
  UI, since none exists in this repo to build against and the prototype is explicitly the
  finished design artifact, not a spec for new client code.
scope:
  - description: |
      Add an in-memory categories store as the single source of truth for category records,
      their optional spend limit, and their recorded expenses (an expense here is just an
      amount — no description/date fields exist on the Expense entity anywhere in the repo yet,
      and no AC requires them, so the store keeps expenses as a plain array of numbers).
      Exposes:
      ```js
      function createCategory(data) { /* { id, name: data.name, limit: null, expenses: [] } */ }
      function getCategory(id) { /* returns the stored record or undefined */ }
      function setCategoryLimit(id, limit) { /* sets category.limit = limit (a number) */ }
      function removeCategoryLimit(id) { /* sets category.limit = null */ }
      function addExpense(id, amount) { /* pushes amount onto category.expenses */ }
      function totalSpend(category) { /* category.expenses.reduce((s, a) => s + a, 0) */ }
      module.exports = { createCategory, getCategory, setCategoryLimit, removeCategoryLimit, addExpense, totalSpend };
      ```
    files:
      - src/categories/store.js
    rationale: |
      Mirrors src/employees/store.js's shape (plain in-memory Map + crypto.randomUUID()) so the
      new module fits the one existing precedent in the repo. `totalSpend` is a pure function of
      the current `expenses` array (not a cached field written at expense-add time), which is
      what makes AC7/AC8 ("reflects all expenses recorded up to that point" on every
      navigate/refresh) true by construction rather than by remembering to invalidate a cache.
  - description: |
      Add the HTTP surface at `/categories`: create a category, fetch a category (serialized
      view), set/remove its spend limit with inline validation, and record an expense against
      it. Response shape for every endpoint that returns a category:
      ```js
      function serializeCategory(category) {
        const spend = totalSpend(category);
        const hasLimit = category.limit !== null && category.limit !== undefined;
        const warning = hasLimit && spend >= category.limit;
        return {
          id: category.id,
          name: category.name,
          totalSpend: spend,
          limit: hasLimit ? category.limit : null,
          warning,
          warningLabel: warning ? (spend > category.limit ? 'Over limit' : 'At limit') : null,
        };
      }
      ```
      `warning` and `warningLabel` follow the prototype's own logic exactly (design script,
      `renderCategoryCard`: `isWarning = hasLimit && spend >= cat.limit`, label is `'Over limit'`
      when `spend > cat.limit` else `'At limit'`) — see
      `.arc/designs/TEST-M1-STORY-038-design.html` lines 726, 737. Limit validation reuses the
      prototype's own `validateLimitInput` messages verbatim (same file, lines 667-680:
      `'Enter a spend limit to save.'`, `'Enter a valid number, e.g. 500.'`,
      `'Spend limit must be greater than $0.'`) so a future frontend surfacing the API's error
      string matches the already-approved copy exactly, satisfying AC3's "inline validation
      message".
      Routes:
      ```js
      router.post('/', ...)                 // create category -> 201 serializeCategory(category)
      router.get('/:id', ...)               // 200 serializeCategory(category) | 404
      router.put('/:id/limit', ...)         // body { limit }; 400 { error } on invalid, else 200
      router.delete('/:id/limit', ...)      // remove limit -> 200 serializeCategory(category)
      router.post('/:id/expenses', ...)     // body { amount }; 201 serializeCategory(category)
      ```
      `PUT /:id/limit` validates before writing: on an invalid `limit` it returns
      `400 { error: <message> }` and does NOT call `setCategoryLimit`, so the previously stored
      limit (or absence of one) is left untouched — this is what AC3 requires ("the value is
      rejected ... and the limit is not saved").
    files:
      - src/categories/routes.js
    rationale: |
      `POST /categories` and `POST /:id/expenses` aren't named in any acceptance criterion, but
      no category or expense can exist for the other ACs to operate on without them — the same
      bootstrapping gap the employees module had (see .arc/plans/run_64983a1a91f9/plan.md's own
      "no application scaffold" note). `PUT`/`DELETE /:id/limit` map directly to AC2/AC3
      (set + validate) and AC6 (remove); `GET /:id` recomputing `serializeCategory` fresh from
      the current `expenses` array on every call is what AC7/AC8 require.
  - description: |
      Mount the new router in the Express app factory, alongside the existing employees router.
      ```js
      // src/server.js
      const categoriesRouter = require('./categories/routes');
      app.use('/categories', categoriesRouter);
      ```
    files:
      - src/server.js
    rationale: |
      src/server.js is the single place routers are wired in (it already does this for
      `/employees`); this is the minimal change to make `/categories` reachable, and keeps
      src/index.js (the process entrypoint) untouched since it only starts the listener.
  - description: |
      Add the failing-tests-first suite driving all 8 acceptance criteria end-to-end through the
      HTTP layer with `supertest` against the exported `app`, matching the style of
      test/employees.test.js (no direct store calls from tests).
    files:
      - test/categories.test.js
    rationale: |
      Keeps the new module's tests consistent with the one existing precedent in the repo, and
      exercises the real request/response contract (status codes, JSON body shape, validation
      messages) rather than internal store functions.
tests:
  - |
    AC1 — no limit set -> no limit value or warning indicator:
    ```js
    test('GET /categories/:id with no limit set shows no limit value or warning', async () => {
      const createRes = await request(app).post('/categories').send({ name: 'Travel' });
      const { id } = createRes.body;
      const res = await request(app).get(`/categories/${id}`);
      expect(res.body.limit).toBeNull();
      expect(res.body.warning).toBe(false);
      expect(res.body.warningLabel).toBeNull();
    });
    ```
    Fails until src/categories/store.js and src/categories/routes.js exist and default
    `limit` to `null`.
  - |
    AC2 — a valid positive limit is stored and shown alongside current total spend:
    ```js
    test('PUT /categories/:id/limit stores a valid limit shown alongside total spend', async () => {
      const createRes = await request(app).post('/categories').send({ name: 'Software & Subscriptions' });
      const { id } = createRes.body;
      await request(app).post(`/categories/${id}/expenses`).send({ amount: 742.50 });
      const res = await request(app).put(`/categories/${id}/limit`).send({ limit: 1000 });
      expect(res.status).toBe(200);
      expect(res.body.limit).toBe(1000);
      expect(res.body.totalSpend).toBe(742.50);
    });
    ```
    Fails until `PUT /:id/limit` exists and `serializeCategory` returns both fields together.
  - |
    AC3 — zero, negative, non-numeric, or empty values are rejected and not saved:
    ```js
    test.each([
      ['0', 'Spend limit must be greater than $0.'],
      ['-10', 'Spend limit must be greater than $0.'],
      ['abc', 'Enter a valid number, e.g. 500.'],
      ['', 'Enter a spend limit to save.'],
    ])('PUT /categories/:id/limit rejects %s', async (limit, expectedError) => {
      const createRes = await request(app).post('/categories').send({ name: 'Office Supplies' });
      const { id } = createRes.body;
      const res = await request(app).put(`/categories/${id}/limit`).send({ limit });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe(expectedError);
      const getRes = await request(app).get(`/categories/${id}`);
      expect(getRes.body.limit).toBeNull();
    });
    ```
    Fails until validation matching the prototype's `validateLimitInput` messages is added and
    confirmed to leave `limit` unset on rejection.
  - |
    AC4 — spend below limit shows default styling / no warning:
    ```js
    test('spend below limit has no warning', async () => {
      const createRes = await request(app).post('/categories').send({ name: 'Client Entertainment' });
      const { id } = createRes.body;
      await request(app).put(`/categories/${id}/limit`).send({ limit: 1200 });
      await request(app).post(`/categories/${id}/expenses`).send({ amount: 640 });
      const res = await request(app).get(`/categories/${id}`);
      expect(res.body.warning).toBe(false);
      expect(res.body.totalSpend).toBe(640);
    });
    ```
    Fails until `serializeCategory`'s `warning` computation exists.
  - |
    AC5 — spend at or over limit shows the inline warning indicator:
    ```js
    test('spend at limit triggers the warning indicator', async () => {
      const createRes = await request(app).post('/categories').send({ name: 'Office Supplies' });
      const { id } = createRes.body;
      await request(app).put(`/categories/${id}/limit`).send({ limit: 268 });
      await request(app).post(`/categories/${id}/expenses`).send({ amount: 268 });
      const res = await request(app).get(`/categories/${id}`);
      expect(res.body.warning).toBe(true);
      expect(res.body.warningLabel).toBe('At limit');
    });
    ```
    Fails until the `>=` (not `>`) comparison is implemented, matching the prototype exactly.
  - |
    AC6 — removing a limit clears the limit value and any warning:
    ```js
    test('DELETE /categories/:id/limit clears limit and warning', async () => {
      const createRes = await request(app).post('/categories').send({ name: 'Travel' });
      const { id } = createRes.body;
      await request(app).put(`/categories/${id}/limit`).send({ limit: 100 });
      await request(app).post(`/categories/${id}/expenses`).send({ amount: 150 });
      await request(app).delete(`/categories/${id}/limit`);
      const res = await request(app).get(`/categories/${id}`);
      expect(res.body.limit).toBeNull();
      expect(res.body.warning).toBe(false);
    });
    ```
    Fails until `DELETE /:id/limit` and `removeCategoryLimit` exist.
  - |
    AC7 — total spend on navigate/refresh reflects all expenses recorded up to that point:
    ```js
    test('total spend reflects all expenses recorded so far on each fetch', async () => {
      const createRes = await request(app).post('/categories').send({ name: 'Team Meals' });
      const { id } = createRes.body;
      await request(app).post(`/categories/${id}/expenses`).send({ amount: 210 });
      const first = await request(app).get(`/categories/${id}`);
      expect(first.body.totalSpend).toBe(210);
      await request(app).post(`/categories/${id}/expenses`).send({ amount: 120 });
      const second = await request(app).get(`/categories/${id}`);
      expect(second.body.totalSpend).toBe(330);
    });
    ```
    Fails unless `totalSpend` is recomputed from the live `expenses` array on every `GET`
    rather than cached at expense-add time.
  - |
    AC8 — the warning indicator on navigate/refresh reflects all expenses recorded up to that
    point:
    ```js
    test('warning state reflects all expenses recorded so far on each fetch', async () => {
      const createRes = await request(app).post('/categories').send({ name: 'Team Meals' });
      const { id } = createRes.body;
      await request(app).put(`/categories/${id}/limit`).send({ limit: 300 });
      await request(app).post(`/categories/${id}/expenses`).send({ amount: 210 });
      const first = await request(app).get(`/categories/${id}`);
      expect(first.body.warning).toBe(false);
      await request(app).post(`/categories/${id}/expenses`).send({ amount: 120 });
      const second = await request(app).get(`/categories/${id}`);
      expect(second.body.warning).toBe(true);
      expect(second.body.warningLabel).toBe('Over limit');
    });
    ```
    Fails for the same reason as AC7's test unless `warning`/`warningLabel` are derived fresh
    each request from the current total.
assumptions_or_open_questions:
  - "No category or expense entity exists anywhere in this repo yet, and the epic separately lists \"assign categories to expenses\" as its own scope item. Since none of this story's ACs can be exercised without at least one category and a way to add spend to it, this plan adds the minimal POST /categories and POST /:id/expenses endpoints as bootstrapping, the same gap the employees module had to fill for itself (no application scaffold existed before it). If a fuller expense-management story already exists or is planned to supply this differently, these two endpoints may need to be reconciled with it later."
  - "This repo has no server-rendered views or frontend client of any kind (the employees precedent is a pure JSON API tested via supertest). The prototype at .arc/designs/TEST-M1-STORY-038-design.html is a static, already-approved mockup with its own embedded fixture data and client-side JS — there is nothing in this repo for it to be wired into. This plan therefore builds only the backend API, shaping its response fields (limit, totalSpend, warning, warningLabel) and validation copy to match exactly what the prototype's own rendering logic and validateLimitInput function already do, so a future frontend can reproduce the approved screens without guessing at field names or copy."
  - "AC1's \"no limit value or warning indicator is displayed\" is implemented as limit: null, warning: false, warningLabel: null in the JSON response (fields present but empty/false) rather than omitting the keys entirely, matching the prototype's own hasLimit = cat.limit !== null && cat.limit !== undefined check."
  - "Spend limit validation treats any input where Number(input) is NaN or <= 0 as invalid, and treats a present-but-blank string as the \"empty\" case — this matches the prototype's validateLimitInput function verbatim (lines 667-680 of the design file)."
  - "Recording an expense (POST /:id/expenses) validates only that amount is a positive number (400 otherwise); no AC governs this endpoint directly since expense creation belongs to a different epic scope item, so validation here is kept minimal rather than duplicating the limit-validation UX."
package_dependencies: []
notes: |
  Layering this plan introduces mirrors the existing employees module one-for-one: app factory
  -> routes -> in-memory store, with tests driving the app factory directly via supertest. No new
  runtime or dev dependency is needed (express/jest/supertest are already installed for the
  employees module).

  ```mermaid
  flowchart TD
    Server["src/server.js"] --> CategoriesRoutes["src/categories/routes.js"]
    CategoriesRoutes --> CategoriesStore["src/categories/store.js"]
    Test["test/categories.test.js"] -->|supertest against exported app| Server
    Server --> EmployeesRoutes["src/employees/routes.js (existing, untouched)"]

    classDef touched fill:#f96,color:#000
    classDef untouched fill:#374151,color:#f9fafb
    class Server,CategoriesRoutes,CategoriesStore,Test touched
    class EmployeesRoutes untouched
  ```

  `src/server.js` is touched only to add one `app.use('/categories', ...)` line alongside the
  existing `/employees` mount; `src/employees/*` is shown for context (same layering pattern)
  but is not modified by this plan.
