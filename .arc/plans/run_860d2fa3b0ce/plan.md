summary: |
  Implements the forgot-password flow (request via email or phone, delivery of a
  time-limited reset credential, code/link verification, and setting a new
  password) as a new `src/auth` backend module (store + notification-client stub +
  Express routes mounted at `/auth`) plus two new static frontend pages,
  `public/sign-in.html` and `public/forgot-password.html`, driven by
  `public/js/sign-in.js` and `public/js/forgot-password.js`. This follows the
  existing `hires`/`employees` convention (in-memory Map store + routes.js +
  supertest tests) for the backend and the existing `hire-profile`/`expenses`
  convention (`init<X>App(doc, api)` exported for jsdom tests, default `api` using
  real `fetch`) for the frontend. The approved prototype at
  `.arc/designs/TEST-M1-STORY-095-design.html` supplies every screen, copy string,
  and CSS class used here; prototype-only scaffolding (reviewer bar, the dashed
  "Prototype controls" demo panel, and the "Simulate: open reset link" /
  "Simulate: open an expired/used link" buttons) is deliberately NOT carried into
  production markup, since those exist only to let a reviewer preview states
  without a backend — production instead drives the same states from real
  `/auth/*` responses and a real emailed `?token=` deep link.

scope:
  - description: |
      New backend store for accounts and reset credentials, in `src/auth/store.js`.
      Seeds exactly one user (mirroring the single seeded `hire_2031` fixture in
      `src/hires/store.js`) with the design's own demo contact values —
      `works@example.com` / `+1 555 010 0100` — so tests and the frontend demo
      inputs line up with what the approved prototype already shows. Exposes:

      ```js
      function detectChannel(contact) // '@' -> 'email', else 'phone'
      function findUserByContact(contact)
      async function requestPasswordReset(contact) // returns { channel }, NEVER the credential
      function verifyResetCredential(credential) // { valid: boolean }
      function resetPassword(credential, newPassword, confirmPassword) // throws { code }
      function verifyLogin(contact, password) // boolean — used to prove AC8 without a real login route
      function passwordMeetsComplexity(password)
      function _resetForTests() // clears both Maps and re-seeds; needed because there is only one seeded identity shared across all tests
      ```

      Reset-credential TTLs are taken verbatim from the design's own copy
      (`.arc/designs/TEST-M1-STORY-095-design.html` lines 643 and 858): 15 minutes
      for an emailed link, 10 minutes for an SMS code. Credentials are single-use:
      `resetPassword` sets `usedAt` on the matching `resetCredentials` entry, and
      `verifyResetCredential` treats any entry with `usedAt` set the same as an
      expired/unknown one (AC4's "invalid, expired, or already used" are one
      error path, matching the design's error screen copy: "expired, was already
      used, or is invalid" — the design deliberately never distinguishes these
      three to the user).

      Passwords are hashed with Node's built-in `crypto.scryptSync` (salt + hash,
      `:`-joined) and compared with `crypto.timingSafeEqual` — no new dependency,
      consistent with this codebase's existing use of built-in `crypto.randomUUID`
      elsewhere and the project's demo-grade fidelity (in-memory only, no real
      persistence layer to design a hashing/migration story around).
    files:
      - src/auth/store.js
    rationale: |
      No account/login system exists anywhere in this codebase (confirmed by
      grep across `src/` and `public/` for password/login/auth/session/user —
      no matches) and no other story defines one, exactly as the work item's own
      "Open question for planning" flags. This is the minimal substrate the
      story's ACs actually require (AC1 needs a "no account" vs "account exists"
      distinction; AC2 needs a verified contact to send to; AC8 needs a place to
      persist and re-check a password hash) — not a general user-management
      system. See assumptions for what is deliberately left out.

  - description: |
      Stub notification client, `src/auth/notifyClient.js`, mirroring the
      existing `src/onboarding/engineClient.js` pattern (an async stub the store
      calls through a property reference so tests can `jest.spyOn` it):

      ```js
      async function sendResetEmail({ to, credential, ttlMinutes }) { return { channel: 'email', to, ttlMinutes }; }
      async function sendResetSms({ to, credential, ttlMinutes }) { return { channel: 'phone', to, ttlMinutes }; }
      module.exports = { sendResetEmail, sendResetSms };
      ```

      `store.js` must call `notifyClient.sendResetEmail(...)` / `notifyClient.sendResetSms(...)`
      via the required module object (`const notifyClient = require('./notifyClient')`),
      never via a destructured import — destructuring would capture the function
      reference before a test's `jest.spyOn(notifyClient, 'sendResetEmail')` can
      replace it, silently breaking AC2's tests.
    files:
      - src/auth/notifyClient.js
    rationale: |
      There is no real email/SMS provider configured anywhere in this repo
      (`package.json` has only `express` as a runtime dependency), and standing
      one up is out of this story's scope. This stub is also the only way tests
      can observe AC2 ("the system sends...") and simultaneously capture a real
      credential to drive AC3/AC4 tests, since the public API deliberately never
      returns the credential to the caller (that would violate AC1).

  - description: |
      Express routes for the flow, `src/auth/routes.js`, mounted at `/auth` in
      `src/server.js`:

      ```js
      router.post('/forgot-password', ...)  // { contact } -> 200 { message } always, regardless of match
      router.post('/reset/verify', ...)     // { credential } -> 200 { valid: true } | 400 { error: 'invalid_or_expired' }
      router.post('/reset/confirm', ...)    // { credential, newPassword, confirmPassword } -> 200 { success: true } | 400 invalid_or_expired | 422 weak_password | 422 password_mismatch
      ```

      Follows the existing `try/catch` + `next(err)` shape used in
      `src/hires/routes.js` and `src/employees/routes.js`.
    files:
      - src/auth/routes.js
      - src/server.js
    rationale: |
      `/forgot-password` always returns the same 200 + message shape whether or
      not `contact` matches a user — this is what makes AC1 true at the HTTP
      layer, not just in the frontend copy.

  - description: |
      Minimal `public/sign-in.html` + `public/js/sign-in.js`. Renders the design's
      "Sign in" screen (brand, email/phone + password fields, disabled-until-wired
      Sign in button, "Forgot password?" link to `./forgot-password.html`) and the
      one-time post-reset banner (`#signin-banner`, using the design's exact
      `status-icon is-success` + "Password updated. Sign in with your new
      password." copy). `initSignInApp(doc, search)` reveals the banner only when
      `search` contains `resetSuccess=1`:

      ```js
      function initSignInApp(doc, search) {
        const params = new URLSearchParams(search || '');
        doc.getElementById('signin-banner').hidden = params.get('resetSuccess') !== '1';
      }
      ```
    files:
      - public/sign-in.html
      - public/js/sign-in.js
    rationale: |
      AC10 requires a real page to redirect to, and the flow's step 1 ("User
      selects 'Forgot password' from the login screen") requires a real entry
      point link to exist. The design itself annotates this screen as "Entry
      point only, for context" — so the Sign in button is intentionally left
      without a submit handler (see assumptions); only the banner-reveal and the
      "Forgot password?" link are functional, which is exactly what this story's
      ACs need from this screen.

  - description: |
      `public/forgot-password.html` + `public/js/forgot-password.js`, covering
      the design's six non-demo screens: "Forgot password – Request", "Check your
      email or phone", "Enter reset code", "Reset link/code error", "Set new
      password", "Password updated". `initForgotPasswordApp(doc, api, options)`
      is exported for tests; the default `api` posts JSON to the three `/auth/*`
      routes above via `fetch`, matching `createDefaultApi` in
      `public/js/hire-profile.js`. `options.navigate` (default
      `(url) => { window.location.href = url; }`) is injected so tests never
      trigger a real jsdom navigation.

      ```js
      function initForgotPasswordApp(doc, api, options = {}) {
        const navigate = options.navigate || ((url) => { window.location.href = url; });
        // ... on init: read options.initialSearch for ?token=, else show 'request'
      }
      ```

      Password complexity (`passwordMeetsComplexity`) and the live checklist
      (`#pw-checklist li[data-rule=...]`, toggling `.met` and the `○`/`✓` mark)
      are ported verbatim from the design's inline `<script>` (its `rules` object
      and `updateChecklist`), since that logic is already approved and correct.
    files:
      - public/forgot-password.html
      - public/js/forgot-password.js
    rationale: |
      One page (not one per screen) matches how this repo already structures a
      multi-state flow — `hire-profile.html` holds five modals behind one JS
      controller, `index.html` holds the create/edit modals behind one JS
      controller — rather than the prototype's own convention (a single
      throwaway file with a reviewer prev/next bar), which §11 of the UI
      guidelines is explicit does not apply to production code.
      The email path's "Simulate: open reset link" button in the prototype is
      replaced by a real mechanism: the emailed link is
      `forgot-password.html?token=<credential>`, so a fresh page load with that
      query param calls `api.verifyCredential` on init and shows "Set new
      password" or the error screen directly — there is no continue button for
      email in production, since a real reset email's link *is* the click.

  - description: |
      New stylesheet `public/css/auth.css` for the classes introduced by this
      design that are not already in `design-system/prototype-utils.css`:
      `.auth-topbar`, `.auth-wrap`, `.auth-card` (+ `h1`, `> p.lede`), `.field
      .hint`, `.field-error-text`, `.input.has-error`, `.btn-block`, `.btn[disabled]`,
      `.link-btn`, `.form-footer`, `.status-icon` (+ `.is-success`/`.is-error`/`.is-info`),
      `.otp-input`, `.checklist` (+ `li`, `.mark`, `.met`), `.channel-row`,
      `.channel-chip` — copied from the design's third inline `<style>` block
      (design file lines 337-521), excluding `.demo-panel`, `#review-bar`, and
      `.screen[hidden]` (prototype-only; production relies on the native
      `hidden` attribute's default `display:none`, same as every other page in
      this repo). `.field { margin-bottom: var(--space-4); }` is NOT duplicated
      here since it already exists in `prototype-utils.css`.
    files:
      - public/css/auth.css
    rationale: |
      Matches the existing per-page-CSS convention (`expenses.css`,
      `hire-profile.css` each add only what prototype-utils.css doesn't already
      have, per the comment at the top of `hire-profile.css`).

  - description: |
      Backend tests: route-level (supertest against the real `app`) and
      store-level unit tests.
    files:
      - test/auth.test.js
      - test/auth-store.test.js
    rationale: |
      Mirrors `test/hires.test.js` (route/supertest) + `test/hires-store.test.js`
      (direct store unit tests) split.

  - description: |
      Frontend jsdom tests for both new pages, mirroring
      `test/hire-profile.test.js` / `test/expenses-create.test.js` (load the real
      HTML via `fs.readFileSync`, `require` the page's JS module, call
      `init*App` with a fake `api`).
    files:
      - test/sign-in.test.js
      - test/forgot-password.test.js
    rationale: ""

tests:
  - |
    AC1 — backend (`test/auth.test.js`): an unknown contact gets the identical
    response as a known one.
    ```js
    test('AC1: unknown contact returns the same generic message as a known contact', async () => {
      const known = await request(app).post('/auth/forgot-password').send({ contact: 'works@example.com' });
      const unknown = await request(app).post('/auth/forgot-password').send({ contact: 'unknown@example.com' });
      expect(known.status).toBe(200);
      expect(unknown.status).toBe(200);
      expect(unknown.body.message).toBe(known.body.message);
    });
    ```
    AC1 — frontend (`test/forgot-password.test.js`): submitting an unknown
    contact still reaches the same "Check your email or phone" confirmation
    screen (never a distinct "no account" error).
    ```js
    test('AC1: an unknown contact reaches the same confirmation screen as a known one', async () => {
      const api = fakeApi();
      initForgotPasswordApp(document, api, {});
      document.getElementById('fp-contact').value = 'unknown@example.com';
      document.getElementById('fp-submit-btn').click();
      await Promise.resolve(); await Promise.resolve();
      expect(document.querySelector('.screen[data-name="confirm"]').hidden).toBe(false);
    });
    ```
  - |
    AC2 — backend: a verified email contact triggers `notifyClient.sendResetEmail`
    with the right recipient; a verified phone contact triggers
    `sendResetSms`. Written first as a failing test against the not-yet-existing
    `src/auth/notifyClient.js` / `src/auth/store.js`.
    ```js
    test('AC2: a verified email contact triggers a reset email send', async () => {
      const notifyClient = require('../src/auth/notifyClient');
      const spy = jest.spyOn(notifyClient, 'sendResetEmail').mockResolvedValue({});
      await request(app).post('/auth/forgot-password').send({ contact: 'works@example.com' });
      expect(spy).toHaveBeenCalledWith(expect.objectContaining({ to: 'works@example.com', ttlMinutes: 15 }));
      spy.mockRestore();
    });
    test('AC2: a verified phone contact triggers a reset SMS send', async () => {
      const notifyClient = require('../src/auth/notifyClient');
      const spy = jest.spyOn(notifyClient, 'sendResetSms').mockResolvedValue({});
      await request(app).post('/auth/forgot-password').send({ contact: '+1 555 010 0100' });
      expect(spy).toHaveBeenCalledWith(expect.objectContaining({ to: '+1 555 010 0100', ttlMinutes: 10 }));
      spy.mockRestore();
    });
    ```
    AC2 — frontend: entering an email vs. a phone number renders the matching
    confirmation copy/channel and shows or hides the "Continue to enter code"
    control accordingly.
    ```js
    test('AC2: a phone number shows the SMS confirmation and "Continue to enter code"', async () => {
      const api = fakeApi();
      initForgotPasswordApp(document, api, {});
      document.getElementById('fp-contact').value = '+1 555 010 0100';
      document.getElementById('fp-submit-btn').click();
      await Promise.resolve(); await Promise.resolve();
      expect(document.getElementById('confirm-channel-noun').textContent).toBe('phone');
      expect(document.getElementById('confirm-continue-btn').hidden).toBe(false);
    });
    ```
  - |
    AC3 — backend: the credential captured from the mocked `notifyClient` call
    verifies successfully exactly once before use.
    ```js
    test('AC3: a valid unused unexpired credential verifies', async () => {
      const notifyClient = require('../src/auth/notifyClient');
      let captured;
      jest.spyOn(notifyClient, 'sendResetEmail').mockImplementation(async (args) => { captured = args; return args; });
      await request(app).post('/auth/forgot-password').send({ contact: 'works@example.com' });
      const res = await request(app).post('/auth/reset/verify').send({ credential: captured.credential });
      expect(res.status).toBe(200);
      expect(res.body.valid).toBe(true);
    });
    ```
    AC3 — frontend: a `?token=` present on page load that verifies successfully
    goes straight to "Set new password"; a valid 6-digit SMS code does the same
    via the OTP screen.
    ```js
    test('AC3: a verifying token on load goes straight to Set new password', async () => {
      const api = fakeApi({ verifyCredential: jest.fn().mockResolvedValue({ valid: true }) });
      initForgotPasswordApp(document, api, { initialSearch: '?token=abc123' });
      await Promise.resolve(); await Promise.resolve();
      expect(api.verifyCredential).toHaveBeenCalledWith('abc123');
      expect(document.querySelector('.screen[data-name="set-password"]').hidden).toBe(false);
    });
    ```
  - |
    AC4 — backend: an unknown credential, an expired one, and an already-used
    one are all rejected the same way.
    ```js
    test('AC4: an unknown credential is invalid', async () => {
      const res = await request(app).post('/auth/reset/verify').send({ credential: 'does-not-exist' });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('invalid_or_expired');
    });
    test('AC4: a credential is invalid once its expiry window has passed', async () => {
      jest.useFakeTimers();
      const notifyClient = require('../src/auth/notifyClient');
      let captured;
      jest.spyOn(notifyClient, 'sendResetEmail').mockImplementation(async (args) => { captured = args; return args; });
      await request(app).post('/auth/forgot-password').send({ contact: 'works@example.com' });
      jest.advanceTimersByTime(16 * 60 * 1000);
      const res = await request(app).post('/auth/reset/verify').send({ credential: captured.credential });
      expect(res.status).toBe(400);
      jest.useRealTimers();
    });
    test('AC4: a credential is invalid once already used', async () => {
      const notifyClient = require('../src/auth/notifyClient');
      let captured;
      jest.spyOn(notifyClient, 'sendResetEmail').mockImplementation(async (args) => { captured = args; return args; });
      await request(app).post('/auth/forgot-password').send({ contact: 'works@example.com' });
      await request(app).post('/auth/reset/confirm').send({ credential: captured.credential, newPassword: 'test-password-1', confirmPassword: 'test-password-1' });
      const res = await request(app).post('/auth/reset/verify').send({ credential: captured.credential });
      expect(res.status).toBe(400);
    });
    ```
    AC4 — frontend: a token/code that fails verification shows the shared error
    screen.
    ```js
    test('AC4: a failing token shows the error screen', async () => {
      const api = fakeApi({ verifyCredential: jest.fn().mockRejectedValue(Object.assign(new Error(), { code: 'invalid_or_expired' })) });
      initForgotPasswordApp(document, api, { initialSearch: '?token=expired' });
      await Promise.resolve(); await Promise.resolve();
      expect(document.querySelector('.screen[data-name="error"]').hidden).toBe(false);
    });
    ```
  - |
    AC5 — frontend only (this is a UI affordance, not a backend behavior): the
    error screen's primary action returns the user to the request screen so they
    can ask for a new link/code.
    ```js
    test('AC5: the error screen offers "Request a new reset link" back to the request screen', async () => {
      const api = fakeApi({ verifyCredential: jest.fn().mockRejectedValue(new Error('invalid_or_expired')) });
      initForgotPasswordApp(document, api, { initialSearch: '?token=expired' });
      await Promise.resolve(); await Promise.resolve();
      document.getElementById('error-retry-btn').click();
      expect(document.querySelector('.screen[data-name="request"]').hidden).toBe(false);
    });
    ```
  - |
    AC6 — backend: `resetPassword` rejects a non-complying password with a typed
    error, distinct from a mismatch.
    ```js
    test('AC6: passwordMeetsComplexity rejects a password missing a required class', () => {
      const { passwordMeetsComplexity } = require('../src/auth/store');
      expect(passwordMeetsComplexity('alllowercase1!')).toBe(false); // no uppercase
      expect(passwordMeetsComplexity('GoodPassw0rd!')).toBe(true);
    });
    ```
    AC6 — frontend: submitting a weak password shows the inline error and
    preserves what was typed.
    ```js
    test('AC6: a weak password shows an inline error and preserves the value', async () => {
      const api = fakeApi();
      initForgotPasswordApp(document, api, { initialSearch: '?token=abc123' });
      await Promise.resolve(); await Promise.resolve();
      document.getElementById('pw-new').value = 'weak';
      document.getElementById('pw-confirm').value = 'weak';
      document.getElementById('pw-submit-btn').click();
      expect(document.getElementById('pw-new-error').hidden).toBe(false);
      expect(document.getElementById('pw-new').value).toBe('weak');
      expect(api.resetPassword).not.toHaveBeenCalled();
    });
    ```
  - |
    AC7 — backend: mismatched new/confirm values throw a distinct typed error.
    ```js
    test('AC7: resetPassword rejects a mismatched confirmation', async () => {
      const notifyClient = require('../src/auth/notifyClient');
      let captured;
      jest.spyOn(notifyClient, 'sendResetEmail').mockImplementation(async (args) => { captured = args; return args; });
      await request(app).post('/auth/forgot-password').send({ contact: 'works@example.com' });
      const res = await request(app).post('/auth/reset/confirm').send({ credential: captured.credential, newPassword: 'test-password-2', confirmPassword: 'test-password-3' });
      expect(res.status).toBe(422);
      expect(res.body.error).toBe('password_mismatch');
    });
    ```
    AC7 — frontend: mismatched entries show the inline mismatch error and never
    call the API.
    ```js
    test('AC7: a mismatched confirmation shows an inline error and blocks submit', async () => {
      const api = fakeApi();
      initForgotPasswordApp(document, api, { initialSearch: '?token=abc123' });
      await Promise.resolve(); await Promise.resolve();
      document.getElementById('pw-new').value = 'GoodPassw0rd!';
      document.getElementById('pw-confirm').value = 'Different1!';
      document.getElementById('pw-submit-btn').click();
      expect(document.getElementById('pw-confirm-error').hidden).toBe(false);
      expect(api.resetPassword).not.toHaveBeenCalled();
    });
    ```
  - |
    AC8 — backend: after a successful reset, `verifyLogin` proves the account
    can subsequently authenticate with the new password (and not the old one).
    A real `/auth/login` HTTP route and a wired Sign-in submit handler are
    explicitly out of scope for this story — see assumptions.
    ```js
    test('AC8: the new password works for subsequent login; the old one no longer does', async () => {
      const notifyClient = require('../src/auth/notifyClient');
      let captured;
      jest.spyOn(notifyClient, 'sendResetEmail').mockImplementation(async (args) => { captured = args; return args; });
      await request(app).post('/auth/forgot-password').send({ contact: 'works@example.com' });
      await request(app).post('/auth/reset/confirm').send({ credential: captured.credential, newPassword: 'test-password-4', confirmPassword: 'test-password-4' });
      const { verifyLogin } = require('../src/auth/store');
      expect(verifyLogin('works@example.com', 'test-password-4')).toBe(true);
      expect(verifyLogin('works@example.com', 'OldPassw0rd!')).toBe(false);
    });
    ```
  - |
    AC9 — backend: a successful confirm returns a success payload.
    ```js
    test('AC9: a valid matching submission returns success', async () => {
      const notifyClient = require('../src/auth/notifyClient');
      let captured;
      jest.spyOn(notifyClient, 'sendResetEmail').mockImplementation(async (args) => { captured = args; return args; });
      await request(app).post('/auth/forgot-password').send({ contact: 'works@example.com' });
      const res = await request(app).post('/auth/reset/confirm').send({ credential: captured.credential, newPassword: 'test-password-4', confirmPassword: 'test-password-4' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
    ```
    AC9 — frontend: the success screen is shown after submit resolves.
    ```js
    test('AC9: a successful submit shows the success screen', async () => {
      const api = fakeApi();
      initForgotPasswordApp(document, api, { initialSearch: '?token=abc123' });
      await Promise.resolve(); await Promise.resolve();
      document.getElementById('pw-new').value = 'GoodPassw0rd!';
      document.getElementById('pw-confirm').value = 'GoodPassw0rd!';
      document.getElementById('pw-submit-btn').click();
      await Promise.resolve(); await Promise.resolve();
      expect(document.querySelector('.screen[data-name="success"]').hidden).toBe(false);
    });
    ```
  - |
    AC10 — frontend: the success screen redirects to sign-in (via the injected
    `navigate` callback, so no real jsdom navigation is attempted), and
    `sign-in.html` reveals the one-time banner when it receives `resetSuccess=1`.
    ```js
    test('AC10: the success screen redirects to sign-in with resetSuccess=1', async () => {
      jest.useFakeTimers();
      const api = fakeApi();
      const navigate = jest.fn();
      initForgotPasswordApp(document, api, { initialSearch: '?token=abc123', navigate });
      await Promise.resolve(); await Promise.resolve();
      document.getElementById('pw-new').value = 'GoodPassw0rd!';
      document.getElementById('pw-confirm').value = 'GoodPassw0rd!';
      document.getElementById('pw-submit-btn').click();
      await Promise.resolve(); await Promise.resolve();
      jest.advanceTimersByTime(3000);
      expect(navigate).toHaveBeenCalledWith('./sign-in.html?resetSuccess=1');
      jest.useRealTimers();
    });
    test('AC10: sign-in shows the post-reset banner when resetSuccess=1 is present', () => {
      const { initSignInApp } = require('../public/js/sign-in');
      initSignInApp(document, '?resetSuccess=1');
      expect(document.getElementById('signin-banner').hidden).toBe(false);
    });
    ```

assumptions_or_open_questions:
  - |
    The work item's own "Open question for planning" is real and unresolved: no
    user-account/login story exists anywhere in this backlog or codebase (grepped
    `src/` and `public/` for password/login/auth/session/user — no matches). This
    plan builds the smallest substrate the ACs actually require — one seeded
    account, a password hash, and reset-credential bookkeeping in a new
    `src/auth/store.js` — rather than blocking on that open question. A real
    multi-user account system (signup, sessions, real login route) is explicitly
    NOT built here and should be its own story; this plan's `src/auth/store.js`
    is intentionally shaped so a future story can extend it (e.g. add more seeded
    users, a real `/auth/login` route) without restructuring what this story adds.
  - |
    The design's "Sign in" screen is annotated as "Entry point only, for
    context" — its Sign in button is rendered per the design but intentionally
    left without a submit handler in this plan; wiring real authentication
    (credential check + session) is out of this story's scope. AC8 ("user is
    able to subsequently log in using the new password") is instead verified at
    the `src/auth/store.js` level via `verifyLogin`, which is sufficient to prove
    the password was actually updated without building a session/login system
    this story doesn't otherwise need.
  - |
    Reset-credential TTLs (15 min email / 10 min SMS) and the seeded demo contact
    values (`works@example.com`, `+1 555 010 0100`) are taken directly from the
    approved design's copy and demo-panel buttons; they are treated as fixed
    fixtures/config for this in-memory demo store, not as user-configurable
    settings.
  - |
    `/auth/forgot-password` does not attempt timing-attack mitigation (e.g.
    normalizing response latency between the found/not-found paths) — it only
    guarantees an identical response body/status. This matches the app's overall
    demo-grade fidelity (in-memory stores, no real provider integrations) rather
    than being a considered security tradeoff; flagging it in case a future,
    more security-hardened iteration of this flow needs it.
  - |
    Password hashing uses Node's built-in `crypto.scryptSync` + `timingSafeEqual`
    rather than a dedicated password-hashing package (e.g. bcrypt/argon2), to
    avoid adding a new dependency for what is an in-memory, single-seeded-user
    demo store — not a recommendation for a production credential store at
    real scale.
  - |
    The emailed reset link is modeled as `forgot-password.html?token=<credential>`.
    No real email/SMS provider exists or is added; `notifyClient` remains a stub
    exactly like `src/onboarding/engineClient.js`, and a developer/tester obtains
    the credential in tests by mocking `notifyClient`, or in manual/local testing
    by reading server logs or the mocked call — there is no real inbox to click
    through, which is consistent with this being a demo app with no configured
    email/SMS integration today.

package_dependencies: []

notes: |
  ```mermaid
  flowchart TD
    server[src/server.js] --> authRoutes[src/auth/routes.js]
    authRoutes --> authStore[src/auth/store.js]
    authStore --> notifyClient[src/auth/notifyClient.js]
    fpHtml[public/forgot-password.html + js/forgot-password.js] -->|fetch POST| authRoutes
    siHtml[public/sign-in.html + js/sign-in.js] -.->|link only, no fetch| fpHtml

    engineClient[src/onboarding/engineClient.js]:::context
    hiresStore[src/hires/store.js]:::context
    hiresStore --> engineClient

    classDef touched fill:#f96,color:#000
    class server,authRoutes,authStore,notifyClient,fpHtml,siHtml touched
    classDef context fill:#eee,color:#333
    class engineClient,hiresStore context
  ```
  `engineClient.js`/`hires/store.js` are shown only as the existing pattern this
  plan's `notifyClient.js`/`auth/store.js` deliberately mirrors (same
  stub-client-called-through-a-store shape) — they are not modified.

  Read for this plan: `.arc/designs/TEST-M1-STORY-095-design.html` (full file,
  all six flow screens plus the context-only Sign in screen and their inline
  `<script>`/`<style>` blocks), `src/server.js`, `src/hires/{routes,store}.js`,
  `src/employees/{routes,store}.js`, `src/onboarding/engineClient.js`,
  `src/runs/routes.js`, `public/index.html`, `public/hire-profile.html`,
  `public/js/{hire-profile,utils}.js`, `design-system/prototype-utils.css`,
  `public/css/hire-profile.css`, `test/hires.test.js`, `test/hires-store.test.js`,
  `test/hire-profile.test.js`, `test/expenses-create.test.js`, `package.json`.
