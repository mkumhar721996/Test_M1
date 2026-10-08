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

module.exports = { RepairRequestValidationError, createRequest, listRequests, getRequest };
