---
id: ADR-0010
category: deployment_target
title: "Deployment target: AWS, cloud-hosted (containers or serverless TBD); separate\
  \ staging and\u2026"
status: accepted
superseded_by: null
component_id: null
decision: "AWS, cloud-hosted (containers or serverless TBD); separate staging and\
  \ production environments; single hosting region per organization policy (exact\
  \ AWS region not yet chosen); business-hours (09:00\u201318:00) availability target\
  \ with maintenance performed off-hours; no high-availability requirement for the\
  \ MVP. Today's repo is an unconfigured Express scaffold with no deployment configuration\
  \ yet \u2014 this target states what the system must meet, not what exists today."
evidence: 'Human''s answer this turn: ''Separate staging environment''; Project brief,
  Hosting constraints and Availability sections (''Deployable on Azure or AWS'', business-hours
  availability); codebase scan shows only a bare manifest with no deployment setup'
---

## Context

Human's answer this turn: 'Separate staging environment'; Project brief, Hosting constraints and Availability sections ('Deployable on Azure or AWS', business-hours availability); codebase scan shows only a bare manifest with no deployment setup

## Decision

AWS, cloud-hosted (containers or serverless TBD); separate staging and production environments; single hosting region per organization policy (exact AWS region not yet chosen); business-hours (09:00–18:00) availability target with maintenance performed off-hours; no high-availability requirement for the MVP. Today's repo is an unconfigured Express scaffold with no deployment configuration yet — this target states what the system must meet, not what exists today.
