/** @jest-environment jsdom */
const fs = require('fs');
const path = require('path');

const HTML_PATH = path.join(__dirname, '..', 'public', 'hires-list.html');

function fixtureHires() {
  return [
    {
      id: 'hire_2031',
      name: 'Jordan Reyes',
      email: 'jordan.reyes@example.com',
      phone: '(312) 555-0148',
      startDate: '2026-10-05',
      department: 'Engineering',
      role: 'Software Engineer II',
      hireStage: 'draft',
      profileStatus: 'active',
    },
  ];
}

function fillForm(doc, overrides) {
  const data = {
    name: 'Alex Morgan',
    email: 'jordan.reyes@example.com',
    phone: '(773) 555-0261',
    department: 'Engineering',
    role: 'Senior Software Engineer',
    startDate: '2026-11-02',
    ...overrides,
  };
  doc.getElementById('f-name').value = data.name;
  doc.getElementById('f-email').value = data.email;
  doc.getElementById('f-phone').value = data.phone;
  doc.getElementById('f-department').value = data.department;
  doc.getElementById('f-role').value = data.role;
  doc.getElementById('f-start-date').value = data.startDate;
  return data;
}

describe('Duplicate Guest Detection & Linking', () => {
  beforeEach(() => {
    jest.resetModules();
    document.documentElement.innerHTML = fs.readFileSync(HTML_PATH, 'utf8');
  });

  test('AC2/AC3: linking to a surfaced duplicate creates no new profile and designates the existing one as the record to use', async () => {
    const createHire = jest.fn();
    const existingProfile = fixtureHires()[0];
    const checkDuplicates = jest.fn(() => Promise.resolve([{ profile: existingProfile, reasons: ['email'] }]));
    const api = { checkDuplicates, createHire };
    const { initHiresListApp } = require('../public/js/hires-list');
    initHiresListApp(document, fixtureHires(), api);

    const rowsBefore = document.querySelectorAll('#profiles-tbody tr').length;

    document.getElementById('add-hire-btn').click();
    fillForm(document);
    document.getElementById('create-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await Promise.resolve();
    await Promise.resolve();

    const linkBtn = document.querySelector('[data-link-id="hire_2031"]');
    expect(linkBtn).toBeTruthy();
    linkBtn.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(createHire).not.toHaveBeenCalled();
    expect(document.querySelectorAll('#profiles-tbody tr').length).toBe(rowsBefore);

    expect(document.getElementById('confirm-title').textContent).toBe("Jordan Reyes’s existing profile is now the record to use.");
    expect(document.getElementById('screen-confirm').hidden).toBe(false);
    expect(document.getElementById('create-modal').hidden).toBe(true);
  });

  test('AC4/AC5: proceeding anyway creates a new profile and fully dismisses the duplicate warning', async () => {
    const created = { id: 'hire_new1', name: 'Alex Morgan', email: 'jordan.reyes@example.com', phone: '(773) 555-0261', department: 'Engineering', role: 'Senior Software Engineer', startDate: '2026-11-02', profileStatus: 'active' };
    const createHire = jest.fn(() => Promise.resolve(created));
    const existingProfile = fixtureHires()[0];
    const checkDuplicates = jest.fn(() => Promise.resolve([{ profile: existingProfile, reasons: ['email'] }]));
    const api = { checkDuplicates, createHire };
    const { initHiresListApp } = require('../public/js/hires-list');
    initHiresListApp(document, fixtureHires(), api);

    document.getElementById('add-hire-btn').click();
    fillForm(document);
    document.getElementById('create-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await Promise.resolve();
    await Promise.resolve();

    expect(document.getElementById('step-duplicates').hidden).toBe(false);

    document.getElementById('dup-proceed-btn').click();
    document.getElementById('dup-proceed-confirm-btn').click();
    await Promise.resolve();
    await Promise.resolve();

    expect(createHire).toHaveBeenCalledWith(expect.objectContaining({ name: 'Alex Morgan', email: 'jordan.reyes@example.com' }));
    expect(document.getElementById('create-modal').hidden).toBe(true);
    expect(document.getElementById('step-duplicates').hidden).toBe(true);
  });

  test('AC6/AC7: no matching profiles means no warning is shown and the profile is created normally', async () => {
    const created = { id: 'hire_new2', name: 'Priya Natarajan', email: 'priya.natarajan@example.com', phone: '(512) 555-0177', department: 'Marketing', role: 'Marketing Specialist', startDate: '2026-11-20', profileStatus: 'active' };
    const createHire = jest.fn(() => Promise.resolve(created));
    const checkDuplicates = jest.fn(() => Promise.resolve([]));
    const api = { checkDuplicates, createHire };
    const { initHiresListApp } = require('../public/js/hires-list');
    initHiresListApp(document, fixtureHires(), api);

    document.getElementById('add-hire-btn').click();
    fillForm(document, { name: 'Priya Natarajan', email: 'priya.natarajan@example.com', phone: '(512) 555-0177', department: 'Marketing', role: 'Marketing Specialist', startDate: '2026-11-20' });
    document.getElementById('create-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await Promise.resolve();
    await Promise.resolve();

    expect(createHire).toHaveBeenCalledTimes(1);
    expect(document.getElementById('step-duplicates').hidden).toBe(true);
    expect(document.querySelector('#profiles-tbody').textContent).toContain('Priya Natarajan');
  });
});
