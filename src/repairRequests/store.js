const { getCategory, getTimeWindow } = require('../serviceCatalog/store');

class RepairRequestLockedError extends Error {
  constructor(record) {
    super('locked');
    this.statusCode = 409;
    this.record = record;
  }
}

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

function validateRequestFields(data) {
  const fields = {};
  if (!getCategory(data.categoryId)) fields.categoryId = 'Choose a service category.';
  if (!text(data.description)) fields.description = 'Describe the problem so the technician knows what to expect.';
  if (!text(data.preferredDate) || !getTimeWindow(data.timeWindowId)) fields.timeWindow = 'Choose a date and a preferred time window.';
  const address = data.address && typeof data.address === 'object' ? data.address : {};
  if (!text(address.street) || !text(address.city) || !text(address.state) || !text(address.zip)) {
    fields.address = 'Enter the street address, city, state, and ZIP code.';
  }
  return fields;
}

function createRequest(data = {}) {
  const fields = validateRequestFields(data);
  if (Object.keys(fields).length > 0) throw new RepairRequestValidationError(fields);
  const category = getCategory(data.categoryId);
  const description = text(data.description);
  const preferredDate = text(data.preferredDate);
  const timeWindow = getTimeWindow(data.timeWindowId);
  const address = data.address;
  const street = text(address.street);
  const unit = text(address.unit);
  const city = text(address.city);
  const state = text(address.state);
  const zip = text(address.zip);

  const photos = Array.isArray(data.photos)
    ? data.photos.map((p) => ({ name: text(p && p.name) }))
    : [];
  const record = {
    id: `REQ-${nextRequestNumber++}`,
    customerId: typeof data.customerId === 'string' ? data.customerId : '',
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

// "Doesn't exist" and "exists but isn't yours" are deliberately indistinguishable (both null).
function findOwned(id, customerId) {
  const r = requests.get(id);
  return r && r.customerId === customerId ? r : null;
}

function listMine(customerId) {
  return Array.from(requests.values())
    .filter((r) => r.customerId === customerId)
    .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
}

function cancelRequest(id, customerId) {
  const r = findOwned(id, customerId);
  if (!r) return null;
  if (r.status !== 'Pending') throw new RepairRequestLockedError(r);
  r.status = 'Cancelled';
  r.cancelledAt = new Date().toISOString();
  return r;
}

// Deliberately leaves categoryDetails and photos untouched: the edit screen has no fields for them.
function updateRequestDetails(id, customerId, data = {}) {
  const r = findOwned(id, customerId);
  if (!r) return null;
  if (r.status !== 'Pending') throw new RepairRequestLockedError(r);
  const fields = validateRequestFields(data);
  if (Object.keys(fields).length > 0) throw new RepairRequestValidationError(fields);
  const category = getCategory(data.categoryId);
  const timeWindow = getTimeWindow(data.timeWindowId);
  r.categoryId = category.id;
  r.categoryName = category.name;
  r.description = text(data.description);
  r.preferredDate = text(data.preferredDate);
  r.timeWindowId = timeWindow.id;
  r.timeWindowLabel = timeWindow.label;
  r.staffed = timeWindow.staffed;
  r.address = {
    street: text(data.address.street),
    unit: text(data.address.unit),
    city: text(data.address.city),
    state: text(data.address.state),
    zip: text(data.address.zip),
  };
  return r;
}

module.exports = {
  RepairRequestValidationError, RepairRequestLockedError, createRequest, listRequests, getRequest,
  findOwned, listMine, cancelRequest, updateRequestDetails,
};
