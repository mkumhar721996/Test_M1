class StayHistoryUnavailableError extends Error {
  constructor(message = 'Room & Reservation Management is not available') {
    super(message);
  }
}

async function fetchStayHistory(guestId) {
  throw new StayHistoryUnavailableError();
}

module.exports = { fetchStayHistory, StayHistoryUnavailableError };
