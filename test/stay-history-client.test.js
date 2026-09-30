const { fetchStayHistory, StayHistoryUnavailableError } = require('../src/guests/stayHistoryClient');

test('fetchStayHistory currently always rejects because Room & Reservation Management has no integration yet', async () => {
  await expect(fetchStayHistory('gst_1')).rejects.toBeInstanceOf(StayHistoryUnavailableError);
});
