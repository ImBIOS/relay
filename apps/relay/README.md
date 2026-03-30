# coding-helper - Z.AI, MiniMax & OpenCode API Manager

[![NPM Version](https://img.shields.io/npm/v/%40imbios%2Fcoding-helper?logo=npm)](https://www.npmjs.com/package/@imbios/coding-helper)
[![NPM Downloads](https://img.shields.io/npm/dm/%40imbios%2Fcoding-helper)](https://www.npmjs.com/package/@imbios/coding-helper)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Bun](https://img.shields.io/badge/Bun-1.2.0+-black?logo=bun)](https://bun.sh)

A powerful **CLI tool** and **Agent SDK wrapper** for seamless management of Z.AI (GLM), MiniMax, and OpenCode API providers. Switch between providers, manage multiple accounts, track usage, rotate API keys, and use with Claude Code, OpenCode, or Claude Agent SDK directly from your code.

## What is coding-helper?

coding-helper is a developer utility that enables users to switch between Z.AI (GLM), MiniMax, and OpenCode API providers without code changes. It provides:

- **Provider switching** - Toggle between Z.AI, MiniMax, and OpenCode instantly
- **Multi-account management** - Configure and switch between multiple API accounts
- **API key rotation** - Automatic rotation with configurable strategies
- **Usage tracking** - Monitor quotas, costs, and consumption in real-time
- **Agent SDK integration** - Use auto-rotation directly in your code
- **Claude Code wrapper** - Spawn Claude with automatic provider switching
- **OpenCode support** - Experimental support for OpenCode (future default)

## Features

### Provider Management

| Feature | Description |
|---------|-------------|
| **Unified CLI** | Configure and switch providers with simple commands |
| **Interactive Setup** | Guided configuration wizard |
| **Multi-Account Support** | Manage multiple accounts per provider |
| **API Key Rotation** | Round-robin, least-used, priority, or random strategies |

### Monitoring & Tracking

| Feature | Description |
|---------|-------------|
| **Real-time Usage** | Monitor API consumption from provider APIs |
| **Usage History** | Visualize patterns over last 30 days |
| **Cost Estimation** | Calculate costs for different models |
| **Alert System** | Get notified when approaching limits |

### Developer Experience

| Feature | Description |
|---------|-------------|
| **Agent SDK Wrapper** | Use auto-rotation in your code with `@imbios/coding-helper/sdk` |
| **Claude Code Integration** | Spawn `claude` command with auto-rotation |
| **OpenCode Integration** | Spawn `opencode` with auto-rotation (experimental) |
| **Shell Completion** | Full tab completion for bash, zsh, fish |
| **Web Dashboard** | Visual monitoring on port 3456 |

## Quick Start

### Installation

```bash
# Install globally from GitHub (recommended)
npm install -g github:ImBIOS/coding-helper

# Or with bun
bun add -g github:ImBIOS/coding-helper
```

### User-Level Setup

Initialize your user-level configuration to configure accounts and preferences:

```bash
cohe init
```

### Basic CLI Usage

```bash
# Add API accounts (uses provider's default model automatically)
cohe account add

# Switch between accounts
cohe account switch <account-id>

# Check status
cohe status

# View usage
cohe usage
```

### Using with OpenCode (Experimental)

OpenCode is an open-source alternative to Claude Code. **This is experimental support** - we plan to make OpenCode the default in the future (unless Claude Code becomes open-source).

> **Future Direction:** Once OpenCode matures and proves stable, it will become the default provider for `cohe` commands. This ensures users have an open-source, freely available AI coding assistant option. If Anthropic ever open-sources Claude Code, we will revert to supporting it as the default.

```bash
# Run opencode with auto-rotation
cohe opencode

# Pass through any opencode arguments
cohe opencode --continue
cohe opencode --help

# Setup OpenCode configuration
cohe opencode --setup

# Check OpenCode status
cohe opencode --status
```

OpenCode uses the same environment variable substitution as Claude Code, allowing seamless rotation between accounts.

### Using with Claude Code

The `cohe claude` command spawns Claude Code with automatic provider/account rotation:

```bash
# Run claude with auto-rotation
cohe claude

# Pass through any claude arguments
cohe claude --continue
cohe claude --help
```

Behind the scenes, this sets all required environment variables according to official documentation:

**For Z.AI:**
```bash
ANTHROPIC_AUTH_TOKEN=<zai_api_key>
ANTHROPIC_BASE_URL=https://api.z.ai/api/anthropic
ANTHROPIC_DEFAULT_OPUS_MODEL=GLM-4.7
ANTHROPIC_DEFAULT_SONNET_MODEL=GLM-4.7
ANTHROPIC_DEFAULT_HAIKU_MODEL=GLM-4.5-Air
ANTHROPIC_SMALL_FAST_MODEL=GLM-4.5-Air
```

**For MiniMax:**
```bash
ANTHROPIC_AUTH_TOKEN=<minimax_api_key>
ANTHROPIC_BASE_URL=https://api.minimax.io/anthropic
ANTHROPIC_DEFAULT_OPUS_MODEL=MiniMax-M2.1
ANTHROPIC_DEFAULT_SONNET_MODEL=MiniMax-M2.1
ANTHROPIC_DEFAULT_HAIKU_MODEL=MiniMax-M2.1
ANTHROPIC_SMALL_FAST_MODEL=MiniMax-M2.1
```

## Agent SDK Integration

Use the auto-rotation feature directly in your code with the Agent SDK wrapper:

### Installation

```bash
# Install as a project dependency
bun add @imbios/coding-helper @anthropic-ai/claude-agent-sdk

# Or with npm
npm install @imbios/coding-helper @anthropic-ai/claude-agent-sdk
```

### Basic Usage

```typescript
import { query } from "@imbios/coding-helper/sdk";

// Automatically rotates between accounts on each call
for await (const message of query({
  prompt: "Fix the bug in auth.py",
  options: {
    allowedTools: ["Read", "Edit", "Bash"],
    logRotation: true  // Log when rotation occurs
  }
})) {
  if (message.type === "result") {
    console.log(message.result);
  }
}
```

### Advanced Usage

```typescript
import {
  getAutoRotatedEnv,
  performAutoRotation,
  getActiveCredentials
} from "@imbios/coding-helper/sdk";
import { query as sdkQuery } from "@anthropic-ai/claude-agent-sdk";

// Option 1: Get rotated environment and use with original SDK
async function runWithRotation() {
  await performAutoRotation(); // Manually trigger rotation
  const env = await getAutoRotatedEnv(); // Get env vars for active account
  
  for await (const message of sdkQuery({
    prompt: "Write a React component",
    options: { env }
  })) {
    // Handle messages...
  }
}

// Option 2: Check current credentials before running
function checkBeforeRun() {
  const creds = getActiveCredentials();
  if (!creds) {
    console.error("No accounts configured!");
    return;
  }
  
  console.log(`Using: ${creds.provider} - ${creds.accountName}`);
  console.log(`Model: ${creds.model}`);
}
```

### Rotation Strategies

Configure rotation strategy with:

```bash
# Enable rotation with specific strategy
cohe auto enable round-robin
cohe auto enable least-used --cross-provider
cohe auto enable random
cohe auto enable priority

# Disable rotation
cohe auto disable

# Check rotation status
cohe auto status
```

**Available strategies:**
- `round-robin` - Cycle through accounts in order
- `least-used` - Pick account with lowest API usage (fetches real data from provider)
- `priority` - Pick highest priority account
- `random` - Randomly select an account

## Supported Models

### Z.AI (GLM)

| Model | Tier | Use Case |
|-------|------|----------|
| `GLM-4.7` | Opus | Most capable, complex tasks |
| `GLM-4.5-Air` | Haiku | Fast, efficient responses |

### MiniMax

| Model | Tier | Use Case |
|-------|------|----------|
| `MiniMax-M2.1` | All | Latest flagship model |

### OpenCode (Experimental)

OpenCode uses the same underlying models (Z.AI, MiniMax) but provides an open-source CLI experience. The models available depend on your provider configuration.

| Model | Provider | Use Case |
|-------|----------|----------|
| `claude-sonnet-4-5` | Z.AI | Claude 4.5 via Z.AI |
| `MiniMax-M2.5` | MiniMax | Claude-compatible via MiniMax |

## Commands Reference

### Core Commands

| Command | Description |
|---------|-------------|
| `cohe account add` | Add new API account (auto-selects default model) |
| `cohe account list` | List all configured accounts |
| `cohe account switch <id>` | Switch to specific account |
| `cohe account remove <id>` | Remove an account |
| `cohe status` | Show current provider and status |
| `cohe usage` | Query usage statistics from API |
| `cohe history` | Show usage history (30 days) |
| `cohe test` | Test API connection |

### Auto-Rotation Commands

| Command | Description |
|---------|-------------|
| `cohe auto enable [strategy]` | Enable auto-rotation |
| `cohe auto disable` | Disable auto-rotation |
| `cohe auto status` | Show rotation status |
| `cohe auto rotate` | Manually trigger rotation |

### Provider Commands (Legacy)

| Command | Description |
|---------|-------------|
| `cohe config` | Interactive provider configuration |
| `cohe switch <provider>` | Switch active provider (zai/minimax) |

### Other Commands

| Command | Description |
|---------|-------------|
| `cohe claude [args...]` | Spawn Claude Code with auto-rotation |
| `cohe opencode [args...]` | Spawn OpenCode with auto-rotation (experimental) |
| `cohe opencode --setup` | Setup OpenCode configuration |
| `cohe opencode --status` | Check OpenCode configuration status |
| `cohe dashboard start [port]` | Start web dashboard |
| `cohe alert list` | List usage alerts |
| `cohe doctor` | Diagnose configuration issues |
| `cohe completion <shell>` | Generate shell completion |

## Configuration

### Configuration File

All accounts and settings are stored in `~/.claude/imbios.json`:

```json
{
  "version": "2.0.0",
  "accounts": {
    "acc_123": {
      "id": "acc_123",
      "name": "my-zai-account",
      "provider": "zai",
      "apiKey": "sk-...",
      "baseUrl": "https://api.z.ai/api/anthropic",
      "priority": 0,
      "isActive": true,
      "createdAt": "2025-01-01T00:00:00.000Z",
      "usage": {
        "used": 0.5,
        "limit": 100,
        "lastUpdated": "2025-01-01T12:00:00.000Z"
      }
    }
  },
  "activeAccountId": "acc_123",
  "rotation": {
    "enabled": true,
    "strategy": "round-robin",
    "crossProvider": true
  }
}
```

### Environment Variables

coding-helper respects the following environment variables:

- `ZAI_API_KEY` - Z.AI API key (for legacy provider config)
- `MINIMAX_API_KEY` - MiniMax API key (for legacy provider config)
- `IMBIOS_CONFIG_PATH` - Custom path to config file

## Examples

### Example 1: Basic Multi-Account Setup

```bash
# Add multiple accounts
cohe account add
# Enter name: work-zai
# Select provider: Z.AI (zai)
# Enter API key: sk-...
# (Model is auto-selected based on provider)

cohe account add
# Enter name: personal-minimax
# Select provider: MiniMax
# Enter API key: sk-...

# Enable cross-provider rotation
cohe auto enable random --cross-provider

# Use with Claude Code
cohe claude

# Or use OpenCode (experimental)
cohe opencode
```

### Example 2: Using with Agent SDK

```typescript
// my-script.ts
import { query } from "@imbios/coding-helper/sdk";

async function main() {
  for await (const message of query({
    prompt: "Analyze this codebase and suggest improvements",
    options: {
      allowedTools: ["Read", "Grep", "Bash"],
      logRotation: true
    }
  })) {
    if (message.type === "result") {
      console.log(message.result);
    }
  }
}

main();
```

Run with:
```bash
bun run my-script.ts
```

### Example 3: Priority-Based Rotation

```bash
# Add accounts with different priorities
cohe account add  # priority 0 (default)
# Edit ~/.claude/imbios.json to set priorities:
# "priority": 10  # High priority account
# "priority": 1   # Medium priority account
# "priority": 0   # Low priority (fallback)

# Enable priority-based rotation
cohe auto enable priority

# Now it will always use the highest priority account
```

## Requirements

- **Runtime**: Bun 1.2.0+ or Node.js 18+
- **Shell**: Bash, Zsh, or Fish
- **OS**: Linux, macOS, Windows (WSL)

## Technology Stack

- **Language**: TypeScript (ES2022)
- **Runtime**: Bun (primary), Node.js (fallback)
- **UI Framework**: Ink (React for CLI)
- **Code Quality**: Biome with Ultracite preset

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature-amazing-feature`)
5. Open a Pull Request

## Support

- **NPM Package**: [@imbios/coding-helper](https://www.npmjs.com/package/@imbios/coding-helper)
- **Issues**: [GitHub Issues](https://github.com/ImBIOS/coding-helper/issues)
- **Author**: [ImBIOS](https://github.com/ImBIOS)

## Keywords

anthropic-api, claude-code, claude-agent-sdk, opencode, open-code, glm, minimax, api-client, cli-tool, provider-management, api-key-rotation, usage-tracking, auto-rotation, multi-account, developer-tools, ai-assistant, terminal-tool, zai-api, glmmodel, bun, typescript
