// Simulated notification transport. A real in-app/email provider replaces these.
function sendInApp() {
  return { ok: true };
}

function sendEmail() {
  return { ok: true };
}

module.exports = { sendInApp, sendEmail };
