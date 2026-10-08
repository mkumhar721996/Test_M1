const crypto = require('crypto');
const { getEmployee } = require('../employees/store');
const {
  LEAVE_TYPES, getBalances, consumeBalance, restoreBalance,
} = require('./store');

const requests = new Map();

class TimeOffRequestError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
  }
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(value) {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false;
  const parsed = new Date(value);
  // Round-trip so impossible calendar dates (e.g. 2026-02-31) don't roll over silently.
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function createRequest({
  employeeId, leaveTypeId, start, end,
} = {}) {
  if (!getEmployee(employeeId)) {
    throw new TimeOffRequestError('employee not found or has not completed onboarding', 404);
  }
  if (!LEAVE_TYPES.some((t) => t.id === leaveTypeId)) {
    throw new TimeOffRequestError('enter a valid leave type', 400);
  }
  if (!isValidDate(start) || !isValidDate(end)) {
    throw new TimeOffRequestError('enter a valid start and end date', 400);
  }
  if (end < start) throw new TimeOffRequestError("end date can't be before the start date", 400);
  const record = {
    id: crypto.randomUUID(),
    employeeId,
    leaveTypeId,
    start,
    end,
    days: Math.round((Date.parse(end) - Date.parse(start)) / 86400000) + 1,
    status: 'pending',
    consumedDays: 0,
    createdAt: new Date().toISOString(),
  };
  requests.set(record.id, record);
  return record;
}

function getRequest(id) {
  return requests.get(id);
}

function listRequests(employeeId) {
  const all = Array.from(requests.values());
  return employeeId ? all.filter((r) => r.employeeId === employeeId) : all;
}

function requireRequest(id) {
  const record = requests.get(id);
  if (!record) throw new TimeOffRequestError('time-off request not found', 404);
  return record;
}

// No route calls this yet: it constructs the "approved, balance consumed" state for AC3.
function approveRequest(id) {
  const record = requireRequest(id);
  if (record.status !== 'pending') throw new TimeOffRequestError('only a pending request can be approved', 409);
  if (!getBalances(record.employeeId)) {
    throw new TimeOffRequestError('no starting balance exists for this employee', 409);
  }
  consumeBalance(record.employeeId, record.leaveTypeId, record.days);
  record.status = 'approved';
  record.consumedDays = record.days;
  return record;
}

function cancelRequest(id) {
  const record = requireRequest(id);
  if (record.status === 'cancelled') throw new TimeOffRequestError('this request is already cancelled', 409);
  if (record.status === 'approved' && record.consumedDays > 0) {
    restoreBalance(record.employeeId, record.leaveTypeId, record.consumedDays);
  }
  record.status = 'cancelled';
  record.consumedDays = 0;
  return record;
}

module.exports = {
  TimeOffRequestError, createRequest, getRequest, listRequests, approveRequest, cancelRequest,
};
