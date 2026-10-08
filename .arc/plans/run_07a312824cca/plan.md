summary: |
  Implements TEST-M1-STORY-199 (Browse Services & Submit Repair Request) per the approved
  prototype at `.arc/designs/TEST-M1-STORY-199-design.html`. Adds a read-only Service Catalog
  (`GET /service-catalog`, categories + time-window fixture data) and a Repair Requests resource
  (`POST`/`GET /repair-requests`) backed by in-memory stores following this repo's existing
  store/routes/server-mount pattern (mirrors `src/defects`). Ships a single customer-facing page
  (`public/services.html` + `public/js/services.js` + `public/css/services.css`) with the design's
  Browse Services, Booking Form, and Request Submitted screens, plus a minimal internal Admin
  Dispatch Queue screen reachable only via a direct hash route (not linked from the customer UI,
  matching the design's "reviewer-only, not a designed admin feature" annotation). Booking
  submissions always land in the dispatch queue with status "Pending" — even when the chosen time
  window has no technician available — so AC7's "never rejected" behavior is a first-class case,
  not an edge case bolted on afterward.

scope:
  - description: |
      Create `src/serviceCatalog/store.js`: a read-only in-memory fixture of the Service Catalog
      (5 categories copied from the approved design — plumbing, electrical, hvac, appliance,
      handyman — each with `id`, `name`, `icon`, `description`, `duration`, and a `fields[]`
      array describing that category's own question set) plus the `TIME_WINDOWS` fixture
      (morning/midday/afternoon staffed, evening unstaffed) the booking form and dispatch queue
      both need. Time windows live here (not in repairRequests) because they're read-only
      reference data the browse/booking UI fetches alongside categories in one call.

        export function listCatalog() { return { categories: CATEGORIES, timeWindows: TIME_WINDOWS }; }
        export function getCategory(id) { return CATEGORIES.find((c) => c.id === id) || null; }
        export function getTimeWindow(id) { return TIME_WINDOWS.find((w) => w.id === id) || null; }
    files:
      - src/serviceCatalog/store.js
    rationale: |
      AC1 requires the browse screen to read categories from "the Service Catalog"; AC2 requires
      the booking form's fields to be driven by that same category metadata. Modeling this as a
      dedicated read-only store (no create/update/delete exports) makes catalog/pricing management
      structurally impossible to add by accident, matching the story's explicit exclusion.
  - description: |
      Create `src/serviceCatalog/routes.js` exposing only `GET /` (returns `listCatalog()` as
      `{ categories, timeWindows }`, 200, no auth — this story has no customer-identity concept).
      Mount it in `src/server.js` as `app.use('/service-catalog', serviceCatalogRouter);` next to
      the other route mounts.
    files:
      - src/serviceCatalog/routes.js
      - src/server.js
    rationale: |
      A GET-only router is the structural proof that catalog/pricing management is out of scope:
      there is no route to add/edit/remove a category, so `POST /service-catalog` 404s by
      construction (Express has no matching route), which is asserted directly in the AC1 test.
  - description: |
      Create `src/repairRequests/store.js` modeled on `src/defects/store.js`'s
      validation-error-class + Map-store pattern:

        class RepairRequestValidationError extends Error {
          constructor(fields) { super('validation_error'); this.statusCode = 400; this.fields = fields; }
        }

        function createRequest(data = {}) {
          const fields = {};
          const category = getCategory(data.categoryId);
          if (!category) fields.categoryId = 'Choose a service category.';
          const description = typeof data.description === 'string' ? data.description.trim() : '';
          if (!description) fields.description = "Describe the problem so the technician knows what to expect.";
          const preferredDate = typeof data.preferredDate === 'string' ? data.preferredDate.trim() : '';
          const timeWindow = getTimeWindow(data.timeWindowId);
          if (!preferredDate || !timeWindow) fields.timeWindow = 'Choose a date and a preferred time window.';
          const address = data.address || {};
          const street = (address.street || '').trim();
          const city = (address.city || '').trim();
          const state = (address.state || '').trim();
          const zip = (address.zip || '').trim();
          if (!street || !city || !state || !zip) fields.address = 'Enter the street address, city, state, and ZIP code.';
          if (Object.keys(fields).length > 0) throw new RepairRequestValidationError(fields);
          // ...assemble and store the record, status always 'Pending', staffed: timeWindow.staffed
        }

      `listRequests()` returns requests newest-first (dispatch queue order); `getRequest(id)`
      for lookup. Note the unstaffed window is NOT a validation failure — `timeWindow.staffed`
      is only recorded on the record, never checked in the `fields` validation above, so AC7's
      path through this function is identical to the staffed path except for that one flag.
    files:
      - src/repairRequests/store.js
    rationale: |
      Centralizing validation here (rather than in the route) matches the `defects`/`rooms`
      precedent and keeps the "required: description, time window, address" rule (AC4) and the
      "unstaffed is not rejected" rule (AC7) next to each other so the latter can't regress into
      an accidental 400/409 path.
  - description: |
      Create `src/repairRequests/routes.js`:

        router.post('/', (req, res, next) => {
          try { res.status(201).json(createRequest(req.body)); }
          catch (err) {
            if (err instanceof RepairRequestValidationError) {
              return res.status(400).json({ error: 'validation_error', fields: err.fields });
            }
            next(err);
          }
        });
        router.get('/', (req, res, next) => { try { res.status(200).json(listRequests()); } catch (err) { next(err); } });

      Mount in `src/server.js` as `app.use('/repair-requests', repairRequestsRouter);`. No auth
      middleware — matches the catalog route and the fact no customer/dispatcher identity exists
      anywhere in this story's ACs (see assumptions).
    files:
      - src/repairRequests/routes.js
      - src/server.js
    rationale: |
      `GET /repair-requests` is the dispatch queue read model AC6/AC7 check against; `POST` is
      the single submission entry point for AC3/AC4/AC5/AC7.
  - description: |
      Build the customer-facing page `public/services.html`, reusing the design's exact markup/ids
      for the Browse Services screen (`.category-grid` of `.card.category-card` items, each with
      `.cat-icon`, name, description, `.cat-meta` duration, and a "Request this service →" button
      — no edit/add/delete control anywhere, per AC1) and the Booking Form screen (`#category-select`,
      `#dynamic-fields` fieldset driven by the selected category's `fields[]`, `#description`
      textarea, `#preferred-date` + `#time-window` with `#unstaffed-notice`, the four
      `#addr-*` service-address inputs, the optional `#photo-input`/`#photo-grid` photo picker, and
      `#form-error-summary` / per-field `.field-error` elements), plus the Request Submitted
      confirmation screen's `<dl class="confirm-grid">` (`#conf-id`, `#conf-category`, `#conf-time`,
      `#conf-address`, `#conf-description`, `#conf-photos`, `#conf-unstaffed-notice`). Pulls in
      `../design-system/tokens.css` and `../design-system/prototype-utils.css` (already define
      `.btn`, `.card`, `.input`, `.label`, `.app-topbar`, `.page`, matching every other page in
      `public/`) plus a new `./css/services.css` for the story-specific rules from the design's
      third `<style>` block (`.category-grid`, `.form-section`, `.field-error`, `.notice`,
      `.photo-*`, `.submit-bar`, `.status-chip`, `.queue-row`, `.unstaffed-badge`,
      `.internal-tag`, `.confirm-*`, `.empty-state`) — excluding the design's review-bar and
      `.demo-note` rules, which style reviewer-only prototype scaffolding that is not shipped.
      Excludes the prototype's "Fill valid example", "Preview: validation error", "Clear form",
      and "View admin dispatch queue" buttons — the design itself labels that whole block
      "Reviewer tooling — not part of the shipped app".
    files:
      - public/services.html
      - public/css/services.css
    rationale: |
      The design is the only record of this UI; reusing its ids/classes/copy directly (rather
      than re-deriving them) is how the plan stays faithful to the approved layout, spacing, and
      component breakdown while dropping only the explicitly-labeled prototype-only tooling.
  - description: |
      Create `public/js/services.js` following the `initDefectsApp(doc, api)` / `createDefaultApi()`
      shape from `public/js/defects.js` (same dependency-injected-`api` pattern so UI tests can
      stub network calls):

        function initServicesApp(doc, api) { /* wires both screens below */ }
        function createDefaultApi() {
          return {
            getCatalog: () => request('/service-catalog', 'GET'),
            createRequest: (payload) => request('/repair-requests', 'POST', payload),
            listQueue: () => request('/repair-requests', 'GET'),
          };
        }
        module.exports = { initServicesApp, createDefaultApi };

      Behavior:
        - On load, `api.getCatalog()` populates `#category-select` and renders `.category-grid`
          cards (AC1); each card's button jumps to the booking form with that category preselected.
        - `#category-select` change re-renders `#dynamic-fields` from the selected category's
          `fields[]` (select vs. text inputs per field `type`), clearing/replacing the previous
          category's fields entirely (AC2).
        - `#time-window` change toggles `#unstaffed-notice` (non-blocking `.notice`, never
          `.field-error`) when the chosen window's `staffed` is `false` (AC7 — informational only).
        - Submit handler validates required fields client-side (category, description, date+window,
          street/city/state/zip — photos never required) and if any are missing, renders
          `#form-error-summary` (`role="alert"`, moves focus to it) plus per-field inline errors,
          and does NOT call `api.createRequest` (AC4). Category's own non-optional dynamic fields
          are validated the same way, matching the design, but this is a client-side UX nicety on
          top of AC2/AC4, not a server-enforced rule (see assumptions).
        - On valid submit, calls `api.createRequest({ categoryId, categoryDetails, description,
          preferredDate, timeWindowId, address: { street, unit, city, state, zip },
          photos: photos.map(p => ({ name: p.name })) })`, then renders the confirmation screen
          from the response, including the unstaffed notice when `response.staffed === false`
          (AC3, AC5, AC7).
        - A `#admin-queue` screen (hidden by default) renders `.queue-row` entries from
          `api.listQueue()` — status chip text plus `.unstaffed-badge` when `!r.staffed` — reachable
          only by navigating the page to `#/admin/queue` (own `hashchange` listener), never from a
          button on the customer screens, so a customer "never sees the internal queue" per the
          design's note while the real feature still exists for a dispatcher who visits that URL.
    files:
      - public/js/services.js
    rationale: |
      Matches the dependency-injected `api` pattern already used by `public/js/defects.js`, which
      is what lets `test/services-ui.test.js` and `test/dispatch-queue-ui.test.js` drive the real
      rendering/validation code against a stubbed network layer instead of real `fetch`.
  - description: |
      Add the two new routers to `src/server.js`'s existing require/mount list, next to
      `defectsRouter`:

        const serviceCatalogRouter = require('./serviceCatalog/routes');
        const repairRequestsRouter = require('./repairRequests/routes');
        ...
        app.use('/service-catalog', serviceCatalogRouter);
        app.use('/repair-requests', repairRequestsRouter);
    files:
      - src/server.js
    rationale: |
      Every other resource in this app is mounted here; omitting this step would leave the new
      routers unreachable by both the UI and the supertest-based API tests.

tests:
  - |
    AC1 (backend) — `test/service-catalog.test.js`:
    `const res = await request(app).get('/service-catalog');`
    `expect(res.status).toBe(200);`
    `expect(res.body.categories.length).toBeGreaterThanOrEqual(1);`
    and, proving catalog management is excluded:
    `const post = await request(app).post('/service-catalog').send({ name: 'New category' });`
    `expect(post.status).toBe(404);`
  - |
    AC1 (UI) — `test/services-ui.test.js`, stubbing `api.getCatalog` with a 2-category fixture:
    `initServicesApp(document, api); await flush();`
    `expect(document.querySelectorAll('.category-card')).toHaveLength(2);`
    `expect(document.querySelector('.category-card button[data-edit], .category-card button[data-delete]')).toBeNull();`
  - |
    AC2 (UI) — `test/services-ui.test.js`:
    `document.getElementById('go-to-form').click();` (or equivalent category-card click)
    `document.getElementById('category-select').value = 'plumbing'; fireChange();`
    `expect(document.getElementById('dynamic-fields').textContent).toContain('Which fixture is affected?');`
    `document.getElementById('category-select').value = 'electrical'; fireChange();`
    `expect(document.getElementById('dynamic-fields').textContent).not.toContain('Which fixture is affected?');`
    `expect(document.getElementById('dynamic-fields').textContent).toContain('Which room is affected?');`
  - |
    AC3 (backend) — `test/repair-requests.test.js`:
    `const res = await request(app).post('/repair-requests').send({ categoryId: 'plumbing', description: 'Leaking sink', preferredDate: '2026-10-10', timeWindowId: 'morning', address: { street: '1 Main St', city: 'Austin', state: 'TX', zip: '78701' } });`
    `expect(res.status).toBe(201);`
    `expect(res.body.status).toBe('Pending');`
    `expect(res.body.photoCount).toBe(0);`
  - |
    AC4 (backend) — `test/repair-requests.test.js`:
    `const res = await request(app).post('/repair-requests').send({ categoryId: 'plumbing' });`
    `expect(res.status).toBe(400);`
    `expect(res.body.fields).toEqual(expect.objectContaining({ description: expect.any(String), timeWindow: expect.any(String), address: expect.any(String) }));`
    AC4 (UI) — `test/services-ui.test.js`:
    `submitForm();`
    `expect(api.createRequest).not.toHaveBeenCalled();`
    `expect(document.getElementById('form-error-summary').querySelector('[role="alert"]')).not.toBeNull();`
    `expect(document.getElementById('description-error').hidden).toBe(false);`
  - |
    AC5 (backend) — `test/repair-requests.test.js`:
    `const res = await request(app).post('/repair-requests').send({ ...validPayload, photos: [{ name: 'a.jpg' }, { name: 'b.jpg' }] });`
    `expect(res.status).toBe(201);`
    `expect(res.body.photoCount).toBe(2);`
    AC5 (UI) — `test/services-ui.test.js` after simulating two attached photos and submitting:
    `expect(api.createRequest).toHaveBeenCalledWith(expect.objectContaining({ photos: [{ name: 'a.jpg' }, { name: 'b.jpg' }] }));`
    `expect(document.getElementById('conf-photos').textContent).toBe('2 photos attached');`
  - |
    AC6 (backend) — `test/repair-requests.test.js`:
    `const created = await request(app).post('/repair-requests').send(validPayload);`
    `const queue = await request(app).get('/repair-requests');`
    `expect(queue.body[0]).toMatchObject({ id: created.body.id, status: 'Pending' });`
    AC6 (UI) — `test/dispatch-queue-ui.test.js`:
    `expect(document.querySelector(`.queue-row[data-id="${created.id}"] .status-chip`).textContent).toContain('Pending');`
  - |
    AC7 (backend) — `test/repair-requests.test.js`:
    `const res = await request(app).post('/repair-requests').send({ ...validPayload, timeWindowId: 'evening' });`
    `expect(res.status).toBe(201);`
    `expect(res.body.status).toBe('Pending');`
    `expect(res.body.staffed).toBe(false);`
    AC7 (UI) — `test/services-ui.test.js` (notice, not error) and `test/dispatch-queue-ui.test.js` (queue badge):
    `document.getElementById('time-window').value = 'evening'; fireChange();`
    `expect(document.getElementById('unstaffed-notice').hidden).toBe(false);`
    `expect(document.getElementById('unstaffed-notice').querySelector('.field-error')).toBeNull();`
    and in the queue: `expect(row.querySelector('.unstaffed-badge').textContent).toContain('No technician available yet');`

assumptions_or_open_questions:
  - "No authentication or customer-identity concept exists anywhere in this story's ACs or the design (no sign-in UI), so `/service-catalog` and `/repair-requests` are left unauthenticated, unlike `/defects` which scopes visibility by project membership."
  - "The Admin Dispatch Queue screen is shipped as a 4th screen in the same single-page app, reachable only via a direct `#/admin/queue` hash route with no link from any customer-facing screen — this matches the design's own annotation that it 'exists only so a reviewer can see AC6/AC7 land somewhere, not as a designed admin feature,' and no AC calls for dispatcher authentication, so none is added."
  - "The prototype's reviewer bar, Prev/Next navigation, and the entire '.demo-note' block (Fill valid example, Fill valid example + photos, Fill example in an unstaffed window, Preview: validation error, Clear form, View admin dispatch queue) are excluded from the shipped app — the design itself labels this block 'Reviewer tooling — not part of the shipped app'."
  - "Category-specific dynamic fields (AC2) are rendered and required client-side exactly as the design shows, but are NOT validated server-side and their values are stored as an opaque, unvalidated `categoryDetails` object — AC4 only names description, time window, and service address as required, and the confirmation screen in the design does not display dynamic field values, so there is no AC-driven need for server-side validation of them."
  - "Photos are stored as lightweight `{ name }` metadata only (count + filenames) — the design explicitly notes 'nothing is uploaded anywhere' for its own FileReader-based previews, and no AC requires persisting actual image bytes, so no multipart/binary upload handling is introduced."
  - "Time windows (and which ones are currently 'staffed') are fixed fixture data defined once in `serviceCatalog/store.js`, not configurable through any UI — technician availability management is explicitly out of scope for this story."

package_dependencies: []

notes: |
  This story has no prior in-repo analog for "catalog" + "submission queue" together, so the plan
  follows the closest existing precedent, `src/defects` (TEST-M1-STORY-194/195): a
  validation-error-class + `Map`-backed store, a thin Express router that translates that error
  into a 400 with a `fields` object, and a dependency-injected `initXApp(doc, api)` front-end
  module so UI tests stub the network layer instead of hitting `fetch`. The design
  (`.arc/designs/TEST-M1-STORY-199-design.html`) is a single static HTML/CSS/JS prototype with
  four screens (Browse Services, Booking Form, Request Submitted, Admin Dispatch Queue) built
  entirely from `design-system/tokens.css` variables and `design-system/prototype-utils.css`
  utility classes already used by every other page in `public/` — no new tokens or colors are
  introduced, and no new third-party package is required.

  No design/AC conflict was found: the design's own inline comments explicitly call out exactly
  which parts are shippable (the four screens, the validation/notice treatment) versus which are
  prototype-only reviewer scaffolding (the top review bar and the `.demo-note` buttons), so this
  plan follows those annotations rather than needing to make a judgment call.

  ```mermaid
  flowchart TD
    server[src/server.js] --> catRoutes[serviceCatalog/routes.js]
    server --> reqRoutes[repairRequests/routes.js]
    catRoutes --> catStore[serviceCatalog/store.js]
    reqRoutes --> reqStore[repairRequests/store.js]
    reqStore -->|getCategory/getTimeWindow| catStore
    servicesJs[public/js/services.js] -->|"fetch GET /service-catalog (AC1/AC2)"| catRoutes
    servicesJs -->|"fetch POST /repair-requests (AC3/4/5/7)"| reqRoutes
    servicesJs -->|"fetch GET /repair-requests (AC6/7)"| reqRoutes
    servicesHtml[public/services.html] --> servicesJs

    classDef touched fill:#f96,color:#000
    class server,catRoutes,reqRoutes,catStore,reqStore,servicesJs,servicesHtml touched
  ```

review_focus: |
  In scope: a read-only catalog endpoint, a booking submission endpoint that validates only
  category/description/time-window/address (never photos, never category-specific dynamic
  fields), and a dispatch-queue read model. Out of scope, deliberately not touched: any
  catalog/pricing create-update-delete route, technician assignment, editing/cancelling an
  existing request, real file/photo upload, and any auth boundary on either the customer or
  "admin" endpoints. The riskiest area is AC7: confirm `POST /repair-requests` with an unstaffed
  `timeWindowId` returns `201`/`Pending` (not `400`/`409`/some rejected status) and that the
  front-end's unstaffed notice is rendered as `.notice`, never reusing the `.field-error`/error-summary
  styling — the design is explicit that this must never read as a rejection. Also worth checking:
  the dynamic per-category fields are validated client-side (matching the design) but intentionally
  NOT server-side, since AC4 only lists three required fields — don't flag the server's lack of
  per-category-field validation as a bug.
