summary: |
  This repo currently has no application code at all — only the design-system tokens
  (design-system/tokens.css, design-system/prototype-utils.css) and the approved
  prototype at .arc/designs/TEST-M1-STORY-001-design.html. This plan builds the login
  page/flow shown in that prototype's "Login — Default" screen (and its in-place error/
  loading/success states), from scratch, test-first. It bootstraps a minimal Node/Vitest
  test setup (there is none yet), then implements: (1) a static index.html that mirrors
  the prototype's default screen markup exactly, reusing the existing shared design-system
  classes (card, btn, input, label) plus a new page-scoped login.css carrying the
  login-specific classes the prototype defines inline (login-header, login-card,
  field-error, form-alert, spinner, etc.), and (2) plain-JS modules for field validation,
  a swappable stand-in credential check (seeded with the prototype's single fixture
  account), and a DOM controller that wires the form to both, reproducing the prototype's
  validation-error, invalid-credentials, authenticating, and redirect states in place on
  the single live form rather than as separate pages.

scope:
  - description: |
      Bootstrap a minimal test/build setup since none exists in the repo yet (no
      package.json, no test runner). Add `package.json` with `vitest` + `jsdom` as
      devDependencies and a `vitest.config.js` using the jsdom environment, so the
      failing tests below can actually run.
      ```json
      "scripts": { "test": "vitest run" }
      ```
      ```js
      // vitest.config.js
      import { defineConfig } from 'vitest/config';
      export default defineConfig({ test: { environment: 'jsdom' } });
      ```
    files:
      - package.json
      - vitest.config.js
    rationale: |
      Every test in this plan needs a DOM (jsdom) and a runner (vitest); neither
      exists in the repo today, so this is a prerequisite, not speculative scope.

  - description: |
      Create `src/login/validation.js` exporting a pure function
      `validateLoginFields({ email, password })` that returns an error map using the
      exact copy from the prototype's "Login — Validation Error" screen
      (`.field-error` text under each input: "Enter your email or mobile phone
      number." and "Enter your password."). Only fields that are actually empty
      (after trimming email) get an entry — the prototype's live script only routes
      to the error state `if (!email || !password)`, and its comment notes the two
      fields are flagged independently ("the live form... demonstrates single-field
      cases interactively").
      ```js
      export function validateLoginFields({ email, password }) {
        const errors = {};
        if (!email.trim()) errors.email = 'Enter your email or mobile phone number.';
        if (!password) errors.password = 'Enter your password.';
        return errors;
      }
      ```
    files:
      - src/login/validation.js
    rationale: |
      Isolating validation as a pure function lets AC2 be tested without any DOM,
      and keeps the copy identical to the approved "Validation Error" screen.

  - description: |
      Create `src/login/auth.js` exporting `FIXTURE_ACCOUNT` and
      `checkCredentials(email, password)`. This is a direct port of the prototype's
      `window.__FIXTURE_ACCOUNT__` simulation (email `sarah.chen@example.com`,
      password `Amzn#2024!`) into a real module with a narrow function seam, so a
      future story can swap in a real auth API call without touching the DOM
      controller or its tests.
      ```js
      export const FIXTURE_ACCOUNT = { email: 'sarah.chen@example.com', password: 'Amzn#2024!' };
      export function checkCredentials(email, password) {
        return email === FIXTURE_ACCOUNT.email && password === FIXTURE_ACCOUNT.password;
      }
      ```
    files:
      - src/login/auth.js
    rationale: |
      The story has no backend/auth API in this repo, and building one is not in
      scope. The prototype itself says "No real authentication occurs; this
      simulates the AC3/AC5 branching" — this module reproduces exactly that
      behaviour behind a function boundary so AC3/AC4/AC5 are testable and the
      stand-in is swappable later. See open question below.

  - description: |
      Create `src/login/login.css` containing only the login-specific classes the
      prototype defines in its third inline `<style>` block (not the shared
      design-system tokens/utilities, which already exist in
      design-system/tokens.css and design-system/prototype-utils.css and are linked,
      not duplicated): `.login-header`, `.login-logo`, `.login-main`, `.login-card`,
      `.login-card h1`, `.field-error`, `.input-invalid`, `.form-alert`,
      `.form-alert-icon`, `.form-alert-body p/strong`, `.form-field`, `.btn-block`,
      `.divider` (+ `::before`/`::after`), `.login-footer`, `.secondary-links`,
      `.create-account-link` (+ `:hover`), `.disabled-note`, `.spinner` (+
      `@keyframes spin` + `prefers-reduced-motion` override), `.redirect-card`,
      `.redirect-icon`, `.helper-text` (+ `code`), `.visually-hidden`. The
      reviewer-bar (`#review-bar`) and the screen-switcher script/CSS are prototype
      review tooling only and are excluded — they are not part of the shipped page.
      ```css
      .spinner {
        width: 14px; height: 14px; border-radius: 50%;
        border: 2px solid var(--color-primary-fg); border-top-color: transparent;
        animation: spin 0.7s linear infinite;
      }
      @media (prefers-reduced-motion: reduce) { .spinner { animation: none; } }
      ```
    files:
      - src/login/login.css
    rationale: |
      Keeps the shared design-system tokens/utilities as the single source of
      truth (per design.yaml) while carrying only the login page's own classes,
      exactly as split in the approved prototype.

  - description: |
      Create the real `index.html` at the repo root reproducing the prototype's
      "Login — Default" screen: header with the `amazon.` logo, a `.login-card`
      with heading "Sign in", a form with a labelled email/username input
      (`id="email"`, `name="email"`, `autocomplete="username"`), a labelled password
      input (`id="password"`, `name="password"`, `type="password"`,
      `autocomplete="current-password"`), a disabled/inert "Forgot password?" link
      (`aria-disabled="true"`, no navigation — password reset is out of scope), a
      `.btn.btn-primary.btn-block` submit button labelled "Sign in", the
      "New to Amazon?" divider and disabled "Create your Amazon account" link
      (sign-up out of scope), and the footer secondary links (Conditions of Use,
      Privacy Notice, Help) as inert `href="#"` links, matching the prototype. Links
      `design-system/tokens.css`, `design-system/prototype-utils.css`,
      `src/login/login.css`, and loads `src/login/main.js` as a module.
      Deliberately NOT carried over: the prototype's "Try it:
      sarah.chen@example.com / Amzn#2024!" helper text — that line is the
      prototype's own reviewer aid for exercising its simulated auth and is not
      real product copy; shipping it would expose the one valid credential to any
      visitor. Flagged explicitly rather than silently dropped — see open question.
    files:
      - index.html
    rationale: |
      AC1 requires the page to render this exact form on load; the markup/copy/
      structure is taken directly from the prototype's default screen, which is
      the only record of the approved design.

  - description: |
      Create `src/login/loginForm.js` exporting
      `initLoginForm({ root = document, navigate = (url) => window.location.assign(url) } = {})`.
      On submit it: preventDefault; trims email; runs `validateLoginFields`; if any
      errors, renders `.field-error` blocks + `.input-invalid`/`aria-invalid`/
      `aria-describedby` under the affected input(s) only, in place on the live
      form (no navigation) — reusing the exact markup/classes of the prototype's
      "Validation Error" screen, but mutating screen 1 in place rather than
      swapping to a separate screen (the prototype's own comment calls that
      screen-swap "a clear, reviewable stop" for the prototype, not the intended
      shipped behaviour of a single live form). If fields are valid, runs
      `checkCredentials`; on failure, inserts a `role="alert"` `.form-alert` above
      the fields with the prototype's exact copy ("There was a problem" / "We
      cannot find an account with that email address and password combination.
      Please try again."), clears the password field, keeps the email value, and
      does not navigate — matching the "Invalid Credentials" screen. On success,
      disables both inputs and the submit button and swaps the button to the
      prototype's "Authenticating" state (spinner + "Signing in…", `aria-busy`) for
      350ms, then swaps the card body to the "Success / Redirecting" screen's exact
      copy ("Signed in" / "Welcome back, Sarah. Redirecting you to your
      account…") for 600ms, then calls `navigate('/account')` — matching the
      prototype's two timed states before its simulated redirect.
    files:
      - src/login/loginForm.js
    rationale: |
      Separating DOM wiring into an exported, dependency-injected function (root,
      navigate) — rather than a top-level side effect — makes AC2-AC5 testable
      with jsdom + fake timers without a real navigation or a real DOMContentLoaded
      event.

  - description: |
      Create `src/login/main.js` as the page's real script entry: on
      `DOMContentLoaded`, calls `initLoginForm({ root: document })` with the
      default `navigate`. This is the only file with a top-level side effect;
      `index.html` loads it as `<script type="module" src="./src/login/main.js">`.
    files:
      - src/login/main.js
    rationale: |
      Keeps `loginForm.js` itself free of side effects so it can be imported and
      driven directly in tests.

tests:
  - |
    AC1 — test/loginForm.test.js: load the real index.html markup into jsdom and
    assert the required controls exist on load with no errors shown:
    ```js
    document.documentElement.innerHTML = readFileSync('index.html', 'utf8');
    expect(document.querySelector('input[name="email"]')).not.toBeNull();
    expect(document.querySelector('input[name="password"][type="password"]')).not.toBeNull();
    expect(document.querySelector('button[type="submit"]')).not.toBeNull();
    expect(document.querySelector('.field-error')).toBeNull();
    ```
  - |
    AC2 — test/validation.test.js (pure unit, written first): exact copy from the
    prototype's "Validation Error" screen, per-field:
    ```js
    expect(validateLoginFields({ email: '', password: 'x' }))
      .toEqual({ email: 'Enter your email or mobile phone number.' });
    expect(validateLoginFields({ email: 'a@b.com', password: '' }))
      .toEqual({ password: 'Enter your password.' });
    ```
    Then test/loginForm.test.js wires it to the DOM:
    ```js
    initLoginForm({ root: document });
    document.querySelector('input[name="password"]').value = '';
    document.getElementById('login-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    expect(document.body.textContent).toContain('Enter your password.');
    ```
  - |
    AC3 — test/auth.test.js (pure unit, written first):
    ```js
    expect(checkCredentials('wrong.user@example.com', 'nope')).toBe(false);
    ```
    Then test/loginForm.test.js: submitting that combination shows the alert:
    ```js
    const alert = document.querySelector('[role="alert"]');
    expect(alert.textContent).toContain('We cannot find an account with that email address and password combination.');
    ```
  - |
    AC4 — test/loginForm.test.js: the same invalid-credentials submit above must not
    navigate:
    ```js
    const navigate = vi.fn();
    initLoginForm({ root: document, navigate });
    // ...submit with wrong.user@example.com / nope...
    expect(navigate).not.toHaveBeenCalled();
    expect(document.querySelector('[role="alert"]')).not.toBeNull();
    ```
  - |
    AC5 — test/loginForm.test.js, with fake timers to cover the authenticating +
    redirect sequence:
    ```js
    vi.useFakeTimers();
    const navigate = vi.fn();
    initLoginForm({ root: document, navigate });
    // fill email=sarah.chen@example.com, password=Amzn#2024!, then dispatch submit
    expect(navigate).not.toHaveBeenCalled();
    await vi.runAllTimersAsync();
    expect(navigate).toHaveBeenCalledWith('/account');
    ```
  - |
    Supplementary (design fidelity for the transient state AC5 implies but doesn't
    name): test/loginForm.test.js asserts the authenticating state matches the
    prototype's "Authenticating" screen before the timers resolve:
    ```js
    expect(document.querySelector('button[aria-busy="true"]')).not.toBeNull();
    expect(document.querySelector('input[name="email"]').disabled).toBe(true);
    ```

assumptions_or_open_questions:
  - |
    OPEN QUESTION: there is no backend/auth API anywhere in this repo, and the story
    explicitly puts session/token handling out of scope, but it doesn't say what
    should determine "valid" vs "invalid" credentials for AC3/AC5. This plan
    implements a client-side stand-in (`src/login/auth.js`) that is a direct port of
    the prototype's own hardcoded fixture-account simulation, behind a narrow
    `checkCredentials(email, password)` seam so a real API call can replace it later
    without touching the DOM controller or its tests. Flagging for sign-off since
    shipping a hardcoded credential in source is only acceptable because this story
    is explicitly UI/flow-only — a real auth integration should be its own story.
  - |
    The prototype's default screen includes a "Try it: sarah.chen@example.com /
    Amzn#2024!" helper line disclosing the one valid fixture credential. This plan
    deliberately does NOT ship that line in the real index.html (it reads as a
    reviewer aid for the prototype's own simulated auth, not production copy, and
    revealing the only valid password to visitors would be a real regression). If
    the reviewer intends for that text to ship as-is, say so and it will be added.
  - |
    The prototype's live script jumps between fully separate pre-rendered screens
    for the error/invalid/authenticating/success states ("a clear, reviewable stop
    rather than mutating screen 1 in place," per its own comment). This plan instead
    mutates the single live form in place for all of these states, reusing the exact
    markup/classes/copy of each corresponding prototype screen — treated as the
    intended production behaviour, since shipping four separate full-page states for
    one form isn't practical. Flagging this interpretation explicitly.
  - |
    The prototype's "Success / Redirecting" screen says "Welcome back, Sarah" —
    hardcoded to the one fixture account's first name. Kept as-is since there is
    only one fixture account; a real integration would need to parameterize this
    from actual account data, which is out of scope here.
  - |
    AC5's redirect destination (the prototype's "Account — Landing" screen) is
    explicitly called out in the prototype's own comment as "a placeholder
    destination... out of scope for this story." This plan therefore does not build
    an account/landing page; it only verifies `navigate('/account')` is called, not
    that anything renders at that route.
  - |
    Assumed a plain HTML/CSS/vanilla-JS implementation (no framework) is correct
    since the entire repo — including the approved prototype itself — is plain
    HTML/CSS/JS with no framework anywhere, and the design-system assets
    (tokens.css, prototype-utils.css) are framework-agnostic plain CSS.

package_dependencies:
  - name: vitest
    version: ^2.1.9
    ecosystem: npm
    rationale: |
      No test runner exists in the repo yet; vitest is used to run all tests in
      this plan (unit tests for validation.js/auth.js and DOM tests for
      loginForm.js).
  - name: jsdom
    version: ^25.0.1
    ecosystem: npm
    rationale: |
      vitest's jsdom environment (used for all loginForm.js DOM tests, per
      vitest.config.js) requires the jsdom package as a peer/environment
      dependency.

notes: |
  This is a from-scratch build: `git log`/`git status` and a full repo glob show no
  package.json, no src/, and no existing test setup — only design-system/*.css,
  design-system/style-guide.html, README.md, and the approved prototype under
  .arc/designs/. There is nothing to reconcile with an existing app; the module
  boundaries above (validation.js / auth.js / loginForm.js / main.js) are new and
  chosen purely to make each acceptance criterion independently testable.

  ```mermaid
  flowchart TD
    idx[index.html] -->|loads as module script| main[src/login/main.js]
    idx -.->|link rel=stylesheet| tokens[design-system/tokens.css]
    idx -.->|link rel=stylesheet| utils[design-system/prototype-utils.css]
    idx -.->|link rel=stylesheet| logincss[src/login/login.css]
    main -->|"initLoginForm(root, navigate)"| form[src/login/loginForm.js]
    form -->|"validateLoginFields(email, password)"| validation[src/login/validation.js]
    form -->|"checkCredentials(email, password)"| auth[src/login/auth.js]
    form -.->|"navigate(url) on success"| nav[window.location.assign]

    classDef touched fill:#f96,color:#000
    class idx,main,form,validation,auth,logincss touched
  ```
  index.html, main.js, loginForm.js, validation.js, auth.js, and login.css are all
  new files this plan creates; tokens.css/prototype-utils.css are existing
  design-system assets that are linked, not modified; window.location.assign is the
  default `navigate` implementation, overridden in tests via dependency injection.
