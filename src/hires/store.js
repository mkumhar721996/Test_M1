const crypto = require('crypto');
const engineClient = require('../onboarding/engineClient');

const hires = new Map();

const HIRE_STAGES = ['draft', 'offer_accepted'];
const AUDITABLE_FIELDS = ['name', 'email', 'phone', 'startDate', 'department', 'role', 'hireStage'];

class HireValidationError extends Error {
  constructor(message, fields = {}) {
    super(message);
    this.statusCode = 400;
    this.fields = fields;
  }
}

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function isValidEmail(v) {
  return typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function assertValidHire(data) {
  const fields = {};
  if (!isNonEmptyString(data.name)) fields.name = "Enter the candidate's full name.";
  if (!isValidEmail(data.email)) fields.email = 'Enter a valid email address.';
  if (!isNonEmptyString(data.phone)) fields.phone = 'Enter a valid phone number.';
  if (!isNonEmptyString(data.department)) fields.department = 'Select a department.';
  if (!isNonEmptyString(data.role)) fields.role = "Enter the candidate's role.";
  if (!isNonEmptyString(data.startDate)) fields.startDate = 'Choose a start date.';
  if (data.hireStage !== undefined && !HIRE_STAGES.includes(data.hireStage)) {
    fields.hireStage = 'Select a valid hire stage.';
  }
  if (Object.keys(fields).length > 0) {
    throw new HireValidationError('validation_error', fields);
  }
}

hires.set('hire_2031', {
  id: 'hire_2031',
  name: 'Jordan Reyes',
  email: 'jordan.reyes@example.com',
  phone: '(312) 555-0148',
  startDate: '2026-10-05',
  department: 'Engineering',
  role: 'Software Engineer II',
  hireStage: 'draft',
  profileStatus: 'active',
  run: null,
  runHistory: [],
  auditLog: [{ ts: '2026-01-01T00:00:00.000Z', actor: 'system', action: 'seeded fixture profile' }],
});

async function createHire(data, actor) {
  assertValidHire(data);

  const hire = {
    ...data,
    id: crypto.randomUUID(),
    profileStatus: 'active',
    run: null,
    runHistory: [],
    auditLog: [{ ts: new Date().toISOString(), actor, action: 'created candidate' }],
  };

  if (hire.hireStage === 'offer_accepted') {
    hire.run = await engineClient.triggerRun({
      hireId: hire.id,
      department: hire.department,
      role: hire.role,
    });
  }

  hires.set(hire.id, hire);
  return hire;
}

function getHire(id) {
  return hires.get(id);
}

function listHires() {
  return Array.from(hires.values());
}

async function updateHire(id, changes, actor) {
  const hire = hires.get(id);
  if (!hire) return undefined;

  assertValidHire({ ...hire, ...changes });

  const changedFields = AUDITABLE_FIELDS.filter((f) => f in changes && changes[f] !== hire[f]);

  const hasActiveRun = Boolean(hire.run && hire.run.status === 'active');
  const changingToOfferAccepted = changes.hireStage === 'offer_accepted' && hire.hireStage !== 'offer_accepted';
  const departmentChanging = 'department' in changes && changes.department !== hire.department;
  const roleChanging = 'role' in changes && changes.role !== hire.role;
  const roleOrDeptChanging = departmentChanging || roleChanging;
  const nextDepartment = 'department' in changes ? changes.department : hire.department;
  const nextRole = 'role' in changes ? changes.role : hire.role;

  if (changingToOfferAccepted && !hasActiveRun) {
    const run = await engineClient.triggerRun({ hireId: hire.id, department: nextDepartment, role: nextRole });
    Object.assign(hire, changes);
    hire.run = run;
  } else if (hasActiveRun && roleOrDeptChanging) {
    const oldRun = hire.run;
    await engineClient.cancelRun(oldRun.id);
    const newRun = await engineClient.triggerRun({ hireId: hire.id, department: nextDepartment, role: nextRole });
    Object.assign(hire, changes);
    hire.runHistory.push({ ...oldRun, status: 'cancelled', reason: 'role_or_department_changed' });
    hire.run = newRun;
  } else {
    Object.assign(hire, changes);
  }

  if (changedFields.length > 0) {
    hire.auditLog.push({ ts: new Date().toISOString(), actor, action: `updated ${changedFields.join(', ')}` });
  }

  return hire;
}

async function deactivateHire(id, actor) {
  const hire = hires.get(id);
  if (!hire) return undefined;
  if (hire.profileStatus === 'deactivated') return hire;

  if (hire.run && hire.run.status === 'active') {
    await engineClient.cancelRun(hire.run.id);
    hire.runHistory.push({ ...hire.run, status: 'cancelled', reason: 'profile_deactivated' });
    hire.run = null;
  }
  hire.profileStatus = 'deactivated';
  hire.auditLog.push({ ts: new Date().toISOString(), actor, action: 'rejected candidate' });
  return hire;
}

async function reactivateHire(id, actor) {
  const hire = hires.get(id);
  if (!hire) return undefined;
  if (hire.profileStatus !== 'deactivated' || (hire.run && hire.run.status === 'active')) return hire;

  const run = await engineClient.triggerRun({
    hireId: hire.id,
    department: hire.department,
    role: hire.role,
  });
  hire.profileStatus = 'active';
  hire.run = { ...run, freshStart: true };
  hire.auditLog.push({ ts: new Date().toISOString(), actor, action: 'reinstated candidate' });
  return hire;
}

module.exports = {
  HireValidationError,
  createHire,
  getHire,
  listHires,
  updateHire,
  deactivateHire,
  reactivateHire,
};
