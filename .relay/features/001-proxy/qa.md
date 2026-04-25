# Proxy — QA Test Plan

**Feature:** 001-proxy
**Last Updated:** 2025-04-25

## Unit Tests

### Proxy Server

| Test | Description | Status |
|------|-------------|--------|
| Server starts on configured port | Proxy binds to the port specified via `--port` | ✅ |
| Server defaults to port 8787 | No `--port` flag uses default | ✅ |
| Server rejects invalid port | Port < 1 or > 65535 shows error | ✅ |

### Request Routing

| Test | Description | Status |
|------|-------------|--------|
| Routes to default provider | Request with no model header uses default | ✅ |
| Routes by model name | Request with `X-Model` header routes to correct provider | ✅ |
| Unknown model returns 404 | Model not configured returns appropriate error | ✅ |

### Streaming

| Test | Description | Status |
|------|-------------|--------|
| SSE streaming works | Response is streamed as server-sent events | ✅ |
| Stream errors are forwarded | Provider errors propagate to client | ✅ |

## Integration Tests

| Test | Description | Status |
|------|-------------|--------|
| End-to-end with Claude Code | Claude Code connects, sends request, gets response | ✅ |
| Provider failover | If primary provider fails, fallback is used | ⬜ |
| Concurrent requests | Multiple simultaneous requests are handled | ⬜ |

## Exploratory Testing

- [ ] Start proxy, connect Claude Code, verify responses stream correctly
- [ ] Switch provider mid-session, verify Claude Code doesn't need restart
- [ ] Kill proxy process, verify Claude Code shows connection error (not crash)
- [ ] Run `relay proxy status` while proxy is running, verify correct output
- [ ] Run `relay usage` after proxy session, verify usage is tracked

## Edge Cases

| Case | Expected Behavior | Status |
|------|-------------------|--------|
| No accounts configured | Proxy starts but returns error on requests | ⬜ |
| All providers fail | Returns 503 with error message | ⬜ |
| Very large request | Handles without timeout | ⬜ |
| Client disconnects mid-stream | Server cleans up resources | ⬜ |

## Regression

After any change to proxy code, verify:
1. `bun test` passes
2. `relay proxy --port 8787` starts without error
3. Claude Code can connect and receive responses
4. `relay usage` shows tracked usage
