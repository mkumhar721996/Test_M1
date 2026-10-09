---
id: ADR-0004
category: component
title: Notification Worker
status: accepted
superseded_by: null
component_id: comp_notification_worker
responsibility: Runs scheduled checks and dispatches async notifications for every
  domain's alerts/reminders/status updates (onboarding blocked-step & deadline reminders,
  order/job status alerts, repair-service customer & technician notifications) via
  email (and optionally Slack for onboarding).
kind: worker
serves:
- TEST-M1-EPIC-014
- TEST-M1-EPIC-060
- TEST-M1-EPIC-072
- TEST-M1-EPIC-078
- TEST-M1-EPIC-079
- TEST-M1-STORY-073
- TEST-M1-STORY-074
- TEST-M1-STORY-075
- TEST-M1-STORY-076
- TEST-M1-STORY-160
- TEST-M1-STORY-161
- TEST-M1-STORY-191
- TEST-M1-STORY-201
- TEST-M1-STORY-208
split_reason: "background work whose own NFR (schedule) differs from the API's synchronous\
  \ request handling \u2014 deadline reminders and status alerts fire without any\
  \ inbound request, so they need their own schedule/trigger"
evidence: "TEST-M1-EPIC-014/060 (onboarding notifications & reminders); TEST-M1-EPIC-072\
  \ (order tracking & notifications); TEST-M1-EPIC-078/079 and their stories (repair-service\
  \ customer/technician alerts) \u2014 scope broadened per human's instruction this\
  \ turn"
alternatives_considered:
- '{''option'': ''Handle reminders inline in the API request path'', ''why_rejected'':
  ''deadline-based reminders fire without any inbound request, so they need their
  own schedule/trigger''}'
---

## Context

TEST-M1-EPIC-014/060 (onboarding notifications & reminders); TEST-M1-EPIC-072 (order tracking & notifications); TEST-M1-EPIC-078/079 and their stories (repair-service customer/technician alerts) — scope broadened per human's instruction this turn

Serves: TEST-M1-EPIC-014, TEST-M1-EPIC-060, TEST-M1-EPIC-072, TEST-M1-EPIC-078, TEST-M1-EPIC-079, TEST-M1-STORY-073, TEST-M1-STORY-074, TEST-M1-STORY-075, TEST-M1-STORY-076, TEST-M1-STORY-160, TEST-M1-STORY-161, TEST-M1-STORY-191, TEST-M1-STORY-201, TEST-M1-STORY-208.

## Decision

Runs scheduled checks and dispatches async notifications for every domain's alerts/reminders/status updates (onboarding blocked-step & deadline reminders, order/job status alerts, repair-service customer & technician notifications) via email (and optionally Slack for onboarding).

Kept separate because background work whose own NFR (schedule) differs from the API's synchronous request handling — deadline reminders and status alerts fire without any inbound request, so they need their own schedule/trigger.

## Alternatives considered

- {'option': 'Handle reminders inline in the API request path', 'why_rejected': 'deadline-based reminders fire without any inbound request, so they need their own schedule/trigger'}
