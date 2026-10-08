summary: |
  Before planning any new work, the codebase was read in full and it turns out
  TEST-M1-STORY-095 is already implemented end-to-end on this branch: `src/auth/store.js`,
  `src/auth/routes.js`, and `src/auth/notifyClient.js` back a `/auth/forgot-password`,
  `/auth/reset/verify`, `/auth/reset/confirm` API; `public/forgot-password.html` +
  `public/js/forgot-password.js` and `public/sign-in.html` + `public/js/sign-in.js` implement
  every screen in the approved prototype (`.arc/designs/TEST-M1-STORY-095-design.html`); and
  `test/auth.test.js`, `test/auth-store.test.js`, `test/forgot-password.test.js`, and
  `test/sign-in.test.js` already carry a passing, AC-labelled test for all 10 acceptance
  criteria (commits `bd873a6` and `73b0876` on this branch, from the prior plan run
  `run_860d2fa3b0ce`). Re-deriving a full greenfield TDD plan from the AC list would mean
  proposing to rebuild work that already exists and passes, which the instructions for this
  session explicitly rule out ("stay strictly within the ACs; no speculative work").
  While re-verifying that existing implementation against the design and the ACs, one real,
  concrete defect was found: the "one-time code" sent over SMS is generated as a full
  `crypto.randomUUID()` (the same format used for the emailed link token), but the production
  "Enter your code" screen the design specifies (`#otp-input`, `maxlength="6"`, digits-only,
  see design notes below) can only ever collect 6 digits back from a real user. A real SMS
  user could never type the actual UUID back in, so the phone/SMS path described in AC2/AC3 is
  non-functional outside of tests that bypass the UI by posting the full captured credential
  string directly to the API. This plan's only scope is a test-first fix for that one defect;
  everything else is left as-is and is called out per-AC in `tests` below as already covered.
scope:
  - description: |
      Make password-reset credential generation channel-aware so the SMS one-time code is
      something a real user can actually type into the 6-digit OTP field, while leaving the
      email link token format unchanged.

      In `src/auth/store.js`, replace the single-format generator:
      ```js
      const credential = crypto.randomUUID();
      ```
      with a channel-aware helper:
      ```js
      function generateCredential(channel) {
        if (channel === 'phone') {
          return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
        }
        return crypto.randomUUID();
      }
      ```
      and call it as `const credential = generateCredential(channel);` inside
      `requestPasswordReset`. `resetCredentials`, `verifyResetCredential`, and `resetPassword`
      are unchanged — they already key/verify generically by whatever string is passed as
      `credential`, so a 6-digit phone code and a UUID email token both work as map keys
      without further changes.
    files:
      - src/auth/store.js
    rationale: |
      This is the minimal change that makes AC2 ("sends the appropriate time-limited reset
      credential ... a one-time code via SMS") and AC3 ("enters the code" at the "Enter your
      code" screen) actually hold for the phone channel in production, not just in tests that
      skip the UI's 6-digit constraint. `crypto.randomInt` is already available (Node's
      built-in `crypto` module is already required at the top of this file for
      `randomUUID`/`randomBytes`/`scryptSync`/`timingSafeEqual`), so no new dependency is
      needed.
  - description: |
      Add the failing-test-first coverage for the fix above: one unit test on the store proving
      the phone channel now yields a 6-digit numeric code (and the email channel is unchanged),
      and one integration test proving a code shaped exactly like what the real OTP screen can
      collect (`^[0-9]{6}$`) round-trips successfully through `/auth/reset/verify`.
    files:
      - test/auth-store.test.js
      - test/auth.test.js
    rationale: |
      Pins the new behavior at both the unit level (store) and the integration level (HTTP
      route + notifyClient boundary), matching this project's existing convention of testing
      `src/auth/store.js` directly in `test/auth-store.test.js` and testing the mounted router
      via `supertest` in `test/auth.test.js`.
tests:
  - |
    AC1 (generic message for unknown vs. known contact): already covered and passing —
    `test/auth.test.js` `'AC1: unknown contact returns the same generic message as a known
    contact'` asserts `expect(unknown.body.message).toBe(known.body.message)`, and
    `test/forgot-password.test.js` `'AC1: an unknown contact reaches the same confirmation
    screen as a known one'` asserts the `confirm` screen becomes visible either way. No new
    test needed.
  - |
    AC2 (appropriate time-limited credential sent per channel): partially a new failing test.
    The "sends a reset email/SMS" behavior is already covered (`test/auth.test.js` `'AC2: a
    verified email contact triggers a reset email send'` / `'...phone contact triggers a reset
    SMS send'`). The gap is credential *shape* for the phone channel — write this failing test
    first in `test/auth-store.test.js`:
    ```js
    test('AC2: requestPasswordReset generates a 6-digit numeric code for the phone channel (so it can actually be typed into the OTP screen)', async () => {
      const notifyClient = require('../src/auth/notifyClient');
      let captured;
      jest.spyOn(notifyClient, 'sendResetSms').mockImplementation(async (args) => { captured = args; return args; });
      await requestPasswordReset('+1 555 010 0100');
      expect(captured.credential).toMatch(/^[0-9]{6}$/);
      notifyClient.sendResetSms.mockRestore();
    });
    ```
    (requires adding `requestPasswordReset` to that file's existing
    `require('../src/auth/store')` destructure). This fails against current code (credential is
    a 36-character UUID) and passes once `generateCredential` is added.
  - |
    AC3 (valid/unused/unexpired code reaches "Set new password"): the email-link path is
    already covered (`test/forgot-password.test.js` `'AC3: a verifying token on load goes
    straight to Set new password'`, `test/auth.test.js` `'AC3: a valid unused unexpired
    credential verifies'`). The realistic SMS path is the new failing test — add to
    `test/auth.test.js`:
    ```js
    test('AC3: a 6-digit SMS code shaped exactly like what the OTP screen collects verifies successfully', async () => {
      const notifyClient = require('../src/auth/notifyClient');
      let captured;
      jest.spyOn(notifyClient, 'sendResetSms').mockImplementation(async (args) => { captured = args; return args; });
      await request(app).post('/auth/forgot-password').send({ contact: '+1 555 010 0100' });
      expect(captured.credential).toMatch(/^[0-9]{6}$/);
      const res = await request(app).post('/auth/reset/verify').send({ credential: captured.credential });
      expect(res.status).toBe(200);
      expect(res.body.valid).toBe(true);
      notifyClient.sendResetSms.mockRestore();
    });
    ```
    This fails today because the real credential is a UUID that a 6-digit assertion will never
    match, demonstrating the gap before the fix.
  - |
    AC4 (invalid/expired/reused shows an error): already covered and passing —
    `test/auth.test.js` has three AC4 cases (`'an unknown credential is invalid'`, `'...once
    its expiry window has passed'` via `jest.spyOn(Date, 'now')`, `'...once already used'`), and
    `test/forgot-password.test.js` `'AC4: a failing token shows the error screen'` asserts
    `document.querySelector('.screen[data-name="error"]').hidden).toBe(false)`. No new test
    needed; the channel-aware credential change does not alter this logic (`verifyResetCredential`
    is unchanged).
  - |
    AC5 (error screen offers a way to request a new link/code): already covered and passing —
    `test/forgot-password.test.js` `'AC5: the error screen offers "Request a new reset link"
    back to the request screen'` clicks `#error-retry-btn` and asserts
    `document.querySelector('.screen[data-name="request"]').hidden).toBe(false)`. No new test
    needed.
  - |
    AC6 (password complexity validation error): already covered and passing —
    `test/auth-store.test.js` `'AC6: passwordMeetsComplexity rejects a password missing a
    required class'` and `test/forgot-password.test.js` `'AC6: a weak password shows an inline
    error and preserves the value'` (asserts `pw-new-error` becomes visible and
    `document.getElementById('pw-new').value).toBe('weak')`, i.e. the field is preserved per
    the design's inline-error pattern). No new test needed.
  - |
    AC7 (mismatched confirmation shows an error): already covered and passing —
    `test/forgot-password.test.js` `'AC7: a mismatched confirmation shows an inline error and
    blocks submit'` and `test/auth.test.js` `'AC7: resetPassword rejects a mismatched
    confirmation'` (asserts `res.status).toBe(422)` and `res.body.error).toBe('password_mismatch')`).
    No new test needed.
  - |
    AC8 (new password works for subsequent login): already covered and passing —
    `test/auth.test.js` `'AC8: the new password works for subsequent login; the old one no
    longer does'` asserts `expect(verifyLogin('works@example.com', 'BrandNew1!')).toBe(true)`
    and `expect(verifyLogin('works@example.com', 'OldPassw0rd!')).toBe(false)`. No new test
    needed; this story does not include wiring the Sign In screen's own submit button to a real
    login call (see assumptions).
  - |
    AC9 (success confirmation shown): already covered and passing —
    `test/forgot-password.test.js` `'AC9: a successful submit shows the success screen'` and
    `test/auth.test.js` `'AC9: a valid matching submission returns success'`
    (`expect(res.body.success).toBe(true)`). No new test needed.
  - |
    AC10 (redirected to sign-in): already covered and passing —
    `test/forgot-password.test.js` `'AC10: the success screen redirects to sign-in with
    resetSuccess=1'` asserts `expect(navigate).toHaveBeenCalledWith('./sign-in.html?resetSuccess=1')`,
    and `test/sign-in.test.js` `'AC10: sign-in shows the post-reset banner when resetSuccess=1
    is present'` asserts the banner becomes visible. No new test needed.
assumptions_or_open_questions:
  - |
    The story's own "open question for planning" (whether an auth/account system exists) is
    resolved by the current state of the repo: it already exists (`src/auth/store.js`,
    `src/auth/routes.js`, mounted at `/auth` in `src/server.js`), seeded with one demo user
    (`works@example.com` / `+1 555 010 0100`, password `OldPassw0rd!`). This plan treats that
    account system as a given and does not touch it beyond the one credential-format fix.
  - |
    `src/auth/notifyClient.js` is a stub that does not call any real email/SMS provider — it
    just returns the arguments it was called with, which is what lets tests spy on it. No AC
    requires a specific vendor integration, so this is left as-is and treated as out of scope,
    not a gap.
  - |
    `requestPasswordReset` only `await`s `notifyClient.sendResetEmail`/`sendResetSms` when a
    matching user is found, so once `notifyClient` talks to a real provider with real latency,
    a known vs. unknown contact could in principle become distinguishable by response timing
    even though the response body is identical (AC1). The current stub resolves instantly so
    this isn't observable today, and no AC tests for timing, so fixing it (e.g. always awaiting
    a constant-time dummy op) is treated as out of scope/speculative rather than folded into
    this plan.
  - |
    The approved design's "Enter your code" screen (`.arc/designs/TEST-M1-STORY-095-design.html`,
    screen `data-name="Enter reset code"`) specifies `id="otp-input"` with `maxlength="6"` and
    a digits-only input filter, and its demo script treats "any 6-digit code" as valid — this
    was read as the real, intended constraint (not prototype-only scaffolding), which is why
    the SMS credential is being changed to match 6 digits rather than widening the input field
    to accept a longer token.
  - |
    Password hashing (`crypto.scryptSync` in `src/auth/store.js`) and the choice not to add
    rate-limiting/lockout on repeated reset requests are both unchanged by this plan; no AC
    mentions either, and the existing implementation already matches this codebase's only other
    precedent for credential storage (there is no other auth code to diverge from).
package_dependencies: []
notes: |
  Diagram omitted: this plan's scope is a single production file
  (`src/auth/store.js`) plus two existing test files it's already imported into — too small for
  a module-boundary diagram to add anything beyond the prose above.

  Verification performed while planning (all by reading files, no test run available in this
  session): confirmed `src/server.js` mounts `authRouter` at `/auth`; confirmed
  `public/forgot-password.html` and `public/sign-in.html` implement every screen in
  `.arc/designs/TEST-M1-STORY-095-design.html` (Sign in w/ post-reset banner, Forgot password —
  Request, Check your email or phone, Enter reset code, Reset link/code error, Set new
  password w/ live complexity checklist, Password updated w/ redirect countdown), using the
  same design tokens/classes (`auth-topbar`, `auth-card`, `status-icon is-success/is-error/is-info`,
  `checklist`, `otp-input`, `field-error-text`) defined in `public/css/auth.css`; confirmed all
  10 ACs have an existing, correctly-labelled passing test per the `tests` field above.
review_focus: |
  Scope is intentionally narrow: the only new code is channel-aware credential generation in
  `src/auth/store.js` (6-digit numeric for phone, unchanged UUID for email) plus two new tests.
  Everything else in the forgot-password/reset-password/sign-in flow was found already
  implemented and tested against all 10 ACs on this branch and is explicitly out of scope for
  this plan — do not flag `notifyClient.js` being a stub, the Sign In screen's submit button
  having no backend wiring, or password hashing as unfinished; those are deliberate exclusions
  (see `assumptions_or_open_questions`), not oversights. The riskiest part of the change is
  `generateCredential`: it must keep the email channel's token long/opaque (unchanged
  `crypto.randomUUID()`) while only shortening the *phone* channel's code to 6 digits, and must
  not change `verifyResetCredential`/`resetPassword`'s generic string-keyed lookup — a reviewer
  should check that the existing `test/auth.test.js` cases that post back a captured
  `credential` value unmodified still pass for the email channel exactly as before.
