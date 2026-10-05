/** @jest-environment jsdom */
const fs = require('fs');
const path = require('path');

const HTML = fs.readFileSync(path.join(__dirname, '..', 'public', 'notification-log.html'), 'utf8');

const attempts = [
  { id: 'a1', recipientName: 'Priya Shah', recipientRole: 'HR', channel: 'Email', status: 'delivered', notificationId: 'ntf_1', runId: 'run_1', stepId: 't1', detail: 'Accepted.', retryCount: 0 },
  { id: 'a2', recipientName: 'Devon Ruiz', recipientRole: 'Step owner — IT', channel: 'Email', status: 'failed', notificationId: 'ntf_2', runId: 'run_1', stepId: 't1', detail: 'No email address on file for Devon Ruiz.', errorCode: 'NO_EMAIL_ADDRESS', retryCount: 0 },
];

describe('notification delivery log page', () => {
  beforeEach(() => {
    document.documentElement.innerHTML = HTML;
    const { initDeliveryLogApp } = require('../public/js/notification-log');
    initDeliveryLogApp(document, attempts);
  });

  test('shows stat chips and filters the table', () => {
    expect(document.querySelector('.stat-chip.is-failed').textContent).toContain('1 failed');
    expect(document.querySelectorAll('.log-table tbody tr').length).toBe(2);
    const filter = document.getElementById('status-filter');
    filter.value = 'failed';
    filter.dispatchEvent(new Event('change'));
    expect(document.querySelectorAll('.log-table tbody tr').length).toBe(1);
  });

  test('details toggle reveals diagnostic fields', () => {
    document.querySelectorAll('.log-toggle-btn')[1].click();
    const box = document.querySelector('.log-detail-box').textContent;
    expect(box).toContain('ntf_2');
    expect(box).toContain('NO_EMAIL_ADDRESS');
    expect(box).toContain('No email address on file for Devon Ruiz.');
  });
});
