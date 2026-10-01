summary: |
  Add real user-account and role management to the "Expense Tracker" app, built test-first
  against the approved prototype at `.arc/designs/TEST-M1-STORY-152-design.html`. This adds a
  new backend domain (`src/users`) with an in-memory store (mirroring the `guests`/`rooms`
  store conventions already in the codebase: validation-error classes, audit-free CRUD,
  active/deactivated status flag, never delete records) plus role-gated Express routes, and a
  new `src/auth` route for credential-based sign-in. On the frontend it adds the "User & role
  management" screen (list, create, edit-roles, deactivate/reactivate, access-denied), a
  dedicated sign-in screen, and a minimal read-only expense-history view for deactivated
  accounts — all built from the markup/CSS/behavior already present in the prototype's
  `<style>` blocks and screen markup, not re-designed. Authorization for the new `/users` and
  `/auth` routes is necessarily per-account (looked up live from the store by an `x-user-id`
  header) rather than the static `x-staff-role` header used by `guests`/`rooms`, because AC5/AC6
  require that editing one specific account's roles changes what *that same, still-signed-in*
  account can do on its next request — a static role-string header can't express "this one
  account's roles changed," only "assume this role for this one call." This is flagged as a
  deliberate deviation from the existing per-domain convention, not an oversight.

scope:
  - description: |
      Create `src/users/store.js`: an in-memory `Map`-backed store for user accounts, following
      the `guests`/`rooms` store pattern (validation-error class, never-delete status flag,
      `crypto.randomUUID()` ids).

      Exports:
      ```js
      class UserValidationError extends Error { /* statusCode = 400, fields */ }
      function createUser({ name, email, roles, password } = {}) {}
      function getUser(id) {}
      function getUserByEmail(email) {}
      function listUsers() {}
      function updateRoles(id, roles) {}
      function deactivateUser(id) {}
      function reactivateUser(id) {}
      function authenticate(email, password) {}
        // returns { ok: true, user } | { ok: false, reason: 'invalid_credentials' | 'deactivated' }
      function canManageUsers(roles) {}
        // roles.includes('admin') || roles.includes('finance') — mirrors the design's
        // canManageUsers(viewer) helper (design JS, ~line 940)
      ```
      Passwords are hashed with Node's built-in `crypto.scryptSync` + a random salt
      (`salt:hash` hex string), verified with `crypto.timingSafeEqual` — no new dependency.
      `createUser` requires `roles` to be a non-empty array or throws `UserValidationError`
      with `fields.roles = 'Select at least one role so this account has permissions to sign in
      with.'` (copied verbatim from the prototype's `#roles-error` text, design line 880/795).
      Seed three active users (admin+finance, employee, employee) and one deactivated
      employee+finance user, matching the prototype's fixture people (Priya Shah, Morgan Ellis,
      Devon Ruiz, Elena Brooks — design lines 493-515), each with a known seed password, so the
      UI and manual QA have realistic starting data the same way `guests/store.js` seeds
      `gst_1005..1007`.
    files:
      - src/users/store.js
    rationale: |
      Matches the established per-domain store convention (see src/guests/store.js,
      src/rooms/store.js) so this feature fits the codebase rather than introducing a new
      pattern. Seeding mirrors `seedFixtureGuest` in src/guests/store.js.

  - description: |
      Create `src/users/routes.js`, mounted at `/users`. All routes require an `x-user-id`
      header identifying the acting account; permission is recomputed from that account's
      *current* stored roles on every request (never cached), which is what makes AC5/AC6 work
      without a new account or re-login.
      ```js
      function actingUser(req) { return req.headers['x-user-id'] ? usersStore.getUser(req.headers['x-user-id']) : null; }
      function denyUnless(req, res, next) {
        const user = actingUser(req);
        if (!user) return res.status(401).json({ error: 'unauthorized' });
        if (!usersStore.canManageUsers(user.roles)) {
          return res.status(403).json({ error: 'forbidden', message: "You don't have permission to manage user accounts" });
        }
        next();
      }
      ```
      Routes: `GET /users` (list, all statuses — AC9), `POST /users` (create — AC1/AC2/AC3),
      `PATCH /users/:id/roles` (AC5/AC6), `POST /users/:id/deactivate` (AC7/AC9),
      `POST /users/:id/reactivate` (inverse toggle shown in the design's row action,
      design line 999). Validation errors from the store become `400 { error: 'validation_error',
      fields }`, matching the existing `GuestValidationError`/`RoomValidationError` handling in
      `src/guests/routes.js` and `src/rooms/routes.js`.
      Mount in `src/server.js` next to the other routers: `app.use('/users', usersRouter);`.
    files:
      - src/users/routes.js
      - src/server.js
    rationale: |
      Mirrors the `denyUnless`/`enforceFrontDeskRole` gating pattern already used in
      src/guests/routes.js and src/rooms/routes.js (401 vs 403, action-specific message), adapted
      to per-account identity instead of a static role header.

  - description: |
      Create `src/auth/routes.js`, mounted at `/auth`, with a single public (ungated) route:
      ```js
      router.post('/sign-in', (req, res) => {
        const result = usersStore.authenticate(req.body.email, req.body.password);
        if (!result.ok && result.reason === 'deactivated') {
          return res.status(403).json({ error: 'account_deactivated', message: 'This account has been deactivated. Contact an administrator for access.' });
        }
        if (!result.ok) {
          return res.status(401).json({ error: 'invalid_credentials', message: 'Incorrect email or password.' });
        }
        const { id, name, email, roles } = result.user;
        res.status(200).json({ id, name, email, roles });
      });
      ```
      The deactivated-account message is copied verbatim from the prototype's `#signin-error-text`
      copy (design line 1212). Mount in `src/server.js`: `app.use('/auth', authRouter);`.
    files:
      - src/auth/routes.js
      - src/server.js
    rationale: |
      Sign-in must be reachable before an `x-user-id` is known, so it cannot sit behind
      `denyUnless` — kept as its own router/domain rather than a `/users` sub-route, consistent
      with this app treating each concern as its own top-level Express router.

  - description: |
      Build the "User & role management" screen (public/users.html, public/css/users.css,
      public/js/users.js), porting layout/markup/classes directly from the prototype's first
      screen (design lines 549-621: `.app-topbar` with Expenses/Employees/Users nav, "Signed in
      as" viewer-switcher, toolbar with search + "+ New user", `user-table` with User/Roles/
      Status/Last active/Actions columns, `.access-denied-panel`, `.empty-state`) and its shared
      modal (design lines 857-888: create/edit-roles modal with `.role-checklist`/`.role-option`
      and `#roles-error`) and deactivate-confirm modal (design lines 890-906). `public/js/users.js`
      exports `initUsersApp(doc, initialUsers, api, viewerId)` and `createDefaultApi(getActingUserId)`,
      following the exact shape of `initRoomsApp`/`createDefaultApi` in public/js/rooms.js:
      `createDefaultApi` sends `x-user-id` instead of `x-staff-role` on every request. The role
      checklist is rendered from a fixed `['admin', 'finance', 'employee']` list with the labels/
      descriptions from the prototype's fixture (design lines 487-491); submitting with zero
      boxes checked shows `#roles-error` inline and keeps the modal open (AC3), matching the
      prototype's documented behavior (design lines 1105-1109). The "Signed in as" select is
      populated from the seeded users returned by `GET /users` (falls back to showing the
      access-denied panel for a non-admin/finance selection, per AC10).
      Add a "Users" link (pointing at `users.html`) to the nav in public/index.html, next to the
      existing dead "Employees" link, so the new screen is reachable from the app shell — the
      prototype's own topbar already shows this same three-link nav (design line 552-556).
    files:
      - public/users.html
      - public/css/users.css
      - public/js/users.js
      - public/index.html
    rationale: |
      Reuses the exact component classes already defined in the prototype's embedded
      `<style>` (`.user-table`, `.role-checklist`, `.status-chip--deactivated`, etc. — design
      lines 365-402) rather than re-deriving new CSS, and mirrors the existing rooms.js
      init-function/api-object shape so the new screen fits the codebase's established
      frontend pattern (see public/js/rooms.js, test/rooms-ui.test.js).

  - description: |
      Build the sign-in screen (public/signin.html, public/js/signin.js), porting the
      prototype's "Sign-in" screen markup (design lines 632-677: email/password form, "Try a
      sample account" chips, `#signin-error` banner, `#signin-success` card). On submit, calls
      `POST /auth/sign-in`; on `403 account_deactivated` shows `#signin-error` with the server's
      message and clears the password field only (design lines 1209-1216: "password field is
      cleared for security while email stays"); on `401 invalid_credentials` shows the same
      banner with a generic message; on `200` hides the form and shows `#signin-success` with
      the signed-in name and a joined roles string (design lines 1218-1222).
    files:
      - public/signin.html
      - public/js/signin.js
    rationale: |
      Directly implements AC4 and AC7 against the prototype's dedicated Sign-in screen; kept as
      its own page (not folded into users.html) because the prototype treats it as a separate
      screen with its own topbar (no nav, just the brand — design line 633-635).

  - description: |
      Build the read-only "expense history" view for a deactivated account (public/user-history.html,
      public/js/user-history.js), porting the prototype's "Deactivated Account — Expense History"
      screen (design lines 734-767: `.readonly-banner`, `.history-table` with a "Read-only" tag
      column instead of edit controls). It reads the same `localStorage.getItem('expenses')` key
      already written by `public/js/expenses.js` (see test/expenses.test.js persisting to
      `localStorage['expenses']`), filters entries where `loggedBy === user.name ||
      approvedBy === user.name`, and renders them exactly as the prototype's table — no edit or
      delete affordance anywhere on the page.
      Add a "View history" action to every row in the user table (public/js/users.js), since the
      prototype's row actions only show "Edit roles"/"Deactivate" (design lines 1006-1009) with
      no linked element reaching this screen — see assumptions_or_open_questions for why this
      addition was necessary and is flagged for reviewer sign-off rather than silently decided.
    files:
      - public/user-history.html
      - public/js/user-history.js
      - public/js/users.js
    rationale: |
      AC8 requires that a deactivated user's logged/approved expenses stay visible as read-only
      history; since `public/js/expenses.js` already shows every expense to every viewer
      regardless of the logger's account status (shared-visibility-hint in public/index.html,
      design has no coupling between expenses and user status), the core guarantee (data is
      never deleted or hidden) is already structurally true — this scope item makes the
      prototype's dedicated per-account view reachable and verifiable rather than leaving it as
      an illustrative-only screen.

package_dependencies: []

tests:
  - |
    AC1 — test/users-store.test.js: `createUser` with at least one role succeeds and the account
    is created active.
    ```js
    const user = createUser({ name: 'Jordan Avery', email: 'jordan.avery@company.com', roles: ['employee'], password: 'Secret123!' });
    expect(user.id).toBeDefined();
    expect(user.status).toBe('active');
    expect(user.roles).toEqual(['employee']);
    ```
  - |
    AC2 — test/users-role-enforcement.test.js: a newly created account appears in `GET /users`.
    ```js
    const res = await request(app).post('/users').set('x-user-id', admin.id).send({ name: 'Jordan Avery', email, roles: ['employee'] });
    const list = await request(app).get('/users').set('x-user-id', admin.id);
    expect(list.body.some((u) => u.id === res.body.id)).toBe(true);
    ```
  - |
    AC3 — test/users-role-enforcement.test.js (route) and test/users-store.test.js (store):
    creating with no role is rejected with an error message naming the missing field.
    ```js
    const res = await request(app).post('/users').set('x-user-id', admin.id).send({ name: 'No Role', email, roles: [] });
    expect(res.status).toBe(400);
    expect(res.body.fields.roles).toMatch(/at least one role/i);
    ```
    Also a `public/js/users.js` UI test (jsdom, modeled on test/rooms-ui.test.js) asserting
    `#roles-error` is shown and `api.create` is never called when the checklist submits with zero
    boxes checked.
  - |
    AC4 — test/auth-signin.test.js: an active account signs in successfully with valid
    credentials.
    ```js
    const res = await request(app).post('/auth/sign-in').send({ email: user.email, password: 'Secret123!' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: user.id, roles: ['employee'] });
    ```
  - |
    AC5/AC6 — test/users-role-enforcement.test.js: granting a role to an existing, already-acting
    account changes what that same account id can do on its very next request — no new account,
    no new header value.
    ```js
    const before = await request(app).get('/users').set('x-user-id', devon.id);
    expect(before.status).toBe(403);
    await request(app).patch(`/users/${devon.id}/roles`).set('x-user-id', admin.id).send({ roles: ['employee', 'finance'] });
    const after = await request(app).get('/users').set('x-user-id', devon.id);
    expect(after.status).toBe(200);
    ```
  - |
    AC7 — test/auth-signin.test.js: a deactivated account cannot sign in, with the exact
    prototype copy.
    ```js
    usersStore.deactivateUser(user.id);
    const res = await request(app).post('/auth/sign-in').send({ email: user.email, password: 'Secret123!' });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'account_deactivated', message: 'This account has been deactivated. Contact an administrator for access.' });
    ```
  - |
    AC8 — test/users-store.test.js: deactivating a user retains the full account record (never
    deleted), so expense rows keyed by that name remain attributable; plus a
    public/js/user-history.js jsdom test asserting the rendered table includes a "Read-only" tag
    and no edit/delete control for a deactivated user's localStorage expense entries.
    ```js
    usersStore.deactivateUser(user.id);
    expect(usersStore.getUser(user.id)).toMatchObject({ id: user.id, name: 'Elena Brooks', status: 'deactivated' });
    ```
  - |
    AC9 — test/users-role-enforcement.test.js: a deactivated account is still returned by
    `GET /users` with a `status: 'deactivated'` field (never filtered out, unlike
    `listActiveGuests`).
    ```js
    const list = await request(app).get('/users').set('x-user-id', admin.id);
    expect(list.body.find((u) => u.id === target.id).status).toBe('deactivated');
    ```
  - |
    AC10 — test/users-role-enforcement.test.js: an account with only the employee role is denied
    access to every user-management endpoint.
    ```js
    const res = await request(app).get('/users').set('x-user-id', employee.id);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'forbidden', message: "You don't have permission to manage user accounts" });
    ```
    Plus the companion 401 case (no `x-user-id` header at all), matching the existing
    guests-role-enforcement.test.js / rooms-role-enforcement.test.js precedent.

assumptions_or_open_questions:
  - |
    The prototype's "New user" modal has no password field (design lines 868-881: only Full
    name, Email, and the role checklist), but AC4 requires signing in with "valid credentials."
    Resolution used in this plan: `createUser` accepts an optional `password`; when the UI
    doesn't send one, the store generates a random temporary password and returns it in the
    create response as `temporaryPassword` (hash-only persisted) for the admin to relay
    out-of-band. This is a genuine gap between the design and the acceptance criteria, not a
    silent choice — flagging for reviewer confirmation on whether a future story should add a
    password-set/invite UI.
  - |
    The prototype has no clickable element that reaches its own "Deactivated Account — Expense
    History" screen (design lines 734-767) from the main user table — it's only reachable via
    the reviewer's prev/next screen switcher, same as the "Reference States" screen. This plan
    adds a "View history" row action to make that screen reachable in the real app, since AC8
    is otherwise untestable end-to-end. Flagging this added affordance for reviewer sign-off
    since it isn't literally shown as clickable in the approved prototype.
  - |
    The prototype's "Role Change Takes Effect" screen (design lines 692-726) demonstrates AC5/AC6
    via a simulated "Approve expenses" permission check, but expense-approval gating doesn't
    exist anywhere in this codebase (`public/js/expenses.js` has no role/approval concept) and
    isn't in this story's acceptance criteria. This plan treats that screen as illustrative only
    and instead tests AC5/AC6 against the real `/users` access-control mechanism itself (granting
    the finance/admin role mid-session changes what that same account can do next, with no new
    account) — the same guarantee the design screen is dramatizing, on a real, already-in-scope
    endpoint instead of an invented one.
  - |
    Both `admin` and `finance` roles are treated as equally able to manage user accounts
    (create, edit roles, deactivate/reactivate, view the list), matching the prototype's
    `canManageUsers` helper (design line 940) and the story's own phrasing ("finance/admin
    user"). This means a finance-only account can grant the admin role to anyone, including
    itself — the story and design do not call for restricting that, so this plan does not add
    extra restriction.
  - |
    Authorization for `/users` and `/auth` is header-based (`x-user-id`, looked up live against
    the store) rather than a real session/cookie, consistent with how every other domain in
    this codebase (`guests`, `rooms`) simulates "who is making this request" via a header
    instead of real sessions. Wiring real browser sessions/cookies across the whole app is the
    epic-level "replace the name-picker with real authentication" effort and is out of scope for
    this story.

notes: |
  ```mermaid
  flowchart TD
    classDef touched fill:#f96,color:#000

    server[src/server.js]:::touched
    usersRoutes[src/users/routes.js]:::touched
    usersStore[src/users/store.js]:::touched
    authRoutes[src/auth/routes.js]:::touched
    usersHtml[public/users.html]:::touched
    usersJs[public/js/users.js]:::touched
    signinHtml[public/signin.html]:::touched
    signinJs[public/js/signin.js]:::touched
    historyHtml[public/user-history.html]:::touched
    historyJs[public/js/user-history.js]:::touched
    indexHtml[public/index.html]:::touched
    expensesJs[public/js/expenses.js]
    guestsRoutes[src/guests/routes.js]
    roomsRoutes[src/rooms/routes.js]

    server -->|mounts /users| usersRoutes
    server -->|mounts /auth| authRoutes
    server -.->|existing, unchanged, same mounting pattern| guestsRoutes
    server -.->|existing, unchanged, same mounting pattern| roomsRoutes
    usersRoutes -->|denyUnless reads live roles| usersStore
    authRoutes -->|authenticate email+password| usersStore
    usersJs -->|x-user-id header| usersRoutes
    signinJs -->|POST /auth/sign-in| authRoutes
    historyJs -->|reads localStorage expenses, no backend call| expensesJs
    usersHtml --> usersJs
    signinHtml --> signinJs
    historyHtml --> historyJs
    indexHtml -->|new Users nav link| usersHtml
  ```
  The dashed edges show the existing `guests`/`rooms` routers, included only to show that
  `src/server.js`'s existing mounting convention is being extended, not altered.

review_focus: |
  In scope: the `src/users` store+routes, `src/auth` sign-in route, and three new frontend
  pages (user management, sign-in, deactivated-account history) built from the approved
  prototype. Out of scope: real browser sessions/cookies app-wide, expense-approval permission
  gating, and any change to `public/js/expenses.js` itself (history view only reads its
  localStorage data).
  Riskiest area: the `x-user-id` live-role-lookup authorization model for `/users` and `/auth`
  is a deliberate departure from the rest of the codebase's static `x-staff-role` header
  convention — reviewers should hold this to "does a role edit via PATCH actually change what
  the same account id can do on the next call," not to parity with `guests`/`rooms`.
  Two scope decisions were made without an explicit AC or prototype affordance backing them and
  should be checked deliberately: the generated `temporaryPassword` on account creation (no
  password field exists in the approved create-user modal), and the added "View history" row
  action (no clickable element reaches that screen in the prototype itself).
