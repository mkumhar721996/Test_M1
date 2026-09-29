function pad2(n) {
  return String(n).padStart(2, '0');
}

function daysInMonth(year, monthIndex0) {
  return new Date(year, monthIndex0 + 1, 0).getDate();
}

function addMonths(isoDate, months) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const totalMonths = (m - 1) + months;
  const targetYear = y + Math.floor(totalMonths / 12);
  const targetMonthIndex0 = ((totalMonths % 12) + 12) % 12;
  const targetDay = Math.min(d, daysInMonth(targetYear, targetMonthIndex0));
  return `${targetYear}-${pad2(targetMonthIndex0 + 1)}-${pad2(targetDay)}`;
}

function computeExpiryDate(eventDateIso, retentionMonths) {
  return addMonths(eventDateIso, retentionMonths);
}

function isPastRetention(eventDateIso, retentionMonths, nowIso) {
  return nowIso > computeExpiryDate(eventDateIso, retentionMonths);
}

module.exports = { addMonths, computeExpiryDate, isPastRetention };
