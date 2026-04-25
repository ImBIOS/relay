# relay

[![Bun](https://img.shields.io/badge/Bun-1.2.0+-black?logo=bun)](https://bun.sh)

A CLI for managing AI API providers — **Z.AI**, **MiniMax**, and more — with a built-in HTTP proxy for seamless [Claude Code](https://claude.ai/code) integration.

## Why relay?

Claude Code caches the model name and base URL at session start. Swapping providers mid-session requires a full restart. With `relay proxy`, you point Claude Code at a local proxy once and **hot-switch providers at any time** without restarting.

## Quick start

### Option A: install globally from GitHub

```bash
# Install (not on npm — install directly from GitHub)
bun install -g github:ImBIOS/relay

# Non-interactive onboarding (works in Docker/CI too)
relay init \
  --providers zai,minimax \
  --zai-api-key sk-xxx \
  --minimax-api-key mmkey-xxx \
  --install-hooks

# Claude SessionStart will auto-ensure the proxy after hooks are installed.
# You can still start it manually if you want to verify it immediately.
relay proxy status

# Or add accounts individually instead of running relay init
relay account add --name zai --provider zai --key sk-xxx --activate
relay account add --name minimax --provider minimax --key mmkey-xxx

# Switch accounts on the fly — no Claude Code restart needed
relay account switch minimax
```

### Option B: run from a source checkout

```bash
git clone https://github.com/ImBIOS/relay.git
cd relay
bun install

# Run the local checkout without a global install
bun src/run.ts init --providers zai --zai-api-key sk-xxx --install-hooks
bun src/run.ts proxy status
```

### Interactive onboarding

If you are in a TTY-enabled terminal, you can use the interactive flows instead:

```bash
relay init
relay account add
```

### Claude Code settings

`relay init --install-hooks` writes the required Claude Code environment automatically and installs a SessionStart hook that keeps Claude pointed at the local proxy and auto-starts it when needed.

If you prefer to wire it manually, add the relay proxy environment to `~/.claude/settings.json`:

```json
{
  "env": {
    "ANTHROPIC_AUTH_TOKEN": "relay",
    "ANTHROPIC_BASE_URL": "http://127.0.0.1:8787/api/anthropic"
  }
}
```

## Commands

| Command | Description |
|---------|-------------|
| `relay proxy start` | Start proxy on port 8787 manually |
| `relay proxy stop` | Stop the proxy |
| `relay proxy status` | Show status + recent request log |
| `relay account list` | List all configured accounts |
| `relay account switch <reference>` | Switch by account id, name, or provider |
| `relay account add` | Add a new account interactively |
| `relay account add --name ... --provider ... --key ...` | Add a new account non-interactively |
| `relay init` | Interactive first-run onboarding |
| `relay init --providers ...` | Non-interactive onboarding for Docker/CI |
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

## Notes for Docker and CI

- `relay init --providers ...` and `relay account add --name ... --provider ... --key ...` are safe for non-interactive environments.
- `relay init --install-hooks` installs a Claude SessionStart hook that auto-ensures the proxy before Claude requests run.
- The interactive Ink flows (`relay init`, `relay account add`) require a TTY-enabled terminal.
- `relay account switch minimax` works when the provider resolves to exactly one account. If multiple accounts match, relay will ask you to switch by account id.

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
└── bin/relay.bundled.js   # optional bundled build output
```
