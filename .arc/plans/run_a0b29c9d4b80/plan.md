summary: |
  This repo currently has no application code at all — only the design-system token/CSS
  scaffold from TEST-M1-CHORE-002 (no package.json, no bundler, no test runner, no src/ or
  index.html). TEST-M1-STORY-007 is the first story of the Player Wallet & Betting epic, so
  this plan bootstraps a minimal client-only app alongside the actual feature: a
  session-scoped wallet that starts every page load at 1,000 credits, is displayed with no
  login/registration/account UI, and can be spent via a minimal place-bet action, all driven
  test-first. Because the wallet lives only in an in-memory JS module (no localStorage/cookies/
  backend call), a browser reload naturally re-initialises it to 1,000 — that "reset on
  reload" behavior is verified by re-running the same init routine against a fresh DOM rather
  than by adding any explicit reset/clear code.

  IMPLEMENTATION NOTE (post-plan divergence): the plan below originally specified
  Vite + Vitest + jsdom. During implementation, the sandbox's npm registry access was blocked
  (the proxy returns HTTP 403 for `registry.npmjs.org`, confirmed via both `npm install` and a
  direct `curl` through the proxy, with no package cached anywhere on disk), so none of those
  three packages could be installed. The implementation instead uses only what ships with
  Node 22 out of the box: `node --test` as the test runner (see `package.json`'s `test`
  script) and a small hand-rolled DOM test double at `test/support/fakeDocument.js` (built on
  Node's native `EventTarget`/`Event` globals) standing in for jsdom. `npm run dev` uses a
  ~25-line dependency-free static file server (`scripts/dev-server.mjs`) instead of Vite. This
  keeps `package.json` dependency-free and the story shippable without network access; the
  `package_dependencies` list and `vite.config.js` reference below are retained for history but
  were not applied — see the updated scope/tests notes inline.

scope:
  - description: |
      Bootstrap the app project (none exists yet): `package.json` and a `.gitignore` for
      `node_modules`. Wires up `npm test` (`node --test "test/*.test.js"`, Node's built-in
      runner) and `npm run dev` (`scripts/dev-server.mjs`, a dependency-free static file
      server) as the project's first scripts. No `vite.config.js` is created — see the
      IMPLEMENTATION NOTE in the summary above for why Vite/Vitest/jsdom were dropped in
      favor of zero-install, Node-native tooling.
    files:
      - package.json
      - scripts/dev-server.mjs
      - .gitignore
    rationale: |
      No build/test tooling exists in the repo yet; every later scope item needs a place to
      run tests and a dev server to serve the game.

  - description: |
      Add `src/wallet.js`, a pure state module with no persistence, so "reload resets to
      1,000" is a natural consequence of re-importing/re-calling it rather than an explicit
      feature:
      ```js
      export const STARTING_BALANCE = 1000;

      export function createWallet(startingBalance = STARTING_BALANCE) {
        return { balance: startingBalance };
      }

      export function placeBet(wallet, amount) {
        if (amount <= 0 || amount > wallet.balance) {
          throw new Error('Invalid bet amount');
        }
        return { balance: wallet.balance - amount };
      }
      ```
    files:
      - src/wallet.js
    rationale: |
      AC1 and AC3 both come from `createWallet()` always starting at `STARTING_BALANCE` with
      no read from any storage; AC2 needs a `placeBet` that validates against the current
      balance.

  - description: |
      Add `src/main.js` exporting `initGame(doc = document)`, which creates a fresh wallet,
      renders the balance, and wires the bet form submit handler; and `src/entry.js`, the tiny
      module-script side-effect file that calls `initGame()` once the real DOM is ready. Add
      `index.html` as the actual game shell (not the style-guide page) with a `#balance`
      display and a `#bet-form`/`#bet-amount` control, linking the existing
      `design-system/tokens.css` and `design-system/prototype-utils.css` — and nothing
      resembling a login/registration/account element.
    files:
      - src/main.js
      - src/entry.js
      - index.html
    rationale: |
      Separating `initGame` (pure, testable, no top-level side effect) from `entry.js` (the
      side-effecting bootstrap wired into `index.html`) lets tests call `initGame()` directly
      against a jsdom document without needing a real page load, while still giving the
      browser a real entry point.

  - description: |
      Add `test/wallet.test.js` and `test/main.test.js` (Node's built-in `node:test` runner,
      using the `test/support/fakeDocument.js` DOM double in place of jsdom) covering the
      four acceptance criteria end to end against the rendered DOM shell.
    files:
      - test/wallet.test.js
      - test/main.test.js
      - test/support/fakeDocument.js
    rationale: |
      Test-first: these are written and run failing before `wallet.js`/`main.js`/`index.html`
      exist, then made to pass with the minimal code above.

tests:
  - |
    AC1 — balance of 1,000 is displayed on load.
    File: test/main.test.js
    ```js
    it('displays 1,000 credits on load', () => {
      initGame();
      expect(document.querySelector('#balance').textContent).toContain('1,000');
    });
    ```
    Fails first because `src/main.js` / `initGame` and the `#balance` element don't exist yet.
  - |
    AC2 — the player can place a bet using the displayed balance.
    File: test/main.test.js
    ```js
    it('lets the player place a bet using the displayed balance', () => {
      const wallet = initGame();
      document.querySelector('#bet-amount').value = '250';
      document.querySelector('#bet-form').dispatchEvent(new Event('submit', { cancelable: true }));
      expect(wallet.balance).toBe(750);
      expect(document.querySelector('#balance').textContent).toContain('750');
    });
    ```
    Paired with a unit-level assertion in test/wallet.test.js:
    ```js
    it('rejects a bet larger than the balance', () => {
      const wallet = createWallet();
      expect(() => placeBet(wallet, 1001)).toThrow('Invalid bet amount');
    });
    ```
  - |
    AC3 — reloading resets the balance to 1,000.
    File: test/main.test.js
    ```js
    it('resets balance to 1,000 on reload (fresh init)', () => {
      const wallet = initGame();
      document.querySelector('#bet-amount').value = '400';
      document.querySelector('#bet-form').dispatchEvent(new Event('submit', { cancelable: true }));
      expect(wallet.balance).toBe(600);

      loadShell(); // re-mount a fresh DOM, simulating a page reload
      const reloaded = initGame();
      expect(reloaded.balance).toBe(1000);
      expect(document.querySelector('#balance').textContent).toContain('1,000');
    });
    ```
    This is the test that proves reload-resets works *because there is no persistence layer*,
    not because of any explicit reset call.
  - |
    AC4 — no login/registration/account UI is shown.
    File: test/main.test.js
    ```js
    it('shows no login, registration, or account UI', () => {
      initGame();
      expect(document.querySelector('input[type="password"]')).toBeNull();
      expect(document.body.textContent.toLowerCase()).not.toMatch(/log ?in|sign ?up|register|account/);
    });
    ```

assumptions_or_open_questions:
  - "No application code, package.json, or test runner exists in the repo yet, so this plan includes bootstrapping the project itself rather than assuming an existing app shell to extend."
  - "Treated the wallet as in-memory JS state with zero persistence (no localStorage/sessionStorage/cookies/backend) as the mechanism for AC3 — the story doesn't say this explicitly, but it's the minimal way to satisfy \"reload resets to 1,000\" without adding an explicit clear/reset feature."
  - "AC2's 'place a bet' is scoped to a minimal validated balance deduction (src/wallet.js placeBet) — spin resolution, payouts, and crediting winnings are separate stories under the Player Wallet & Betting epic and are out of scope here."
  - "Originally chose Vite + vanilla JS + Vitest/jsdom as the stack since nothing in the repo currently dictates a framework; this keeps the app aligned with the plain HTML/CSS-custom-properties style already used by design-system/style-guide.html. Implemented instead with vanilla JS + Node's built-in test runner + a hand-rolled DOM double, because the sandbox has no npm registry access (see IMPLEMENTATION NOTE above) — the app itself remains framework-free either way."
  - "index.html is the real game entry, distinct from design-system/style-guide.html, but reuses the same tokens.css/prototype-utils.css links for visual consistency."

package_dependencies:
  # None. The plan originally called for vite/vitest/jsdom (see below for the original
  # rationale), but the sandbox has no npm registry access (proxy returns HTTP 403 for
  # registry.npmjs.org; confirmed via `npm install` and `curl`, with nothing cached on disk).
  # The implementation adds zero runtime/dev dependencies and relies only on Node 22 built-ins
  # (`node --test`, native `EventTarget`/`Event`, `node:http`/`node:fs`).
  - name: vite
    version: ^5.4.0
    ecosystem: npm
    rationale: "NOT INSTALLED (blocked npm registry access). Originally: dev server and bundler for the game's HTML/JS entry point; replaced by scripts/dev-server.mjs."
  - name: vitest
    version: ^2.1.0
    ecosystem: npm
    rationale: "NOT INSTALLED (blocked npm registry access). Originally: test runner for the test-first wallet/DOM tests; replaced by Node's built-in `node --test`."
  - name: jsdom
    version: ^25.0.0
    ecosystem: npm
    rationale: "NOT INSTALLED (blocked npm registry access). Originally: DOM environment for vitest; replaced by test/support/fakeDocument.js, a minimal DOM double built on Node's native EventTarget/Event."

notes: |
  Base commit for this work item is `08c828a` (post TEST-M1-CHORE-002 design-system bootstrap);
  confirmed via `.arc/scratch/base-commit.json` and a repo-wide glob that no `package.json` or
  `src/` directory exists yet, so every file below is a create, not a modify.

  ```mermaid
  flowchart TD
    html[index.html]:::touched
    entry[src/entry.js]:::touched
    main[src/main.js<br/>initGame]:::touched
    wallet[src/wallet.js<br/>createWallet / placeBet]:::touched
    tokens[design-system/tokens.css<br/>prototype-utils.css]:::context
    testMain[test/main.test.js]:::touched
    testWallet[test/wallet.test.js]:::touched

    html -- "loads as module script" --> entry
    html -- "link rel=stylesheet" --> tokens
    entry -- "calls initGame() on DOMContentLoaded" --> main
    main -- "createWallet() / placeBet()" --> wallet
    testMain -- "imports & calls initGame directly against jsdom" --> main
    testWallet -- "imports createWallet/placeBet" --> wallet

    classDef touched fill:#f96,color:#000
    classDef context fill:#e5e7eb,color:#1a1a1a
  ```

  `entry.js` exists only so `initGame` stays a pure, directly-testable function with no
  top-level side effect on import — tests call `initGame()` against a jsdom document, while
  the browser gets its side-effecting bootstrap through `entry.js`.
