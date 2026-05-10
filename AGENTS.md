# AGENTS.md — Relay

## Project Overview

Relay is a CLI for managing AI API providers (Z.AI, MiniMax) with a built-in HTTP proxy for seamless ForgeCode integration. It enables hot-switching providers without restarting sessions.

## Tech Stack

- **Runtime**: Bun 1.2.0+
- **Language**: TypeScript (ESM, strict)
- **CLI Framework**: oclif + Ink (React-based terminal UI)
- **Linting**: oxlint + oxfmt (OXC)
- **Testing**: Bun test runner

## Architecture

```
src/
├── cli.ts              # CLI entry point
├── run.ts              # Main runner
├── commands/           # CLI commands (proxy, account, hooks, auto, usage, doctor)
├── config/             # accounts-config.ts (primary), settings.ts (legacy compat)
├── proxy/              # HTTP proxy server
├── providers/          # Provider definitions (Z.AI, MiniMax)
├── sdk/                # SDK for programmatic access (community-maintained)
├── tests/integration/  # Docker-isolated integration tests
├── utils/              # Logger, telemetry, format, validation
└── ui/                 # Ink UI components
```

## Support Policy

**Officially supported features (maintained by @ImBIOS):**

- Proxy server (`relay proxy start/stop/status`)
- Account management (`relay account add/list/switch/edit/remove/migrate-names`)
- ForgeCode hooks (`relay hooks forge-setup`, `relay hooks forge-stop`)
- Claude Code hook integration (`relay hooks session-start`, `relay hooks install/uninstall/status`)
- Usage & diagnostics (`relay usage`, `relay doctor`)
- Auto-rotation (`relay auto enable/disable/status`)
- Telemetry & analytics (`relay analytics`)

**Community-maintained features:**

These are provided as-is. Breaking changes are acceptable. Contributors from those tools' communities are welcome to submit fixes. Files are marked with `COMMUNITY-MAINTAINED` header comments.

- OpenCode integration (`relay opencode`)
- Direct Claude CLI wrapper (`relay claude`)
- Session-end commit prompt (`relay hooks stop`)
- SDK (`src/sdk/index.ts`)

## Account Naming Convention

Account names **must** be the email address associated with the API key. This allows logs to identify which quota is being consumed. Enforced by `src/utils/validate.ts`.

## Development Commands

```bash
bun install            # Install dependencies
bun run check          # Lint (oxlint) + format check (oxfmt)
bun run check:fix      # Lint fix + format write
bun run lint           # oxlint only
bun run format         # oxfmt write
bun run typecheck      # TypeScript strict check
bun run build          # Build oclif bundle
bun test               # Run unit tests
bun src/run.ts         # Run CLI locally
```

## Testing

### Unit Tests (host-safe)

```bash
bun test                           # All tests
bun test src/config/               # Config tests only
bun test src/commands/auto/hook.test.ts  # Hook tests
```

### Integration Tests (Docker-required)

ForgeCode integration tests MUST run inside Docker containers to avoid polluting the host environment.

```bash
# Build test image
docker build -f Dockerfile.test -t relay-test .

# Run all integration tests
docker run --rm relay-test src/tests/integration/

# Run specific test
docker run --rm relay-test src/tests/integration/usage-timeout.integration.test.ts

# Run with real API keys
docker run --rm \
  -e ZAI_API_KEY="${ZAI_API_KEY}" \
  -e MINIMAX_API_KEY="${MINIMAX_API_KEY}" \
  relay-test src/tests/integration/
```

## Maintainability Rules

1. **No new commands without a test.** Every command must have a unit test and a row in the manual test matrix.
2. **ForgeCode integration tests always in Docker.** If a test touches `forge`, the proxy, or real API endpoints, it lives in `src/tests/integration/` and runs in the Docker test image.
3. **Account names must be emails.** Use `isValidEmail()` from `src/utils/validate.ts`.
4. **Timeout every external HTTP call.** Both `fetch()` and `response.json()` must be protected. Use the two-layer timeout pattern (AbortController + Promise.race).
5. **OXC is the linter.** No `biome`, no `eslint`. `bun run check` runs `oxlint && oxfmt --check`.
6. **Config writes are atomic.** Always write to `.tmp` then `renameSync`. Never write directly to the config file.
7. **Other AI tools are community-maintained.** If a PR touches only community-marked files and CI for core tests passes, it can merge without full manual testing.
8. **No `require()` in ESM.** Use top-level `import` statements. The `typescript/no-require-imports` oxlint rule enforces this.
9. **Use the config cache.** `loadConfig()` caches by mtime. Call `loadConfig()` freely; it's cheap.

## Key Files

| File                            | Purpose                                   |
| ------------------------------- | ----------------------------------------- |
| `src/proxy/server.ts`           | HTTP proxy implementation                 |
| `src/providers/zai.ts`          | Z.AI provider (usage, config)             |
| `src/providers/minimax.ts`      | MiniMax provider (usage, config)          |
| `src/config/accounts-config.ts` | Account management (primary config)       |
| `src/config/settings.ts`        | Legacy provider config (backward compat)  |
| `src/commands/hooks/`           | ForgeCode hook commands                   |
| `src/utils/telemetry.ts`        | Append-only JSONL telemetry               |
| `src/utils/validate.ts`         | Email validation                          |
| `src/utils/format.ts`           | Shared number/time formatting             |
| `.oxlintrc.json`                | OXC lint configuration                    |
| `Dockerfile.test`               | Docker test image for integration tests   |
