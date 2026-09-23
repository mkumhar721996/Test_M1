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

async function updateHire(id, changes) {
  const hire = hires.get(id);
  if (!hire) return undefined;

  const hasActiveRun = Boolean(hire.run && hire.run.status === 'active');
  const changingToOfferAccepted = changes.hireStage === 'offer_accepted' && hire.hireStage !== 'offer_accepted';
  const departmentChanging = 'department' in changes && changes.department !== hire.department;
  const roleChanging = 'role' in changes && changes.role !== hire.role;
  const roleOrDeptChanging = departmentChanging || roleChanging;

  Object.assign(hire, changes);

  if (changingToOfferAccepted && !hasActiveRun) {
    hire.run = await engineClient.triggerRun({
      hireId: hire.id,
      department: hire.department,
      role: hire.role,
    });
  } else if (hasActiveRun && roleOrDeptChanging) {
    const oldRun = hire.run;
    await engineClient.cancelRun(oldRun.id);
    hire.runHistory.push({ ...oldRun, status: 'cancelled', reason: 'role_or_department_changed' });
    hire.run = await engineClient.triggerRun({
      hireId: hire.id,
      department: hire.department,
      role: hire.role,
    });
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

  hire.profileStatus = 'active';
  hire.run = {
    ...(await engineClient.triggerRun({
      hireId: hire.id,
      department: hire.department,
      role: hire.role,
    })),
    freshStart: true,
  };
  return hire;
}

module.exports = { createHire, getHire, updateHire, deactivateHire, reactivateHire };
