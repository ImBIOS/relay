# Proxy

**Status:** implemented
**Feature ID:** 001
**Last Updated:** 2025-04-25

## Overview

The Relay proxy is an HTTP server that sits between Claude Code and AI API providers. It intercepts API calls, routes them to the configured provider, and enables hot-switching providers without restarting Claude Code sessions.

## Requirements

- HTTP proxy server listening on a configurable port (default: 8787)
- Intercepts `/v1/chat/completions` and `/v1/messages` API calls
- Routes requests to the currently active provider (Z.AI, MiniMax, etc.)
- Supports model-based routing (different models → different providers)
- Streams responses back to the client (SSE)
- Provider failover on errors
- Per-request provider override via headers
- Usage tracking per provider and model

## Design

### Request Flow

```
Claude Code → localhost:8787 → Relay Proxy → Provider API → Response
                                        ↓
                                   Usage Tracker
```

### Key Components

| Component | File | Purpose |
|-----------|------|---------|
| Proxy Server | `src/proxy/server.ts` | HTTP server that accepts connections |
| Router | `src/proxy/router.ts` | Routes requests to providers based on model |
| Provider Adapters | `src/providers/` | Provider-specific API implementations |
| Usage Tracker | `src/commands/usage.ts` | Tracks token usage per provider |

### Configuration

- Port: configured via `relay proxy --port <port>`
- Provider: configured via `relay account set-default <provider>`
- Model routing: configured via `relay proxy --model <model>`

## Acceptance Criteria

- [x] Proxy starts on configured port
- [x] Claude Code can connect and send requests
- [x] Responses stream back correctly
- [x] Provider switching works without restart
- [x] Usage is tracked per request
- [x] `relay proxy status` shows current state
