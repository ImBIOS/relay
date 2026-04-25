# AGENTS.md — Relay

## Project Overview

Relay is a CLI for managing AI API providers (Z.AI, MiniMax, etc.) with a built-in HTTP proxy for seamless Claude Code integration. It enables hot-switching providers without restarting Claude Code sessions.

## Tech Stack

- **Runtime**: Bun 1.2.0+
- **Language**: TypeScript
- **CLI Framework**: Custom (Ink for interactive, raw args for non-interactive)
- **Testing**: Bun test runner

## Architecture

```
src/
├── cli.ts              # CLI entry point
├── run.ts              # Main runner
├── commands/           # CLI commands (proxy, account, init, dashboard, etc.)
├── config/             # Accounts config, settings, MCP, profiles
├── proxy/              # HTTP proxy server
├── providers/          # Provider definitions (Z.AI, MiniMax)
├── sdk/                # SDK for programmatic access
├── utils/              # Logger, completion, isolation, container, prompts
└── ui/                 # Ink UI components
```

## Relay Spec, QA & Patch System

This project uses a feature-based documentation system in `.relay/`:

```
.relay/
├── registry.json          # Master registry of all features
├── upstream.json          # Fork sync configuration (if this is a fork)
└── features/
    └── <NNN>-<slug>/
        ├── spec.md        # Feature specification
        ├── qa.md          # QA test plan (always paired with spec)
        └── patch.md       # Fork patch with intent (only if forked)
```

**Rules for AI agents:**
1. Before implementing a feature, check if a folder exists in `.relay/features/`. If not, create one with `spec.md`.
2. After implementing, update the spec status and create/update `qa.md` in the same folder.
3. When working on a fork, add `patch.md` to the feature folder to record customizations with intent.
4. Every feature folder with a `spec.md` must also have a `qa.md`.
5. See `.relay/README.md` for full details.

## Development Commands

```bash
bun install          # Install dependencies
bun test             # Run tests
bun src/run.ts       # Run CLI locally
```

## Key Files

| File | Purpose |
|------|---------|
| `src/proxy/server.ts` | HTTP proxy implementation |
| `src/providers/` | Provider definitions |
| `src/config/accounts-config.ts` | Account management |
| `src/commands/` | CLI commands |
| `.relay/` | Feature documentation (spec, QA, patches) |
