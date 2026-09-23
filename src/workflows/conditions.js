function valuesOf(condition) {
  return condition.operator === 'in' ? condition.value : [condition.value];
}

function conditionsOverlap(a, b) {
  if (a.attribute !== b.attribute) return false;
  return valuesOf(a).some((v) => valuesOf(b).includes(v));
}

function evaluateCondition(condition, hireAttributes, schema) {
  const { attribute } = condition;
  const value = hireAttributes[attribute];
  if (schema.includes(attribute) && (value === undefined || value === null)) {
    return 'missing';
  }
  return valuesOf(condition).includes(value) ? 'match' : 'no-match';
}

module.exports = { conditionsOverlap, evaluateCondition };
