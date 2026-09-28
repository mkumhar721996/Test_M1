/** @jest-environment jsdom */
const fs = require('fs');
const path = require('path');

const HTML_PATH = path.join(__dirname, '..', 'public', 'guest-search.html');

describe('Guest Search', () => {
  beforeEach(() => {
    jest.resetModules();
    document.documentElement.innerHTML = fs.readFileSync(HTML_PATH, 'utf8');
  });

  test('empty-query submit shows inline validation and never calls the api', () => {
    const api = { search: jest.fn() };
    const { initGuestSearchApp } = require('../public/js/guest-search');
    initGuestSearchApp(document, api);

    document.getElementById('search-form').dispatchEvent(new Event('submit', { cancelable: true }));

    expect(document.getElementById('empty-query-error').hidden).toBe(false);
    expect(api.search).not.toHaveBeenCalled();
  });

  test('AC1: a partial name search renders one row per matching guest', async () => {
    const api = { search: jest.fn().mockResolvedValue([
      { id: 'guest_1', name: 'Amara Whitfield', email: 'amara.whitfield@example.com', phone: '(415) 555-0142', status: 'active' },
      { id: 'guest_2', name: 'Amara Chen', email: 'amara.chen@example.com', phone: '(206) 555-0110', status: 'active' },
    ]) };
    const { initGuestSearchApp } = require('../public/js/guest-search');
    initGuestSearchApp(document, api);

    document.getElementById('search-query').value = 'Amara';
    document.getElementById('search-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await Promise.resolve();
    await Promise.resolve();

    expect(api.search).toHaveBeenCalledWith('Amara', false);
    expect(document.querySelectorAll('.guest-table tbody tr')).toHaveLength(2);
  });

  test('AC3: a search with no matches shows the "No profiles found" message with the term echoed back', async () => {
    const api = { search: jest.fn().mockResolvedValue([]) };
    const { initGuestSearchApp } = require('../public/js/guest-search');
    initGuestSearchApp(document, api);

    document.getElementById('search-query').value = 'Zzyzx';
    document.getElementById('search-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await Promise.resolve();
    await Promise.resolve();

    expect(document.querySelector('.state-title').textContent).toBe('No profiles found');
    expect(document.querySelector('.state-body').textContent).toContain('Zzyzx');
  });

  test('AC4/AC5: a backend outage shows an "unavailable" message and renders no results table', async () => {
    const api = { search: jest.fn().mockRejectedValue(new Error('down')) };
    const { initGuestSearchApp } = require('../public/js/guest-search');
    initGuestSearchApp(document, api);

    document.getElementById('search-query').value = 'Amara';
    document.getElementById('search-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await Promise.resolve();
    await Promise.resolve();

    expect(document.querySelector('.state-title').textContent).toBe('Search is unavailable');
    expect(document.querySelector('.guest-table')).toBeNull();
  });

  test('AC7/AC8: toggling "include inactive" re-runs the last search with the new flag', async () => {
    const api = { search: jest.fn().mockResolvedValue([]) };
    const { initGuestSearchApp } = require('../public/js/guest-search');
    initGuestSearchApp(document, api);

    document.getElementById('search-query').value = 'Amara';
    document.getElementById('search-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await Promise.resolve();
    await Promise.resolve();

    document.getElementById('include-inactive').checked = true;
    document.getElementById('include-inactive').dispatchEvent(new Event('change'));
    await Promise.resolve();
    await Promise.resolve();

    expect(api.search).toHaveBeenLastCalledWith('Amara', true);
  });

  test('toggling "include inactive" before any search has run does not call the api', () => {
    const api = { search: jest.fn() };
    const { initGuestSearchApp } = require('../public/js/guest-search');
    initGuestSearchApp(document, api);

    document.getElementById('include-inactive').checked = true;
    document.getElementById('include-inactive').dispatchEvent(new Event('change'));

    expect(api.search).not.toHaveBeenCalled();
  });

  test('AC9: each result row shows full name, email, phone, and an active/inactive status chip', async () => {
    const api = { search: jest.fn().mockResolvedValue([
      { id: 'guest_10', name: 'Amara Osei', email: 'amara.osei@example.com', phone: '(404) 555-0151', status: 'inactive' },
    ]) };
    const { initGuestSearchApp } = require('../public/js/guest-search');
    initGuestSearchApp(document, api);

    document.getElementById('search-query').value = 'Amara Osei';
    document.getElementById('search-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await Promise.resolve();
    await Promise.resolve();

    const row = document.querySelector('.guest-table tbody tr');
    expect(row.querySelector('.guest-name').textContent).toBe('Amara Osei');
    expect(row.textContent).toContain('amara.osei@example.com');
    expect(row.textContent).toContain('(404) 555-0151');
    expect(row.querySelector('.status-chip').textContent.trim()).toBe('Inactive');
    expect(row.querySelector('.status-chip').classList.contains('is-active')).toBe(false);
  });
});
