# Relay Spec, QA & Patch System

Inspired by [github/spec-kit](https://github.com/github/spec-kit), this folder provides a structured approach to documenting features, quality assurance, and fork customizations for the Relay project.

## Structure

```
.relay/
├── registry.json          # Master registry of all features
├── upstream.json          # Fork sync configuration (if this is a fork)
└── features/
    └── <NNN>-<slug>/
        ├── spec.md        # Feature specification
        ├── qa.md          # QA test plan (always paired with spec)
        └── patch.md       # Fork patch with intent (only if forked)
```

## Principles

1. **Every feature is a folder** — one folder per feature, named `<NNN>-<slug>` (e.g., `001-proxy`)
2. **Every spec has a QA doc** — `spec.md` describes what to build; `qa.md` describes how to verify it
3. **Fork features get a patch.md** — records intent, not just diffs, so they survive upstream sync
4. **AI agents must document here** — when implementing a feature, create/update the feature folder
5. **Tidy and consistent** — use the templates, follow the format

## For AI Agents

When working on this repo, follow these rules:

- **Before implementing a feature**: Check if a feature folder exists in `.relay/features/`. If not, create one with `spec.md`.
- **After implementing a feature**: Update `spec.md` status and create/update `qa.md`.
- **When forking**: Add `patch.md` to the feature folder with intent and reconciliation notes.
- **When syncing with upstream**: The fork-sync workflow will re-apply patches using their intent descriptions.

## Quick Reference

| Action                  | How                                                     |
| ----------------------- | ------------------------------------------------------- |
| Create a new feature    | `mkdir .relay/features/<NNN>-<slug>` + create `spec.md` |
| Add QA for a feature    | Create `qa.md` in the feature folder                    |
| Add a fork patch        | Create `patch.md` in the feature folder                 |
| Register a feature      | Add entry to `.relay/registry.json`                     |
| Sync fork with upstream | `gh workflow run fork-sync.yml`                         |
