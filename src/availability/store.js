const availability = new Map();

// Seeded for the technicians already seeded in src/jobs/store.js.
['marcus-webb', 'dana-cole'].forEach((technicianId) => {
  availability.set(technicianId, { technicianId, available: true, updatedAt: null });
});

// A technician who has never set a status is available.
function getAvailability(technicianId) {
  return availability.get(technicianId) || { technicianId, available: true, updatedAt: null };
}

function setAvailability(technicianId, available) {
  const record = { technicianId, available, updatedAt: new Date().toISOString() };
  availability.set(technicianId, record);
  return record;
}

function listAvailability() {
  return Array.from(availability.values());
}

module.exports = { getAvailability, setAvailability, listAvailability };
