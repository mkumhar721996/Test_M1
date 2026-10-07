class DefectValidationError extends Error {
  constructor(message, fields = {}) {
    super(message);
    this.statusCode = 400;
    this.fields = fields;
  }
}

const defects = new Map();
let nextDefectNumber = 1043;

const SEVERITIES = ['', 'Low', 'Medium', 'High', 'Critical'];
const TEXT_FIELDS = ['description', 'steps', 'environment'];

function createDefect(data = {}) {
  const fields = {};
  const isMissing = (v) => v === undefined || v === null;

  for (const key of ['title', ...TEXT_FIELDS, 'reportedBy']) {
    if (!isMissing(data[key]) && typeof data[key] !== 'string') {
      fields[key] = 'Must be text.';
    }
  }
  if (!isMissing(data.severity) && !SEVERITIES.includes(data.severity)) {
    fields.severity = 'Choose Low, Medium, High or Critical.';
  }
  if (!fields.title && !(data.title || '').trim()) {
    fields.title = 'Add a title before submitting.';
  }
  if (Object.keys(fields).length > 0) {
    throw new DefectValidationError('validation_error', fields);
  }

  const defect = {
    id: `DEF-${nextDefectNumber++}`,
    title: data.title.trim(),
    description: (data.description || '').trim(),
    steps: (data.steps || '').trim(),
    environment: (data.environment || '').trim(),
    severity: data.severity || '',
    status: 'New',
    reportedBy: data.reportedBy || '',
    reportedAt: new Date().toISOString().slice(0, 10),
  };
  defects.set(defect.id, defect);
  return defect;
}

function getDefect(id) {
  return defects.get(id) || null;
}

function listDefects() {
  return Array.from(defects.values()).reverse();
}

module.exports = { DefectValidationError, createDefect, getDefect, listDefects };
