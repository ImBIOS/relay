# 000-init-relay

## Summary

Initializes the `.relay/` directory structure in a forked repository using Relay. This is the first feature that should exist in any repo that adopts the Relay documentation system.

## Status

`implemented`

## Description

The `.relay/` directory provides a structured approach to documenting features, quality assurance, and fork customizations. This feature covers the creation of:

- `.relay/README.md` — Overview of the spec, QA, and patch system
- `.relay/registry.json` — Master registry of all features
- `.relay/upstream.json` — Fork sync configuration (if this is a fork)
- `.relay/features/` — Directory for feature folders
- `.relay/features/000-init-relay/` — This feature folder itself

## Acceptance Criteria

- [x] `.relay/` directory exists with `README.md`
- [x] `.relay/registry.json` exists with valid schema
- [x] `.relay/features/` directory exists
- [x] `.relay/features/000-init-relay/spec.md` exists
- [x] `.relay/features/000-init-relay/qa.md` exists
- [x] `.relay/features/000-init-relay/patch.md` exists (fork customizations)
- [x] This feature is registered in `registry.json`

## Implementation Notes

This is a bootstrap feature — it documents itself. When a new fork is created, this feature should be the first one added to establish the `.relay/` structure.
