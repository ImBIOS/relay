# Relay Spec, QA & Patch System

Inspired by [github/spec-kit](https://github.com/github/spec-kit), this folder provides a structured approach to documenting features, quality assurance, and fork customizations for the Relay project.

## Structure

```
.relay/
├── specs/          # Feature specifications (one .md per feature)
├── qa/             # QA test plans (one .md per spec, always paired)
├── patches/        # Relay Patches — fork customizations with intent
│   └── registry.json
└── upstream.json   # Fork sync configuration (if this is a fork)
```

## Principles

1. **Every spec has a QA doc** — specs describe what to build; QA describes how to verify it
2. **AI agents must document here** — when Claude Code (or any AI agent) implements a feature, it must create/update the corresponding spec and QA files
3. **Patches survive upstream sync** — Relay Patches encode intent, not just diffs, so they can be re-applied after upstream changes
4. **Tidy and consistent** — use the templates, follow the format

## For AI Agents

When working on this repo, follow these rules:

- **Before implementing a feature**: Check if a spec exists in `.relay/specs/`. If not, create one using the template.
- **After implementing a feature**: Update the spec status and create/update the corresponding QA doc in `.relay/qa/`.
- **When forking**: Use `.relay/patches/` to record customizations with intent. The fork sync workflow will preserve these.
- **When syncing with upstream**: Run the sync workflow. It will re-apply patches using their intent descriptions.

## Quick Reference

| Action | Command |
|--------|---------|
| Create a new spec | Copy `.relay/specs/_template.md` to `.relay/specs/<feature>.md` |
| Create QA for a spec | Copy `.relay/qa/_template.md` to `.relay/qa/<feature>.md` |
| Add a fork patch | Copy `.relay/patches/_template.md` to `.relay/patches/<patch-name>.md` |
| Sync fork with upstream | `gh workflow run fork-sync.yml` or wait for schedule |
