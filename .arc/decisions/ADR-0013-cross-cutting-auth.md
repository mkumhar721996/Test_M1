---
id: ADR-0013
category: cross_cutting
title: 'Cross-cutting: auth'
status: accepted
superseded_by: null
component_id: null
decision: Authenticate via Azure AD (the organization's corporate identity provider);
  enforce role-based access control (HR, manager, employee, and domain-specific roles)
  on every profile/record action in the API.
evidence: 'Human''s answer this turn: ''Azure AD''; Brief: ''Corporate identity provider
  for authentication''; ''Access controlled through role-based permissions''; TEST-M1-STORY-158
  ''Role-Gated Access to Profile Actions'', TEST-M1-STORY-172 ''Employee Directory
  & Search'' access checks'
---

## Context

Human's answer this turn: 'Azure AD'; Brief: 'Corporate identity provider for authentication'; 'Access controlled through role-based permissions'; TEST-M1-STORY-158 'Role-Gated Access to Profile Actions', TEST-M1-STORY-172 'Employee Directory & Search' access checks

## Decision

Authenticate via Azure AD (the organization's corporate identity provider); enforce role-based access control (HR, manager, employee, and domain-specific roles) on every profile/record action in the API.
