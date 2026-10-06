function pickFields(body, allowedFields) {
  return allowedFields.reduce((changes, field) => {
    if (field in body) changes[field] = body[field];
    return changes;
  }, {});
}

module.exports = { pickFields };
