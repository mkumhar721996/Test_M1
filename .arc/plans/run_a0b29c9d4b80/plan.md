summary: |
  This repo currently has no application code at all — only the design-system token/CSS
  scaffold from TEST-M1-CHORE-002 (no package.json, no bundler, no test runner, no src/ or
  index.html). TEST-M1-STORY-007 is the first story of the Player Wallet & Betting epic, so
  this plan bootstraps a minimal client-only app (Vite + vanilla JS + Vitest/jsdom) alongside
  the actual feature: a session-scoped wallet that starts every page load at 1,000 credits,
  is displayed with no login/registration/account UI, and can be spent via a minimal
  place-bet action, all driven test-first. Because the wallet lives only in an in-memory JS
  module (no localStorage/cookies/backend call), a browser reload naturally re-initialises it
  to 1,000 — that "reset on reload" behavior is verified by re-running the same init routine
  against a fresh DOM rather than by adding any explicit reset/clear code.

scope:
  - description: |
      Bootstrap the app project (none exists yet): `package.json`, `vite.config.js` (test
      environment set to `jsdom`), and a `.gitignore` for `node_modules`. Wires up `npm test`
      (vitest) and `npm run dev` (vite) as the project's first scripts.
    files:
      - package.json
      - vite.config.js
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
      Add `test/wallet.test.js` and `test/main.test.js` (vitest, jsdom environment) covering
      the four acceptance criteria end to end against the rendered DOM shell.
    files:
      - test/wallet.test.js
      - test/main.test.js
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
  - "Chose Vite + vanilla JS + Vitest/jsdom as the stack since nothing in the repo currently dictates a framework; this keeps the app aligned with the plain HTML/CSS-custom-properties style already used by design-system/style-guide.html."
  - "index.html is the real game entry, distinct from design-system/style-guide.html, but reuses the same tokens.css/prototype-utils.css links for visual consistency."

package_dependencies:
  - name: vite
    version: ^5.4.0
    ecosystem: npm
    rationale: Dev server and bundler for the game's HTML/JS entry point; nothing in the repo currently provides one.
  - name: vitest
    version: ^2.1.0
    ecosystem: npm
    rationale: Test runner for the test-first wallet/DOM tests; no test framework exists in the repo yet.
  - name: jsdom
    version: ^25.0.0
    ecosystem: npm
    rationale: DOM environment for vitest so test/main.test.js can render #balance/#bet-form and dispatch events without a real browser.

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
