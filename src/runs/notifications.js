const crypto = require('crypto');

const notifications = [];

function notifyHrCoordinator(coordinatorId, runId, message) {
  const notification = { id: crypto.randomUUID(), coordinatorId, runId, message };
  notifications.push(notification);
  return notification;
}

function getNotificationsForCoordinator(coordinatorId) {
  return notifications.filter((n) => n.coordinatorId === coordinatorId);
}

module.exports = { notifyHrCoordinator, getNotificationsForCoordinator };
