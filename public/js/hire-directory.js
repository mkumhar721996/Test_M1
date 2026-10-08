(function () {
  const { escapeHtml } = (typeof module !== 'undefined' && module.exports) ? require('./utils') : window.EmployeeUtils;
  const HireActors = (typeof module !== 'undefined' && module.exports) ? require('./hire-actors') : window.HireActors;

  const STAGE_LABELS = {
    draft: 'Draft',
    applied: 'Applied',
    screening: 'Screening',
    interview: 'Interview',
    offer_extended: 'Offer extended',
    offer_accepted: 'Offer accepted',
  };

  function statusChipMarkup(status) {
    return status === 'deactivated'
      ? '<span class="status-chip status-chip--deactivated"><span aria-hidden="true">⏸</span> Deactivated</span>'
      : '<span class="status-chip status-chip--active"><span aria-hidden="true">✓</span> Active</span>';
  }

  function subtitleFor(actor, tenant) {
    if (actor.role === 'hr') return `View, edit, and deactivate any hire profile in ${tenant}.`;
    if (actor.role === 'manager') return `You see only the hire profiles of your current direct reports in ${tenant}.`;
    return `You have access to your own hire profile in ${tenant}.`;
  }

  function initHireDirectoryApp(doc, actor, hires, onViewHire = () => {}) {
    const $ = (id) => doc.getElementById(id);
    const tenant = actor.tenant || HireActors.TENANT;
    const tbody = $('roster-tbody');
    const statusFilter = $('status-filter');
    const isNewHire = actor.role === 'new_hire';

    $('list-subtitle').textContent = subtitleFor(actor, tenant);
    const showScopeNote = actor.role === 'manager';
    $('list-scope-note').hidden = !showScopeNote;
    $('list-scope-note-text').textContent = showScopeNote
      ? `Showing only ${actor.name}'s current direct reports within ${tenant}.`
      : '';
    $('restricted-card').hidden = !isNewHire;
    $('roster-wrap').hidden = isNewHire;
    $('list-error-state').hidden = true;
    $('tenant-badge-top').lastChild.textContent = ` ${tenant}`;
    $('view-own-profile-btn').onclick = () => onViewHire(actor.hireId);

    function renderList() {
      const filter = statusFilter.value;
      const rows = hires.filter((h) => filter === 'all' || h.profileStatus === filter);

      if (hires.length === 0 && actor.role === 'manager') {
        tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state">
          <p><strong>You don't have any direct reports yet.</strong></p>
          <p>Once a candidate is assigned to you as hiring manager, their profile will appear here.</p>
        </div></td></tr>`;
        return;
      }
      if (rows.length === 0) {
        const message = hires.length === 0 ? 'No hire profiles to show.' : `No ${filter} profiles match this filter.`;
        tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><p>${message}</p></div></td></tr>`;
        return;
      }

      tbody.innerHTML = rows.map((h) => {
        const id = escapeHtml(doc, h.id);
        const manager = h.hiringManager ? escapeHtml(doc, h.hiringManager) : '<span class="not-set">Unassigned</span>';
        const stage = escapeHtml(doc, STAGE_LABELS[h.hireStage] || h.hireStage);
        return `<tr>
          <td class="name-cell"><button type="button" class="person-name-link" data-view-id="${id}">${escapeHtml(doc, h.name)}</button><span class="person-id">${id}</span></td>
          <td class="role-cell"><span class="role-line">${escapeHtml(doc, h.role)}</span><br/><span class="dept-line">${escapeHtml(doc, h.department)}</span></td>
          <td>${manager}</td>
          <td><span class="chip">${stage}</span></td>
          <td>${statusChipMarkup(h.profileStatus)}</td>
        </tr>`;
      }).join('');
      tbody.querySelectorAll('[data-view-id]').forEach((btn) => {
        btn.addEventListener('click', () => onViewHire(btn.getAttribute('data-view-id')));
      });
    }

    statusFilter.onchange = renderList;
    renderList();
  }

  function showLoadError(doc) {
    doc.getElementById('list-error-state').hidden = false;
    doc.getElementById('roster-tbody').innerHTML = '';
  }

  function createDefaultApi(getActor) {
    return {
      list: () => HireActors.request(getActor(), '/hires', 'GET').then(HireActors.parseJson),
    };
  }

  if (typeof module !== 'undefined') module.exports = { initHireDirectoryApp, createDefaultApi };

  if (typeof window !== 'undefined') {
    window.addEventListener('DOMContentLoaded', () => {
      let getActor;
      const load = () => {
        const actor = getActor();
        createDefaultApi(() => actor).list()
          .then((hires) => initHireDirectoryApp(
            document,
            actor,
            hires,
            (id) => { window.location.href = 'hire-access.html?id=' + encodeURIComponent(id); },
          ))
          .catch(() => showLoadError(document));
      };
      getActor = HireActors.setupActorSwitcher(document, load);
      load();
    });
  }
}());
