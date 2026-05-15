# GitHub Copilot Provider Support — Research & Analysis

## Research Summary

Comprehensive analysis of: (1) Relay's current provider architecture, (2) GitHub Copilot's authentication and API, (3) ForgeCode's provider abstraction, and (4) feasibility and recommended approach for adding GitHub Copilot to Relay.

---

## 1. Current Relay Provider Architecture

### 1.1 The Provider Interface (`src/providers/base.ts:35-41`)

All providers implement a four-method interface:

```typescript
interface Provider {
  name: string;
  displayName: string;
  getConfig(): ProviderConfig;            // returns { apiKey, baseUrl }
  testConnection(): Promise<boolean>;
  getUsage(options?: UsageOptions): Promise<UsageStats>;
}
```

`UsageOptions` (`src/providers/base.ts:6-9`) carries `apiKey?` and `groupId?`. The `groupId` is a MiniMax-specific extra credential; GitHub Copilot would need an analogous field for its two-step token exchange (detailed below).

### 1.2 Existing Provider Implementations

**Z.AI** (`src/providers/zai.ts`):
- Base URL: `https://api.z.ai/api/anthropic` — **Anthropic wire format**
- Auth: `Authorization: Bearer <api_key>` (simple, static key)
- Usage: `GET https://api.z.ai/api/monitor/usage/quota/limit`
- Time-based and token-based quota buckets with reset timestamps

**MiniMax** (`src/providers/minimax.ts`):
- Base URL: `https://api.minimax.io/anthropic` — **Anthropic wire format**
- Auth: `Authorization: Bearer <api_key>` + requires `groupId`
- Usage: `GET https://platform.minimax.io/v1/api/openplatform/coding_plan/remains?GroupId=<id>`

Both providers expose **Anthropic-compatible** chat completions endpoints. This is the architectural assumption baked into the entire proxy.

### 1.3 Provider Registration — Hardcoded Type Union

`AccountConfig.provider` (`src/config/accounts-config.ts:7`) is typed as `"zai" | "minimax"`. This literal union appears in **at least six places**:

| File | Location | Change Needed |
|------|----------|---------------|
| `src/config/accounts-config.ts` | `provider: "zai" \| "minimax"` | Add `"copilot"` |
| `src/config/provider-metadata.ts` | `PROVIDER_METADATA` record | Add metadata entry |
| `src/config/settings.ts` | Legacy config shim | Add compat case |
| `src/commands/account/add.tsx:109` | `addAccount({ provider: provider as "zai" \| "minimax" })` | Widen cast |
| `src/commands/account/add.tsx:117` | `settings.setProviderConfig(provider as "zai" \| "minimax", ...)` | Widen cast |
| `src/config/accounts-config.ts:264` | Provider dispatch in `fetchAndUpdateUsage()` | Add Copilot branch |

### 1.4 Proxy Server Routing (`src/proxy/server.ts:37-42`)

The proxy uses model-name prefix matching to select the provider:

```typescript
function getProviderForModel(model: string): string | null {
  const lower = model.toLowerCase();
  if (lower.startsWith("glm") || lower.startsWith("chatglm")) return "zai";
  if (lower.startsWith("minimax") || lower.startsWith("abab")) return "minimax";
  return null;
}
```

GitHub Copilot exposes dozens of models with heterogeneous prefixes (`gpt-4o`, `claude-3.5-sonnet`, `o1`, `gemini-2.0-flash`, etc.). This means simple prefix matching cannot cleanly discriminate Copilot models from any other OpenAI/Anthropic/Google provider. A different routing strategy is needed.

### 1.5 Critical Architectural Constraint: Anthropic Wire Format Lock-In

The proxy (`src/proxy/server.ts:103-132`) is a **dumb HTTP forwarder**: it replaces the `Authorization` header with the real API key and streams the body through unchanged. This design assumes every provider speaks the **Anthropic Messages API** format.

GitHub Copilot speaks **OpenAI Chat Completions** format. It has no published Anthropic-compatible endpoint. This is the single most significant obstacle to adding GitHub Copilot support.

---

## 2. GitHub Copilot Authentication Flow and API Endpoints

### 2.1 Authentication Modes

GitHub Copilot supports multiple auth methods for programmatic access:

| Token Type | Prefix | Use Case | Direct API Access |
|-----------|--------|----------|-------------------|
| OAuth device flow token | `gho_` | Interactive CLI login | With session token exchange |
| Fine-grained PAT (Copilot Requests permission) | `github_pat_` | CI/CD, automation | Direct (no exchange needed) |
| GitHub App user token | `ghu_` | SaaS apps via OAuth | Direct |
| Classic PAT | `ghp_` | N/A | **Not supported** |
| Environment variable | via `COPILOT_GITHUB_TOKEN` / `GH_TOKEN` | Automation | Direct |

### 2.2 The Two-Step Token Exchange (for OAuth Flow)

The `gho_` OAuth device flow token cannot be used directly with the Copilot API in many contexts. The proper flow requires:

1. **Device Code Request**: `POST https://github.com/login/device/code` with a valid OAuth App `client_id` that has `copilot` scope access
2. **Token Polling**: `POST https://github.com/login/oauth/access_token` — poll until user authorizes, receiving a `gho_` token
3. **Session Token Exchange**: `GET https://api.github.com/copilot_internal/v2/token` with `Authorization: Bearer <gho_token>` → returns a short-lived Copilot session token (~30 minute TTL)
4. **API Calls**: Use the session token in `Authorization: Bearer <session_token>`
5. **Token Refresh**: Session token must be refreshed proactively before expiry; failure to do so causes mid-session 401 errors

**Key complication**: The `client_id` used in Step 1 must be an OAuth App registered by GitHub (such as the VS Code extension's app) that GitHub's backend recognizes as having Copilot entitlement. Third-party apps using arbitrary client IDs have had consistent failures with the `copilot_internal/v2/token` endpoint.

**Simpler alternative that works**: Store a fine-grained PAT (`github_pat_`) with the **Copilot Requests** account permission. This token can be used directly as `Authorization: Bearer <pat>` without any exchange step. This is the pragmatic path for a CLI tool.

### 2.3 API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `https://api.githubcopilot.com/models` | GET | List available models (subscription-dependent) |
| `https://api.githubcopilot.com/chat/completions` | POST | Chat completions (OpenAI format) |
| `https://api.github.com/copilot_internal/v2/token` | GET | Session token exchange (requires valid `gho_` token) |

### 2.4 Required API Request Headers

Beyond `Authorization`, GitHub Copilot requires several integration-identifying headers:

```
editor-version: <app>/<version>
editor-plugin-version: <plugin>/<version>
Copilot-Integration-Id: vscode-chat   (or other registered integration)
```

Third-party tools that omit or use unrecognized `Copilot-Integration-Id` values have reported degraded model access. This is an additional complication not present with Z.AI or MiniMax.

### 2.5 Wire Protocol: OpenAI-Compatible, Not Anthropic

GitHub Copilot's chat completions API is fully OpenAI-compatible:
- Request body: `{"model": "gpt-4o", "messages": [...], "stream": true, ...}`
- Response: OpenAI `ChatCompletion` or `ChatCompletionChunk` (for SSE streaming)
- Tool calls: OpenAI function calling format (`tool_calls` array with `function.name`, `function.arguments`)

Claude Code sends **Anthropic Messages API** format (`content` blocks, `tool_use` / `tool_result`, etc.). These formats are **not wire-compatible** and require translation.

### 2.6 Usage/Quota Tracking

GitHub Copilot does not expose a simple REST endpoint for quota remaining analogous to Z.AI's `/monitor/usage/quota/limit`. Usage is tracked per-plan:

- **Free**: 2,000 code completions/month + 50 chat messages/month (limited models)
- **Pro**: Unlimited standard model requests; premium model usage metered (multiplier-based)
- **Business/Enterprise**: Seat-based; organization-level reporting

The closest available endpoint is the GitHub API's billing/rate_limit data, but it doesn't map cleanly to the `UsageStats` interface. `getUsage()` for Copilot would need to return an informational stub or make a best-effort call to `https://api.github.com/rate_limit`.

---

## 3. ForgeCode's Provider Abstraction

### 3.1 Data-Driven Configuration in `.forge.toml`

ForgeCode (Rust-based) uses a TOML configuration schema rather than hardcoded TypeScript classes. Key fields per `[[providers]]` entry:

| Field | Description |
|-------|-------------|
| `id` | Unique provider key |
| `url` | Chat completions endpoint (supports `{{VAR}}` template substitution) |
| `api_key_vars` | Environment variable name for the API key |
| `auth_methods` | Array: `["api_key"]`, `["google_adc"]`, etc. |
| `response_type` | Wire protocol: `OpenAI`, `OpenAIResponses`, `Anthropic`, `Bedrock`, `Google` |
| `models` | URL to fetch model list OR inline `[[providers.models]]` array |
| `custom_headers` | Extra headers on every request |
| `url_param_vars` | Variables to substitute into URL templates |

### 3.2 Dynamic Model Fetching

ForgeCode resolves models at runtime by:
1. If `models` is a URL string: making an authenticated GET request to that URL (using the same auth as chat completions), expecting an OpenAI `/v1/models` format response (`{"data": [{"id": "...", ...}]}`)
2. If `models` is an inline array: using the static definitions directly

For GitHub Copilot this would be: `models = "https://api.githubcopilot.com/models"` with `response_type = "OpenAI"`.

### 3.3 GitHub Copilot in ForgeCode

ForgeCode supports GitHub Copilot through **ForgeServices** — a managed gateway where Tailcall/ForgeCode handles all OAuth authentication and session token lifecycle server-side. Users authenticate once via browser (`/login` → ForgeServices). ForgeCode does not expose the raw `copilot_internal` token exchange to end users. This is architecturally very different from what Relay would need to do as a CLI tool.

A custom provider entry in `.forge.toml` can point at `api.githubcopilot.com` directly with `response_type = "OpenAI"` and `auth_methods = ["api_key"]`, accepting a fine-grained PAT directly in an environment variable.

### 3.4 Relay vs. ForgeCode Comparison

| Aspect | Relay | ForgeCode |
|--------|-------|-----------|
| Provider config | TypeScript classes + hardcoded types | TOML-driven, data-only |
| Protocol support | Anthropic only (proxy pass-through) | OpenAI, Anthropic, Bedrock, Google |
| Model listing | No dynamic fetching | URL-based fetching from `/models` endpoint |
| Auth extensibility | `apiKey + groupId` fields only | `auth_methods` array, env var indirection |
| Copilot integration | Not implemented | Via ForgeServices managed gateway |

---

## 4. Feasibility Assessment

### 4.1 What's Straightforward

These changes are fully mechanical and low-risk:

- Extending `provider: "zai" | "minimax"` to include `"copilot"` across all affected files
- Adding a `PROVIDER_METADATA` entry with the Copilot base URL
- Creating a `CopilotProvider` class skeleton implementing the `Provider` interface
- Storing a PAT or `gho_` token in `AccountConfig.apiKey`
- `testConnection()`: A `GET /models` call with 8s timeout (consistent with existing providers)
- `getUsage()`: Return a stub indicating subscription-based billing (no quota numbers)

### 4.2 What's Complex but Doable

These require non-trivial new logic but have clear paths:

**Token Refresh Logic**: If using OAuth device flow tokens (as opposed to fine-grained PATs), a session token with ~30 min TTL must be managed. This requires:
- A background timer or request-time lazy refresh
- Secure storage of the refresh state (separate from the static `apiKey` field in `AccountConfig`)
- This can be sidestepped entirely by requiring fine-grained PATs instead of device flow tokens

**Model Routing**: The proxy's current prefix-based routing (`glm-*` → zai) cannot work for Copilot because its model names (`gpt-4o`, `claude-3.5-sonnet`) overlap with other providers. Alternatives:
- Route by active account's provider field instead of model prefix when no prefix match found
- Add a `copilot:` model prefix convention (e.g., `copilot:gpt-4o`) that the proxy strips before forwarding
- Use explicit account selection flag per request

**Integration Headers**: All outbound Copilot requests need `editor-version`, `editor-plugin-version`, and `Copilot-Integration-Id` headers. These must be injected by the proxy for Copilot-targeted accounts. The proxy already has the account available at request time, making this a conditional header injection.

### 4.3 The Blocking Problem: Protocol Translation

This is the fundamental blocker. Claude Code sends Anthropic Messages API format. GitHub Copilot only accepts OpenAI Chat Completions format.

**Anthropic → OpenAI translation required for requests:**
- `content` array with typed blocks → flat `content` string or `content` array with OpenAI types
- `tool_use` / `tool_result` → `tool_calls` / `tool` role messages
- `system` parameter (Anthropic top-level) → `{"role": "system", "content": "..."}` message
- `max_tokens` (Anthropic) → `max_completion_tokens` or `max_tokens` (OpenAI)

**OpenAI → Anthropic translation required for responses:**
- `choices[0].message.content` → `content[0].text`
- `choices[0].message.tool_calls` → `content` blocks with `tool_use` type
- `choices[0].finish_reason` → `stop_reason`
- `usage.prompt_tokens` / `completion_tokens` → `usage.input_tokens` / `output_tokens`

**Streaming translation required:**
- OpenAI SSE: `data: {"choices": [{"delta": {...}}]}`
- Anthropic SSE: `data: {"type": "content_block_delta", "delta": {...}}`
- These are structurally very different event sequences

This translation layer is non-trivial. The community project `ericc-ch/copilot-api` has implemented this bidirectional translation and represents a working reference implementation that could be studied and ported.

**Estimated complexity**: Implementing a robust, streaming-capable Anthropic↔OpenAI translation layer is approximately 300-600 lines of new TypeScript in the proxy, plus comprehensive tests.

### 4.4 Scope Summary Matrix

| Feature | Complexity | Notes |
|---------|-----------|-------|
| Provider class + metadata | Low | Mechanical extension of existing pattern |
| Account config type extension | Low | Union type + metadata record |
| Fine-grained PAT auth | Low | No exchange needed, direct Bearer usage |
| Connection test (`/models`) | Low | Standard fetch with timeout |
| Usage stub | Low | Return subscription-indicator, no quota numbers |
| Copilot-required headers | Medium | Conditional injection in proxy per account.provider |
| Model routing disambiguation | Medium | Requires routing strategy change |
| Token session exchange + refresh | Medium | Needed only for `gho_` OAuth flow path |
| OAuth device flow login command | Medium | New Ink UI flow, browser redirect, token polling |
| **Anthropic ↔ OpenAI translation** | **High** | **Fundamental blocker for all Copilot traffic** |
| Streaming format translation | High | Nested inside protocol translation |
| Tool call format translation | High | Deeply nested, format-specific |

---

## 5. Recommended Implementation Approach

### 5.1 Phased Strategy

**Phase 1 — Provider Infrastructure (Low Risk)**

Lay all the non-proxy groundwork so GitHub Copilot appears as a valid provider in all CLI commands without yet enabling proxy traffic:

- [ ] Extend `AccountConfig.provider` union to `"zai" | "minimax" | "copilot"`
- [ ] Add `copilot` entry to `PROVIDER_METADATA` with `defaultBaseUrl: "https://api.githubcopilot.com"`
- [ ] Create `src/providers/copilot.ts` implementing `Provider` interface
- [ ] Implement `testConnection()` via `GET https://api.githubcopilot.com/models` with required Copilot headers and 8s timeout
- [ ] Implement `getUsage()` returning a subscription-based stub (`{ used: 0, limit: 0, remaining: 0, percentUsed: 0 }` with a metadata note)
- [ ] Update `src/commands/account/add.tsx` to include the `copilot` provider option, replacing the mandatory API key prompt with a note that a fine-grained PAT with "Copilot Requests" permission is required
- [ ] Update `src/config/accounts-config.ts:fetchAndUpdateUsage()` with a Copilot branch
- [ ] Add Copilot-specific `UsageOptions` if needed (e.g., a `githubUsername?` field for display)

**Phase 2 — Protocol Translation Layer (Core Enabler)**

Without this, no Copilot requests can actually reach the API. This is the highest-effort phase:

- [ ] Create `src/proxy/translators/anthropic-to-openai.ts` — request body translation
- [ ] Create `src/proxy/translators/openai-to-anthropic.ts` — response body translation
- [ ] Create `src/proxy/translators/streaming.ts` — SSE event-by-event stream translation for both directions
- [ ] Modify `src/proxy/server.ts` to detect when the active account is `provider === "copilot"` and route through the translation layer
- [ ] Inject required Copilot headers (`editor-version`, `Copilot-Integration-Id`) when forwarding to Copilot accounts
- [ ] Add unit tests covering all translation edge cases (tool calls, multi-turn, streaming, stop reasons)

**Phase 3 — Routing Strategy Fix**

- [ ] Modify `getProviderForModel()` in `src/proxy/server.ts` to fall back to the active account's provider when no prefix matches, rather than returning `null`
- [ ] Alternatively, introduce a `copilot:` prefix convention that the proxy strips before forwarding

**Phase 4 — OAuth Device Flow (Optional Enhancement)**

For users who want to use their existing GitHub account rather than generating a PAT:

- [ ] Add `relay account login copilot` command that runs the GitHub OAuth device flow
- [ ] Implement device code + polling in a new `src/utils/github-device-flow.ts` module
- [ ] Store the resulting token + expiry in the account config
- [ ] Add session token exchange and TTL-aware refresh for `gho_` tokens

### 5.2 Decision Points

**Token strategy**: Fine-grained PAT (`github_pat_`) is strongly recommended for Phase 1-3 because:
1. No session token exchange required — works as a static `Authorization: Bearer` value
2. Consistent with the existing static `apiKey` storage model
3. Revocable and scoped at the GitHub account level
4. No ~30-min expiry to manage

**Integration ID**: Use `relay-cli` or `vscode-chat` as the `Copilot-Integration-Id`. Note that using an unrecognized integration ID may limit available models on some subscription tiers. Research into what value GitHub accepts from third-party tools is warranted before Phase 2.

**Usage tracking**: GitHub Copilot's billing model (request multipliers, subscription tiers) doesn't map to the `UsageStats` interface's `{used, limit, remaining, percentUsed}` shape. The `getUsage()` method for Copilot should return zeroed stats with a descriptive indicator, and the `relay usage` display should show "Subscription-based (see github.com/settings/billing)" rather than a percentage bar.

---

## Potential Risks and Mitigations

1. **GitHub Changes the `copilot_internal` Endpoint**
   Mitigation: Use fine-grained PATs (which don't require the internal endpoint) as the primary auth path. Treat OAuth device flow as a Phase 4 enhancement.

2. **Copilot-Integration-Id Restrictions**
   GitHub may limit which models are accessible to unrecognized integration IDs.
   Mitigation: Research accepted values; consider using `vscode-chat` initially, then seek an official registration path.

3. **Protocol Translation Bugs Causing Silent Failures**
   A translation bug may cause Claude Code to receive malformed responses or drop tool calls silently.
   Mitigation: Comprehensive unit tests for the translation layer including adversarial inputs; integration tests in Docker per the project's existing pattern.

4. **Session Token Expiry Mid-Request**
   For Phase 4 OAuth flow: a ~30-min session token expires during a long-running context window.
   Mitigation: Proactive refresh timer (refresh at 25 minutes); exponential backoff retry with automatic re-exchange on 401.

5. **Streaming Translation Complexity**
   OpenAI and Anthropic SSE streaming events have different lifecycle semantics (OpenAI uses `finish_reason`, Anthropic uses `message_stop` events with block deltas).
   Mitigation: Treat streaming translation as a separate test suite; validate against real Copilot SSE responses before declaring production-ready.

6. **No Anthropic-Compatible Endpoint**
   GitHub does not provide an Anthropic-format endpoint (unlike Z.AI and MiniMax). This design assumption is unlikely to change.
   Mitigation: The translation layer in Phase 2 is the permanent architectural solution. Document this clearly in AGENTS.md under the Copilot provider section.

---

## Alternative Approaches

1. **Proxy-in-a-Proxy**: Run `ericc-ch/copilot-api` (an existing community tool that exposes an Anthropic-compatible API over GitHub Copilot) as a sidecar. Relay's Copilot accounts point at `localhost:4141` (the copilot-api port). This avoids implementing translation in Relay itself but adds an external dependency and a separate process lifecycle.

2. **ForgeCode Custom Provider Config Generation**: Since ForgeCode supports `response_type = "OpenAI"` natively, Relay could generate a `.forge.toml` snippet for GitHub Copilot and delegate to ForgeCode for Copilot sessions, while continuing to proxy Z.AI and MiniMax itself. This is architecturally inelegant but avoids the translation problem.

3. **Model Aliasing / Passthrough Mode**: Add a passthrough mode where Copilot model requests bypass the `/api/anthropic` path entirely and go to a new `/api/openai` proxy path — requiring Claude Code to be configured with two different base URLs for different model families. Operationally complex for users.

---

## Key Files to Modify

| File | Change Type |
|------|-------------|
| `src/providers/base.ts` | Potentially extend `UsageOptions` with Copilot-specific fields |
| `src/providers/copilot.ts` | **New file** — `CopilotProvider` class |
| `src/config/accounts-config.ts` | Extend provider union, add Copilot dispatch branch |
| `src/config/provider-metadata.ts` | Add `copilot` metadata entry |
| `src/config/settings.ts` | Add legacy compat case |
| `src/commands/account/add.tsx` | Widen provider type casts, add Copilot-specific prompts |
| `src/proxy/server.ts` | Protocol translation routing, header injection |
| `src/proxy/translators/` | **New directory** — translation modules |
| `src/utils/github-device-flow.ts` | **New file** (Phase 4) — OAuth device flow |
