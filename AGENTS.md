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

This project uses a structured documentation system in `.relay/`:

- **`.relay/specs/`** — Feature specifications. Every feature must have a spec.
- **`.relay/qa/`** — QA test plans. Every spec must have a corresponding QA doc.
- **`.relay/patches/`** — Fork customizations with intent (for forked repos).
- **`.relay/upstream.json`** — Fork sync configuration.

**Rules for AI agents:**
1. Before implementing a feature, check if a spec exists. If not, create one using `.relay/specs/_template.md`.
2. After implementing, update the spec status and create/update the QA doc.
3. When working on a fork, use `.relay/patches/` to record customizations.
4. See `.relay/README.md` for full details.

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
| `.relay/` | Spec/QA/Patch documentation |
