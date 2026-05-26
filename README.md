# Relay — Universal AI API Proxy

[![Bun](https://img.shields.io/badge/Bun-1.2.0+-black?logo=bun)](https://bun.sh)
[![GitHub](https://img.shields.io/badge/GitHub-ImBIOS/relay-blue?logo=github)](https://github.com/ImBIOS/relay)

A CLI for managing and hot-switching LLM providers with a built-in HTTP proxy. Works with **any AI coding agent** (Claude Code, ForgeCode, OpenCode, Cline, Aider, Continue, etc.) and **any provider** that speaks the Anthropic or OpenAI API.

## Supported Providers

| Provider | Protocol | Model Source | Auth |
|----------|----------|-------------|------|
| **GitHub Copilot** | OpenAI | Dynamic (`/models`) | OAuth / PAT |
| **OpenAI** | OpenAI | Dynamic (`/v1/models`) | API key |
| **Anthropic** | Anthropic | Dynamic | API key |
| **Z.AI (GLM)** | Anthropic | Static (13 models) | API key |
| **MiniMax** | Anthropic | Static (7 models) | API key |
| **OpenRouter** | OpenAI | Dynamic | API key |
| **Google AI Studio** | OpenAI | Static (7 models) | API key |
| **Groq** | OpenAI | Dynamic | API key |
| **Cerebras** | OpenAI | Dynamic | API key |
| **xAI (Grok)** | OpenAI | Dynamic | API key |
| **DeepSeek** | OpenAI | Dynamic | API key |
| **Ollama** | OpenAI | Dynamic (local) | None |
| **OpenAI-Compatible** | OpenAI | User-defined | API key |
| **Anthropic-Compatible** | Anthropic | User-defined | API key |

Adding a new provider only requires an entry in the provider registry — no code changes needed.

## Why Relay?

AI coding agents cache the model name and base URL at session start. Swapping providers mid-session requires a full restart. With `relay proxy`, you point your agent at a local proxy once and **hot-switch providers at any time** without restarting.

Key features:

- **Agent-agnostic** — works with any tool that speaks Anthropic or OpenAI protocol
- **Provider-agnostic** — transparently routes to 14+ providers with automatic protocol translation
- **Hot-switch providers** — change between Copilot, OpenAI, Anthropic, Z.AI, or any supported provider without restarting your session
- **Auto-rotation** — automatically cycle through accounts when quotas are exhausted
- **Protocol translation** — transparent Anthropic-to-OpenAI translation so agents speaking one protocol can use providers speaking the other
- **Usage tracking** — real-time quota monitoring with percentage used and reset timers
- **Dynamic model discovery** — fetch available models from provider APIs, with user-overridable model lists
- **Multi-account** — add multiple accounts per provider, switch freely

## Installation

### From GitHub

```bash
# Install from main branch — requires git and pnpm
pnpm install -g github:ImBIOS/relay
```

### Option A: Non-interactive (Docker/CI)

```bash
# Add accounts with API keys
relay account add --name "user@z.ai" --provider zai --key sk-xxx --activate
relay account add --name "user@minimax.com" --provider minimax --key mmkey-xxx

# Or use relay init for guided onboarding
relay init --providers zai,minimax --zai-api-key sk-xxx --minimax-api-key mmkey-xxx --install-hooks

# Start proxy
relay proxy status   # auto-starts if not running
```

### Option B: GitHub Copilot via OAuth

```bash
# Interactive OAuth device flow — opens browser for authentication
relay account login copilot

# Or add with a fine-grained PAT
relay account add --name "you@github.com" --provider copilot --key github_pat_xxx
```

### Option C: Run from source

```bash
git clone https://github.com/ImBIOS/relay.git
cd relay
bun install
bun src/run.ts account add   # interactive
bun src/run.ts proxy status
```

## Configuration

Relay exposes a local proxy that any AI agent can connect to. Point your agent at `http://127.0.0.1:8787/api/anthropic` with any auth token (e.g. `relay`).

### Claude Code

`relay init --install-hooks` writes the required environment and installs a SessionStart hook automatically.

To configure manually, add to `~/.claude/settings.json`:

```json
{
  "env": {
    "ANTHROPIC_AUTH_TOKEN": "relay",
    "ANTHROPIC_BASE_URL": "http://127.0.0.1:8787/api/anthropic"
  }
}
```

### ForgeCode

Add to `.forge.toml`:

```toml
[anthropic]
api_key = "relay"
base_url = "http://127.0.0.1:8787/api/anthropic"
```

### OpenCode

Add to `opencode.json`:

```json
{
  "provider": {
    "anthropic": {
      "apiKey": "relay",
      "baseURL": "http://127.0.0.1:8787/api/anthropic"
    }
  }
}
```

### Any Agent

Any tool that supports custom Anthropic or OpenAI base URLs can use Relay. Set the base URL to `http://127.0.0.1:8787/api/anthropic` (for Anthropic-protocol agents) or `http://127.0.0.1:8787/api/openai` (for OpenAI-protocol agents) and use any string as the API key.

## Commands

### Proxy

| Command | Description |
|---------|-------------|
| `relay proxy start` | Start proxy on port 8787 |
| `relay proxy stop` | Stop the proxy |
| `relay proxy status` | Show status and recent request log |

### Account Management

| Command | Description |
|---------|-------------|
| `relay account list` | List all configured accounts |
| `relay account add` | Add a new account (interactive or with flags) |
| `relay account switch <ref>` | Switch by account id, name, or provider |
| `relay account edit <id>` | Edit account name, API key, OAuth token |
| `relay account remove <id>` | Remove an account |
| `relay account login copilot` | Login to GitHub Copilot via OAuth device flow |
| `relay account migrate` | Migrate legacy configs to accounts system |

### Models

| Command | Description |
|---------|-------------|
| `relay models` | List models for all providers |
| `relay models --provider copilot` | Show models for a specific provider |
| `relay models refresh` | Fetch latest models from provider APIs |
| `relay models refresh --provider copilot` | Refresh a specific provider |
| `relay models add --provider zai --id glm-6 --name "GLM-6"` | Add a custom model |
| `relay models remove --provider zai --id glm-4.3` | Remove a custom model |
| `relay models reset --provider zai` | Reset to built-in defaults |

### Monitoring

| Command | Description |
|---------|-------------|
| `relay usage` | Show usage for active account |
| `relay usage --all` | Show usage for all accounts |
| `relay usage --json` | JSON output for scripting |
| `relay doctor` | Diagnose configuration issues |
| `relay analytics` | Show telemetry summary |

### Auto-Rotation

| Command | Description |
|---------|-------------|
| `relay auto enable` | Enable automatic account rotation |
| `relay auto disable` | Disable auto-rotation |
| `relay auto status` | Show rotation status |

## How It Works

```
Any AI Agent
(Claude Code, ForgeCode, OpenCode, Cline, Aider, Continue, ...)
        │
        │  POST /api/anthropic/v1/messages
        │  (Authorization: Bearer relay)
        │
  ┌─────▼──────┐
  │ relay proxy │
  │             │
  │  • Auth: replaces token with real API key
  │  • Routing: sends to active provider
  │  • Translation: Anthropic ↔ OpenAI as needed
  │  • Logging: timestamp, model, provider, latency
  └─────┬──────┘
        │
   ┌────┼────────────────┐
   │    │                │
   ▼    ▼                ▼
Z.AI  MiniMax    GitHub Copilot
       │          │
       ▼          ▼
    OpenAI    OpenRouter
    Anthropic  DeepSeek
    Groq       Ollama
    ...        ...
```

**Routing and translation**: The proxy routes requests based on the active account's provider. For providers that speak Anthropic protocol (Z.AI, MiniMax, Anthropic), requests pass through directly. For OpenAI-protocol providers (Copilot, OpenAI, DeepSeek, Groq, etc.), the proxy translates between Anthropic and OpenAI wire formats transparently — so any agent can talk to any provider.

## Model Management

Relay supports three sources of model definitions, resolved in priority order:

1. **User overrides** — custom models added via `relay models add`
2. **Cached fetch** — models fetched from provider APIs via `relay models refresh` (cached for 7 days)
3. **Built-in static** — hardcoded defaults from the provider registry

This means you can always stay current:
- Run `relay models refresh` to fetch the latest models from providers that support it
- Add custom models with `relay models add` if a provider releases a new model before Relay is updated
- Reset to defaults with `relay models reset` at any time

## Usage Tracking

Relay fetches real usage data from providers that expose quota APIs:

- **GitHub Copilot**: Premium interactions, chat, and completions quotas via `copilot_internal/user`
- **Z.AI**: Token limits (daily and weekly) with reset timers
- **MiniMax**: Token usage with quota tracking

```
$ relay usage

  github-copilot@ImBIOS — GitHub Copilot
  Plan: individual
  Premium Interactions: 67 / 300 (22.4% used)
  Resets at 07:00 on 1 Jun (397h left)
```

## Notes for Docker and CI

- `relay account add --name ... --provider ... --key ...` is safe for non-interactive environments
- `relay init --providers ... --install-hooks` sets up everything in one command
- Interactive flows (`relay account add`, `relay account login copilot`) require a TTY
- `relay account switch <provider>` works when the provider resolves to exactly one account

## Tech Stack

- **Runtime**: [Bun](https://bun.sh) 1.2.0+
- **Language**: TypeScript (ESM, strict)
- **CLI Framework**: oclif + Ink (React-based terminal UI)
- **Linting**: oxlint + oxfmt (OXC)
- **Testing**: Bun test runner

## Repo Structure

```
relay/
├── src/
│   ├── commands/
│   │   ├── account/       # add, list, switch, edit, remove, login, migrate
│   │   ├── proxy/         # start, stop, status
│   │   ├── auto/          # enable, disable, status
│   │   ├── hooks/         # session-start, forge-setup, install
│   │   ├── models.tsx     # list, add, remove, refresh, reset
│   │   ├── usage.tsx      # usage tracking
│   │   └── doctor.tsx     # diagnostics
│   ├── config/
│   │   ├── accounts-config.ts     # account management
│   │   ├── provider-registry.ts   # 14 provider definitions
│   │   ├── provider-metadata.ts   # provider metadata helpers
│   │   ├── models-cache.ts        # user-overridable model storage
│   │   └── settings.ts            # legacy config compat
│   ├── proxy/
│   │   ├── server.ts              # HTTP proxy with protocol translation
│   │   └── translators/
│   │       └── anthropic-openai.ts # Anthropic ↔ OpenAI translation
│   ├── providers/
│   │   ├── base.ts        # provider interface
│   │   ├── zai.ts         # Z.AI provider
│   │   ├── minimax.ts     # MiniMax provider
│   │   └── copilot.ts     # GitHub Copilot provider
│   └── utils/             # logger, telemetry, format, validation
└── bin/relay.bundled.js   # optional bundled build
```

## License

MIT
