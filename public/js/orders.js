function escapeHtml(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

const CANCELLABLE_STATUSES = ['placed', 'pending', 'accepted', 'preparing'];

const STATUS_LABELS = {
  placed: 'Placed',
  pending: 'Pending',
  accepted: 'Accepted',
  preparing: 'Preparing',
  picked_up: 'Picked up',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

const TIMELINE_STEPS = [
  { key: 'placed', label: 'Order placed' },
  { key: 'accepted', label: 'Accepted by restaurant' },
  { key: 'preparing', label: 'Preparing your food' },
  { key: 'picked_up', label: 'Picked up — on the way' },
  { key: 'delivered', label: 'Delivered' },
];

function stepIndex(status) {
  if (status === 'pending') return 0;
  return TIMELINE_STEPS.findIndex((s) => s.key === status);
}

function statusChipParts(status) {
  if (status === 'cancelled') return { cls: 'is-cancelled', dot: '✕' };
  if (status === 'picked_up' || status === 'delivered') return { cls: 'is-done', dot: '✓' };
  return { cls: 'is-active', dot: '●' };
}

function statusChipInner(status) {
  return `<span class="dot">${statusChipParts(status).dot}</span> ${STATUS_LABELS[status] || escapeHtml(status)}`;
}

function timelineHtml(order) {
  if (order.status === 'cancelled') {
    return `
      <div class="cancelled-card">
        <span class="icon-badge">✕</span>
        <div>
          <h3>This order was cancelled</h3>
          <p>Cancelled at ${escapeHtml(order.cancelledAt)}. Any payment will be refunded to your original payment method within 3–5 business days.</p>
        </div>
      </div>`;
  }
  const current = stepIndex(order.status);
  const items = TIMELINE_STEPS.map((step, i) => {
    let cls = '';
    let icon = i + 1;
    if (i < current) { cls = 'is-done'; icon = '✓'; }
    if (i === current) { cls = 'is-current'; icon = '●'; }
    const sub = (step.key === 'placed' && order.status === 'pending' && i === current)
      ? '<span class="step-sub">Waiting on payment confirmation</span>' : '';
    return `<li class="${cls}"><span class="step-icon">${icon}</span><span class="step-label">${step.label}${sub}</span></li>`;
  }).join('');
  return `<ul class="timeline">${items}</ul>`;
}

function cancelSectionHtml(status) {
  if (status === 'cancelled') return '';
  if (CANCELLABLE_STATUSES.includes(status)) {
    return `<button class="btn btn-secondary" id="tracking-cancel-btn">Request cancellation</button>
      <p class="cancel-note" style="margin-top: var(--space-2);">Cancellation is available while your order is placed, pending, accepted, or preparing.</p>`;
  }
  const verb = status === 'picked_up' ? 'picked up' : 'delivered';
  return `<p class="cancel-note">This order has already been ${verb}, so it can no longer be cancelled.</p>`;
}

function initOrdersApp(doc, initialOrders, api) {
  let orders = initialOrders.slice();
  let currentId = null;

  const $ = (id) => doc.getElementById(id);
  const ordersSection = $('orders-section');
  const trackingSection = $('tracking-section');
  const confirmBtn = $('cancel-confirm-btn');
  const keepBtn = $('cancel-keep-btn');

  const currentOrder = () => orders.find((o) => o.id === currentId);

  function renderList() {
    $('orders-list').innerHTML = orders.map((o) => `
      <div class="card order-row">
        <div class="order-main">
          <p class="order-id">${escapeHtml(o.id)} · ${escapeHtml(o.placedAt)}</p>
          <p class="order-restaurant">${escapeHtml(o.restaurant)}</p>
        </div>
        <span class="status-chip ${statusChipParts(o.status).cls}">${statusChipInner(o.status)}</span>
        <div class="order-actions">
          <span class="order-total">${escapeHtml(o.total)}</span>
          <button class="btn btn-secondary" data-track="${escapeHtml(o.id)}">Track order</button>
        </div>
      </div>`).join('');
  }

  function renderStatus() {
    const o = currentOrder();
    const chip = $('tracking-status-chip');
    chip.className = `status-chip ${statusChipParts(o.status).cls}`;
    chip.innerHTML = statusChipInner(o.status);
    $('tracking-timeline-container').innerHTML = timelineHtml(o);
    $('tracking-cancel-section').innerHTML = cancelSectionHtml(o.status);
  }

  function renderTracking() {
    const o = currentOrder();
    $('tracking-order-id').textContent = o.id;
    $('tracking-restaurant').textContent = o.restaurant;
    $('tracking-meta').textContent = `Placed ${o.placedAt} · Estimated ${o.eta}`;
    $('tracking-items').innerHTML = o.items
      .map((it) => `<li><span>${escapeHtml(it.name)}</span><span class="qty">×${escapeHtml(it.qty)}</span></li>`).join('');
    $('tracking-total').textContent = o.total;
    $('cancel-modal-sub').textContent = `${o.id} · ${o.restaurant}`;
    renderStatus();
  }

  function hideOutcomes() {
    ['outcome-banner-success', 'outcome-banner-danger', 'toast-success', 'toast-danger']
      .forEach((id) => { $(id).hidden = true; });
  }

  function setModalOpen(open) {
    $('cancel-modal-overlay').hidden = !open;
    $('cancel-modal-wrap').hidden = !open;
    if (open) keepBtn.focus();
  }

  function showList() {
    trackingSection.hidden = true;
    ordersSection.hidden = false;
    setModalOpen(false);
    hideOutcomes();
    renderList();
  }

  function showTracking(id) {
    currentId = id;
    hideOutcomes();
    renderTracking();
    ordersSection.hidden = true;
    trackingSection.hidden = false;
  }

  function submitCancellation() {
    const o = currentOrder();
    confirmBtn.disabled = true;
    keepBtn.disabled = true;
    confirmBtn.textContent = 'Sending request…';

    const finish = () => {
      confirmBtn.disabled = false;
      keepBtn.disabled = false;
      confirmBtn.textContent = 'Request cancellation';
      setModalOpen(false);
    };

    return api.cancel(o.id).then((result) => {
      finish();
      if (result && result.approved) {
        orders = orders.map((x) => (x.id === o.id ? result.order : x));
        renderStatus();
        $('outcome-success-copy').textContent = `${o.id} has been cancelled. You won't be charged, or you'll see a refund within 3–5 business days.`;
        $('outcome-banner-success').hidden = false;
        $('toast-success').hidden = false;
        $('outcome-banner-success').scrollIntoView?.({ behavior: 'smooth', block: 'start' });
      } else {
        showFailure(o);
      }
    }).catch((err) => {
      console.error('Order cancellation request failed', err);
      finish();
      showError();
    });
  }

  function showFailure(o) {
    $('outcome-fail-copy').textContent = `We couldn't cancel ${o.id}. ${o.restaurant} had already started on it, so the cancellation request wasn't successful — your order is still on its way. No charge changes were made.`;
    $('outcome-banner-danger').hidden = false;
    $('toast-danger').hidden = false;
    $('outcome-banner-danger').scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  }

  function showError() {
    $('outcome-fail-copy').textContent = "We couldn't reach the server, so your cancellation request wasn't sent. Please try again.";
    $('outcome-banner-danger').hidden = false;
    $('toast-danger').hidden = false;
  }

  $('orders-list').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-track]');
    if (btn) showTracking(btn.getAttribute('data-track'));
  });
  $('tracking-cancel-section').addEventListener('click', (e) => {
    if (e.target.closest('#tracking-cancel-btn')) setModalOpen(true);
  });
  $('back-link').addEventListener('click', (e) => { e.preventDefault(); showList(); });
  $('nav-orders').addEventListener('click', (e) => { e.preventDefault(); showList(); });
  $('cancel-modal-close').addEventListener('click', () => setModalOpen(false));
  keepBtn.addEventListener('click', () => setModalOpen(false));
  confirmBtn.addEventListener('click', submitCancellation);
  $('outcome-banner-dismiss').addEventListener('click', () => { $('outcome-banner-danger').hidden = true; });
  $('toast-success-close').addEventListener('click', () => { $('toast-success').hidden = true; });
  $('toast-danger-close').addEventListener('click', () => { $('toast-danger').hidden = true; });
  doc.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !confirmBtn.disabled) setModalOpen(false);
  });

  renderList();
}

function createDefaultApi() {
  return {
    list: () => fetch('/orders').then((r) => r.json()),
    cancel: (id) => fetch(`/orders/${id}/cancel`, { method: 'POST' }).then((r) => {
      if (!r.ok) throw new Error(`Cancel request failed with status ${r.status}`);
      return r.json();
    }),
  };
}

module.exports = { initOrdersApp, createDefaultApi };

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    const api = createDefaultApi();
    api.list().then((orders) => initOrdersApp(document, orders, api))
      .catch(() => initOrdersApp(document, [], api));
  });
}
