summary: |
  This repo currently has only one precedent (TEST-M1-STORY-036, employees): a bare Node.js/
  Express JSON API with an in-memory store, tested with jest + supertest, and no frontend
  framework, static file serving, or expenses domain of any kind. TEST-M1-STORY-037 needs both a
  JSON API for category create/rename/delete (with the case-insensitive uniqueness and
  expense-reassignment rules in AC2-AC10) and real UI behavior (empty state, inline validation,
  saving indicator, no double-submit — AC1, AC3, AC5, AC11, AC12) that only a browser-rendered
  page can exhibit. This plan (a) adds a `/categories` JSON API mirroring the existing
  `/employees` pattern, (b) adds a minimal in-memory `src/expenses/store.js` — just enough to
  make "category has assigned expenses" real and testable, not a full expense feature, which is
  out of this story's scope, and (c) builds the actual page from the approved prototype at
  `.arc/designs/TEST-M1-STORY-037-design.html`, reusing its exact markup, classes, and copy,
  wired to the new API with real `fetch()` calls instead of the prototype's local-array
  simulation. UI behavior is tested with jsdom (new devDependency `jest-environment-jsdom`,
  required separately since Jest 28+) rather than a full component framework, since the rest of
  the app has no framework either.
scope:
  - description: |
      Add a minimal in-memory expenses store, just enough to make category deletion's
      expense-count/reassignment rules (AC6-AC10) real:
      ```js
      // src/expenses/store.js
      function createExpense(data) { /* id via crypto.randomUUID(), categoryId defaults to null */ }
      function listExpenses() { /* returns all expense records */ }
      function countByCategory(categoryId) { /* number of expenses with this categoryId (null = uncategorised) */ }
      function countUncategorised() { return countByCategory(null); }
      function reassignCategory(fromCategoryId, toCategoryId) {
        /* sets categoryId = toCategoryId on every expense currently at fromCategoryId, returns count moved */
      }
      module.exports = { createExpense, listExpenses, countByCategory, countUncategorised, reassignCategory };
      ```
      `reassignCategory(categoryId, null)` is reused for the "leave uncategorised" path (AC9),
      so there's a single mutation function instead of two near-duplicates.
    files:
      - src/expenses/store.js
    rationale: |
      No expenses domain exists anywhere in the repo yet, and this story is scoped to category
      management, not full expense CRUD (that belongs to a later "assign categories to expenses"
      story per the parent epic). This store is deliberately minimal: it only supports what the
      category-deletion flow and its tests need (create for test fixtures, count, and bulk
      reassignment), not listing/editing/filtering expenses as a feature.
  - description: |
      Add the in-memory category store, mirroring `src/employees/store.js`'s shape:
      ```js
      // src/categories/store.js
      function listCategories() { /* all categories */ }
      function getCategory(id) { /* one category or undefined */ }
      function isNameTaken(name, excludeId) {
        /* case-insensitive, trimmed comparison against every other category's name */
      }
      function createCategory(name) { /* id via crypto.randomUUID(), name trimmed */ }
      function renameCategory(id, name) { /* mutates and returns the category, or undefined if missing */ }
      function deleteCategory(id) { /* returns boolean, true if a category was removed */ }
      module.exports = { listCategories, getCategory, isNameTaken, createCategory, renameCategory, deleteCategory };
      ```
    files:
      - src/categories/store.js
    rationale: |
      `isNameTaken` is the single place the case-insensitive duplicate rule from AC2/AC3/AC4/AC5
      lives, shared by both create and rename so the comparison can't drift between the two call
      sites.
  - description: |
      Add the `/categories` JSON API (Express router), mounted the same way `/employees`
      already is:
      ```js
      // src/categories/routes.js
      router.get('/', (req, res) => {
        const categories = categoryStore.listCategories().map((c) => ({
          id: c.id, name: c.name, expenseCount: expenseStore.countByCategory(c.id),
        }));
        res.status(200).json({ categories, uncategorisedCount: expenseStore.countUncategorised() });
      });

      router.post('/', (req, res) => {
        // 422 { error: 'name_required', message } if blank (trimmed)
        // 422 { error: 'duplicate_name', message: `A category named "${name.trim()}" already exists. Try a different name.` }
        //     — exact copy lifted from the prototype's field-error text (design lines 746-748, 839-841)
        // else 201 { id, name, expenseCount: 0 }
      });

      router.patch('/:id', (req, res) => {
        // 404 { error: 'not_found' } if missing
        // same name_required / duplicate_name 422s as POST, excluding the category's own id
        // else 200 { id, name, expenseCount }
      });

      router.delete('/:id', (req, res) => {
        // 404 if missing
        // expenseCount === 0 -> delete immediately, 200 { deleted: true }                        (AC6)
        // expenseCount  > 0 and no req.body.resolution -> 409 {
        //   error: 'resolution_required', expenseCount,
        //   otherCategories: [...every other category as {id, name}]
        // }                                                                                        (AC7)
        // resolution === 'uncategorise' -> reassignCategory(id, null), delete, 200 {
        //   deleted: true, resolution: 'uncategorise', uncategorisedCount
        // }                                                                                        (AC9/AC10)
        // resolution === 'reassign' -> validate targetCategoryId exists and isn't the same
        //   category (422 { error: 'invalid_target_category' } otherwise), else reassignCategory(
        //   id, targetCategoryId), delete, 200 {
        //   deleted: true, resolution: 'reassign', reassignedCount, targetCategoryId
        // }                                                                                        (AC8/AC10)
        // any other resolution value -> 422 { error: 'invalid_resolution' }
      });
      ```
    files:
      - src/categories/routes.js
      - src/server.js
    rationale: |
      `src/server.js` gains `app.use('/categories', categoriesRouter)`, following the exact
      mounting pattern already used for `/employees`. The DELETE contract makes "prompt the user
      to reassign or leave uncategorised" (AC7) a first-class 409 response the UI branches on,
      rather than a client-side-only guess, so the resolution rule is enforced server-side too
      (a client that skips the dialog and calls DELETE directly still can't destroy expense
      assignments without an explicit resolution).
  - description: |
      Serve the approved design as a real page instead of a design-only artifact. `src/server.js`
      also gains:
      ```js
      app.use('/design-system', express.static(path.join(__dirname, '..', 'design-system')));
      app.use('/app', express.static(path.join(__dirname, '..', 'public')));
      ```
      so `public/categories/index.html` is reachable at `/app/categories/` and can link the
      *actual* checked-in `design-system/tokens.css` and `design-system/prototype-utils.css`
      rather than duplicating their contents (the prototype inlines copies of both files for
      standalone review — its own header comment on each says "Do not edit directly, this file
      was auto-generated" — but the real page should reference the canonical files directly).
      The prototype's third, page-specific `<style>` block (`.app-shell`, `.sidebar`,
      `.category-list`, `.category-row`, `.field-error`, `.dialog-backdrop`, `.dialog-option`,
      `.toast`, `.spinner`, etc. — design lines 198-487) is not part of the shared design system,
      so it's extracted verbatim into `public/categories/categories.css`.

      `public/categories/index.html` combines the design's two reviewer "screens" into one real
      view (they're the same page in two states, not two routes — screen 1 already
      demonstrates this by hiding its own `#empty-state-block` and un-hiding its own list after
      the first category is created): the sidebar nav (`Dashboard`/`Expenses`/`Categories`
      active/`Settings`, design lines 518-524 — only `Categories` is a real destination since no
      other page exists yet, so the rest stay inert `href="#"` links exactly as the design has
      them), the page header ("Categories" / "Create, rename, and delete the categories you use
      to organise expenses.", lines 526-529), the `#empty-state-block` empty state ("🗂️" icon,
      "No categories yet", "Create your first category above to start organising expenses the
      way that fits how you work.", lines 550-554, satisfying AC1), the `#create-form` (label
      "New category name", `.input` with placeholder "e.g. Software", `.field-error` with a "⚠"
      icon span, `.btn-primary` submit with an inline `.spinner`, lines 593-611), the
      `#category-list` of `.category-row` cards each with a `.chip.chip-count` expense count and
      Rename/Delete `.btn-secondary.btn-sm` buttons (lines 613-616, 793-825), the read-only
      "Uncategorised" bucket row (lines 816-824), the inline rename row markup (`.rename-row`,
      lines 876-887), both dialogs verbatim — `#delete-simple-backdrop` (lines 625-637, AC6) and
      `#delete-reassign-backdrop` with its `resolution` radio group and `#reassign-target`
      `<select class="input">` (lines 640-671, AC7/AC8/AC9) — and the `#toast` (line 674).

      `public/categories/app.js` re-implements the prototype's Screen-2 script (lines 770-1024)
      against the real API instead of the local `state` object:
      ```js
      function commitCreate(e) {
        e.preventDefault();
        if (saving) return; // AC12: ignore re-submission while saving
        const name = createInput.value.trim();
        setButtonSaving(createSubmit, true, 'Creating…'); // AC11
        saving = true;
        fetch('/categories', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name }),
        })
          .then((res) => res.json().then((body) => ({ ok: res.ok, body })))
          .then(({ ok, body }) => {
            if (!ok) { showFieldError(createError, body.message); return; } // AC3
            createInput.value = '';
            loadCategories();
            showToast(`"${body.name}" created.`);
          })
          .finally(() => { saving = false; setButtonSaving(createSubmit, false, 'Create category'); });
      }
      ```
      `startDelete(cat)` first calls `DELETE /categories/:id` with no body; a `200` means it had
      no expenses and is already gone (AC6, re-render + toast); a `409` means it has expenses, so
      the response's `otherCategories` populates `#reassign-target` and the reassign dialog opens
      (AC7); confirming re-issues the `DELETE` with `{ resolution: 'reassign', targetCategoryId }`
      or `{ resolution: 'uncategorise' }` per the checked radio (AC8/AC9), and on `200` the row
      and its dialog both disappear (AC10).
    files:
      - public/categories/index.html
      - public/categories/categories.css
      - public/categories/app.js
      - src/server.js
    rationale: |
      This is the only story-specific design record (there's no structured design context, just
      the prototype), so every element, id, and copy string above is taken directly from it
      rather than invented. Splitting page-specific CSS into `categories.css` keeps
      `design-system/` limited to the two files `.arc/config/design.yaml` actually declares as
      design-system assets.
  - description: |
      Add the failing-tests-first API suite driving AC2, AC3, AC4, AC5, AC6, AC7, AC8, AC9, AC10
      through the HTTP layer via `supertest` against the exported `app`, matching the existing
      `test/employees.test.js` convention (node test environment, no jsdom needed here).
    files:
      - test/categories.test.js
    rationale: |
      Same rationale as the existing employees suite: exercising the real request/response
      contract, not the store directly, is what proves the API (not just the store) enforces the
      uniqueness and deletion-resolution rules.
  - description: |
      Add a jsdom-based UI test suite covering the behaviors only a rendered page can show:
      AC1 (empty state), AC3/AC5 shown inline without navigation, AC11 (saving indicator), and
      AC12 (no duplicate submission). Uses a `/** @jest-environment jsdom */` docblock (Jest 28+
      requires `jest-environment-jsdom` as a separate package for this) and a mocked
      `global.fetch`, loading the real markup from `public/categories/index.html` with its
      `<script>` tag stripped (so `public/categories/app.js` can be `require()`-d directly and
      wire up listeners against the injected DOM), never a hand-rewritten copy of the markup.
    files:
      - test/categories-ui.test.js
    rationale: |
      Reading the actual shipped HTML file (minus its script tag) instead of re-typing the
      markup in the test guarantees the test breaks if `index.html` drifts from what's asserted,
      the same guarantee `test/employees.test.js` gets from importing the real `app`.
  - description: |
      Add `jest-environment-jsdom` as a devDependency so the docblock-selected jsdom environment
      in `test/categories-ui.test.js` resolves (Jest 29, already in use, no longer bundles jsdom
      in core).
    files:
      - package.json
    rationale: |
      Without this package, any test file with `@jest-environment jsdom` fails to start; this is
      the one new piece of tooling this story needs beyond what story 036 already installed.
tests:
  - |
    AC1 — empty-state message shown when no categories exist (jsdom):
    ```js
    test('shows the empty-state message when no categories exist', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ categories: [], uncategorisedCount: 0 }),
      });
      loadPage();
      await flushPromises();
      expect(document.getElementById('empty-state-block').hidden).toBe(false);
      expect(document.getElementById('category-list').hidden).toBe(true);
    });
    ```
    Fails today because neither `public/categories/index.html` nor `public/categories/app.js`
    exist; passes once the empty-state block is rendered unhidden whenever the API's
    `categories` array is empty.
  - |
    AC2 — unique name creates and appears in the list (supertest):
    ```js
    test('POST /categories creates a category with a unique name', async () => {
      const res = await request(app).post('/categories').send({ name: 'Travel' });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ name: 'Travel', expenseCount: 0 });
      expect(res.body.id).toBeDefined();
    });
    ```
    Fails until `src/categories/store.js` and `src/categories/routes.js` exist and are mounted.
  - |
    AC3 — case-insensitive duplicate on create is rejected with an inline message, no navigation
    (jsdom, asserts the DOM error node updates in place rather than any redirect/reload):
    ```js
    test('shows an inline error for a case-insensitive duplicate on create', async () => {
      global.fetch = jest.fn()
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({
          categories: [{ id: 'c1', name: 'Groceries', expenseCount: 2 }], uncategorisedCount: 0,
        }) })
        .mockResolvedValueOnce({ ok: false, status: 422, json: () => Promise.resolve({
          error: 'duplicate_name',
          message: 'A category named "groceries" already exists. Try a different name.',
        }) });
      loadPage();
      await flushPromises();
      document.getElementById('create-input').value = 'groceries';
      document.getElementById('create-form').dispatchEvent(new Event('submit', { cancelable: true }));
      await flushPromises();
      const error = document.getElementById('create-error');
      expect(error.hidden).toBe(false);
      expect(error.querySelector('span:last-child').textContent)
        .toBe('A category named "groceries" already exists. Try a different name.');
    });
    ```
    Also backed by the API-level equivalent:
    ```js
    test('POST /categories rejects a case-insensitive duplicate name', async () => {
      await request(app).post('/categories').send({ name: 'Utilities' });
      const res = await request(app).post('/categories').send({ name: 'utilities' });
      expect(res.status).toBe(422);
      expect(res.body.error).toBe('duplicate_name');
    });
    ```
  - |
    AC4 — rename to a unique name updates the category (supertest):
    ```js
    test('PATCH /categories/:id renames a category to a unique name', async () => {
      const created = await request(app).post('/categories').send({ name: 'Misc' });
      const res = await request(app).patch(`/categories/${created.body.id}`).send({ name: 'Miscellaneous' });
      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Miscellaneous');
    });
    ```
  - |
    AC5 — rename to a case-insensitive duplicate is rejected inline (supertest, plus the same
    jsdom pattern as AC3 but exercising the inline `.rename-row` field-error instead of the
    create form's):
    ```js
    test('PATCH /categories/:id rejects a case-insensitive duplicate name', async () => {
      const a = await request(app).post('/categories').send({ name: 'Rent' });
      await request(app).post('/categories').send({ name: 'Insurance' });
      const res = await request(app).patch(`/categories/${a.body.id}`).send({ name: 'insurance' });
      expect(res.status).toBe(422);
      expect(res.body.error).toBe('duplicate_name');
    });
    ```
  - |
    AC6 — deleting a category with no assigned expenses removes it immediately (supertest):
    ```js
    test('DELETE /categories/:id removes a category with no assigned expenses', async () => {
      const created = await request(app).post('/categories').send({ name: 'Office Supplies' });
      const res = await request(app).delete(`/categories/${created.body.id}`);
      expect(res.status).toBe(200);
      expect(res.body.deleted).toBe(true);
    });
    ```
  - |
    AC7 — deleting a category with assigned expenses prompts for a resolution instead of
    deleting (supertest, asserts the 409 contract the UI's reassign dialog depends on):
    ```js
    test('DELETE /categories/:id requires a resolution when expenses are assigned', async () => {
      const created = await request(app).post('/categories').send({ name: 'Groceries' });
      require('../src/expenses/store').createExpense({ categoryId: created.body.id });
      const res = await request(app).delete(`/categories/${created.body.id}`);
      expect(res.status).toBe(409);
      expect(res.body).toMatchObject({ error: 'resolution_required', expenseCount: 1 });
    });
    ```
  - |
    AC8 — choosing "reassign" moves every affected expense to the chosen category (supertest):
    ```js
    test('DELETE with resolution=reassign moves expenses to the target category', async () => {
      const from = await request(app).post('/categories').send({ name: 'Travel' });
      const to = await request(app).post('/categories').send({ name: 'Transport' });
      const expenseStore = require('../src/expenses/store');
      expenseStore.createExpense({ categoryId: from.body.id });
      expenseStore.createExpense({ categoryId: from.body.id });
      const res = await request(app)
        .delete(`/categories/${from.body.id}`)
        .send({ resolution: 'reassign', targetCategoryId: to.body.id });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ deleted: true, reassignedCount: 2 });
      expect(expenseStore.countByCategory(to.body.id)).toBe(2);
    });
    ```
  - |
    AC9 — choosing "leave uncategorised" clears the category on every affected expense
    (supertest):
    ```js
    test('DELETE with resolution=uncategorise clears the category on assigned expenses', async () => {
      const created = await request(app).post('/categories').send({ name: 'Entertainment' });
      const expenseStore = require('../src/expenses/store');
      expenseStore.createExpense({ categoryId: created.body.id });
      const res = await request(app)
        .delete(`/categories/${created.body.id}`)
        .send({ resolution: 'uncategorise' });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ deleted: true, uncategorisedCount: 1 });
      expect(expenseStore.countByCategory(created.body.id)).toBe(0);
    });
    ```
  - |
    AC10 — the category is gone from the list once its deletion is resolved either way
    (supertest, covers both the AC6 immediate-delete path and the two AC8/AC9 resolution paths
    already asserted above by re-checking the list afterward):
    ```js
    test('deleted category no longer appears in GET /categories', async () => {
      const created = await request(app).post('/categories').send({ name: 'Temp' });
      await request(app).delete(`/categories/${created.body.id}`);
      const res = await request(app).get('/categories');
      expect(res.body.categories.find((c) => c.id === created.body.id)).toBeUndefined();
    });
    ```
  - |
    AC11 — a standard in-progress indicator (spinner) shows while create/rename is saving
    (jsdom, keeps the underlying `fetch` promise pending to observe the mid-flight state):
    ```js
    test('shows a spinner and disables the button while creating', async () => {
      let resolveCreate;
      global.fetch = jest.fn()
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ categories: [], uncategorisedCount: 0 }) })
        .mockReturnValueOnce(new Promise((resolve) => { resolveCreate = resolve; }));
      loadPage();
      await flushPromises();
      document.getElementById('create-input').value = 'Travel';
      document.getElementById('create-form').dispatchEvent(new Event('submit', { cancelable: true }));
      const submitBtn = document.getElementById('create-submit');
      expect(submitBtn.disabled).toBe(true);
      expect(submitBtn.querySelector('.spinner').hidden).toBe(false);
      resolveCreate({ ok: true, json: () => Promise.resolve({ id: 'x', name: 'Travel', expenseCount: 0 }) });
    });
    ```
  - |
    AC12 — a second submit while saving does not re-submit the form (jsdom, asserts `fetch` is
    called exactly once for the POST despite two dispatched submits):
    ```js
    test('ignores a second submit while the first is still saving', async () => {
      let resolveCreate;
      global.fetch = jest.fn()
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ categories: [], uncategorisedCount: 0 }) })
        .mockReturnValueOnce(new Promise((resolve) => { resolveCreate = resolve; }));
      loadPage();
      await flushPromises();
      document.getElementById('create-input').value = 'Travel';
      const form = document.getElementById('create-form');
      form.dispatchEvent(new Event('submit', { cancelable: true }));
      form.dispatchEvent(new Event('submit', { cancelable: true }));
      expect(global.fetch).toHaveBeenCalledTimes(2); // 1 initial GET on load + exactly 1 POST
      resolveCreate({ ok: true, json: () => Promise.resolve({ id: 'x', name: 'Travel', expenseCount: 0 }) });
    });
    ```
assumptions_or_open_questions:
  - |
    No frontend framework, bundler, or static-serving setup exists anywhere in the repo yet
    (only the design-only prototype and design-system assets). This plan adds a plain
    server-rendered HTML page plus vanilla JS served via `express.static`, matching the "no
    framework" precedent set by `/employees`, rather than introducing React/a bundler/etc. If a
    framework is actually intended for the app going forward, that's a bigger decision than this
    story and should be raised separately.
  - |
    No expenses domain exists yet. This plan adds only the minimal `src/expenses/store.js`
    needed to make "category has assigned expenses" real for AC6-AC10 (create/count/reassign).
    Full expense CRUD, HTTP endpoints, or UI is out of scope here and left to whatever future
    story implements "assign categories to expenses" per the parent epic.
  - |
    Because the JSON resource and the HTML page would otherwise collide on the same path, the
    page is served at `/app/categories/` (via `express.static` mounted at `/app`) while the JSON
    API stays at bare `/categories`, matching the existing `/employees` convention. This split
    isn't specified anywhere in the story or design and may need reviewer confirmation.
  - |
    The prototype's own header comment documents three deliberate design-system gaps (no
    dialog/modal token, no danger/error color token — inline errors use `--color-primary` plus a
    "⚠" icon and explicit text instead of color alone, no destructive-button variant — reuses
    `.btn-secondary` with an explicit "Delete category…" label, no `<select>` styling — the
    reassignment dropdown reuses `.input`). This plan carries all three through unchanged rather
    than re-deciding them.
  - |
    The design shows two separate reviewer "screens" (Empty State, Category Management); this
    plan treats them as one real view with two states (empty vs. populated), which is how the
    prototype's own Screen 1 script already behaves internally after its first category is
    created, not two separate routes.
  - |
    The design's sidebar nav items for Dashboard/Expenses/Settings stay inert (`href="#"`), same
    as the prototype, since no other page exists yet in this app to link to.
package_dependencies:
  - name: jest-environment-jsdom
    version: ^29.7.0
    ecosystem: npm
    rationale: |
      Jest 29 (already a devDependency) no longer bundles the jsdom environment in core; the
      `/** @jest-environment jsdom */` docblock in `test/categories-ui.test.js` needs this
      package installed to resolve, so AC1/AC3/AC5/AC11/AC12's DOM-level behavior can be tested.
notes: |
  ```mermaid
  flowchart TD
    Server["src/server.js"] --> CatRoutes["src/categories/routes.js"]
    Server --> EmpRoutes["src/employees/routes.js"]
    Server -.serves /app static.-> AppJS["public/categories/app.js + index.html"]
    Server -.serves /design-system static.-> Tokens["design-system/tokens.css + prototype-utils.css"]
    CatRoutes --> CatStore["src/categories/store.js"]
    CatRoutes --> ExpStore["src/expenses/store.js"]
    AppJS -.fetch over HTTP.-> CatRoutes
    ApiTest["test/categories.test.js"] -->|supertest| Server
    UiTest["test/categories-ui.test.js"] -->|jsdom + mocked fetch| AppJS

    classDef touched fill:#f96,color:#000
    class Server,CatRoutes,CatStore,ExpStore,AppJS,Tokens,ApiTest,UiTest touched
  ```
  `EmpRoutes` (the existing `/employees` router) is untouched context, shown only to make the
  mounting pattern this plan follows visible. The dashed edges are HTTP/static-file relationships
  rather than direct `require()`s: `app.js` never imports the route module, it calls the API over
  `fetch`, which is why the jsdom UI tests mock `fetch` instead of exercising the real server, and
  the supertest API tests exercise the real server without touching the DOM at all — the two
  suites are deliberately disjoint in what they can catch.
