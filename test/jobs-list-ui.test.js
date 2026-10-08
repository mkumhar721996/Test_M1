/** @jest-environment jsdom */
const fs = require('fs');
const path = require('path');

const HTML_PATH = path.join(__dirname, '..', 'public', 'jobs.html');

let initJobsApp;
beforeEach(() => {
  document.documentElement.innerHTML = fs.readFileSync(HTML_PATH, 'utf8');
  jest.resetModules();
  ({ initJobsApp } = require('../public/js/jobs'));
});

const flush = async () => { for (let i = 0; i < 8; i += 1) await Promise.resolve(); };
const baseJob = {
  id: 'JOB-1', customerName: 'Dana Whitfield', address: '142 Birchwood Ln, Rosedale',
  scheduledStart: '2026-10-08T08:00:00', scheduledEnd: '2026-10-08T09:00:00',
  problemDescription: 'Dripping faucet.', serviceCategory: 'Plumbing', status: 'Accepted', photos: [],
};

test('AC2: a job card shows customer name, address, time window, problem description and photos', async () => {
  const job = { ...baseJob, problemDescription: 'Kitchen faucet has been dripping steadily for about a week.',
    photos: [{ id: 'p1', caption: 'Faucet handle', url: 'https://example.test/p1.jpg' }] };
  const api = { list: jest.fn().mockResolvedValue([job]) };
  initJobsApp(document, api);
  await flush();
  const card = document.querySelector('.job-card');
  expect(card.textContent).toContain('Dana Whitfield');
  expect(card.textContent).toContain('142 Birchwood Ln, Rosedale');
  expect(card.textContent).toContain('Kitchen faucet has been dripping steadily for about a week.');
  expect(card.querySelector('.job-time').textContent).toMatch(/–/);
  expect(card.querySelector('img.photo-thumb').alt).toBe('Customer photo: Faucet handle');
});

test('a job with no photos renders no photo section', async () => {
  initJobsApp(document, { list: jest.fn().mockResolvedValue([baseJob]) });
  await flush();
  expect(document.querySelector('.photo-section')).toBeNull();
});

test('a photo that fails to load is swapped for the broken placeholder', async () => {
  const job = { ...baseJob, photos: [{ id: 'p1', caption: 'Faucet', url: 'https://example.test/p1.jpg' }] };
  initJobsApp(document, { list: jest.fn().mockResolvedValue([job]) });
  await flush();
  document.querySelector('img.photo-thumb').dispatchEvent(new window.Event('error'));
  expect(document.querySelector('img.photo-thumb')).toBeNull();
  expect(document.querySelector('.photo-thumb-broken')).not.toBeNull();
});

test('AC3: the service category is shown when one was captured at booking', async () => {
  const api = { list: jest.fn().mockResolvedValue([{ ...baseJob, serviceCategory: 'Electrical' }]) };
  initJobsApp(document, api);
  await flush();
  expect(document.querySelector('.job-category-row .chip').textContent).toBe('Electrical');
});

test('AC4: no service category is shown when none was captured at booking', async () => {
  const api = { list: jest.fn().mockResolvedValue([{ ...baseJob, serviceCategory: null }]) };
  initJobsApp(document, api);
  await flush();
  expect(document.querySelector('.job-category-row')).toBeNull();
});

test('AC5: at most one job in the list is shown with an In Progress status', async () => {
  const jobs = [
    { ...baseJob, id: 'JOB-1', status: 'Assigned', scheduledStart: '2026-10-08T08:00:00' },
    { ...baseJob, id: 'JOB-2', status: 'Accepted', scheduledStart: '2026-10-08T09:00:00' },
    { ...baseJob, id: 'JOB-3', status: 'In Progress', scheduledStart: '2026-10-08T10:00:00' },
  ];
  initJobsApp(document, { list: jest.fn().mockResolvedValue(jobs) });
  await flush();
  expect(document.querySelectorAll('.job-card').length).toBe(3);
  expect(document.querySelectorAll('.status-chip.status-in-progress').length).toBeLessThanOrEqual(1);
});

test('shows the empty state when the technician has no assigned jobs', async () => {
  initJobsApp(document, { list: jest.fn().mockResolvedValue([]) });
  await flush();
  expect(document.getElementById('job-list-empty').hidden).toBe(false);
});

test('shows the error banner with a retry action when the jobs request fails', async () => {
  initJobsApp(document, { list: jest.fn().mockRejectedValue({ status: 500 }) });
  await flush();
  expect(document.getElementById('list-error').hidden).toBe(false);
});
