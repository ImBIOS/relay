# relay

[![Bun](https://img.shields.io/badge/Bun-1.2.0+-black?logo=bun)](https://bun.sh)

A CLI for managing AI API providers — **Z.AI**, **MiniMax**, and more — with a built-in HTTP proxy for seamless [Claude Code](https://claude.ai/code) integration.

## Why relay?

Claude Code caches the model name and base URL at session start. Swapping providers mid-session requires a full restart. With `relay proxy`, you point Claude Code at a local proxy once and **hot-switch providers at any time** without restarting.

## Quick start

```bash
# Install (not on npm — install directly from GitHub)
bun install -g github:ImBIOS/relay

# Add your accounts
relay account add --name zai --provider zai --key sk-xxx
relay account add --name minimax --provider minimax --key mmkey-xxx

# Start the proxy
relay proxy start

# Add to your Claude Code settings (~/.config/claude/settings.json)
# {
#   "env": {
#     "ANTHROPIC_AUTH_TOKEN": "relay",
#     "ANTHROPIC_BASE_URL": "http://127.0.0.1:8787/api/anthropic"
#   }
# }

# Switch providers on the fly — no Claude Code restart needed
relay account switch minimax
```

## Commands

| Command | Description |
|---------|-------------|
| `relay proxy start` | Start proxy on port 8787 |
| `relay proxy stop` | Stop the proxy |
| `relay proxy status` | Show status + recent request log |
| `relay account list` | List all configured accounts |
| `relay account switch <name>` | Switch active account/provider |
| `relay account add` | Add a new account |
| `relay dashboard` | Open the web dashboard |

## How the proxy works

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

Model-based routing is automatic: `glm-*` → Z.AI, `minimax-*`/`MiniMax-*` → MiniMax.

## Repo structure

```
relay/
├── src/
│   ├── commands/
│   │   ├── proxy/       # proxy start/stop/status
│   │   ├── account/     # account management
│   │   ├── auto/        # auto-rotation
│   │   └── ...
│   ├── config/          # accounts-config, settings
│   ├── proxy/           # server.ts — the actual HTTP proxy
│   └── providers/       # Z.AI, MiniMax provider definitions
├── packages/
│   └── plugins/         # OpenCode-compatible plugins
└── bin/relay.js
```
