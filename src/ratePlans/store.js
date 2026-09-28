const crypto = require('crypto');
const { getRoomType } = require('../roomTypes/store');

const ratePlans = new Map();
let seqCounter = 0;

class RatePlanValidationError extends Error {
  constructor(message) {
    super(message);
    this.statusCode = 400;
  }
}

function parseDate(dateStr) {
  return new Date(`${dateStr}T00:00:00Z`);
}

function dateInRange(dateStr, startDate, endDate) {
  const d = parseDate(dateStr);
  return d >= parseDate(startDate) && d <= parseDate(endDate);
}

function assertValidPlan(name, startDate, endDate, prices) {
  if (!name) {
    throw new RatePlanValidationError('name is required');
  }
  if (!startDate || !endDate) {
    throw new RatePlanValidationError('start and end dates are required');
  }
  if (parseDate(endDate) < parseDate(startDate)) {
    throw new RatePlanValidationError('end date must be on or after the start date');
  }
  if (!prices || Object.keys(prices).length === 0) {
    throw new RatePlanValidationError('at least one room type price is required');
  }
  Object.keys(prices).forEach((roomTypeId) => {
    if (!getRoomType(roomTypeId)) {
      throw new RatePlanValidationError(`unknown room type: ${roomTypeId}`);
    }
  });
}

function toPublicPlan(plan) {
  const { _seq, ...publicPlan } = plan;
  return { ...publicPlan, prices: { ...plan.prices } };
}

function createRatePlan(data, actor) {
  const name = data.name || '';
  const startDate = data.startDate;
  const endDate = data.endDate;
  const prices = data.prices || {};
  assertValidPlan(name, startDate, endDate, prices);

  const iso = new Date().toISOString();
  seqCounter += 1;
  const plan = {
    id: crypto.randomUUID(),
    name,
    startDate,
    endDate,
    prices: { ...prices },
    createdAt: iso,
    updatedAt: iso,
    createdBy: actor,
    _seq: seqCounter,
  };

  ratePlans.set(plan.id, plan);
  return toPublicPlan(plan);
}

function getRatePlan(id) {
  const plan = ratePlans.get(id);
  return plan ? toPublicPlan(plan) : undefined;
}

function listRatePlans() {
  return Array.from(ratePlans.values()).map(toPublicPlan);
}

function updateRatePlan(id, changes, actor) {
  const plan = ratePlans.get(id);
  if (!plan) return undefined;

  const nextName = 'name' in changes ? changes.name : plan.name;
  const nextStart = 'startDate' in changes ? changes.startDate : plan.startDate;
  const nextEnd = 'endDate' in changes ? changes.endDate : plan.endDate;
  const nextPrices = 'prices' in changes ? changes.prices : plan.prices;
  assertValidPlan(nextName, nextStart, nextEnd, nextPrices);

  plan.name = nextName;
  plan.startDate = nextStart;
  plan.endDate = nextEnd;
  plan.prices = { ...nextPrices };
  plan.updatedAt = new Date().toISOString();
  plan.updatedBy = actor;

  return toPublicPlan(plan);
}

function deleteRatePlan(id) {
  return ratePlans.delete(id);
}

function allRatePlansInternal() {
  return Array.from(ratePlans.values());
}

function resolveRate(roomTypeId, dateStr) {
  const roomType = getRoomType(roomTypeId);
  if (!roomType) {
    throw new RatePlanValidationError(`unknown room type: ${roomTypeId}`);
  }
  if (!dateStr) {
    throw new RatePlanValidationError('date is required');
  }

  const matches = allRatePlansInternal()
    .filter((p) => p.prices[roomTypeId] !== undefined && dateInRange(dateStr, p.startDate, p.endDate))
    .sort((a, b) => b._seq - a._seq);

  if (matches.length === 0) {
    return {
      price: roomType.baseRate,
      source: 'base',
      ratePlanId: null,
      overlapping: false,
      otherRatePlanIds: [],
    };
  }

  return {
    price: matches[0].prices[roomTypeId],
    source: 'rate_plan',
    ratePlanId: matches[0].id,
    overlapping: matches.length > 1,
    otherRatePlanIds: matches.slice(1).map((p) => p.id),
  };
}

module.exports = {
  RatePlanValidationError,
  createRatePlan,
  getRatePlan,
  listRatePlans,
  updateRatePlan,
  deleteRatePlan,
  resolveRate,
};
