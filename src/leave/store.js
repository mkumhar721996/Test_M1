const { getEmployee } = require('../employees/store');

const LEAVE_TYPES = [
  { id: 'annual', name: 'Annual leave', description: 'Planned time off — vacations, personal days, and other pre-scheduled time away.', defaultBalance: 15 },
  { id: 'sick', name: 'Sick leave', description: 'Unplanned time off for illness or a medical appointment, for the employee or an immediate family member.', defaultBalance: 10 },
  { id: 'unpaid', name: 'Unpaid leave', description: 'Time off beyond paid allowances, taken without pay and tracked separately from annual and sick leave.', defaultBalance: 5 },
];

const balancesByEmployee = new Map();

class LeaveBalanceError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
  }
}

function initializeBalances(employeeId, values = {}) {
  if (!getEmployee(employeeId)) {
    throw new LeaveBalanceError('employee not found or has not completed onboarding', 404);
  }
  const safeValues = values && typeof values === 'object' ? values : {};
  const balances = {};
  for (const type of LEAVE_TYPES) {
    const value = safeValues[type.id];
    if (value === undefined || value === null) {
      balances[type.id] = type.defaultBalance;
    } else if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
      balances[type.id] = value;
    } else {
      throw new LeaveBalanceError(`enter a starting balance of 0 or more for ${type.id}`, 400);
    }
  }
  const record = {
    employeeId,
    balances,
    setAt: new Date().toISOString(),
    created: !balancesByEmployee.has(employeeId),
  };
  balancesByEmployee.set(employeeId, record);
  return record;
}

function getBalances(employeeId) {
  return balancesByEmployee.get(employeeId);
}

function getAllBalances() {
  return Array.from(balancesByEmployee.values());
}

module.exports = {
  LEAVE_TYPES, LeaveBalanceError, initializeBalances, getBalances, getAllBalances,
};
