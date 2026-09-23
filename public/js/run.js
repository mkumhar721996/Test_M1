async function postTransition(runId, action, actor) {
  const res = await fetch(`/runs/${runId}/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ actorId: actor.actorId, actorRole: actor.actorRole }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'request failed');
  }
  return res.json();
}

function initRunApp(doc = document, { run, actor }) {
  const pauseBtn = doc.getElementById('pause-btn');
  const resumeBtn = doc.getElementById('resume-btn');
  const cancelBtn = doc.getElementById('cancel-btn');
  const stateLabel = doc.getElementById('run-state');
  const errorEl = doc.getElementById('run-error');

  function render() {
    stateLabel.textContent = run.state;
    pauseBtn.disabled = !['started', 'blocked'].includes(run.state);
    resumeBtn.disabled = run.state !== 'paused';
    cancelBtn.disabled = run.state === 'cancelled';
  }

  async function handle(btn, action, pendingLabel, idleLabel) {
    if (btn.disabled) return;
    btn.disabled = true;
    btn.textContent = pendingLabel;
    errorEl.hidden = true;
    try {
      run = await postTransition(run.id, action, actor);
    } catch (err) {
      errorEl.hidden = false;
      errorEl.textContent = err.message || `${idleLabel} failed — please try again.`;
    } finally {
      btn.textContent = idleLabel;
      render();
    }
  }

  pauseBtn.addEventListener('click', () => handle(pauseBtn, 'pause', 'Pausing…', 'Pause'));
  cancelBtn.addEventListener('click', () => handle(cancelBtn, 'cancel', 'Cancelling…', 'Cancel'));
  resumeBtn.addEventListener('click', () => handle(resumeBtn, 'resume', 'Resuming…', 'Resume'));

  render();
}

module.exports = { initRunApp };

async function bootstrap() {
  const root = document.getElementById('root');
  const runId = new URLSearchParams(window.location.search).get('id');
  const actor = { actorId: root.dataset.actorId, actorRole: root.dataset.actorRole };
  const res = await fetch(`/runs/${runId}`);
  const run = await res.json();
  initRunApp(document, { run, actor });
}

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', bootstrap);
}
