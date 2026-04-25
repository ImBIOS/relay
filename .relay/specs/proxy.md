# Spec: Proxy

> **Status**: implemented
> **Created**: 2025-04-21
> **Updated**: 2025-04-25
> **Author**: ImBIOS

## Overview

An HTTP proxy server that sits between Claude Code and AI API providers (Z.AI, MiniMax, etc.), enabling hot-switching of providers without restarting Claude Code sessions.

## Motivation

Claude Code caches the model name and base URL at session start. Swapping providers mid-session requires a full restart. The relay proxy solves this by providing a stable local endpoint that routes requests to the currently active provider.

## Requirements

### Functional Requirements

- [x] HTTP proxy on configurable port (default 8787)
- [x] Model-based routing (glm-* → Z.AI, minimax-* → MiniMax)
- [x] Auth token replacement (accepts "relay" as bearer, replaces with real API key)
- [x] Request logging (timestamp, model, provider, latency)
- [x] Start/stop/status CLI commands
- [x] Auto-start via Claude Code SessionStart hook

### Non-Functional Requirements

- [x] Adds <50ms latency overhead
- [x] Handles connection failures gracefully
- [x] API keys never logged
- [x] Works in Docker/CI environments

## Design

### Architecture

```
Claude Code  →  POST http://127.0.0.1:8787/api/anthropic/v1/messages
                  (Authorization: Bearer relay)
                        │
                  relay proxy
                  - Replaces auth token with real API key
                  - Routes to active provider (Z.AI or MiniMax)
                  - Logs: timestamp, model, provider, latency
                        │
               Z.AI / MiniMax API
```

### API / Interface

```bash
relay proxy start [--port 8787]
relay proxy stop
relay proxy status
```

### Data Model

Account configuration stored in `~/.config/relay/accounts.json`:
- account id, name, provider, API key (encrypted), active flag

## Implementation Notes

- Main implementation: `src/proxy/server.ts`
- Provider definitions: `src/providers/`
- Account management: `src/config/accounts-config.ts`
- CLI commands: `src/commands/`

## Acceptance Criteria

1. Given relay proxy is running, when Claude Code sends a request, then the request is routed to the active provider
2. Given two accounts are configured, when user switches accounts, then subsequent requests route to the new provider without restart
3. Given proxy is stopped, when Claude Code tries to connect, then a clear error is returned

## QA Reference

See [QA: Proxy](../qa/proxy.md) for the corresponding test plan.

## Changelog

| Date | Change |
|------|--------|
| 2025-04-21 | Initial implementation |
| 2025-04-25 | Added to Relay Spec system |
