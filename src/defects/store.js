class DefectValidationError extends Error {
  constructor(message, fields = {}) {
    super(message);
    this.statusCode = 400;
    this.fields = fields;
  }
}

const defects = new Map();
let nextDefectNumber = 1043;

function createDefect(data = {}) {
  const title = (data.title || '').trim();
  if (!title) {
    throw new DefectValidationError('validation_error', { title: 'Add a title before submitting.' });
  }
  const defect = {
    id: `DEF-${nextDefectNumber++}`,
    title,
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
