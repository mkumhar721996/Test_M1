---
id: ADR-0001
category: component
title: Test M1 Chore 148 Define Architecture
status: accepted
superseded_by: null
component_id: comp_test_m1_chore_148_define_architecture
responsibility: "Single REST API (Express) shared across every product domain in the\
  \ backlog \u2014 exposes CRUD, workflow/state-machine, and reporting endpoints per\
  \ domain, enforces auth/RBAC, and persists to the Relational Database. Backend scaffold\
  \ at the repo root currently contains only a manifest declaring Express as a dependency;\
  \ no business logic exists yet for any domain."
kind: api_service
serves:
- TEST-M1-EPIC-001
- TEST-M1-EPIC-002
- TEST-M1-EPIC-003
- TEST-M1-EPIC-004
- TEST-M1-EPIC-005
- TEST-M1-EPIC-006
- TEST-M1-EPIC-007
- TEST-M1-EPIC-008
- TEST-M1-EPIC-009
- TEST-M1-EPIC-010
- TEST-M1-EPIC-011
- TEST-M1-EPIC-012
- TEST-M1-EPIC-013
- TEST-M1-EPIC-014
- TEST-M1-EPIC-015
- TEST-M1-EPIC-016
- TEST-M1-EPIC-017
- TEST-M1-EPIC-018
- TEST-M1-EPIC-019
- TEST-M1-EPIC-020
- TEST-M1-EPIC-021
- TEST-M1-EPIC-022
- TEST-M1-EPIC-023
- TEST-M1-EPIC-024
- TEST-M1-EPIC-025
- TEST-M1-EPIC-026
- TEST-M1-EPIC-027
- TEST-M1-EPIC-028
- TEST-M1-EPIC-029
- TEST-M1-EPIC-030
- TEST-M1-EPIC-031
- TEST-M1-EPIC-032
- TEST-M1-EPIC-033
- TEST-M1-EPIC-034
- TEST-M1-EPIC-035
- TEST-M1-EPIC-036
- TEST-M1-EPIC-037
- TEST-M1-EPIC-038
- TEST-M1-EPIC-039
- TEST-M1-EPIC-040
- TEST-M1-EPIC-042
- TEST-M1-EPIC-044
- TEST-M1-EPIC-045
- TEST-M1-EPIC-046
- TEST-M1-EPIC-047
- TEST-M1-EPIC-048
- TEST-M1-EPIC-049
- TEST-M1-EPIC-050
- TEST-M1-EPIC-051
- TEST-M1-EPIC-052
- TEST-M1-EPIC-053
- TEST-M1-EPIC-054
- TEST-M1-EPIC-055
- TEST-M1-EPIC-056
- TEST-M1-EPIC-057
- TEST-M1-EPIC-058
- TEST-M1-EPIC-059
- TEST-M1-EPIC-060
- TEST-M1-EPIC-061
- TEST-M1-EPIC-062
- TEST-M1-EPIC-063
- TEST-M1-EPIC-064
- TEST-M1-EPIC-065
- TEST-M1-EPIC-066
- TEST-M1-EPIC-067
- TEST-M1-EPIC-068
- TEST-M1-EPIC-069
- TEST-M1-EPIC-070
- TEST-M1-EPIC-071
- TEST-M1-EPIC-072
- TEST-M1-EPIC-073
- TEST-M1-EPIC-074
- TEST-M1-EPIC-075
- TEST-M1-EPIC-076
- TEST-M1-EPIC-077
- TEST-M1-EPIC-078
- TEST-M1-EPIC-079
- TEST-M1-EPIC-080
- TEST-M1-EPIC-081
- TEST-M1-EPIC-082
- TEST-M1-EPIC-083
- TEST-M1-EPIC-084
- TEST-M1-EPIC-085
- TEST-M1-EPIC-086
- TEST-M1-EPIC-087
- TEST-M1-STORY-001
- TEST-M1-STORY-036
- TEST-M1-STORY-192
- TEST-M1-STORY-209
split_reason: "exists in the code \u2014 found by the codebase scan at the repo root"
talks_to:
- component_id: comp_relational_database
  interaction: shared-storage
  evidence: 'Brief, Hosting constraints: ''Relational database required for employee
    and HR records'''
- component_id: comp_notification_worker
  interaction: async
  evidence: "TEST-M1-EPIC-060 / TEST-M1-STORY-160 / TEST-M1-STORY-161 \u2014 blocked-step\
    \ and approaching-deadline events must trigger alert dispatch outside the request\
    \ path"
evidence: 'Codebase scan candidate: directory ''.'', kind_hint api_service, evidence
  ''manifest at the repo root; uses Express''; scope broadened per human''s instruction
  this turn: ''make common architecture for all web application'''
---

## Context

Codebase scan candidate: directory '.', kind_hint api_service, evidence 'manifest at the repo root; uses Express'; scope broadened per human's instruction this turn: 'make common architecture for all web application'

Serves: TEST-M1-EPIC-001, TEST-M1-EPIC-002, TEST-M1-EPIC-003, TEST-M1-EPIC-004, TEST-M1-EPIC-005, TEST-M1-EPIC-006, TEST-M1-EPIC-007, TEST-M1-EPIC-008, TEST-M1-EPIC-009, TEST-M1-EPIC-010, TEST-M1-EPIC-011, TEST-M1-EPIC-012, TEST-M1-EPIC-013, TEST-M1-EPIC-014, TEST-M1-EPIC-015, TEST-M1-EPIC-016, TEST-M1-EPIC-017, TEST-M1-EPIC-018, TEST-M1-EPIC-019, TEST-M1-EPIC-020, TEST-M1-EPIC-021, TEST-M1-EPIC-022, TEST-M1-EPIC-023, TEST-M1-EPIC-024, TEST-M1-EPIC-025, TEST-M1-EPIC-026, TEST-M1-EPIC-027, TEST-M1-EPIC-028, TEST-M1-EPIC-029, TEST-M1-EPIC-030, TEST-M1-EPIC-031, TEST-M1-EPIC-032, TEST-M1-EPIC-033, TEST-M1-EPIC-034, TEST-M1-EPIC-035, TEST-M1-EPIC-036, TEST-M1-EPIC-037, TEST-M1-EPIC-038, TEST-M1-EPIC-039, TEST-M1-EPIC-040, TEST-M1-EPIC-042, TEST-M1-EPIC-044, TEST-M1-EPIC-045, TEST-M1-EPIC-046, TEST-M1-EPIC-047, TEST-M1-EPIC-048, TEST-M1-EPIC-049, TEST-M1-EPIC-050, TEST-M1-EPIC-051, TEST-M1-EPIC-052, TEST-M1-EPIC-053, TEST-M1-EPIC-054, TEST-M1-EPIC-055, TEST-M1-EPIC-056, TEST-M1-EPIC-057, TEST-M1-EPIC-058, TEST-M1-EPIC-059, TEST-M1-EPIC-060, TEST-M1-EPIC-061, TEST-M1-EPIC-062, TEST-M1-EPIC-063, TEST-M1-EPIC-064, TEST-M1-EPIC-065, TEST-M1-EPIC-066, TEST-M1-EPIC-067, TEST-M1-EPIC-068, TEST-M1-EPIC-069, TEST-M1-EPIC-070, TEST-M1-EPIC-071, TEST-M1-EPIC-072, TEST-M1-EPIC-073, TEST-M1-EPIC-074, TEST-M1-EPIC-075, TEST-M1-EPIC-076, TEST-M1-EPIC-077, TEST-M1-EPIC-078, TEST-M1-EPIC-079, TEST-M1-EPIC-080, TEST-M1-EPIC-081, TEST-M1-EPIC-082, TEST-M1-EPIC-083, TEST-M1-EPIC-084, TEST-M1-EPIC-085, TEST-M1-EPIC-086, TEST-M1-EPIC-087, TEST-M1-STORY-001, TEST-M1-STORY-036, TEST-M1-STORY-192, TEST-M1-STORY-209.

## Decision

Single REST API (Express) shared across every product domain in the backlog — exposes CRUD, workflow/state-machine, and reporting endpoints per domain, enforces auth/RBAC, and persists to the Relational Database. Backend scaffold at the repo root currently contains only a manifest declaring Express as a dependency; no business logic exists yet for any domain.

Kept separate because exists in the code — found by the codebase scan at the repo root.

## Talks to

- **Relational Database** (shared-storage) — Brief, Hosting constraints: 'Relational database required for employee and HR records'
- **Notification Worker** (async) — TEST-M1-EPIC-060 / TEST-M1-STORY-160 / TEST-M1-STORY-161 — blocked-step and approaching-deadline events must trigger alert dispatch outside the request path
