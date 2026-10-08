(function () {
  const TENANT = 'Acme Corp';
  const ACTORS = [
    { id: 'priya', role: 'hr', name: 'Priya Shah', hireId: '', tenant: TENANT, label: 'Priya Shah — HR Admin' },
    { id: 'dana', role: 'manager', name: 'Dana Brooks', hireId: '', tenant: TENANT, label: 'Dana Brooks — Manager' },
    { id: 'marcus', role: 'manager', name: 'Marcus Chen', hireId: '', tenant: TENANT, label: 'Marcus Chen — Manager' },
    { id: 'elena', role: 'manager', name: 'Elena Vance', hireId: '', tenant: TENANT, label: 'Elena Vance — Manager' },
    { id: 'jordan', role: 'new_hire', name: 'Jordan Reyes', hireId: 'hire_2031', tenant: TENANT, label: 'Jordan Reyes — New hire (self)' },
  ];
  const STORAGE_KEY = 'hireActorId';

  function actorHeaders(actor) {
    return {
      'x-staff-role': actor.role,
      'x-staff-name': actor.name,
      'x-hire-id': actor.hireId,
      'x-tenant': actor.tenant,
    };
  }

  function request(actor, url, method, body) {
    const headers = actorHeaders(actor);
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    return fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  }

  function parseJson(res) {
    return res.json().catch(() => ({})).then((data) => (res.ok ? data : Promise.reject({ status: res.status, ...data })));
  }

  // Fills the topbar actor <select>, restores the last choice (shared across pages) and returns a getter.
  function setupActorSwitcher(doc, onChange) {
    const select = doc.getElementById('actor-select');
    select.innerHTML = ACTORS.map((a) => `<option value="${a.id}">${a.label}</option>`).join('');
    let saved = null;
    try { saved = window.sessionStorage.getItem(STORAGE_KEY); } catch (e) { /* storage unavailable */ }
    if (ACTORS.some((a) => a.id === saved)) select.value = saved;
    const getActor = () => ACTORS.find((a) => a.id === select.value) || ACTORS[0];
    select.addEventListener('change', () => {
      try { window.sessionStorage.setItem(STORAGE_KEY, select.value); } catch (e) { /* storage unavailable */ }
      onChange(getActor());
    });
    return getActor;
  }

  const exported = { TENANT, ACTORS, actorHeaders, request, parseJson, setupActorSwitcher };
  if (typeof module !== 'undefined' && module.exports) module.exports = exported;
  if (typeof window !== 'undefined') window.HireActors = exported;
}());
