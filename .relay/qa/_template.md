# QA: {FEATURE_NAME}

> **Spec**: [{FEATURE_NAME}](../specs/{FEATURE_NAME}.md)
> **Status**: draft | in-progress | passing | failing | skipped
> **Last Run**: {DATE}
> **Runner**: {AGENT_OR_HUMAN}

## Test Plan

### Unit Tests

| ID | Test Case | Expected Result | Status |
|----|-----------|-----------------|--------|
| U1 | {Description} | {Expected outcome} | {pass/fail/skip} |
| U2 | {Description} | {Expected outcome} | {pass/fail/skip} |

### Integration Tests

| ID | Test Case | Expected Result | Status |
|----|-----------|-----------------|--------|
| I1 | {Description} | {Expected outcome} | {pass/fail/skip} |
| I2 | {Description} | {Expected outcome} | {pass/fail/skip} |

### Manual / Exploratory Tests

| ID | Scenario | Steps | Expected Result | Status |
|----|----------|-------|-----------------|--------|
| E1 | {Scenario} | 1. Step 1\n2. Step 2 | {Expected outcome} | {pass/fail/skip} |

### Edge Cases

| ID | Edge Case | Expected Behavior | Status |
|----|-----------|-------------------|--------|
| EC1 | {Description} | {Expected behavior} | {pass/fail/skip} |

### Regression Tests

| ID | What Could Break | How to Verify | Status |
|----|-----------------|---------------|--------|
| R1 | {Description} | {Verification steps} | {pass/fail/skip} |

## Test Environment

- **OS**: {e.g., Ubuntu 22.04}
- **Runtime**: {e.g., Bun 1.2.0}
- **Dependencies**: {e.g., Claude Code CLI 1.x}

## Run Instructions

```bash
{Commands to run the tests}
```

## Results Log

| Date | Runner | Summary | Failures |
|------|--------|---------|----------|
| {DATE} | {Agent/Human} | {X/Y passed} | {None or list} |

## Notes

{Any observations, known issues, or areas needing attention.}
