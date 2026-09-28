const crypto = require('crypto');
const engineClient = require('../onboarding/engineClient');

const hires = new Map();

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
});

async function createHire(data) {
  const hire = {
    ...data,
    id: crypto.randomUUID(),
    profileStatus: 'active',
    run: null,
    runHistory: [],
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

async function updateHire(id, changes) {
  const hire = hires.get(id);
  if (!hire) return undefined;

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

  return hire;
}

async function deactivateHire(id) {
  const hire = hires.get(id);
  if (!hire) return undefined;

  if (hire.run && hire.run.status === 'active') {
    await engineClient.cancelRun(hire.run.id);
    hire.runHistory.push({ ...hire.run, status: 'cancelled', reason: 'profile_deactivated' });
    hire.run = null;
  }
  hire.profileStatus = 'deactivated';
  return hire;
}

async function reactivateHire(id) {
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
  return hire;
}

function normalizePhone(phone) {
  return String(phone || '').replace(/\D/g, '');
}

function findDuplicateHires(candidate, list) {
  const email = String(candidate.email || '').trim().toLowerCase();
  const phone = normalizePhone(candidate.phone);
  const matches = [];
  list.forEach((hire) => {
    const reasons = [];
    if (email && hire.email && hire.email.trim().toLowerCase() === email) reasons.push('email');
    if (phone && normalizePhone(hire.phone) === phone) reasons.push('phone');
    if (reasons.length) matches.push({ profile: hire, reasons });
  });
  return matches;
}

module.exports = { createHire, getHire, listHires, updateHire, deactivateHire, reactivateHire, findDuplicateHires };
