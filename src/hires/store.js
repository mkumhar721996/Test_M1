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
  hiringManager: null,
  profileStatus: 'active',
  run: null,
  runHistory: [],
  onboardingStatus: null,
  auditLog: [],
});

class HireValidationError extends Error {
  constructor(message, fields = {}) {
    super(message);
    this.statusCode = 400;
    this.fields = fields;
  }
}

function assertValidHire(name, email, phone, department, role, startDate) {
  const fields = {};
  if (!name || !String(name).trim()) fields.name = 'Full name is required.';
  if (!email || !String(email).trim()) fields.email = 'Email is required.';
  if (!phone || !String(phone).trim()) fields.phone = 'Phone is required.';
  if (!department) fields.department = 'Department is required.';
  if (!role || !String(role).trim()) fields.role = 'Role is required.';
  if (!startDate) fields.startDate = 'Start date is required.';
  if (Object.keys(fields).length > 0) {
    throw new HireValidationError('validation_error', fields);
  }
}

const CANDIDATE_STAGES = ['applied', 'screening', 'interview', 'offer_extended', 'offer_accepted'];

function assertValidStageTransition(hire, changes) {
  const stageChanging = 'hireStage' in changes && changes.hireStage !== hire.hireStage;
  const hiringManagerError = { hiringManager: 'Hiring manager is required from Screening onward.' };
  const nextHiringManager = 'hiringManager' in changes ? changes.hiringManager : hire.hiringManager;
  const hasHiringManager = Boolean(nextHiringManager && String(nextHiringManager).trim());

  if (!stageChanging) {
    // Clearing the manager while already at Screening or later is not allowed.
    if ('hiringManager' in changes && CANDIDATE_STAGES.indexOf(hire.hireStage) >= 1 && !hasHiringManager) {
      throw new HireValidationError('validation_error', hiringManagerError);
    }
    return;
  }

  if (hire.profileStatus === 'deactivated') {
    throw new HireValidationError('validation_error', { hireStage: 'Cannot change stage on a deactivated hire.' });
  }
  if (hire.profileStatus === 'rejected' || hire.profileStatus === 'withdrawn') {
    throw new HireValidationError('validation_error', { hireStage: `Cannot change stage — status is ${hire.profileStatus === 'rejected' ? 'Rejected' : 'Withdrawn'}. This record is closed and cannot advance to another stage.` });
  }

  const fromIdx = CANDIDATE_STAGES.indexOf(hire.hireStage);
  const toIdx = CANDIDATE_STAGES.indexOf(changes.hireStage);
  // Legacy stages (e.g. draft) may enter the pipeline unvalidated.
  if (fromIdx === -1) return;

  if (toIdx === -1) {
    throw new HireValidationError('validation_error', { hireStage: 'Stage must be a valid pipeline stage.' });
  }
  if (toIdx < fromIdx) {
    throw new HireValidationError('validation_error', { hireStage: 'Stage cannot move backward.' });
  }
  if (toIdx > fromIdx + 1) {
    throw new HireValidationError('validation_error', { hireStage: 'Stage cannot skip ahead.' });
  }
  if (toIdx >= 1 && !hasHiringManager) {
    throw new HireValidationError('validation_error', hiringManagerError);
  }
}

async function createHire(data) {
  assertValidHire(data.name, data.email, data.phone, data.department, data.role, data.startDate);
  const hire = {
    ...data,
    id: crypto.randomUUID(),
    profileStatus: 'active',
    run: null,
    runHistory: [],
    onboardingStatus: null,
    auditLog: [],
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
  const nextName = 'name' in changes ? changes.name : hire.name;
  const nextEmail = 'email' in changes ? changes.email : hire.email;
  const nextPhone = 'phone' in changes ? changes.phone : hire.phone;
  const nextStartDate = 'startDate' in changes ? changes.startDate : hire.startDate;

  assertValidHire(nextName, nextEmail, nextPhone, nextDepartment, nextRole, nextStartDate);
  assertValidStageTransition(hire, changes);

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
  if (hire.profileStatus === 'rejected' || hire.profileStatus === 'withdrawn') {
    throw new HireValidationError('validation_error', { profileStatus: `Cannot reactivate — status is ${hire.profileStatus === 'rejected' ? 'Rejected' : 'Withdrawn'}. Rejected and Withdrawn are final outcomes and aren't eligible for reactivation.` });
  }
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

function assertEligibleForOutcome(hire) {
  if (hire.profileStatus === 'deactivated') {
    throw new HireValidationError('validation_error', { profileStatus: 'Cannot mark as Rejected or Withdrawn — candidate is deactivated. Reactivate the candidate first.' });
  }
  if (hire.profileStatus === 'rejected' || hire.profileStatus === 'withdrawn') {
    throw new HireValidationError('validation_error', { profileStatus: `Already closed — status is ${hire.profileStatus === 'rejected' ? 'Rejected' : 'Withdrawn'}.` });
  }
  const stageIdx = CANDIDATE_STAGES.indexOf(hire.hireStage);
  const offerIdx = CANDIDATE_STAGES.indexOf('offer_extended');
  if (stageIdx === -1 || stageIdx >= offerIdx) {
    throw new HireValidationError('validation_error', { profileStatus: 'Cannot mark as Rejected or Withdrawn — candidate is at or past the Offer stage.' });
  }
}

async function markOutcome(id, outcome, reason) {
  const hire = hires.get(id);
  if (!hire) return undefined;
  assertEligibleForOutcome(hire);
  hire.profileStatus = outcome;
  hire.outcomeReason = reason ? String(reason).trim() : '';
  return hire;
}

async function rejectHire(id, reason) { return markOutcome(id, 'rejected', reason); }
async function withdrawHire(id, reason) { return markOutcome(id, 'withdrawn', reason); }

function appendOnboardingAuditEntry(hireId, actor, action, { completed = false } = {}) {
  const hire = hires.get(hireId);
  if (!hire) return undefined;
  hire.auditLog.push({ ts: new Date().toISOString(), actor, action });
  if (completed) hire.onboardingStatus = 'completed';
  else if (!hire.onboardingStatus) hire.onboardingStatus = 'in_progress';
  return hire;
}

module.exports = { HireValidationError, createHire, getHire, listHires, updateHire, deactivateHire, reactivateHire, rejectHire, withdrawHire, appendOnboardingAuditEntry };
