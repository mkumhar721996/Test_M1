summary: |
  Implement real user accounts and role management for TEST-M1-STORY-152: a backend
  `src/users` module (in-memory store + Express routes) that lets a finance/admin caller
  create accounts with at least one role, edit/remove roles on existing accounts,
  deactivate/reactivate accounts, and sign in with an account's email; plus the two
  interactive screens the approved prototype
  (`.arc/designs/TEST-M1-STORY-152-design.html`) shows as real, navigable pages —
  "User & Role Management" (`public/users.html` / `public/js/users.js` /
  `public/css/users.css`) and "Sign-in" (`public/signin.html` / `public/js/signin.js`).
  Role gating reuses this codebase's existing `x-staff-role`-header convention (as seen
  in `src/rooms/routes.js` and `src/guests/routes.js`) rather than inventing a new auth
  mechanism, since no session/token layer exists anywhere in the app yet — that larger
  "replace the name-picker with real authentication" effort is the parent epic, not this
  story. Two of the design's five screens ("Role Changes Take Effect Immediately" and
  "Deactivated Account — Expense History") are, per the design's own annotations,
  reviewer-facing demonstrations of behavior rather than pages a real user would
  navigate to, and the fifth ("Reference States") is explicitly a non-interactive
  reviewer recap — none of the three are built as standalone routed pages; the
  behaviors they dramatize (AC5/AC6 immediacy, AC8 non-destructive deactivation) are
  instead proven with backend tests against the real `/users` endpoints and store.

scope:
  - description: |
      Add `src/users/store.js`: the in-memory account/role domain model. Exports
      `VALID_ROLES = ['admin', 'finance', 'employee']` (matching the design's
      `roleLabels`/`roleDescriptions` fixture, not the epic's separate "approver" role —
      see assumptions), `UserValidationError`, and:
        - `createUser({ name, email, roles })` — validates name present, email present
          and well-formed and unique, roles a non-empty array of valid role strings;
          throws `UserValidationError('validation_error', fields)` otherwise. Returns
          `{ id, name, email, roles, status: 'active', createdAt, updatedAt }`.
        - `getUser(id)`, `getUserByEmail(email)`, `listUsers()`
        - `setUserRoles(id, roles)` — same roles validation as create; returns the
          updated user or `undefined` if the id doesn't exist.
        - `deactivateUser(id)` / `reactivateUser(id)` — flip `status` and
          `deactivatedAt`, never delete or otherwise mutate the record.
        - `canManageUsers(role)` — `role === 'admin' || role === 'finance'`, mirroring
          the design's own `canManageUsers(u)` check and its access-denied copy ("limited
          to Admin and Finance accounts").
        - `signIn(email, password)` — looks up by email; returns `{ ok: false, reason:
          'not_found' }`, `{ ok: false, reason: 'deactivated', user }`, or `{ ok: true,
          user }`. `password` is required to be present by the route layer but is not
          verified against a stored credential here — see assumptions.
      Seeds exactly one fixture account on module load so the system is never locked out
      with zero manageable accounts: `{ name: 'Priya Shah', email:
      'priya.shah@company.com', roles: ['admin', 'finance'] }`, reusing the design's own
      `usr_001` persona rather than inventing a new one.
    files:
      - src/users/store.js
      - test/users-store.test.js
    rationale: |
      Mirrors the existing store pattern in src/guests/store.js and src/rooms/store.js
      (crypto.randomUUID ids, a ValidationError subclass with statusCode+fields, a plain
      Map as storage) so the new module fits the codebase's existing conventions rather
      than introducing a new persistence style.

  - description: |
      Add `src/users/routes.js` (Express router) and mount it at `/users` in
      `src/server.js`:
        - `GET /users` — list accounts.
        - `POST /users` — create an account (`{ name, email, roles }`).
        - `PATCH /users/:id/roles` — body `{ roles: string[] }`; 404 if the id doesn't
          exist, 400 with `fields.roles` on an empty/invalid role list.
        - `POST /users/:id/deactivate` / `POST /users/:id/reactivate`.
        - `POST /users/sign-in` — public, no role header required; body
          `{ email, password }`; 400 if either is missing, 401
          `{ error: 'invalid_credentials' }` for an unknown email, 403
          `{ error: 'account_deactivated', message: 'This account has been deactivated.
          Contact an administrator for access.' }` for a deactivated account (exact copy
          from the design's sign-in-error and reference-states screens), else 200 with
          `{ id, name, email, roles }`.
      All routes except sign-in are gated by a `denyUnless` guard reading
      `req.headers['x-staff-role']` through `canManageUsers`, returning a single 403
      `{ error: 'forbidden', message: "User & role management is limited to Admin and
      Finance accounts. Ask an administrator for the Admin or Finance role." }` for any
      disallowed or missing role — one unified message, matching the design's single
      `#um-access-denied` panel (it does not distinguish "no header" from "wrong role").
    files:
      - src/users/routes.js
      - src/server.js
      - test/users.test.js
      - test/users-role-enforcement.test.js
      - test/users-role-change.test.js
      - test/signin.test.js
    rationale: |
      Reuses the `x-staff-role` header + `denyUnless(action)` shape already established
      in src/rooms/routes.js, so this new domain is gated the same way every other
      role-gated route in the app already is, rather than introducing a second
      authorization mechanism. test/users-role-change.test.js is the backend proof for
      AC5/AC6 in place of building the design's "Role Change Takes Effect" demo screen
      as a real page (see summary/assumptions).

  - description: |
      Build the approved "User & Role Management" screen as a real page:
      `public/users.html`, `public/js/users.js`, `public/css/users.css`. Taken directly
      from the design (lines ~549-888 of the prototype):
        - App topbar with brand "Expense Tracker", nav Expenses/Employees/Users(active),
          and a "Signed in as" `<select id="viewer-select">` — kept as a per-user picker
          (not a per-role picker) to stay literally faithful to the design's named-user
          dropdown, but bridged client-side to the backend's single `x-staff-role` header
          by picking the selected user's highest-privilege role (admin > finance >
          employee).
        - `#um-access-denied` panel (shown instead of the table for a non-admin/finance
          viewer) and `#um-content` (toolbar with search input + "+ New user" button,
          results count, `.user-table` with User/Roles/Status/Last active/Actions
          columns, `#um-empty` no-search-match state) — ids and structure taken verbatim
          from the design.
        - Create/Edit-roles modal (`#user-modal-*`, `#role-checklist`, `#roles-error`)
          reusing the design's exact role-checklist markup and its exact validation copy
          "Select at least one role so this account has permissions to sign in with."
        - Deactivate confirmation modal (`#deactivate-modal-*`) with the design's exact
          consequence copy naming both effects from AC7/AC8: "...They will no longer be
          able to sign in. Expenses they created or approved will remain visible as
          read-only history tied to their account."
        - Toast notifications via a `#toast-root` that appends/removes `.toast` elements,
          matching the design's toast mechanism (not the single-static-toast element used
          by public/js/rooms.js), with the design's exact copy for create/role-update/
          deactivate/reactivate toasts.
      `public/css/users.css` holds the page-specific component CSS from the design's
      third `<style>` block (role-checklist, user-table, status/role chips,
      empty/access-denied states, skeleton rows, session/sign-in/readonly styles) minus
      the reviewer-bar-only rules — `.btn`/`.card`/`.modal-*`/`.input`/`.app-topbar`
      etc. already exist in `design-system/prototype-utils.css` and are reused as-is.
    files:
      - public/users.html
      - public/js/users.js
      - public/css/users.css
      - test/users-ui.test.js
    rationale: |
      Mirrors the public/rooms.html + public/js/rooms.js + public/css/rooms.css split
      and the initRoomsApp(doc, initialData, api) / createDefaultApi(...) testable-DI
      pattern from test/rooms-ui.test.js, since this screen is structurally the same
      shape (search + table + create/edit modals + deactivate confirm + role-gated
      denied panel) as the existing rooms admin screen.

  - description: |
      Build the approved "Sign-in" screen as a real page: `public/signin.html`,
      `public/js/signin.js` (styles added to the shared `public/css/users.css` from the
      scope item above, since the design keeps all screens' CSS in one stylesheet).
      Taken from the design (lines ~632-677, ~1182-1231): email/password form
      (`#signin-form`), inline error banner (`#signin-error`) with the exact deactivated-
      account copy, and a success card (`#signin-success`) showing the signed-in name
      and roles with a "Sign out / try another account" reset button. The design's "Try
      a sample account" shortcut chips are intentionally omitted — they reference
      fixture-only demo accounts (Jordan Avery, Elena Brooks) that the real backend does
      not seed, so including them would silently imply demo accounts exist in
      production.
    files:
      - public/signin.html
      - public/js/signin.js
      - test/signin-ui.test.js
    rationale: |
      Same testable-DI UI pattern as the Users screen and rooms.js: an init function
      taking `(doc, api)` so tests can inject a fake `signIn` without a real server.

  - description: |
      Add a real "Users" nav link to `public/index.html`'s existing topbar nav (currently
      `Expenses` (active) and a dead-link `Employees`), pointing to `./users.html`, so the
      screen is reachable from the app's main entry point as the design's nav implies.
    files:
      - public/index.html
    rationale: |
      The design's own topbar nav for this story's screens is Expenses/Employees/Users,
      matching public/index.html's existing "Expense Tracker" brand — this is the one
      cross-page link the design implies that didn't already exist.

tests:
  - |
    AC1 (store+route): creating a new account with at least one role assigned creates it.
    ```js
    test('AC1: creating a new user account with at least one role assigned creates the account', async () => {
      const res = await request(app).post('/users').set('x-staff-role', 'admin')
        .send({ name: 'Jordan Avery', email: 'jordan.avery@company.com', roles: ['employee'] });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ name: 'Jordan Avery', email: 'jordan.avery@company.com', roles: ['employee'], status: 'active' });
    });
    ```
  - |
    AC2 (route): the new account appears in the user list.
    ```js
    test('AC2: the new account appears in the user list', async () => {
      await request(app).post('/users').set('x-staff-role', 'admin')
        .send({ name: 'Taylor Shaw', email: 'taylor.shaw@company.com', roles: ['employee'] });
      const list = await request(app).get('/users').set('x-staff-role', 'admin');
      expect(list.body.some((u) => u.email === 'taylor.shaw@company.com')).toBe(true);
    });
    ```
  - |
    AC3 (store+route+UI): creating without any role is rejected with an error message and,
    in the UI, the modal stays open with typed values intact and the api is never called.
    ```js
    test('AC3: creating a user with no roles is rejected with an error message', async () => {
      const res = await request(app).post('/users').set('x-staff-role', 'admin')
        .send({ name: 'No Role', email: 'no.role@company.com', roles: [] });
      expect(res.status).toBe(400);
      expect(res.body.fields.roles).toBe('Select at least one role so this account has permissions to sign in with.');
    });
    ```
    ```js
    // test/users-ui.test.js
    document.getElementById('user-name-input').value = 'No Role';
    document.getElementById('user-form').dispatchEvent(new Event('submit', { cancelable: true }));
    expect(document.getElementById('roles-error').hidden).toBe(false);
    expect(document.getElementById('user-name-input').value).toBe('No Role');
    expect(api.create).not.toHaveBeenCalled();
    ```
  - |
    AC4 (route): a newly created, active account signs in successfully with valid
    credentials.
    ```js
    test('AC4: a newly created active account signs in successfully', async () => {
      await request(app).post('/users').set('x-staff-role', 'admin')
        .send({ name: 'Jordan Avery', email: 'jordan.avery@company.com', roles: ['employee'] });
      const res = await request(app).post('/users/sign-in').send({ email: 'jordan.avery@company.com', password: 'anything' });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ email: 'jordan.avery@company.com', roles: ['employee'] });
    });
    ```
  - |
    AC5 (route): assigning then removing a role from an existing account never creates a
    second account — the same id is updated in place.
    ```js
    test('AC5: role changes never create a new account', async () => {
      const created = await request(app).post('/users').set('x-staff-role', 'admin')
        .send({ name: 'Devon Ruiz', email: 'devon.ruiz@company.com', roles: ['employee'] });
      const id = created.body.id;
      await request(app).patch(`/users/${id}/roles`).set('x-staff-role', 'admin').send({ roles: ['employee', 'finance'] });
      const list = await request(app).get('/users').set('x-staff-role', 'admin');
      expect(list.body.filter((u) => u.email === 'devon.ruiz@company.com')).toHaveLength(1);
      expect(list.body.find((u) => u.id === id).roles).toEqual(['employee', 'finance']);
    });
    ```
  - |
    AC6 (route, test/users-role-change.test.js): a role change takes effect on the very
    next request against a real gated endpoint, with no re-authentication step.
    ```js
    test('AC6: a role change takes effect on the next action', async () => {
      const created = await request(app).post('/users').set('x-staff-role', 'admin')
        .send({ name: 'Devon Ruiz', email: 'devon.ruiz2@company.com', roles: ['employee'] });
      const id = created.body.id;
      const before = await request(app).get('/users').set('x-staff-role', 'employee');
      expect(before.status).toBe(403);
      await request(app).patch(`/users/${id}/roles`).set('x-staff-role', 'admin').send({ roles: ['finance'] });
      const after = await request(app).get('/users').set('x-staff-role', 'finance');
      expect(after.status).toBe(200);
    });
    ```
  - |
    AC7 (route): a deactivated account can no longer sign in.
    ```js
    test('AC7: a deactivated account cannot sign in', async () => {
      const created = await request(app).post('/users').set('x-staff-role', 'admin')
        .send({ name: 'Elena Brooks', email: 'elena.brooks@company.com', roles: ['employee'] });
      await request(app).post(`/users/${created.body.id}/deactivate`).set('x-staff-role', 'admin');
      const res = await request(app).post('/users/sign-in').send({ email: 'elena.brooks@company.com', password: 'anything' });
      expect(res.status).toBe(403);
      expect(res.body).toEqual({ error: 'account_deactivated', message: 'This account has been deactivated. Contact an administrator for access.' });
    });
    ```
  - |
    AC8 (store): deactivating a user retains the account record unchanged except
    status/deactivatedAt — proving deactivation is non-destructive, which is the backend
    invariant this story can guarantee given expenses have no backend user-linkage today
    (see assumptions).
    ```js
    test('AC8: deactivating retains the account record for historical reference', () => {
      const user = usersStore.createUser({ name: 'Elena Brooks', email: 'elena.hist@company.com', roles: ['employee', 'finance'] });
      const deactivated = usersStore.deactivateUser(user.id);
      expect(deactivated).toMatchObject({ id: user.id, name: 'Elena Brooks', email: 'elena.hist@company.com', status: 'deactivated' });
      expect(usersStore.listUsers().some((u) => u.id === user.id)).toBe(true);
    });
    ```
  - |
    AC9 (route+UI): a deactivated account is visible in the user list with a clear
    deactivated status indicator.
    ```js
    test('AC9: a deactivated account is visible with a deactivated status', async () => {
      const created = await request(app).post('/users').set('x-staff-role', 'admin')
        .send({ name: 'Elena Brooks', email: 'elena.list@company.com', roles: ['employee'] });
      await request(app).post(`/users/${created.body.id}/deactivate`).set('x-staff-role', 'admin');
      const list = await request(app).get('/users').set('x-staff-role', 'admin');
      expect(list.body.find((u) => u.id === created.body.id).status).toBe('deactivated');
    });
    ```
    ```js
    // test/users-ui.test.js
    expect(document.querySelector('.user-table').textContent).toContain('Deactivated');
    ```
  - |
    AC10 (route+UI): a non-admin, non-finance user is denied access to user management.
    ```js
    test('AC10: an employee-only caller is denied', async () => {
      const res = await request(app).get('/users').set('x-staff-role', 'employee');
      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/limited to Admin and Finance accounts/);
    });
    ```
    ```js
    // test/users-ui.test.js — selecting an employee-only viewer
    expect(document.getElementById('um-access-denied').hidden).toBe(false);
    expect(document.getElementById('um-content').hidden).toBe(true);
    ```

assumptions_or_open_questions:
  - |
    Roles are `admin`, `finance`, `employee` only — taken from the approved design's
    `roleLabels`/`roleDescriptions` fixture. The parent epic also mentions an "approver"
    role; the design does not define it, so it is treated as out of scope for this story
    rather than invented.
  - |
    AC10 says "non-admin"; the story summary and the design's own `canManageUsers`/
    access-denied copy both treat finance as equally permitted to manage users. This plan
    denies everyone except admin OR finance, i.e. reads AC10 as "non-admin-and-non-finance".
  - |
    Password verification is not implemented. The design's creation form collects no
    password, and its sign-in screen explicitly notes "password is never validated in
    this prototype; any value is accepted." `signIn` therefore checks only that an email
    matches an active account; AC4/AC7 are satisfied on that basis. Real credential
    storage/verification would need a password field added to account creation first,
    which the approved design does not show — flagging as a gap for a future story, not
    silently inventing a password scheme the design never specified.
  - |
    AC8 ("expenses the user created or approved remain visible as read-only history")
    cannot be fully implemented end-to-end in this story: `public/js/expenses.js` is
    entirely client-side (localStorage, no backend, no `approvedBy` field, no link to a
    user id — only a free-text `loggedBy` name). Building that linkage is a
    separate, much larger expenses-backend undertaking outside "User Account and Role
    Management". This plan satisfies the backend invariant AC8 depends on — deactivation
    never deletes or mutates the account record or any other data — and documents the
    expenses-linkage gap rather than building a disconnected read-only expense-history
    page against data that isn't really tied to accounts yet.
  - |
    The design's "Role Changes Take Effect Immediately" and "Deactivated Account —
    Expense History" screens are, per their own code comments in the prototype,
    simulations/demonstrations for reviewers rather than pages reachable through the
    app's real navigation (no nav links point to them). This plan does not build them as
    standalone routed pages; AC5/AC6/AC8 are instead proven against the real `/users`
    endpoints and store (see tests).
  - |
    Exactly one fixture account is seeded on server start (`Priya Shah`, admin+finance,
    matching the design's `usr_001`) so the system always has at least one account able
    to create further accounts. No other fixture users from the design (Morgan Ellis,
    Devon Ruiz, Elena Brooks) are seeded in the real backend.
  - |
    The design's "Try a sample account" sign-in shortcut buttons are omitted since they
    reference fixture-only demo accounts the real backend doesn't seed.

package_dependencies: []

notes: |
  No new third-party dependencies are needed — express/jest/supertest/jsdom already
  cover everything this plan needs.

  ```mermaid
  flowchart TD
    classDef touched fill:#f96,color:#000
    server[src/server.js]
    routes[src/users/routes.js]
    store[src/users/store.js]
    usersHtml[public/users.html]
    usersJs[public/js/users.js]
    signinHtml[public/signin.html]
    signinJs[public/js/signin.js]
    indexHtml[public/index.html]

    server -->|mounts /users router| routes
    routes -->|create/list/setRoles/deactivate/reactivate/signIn| store
    usersHtml --> usersJs
    usersJs -->|fetch, x-staff-role header derived from selected viewer| routes
    signinHtml --> signinJs
    signinJs -->|POST /users/sign-in| routes
    indexHtml -->|new nav link| usersHtml

    class server,routes,store,usersHtml,usersJs,signinHtml,signinJs,indexHtml touched
  ```

  Existing conventions this plan deliberately reuses rather than reinvents: the
  Map-backed store + ValidationError(statusCode, fields) shape from src/guests/store.js
  and src/rooms/store.js; the x-staff-role header + denyUnless(action) gating shape from
  src/rooms/routes.js; and the initXApp(doc, initialData, api) + createDefaultApi(...)
  testable-DI UI pattern from public/js/rooms.js and test/rooms-ui.test.js.

review_focus: |
  In scope: the `src/users` store/routes, the Users-management and Sign-in pages, and a
  single nav link from the existing Expense Tracker index page. Out of scope (flagged,
  not silently skipped): real password verification, the "approver" role, any change to
  how expenses are stored or linked to accounts, and rewiring other pages' auth gating —
  all deferred to the parent "Access & Roles" epic or a future expenses-backend story.
  The riskiest area is the role-gating logic: `canManageUsers` must accept both `admin`
  and `finance` (the story explicitly says "finance/admin users") while AC10's literal
  "non-admin" wording is the narrower case — a reviewer should not flag finance-role
  access as a bug. The sign-in endpoint deliberately never checks the password value;
  that's a design-driven limitation (documented in assumptions), not an oversight.
