/** @jest-environment jsdom */
const fs = require('fs');
const path = require('path');

const HTML_PATH = path.join(__dirname, '..', 'public', 'guest-search.html');

describe('Guest Search', () => {
  beforeEach(() => {
    jest.resetModules();
    document.documentElement.innerHTML = fs.readFileSync(HTML_PATH, 'utf8');
  });

  test('AC1/AC9: a partial-name search renders matching results with name, email, phone, and status', async () => {
    const api = {
      search: jest.fn().mockResolvedValue([
        { id: 'gst_1', name: 'Amara Whitfield', email: 'amara.whitfield@example.com', phone: '(415) 555-0142', status: 'active' },
      ]),
    };
    const { initGuestSearchApp } = require('../public/js/guest-search');
    initGuestSearchApp(document, api);

    document.getElementById('search-input').value = 'Whit';
    document.getElementById('search-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await Promise.resolve();
    await Promise.resolve();

    expect(api.search).toHaveBeenCalledWith('Whit', false);
    expect(document.getElementById('state-results').hidden).toBe(false);
    const card = document.querySelector('.guest-card');
    expect(card.textContent).toContain('Amara Whitfield');
    expect(card.textContent).toContain('amara.whitfield@example.com');
    expect(card.textContent).toContain('(415) 555-0142');
  });

  test('AC3: no matches shows the empty state, echoing the search term', async () => {
    const api = { search: jest.fn().mockResolvedValue([]) };
    const { initGuestSearchApp } = require('../public/js/guest-search');
    initGuestSearchApp(document, api);

    document.getElementById('search-input').value = 'Zzyzx';
    document.getElementById('search-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await Promise.resolve();
    await Promise.resolve();

    expect(document.getElementById('state-empty').hidden).toBe(false);
    expect(document.getElementById('state-empty-heading').textContent).toBe('No profiles found for "Zzyzx"');
  });

  test('AC4/AC5: a rejected search shows the error state and renders no results', async () => {
    const api = { search: jest.fn().mockRejectedValue(new Error('down')) };
    const { initGuestSearchApp } = require('../public/js/guest-search');
    initGuestSearchApp(document, api);

    document.getElementById('search-input').value = 'Amara';
    document.getElementById('search-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await Promise.resolve();
    await Promise.resolve();

    expect(document.getElementById('state-error').hidden).toBe(false);
    expect(document.getElementById('results-list').innerHTML).toBe('');
  });

  test('AC8: checking "include inactive" re-runs the last search with includeInactive true', async () => {
    const api = { search: jest.fn().mockResolvedValue([]) };
    const { initGuestSearchApp } = require('../public/js/guest-search');
    initGuestSearchApp(document, api);

    document.getElementById('search-input').value = 'Fitzgerald';
    document.getElementById('search-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await Promise.resolve();
    await Promise.resolve();

    document.getElementById('include-inactive').checked = true;
    document.getElementById('include-inactive').dispatchEvent(new Event('change'));
    await Promise.resolve();
    await Promise.resolve();

    expect(api.search).toHaveBeenLastCalledWith('Fitzgerald', true);
  });

  test('AC9: a deactivated result renders the inactive status chip', async () => {
    const api = {
      search: jest.fn().mockResolvedValue([
        { id: 'gst_2', name: 'Wren Kellerman', email: 'wren.kellerman@example.com', phone: '(773) 555-0140', status: 'deactivated' },
      ]),
    };
    const { initGuestSearchApp } = require('../public/js/guest-search');
    initGuestSearchApp(document, api);

    document.getElementById('search-input').value = 'Kellerman';
    document.getElementById('search-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await Promise.resolve();
    await Promise.resolve();

    const chip = document.querySelector('.status-chip');
    expect(chip.classList.contains('is-inactive')).toBe(true);
    expect(chip.textContent).toContain('Inactive profile');
  });

  test('empty-query validation: submitting a blank search shows the inline field error and never calls the api', () => {
    const api = { search: jest.fn() };
    const { initGuestSearchApp } = require('../public/js/guest-search');
    initGuestSearchApp(document, api);

    document.getElementById('search-input').value = '   ';
    document.getElementById('search-form').dispatchEvent(new Event('submit', { cancelable: true }));

    expect(document.getElementById('search-error').hidden).toBe(false);
    expect(api.search).not.toHaveBeenCalled();
  });
});
