const { getCategory, getTimeWindow } = require('../serviceCatalog/store');

class RepairRequestValidationError extends Error {
  constructor(fields) {
    super('validation_error');
    this.statusCode = 400;
    this.fields = fields;
  }
}

const requests = new Map();
let nextRequestNumber = 1032;

const text = (v) => (typeof v === 'string' ? v.trim() : '');

function createRequest(data = {}) {
  const fields = {};
  const category = getCategory(data.categoryId);
  if (!category) fields.categoryId = 'Choose a service category.';
  const description = text(data.description);
  if (!description) fields.description = 'Describe the problem so the technician knows what to expect.';
  const preferredDate = text(data.preferredDate);
  const timeWindow = getTimeWindow(data.timeWindowId);
  if (!preferredDate || !timeWindow) fields.timeWindow = 'Choose a date and a preferred time window.';
  const address = data.address && typeof data.address === 'object' ? data.address : {};
  const street = text(address.street);
  const unit = text(address.unit);
  const city = text(address.city);
  const state = text(address.state);
  const zip = text(address.zip);
  if (!street || !city || !state || !zip) fields.address = 'Enter the street address, city, state, and ZIP code.';
  if (Object.keys(fields).length > 0) throw new RepairRequestValidationError(fields);

  const photos = Array.isArray(data.photos)
    ? data.photos.map((p) => ({ name: text(p && p.name) }))
    : [];
  const record = {
    id: `REQ-${nextRequestNumber++}`,
    categoryId: category.id,
    categoryName: category.name,
    categoryDetails: data.categoryDetails && typeof data.categoryDetails === 'object' ? data.categoryDetails : {},
    description,
    preferredDate,
    timeWindowId: timeWindow.id,
    timeWindowLabel: timeWindow.label,
    address: { street, unit, city, state, zip },
    photos,
    photoCount: photos.length,
    staffed: timeWindow.staffed,
    status: 'Pending',
    customerId: data.customerId || null,
    technician: null,
    scheduledWindow: null,
    submittedAt: new Date().toISOString(),
  };
  requests.set(record.id, record);
  return record;
}

function listRequests() {
  return Array.from(requests.values()).reverse();
}

function getRequest(id) {
  return requests.get(id) || null;
}

// Internal 'Pending' is shown to customers as 'Submitted'; the other statuses pass through.
const CUSTOMER_STATUS_MAP = {
  Pending: 'Submitted',
  Assigned: 'Assigned',
  'In Progress': 'In Progress',
  Completed: 'Completed',
  Cancelled: 'Cancelled',
};

function toCustomerView(record) {
  return {
    id: record.id,
    category: record.categoryName,
    description: record.description,
    address: record.address,
    submittedAt: record.submittedAt,
    status: CUSTOMER_STATUS_MAP[record.status] || record.status,
    technician: record.technician,
    scheduledWindow: record.scheduledWindow,
    completedAt: record.completedAt || null,
    cancelledAt: record.cancelledAt || null,
    cancelReason: record.cancelReason || null,
  };
}

function listRequestsForCustomer(customerId) {
  return listRequests().filter((r) => r.customerId === customerId).map(toCustomerView);
}

function getRequestForCustomer(id, customerId) {
  const record = getRequest(id);
  return record && record.customerId === customerId ? toCustomerView(record) : null;
}

const SETTABLE_STATUSES = ['Assigned', 'In Progress', 'Completed', 'Cancelled'];

// Hook for Scheduling & Dispatch / Technician Job Management; never reachable by customers.
function updateRequestStatus(id, { status, technician, scheduledWindow, cancelReason } = {}) {
  const record = getRequest(id);
  if (!record) return null;
  if (!SETTABLE_STATUSES.includes(status)) {
    throw new RepairRequestValidationError({ status: `Status must be one of: ${SETTABLE_STATUSES.join(', ')}.` });
  }
  record.status = status;
  if (technician !== undefined) record.technician = technician;
  if (scheduledWindow !== undefined) record.scheduledWindow = scheduledWindow;
  const now = new Date().toISOString();
  if (status === 'Completed') record.completedAt = now;
  if (status === 'Cancelled') {
    record.cancelledAt = now;
    record.cancelReason = cancelReason || null;
  }
  return record;
}

module.exports = {
  RepairRequestValidationError,
  createRequest,
  listRequests,
  getRequest,
  toCustomerView,
  listRequestsForCustomer,
  getRequestForCustomer,
  updateRequestStatus,
};
