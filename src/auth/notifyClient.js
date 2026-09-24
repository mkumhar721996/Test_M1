async function sendResetEmail({ to, credential, ttlMinutes }) {
  return { channel: 'email', to, ttlMinutes };
}

async function sendResetSms({ to, credential, ttlMinutes }) {
  return { channel: 'phone', to, ttlMinutes };
}

module.exports = { sendResetEmail, sendResetSms };
