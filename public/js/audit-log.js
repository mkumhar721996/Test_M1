(function () {
  const isNode = typeof module !== 'undefined' && module.exports;
  const { escapeHtml } = isNode ? require('./utils') : window.EmployeeUtils;
  const HireActors = isNode ? require('./hire-actors') : window.HireActors;

  function formatTimestamp(iso) {
    return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  function initAuditLogApp(doc, entries) {
    const esc = (v) => escapeHtml(doc, v);
    doc.getElementById('audit-error-state').hidden = true;
    doc.getElementById('audit-tbody').innerHTML = entries.map((a) => {
      const chip = a.result === 'allowed'
        ? '<span class="result-chip allowed">Allowed</span>'
        : '<span class="result-chip denied">Denied</span>';
      return `<tr>
        <td>${esc(formatTimestamp(a.at))}</td>
        <td>${esc(a.actorName)}<br/><span class="audit-detail">${esc(a.actorRole)}</span></td>
        <td>${esc(a.action)}</td>
        <td>${esc(a.targetName)}<br/><span class="audit-detail">${esc(a.targetId)}</span></td>
        <td>${chip}</td>
        <td class="audit-detail">${esc(a.detail)}</td>
      </tr>`;
    }).join('');
  }

  function showError(doc, err) {
    doc.getElementById('audit-tbody').innerHTML = '';
    doc.getElementById('audit-error-text').textContent = err && err.status === 403
      ? 'Only an HR admin can view the audit log.'
      : "Couldn't load the audit log. Try again.";
    doc.getElementById('audit-error-state').hidden = false;
  }

  function createDefaultApi(getActor) {
    return { list: () => HireActors.request(getActor(), '/hires/audit-log', 'GET').then(HireActors.parseJson) };
  }

  if (isNode) module.exports = { initAuditLogApp, showError, createDefaultApi };

  if (typeof window !== 'undefined') {
    window.addEventListener('DOMContentLoaded', () => {
      let getActor;
      const load = () => createDefaultApi(getActor).list()
        .then((entries) => initAuditLogApp(document, entries))
        .catch((err) => showError(document, err));
      getActor = HireActors.setupActorSwitcher(document, load);
      load();
    });
  }
}());
