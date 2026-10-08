summary: |
  Implement user self-registration end to end: a new `src/users` domain (in-memory store +
  validation + duplicate-email detection, mirroring the existing `repairRequests`/`defects`
  domains) exposed as `POST /users`, plus a standalone pre-authentication registration page
  (`public/register.html` + `register.css` + `register.js`) that builds the two screens already
  approved in `.arc/designs/TEST-M1-STORY-209-design.html` — "Create account" and "Registration
  confirmed" — verbatim from that prototype's markup, copy, and token usage. AC1 ("a new user
  account is created") is satisfied by a real server-side record persisted in the new store; AC2
  ("they see a confirmation that their registration was successful") is satisfied by navigating to
  the confirmation screen that echoes back the submitted name/email, exactly as the prototype
  demonstrates.

scope:
  - description: |
      Add the `users` domain store: in-memory account storage, field validation, and duplicate
      email detection.

      New file `src/users/store.js`, modeled directly on `src/repairRequests/store.js`'s
      `RepairRequestValidationError` + `Map`-backed store pattern:

      ```js
      class UserValidationError extends Error {
        constructor(fields) { super('validation_error'); this.statusCode = 400; this.fields = fields; }
      }
      class EmailTakenError extends Error {
        constructor() { super('email_taken'); this.statusCode = 409; }
      }

      function createUser(data = {}) { /* returns { id, name, email, createdAt } — never password */ }
      function getUserByEmail(email) { /* case-insensitive lookup, used by createUser */ }
      ```

      Validation rules mirror the design's own client-side regexes exactly (`EMAIL_RE =
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/`, `PASSWORD_RE = /^(?=.*[0-9]).{8,}$/` from the prototype's
      `<script>`), applied server-side as the authoritative check: `name` non-empty after trim,
      `email` matches `EMAIL_RE`, `password` matches `PASSWORD_RE`, `termsAccepted` must be
      `true`. Password is hashed with Node's built-in `crypto.scryptSync` (random salt stored
      alongside the hash) — no new dependency, consistent with `src/employees/store.js` already
      using `crypto.randomUUID()` and no other domain in this repo using a password/auth library.
      Duplicate check is case-insensitive on email, matching the prototype script's `accounts.some
      ((a) => a.email.toLowerCase() === email.toLowerCase())`.
    files:
      - src/users/store.js
    rationale: |
      Every other domain in this codebase (`employees`, `defects`, `repairRequests`, `rooms`, ...)
      is a dedicated `src/<domain>/store.js` in-memory Map with its own validation-error class;
      a new "users" concept gets the same treatment rather than bolting onto an unrelated domain.

  - description: |
      Expose `POST /users` and wire it into the app.

      New file `src/users/routes.js`, modeled on `src/repairRequests/routes.js`:

      ```js
      router.post('/', (req, res, next) => {
        try {
          res.status(201).json(createUser(req.body));
        } catch (err) {
          if (err instanceof UserValidationError) return res.status(400).json({ error: 'validation_error', fields: err.fields });
          if (err instanceof EmailTakenError) return res.status(409).json({ error: 'email_taken' });
          next(err);
        }
      });
      ```

      `src/server.js` gets one new line, alongside the other routers:
      `app.use('/users', usersRouter);`
    files:
      - src/users/routes.js
      - src/server.js
    rationale: |
      `POST /users` is the real-backend equivalent of the prototype's simulated
      `accounts.push({ name, email })` — a dedicated, unauthenticated (anyone can register)
      endpoint, matching how `POST /repair-requests` is reachable without a role header while
      `GET /repair-requests` is gated.

  - description: |
      Build the "Create account" screen markup/styles from the approved prototype, dropping only
      the prototype's own reviewer-only scaffolding.

      `public/register.html` ports the `.screen[data-name="Create account"]` markup verbatim:
      `.auth-wrap > .auth-card` containing `<p class="auth-brand">Fixly</p>`, the `<h1>Create your
      account</h1>` / `<p>Register to start requesting and tracking repairs.</p>` header, the
      `#form-error-banner` (hidden, `role="alert"`, "⚠" icon) reserved for the duplicate-email
      case, and the `#register-form` with fields `reg-name` (text), `reg-email` (email),
      `reg-password` + `reg-confirm-password` (each a `.password-row` with a `.password-toggle`
      Show/Hide button, `id="toggle-password"` / `id="toggle-confirm-password"`), the
      `field-hint` "At least 8 characters, including a number.", a `.terms-row` checkbox
      (`reg-terms`) labelled "I agree to the Terms of Service and Privacy Policy.", per-field
      `.field-error` paragraphs with the prototype's exact copy (e.g. "Error: passwords don't
      match."), and the `#submit-btn` ("Create account" / "Creating account…" while submitting).
      Linked stylesheets are the shared `../design-system/tokens.css` +
      `../design-system/prototype-utils.css` (as every shipped page does) plus a new
      `./css/register.css`, instead of the prototype file's own inlined `:root` token block (that
      inlining exists only so the standalone prototype preview has no external dependency).

      `public/css/register.css` ports the prototype's `.auth-wrap`/`.auth-card`/`.auth-brand`/
      `.auth-header`/`.field-hint`/`.field-error`/`.input-invalid`/`.password-row`/
      `.password-toggle`/`.terms-row`/`#submit-btn`/`.form-banner` rules unchanged (they already
      compose only design-token custom properties, so no values need to change when moved out of
      the prototype's inlined `:root`).

      Dropped from the prototype, not shipped: the `#review-bar` prev/next screen switcher, the
      `#fixture-accounts` inline JSON script, and the `.demo-note` "Reviewer tooling" panel
      (explicitly marked in the prototype itself as "not part of the shipped app").
    files:
      - public/register.html
      - public/css/register.css
    rationale: |
      The design is already approved; this just transcribes its "Create account" screen into a
      real shipped page the same way `public/services.html` transcribes its prototype's screens,
      using the shared token stylesheet instead of an inlined copy.

  - description: |
      Build the "Registration confirmed" screen markup/styles from the approved prototype.

      Same `public/register.html` / `public/css/register.css` files gain the second
      `.screen[data-name="Registration confirmed"]`: `.confirm-icon` ("✓"), `<h1>Registration
      successful</h1>` / `<p>Your account has been created. Welcome aboard!</p>`, a
      `.confirm-summary` `<dl>` with Name/Email rows (`#confirm-name`, `#confirm-email`), and
      `.confirm-actions` with `#go-to-signin` ("Go to sign in") and `#back-to-form` ("Register
      another account"), plus the `#scope-toast` shown by `#go-to-signin`.
    files:
      - public/register.html
      - public/css/register.css
    rationale: |
      Per the prototype's own authored comment, "Go to sign in" is shown for flow completeness but
      opens a toast rather than a fake navigation because sign-in is a separate story — that
      boundary is a deliberate design decision, not something to build out further here.

  - description: |
      Wire the two screens together: client-side validation, submit handling against the real
      `POST /users` API, and screen navigation.

      New file `public/js/register.js`, structured like `public/js/services.js`
      (`initRegisterApp(doc, api)` + `createDefaultApi()`, exported via `module.exports` for
      tests and auto-invoked on `DOMContentLoaded`):

      ```js
      function initRegisterApp(doc, api) { /* validate(), setFieldError(), submit handler, show(screenIndex) */ }
      function createDefaultApi() {
        return {
          createAccount: (payload) => request('/users', 'POST', payload),
        };
      }
      module.exports = { initRegisterApp, createDefaultApi };
      ```

      `validate()` reuses the prototype's exact rules (`EMAIL_RE`, `PASSWORD_RE`, confirm-password
      equality, terms checkbox) client-side for immediate feedback; the real authoritative check
      still happens server-side in `src/users/store.js`. On submit: disable + relabel `#submit-btn`
      to "Creating account…", call `api.createAccount({ name, email, password, termsAccepted })`;
      on success, render `#confirm-name` / `#confirm-email` from the submitted values and switch
      to the confirmation screen; on a `409 email_taken` rejection, show `#form-error-banner` with
      the prototype's copy ("An account with this email address already exists. Try a different
      email.") and focus `#reg-email`; on a `400 validation_error` rejection, map `err.fields` onto
      the matching `.field-error` elements. `#go-to-signin` shows `#scope-toast` for ~3.2s (same
      timing as the prototype). `#back-to-form` resets the form and errors, returns to screen 0.
    files:
      - public/js/register.js
    rationale: |
      Keeps the client a thin, test-friendly wrapper around a real `fetch` call (same shape as
      `createDefaultApi().createRequest` in `public/js/services.js`), so UI tests can inject a
      fake `api` and backend tests can hit the Express route directly — no UI test depends on a
      real server, no backend test depends on the DOM.

tests:
  - |
    AC1 (backend, `test/users.test.js`, modeled on `test/repair-requests.test.js`): a valid
    registration persists a real account record.
    ```js
    test('AC1: valid registration creates a new user account', async () => {
      const res = await request(app).post('/users').send(validPayload);
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ name: 'Taylor Reed', email: 'taylor.reed@example.com' });
      expect(res.body.password).toBeUndefined();
    });
    ```
  - |
    AC1 (backend): persistence is proven the same way the prototype itself proves it — a second
    registration with the same email is rejected, which is only possible if the first one
    actually persisted.
    ```js
    test('a second registration with the same email is rejected, proving the first was persisted', async () => {
      await request(app).post('/users').send(validPayload);
      const res = await request(app).post('/users').send(validPayload);
      expect(res.status).toBe(409);
      expect(res.body.error).toBe('email_taken');
    });
    ```
  - |
    AC1 (backend): invalid data is rejected with field-level errors instead of creating an
    account.
    ```js
    test('invalid registration data is rejected with field errors', async () => {
      const res = await request(app).post('/users').send({ name: '', email: 'not-an-email', password: 'short', termsAccepted: false });
      expect(res.status).toBe(400);
      expect(res.body.fields).toEqual(expect.objectContaining({
        name: expect.any(String), email: expect.any(String), password: expect.any(String), termsAccepted: expect.any(String),
      }));
    });
    ```
  - |
    AC2 (UI, `test/register-ui.test.js`, modeled on `test/services-ui.test.js`): a successful
    submission shows the confirmation screen restating the submitted name/email.
    ```js
    test('AC2: successful submission shows the Registration successful confirmation', async () => {
      const api = makeApi();
      initRegisterApp(document, api);
      fillValid();
      submitForm();
      await flush();
      expect(document.querySelector('.screen[data-name="Registration confirmed"]').style.display).not.toBe('none');
      expect($('confirm-name').textContent).toBe('Taylor Reed');
      expect($('confirm-email').textContent).toBe('taylor.reed@example.com');
    });
    ```
  - |
    AC2 (UI): an invalid submission never shows a false confirmation — the user stays on the
    Create account screen with inline errors.
    ```js
    test('invalid submission keeps the user on the form and never shows the confirmation', async () => {
      const api = makeApi();
      initRegisterApp(document, api);
      submitForm();
      expect(api.createAccount).not.toHaveBeenCalled();
      expect(document.querySelector('.screen[data-name="Registration confirmed"]').style.display).toBe('none');
      expect($('err-name').hidden).toBe(false);
    });
    ```
  - |
    AC2 (UI): a duplicate-email rejection from the server surfaces as the form-level banner (per
    the design), not a field error, and does not navigate to the confirmation screen.
    ```js
    test('duplicate-email response shows the form banner, not the confirmation screen', async () => {
      const api = makeApi({ createAccount: jest.fn().mockRejectedValue({ status: 409, error: 'email_taken' }) });
      initRegisterApp(document, api);
      fillValid();
      submitForm();
      await flush();
      expect($('form-error-banner').hidden).toBe(false);
      expect(document.querySelector('.screen[data-name="Registration confirmed"]').style.display).toBe('none');
    });
    ```

assumptions_or_open_questions:
  - |
    Password hashing uses Node's built-in `crypto.scryptSync` (random salt stored alongside the
    hash) rather than adding a dependency like `bcrypt` — no domain in this repo currently depends
    on a password/auth library, and the design prototype itself has no real backend to dictate a
    choice here.
  - |
    `confirmPassword` is validated client-side only (matches the prototype's own script, which
    never sends `confirmPassword` anywhere) — it is a typo safeguard, not sent to `POST /users`.
    The server's authoritative check is on `password` + `termsAccepted` + `email` format/
    uniqueness.
  - |
    Registering does not create a session or log the user in — the design's own comment says
    sign-in is a different story and "Go to sign in" deliberately opens a toast instead of a real
    navigation. This plan does not add any login/session mechanism.
  - |
    `register.html` is a standalone, unlinked entry point (consistent with the design's "no app
    nav — pre-authentication screen" note); this plan does not add a link to it from any other
    existing page, since no acceptance criterion or design note asks for that.
  - |
    The prototype's `#review-bar`, `#fixture-accounts` script, and `.demo-note` "Reviewer tooling"
    panel are explicitly prototype-only per the design's own HTML comment and are not carried into
    the shipped `register.html`.

package_dependencies: []

notes: |
  Design source actually read: `.arc/designs/TEST-M1-STORY-209-design.html` (two screens: "Create
  account" and "Registration confirmed", both built from `.auth-wrap`/`.auth-card` plus existing
  `.input`/`.label`/`.btn`/`.field-error` tokens — no new design-system tokens introduced). The
  prototype's own authored comment block (just before `<body>`) documents the exact behavior this
  plan mirrors: simulated account creation proven via duplicate-email rejection, confirmation
  screen restating submitted name/email, inline per-field validation plus one form-level banner
  reserved for the server-only duplicate-email case, and "Go to sign in" opening a toast because
  sign-in is a different story.

  No conflict found between the two ACs and the design: AC1 ("a new user account is created") and
  AC2 ("see a confirmation") map directly onto the prototype's two screens with no reinterpretation
  needed.

  ```mermaid
  flowchart TD
    classDef touched fill:#f96,color:#000
    classDef context fill:#eee,color:#000

    browser["public/register.html"]:::touched -->|loads| regjs["public/js/register.js<br/>initRegisterApp / createDefaultApi"]:::touched
    regjs -->|"fetch POST /users"| serverjs["src/server.js"]:::touched
    serverjs -->|"app.use('/users', ...)"| usersroutes["src/users/routes.js"]:::touched
    usersroutes -->|createUser / getUserByEmail| usersstore["src/users/store.js"]:::touched

    serverjs --> otherrouters["other routers<br/>(employees, defects, repairRequests, ...)"]:::context
    repairstore["src/repairRequests/store.js<br/>(pattern reference only)"]:::context -.->|modeled on| usersstore
    servicesjs["public/js/services.js<br/>(pattern reference only)"]:::context -.->|modeled on| regjs
  ```

review_focus: |
  In scope: a new `src/users` store+route (`POST /users` only — no `GET /users`, since nothing in
  the ACs needs to list accounts) and the two registration screens already approved in the design.
  Out of scope, deliberately: any login/session creation, linking `register.html` from other pages,
  and sending `confirmPassword`/terms text to the server (only a boolean `termsAccepted`). The
  riskiest area is the duplicate-email check in `src/users/store.js` — it's the only piece proving
  AC1's "account is created" without a way to list/read accounts back, so get the case-insensitive
  comparison and the 409-vs-400 error split right. Password hashing intentionally uses Node's
  built-in `crypto` instead of adding a dependency; don't flag the absence of `bcrypt`/`argon2` as
  a gap — it's a deliberate choice to match this repo's existing (dependency-free) auth footprint.
