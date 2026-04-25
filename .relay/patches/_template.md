# Patch: {PATCH_NAME}

> **Status**: active | superseded | removed
> **Created**: {DATE}
> **Updated**: {DATE}
> **Applies To**: {upstream version or commit}
> **Upstream Issue**: {URL if tracking upstream issue}

## Intent

{Why does this patch exist? What problem does it solve? This is the most important section — it enables AI-assisted reconciliation after upstream sync.}

## Files Modified

| File | Change Type | Description |
|------|-------------|-------------|
| `path/to/file` | modify | {What was changed and why} |
| `path/to/file` | add | {New file and its purpose} |
| `path/to/file` | delete | {Why this file was removed} |

## Diff

```diff
{The actual code changes, or a reference to the commit.}
```

## Reconciliation Notes

{Instructions for the AI agent when re-applying this patch after an upstream sync:

- What to look for in the new upstream code
- How to adapt the patch if the surrounding code changed
- What tests to run after re-application
}

## Related Specs

- [{SPEC_NAME}](../specs/{SPEC_NAME}.md) — {relationship}

## Changelog

| Date | Change |
|------|--------|
| {DATE} | Initial patch |
| {DATE} | Re-applied after upstream sync to v{VERSION} |
