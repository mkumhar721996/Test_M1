const ASSIGNED_STATUSES = ['Assigned', 'Accepted', 'In Progress'];

// Completed / In Progress jobs cannot be (re)assigned; technician availability is not a factor.
const ASSIGNABLE_STATUSES = ['Assigned', 'Accepted'];

const jobs = new Map();

function seed(job) {
  jobs.set(job.id, { technicianId: 'marcus-webb', serviceCategory: null, photos: [], ...job });
}

seed({
  id: 'JOB-5021', customerName: 'Dana Whitfield', address: '142 Birchwood Ln, Unit 2, Rosedale',
  scheduledStart: '2026-10-08T08:00:00', scheduledEnd: '2026-10-08T09:00:00',
  problemDescription: 'Kitchen faucet has been dripping steadily for about a week, even with the handle fully off.',
  serviceCategory: 'Plumbing', status: 'Accepted',
  photos: [
    { id: 'JOB-5021-1', caption: 'Faucet handle', url: '/photos/JOB-5021-1.jpg' },
    { id: 'JOB-5021-2', caption: 'Pooling water under sink', url: '/photos/JOB-5021-2.jpg' },
  ],
});
seed({
  id: 'JOB-5022', customerName: 'Oscar Reyes', address: '88 Fenwick Ct, Apt 3, Millbrook',
  scheduledStart: '2026-10-08T09:15:00', scheduledEnd: '2026-10-08T10:15:00',
  problemDescription: 'Furnace turns on but only blows cold air. Thermostat is set to 70 and hasn\'t changed in two days.',
  serviceCategory: null, status: 'Assigned',
  photos: [{ id: 'JOB-5022-1', caption: 'Thermostat display', url: '/photos/JOB-5022-1.jpg' }],
});
seed({
  id: 'JOB-5023', customerName: 'Priya Chandran', address: '560 Maple Grove Dr, Rosedale',
  scheduledStart: '2026-10-08T10:30:00', scheduledEnd: '2026-10-08T11:30:00',
  problemDescription: 'Kitchen circuit breaker trips every time the microwave and toaster run at the same time.',
  serviceCategory: 'Electrical', status: 'In Progress', photos: [],
});
seed({
  id: 'JOB-5024', customerName: 'Leonard Buck', address: '19 Harrow St, Millbrook',
  scheduledStart: '2026-10-08T12:00:00', scheduledEnd: '2026-10-08T13:00:00',
  problemDescription: 'No hot water anywhere in the house since yesterday morning. The pilot light appears to be lit.',
  serviceCategory: 'Plumbing', status: 'Assigned',
  photos: [
    { id: 'JOB-5024-1', caption: 'Water heater pilot light', url: '/photos/JOB-5024-1.jpg' },
    { id: 'JOB-5024-2', caption: 'Water heater model label', url: '/photos/JOB-5024-2.jpg' },
    { id: 'JOB-5024-3', caption: 'Utility closet', url: '/photos/JOB-5024-3.jpg' },
  ],
});
seed({
  id: 'JOB-5025', customerName: 'The Nguyen Family', address: '2201 Westfall Rd, Rosedale',
  scheduledStart: '2026-10-08T13:30:00', scheduledEnd: '2026-10-08T14:30:00',
  problemDescription: 'Air conditioner makes a loud rattling noise whenever it cycles on, especially in the afternoon heat.',
  serviceCategory: 'HVAC', status: 'Accepted',
  photos: [{ id: 'JOB-5025-1', caption: 'Outdoor AC unit', url: '/photos/JOB-5025-1.jpg' }],
});
seed({
  id: 'JOB-5026', customerName: 'Grace Kim', address: '77 Alder Ave, Unit B, Millbrook',
  scheduledStart: '2026-10-08T15:00:00', scheduledEnd: '2026-10-08T16:00:00',
  problemDescription: 'Garbage disposal hums but won\'t spin — it\'s been jammed since this morning.',
  serviceCategory: null, status: 'Assigned', photos: [],
});

// Filtering fixtures: another technician's job, and this technician's already-completed job.
seed({
  id: 'JOB-9001', technicianId: 'dana-cole', customerName: 'Sam Ortiz', address: '5 Elm St, Rosedale',
  scheduledStart: '2026-10-08T08:30:00', scheduledEnd: '2026-10-08T09:30:00',
  problemDescription: 'Clogged drain.', serviceCategory: 'Plumbing', status: 'Assigned',
});
seed({
  id: 'JOB-9002', customerName: 'Ines Park', address: '9 Oak Ave, Millbrook',
  scheduledStart: '2026-10-08T07:00:00', scheduledEnd: '2026-10-08T08:00:00',
  problemDescription: 'Loose outlet.', serviceCategory: 'Electrical', status: 'Completed',
});

function listAssignedJobs(technicianId) {
  return Array.from(jobs.values())
    .filter((j) => j.technicianId === technicianId && ASSIGNED_STATUSES.includes(j.status))
    .sort((a, b) => new Date(a.scheduledStart) - new Date(b.scheduledStart));
}

// Deliberately no availability check: a dispatcher may assign to an unavailable technician.
function assignJob(id, technicianId) {
  const job = jobs.get(id);
  if (!job) return undefined;
  if (!ASSIGNABLE_STATUSES.includes(job.status)) return { conflict: true, job };
  job.technicianId = technicianId;
  job.status = 'Assigned';
  return job;
}

module.exports = { listAssignedJobs, assignJob };
