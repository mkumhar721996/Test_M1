function normalizeEmail(v) {
  return (v || '').trim().toLowerCase();
}

function normalizePhone(v) {
  return (v || '').replace(/\D/g, '');
}

function isValidEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function isValidPhone(v) {
  return normalizePhone(v).length >= 7;
}

function validateFields({ name, email, phone }) {
  const fields = {};

  if (name === '') fields.name = "Enter the guest's full name.";

  let emailError = email !== '' && !isValidEmail(email) ? 'Enter a valid email address.' : '';
  let phoneError = phone !== '' && !isValidPhone(phone) ? 'Enter a valid phone number.' : '';

  if (email === '' && phone === '') {
    emailError = emailError || 'Add an email or phone number so we can check for existing profiles.';
    phoneError = phoneError || 'Add an email or phone number so we can check for existing profiles.';
  }

  if (emailError) fields.email = emailError;
  if (phoneError) fields.phone = phoneError;

  return fields;
}

module.exports = { normalizeEmail, normalizePhone, isValidEmail, isValidPhone, validateFields };
