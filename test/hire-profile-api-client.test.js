jest.mock('../public/js/apiClient', () => ({
  hires: {
    update: jest.fn(() => Promise.resolve({})),
    remove: jest.fn(() => Promise.resolve({})),
    reactivate: jest.fn(() => Promise.resolve({})),
  },
}));
const apiClient = require('../public/js/apiClient');
const { createDefaultApi } = require('../public/js/hire-profile');

describe('hire-profile createDefaultApi', () => {
  beforeEach(() => {
    apiClient.hires.update.mockClear();
    apiClient.hires.remove.mockClear();
    apiClient.hires.reactivate.mockClear();
  });

  test('AC1: saveStage delegates to apiClient.hires.update, not fetch', () => {
    createDefaultApi('hire_1').saveStage('offer_accepted');
    expect(apiClient.hires.update).toHaveBeenCalledWith('hire_1', { hireStage: 'offer_accepted' });
  });

  test('AC1: updateRoleDepartment delegates to apiClient.hires.update, not fetch', () => {
    createDefaultApi('hire_1').updateRoleDepartment({ department: 'Product', role: 'PM' });
    expect(apiClient.hires.update).toHaveBeenCalledWith('hire_1', { department: 'Product', role: 'PM' });
  });

  test('AC1: updateContact delegates to apiClient.hires.update, not fetch', () => {
    createDefaultApi('hire_1').updateContact({ email: 'a@example.com' });
    expect(apiClient.hires.update).toHaveBeenCalledWith('hire_1', { email: 'a@example.com' });
  });

  test('AC1: deactivate delegates to apiClient.hires.remove, not fetch', () => {
    createDefaultApi('hire_1').deactivate();
    expect(apiClient.hires.remove).toHaveBeenCalledWith('hire_1');
  });

  test('AC1: reactivate delegates to apiClient.hires.reactivate, not fetch', () => {
    createDefaultApi('hire_1').reactivate();
    expect(apiClient.hires.reactivate).toHaveBeenCalledWith('hire_1');
  });
});
