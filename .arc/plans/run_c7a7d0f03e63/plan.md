summary: |
  Build the login UI/flow for the Amazon website exactly as shown in the approved prototype at
  `.arc/designs/TEST-M1-STORY-001-design.html` (the "Login" screen, `data-name="Login"`, lines
  ~390-453): a `Sign in` card with an email/username field, a password field, a submit button,
  inline field-level validation errors, a banner error for invalid credentials, and a redirect
  toast before navigating away on success. The repo currently has no application code, framework,
  or test tooling at all (only `README.md` and `design-system/` tokens/CSS), so this plan also lays
  down the minimal scaffold needed to ship and test this one feature: plain HTML/CSS/JS (mirroring
  the prototype's own stack) plus Vitest+jsdom for a test-first suite. Each of the 5 acceptance
  criteria gets a failing DOM-level test first, then the minimal markup/logic to pass it, reusing
  the prototype's exact ids, copy, and CSS classes (which are themselves built from
  `design-system/tokens.css`) so the shipped page matches what was approved.
scope:
  - description: |
      Add the minimal Node/npm tooling needed to run a test-first suite against DOM code, since
      the repo has no `package.json` or test runner today.
      - `package.json`: `"type": "module"`, `"scripts": { "test": "vitest run" }`, devDependencies
        on `vitest`, `jsdom`, `@testing-library/dom` (see `package_dependencies` below).
      - `vitest.config.js`:
        ```js
        import { defineConfig } from 'vitest/config';
        export default defineConfig({ test: { environment: 'jsdom' } });
        ```
      - `.gitignore`: add `node_modules/` so installing these new devDependencies doesn't get
        committed.
    files:
      - package.json
      - vitest.config.js
      - .gitignore
    rationale: |
      Nothing in the repo currently runs JavaScript tests; this is the smallest setup that lets
      `tests/login-form.test.js` (below) exercise real DOM/event behaviour in Node via jsdom,
      matching the vanilla-JS approach the approved prototype itself uses (no framework runtime in
      the prototype's `<script>` block).
  - description: |
      Create the login page markup at the site root (`index.html` = "the login page", since there
      is no router/backend and no other landing page defined anywhere in the repo). Adapted
      verbatim from the prototype's `Login` screen (design lines 390-453: `.login-shell` >
      `.card.login-card`), keeping the exact ids, labels, and copy:
      - `<header class="site-header"><span class="wordmark">amazon</span></header>` (design line
        392-394).
      - `<h1 class="card-title u-text-lg">Sign in</h1>` and the `card-body` helper copy (design
        lines 399-400).
      - `#banner-error` alert block with `#banner-error-text` (design lines 402-408), and
        `#redirect-toast-login` status block (design lines 410-413).
      - `<form id="login-form" novalidate>` with `#login-email` (type text, `autocomplete="username"`,
        `aria-describedby="email-error"`) + `#email-error`, `#login-password` (type password,
        `autocomplete="current-password"`, `aria-describedby="password-error"`) + `#password-error`,
        and `#submit-btn` (`type="submit"`, text `Sign in`) (design lines 415-437).
      - The `legal-note` paragraph (design line 439).
      - Links to `design-system/tokens.css`, `design-system/prototype-utils.css`, and the new
        `styles.css` (below).
      - A tiny inline `<script type="module">import { initLoginForm } from './login-form.js';
        initLoginForm();</script>` at the end of `<body>` to wire the page up.
      Deliberately DROPS the prototype's reviewer-only affordances: the fixed `#review-bar` with
      Prev/Next screen navigation (design lines 356-364) and the `.reviewer-shortcuts` block with
      `#demo-empty` / `#demo-invalid` / `#demo-valid` buttons (design lines 442-450) — the design's
      own HTML comments label both as prototype-only tooling for reviewers, not part of the shipped
      UI, and no acceptance criterion calls for them.
    files:
      - index.html
    rationale: |
      AC1 requires the email/username field, password field, and submit action to be visible on
      load; reusing the prototype's exact markup/ids/copy is how we satisfy "build the
      already-approved design" rather than re-deriving the form from the AC text alone.
  - description: |
      Extract the prototype's page-specific CSS (currently inline in the design file's `<style>`
      block, lines 204-352) into a real stylesheet, unchanged in values, so both the login page and
      the minimal account stub page (below) can share it. Covers: `.site-header`/`.wordmark`
      (shared header, design lines 213-236), `.login-shell`/`.login-card`/`.field-group`/
      `.field-error`/`.field-error.is-visible`/`.field-group .input[aria-invalid="true"]` (design
      lines 238-267), `.banner-error` + children (design lines 269-282), `.login-card .btn`/
      `.login-card .input` (design lines 284-286), `.legal-note` (design lines 288-292),
      `.redirect-toast`/`.redirect-toast.is-visible` (design lines 335-347), and a minimal
      `.account-shell` rule (design lines 313-317) for the stub page. Does NOT port
      `.account-greeting-chip` or `.tile-grid` (design lines 318-334) since the stub page below
      does not build the greeting chip or the Orders/Lists/Login-&-Security tile grid — see the
      account-page scope item and the matching open question.
    files:
      - styles.css
    rationale: |
      Keeps the shipped page pixel/token-faithful to the approved design (colours, spacing, radii
      all resolve through `design-system/tokens.css` exactly as in the prototype) without
      re-deriving values by hand.
  - description: |
      Pure, framework-free validation and credential-check logic, mirroring the prototype's inline
      script (design lines 507, 546-556, 568) so the same fixture and copy ship:
      ```js
      // Password is never stored or compared in plaintext, only its SHA-256 digest.
      const VALID_ACCOUNT_EMAIL = 'avery.chen@example.com';
      const VALID_PASSWORD_DIGEST = 'c638833f69bbfb3c267afa0a74434812436b8f08a81fd263c6be6871de4f1265';

      export function validate({ email, password }) {
        return {
          emailError: email.trim() === '' ? 'Enter your email or username.' : null,
          passwordError: password === '' ? 'Enter your password.' : null,
        };
      }

      export async function checkCredentials({ email, password }) {
        const digest = await sha256Hex(password);
        return email.trim() === VALID_ACCOUNT_EMAIL && digest === VALID_PASSWORD_DIGEST;
      }
      ```
    files:
      - auth.js
    rationale: |
      Separating pure validation/credential logic from DOM wiring lets the empty-field (AC2) and
      invalid-credentials (AC3) checks be unit-tested directly, and keeps the hardcoded fixture (the
      only "valid account" this story recognizes, since real auth/session/backend work is
      explicitly out of scope) in one obvious place. Comparing a SHA-256 digest instead of the raw
      password avoids ever holding a plaintext credential in source, even for this stub fixture.
  - description: |
      DOM wiring for the form: submit handling, showing/clearing field errors and the banner error,
      the mocked "network" delay, and the redirect. Mirrors the prototype's `submitLogin` (design
      lines 542-587) but delegates validation/credential checks to `auth.js`:
      ```js
      export function initLoginForm(doc = document, win = window) {
        const form = doc.getElementById('login-form');
        const emailInput = doc.getElementById('login-email');
        const passwordInput = doc.getElementById('login-password');
        const emailError = doc.getElementById('email-error');
        const passwordError = doc.getElementById('password-error');
        const bannerError = doc.getElementById('banner-error');
        const submitBtn = doc.getElementById('submit-btn');
        const redirectToast = doc.getElementById('redirect-toast-login');

        form.addEventListener('submit', (e) => {
          e.preventDefault();
          handleSubmit(emailInput.value, passwordInput.value);
        });

        function handleSubmit(email, password) { /* clear errors, validate(), then either show
          field errors, or win.setTimeout(...350ms...) -> checkCredentials() -> banner error OR
          redirect toast + win.setTimeout(...500ms...) -> win.location.assign('/account/index.html') */ }
      }
      ```
      Keeps the design's mocked delays (350ms pre-result, 500ms before navigating away) and its
      exact copy: banner text "The email/username or password you entered is incorrect." (design
      line 406), field errors "Enter your email or username." / "Enter your password." (design
      lines 421, 431), redirect toast "Signed in — redirecting to your account…" (design line 412).
      Navigates via `win.location.assign('/account/index.html')` rather than a raw
      `window.location.href =` assignment so tests can `vi.spyOn(window.location, 'assign')`
      without jsdom's "not implemented: navigation" warning firing on a real href mutation.
    files:
      - login-form.js
    rationale: |
      This is the one module every AC touches (AC1 load state, AC2 field errors, AC3/AC4 banner +
      staying put, AC5 redirect), so it's exercised end-to-end by `tests/login-form.test.js` via
      real `submit` events against the real `index.html` markup rather than re-implemented markup
      in the test file.
  - description: |
      Minimal static destination page for the AC5 redirect target at `account/index.html`. Reuses
      the shared header (`.site-header`/`.wordmark`, design lines 465-466) and the
      `.redirect-toast.is-visible` confirmation block (design lines 479-482), but is a static stub:
      it does NOT reproduce the greeting chip + "Hello, Avery" nav, the Returns & Orders / Cart
      chips, the Sign out button, or the `.tile-grid` of Orders/Lists/Login-&-Security cards
      (design lines 467-476, 486-499) — those are account-feature UI, not "navigation/redirect on
      successful login", and building them would mean shipping UI for scope this story explicitly
      excludes (session/token handling, account features). See the matching entry in
      `assumptions_or_open_questions`.
    files:
      - account/index.html
    rationale: |
      AC5 only requires that the user is "redirected away from the login page" — a real, separate
      HTML document satisfies that literally (verified by `window.location.assign` being called
      with its path in the AC5 test) without building unrelated, out-of-scope account features.
  - description: |
      Test-first Vitest+jsdom suite covering all 5 ACs against the real `index.html` markup and the
      real `login-form.js`/`auth.js` modules (loads `index.html` via `readFileSync` into
      `document.documentElement.innerHTML`, then calls `initLoginForm(document, window)` and drives
      it with `@testing-library/dom`'s `fireEvent.submit`).
    files:
      - tests/login-form.test.js
    rationale: |
      One file per the "test-first" requirement for this plan; each `tests` entry below names the
      literal assertions this file must contain before any implementation code is written.
tests:
  - |
    AC1 — GIVEN a user navigates to the login page WHEN the page loads THEN a form with an
    email/username field, a password field, and a submit action is displayed. Loads `index.html`
    into `document.documentElement.innerHTML` (no `initLoginForm()` call needed — this is a
    load-state assertion) and asserts:
    ```js
    expect(document.getElementById('login-email')).not.toBeNull();
    expect(document.getElementById('login-password').type).toBe('password');
    const submit = document.getElementById('submit-btn');
    expect(submit.type).toBe('submit');
    expect(submit.textContent.trim()).toBe('Sign in');
    ```
  - |
    AC2 — GIVEN the login form WHEN submitted with the email/username field OR the password field
    left empty THEN a validation error message is displayed for the empty field (and the other
    field's value is preserved). After `initLoginForm(document, window)`, fill only the password,
    leave email empty, then `fireEvent.submit(document.getElementById('login-form'))`:
    ```js
    document.getElementById('login-password').value = 'test-password';
    fireEvent.submit(document.getElementById('login-form'));
    expect(document.getElementById('email-error').classList.contains('is-visible')).toBe(true);
    expect(document.getElementById('password-error').classList.contains('is-visible')).toBe(false);
    expect(document.getElementById('login-password').value).toBe('test-password');
    ```
    Mirror this with password empty / email filled to cover the other half of the AC.
  - |
    AC3 — GIVEN the login form WHEN submitted with credentials that do not match a valid account
    THEN an invalid-credentials error message is displayed. Fill a well-formed but wrong
    email/password, submit, advance the mocked 350ms network delay, then assert:
    ```js
    vi.useFakeTimers();
    document.getElementById('login-email').value = 'wrong.person@example.com';
    document.getElementById('login-password').value = 'not-the-right-password';
    fireEvent.submit(document.getElementById('login-form'));
    await vi.advanceTimersByTimeAsync(350);
    expect(document.getElementById('banner-error').classList.contains('is-visible')).toBe(true);
    expect(document.getElementById('banner-error-text').textContent)
      .toBe('The email/username or password you entered is incorrect.');
    ```
  - |
    AC4 — GIVEN the same invalid submission as AC3 THEN the user remains on the login page. Spy on
    `window.location.assign` before submitting, advance timers past both the network delay and the
    would-be redirect delay, and assert no navigation occurred:
    ```js
    const assignSpy = vi.spyOn(window.location, 'assign').mockImplementation(() => {});
    fireEvent.submit(document.getElementById('login-form'));
    await vi.advanceTimersByTimeAsync(1000);
    expect(assignSpy).not.toHaveBeenCalled();
    ```
  - |
    AC5 — GIVEN the login form WHEN submitted with valid credentials THEN the user is redirected
    away from the login page. Fill the fixture's valid credentials, submit, advance past both the
    350ms network delay and the 500ms pre-redirect delay, and assert the navigation call:
    ```js
    const assignSpy = vi.spyOn(window.location, 'assign').mockImplementation(() => {});
    document.getElementById('login-email').value = 'avery.chen@example.com';
    document.getElementById('login-password').value = 'test-password';
    fireEvent.submit(document.getElementById('login-form'));
    await vi.advanceTimersByTimeAsync(850);
    expect(assignSpy).toHaveBeenCalledWith('/account/index.html');
    ```
assumptions_or_open_questions:
  - |
    The repo has no application code, framework, or test tooling of any kind today (only
    `README.md` and `design-system/`), so this plan necessarily also chooses the minimal stack:
    plain HTML/CSS + vanilla ES module JS (matching the prototype's own inline script, which uses
    no framework) and Vitest+jsdom for tests. If a different stack is already intended for the rest
    of this website (a separate decision not recorded anywhere in this repo), this plan's file
    layout would need to be redone in that stack instead.
  - |
    Treating `index.html` at the repo root as "the login page" (i.e. the site's unauthenticated
    landing page), since there is no router, backend, or other page defined anywhere in the repo to
    say otherwise.
  - |
    The destination page at `account/index.html` is built as a minimal static stub (shared header +
    a static "signed-in" confirmation) rather than the full "Your Account" screen shown in the
    design (greeting chip, Returns & Orders / Cart chips, Sign out button, and the
    Orders/Lists/Login-&-Security tile grid — design lines 463-501). This is a deliberate
    scope-boundary call, not an oversight: those elements are account-feature UI that this story's
    "Explicitly out of scope" list (session/token handling, account features generally) excludes,
    even though the approved prototype happens to show them on the screen the user lands on. Flag
    for the reviewer: if literal pixel parity with that second screen is wanted regardless of scope,
    say so and this plan will build it in full instead.
  - |
    Kept the prototype's hardcoded fixture account (`avery.chen@example.com` / `test-password`) as
    the only "valid" login in `auth.js`, since real authentication/backend integration is out of
    scope for this story.
  - |
    Dropped the prototype's reviewer-only affordances (the fixed review bar with Prev/Next screen
    navigation, and the "Reviewer shortcuts" demo-empty/demo-invalid/demo-valid buttons) from the
    shipped `index.html` — the design file's own HTML comments (lines 356-364, 386-388) label these
    as prototype-only tooling, not part of the UI being approved.
package_dependencies:
  - name: vitest
    version: ^2.1.4
    ecosystem: npm
    rationale: |
      Test runner for the failing-test-first suite (`tests/login-form.test.js`); its fake-timer
      APIs (`vi.useFakeTimers`, `vi.advanceTimersByTimeAsync`) and `vi.spyOn` are used directly in
      the AC3/AC4/AC5 tests to control the mocked network/redirect delays and assert on
      `window.location.assign`.
  - name: jsdom
    version: ^25.0.1
    ecosystem: npm
    rationale: |
      DOM environment for Vitest (`test.environment: 'jsdom'` in `vitest.config.js`) — there is no
      browser or existing DOM test environment in this repo, and every AC here is a DOM-level
      behaviour (form fields, error visibility, navigation).
  - name: "@testing-library/dom"
    version: ^10.4.0
    ecosystem: npm
    rationale: |
      Provides `fireEvent.submit` to dispatch the form's submit event in tests the same way a real
      user's submit click would, without hand-rolling `dispatchEvent(new Event(...))` boilerplate
      in every test.
notes: |
  This story is unusually greenfield: `git log`/the repo tree show only design-system bootstrap
  work (`design-system/`, `.arc/config/design.yaml`) landed so far — no application entry point,
  no package.json, no CI. Everything under `scope` above is therefore new. The design prototype at
  `.arc/designs/TEST-M1-STORY-001-design.html` is confirmed as the only record of the approved
  design (per the task instructions) and was read in full; citations above reference its actual
  line ranges and copy.

  Module/call shape for the new files (all new — this is a from-scratch build, not a modification
  of existing modules):

  ```mermaid
  flowchart TD
    IndexHTML["index.html (login page)"] -->|"script type=module: initLoginForm()"| LoginFormJS["login-form.js"]
    LoginFormJS -->|"imports validate()/checkCredentials()"| AuthJS["auth.js"]
    LoginFormJS -->|"on success: window.location.assign('/account/index.html')"| AccountHTML["account/index.html (static stub)"]
    TestFile["tests/login-form.test.js"] -->|"fireEvent.submit + real DOM"| LoginFormJS
    TestFile -->|"unit assertions"| AuthJS

    classDef touched fill:#f96,color:#000;
    class IndexHTML,LoginFormJS,AuthJS,AccountHTML,TestFile touched;
  ```

  Note on tooling: this session's plan-authoring instructions describe a `validate_plan_yaml` tool
  that should be called before ending the turn. That tool was not present among the tools actually
  made available to me in this session, so I was unable to invoke it. I have hand-checked this
  document for valid YAML (consistent indentation, `|` block scalars on every string containing a
  colon/backtick/code, no `- |` list items nested under a mapping key) but flagging this explicitly
  rather than claiming an automated check ran.
