summary: |
  Add duplicate-guest (hire-profile) detection to the "create profile" flow: before a new
  hire profile is saved, check the submitted email/phone against existing profiles and, if any
  match, let staff either link to the existing profile (no new record created) or explicitly
  proceed anyway (a new profile is created and the warning is dismissed). This adds a pure
  matching function and a read-only lookup route on the server (src/hires/store.js,
  src/hires/routes.js), and a brand-new "Profiles list + Add hire profile" page and client
  module (public/hires-list.html, public/js/hires-list.js, public/css/hires-list.css) that
  implements the approved prototype's live flow: the details form, the "possible duplicates"
  step with match cards, the inline "proceed anyway" confirmation, and a shared confirmation
  screen for both the "linked" and "created" outcomes. No existing route, store function, or
  file is renamed or removed — this is additive.

scope:
  - description: |
      Add a pure, exported duplicate-matching function to the hires store: `findDuplicateHires(candidate, list)`.
      It normalizes email (trim + lowercase) and phone (strip non-digits) and returns
      `[{ profile, reasons }]` for every existing hire whose email and/or phone matches, where
      `reasons` is a subset of `['email', 'phone']`. No existing exported function's signature
      changes.

      ```js
      function normalizePhone(phone) { return String(phone || '').replace(/\D/g, ''); }

      function findDuplicateHires(candidate, list) {
        const email = String(candidate.email || '').trim().toLowerCase();
        const phone = normalizePhone(candidate.phone);
        const matches = [];
        list.forEach((hire) => {
          const reasons = [];
          if (email && hire.email && hire.email.trim().toLowerCase() === email) reasons.push('email');
          if (phone && normalizePhone(hire.phone) === phone) reasons.push('phone');
          if (reasons.length) matches.push({ profile: hire, reasons });
        });
        return matches;
      }
      ```
    files:
      - src/hires/store.js
    rationale: |
      Mirrors the `findDuplicates`/`normalizePhone` logic already validated in the approved
      prototype's script (TEST-M1-STORY-102-design.html, lines ~848-861), kept as a pure
      function so it can be unit-tested directly (matching the existing `hires-store.test.js`
      convention of testing store functions without HTTP) and reused by the route below.

  - description: |
      Add a non-mutating `GET /hires/duplicates` route that calls `findDuplicateHires` against
      the current in-memory list and returns the matches as JSON. Registered BEFORE the existing
      `GET /:id` route so `/hires/duplicates` is not swallowed by the `:id` param matcher.

      ```js
      router.get('/duplicates', (req, res, next) => {
        try {
          const { email = '', phone = '' } = req.query;
          const matches = findDuplicateHires({ email, phone }, listHires());
          res.status(200).json(matches);
        } catch (err) {
          next(err);
        }
      });
      ```
    files:
      - src/hires/routes.js
    rationale: |
      Gives the client a way to check for duplicates "before the new record is saved" (AC1)
      without touching the existing, unmodified `POST /hires` creation path. Placed ahead of
      `GET /:id` because Express resolves routes in registration order and `:id` would
      otherwise capture the literal segment `duplicates`.

  - description: |
      Build the new "Profiles list" page from the approved prototype: topbar/nav (Profiles ·
      Runs · Settings, matching `public/hire-profile.html`'s existing shell), a page header with
      "+ Add hire profile" button, a `.table-card`/`.profiles-table` listing every profile
      (Name, Email, Phone, Department, Status — same columns as the prototype's screen
      "Profiles list"), the "Add hire profile" modal with a details step (name, email, phone,
      department, role, start date — same fields/order as the prototype, with inline
      `.field-error` messages, omitting only the prototype's "quick-fill sample" buttons, which
      are a review-only shortcut), a "possible duplicates" step (`.duplicate-banner`, one
      `.match-card` per match showing name/role/department/status, contact line, and a chip
      naming the match reason — "Matched on email" / "Matched on phone" / "Matched on email &
      phone", plus "Link to this profile" per card), the `.dup-proceed-row` ("← Edit details" /
      "Proceed anyway — create new profile") and its `.dup-confirm-inline` one-step
      confirmation, and a toast. Adds one shared confirmation section (`#screen-confirm`)
      consolidating the prototype's three separate "Linked" / "Proceeded anyway" / "No
      duplicate" screens into a single template that swaps its icon/title/subtitle/card-title
      copy per outcome (see `assumptions_or_open_questions` for why these three are merged).
    files:
      - public/hires-list.html
      - public/css/hires-list.css
    rationale: |
      This screen does not exist anywhere in the app yet — `public/hire-profile.html` is a
      single-profile detail view fed by `hires[0]`, not a list, and has no create affordance.
      The prototype's "Profiles list" screen (data-name="Profiles list") is the entry point for
      every AC in this story and is the only screen whose live JS actually exercises AC1-AC7 end
      to end, so it is what gets built; the prototype's other screens (data-name="Add hire
      profile — details", "...possible duplicates", "Linked to existing profile", "New profile
      created — proceeded anyway", "Profile created — no duplicate found") are static
      illustrations of the same states for the reviewer's Prev/Next grid and are folded into
      the one live page rather than rebuilt as five separate documents.

  - description: |
      Add the client module wiring the page above to the server, following the same
      dependency-injected `api` pattern already used by `public/js/hire-profile.js`
      (`initHireProfileApp(doc, initialHire, api)`), so behavior is unit-testable without a
      real network call:

      ```js
      function initHiresListApp(doc, initialHires, api) { /* ... */ }
      function createDefaultApi() {
        return {
          checkDuplicates: ({ email, phone }) =>
            fetch(`/hires/duplicates?email=${encodeURIComponent(email)}&phone=${encodeURIComponent(phone)}`)
              .then((res) => res.json()),
          createHire: (data) => fetch('/hires', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
          }).then((res) => res.json()),
        };
      }
      module.exports = { initHiresListApp };
      ```

      Submit flow: validate required fields client-side (as the prototype's `validate()` does)
      -> call `api.checkDuplicates({ email, phone })` -> if empty, call `api.createHire(data)`
      immediately (AC6/AC7, no warning shown) -> if non-empty, render the duplicates step
      (AC1) and stop, without calling `createHire`. "Link to this profile"
      (`[data-link-id]` delegated click) never calls `api.createHire` (AC2), closes the modal,
      and shows the shared confirm screen naming that existing profile as the one to use (AC3).
      "Proceed anyway" -> inline confirm -> "Yes, create new profile" calls `api.createHire`
      with the originally-submitted data (AC4) and closing the modal dismisses the duplicate
      step along with it (AC5).
    files:
      - public/js/hires-list.js
    rationale: |
      Reuses the existing app's dependency-injection convention for testability (see
      `public/js/hire-profile.js`) rather than `public/js/expenses.js`'s pattern of hitting
      `localStorage`/`fetch` directly, because — unlike expenses — hire profiles are already a
      real server-backed resource (`src/hires/store.js`), so the duplicate-check and create
      calls are real API calls that need to be mockable in tests the same way
      `test/hire-profile.test.js` mocks `api.updateContact` etc.

tests:
  - |
    AC1 (store): test/hires-duplicates.test.js — `findDuplicateHires` matches on a
    case/whitespace-insensitive email or a formatting-insensitive phone number:
    `expect(findDuplicateHires({ email: '  Jordan.Reyes@Example.com ', phone: '' }, [existing])).toEqual([{ profile: existing, reasons: ['email'] }]);`
    and a route-level companion test asserts `GET /hires/duplicates?email=jordan.reyes@example.com`
    returns the seeded `hire_2031` profile with `reasons: ['email']` and that a follow-up
    `GET /hires` still shows no new profile was created by the check itself.
  - |
    AC2 (client): test/hires-list.test.js — after `checkDuplicates` resolves with one match,
    clicking the rendered `[data-link-id="hire_2031"]` button asserts
    `expect(createHire).not.toHaveBeenCalled();` and that `#profiles-tbody` still has the same
    number of rows as before the click.
  - |
    AC3 (client): test/hires-list.test.js — same click as above additionally asserts
    `expect(document.getElementById('confirm-title').textContent).toBe("Jordan Reyes’s existing profile is now the record to use.");`
    and that `#screen-confirm` is no longer `hidden` while `#create-modal` is.
  - |
    AC4 (client): test/hires-list.test.js — after the duplicates step is shown, clicking
    `#dup-proceed-btn` then `#dup-proceed-confirm-btn` asserts
    `expect(createHire).toHaveBeenCalledWith(expect.objectContaining({ name: 'Alex Morgan', email: 'jordan.reyes@example.com' }));`
  - |
    AC5 (client): test/hires-list.test.js — same test additionally asserts
    `expect(document.getElementById('create-modal').hidden).toBe(true);` and
    `expect(document.getElementById('step-duplicates').hidden).toBe(true);` i.e. the whole
    duplicate warning is gone, not merely collapsed back to the details step.
  - |
    AC6 (client + store): test/hires-list.test.js asserts that when `checkDuplicates` resolves
    `[]`, `expect(createHire).toHaveBeenCalledTimes(1);` and `#step-duplicates` is never
    un-hidden; test/hires-duplicates.test.js asserts
    `expect(findDuplicateHires({ email: 'new.person@example.com', phone: '5550001111' }, [existing])).toEqual([]);`
    and `GET /hires/duplicates` with non-matching params returns `res.body` `toEqual([])`.
  - |
    AC7 (client): test/hires-list.test.js — in the same no-match test,
    `expect(document.querySelector('#profiles-tbody').textContent).toContain('Priya Natarajan');`
    confirming the profile was created normally and rendered into the list.

assumptions_or_open_questions:
  - |
    Domain-name conflict between the story text and the actual codebase/design: the epic and
    ACs use hospitality language ("guest", "booking or walk-in check-in"), but every file in
    this repository (src/hires, public/hire-profile.html, the "Onboarding" app shell) and the
    approved prototype itself (title "Duplicate Guest Detection & Linking" over a fixture of
    `hire_XXXX` candidates with department/role/hireStage fields) implement an HR
    onboarding/hiring app, not a hospitality guest system. I've treated this story as applying
    to the existing hire-profile entity (the only "guest"-like record type that actually exists
    and the one the approved design was drawn against), and have not invented a separate
    hospitality guest model. Flagging this explicitly per instructions rather than silently
    picking one.
  - |
    The "linked" tag applied to a profile row (🔗 Linked just now) and the "designated as record
    to use" outcome are client-side/in-memory only, exactly as the prototype implements them
    (`profile.tag = 'linked'` on the local array, not persisted to the server) — there is no
    hire field for this today. AC3 is satisfied by the confirmation screen and table tag, not by
    a new persisted status; deeper CRM-style merge/link tracking is out of scope for this story.
  - |
    Consolidated the prototype's three separate full-page outcome screens ("Linked to existing
    profile", "New profile created — proceeded anyway", "Profile created — no duplicate found")
    into one shared `#screen-confirm` template that swaps copy per outcome. All AC-relevant
    copy, the summary field list, and the distinct icon (🔗 vs ✓) are preserved; only the
    duplication of near-identical markup across three near-identical screens is removed.
  - |
    `public/hires-list.html` is not cross-linked from `public/index.html` (Expense Tracker) or
    vice versa — no AC asks for shared app navigation between the two, so it's reachable by
    direct URL only, consistent with how `public/hire-profile.html` is already a standalone page
    today.
  - |
    `GET /hires/duplicates` tolerates a blank `email` or `phone` query param (skips that
    comparison) rather than erroring, since the client only calls it after its own required-field
    validation passes, but the route may be called with partial params in tests.

package_dependencies: []

notes: |
  ```mermaid
  flowchart TD
    clientPage["public/hires-list.html"] --> clientJs["public/js/hires-list.js"]
    clientJs -->|"GET /hires/duplicates"| routes["src/hires/routes.js"]
    clientJs -->|"POST /hires"| routes
    clientJs -->|"GET /hires"| routes
    routes -->|"findDuplicateHires(...)"| store["src/hires/store.js"]
    store --> engineClient["src/onboarding/engineClient.js (untouched)"]

    classDef touched fill:#f96,color:#000
    class clientPage,clientJs,routes,store touched
  ```

  Read `.arc/designs/TEST-M1-STORY-102-design.html` in full before implementing; it is the only
  record of the design and its live script (screen "Profiles list") is the reference
  implementation for the matching/rendering logic this plan re-derives in
  `src/hires/store.js` and `public/js/hires-list.js`. Existing conventions this plan follows:
  `src/hires/routes.js`/`store.js` for server shape, `public/js/hire-profile.js`'s
  dependency-injected `api` object for client testability, and `test/hires-store.test.js` /
  `test/hire-profile.test.js` for test file structure (plain unit tests for store functions,
  `@jest-environment jsdom` + `document.documentElement.innerHTML = fs.readFileSync(...)` for
  the page). No existing route, export, HTML id, or CSS class is renamed, removed, or repurposed.
