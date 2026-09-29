const { isPastRetention, computeExpiryDate } = require('./retention');

const hires = new Map();
const tombstones = new Map();
const auditLog = [];

let retentionConfig = { retentionMonths: 12, isCustomized: false };
let deletedCount = 0;

const ROLE_PERMISSIONS = {
  tenant_admin: true,
  recruiter: false,
};

function canManageRetention(role) {
  return ROLE_PERMISSIONS[role] === true;
}

class PermissionError extends Error {
  constructor(message) {
    super(message);
    this.statusCode = 403;
  }
}

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.statusCode = 400;
  }
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function nowTimestamp() {
  return new Date().toISOString();
}

function seedHire(hire) {
  hires.set(hire.id, { ...hire });
}

function tombstoneFor(hire, now) {
  return {
    id: hire.id,
    worker: hire.worker,
    role: hire.role,
    client: hire.client,
    status: hire.status,
    eventDate: hire.eventDate,
    expiredOn: computeExpiryDate(hire.eventDate, retentionConfig.retentionMonths),
    deletedOn: now,
  };
}

function sweep(now) {
  const today = now || todayIso();
  const expired = [];
  hires.forEach((hire) => {
    if (hire.status !== 'completed' && hire.status !== 'cancelled') return;
    if (isPastRetention(hire.eventDate, retentionConfig.retentionMonths, today)) {
      expired.push(hire);
    }
  });
  if (expired.length === 0) return;
  expired.forEach((hire) => {
    tombstones.set(hire.id, tombstoneFor(hire, today));
    hires.delete(hire.id);
  });
  deletedCount += expired.length;
  const noun = expired.length === 1 ? 'record' : 'records';
  auditLog.unshift({
    type: 'deletion',
    actor: 'System',
    role: 'Automated retention sweep',
    timestamp: nowTimestamp(),
    description: `permanently deleted ${expired.length} completed/cancelled hire ${noun} that exceeded the ${retentionConfig.retentionMonths}-month retention period`,
  });
}

function listHires(now) {
  sweep(now);
  return Array.from(hires.values());
}

function getHireDetail(id, now) {
  sweep(now);
  if (hires.has(id)) {
    return { found: true, expired: false, hire: hires.get(id) };
  }
  if (tombstones.has(id)) {
    return { found: true, expired: true, tombstone: tombstones.get(id) };
  }
  return { found: false };
}

function getRetentionSettings() {
  return { ...retentionConfig, hiddenCount: deletedCount };
}

function updateRetentionSettings(newMonths, actor, role, now) {
  if (!canManageRetention(role)) {
    auditLog.unshift({
      type: 'denied',
      actor,
      role,
      timestamp: nowTimestamp(),
      description: 'attempted to change the retention period — request denied (tenant administrator role required)',
    });
    throw new PermissionError('forbidden');
  }

  if (!Number.isFinite(newMonths) || newMonths < 1 || newMonths > 60) {
    throw new ValidationError('validation_error');
  }

  if (newMonths === retentionConfig.retentionMonths) {
    return getRetentionSettings();
  }

  const previousMonths = retentionConfig.retentionMonths;
  retentionConfig = { retentionMonths: newMonths, isCustomized: true };
  auditLog.unshift({
    type: 'config',
    actor,
    role,
    timestamp: nowTimestamp(),
    description: `changed the retention period from ${previousMonths} months to ${newMonths} months`,
  });
  sweep(now);
  return getRetentionSettings();
}

function listAuditLog(type) {
  if (!type || type === 'all') return auditLog.slice();
  return auditLog.filter((entry) => entry.type === type);
}

seedHire({ id: 'hire-101', worker: 'Maria Gonzalez', role: 'Banquet Server', client: 'Grand Plaza Hotel', status: 'active', shiftDate: '2026-10-02' });
seedHire({ id: 'hire-102', worker: 'David Chen', role: 'Warehouse Associate', client: 'Riverside Distribution Center', status: 'completed', eventDate: '2026-08-15', metrics: { timeToFill: '2.4 days', timeToOnboard: '18 hrs', shiftCompletion: '100%', clientRating: '4.9 / 5' } });
seedHire({ id: 'hire-103', worker: 'Aisha Bello', role: 'Event Staff', client: 'Lakeside Convention Center', status: 'cancelled', eventDate: '2026-06-02', metrics: {} });
seedHire({ id: 'hire-104', worker: 'Tom Walker', role: 'Banquet Server', client: 'Grand Plaza Hotel', status: 'completed', eventDate: '2025-11-20', metrics: { timeToFill: '3.1 days', timeToOnboard: '20 hrs', shiftCompletion: '100%', clientRating: '4.7 / 5' } });

module.exports = {
  PermissionError,
  ValidationError,
  seedHire,
  listHires,
  getHireDetail,
  getRetentionSettings,
  updateRetentionSettings,
  listAuditLog,
  canManageRetention,
};
