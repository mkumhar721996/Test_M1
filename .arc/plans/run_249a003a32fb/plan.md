summary: |
  Implements customer-facing order cancellation on the order tracking screen: a "Request
  cancellation" control that is visible and actionable only while an order is 'placed',
  'pending', 'accepted', or 'preparing', and is absent once an order reaches 'picked_up' or
  'delivered'. Submitting a request shows a confirmation modal, then an outcome (approved ->
  success message + order moves to 'cancelled'; rejected -> failure message + order unchanged
  and still cancellable). This adds a new `orders` domain end-to-end: an in-memory store +
  Express routes on the backend (mirroring the existing `rooms`/`hires` domain pattern), and a
  new `public/orders.html` + `public/js/orders.js` page (mirroring the existing
  `initRoomsApp(doc, initialData, api)` pattern from `public/js/rooms.js`) on the frontend. All
  layout, component markup, copy, and styling are taken directly from the approved prototype at
  `.arc/designs/TEST-M1-STORY-191-design.html` — its "My Orders", "Order Tracking — Cancellation
  Approved", "Order Tracking — Cancellation Declined", and "Order Tracking — No Cancellation
  Available" screens are the source for the status chip, timeline/cancelled-card, cancel
  section, confirm modal, inline outcome banners, and toasts built here; the reviewer-bar,
  fixture-JSON, and "Replay this scenario" scaffolding in that file are review-harness-only and
  are not built.
scope:
  - description: |
      Add the orders domain store: `src/orders/store.js`. Exports `CANCELLABLE_STATUSES =
      ['placed', 'pending', 'accepted', 'preparing']`, `createOrder(data)` (used both to seed a
      handful of demo orders at module load, mirroring `seedExampleRun()` in
      `src/runs/store.js`, and directly by tests to construct an order in any status — the same
      pattern `roomsStore.createRoom` already supports for `test/rooms-store.test.js`),
      `getOrder(id)`, `listOrders()`, and the key function:
      ```js
      function requestCancellation(orderId) {
        const order = orders.get(orderId);
        if (!order) return undefined;
        if (!CANCELLABLE_STATUSES.includes(order.status)) {
          return { approved: false, order: { ...order } };
        }
        order.status = 'cancelled';
        order.cancelledAt = new Date().toISOString();
        return { approved: true, order: { ...order } };
      }
      ```
    files:
      - src/orders/store.js
    rationale: |
      Mirrors the existing per-domain in-memory store convention (`src/rooms/store.js`,
      `src/runs/store.js`, `src/hires/store.js`) rather than introducing a new persistence
      mechanism. `createOrder` doubles as the test-seeding seam exactly like `createRoom` does
      for the AC8/AC9 "room already occupied" test in `test/rooms-store.test.js` — no new
      test-only backdoor is introduced.
  - description: |
      Add the orders routes: `src/orders/routes.js`, an Express router with:
      `GET /` -> `listOrders()`; `GET /:id` -> `getOrder(id)` or 404
      `{ error: 'order not found' }`; `POST /:id/cancel` -> `requestCancellation(id)`, 404 if
      undefined, otherwise `200 { approved, order }`. No role/auth gating — the story and design
      describe a single customer-facing flow with no role switcher (unlike `rooms`/`hires`,
      which do gate by staff role).
    files:
      - src/orders/routes.js
    rationale: |
      Matches the thin-router-over-store convention in `src/rooms/routes.js` /
      `src/employees/routes.js`, including their 404-body shape (`{ error: '<noun> not found' }`).
  - description: |
      Mount the new router in the Express app: add
      `const ordersRouter = require('./orders/routes');` and
      `app.use('/orders', ordersRouter);` to `src/server.js`, alongside the existing
      `roomsRouter`/`leaveRouter` mounts.
    files:
      - src/server.js
    rationale: |
      Every existing domain is wired the same way in this one file; orders needs the same
      treatment to be reachable.
  - description: |
      Add `public/orders.html`: a single page with two JS-toggled sections (no full page
      reload) — "My Orders" (list, from the design's "My Orders" screen: topbar with
      brand "FreshCart" + nav, page header "My orders" / "Track an order, or request a
      cancellation before it's picked up.", and one card per order showing order id + placedAt,
      restaurant name, status chip, total, and a "Track order" button) and "Order Tracking"
      (from the design's "Order Tracking" screens, merged into one generic screen since the
      design's split into "...Approved"/"...Declined" variants was a review-harness device to
      show two outcomes side by side, not two real screens — see `notes`). The tracking section
      reuses the design's card markup: order id + restaurant + status chip row, meta line
      ("Placed {time} · Estimated {eta}"), timeline/cancelled-card container, divider, items
      list, total row, divider, and a cancel section container; plus the confirm modal (title
      "Cancel this order?", subtitle "{id} · {restaurant}", the refund/can't-be-undone paragraph,
      "Keep my order" / "Request cancellation" buttons), one success banner (icon-badge ✓,
      "Cancellation successful" heading, no dismiss button — matching the design's
      `appr-banner-success`, which has none) and one danger banner (icon-badge ✕, "Cancellation
      not successful" heading, WITH a dismiss button — matching the design's
      `rej-banner-danger`, which has one; this asymmetry is in the approved design and is
      preserved, not “fixed”), and a success/danger toast pair with manual-dismiss-only close
      buttons (the design's toasts have no auto-hide timer, unlike `public/js/rooms.js`'s
      `showToast`, so none is added here). Links
      `../design-system/tokens.css`, `../design-system/prototype-utils.css`, and
      `./css/orders.css`; loads `./js/orders.js` deferred.
    files:
      - public/orders.html
    rationale: |
      `.arc/designs/TEST-M1-STORY-191-design.html` is the sole design record; its screens
      (`<div class="screen" data-name="My Orders">`, `"Order Tracking — Cancellation Approved"`,
      `"Order Tracking — Cancellation Declined"`, `"Order Tracking — No Cancellation
      Available"`) supply every element and piece of copy used here. `prototype-utils.css`
      already provides `.btn`, `.card`, `.modal-*`, base `.toast`, `.app-topbar`, `.page`,
      `.icon-btn`, `.field` — confirmed by reading that file — so `orders.html` links it instead
      of re-declaring those rules.
  - description: |
      Add `public/css/orders.css` with the story-specific rules not already covered by
      `prototype-utils.css`: `.back-link`, `.order-row` and its children, `.status-chip` plus
      `.is-active`/`.is-done`/`.is-cancelled` variants, `.timeline`/`.step-icon`/`.step-label`/
      `.step-sub`, `.cancelled-card`, `.items-list`, `.order-total-row`, `.divider`, `.banner`
      plus `.banner-success`/`.banner-danger`, `.cancel-note`, `.toast-success`/`.toast-danger`
      plus `.toast .icon-badge`/`.toast-close`, the small-viewport `.order-row` stack rule, and
      the `prefers-reduced-motion` rule — all copied from the design's page-specific `<style>`
      block. Also add, at the top of the file, the design's own "greenfield token proposal"
      block verbatim:
      ```css
      :root {
        --color-success: #34d399;
        --color-danger: #f87171;
      }
      ```
    files:
      - public/css/orders.css
    rationale: |
      These two tokens don't exist in `design-system/tokens.json`/`tokens.css` yet (confirmed by
      grep). The design's own comment says it is a proposal "flagging for
      sdlc.design-system-bootstrap to formalize... rather than hardcoding elsewhere in this
      file" — i.e. the design itself asks for exactly this: define the two custom properties
      locally in this story's own stylesheet, and leave formalizing them into the shared
      token files to separate, unscoped follow-up work. This is a deliberate deviation from the
      icon/label-only workaround used previously (see the "Design-system gap note" in
      `public/css/employee-profile.css`), because this design, unlike that one, explicitly
      specifies named success/danger tokens with documented contrast ratios — see
      `assumptions_or_open_questions`.
  - description: |
      Add `public/js/orders.js` exporting `initOrdersApp(doc, initialOrders, api)` and
      `createDefaultApi()`, matching the shape of `initRoomsApp`/`createDefaultApi` in
      `public/js/rooms.js`:
      ```js
      function initOrdersApp(doc, initialOrders, api) { /* ... */ }
      function createDefaultApi() {
        return {
          list: () => fetch('/orders').then((r) => r.json()),
          cancel: (id) => fetch(`/orders/${id}/cancel`, { method: 'POST' }).then((r) => r.json()),
        };
      }
      module.exports = { initOrdersApp, createDefaultApi };
      ```
      Behavior: renders the My Orders list from `initialOrders`; each row's "Track order"
      button (`data-track="{id}"`) switches to the tracking section for that order and renders
      its status chip, timeline-or-cancelled-card, items, total, and cancel section — a
      `#tracking-cancel-btn` "Request cancellation" button plus the cancel-note paragraph when
      `CANCELLABLE_STATUSES.includes(order.status)` (duplicating the same four-status list
      client-side, the same way `rooms.js` duplicates `VALID_TYPES`/status checks rather than
      importing server code into the browser bundle), no button and an explanatory cancel-note
      ("already been picked up"/"already been delivered") when not cancellable and not
      cancelled, and neither when already cancelled. Clicking the cancel button opens the
      confirm modal; "Keep my order", the × close button, and Escape all close it without
      acting; "Request cancellation" in the modal disables both modal buttons, sets its own
      label to "Sending request…", calls `api.cancel(order.id)`, then on resolution: if
      `approved`, closes the modal, updates the local order to the returned (cancelled) order,
      re-renders the status chip/timeline/cancel-section, shows the success banner (copy from
      the design: "{id} has been cancelled. You won't be charged, or you'll see a refund within
      3–5 business days.") and the success toast, with no auto-hide; if not approved, closes the
      modal, shows the danger banner (copy from the design: "We couldn't cancel {id}.
      {restaurant} had already started on it, so the cancellation request wasn't successful —
      your order is still on its way. No charge changes were made.") and the danger toast, and
      leaves the order/UI otherwise unchanged (cancel button still present, since the order's
      status didn't change). Bootstraps on `DOMContentLoaded` via `createDefaultApi().list()`
      the same way `rooms.js` does.
    files:
      - public/js/orders.js
    rationale: |
      Keeps the exact `init*App(doc, initialData, api)` + injectable-`api` test seam already
      established by `public/js/rooms.js` / `test/rooms-ui.test.js`, so the UI is testable
      without a real server and the mocked `api.cancel` can resolve either outcome directly —
      the same way the design's own demo code lets each screen force an 'approve' or 'reject'
      outcome, rather than deriving it from order status in the browser.
tests:
  - |
    test/orders-store.test.js — AC3/AC4 (approval path, store layer):
    ```js
    const { createOrder, requestCancellation } = require('../src/orders/store');
    const order = createOrder({ restaurant: 'Noodle & Co.', items: [{ name: 'Ramen', qty: 1 }], total: '$14.75', status: 'placed' });
    const result = requestCancellation(order.id);
    expect(result.approved).toBe(true);
    expect(result.order.status).toBe('cancelled');
    expect(typeof result.order.cancelledAt).toBe('string');
    ```
  - |
    test/orders-store.test.js — AC5 + the "no longer eligible" invariant underlying AC2 (store
    layer; an order already past the cancellable window is rejected and left unchanged — see
    `assumptions_or_open_questions` for why this is the rule exercised here):
    ```js
    const { createOrder, requestCancellation } = require('../src/orders/store');
    const order = createOrder({ restaurant: 'Sushi Express', items: [{ name: 'Rainbow roll', qty: 2 }], total: '$32.00', status: 'picked_up' });
    const result = requestCancellation(order.id);
    expect(result.approved).toBe(false);
    expect(result.order.status).toBe('picked_up');
    ```
  - |
    test/orders-store.test.js — AC1 gating constant is exactly the four named statuses:
    ```js
    const { CANCELLABLE_STATUSES } = require('../src/orders/store');
    expect(CANCELLABLE_STATUSES).toEqual(['placed', 'pending', 'accepted', 'preparing']);
    ```
  - |
    test/orders-routes.test.js — AC3/AC4 at the HTTP layer:
    ```js
    const request = require('supertest');
    const app = require('../src/server');
    const { createOrder } = require('../src/orders/store');
    const order = createOrder({ restaurant: 'Taco Corner', items: [{ name: 'Tacos', qty: 3 }], total: '$18.20', status: 'accepted' });
    const res = await request(app).post(`/orders/${order.id}/cancel`).send({});
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ approved: true, order: { status: 'cancelled' } });
    ```
  - |
    test/orders-routes.test.js — unknown order id returns 404:
    ```js
    const res = await request(app).post('/orders/not-a-real-id/cancel').send({});
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('order not found');
    ```
  - |
    test/orders-ui.test.js — AC1, each eligible status shows an actionable control that opens
    the confirm modal:
    ```js
    test.each(['placed', 'pending', 'accepted', 'preparing'])(
      'AC1: a %s order shows an actionable Request cancellation control',
      (status) => {
        const order = fixtureOrder({ id: `ORD-${status}`, status });
        const { initOrdersApp } = require('../public/js/orders');
        initOrdersApp(document, [order], {});
        document.querySelector(`[data-track="ORD-${status}"]`).click();
        const btn = document.getElementById('tracking-cancel-btn');
        expect(btn.disabled).toBe(false);
        btn.click();
        expect(document.getElementById('cancel-modal-wrap').hidden).toBe(false);
      }
    );
    ```
  - |
    test/orders-ui.test.js — AC2, each terminal status shows no cancellation control at all
    (absent, not disabled):
    ```js
    test.each(['picked_up', 'delivered'])(
      'AC2: a %s order shows no cancellation control',
      (status) => {
        const order = fixtureOrder({ id: `ORD-${status}`, status });
        const { initOrdersApp } = require('../public/js/orders');
        initOrdersApp(document, [order], {});
        document.querySelector(`[data-track="ORD-${status}"]`).click();
        expect(document.getElementById('tracking-cancel-btn')).toBeNull();
      }
    );
    ```
  - |
    test/orders-ui.test.js — AC3/AC4, an approved cancellation shows the success message and
    flips the status chip:
    ```js
    const order = fixtureOrder({ id: 'ORD-48213', status: 'preparing' });
    const api = { cancel: jest.fn().mockResolvedValue({ approved: true, order: { ...order, status: 'cancelled', cancelledAt: 'just now' } }) };
    const { initOrdersApp } = require('../public/js/orders');
    initOrdersApp(document, [order], api);
    document.querySelector('[data-track="ORD-48213"]').click();
    document.getElementById('tracking-cancel-btn').click();
    document.getElementById('cancel-confirm-btn').click();
    await Promise.resolve(); await Promise.resolve();
    expect(api.cancel).toHaveBeenCalledWith('ORD-48213');
    expect(document.getElementById('outcome-banner-success').hidden).toBe(false);
    expect(document.getElementById('tracking-status-chip').textContent).toContain('Cancelled');
    ```
  - |
    test/orders-ui.test.js — AC5, a rejected cancellation shows the not-successful message and
    leaves the order cancellable:
    ```js
    const order = fixtureOrder({ id: 'ORD-48198', status: 'accepted' });
    const api = { cancel: jest.fn().mockResolvedValue({ approved: false, order: { ...order } }) };
    const { initOrdersApp } = require('../public/js/orders');
    initOrdersApp(document, [order], api);
    document.querySelector('[data-track="ORD-48198"]').click();
    document.getElementById('tracking-cancel-btn').click();
    document.getElementById('cancel-confirm-btn').click();
    await Promise.resolve(); await Promise.resolve();
    expect(document.getElementById('outcome-banner-danger').hidden).toBe(false);
    expect(document.getElementById('tracking-cancel-btn')).not.toBeNull();
    ```
assumptions_or_open_questions:
  - |
    Neither the acceptance criteria nor the design define what determines whether a
    cancellation is approved or rejected — the design's own prototype simulates both outcomes
    by having two different demo screens call the same handler with a hardcoded
    `submitCancellation('approve' | 'reject')` argument, not by deriving the outcome from any
    order field. Treating that real decision authority (e.g. a restaurant accepting/declining)
    as out of scope for this story, this plan implements the only rule inferable purely from
    the domain described ("has not yet been picked up"): a request is approved if the order is
    still in a cancellable status at the moment it's processed, and rejected if it has left that
    window (e.g. a concurrent pickup/delivery event raced the request). `test/orders-ui.test.js`
    exercises the rejection branch by mocking the API response directly (as the design itself
    does), so this store-level rule choice doesn't block any UI test from passing; it only
    affects how `test/orders-store.test.js`/`test/orders-routes.test.js` exercise the rejection
    branch. If product intends a different approval mechanism (e.g. a real restaurant-facing
    accept/decline action), this store logic will need to change, but nothing in this item's
    scope describes that mechanism.
  - |
    The design's "Order Tracking — Cancellation Approved" and "... — Cancellation Declined"
    screens are treated as two review-harness presentations of the SAME real screen (one order
    tracking view per order, which can end up showing either outcome), not two separate pages —
    the harness only split them so a reviewer could see both outcomes side-by-side without
    waiting for one to resolve. Flagging this reading in case it's wrong and two physically
    separate routes were actually intended.
  - |
    `--color-success`/`--color-danger` are added only to this story's own `public/css/orders.css`,
    not to `design-system/tokens.json`/`tokens.css`, per the design's own comment asking that
    formalizing them be a separate, unscoped `sdlc.design-system-bootstrap` follow-up. If that
    follow-up should instead happen as part of this item, the values move to the shared token
    files with no other change needed.
  - |
    No role/permission gating is introduced for the orders endpoints or page (unlike
    `rooms`/`hires`), since neither the story nor the design show a role switcher or any
    denied-access state for this flow — it reads as a single customer-facing surface.
  - |
    Order creation/placement itself is out of scope — `createOrder` exists only to seed a small
    set of demo orders at module load and to let tests construct orders in arbitrary statuses,
    mirroring how `roomsStore.createRoom` is used directly by `test/rooms-store.test.js`. No UI
    is added for placing a new order.
package_dependencies: []
notes: |
  Research: confirmed via grep that no `order`/`tracking`/`cancel` backend domain exists yet in
  `src/`, and that `--color-success`/`--color-danger` are not present anywhere under
  `design-system/` or `public/` today — this is a genuinely new domain, not a modification of
  existing order-tracking code. Confirmed `design-system/prototype-utils.css` already supplies
  `.btn`/`.card`/`.modal-*`/base `.toast`/`.app-topbar`/`.page`/`.icon-btn`/`.field`, so
  `public/css/orders.css` only needs to add the story-specific classes enumerated in `scope`.
  Mirrors `public/js/rooms.js` + `test/rooms-ui.test.js` for the `init*App(doc, data, api)`
  frontend test seam, and `src/rooms/store.js` + `src/rooms/routes.js` for the backend
  store/router split — both already-merged, closest analogues in this codebase (list + detail
  state, status-gated actions, confirm-before-mutate flow).

  ```mermaid
  flowchart TD
    Browser["Browser loads public/orders.html"] --> OrdersJS["public/js/orders.js<br/>initOrdersApp / createDefaultApi"]
    OrdersJS -->|"fetch GET /orders, POST /orders/:id/cancel"| OrdersRoutes["src/orders/routes.js"]
    OrdersRoutes --> OrdersStore["src/orders/store.js<br/>requestCancellation"]
    Server["src/server.js"] -->|"app.use('/orders', ...)"| OrdersRoutes
    OrdersHTML["public/orders.html"] -.loads.-> OrdersJS
    OrdersCSS["public/css/orders.css"] -.styles.-> OrdersHTML
    Tokens["design-system/tokens.css + prototype-utils.css (existing, unmodified)"] -.linked by.-> OrdersHTML

    classDef touched fill:#f96,color:#000;
    class OrdersJS,OrdersRoutes,OrdersStore,Server,OrdersHTML,OrdersCSS touched;
  ```
review_focus: |
  In scope: the new `orders` store/routes (list, get, cancel-decision) and the new
  `orders.html`/`orders.js`/`orders.css` page, wired per existing per-domain conventions. Out of
  scope and should not be flagged as missing: order placement/creation UI, any restaurant-facing
  accept/decline UI, and role/permission gating (none exists in the design). The riskiest area is
  the approve/reject decision rule in `requestCancellation` — it's a reasonable but
  plan-author-chosen stand-in (approve while still in a cancellable status, reject once the
  window has passed) because neither the ACs nor the design specify the real decision mechanism;
  don't read the store's rejection branch as dead code — it's real and intentionally
  race-condition-shaped, exercised directly in `orders-store`/`orders-routes` tests and mocked
  directly (both outcomes) in the UI tests. Also note the deliberate asymmetry carried over from
  the design: the success outcome banner has no dismiss button, the danger outcome banner does —
  this is copied from the approved prototype, not an inconsistency introduced here.
