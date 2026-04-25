# QA: Proxy

> **Spec**: [Proxy](../specs/proxy.md)
> **Status**: draft
> **Last Run**: -
> **Runner**: -

## Test Plan

### Unit Tests

| ID | Test Case | Expected Result | Status |
|----|-----------|-----------------|--------|
| U1 | Proxy starts on default port 8787 | Server listens and responds to health check | skip |
| U2 | Model-based routing: glm-* → Z.AI | Request routed to Z.AI provider | skip |
| U3 | Model-based routing: minimax-* → MiniMax | Request routed to MiniMax provider | skip |
| U4 | Auth token replacement | "relay" bearer replaced with real API key | skip |
| U5 | Request logging | Timestamp, model, provider, latency logged | skip |

### Integration Tests

| ID | Test Case | Expected Result | Status |
|----|-----------|-----------------|--------|
| I1 | Claude Code → proxy → provider | End-to-end request succeeds | skip |
| I2 | Account switch mid-session | New requests route to new provider | skip |
| I3 | Proxy stopped, Claude Code connects | Clear error message returned | skip |
| I4 | Docker/CI environment | `relay init --providers ...` works non-interactively | skip |

### Manual / Exploratory Tests

| ID | Scenario | Steps | Expected Result | Status |
|----|----------|-------|-----------------|--------|
| E1 | Start proxy and verify | 1. `relay proxy start`\n2. `relay proxy status` | Status shows running with correct port | skip |
| E2 | Hot-switch providers | 1. Start proxy\n2. Send request with glm-4\n3. `relay account switch minimax`\n4. Send request with minimax-* | Each request routes to correct provider | skip |
| E3 | Proxy auto-start via hook | 1. `relay init --install-hooks`\n2. Start Claude Code\n3. Check proxy status | Proxy auto-starts before Claude requests | skip |

### Edge Cases

| ID | Edge Case | Expected Behavior | Status |
|----|-----------|-------------------|--------|
| EC1 | No active account configured | Proxy returns 503 with clear error message | skip |
| EC2 | Provider API returns error | Proxy forwards error to Claude Code | skip |
| EC3 | Port already in use | Proxy exits with clear error about port conflict | skip |
| EC4 | Concurrent requests | All requests handled correctly, no race conditions | skip |

### Regression Tests

| ID | What Could Break | How to Verify | Status |
|----|-----------------|---------------|--------|
| R1 | Adding new provider breaks routing | Add provider, send request, verify routing | skip |
| R2 | Account config migration | Upgrade relay, verify existing accounts still work | skip |
| R3 | Claude Code version update | Test with latest Claude Code, verify proxy integration | skip |

## Test Environment

- **OS**: Ubuntu 22.04 / macOS
- **Runtime**: Bun 1.2.0+
- **Dependencies**: Claude Code CLI 1.x

## Run Instructions

```bash
# Unit tests
cd /path/to/relay && bun test

# Integration tests (requires API keys)
relay account add --name test-zai --provider zai --key $ZAI_API_KEY
relay proxy start
curl -X POST http://127.0.0.1:8787/api/anthropic/v1/messages \
  -H "Authorization: Bearer relay" \
  -H "Content-Type: application/json" \
  -d '{"model":"glm-4","messages":[{"role":"user","content":"hi"}],"max_tokens":10}'
```

## Results Log

| Date | Runner | Summary | Failures |
|------|--------|---------|----------|
| - | - | - | - |

## Notes

- Existing test files: `src/config/env.test.ts`, `src/config/settings.test.ts`, `src/utils/completion.test.ts`, `src/utils/logger.test.ts`, `src/sdk/index.test.ts`
- Need to add proxy-specific integration tests
