summary: |
  This repository is currently greenfield: it contains only design-system assets
  (design-system/tokens.css, tokens.json, prototype-utils.css, style-guide.html) and no
  application code, no package.json, and no test tooling. This plan bootstraps the minimal
  Node.js/Express backend needed to satisfy TEST-M1-STORY-036: an HTTP API that lets a caller
  create an employee record (persisted for the life of the running process) and retrieve that
  same record unchanged by id. Because no database or other persistence infra is configured
  anywhere in the repo yet, persistence is implemented as an in-memory store scoped to the
  running process; this is flagged as an assumption below rather than a hidden scope decision.
scope:
  - description: |
      Bootstrap a minimal Node.js project so there is a runtime and a test runner to build
      against. The only existing tooling signal in the repo is
      `.arc/config/setup.yaml` (`package_install_commands.npm: "npm install {name}@{version}"`),
      so this plan targets Node.js/npm rather than inventing a different ecosystem.
      `package.json` will declare:
      ```json
      {
        "name": "test-m1",
        "private": true,
        "scripts": {
          "start": "node src/index.js",
          "test": "jest"
        }
      }
      ```
      Runtime dependency `express`; dev dependencies `jest` and `supertest` (see
      `package_dependencies` below).
    files:
      - package.json
      - .gitignore
    rationale: |
      There is no existing manifest, so every later scope item needs this in place first. A
      `.gitignore` excluding `node_modules/` is included so the dependency install doesn't get
      committed; this is the minimal hygiene needed to make the npm install step usable, not an
      added feature.
  - description: |
      Add an in-memory employee store as the single source of truth for created records.
      Exposes:
      ```js
      function createEmployee(data) { /* assigns id via crypto.randomUUID(), stores, returns record */ }
      function getEmployee(id) { /* returns the stored record or undefined */ }
      module.exports = { createEmployee, getEmployee };
      ```
      `createEmployee` spreads the caller-provided `data` into the stored record and adds an
      `id` field; it does not drop, rename, or coerce any field, which is what guarantees AC2
      ("the employee information provided at creation is returned unchanged").
    files:
      - src/employees/store.js
    rationale: |
      Isolating storage in its own module keeps the "persisted in the system" behavior
      (AC1) testable independently of HTTP concerns, and is the minimal layer needed before
      routes can call it.
  - description: |
      Add the HTTP surface: an Express router mounted at `/employees` with
      `POST /employees` (create) and `GET /employees/:id` (retrieve), plus the Express app
      factory that mounts it.
      ```js
      // src/employees/routes.js
      const router = express.Router();
      router.post('/', (req, res) => {
        const employee = createEmployee(req.body);
        res.status(201).json(employee);
      });
      router.get('/:id', (req, res) => {
        const employee = getEmployee(req.params.id);
        if (!employee) return res.status(404).json({ error: 'employee not found' });
        res.status(200).json(employee);
      });
      ```
      ```js
      // src/server.js
      const app = express();
      app.use(express.json());
      app.use('/employees', employeesRouter);
      module.exports = app;
      ```
      `src/server.js` builds and exports the `app` (no `listen()` call) so tests can drive it
      directly with `supertest` without binding a real port.
    files:
      - src/employees/routes.js
      - src/server.js
    rationale: |
      `POST /employees` satisfies AC1 (submit a request, a record is created and persisted).
      `GET /employees/:id` satisfies AC2 (retrieving a previously created record returns the
      same information). Exporting `app` separately from the process entrypoint is what makes
      the routes testable without a live socket.
  - description: |
      Add the process entrypoint that starts the HTTP server using the app from
      `src/server.js`, listening on `process.env.ARC_DEV_PORT` (falls back to `8036`, matching
      the value already set in `.env`).
    files:
      - src/index.js
    rationale: |
      Keeps `src/server.js` importable/testable without side effects (starting a real
      listener), while still giving the service a way to actually run.
  - description: |
      Add the failing-tests-first suite driving the two acceptance criteria end-to-end
      through the HTTP layer using `supertest` against the exported `app`, not through the
      store directly, so the tests exercise the real request/response contract.
    files:
      - test/employees.test.js
    rationale: |
      This is the test-first artifact for both ACs; see `tests` below for the concrete
      assertions.
tests:
  - |
    AC1 — POST /employees creates and persists a new employee record:
    ```js
    const request = require('supertest');
    const app = require('../src/server');

    test('POST /employees creates and persists a new employee record', async () => {
      const payload = { name: 'Ada Lovelace', email: 'ada@example.com', jobTitle: 'Engineer' };
      const res = await request(app).post('/employees').send(payload);
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject(payload);
      expect(res.body.id).toBeDefined();
    });
    ```
    This test fails against an empty repo (no server/module exists yet) and passes once
    `src/server.js`, `src/employees/routes.js`, and `src/employees/store.js` are added.
  - |
    AC2 — a retrieved record returns the same information provided at creation, unchanged:
    ```js
    test('GET /employees/:id returns the employee information unchanged', async () => {
      const payload = { name: 'Grace Hopper', email: 'grace@example.com', jobTitle: 'Rear Admiral' };
      const createRes = await request(app).post('/employees').send(payload);
      const { id } = createRes.body;

      const getRes = await request(app).get(`/employees/${id}`);
      expect(getRes.status).toBe(200);
      expect(getRes.body).toEqual(createRes.body);
    });
    ```
    This fails until `GET /employees/:id` is implemented and returns exactly what
    `createEmployee` stored, including every field from the original payload.
assumptions_or_open_questions:
  - "No application scaffold exists in this repo yet (only design-system assets); Node.js/Express was chosen because .arc/config/setup.yaml only configures an npm install command, not because the story specifies a stack."
  - "\"Persisted in the system\" (AC1) is implemented as an in-memory store scoped to the running Node process, since no database or other persistence infrastructure is configured anywhere in the repo. If durable storage across restarts is actually required, that's a separate infra decision outside this story's stated scope."
  - "The story does not specify which fields make up an employee record, so the API accepts and stores whatever JSON object is submitted in the POST body (e.g. name, email, jobTitle) without a fixed schema or validation rules, since none were specified in the acceptance criteria."
  - "GET on an unknown id returns 404; this isn't covered by an AC (both ACs describe the happy path of retrieving a just-created record) but is the minimal behavior needed for the route to be well-defined."
package_dependencies:
  - name: express
    version: ^4.19.2
    ecosystem: npm
    rationale: |
      Minimal, widely-used HTTP framework for the create/retrieve routes in
      src/employees/routes.js and src/server.js; nothing in the repo currently depends on any
      web framework.
  - name: jest
    version: ^29.7.0
    ecosystem: npm
    rationale: |
      Test runner for the failing-tests-first suite in test/employees.test.js; added as a
      devDependency. No test tooling currently exists in the repo.
  - name: supertest
    version: ^6.3.4
    ecosystem: npm
    rationale: |
      Drives HTTP requests against the exported Express app in tests without binding a real
      port, needed to assert on the POST/GET contract in test/employees.test.js; added as a
      devDependency.
notes: |
  The repo's only existing artifacts are design-system tokens/CSS/style-guide (no app code,
  no package.json), so every file in `scope` is new. The diagram below shows the layering this
  plan introduces: entrypoint -> app factory -> routes -> in-memory store, plus the test suite
  driving the app factory directly via supertest.

  ```mermaid
  flowchart TD
    Index["src/index.js"] --> Server["src/server.js"]
    Server --> Routes["src/employees/routes.js"]
    Routes --> Store["src/employees/store.js"]
    Test["test/employees.test.js"] -->|supertest against exported app| Server

    classDef touched fill:#f96,color:#000
    class Index,Server,Routes,Store,Test touched
  ```

  Layering rationale: `src/index.js` only starts the listener (kept side-effect-free from
  `src/server.js` so tests never bind a real socket); `src/server.js` is the Express app
  factory that wires JSON body parsing and mounts the employees router; `routes.js` is the only
  module that touches HTTP concerns (status codes, params, body) and delegates all persistence
  to `store.js`, which is the single place AC1's "persisted in the system" behavior lives.
