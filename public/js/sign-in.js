function initSignInApp(doc, search) {
  const params = new URLSearchParams(search || '');
  doc.getElementById('signin-banner').hidden = params.get('resetSuccess') !== '1';
}

module.exports = { initSignInApp };

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    initSignInApp(document, window.location.search);
  });
}
