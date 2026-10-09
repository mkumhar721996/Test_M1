---
id: ADR-0002
category: component
title: Web App
status: accepted
superseded_by: null
component_id: comp_web_app
responsibility: "Single browser UI shared across every product domain represented\
  \ in the backlog (HR/onboarding & recruiting, employee & leave management, expense\
  \ tracking, hotel/reservation operations, restaurant ordering, defect tracking,\
  \ repair-service dispatch, clinic management, calculator, slot-game, task tracker,\
  \ etc.) \u2014 renders each domain's forms, lists, dashboards and workflow actions\
  \ and calls the API Service over HTTP. Domain-specific screens live as routes/modules\
  \ within this one app rather than as separate components, since no NFR or runtime\
  \ driver currently separates them."
kind: web_ui
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
split_reason: "a different runtime/client than the API \u2014 brief: 'A web-based\
  \ HR Management System ... for HR teams, managers, and employees'; broadened to\
  \ a common web-app role per the human's instruction to serve all backlog domains\
  \ from one architecture"
talks_to:
- component_id: comp_test_m1_chore_148_define_architecture
  interaction: sync
  evidence: 'Brief: web-based system for HR teams/managers/employees; epics describe
    UI actions (create/edit/view/approve) that must reach backend logic'
evidence: "Human's own words this turn: 'make common architecture for all web application'\
  \ \u2014 every epic in the backlog is now served by this one shared Web App rather\
  \ than scoping to HR only"
contested: true
alternatives_considered:
- Scope the architecture only to the Basic HR Management System brief and treat the
  other backlog epics as out of scope/mistakenly included (the previous draft's default)
- Build one common/generic web-app architecture that serves every epic across all
  product domains in the backlog (chosen, per explicit human instruction)
consequences:
- All domain-specific business logic for every product area (HR, hotel, restaurant,
  defects, repairs, clinic, calculator, slot-game, etc.) is implemented inside the
  same generic Web App / API / Database components rather than per-domain services,
  unless a later NFR or ownership driver justifies splitting one out
- The project brief (.arc/about.md) still describes only the HR Management System
  and is not updated to reflect the broadened scope unless the human asks for that
  change
---

## Context

Human's own words this turn: 'make common architecture for all web application' — every epic in the backlog is now served by this one shared Web App rather than scoping to HR only

Serves: TEST-M1-EPIC-001, TEST-M1-EPIC-002, TEST-M1-EPIC-003, TEST-M1-EPIC-004, TEST-M1-EPIC-005, TEST-M1-EPIC-006, TEST-M1-EPIC-007, TEST-M1-EPIC-008, TEST-M1-EPIC-009, TEST-M1-EPIC-010, TEST-M1-EPIC-011, TEST-M1-EPIC-012, TEST-M1-EPIC-013, TEST-M1-EPIC-014, TEST-M1-EPIC-015, TEST-M1-EPIC-016, TEST-M1-EPIC-017, TEST-M1-EPIC-018, TEST-M1-EPIC-019, TEST-M1-EPIC-020, TEST-M1-EPIC-021, TEST-M1-EPIC-022, TEST-M1-EPIC-023, TEST-M1-EPIC-024, TEST-M1-EPIC-025, TEST-M1-EPIC-026, TEST-M1-EPIC-027, TEST-M1-EPIC-028, TEST-M1-EPIC-029, TEST-M1-EPIC-030, TEST-M1-EPIC-031, TEST-M1-EPIC-032, TEST-M1-EPIC-033, TEST-M1-EPIC-034, TEST-M1-EPIC-035, TEST-M1-EPIC-036, TEST-M1-EPIC-037, TEST-M1-EPIC-038, TEST-M1-EPIC-039, TEST-M1-EPIC-040, TEST-M1-EPIC-042, TEST-M1-EPIC-044, TEST-M1-EPIC-045, TEST-M1-EPIC-046, TEST-M1-EPIC-047, TEST-M1-EPIC-048, TEST-M1-EPIC-049, TEST-M1-EPIC-050, TEST-M1-EPIC-051, TEST-M1-EPIC-052, TEST-M1-EPIC-053, TEST-M1-EPIC-054, TEST-M1-EPIC-055, TEST-M1-EPIC-056, TEST-M1-EPIC-057, TEST-M1-EPIC-058, TEST-M1-EPIC-059, TEST-M1-EPIC-060, TEST-M1-EPIC-061, TEST-M1-EPIC-062, TEST-M1-EPIC-063, TEST-M1-EPIC-064, TEST-M1-EPIC-065, TEST-M1-EPIC-066, TEST-M1-EPIC-067, TEST-M1-EPIC-068, TEST-M1-EPIC-069, TEST-M1-EPIC-070, TEST-M1-EPIC-071, TEST-M1-EPIC-072, TEST-M1-EPIC-073, TEST-M1-EPIC-074, TEST-M1-EPIC-075, TEST-M1-EPIC-076, TEST-M1-EPIC-077, TEST-M1-EPIC-078, TEST-M1-EPIC-079, TEST-M1-EPIC-080, TEST-M1-EPIC-081, TEST-M1-EPIC-082, TEST-M1-EPIC-083, TEST-M1-EPIC-084, TEST-M1-EPIC-085, TEST-M1-EPIC-086, TEST-M1-EPIC-087, TEST-M1-STORY-001, TEST-M1-STORY-036, TEST-M1-STORY-192, TEST-M1-STORY-209.

## Decision

Single browser UI shared across every product domain represented in the backlog (HR/onboarding & recruiting, employee & leave management, expense tracking, hotel/reservation operations, restaurant ordering, defect tracking, repair-service dispatch, clinic management, calculator, slot-game, task tracker, etc.) — renders each domain's forms, lists, dashboards and workflow actions and calls the API Service over HTTP. Domain-specific screens live as routes/modules within this one app rather than as separate components, since no NFR or runtime driver currently separates them.

Kept separate because a different runtime/client than the API — brief: 'A web-based HR Management System ... for HR teams, managers, and employees'; broadened to a common web-app role per the human's instruction to serve all backlog domains from one architecture.

## Talks to

- **Test M1 Chore 148 Define Architecture** (sync) — Brief: web-based system for HR teams/managers/employees; epics describe UI actions (create/edit/view/approve) that must reach backend logic

## Alternatives considered

- Scope the architecture only to the Basic HR Management System brief and treat the other backlog epics as out of scope/mistakenly included (the previous draft's default)
- Build one common/generic web-app architecture that serves every epic across all product domains in the backlog (chosen, per explicit human instruction)

## Consequences

- All domain-specific business logic for every product area (HR, hotel, restaurant, defects, repairs, clinic, calculator, slot-game, etc.) is implemented inside the same generic Web App / API / Database components rather than per-domain services, unless a later NFR or ownership driver justifies splitting one out
- The project brief (.arc/about.md) still describes only the HR Management System and is not updated to reflect the broadened scope unless the human asks for that change
