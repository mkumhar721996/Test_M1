const crypto = require('crypto');

let ratePlans = new Map();

const ROOM_TYPES = [
  { code: 'STD-KING', name: 'Standard King', baseRate: 129 },
  { code: 'GARDEN', name: 'Garden Room', baseRate: 149 },
  { code: 'OCEAN', name: 'Ocean View Suite', baseRate: 189 },
  { code: 'POOLSIDE', name: 'Poolside Cabana Suite', baseRate: 219 },
];

class RatePlanValidationError extends Error {
  constructor(message, fields = {}) {
    super(message);
    this.statusCode = 400;
    this.fields = fields;
  }
}

function roomTypeCodes() {
  return ROOM_TYPES.map((rt) => rt.code);
}

function baseRateOf(roomType) {
  const rt = ROOM_TYPES.find((r) => r.code === roomType);
  return rt ? rt.baseRate : undefined;
}

function assertValidPlan(data) {
  const fields = {};

  const name = (data.name || '').trim();
  if (!name) {
    fields.name = 'Enter a name for this rate plan.';
  }

  const startDate = data.startDate || '';
  const endDate = data.endDate || '';
  if (!startDate || !endDate || endDate < startDate) {
    fields.dates = 'Enter a start and end date, and make sure the end date is on or after the start date.';
  }

  const prices = Array.isArray(data.prices) ? data.prices : [];
  const seen = new Set();
  let pricesValid = prices.length > 0;
  prices.forEach((p) => {
    const roomType = p && p.roomType;
    const price = p && Number(p.price);
    if (!roomType || !roomTypeCodes().includes(roomType)) pricesValid = false;
    if (!(price > 0)) pricesValid = false;
    if (roomType) {
      if (seen.has(roomType)) pricesValid = false;
      seen.add(roomType);
    }
  });
  if (!pricesValid) {
    fields.prices = 'Add at least one room type with a known room type selected and a price greater than $0. Each room type can only appear once.';
  }

  if (Object.keys(fields).length > 0) {
    throw new RatePlanValidationError('validation_error', fields);
  }
}

function createRatePlan(data) {
  assertValidPlan(data);

  const iso = new Date().toISOString();
  const plan = {
    id: crypto.randomUUID(),
    name: data.name.trim(),
    startDate: data.startDate,
    endDate: data.endDate,
    prices: data.prices.map((p) => ({ roomType: p.roomType, price: Number(p.price) })),
    createdAt: iso,
    updatedAt: iso,
  };

  ratePlans.set(plan.id, plan);
  return plan;
}

function getRatePlan(id) {
  return ratePlans.get(id);
}

function listRatePlans() {
  return Array.from(ratePlans.values());
}

function updateRatePlan(id, changes) {
  const plan = ratePlans.get(id);
  if (!plan) return undefined;

  const merged = {
    name: 'name' in changes ? changes.name : plan.name,
    startDate: 'startDate' in changes ? changes.startDate : plan.startDate,
    endDate: 'endDate' in changes ? changes.endDate : plan.endDate,
    prices: 'prices' in changes ? changes.prices : plan.prices,
  };
  assertValidPlan(merged);

  plan.name = merged.name.trim();
  plan.startDate = merged.startDate;
  plan.endDate = merged.endDate;
  plan.prices = merged.prices.map((p) => ({ roomType: p.roomType, price: Number(p.price) }));
  plan.updatedAt = new Date().toISOString();
  return plan;
}

function deleteRatePlan(id) {
  return ratePlans.delete(id);
}

function listRoomTypes() {
  return ROOM_TYPES;
}

function resolvePrice(roomType, dateStr) {
  const all = listRatePlans();
  const candidates = all.filter((plan) =>
    plan.prices.some((p) => p.roomType === roomType) &&
    dateStr >= plan.startDate && dateStr <= plan.endDate
  );

  if (candidates.length === 0) {
    return { source: 'base', roomType, price: baseRateOf(roomType) };
  }

  // Map insertion order tracks creation order exactly, so it breaks ties when two plans
  // share a createdAt millisecond (createdAt alone isn't precise enough to stay deterministic).
  const insertionIndex = new Map(all.map((p, i) => [p.id, i]));
  candidates.sort((a, b) => {
    const byCreatedAt = new Date(b.createdAt) - new Date(a.createdAt);
    if (byCreatedAt !== 0) return byCreatedAt;
    return insertionIndex.get(b.id) - insertionIndex.get(a.id);
  });
  const winner = candidates[0];
  const price = winner.prices.find((p) => p.roomType === roomType).price;
  return { source: 'plan', roomType, price, plan: winner, overlapping: candidates.slice(1) };
}

function resetRatePlansStore() {
  ratePlans = new Map();
}

module.exports = {
  RatePlanValidationError,
  createRatePlan,
  getRatePlan,
  listRatePlans,
  updateRatePlan,
  deleteRatePlan,
  listRoomTypes,
  resolvePrice,
  resetRatePlansStore,
};
