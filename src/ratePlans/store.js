const crypto = require('crypto');

const ratePlans = new Map();

let lastTimestampMs = 0;

function monotonicIsoNow() {
  const ms = Math.max(Date.now(), lastTimestampMs + 1);
  lastTimestampMs = ms;
  return new Date(ms).toISOString();
}

const ROOM_TYPES = [
  { code: 'STD-KING', name: 'Standard King', baseRate: 129 },
  { code: 'GARDEN', name: 'Garden Room', baseRate: 149 },
  { code: 'OCEAN', name: 'Ocean View Suite', baseRate: 189 },
  { code: 'POOLSIDE', name: 'Poolside Cabana Suite', baseRate: 219 },
];

class RatePlanValidationError extends Error {
  constructor(message) {
    super(message);
    this.statusCode = 400;
  }
}

function baseRateOf(roomType) {
  const rt = ROOM_TYPES.find((r) => r.code === roomType);
  return rt ? rt.baseRate : undefined;
}

function assertValidPlan(data) {
  if (!data.name || !String(data.name).trim()) {
    throw new RatePlanValidationError('name is required');
  }
  if (!data.startDate || !data.endDate) {
    throw new RatePlanValidationError('startDate and endDate are required');
  }
  if (data.endDate < data.startDate) {
    throw new RatePlanValidationError('endDate must be on or after startDate');
  }
  if (!Array.isArray(data.prices) || data.prices.length === 0) {
    throw new RatePlanValidationError('at least one per-room-type price is required');
  }
  const seen = new Set();
  data.prices.forEach((p) => {
    if (!p || !ROOM_TYPES.some((rt) => rt.code === p.roomType)) {
      throw new RatePlanValidationError(`unknown room type: ${p && p.roomType}`);
    }
    if (seen.has(p.roomType)) {
      throw new RatePlanValidationError(`room type ${p.roomType} appears more than once in this plan`);
    }
    seen.add(p.roomType);
    if (!(typeof p.price === 'number' && p.price > 0)) {
      throw new RatePlanValidationError(`price for ${p.roomType} must be a number greater than 0`);
    }
  });
}

function createRatePlan(data) {
  assertValidPlan(data);

  const iso = monotonicIsoNow();
  const plan = {
    id: crypto.randomUUID(),
    name: data.name,
    startDate: data.startDate,
    endDate: data.endDate,
    prices: data.prices.map((p) => ({ roomType: p.roomType, price: p.price })),
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

  plan.name = merged.name;
  plan.startDate = merged.startDate;
  plan.endDate = merged.endDate;
  plan.prices = merged.prices.map((p) => ({ roomType: p.roomType, price: p.price }));
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
  const candidates = listRatePlans().filter((p) =>
    p.prices.some((pr) => pr.roomType === roomType) && dateStr >= p.startDate && dateStr <= p.endDate);

  if (candidates.length === 0) {
    return { source: 'base', roomType, price: baseRateOf(roomType) };
  }

  candidates.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const winner = candidates[0];
  const price = winner.prices.find((pr) => pr.roomType === roomType).price;
  return { source: 'plan', roomType, price, plan: winner, overlapping: candidates.slice(1) };
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
};
