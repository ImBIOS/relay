/**
 * Provider Registry — data-driven provider definitions.
 *
 * Inspired by ForgeCode's provider.json, this registry contains metadata for
 * every provider Relay supports: display name, wire protocol, base URL,
 * model source (dynamic URL or static list), auth method, and feature flags.
 *
 * Adding a new provider only requires adding an entry here — no type union
 * changes needed.
 */

// ── Wire protocols ──────────────────────────────────────────────────────────
export type WireProtocol = "anthropic" | "openai" | "openai-responses" | "google" | "bedrock";

// ── Auth methods ────────────────────────────────────────────────────────────
export type AuthMethod = "api_key" | "oauth_device" | "google_adc";

// ── Model definition ────────────────────────────────────────────────────────
export interface ModelDefinition {
  id: string;
  name: string;
  description?: string;
  contextLength?: number;
  toolsSupported?: boolean;
  supportsParallelToolCalls?: boolean;
  supportsReasoning?: boolean;
  inputModalities?: ("text" | "image")[];
}

// ── Provider definition ─────────────────────────────────────────────────────
export interface ProviderDefinition {
  /** Unique provider identifier (e.g. "zai", "github_copilot") */
  id: string;
  /** Human-readable name for display */
  displayName: string;
  /** Short label for CLI menus */
  cliLabel: string;
  /** Wire protocol this provider speaks */
  protocol: WireProtocol;
  /** Default base URL for API calls */
  defaultBaseUrl: string;
  /** Environment variable name that holds the API key */
  apiKeyEnvVar: string;
  /** Supported authentication methods */
  authMethods: AuthMethod[];
  /** Model source: a URL to fetch dynamically, or a static array */
  models: string | ModelDefinition[];
  /** Whether this provider supports usage/quota tracking */
  hasUsageApi: boolean;
  /** Whether this provider requires special headers (e.g. Copilot) */
  customHeaders?: Record<string, string>;
  /** Whether this provider needs a groupId (e.g. MiniMax) */
  requiresGroupId?: boolean;
  /** Whether this provider uses OAuth device flow for login */
  supportsOAuth?: boolean;
  /** OAuth config if supportsOAuth is true */
  oauthConfig?: {
    clientId: string;
    authUrl: string;
    tokenUrl: string;
    scopes: string[];
    tokenRefreshUrl?: string;
  };
}

// ── The Registry ────────────────────────────────────────────────────────────
const PROVIDER_REGISTRY: ProviderDefinition[] = [
  // ── Z.AI ────────────────────────────────────────────────────────────────
  {
    id: "zai",
    displayName: "Z.AI (GLM)",
    cliLabel: "Z.AI",
    protocol: "anthropic",
    defaultBaseUrl: "https://api.z.ai/api/anthropic",
    apiKeyEnvVar: "ZAI_API_KEY",
    authMethods: ["api_key"],
    models: [
      { id: "glm-5.1", name: "GLM-5.1", description: "Latest flagship model, 200K context, 128K output", contextLength: 204800, toolsSupported: true, supportsParallelToolCalls: true, supportsReasoning: true, inputModalities: ["text"] },
      { id: "glm-5-turbo", name: "GLM-5 Turbo", description: "Latest flagship, fast variant, 200K context", contextLength: 204800, toolsSupported: true, supportsParallelToolCalls: true, supportsReasoning: true, inputModalities: ["text"] },
      { id: "glm-5", name: "GLM-5", description: "Flagship model, 200K context", contextLength: 200000, toolsSupported: true, supportsParallelToolCalls: true, supportsReasoning: true, inputModalities: ["text"] },
      { id: "glm-4.7", name: "GLM-4.7", description: "Advanced model, 200K context", contextLength: 200000, toolsSupported: true, supportsParallelToolCalls: true, supportsReasoning: true, inputModalities: ["text"] },
      { id: "glm-4.7-flash", name: "GLM-4.7 Flash", description: "Fast variant, 200K context", contextLength: 200000, toolsSupported: true, supportsParallelToolCalls: true, supportsReasoning: true, inputModalities: ["text"] },
      { id: "glm-4.7-flashx", name: "GLM-4.7 Flash X", description: "Fastest variant, 200K context", contextLength: 200000, toolsSupported: true, supportsParallelToolCalls: true, supportsReasoning: true, inputModalities: ["text"] },
      { id: "glm-4.6", name: "GLM-4.6", description: "Advanced model, 200K context", contextLength: 200000, toolsSupported: true, supportsParallelToolCalls: true, supportsReasoning: true, inputModalities: ["text"] },
      { id: "glm-4.5", name: "GLM-4.5", description: "128K context, 96K output", contextLength: 128000, toolsSupported: true, supportsParallelToolCalls: false, supportsReasoning: true, inputModalities: ["text"] },
      { id: "glm-4.5-flash", name: "GLM-4.5 Flash", description: "Fast variant, 128K context", contextLength: 128000, toolsSupported: true, supportsParallelToolCalls: false, supportsReasoning: true, inputModalities: ["text"] },
      { id: "glm-4.5-flashx", name: "GLM-4.5 Flash X", description: "Fastest variant, 128K context", contextLength: 128000, toolsSupported: true, supportsParallelToolCalls: false, supportsReasoning: true, inputModalities: ["text"] },
      { id: "glm-4.4", name: "GLM-4.4", description: "Balanced model, 128K context", contextLength: 128000, toolsSupported: true, supportsParallelToolCalls: false, supportsReasoning: true, inputModalities: ["text"] },
      { id: "glm-4.4-flash", name: "GLM-4.4 Flash", description: "Fast variant, 128K context", contextLength: 128000, toolsSupported: true, supportsParallelToolCalls: false, supportsReasoning: true, inputModalities: ["text"] },
      { id: "glm-4.3", name: "GLM-4.3", description: "Standard model, 128K context", contextLength: 128000, toolsSupported: true, supportsParallelToolCalls: false, supportsReasoning: false, inputModalities: ["text"] },
    ],
    hasUsageApi: true,
  },

  // ── MiniMax ─────────────────────────────────────────────────────────────
  {
    id: "minimax",
    displayName: "MiniMax",
    cliLabel: "MiniMax",
    protocol: "anthropic",
    defaultBaseUrl: "https://api.minimax.io/anthropic",
    apiKeyEnvVar: "MINIMAX_API_KEY",
    authMethods: ["api_key"],
    models: [
      { id: "MiniMax-M2.5", name: "MiniMax M2.5", description: "Peak performance, advanced reasoning", contextLength: 204800, toolsSupported: true, supportsParallelToolCalls: true, supportsReasoning: true, inputModalities: ["text"] },
      { id: "MiniMax-M2.5-highspeed", name: "MiniMax M2.5 Highspeed", description: "Same as M2.5, ~100 tps", contextLength: 204800, toolsSupported: true, supportsParallelToolCalls: true, supportsReasoning: true, inputModalities: ["text"] },
      { id: "MiniMax-M2.1", name: "MiniMax M2.1", description: "230B params, 10B activated, code-focused", contextLength: 204800, toolsSupported: true, supportsParallelToolCalls: true, supportsReasoning: true, inputModalities: ["text"] },
      { id: "MiniMax-M2.1-highspeed", name: "MiniMax M2.1 Highspeed", description: "Same as M2.1, ~100 tps", contextLength: 204800, toolsSupported: true, supportsParallelToolCalls: true, supportsReasoning: true, inputModalities: ["text"] },
      { id: "MiniMax-M2", name: "MiniMax M2", description: "Agentic, function calling, streaming", contextLength: 204800, toolsSupported: true, supportsParallelToolCalls: true, supportsReasoning: true, inputModalities: ["text"] },
      { id: "MiniMax-Text-01", name: "MiniMax Text-01", description: "456B MoE, long-context", contextLength: 1048576, toolsSupported: true, supportsParallelToolCalls: false, supportsReasoning: false, inputModalities: ["text"] },
      { id: "abab6.5s-chat", name: "ABAB 6.5S Chat", description: "Legacy chat model", contextLength: 16384, toolsSupported: false, supportsParallelToolCalls: false, supportsReasoning: false, inputModalities: ["text"] },
    ],
    hasUsageApi: true,
    requiresGroupId: true,
  },

  // ── GitHub Copilot ──────────────────────────────────────────────────────
  {
    id: "copilot",
    displayName: "GitHub Copilot",
    cliLabel: "GitHub Copilot",
    protocol: "openai",
    defaultBaseUrl: "https://api.githubcopilot.com",
    apiKeyEnvVar: "GITHUB_COPILOT_TOKEN",
    authMethods: ["api_key", "oauth_device"],
    models: "https://api.githubcopilot.com/models",
    hasUsageApi: true,
    customHeaders: {
      "User-Agent": "GitHubCopilotChat/0.26.7",
      "editor-version": "vscode/1.99.3",
      "editor-plugin-version": "copilot-chat/0.26.7",
    },
    supportsOAuth: true,
    oauthConfig: {
      clientId: "Iv1.b507a08c87ecfe98",
      authUrl: "https://github.com/login/device/code",
      tokenUrl: "https://github.com/login/oauth/access_token",
      scopes: ["read:user"],
      tokenRefreshUrl: "https://api.github.com/copilot_internal/v2/token",
    },
  },

  // ── Cursor ─────────────────────────────────────────────────────────────
  {
    id: "cursor",
    displayName: "Cursor",
    cliLabel: "Cursor",
    protocol: "openai",
    defaultBaseUrl: "https://cursor.com",
    apiKeyEnvVar: "CURSOR_API_KEY",
    authMethods: ["api_key"],
    models: [],
    hasUsageApi: true,
  },

  // ── OpenAI ──────────────────────────────────────────────────────────────
  {
    id: "openai",
    displayName: "OpenAI",
    cliLabel: "OpenAI",
    protocol: "openai",
    defaultBaseUrl: "https://api.openai.com/v1",
    apiKeyEnvVar: "OPENAI_API_KEY",
    authMethods: ["api_key"],
    models: "https://api.openai.com/v1/models",
    hasUsageApi: false,
  },

  // ── Anthropic ───────────────────────────────────────────────────────────
  {
    id: "anthropic",
    displayName: "Anthropic",
    cliLabel: "Anthropic",
    protocol: "anthropic",
    defaultBaseUrl: "https://api.anthropic.com",
    apiKeyEnvVar: "ANTHROPIC_API_KEY",
    authMethods: ["api_key"],
    models: "https://api.anthropic.com/v1/models",
    hasUsageApi: false,
  },

  // ── OpenRouter ──────────────────────────────────────────────────────────
  {
    id: "openrouter",
    displayName: "OpenRouter",
    cliLabel: "OpenRouter",
    protocol: "openai",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    apiKeyEnvVar: "OPENROUTER_API_KEY",
    authMethods: ["api_key"],
    models: "https://openrouter.ai/api/v1/models",
    hasUsageApi: false,
  },

  // ── Google AI Studio ────────────────────────────────────────────────────
  {
    id: "google_ai_studio",
    displayName: "Google AI Studio",
    cliLabel: "Google AI Studio",
    protocol: "openai",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    apiKeyEnvVar: "GOOGLE_API_KEY",
    authMethods: ["api_key"],
    models: [
      { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", description: "Most capable Gemini model", contextLength: 1048576, toolsSupported: true, supportsParallelToolCalls: true, supportsReasoning: true, inputModalities: ["text", "image"] },
      { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", description: "Fast and capable", contextLength: 1048576, toolsSupported: true, supportsParallelToolCalls: true, supportsReasoning: true, inputModalities: ["text", "image"] },
      { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash", description: "Fast multimodal", contextLength: 1048576, toolsSupported: true, supportsParallelToolCalls: true, supportsReasoning: false, inputModalities: ["text", "image"] },
      { id: "gemini-2.0-flash-lite", name: "Gemini 2.0 Flash Lite", description: "Cost-efficient", contextLength: 1048576, toolsSupported: true, supportsParallelToolCalls: false, supportsReasoning: false, inputModalities: ["text", "image"] },
      { id: "gemini-1.5-pro", name: "Gemini 1.5 Pro", description: "Long-context predecessor", contextLength: 2097152, toolsSupported: true, supportsParallelToolCalls: false, supportsReasoning: false, inputModalities: ["text", "image"] },
      { id: "gemini-1.5-flash", name: "Gemini 1.5 Flash", description: "Fast long-context", contextLength: 1048576, toolsSupported: true, supportsParallelToolCalls: false, supportsReasoning: false, inputModalities: ["text", "image"] },
      { id: "gemma-3-27b-it", name: "Gemma 3 27B IT", description: "Open model, instruction-tuned", contextLength: 131072, toolsSupported: true, supportsParallelToolCalls: false, supportsReasoning: false, inputModalities: ["text", "image"] },
    ],
    hasUsageApi: false,
  },

  // ── Groq ────────────────────────────────────────────────────────────────
  {
    id: "groq",
    displayName: "Groq",
    cliLabel: "Groq",
    protocol: "openai",
    defaultBaseUrl: "https://api.groq.com/openai/v1",
    apiKeyEnvVar: "GROQ_API_KEY",
    authMethods: ["api_key"],
    models: "https://api.groq.com/openai/v1/models",
    hasUsageApi: false,
  },

  // ── Cerebras ────────────────────────────────────────────────────────────
  {
    id: "cerebras",
    displayName: "Cerebras",
    cliLabel: "Cerebras",
    protocol: "openai",
    defaultBaseUrl: "https://api.cerebras.ai/v1",
    apiKeyEnvVar: "CEREBRAS_API_KEY",
    authMethods: ["api_key"],
    models: "https://api.cerebras.ai/v1/models",
    hasUsageApi: false,
  },

  // ── xAI ─────────────────────────────────────────────────────────────────
  {
    id: "xai",
    displayName: "xAI (Grok)",
    cliLabel: "xAI",
    protocol: "openai",
    defaultBaseUrl: "https://api.x.ai/v1",
    apiKeyEnvVar: "XAI_API_KEY",
    authMethods: ["api_key"],
    models: "https://api.x.ai/v1/models",
    hasUsageApi: false,
  },

  // ── DeepSeek ────────────────────────────────────────────────────────────
  {
    id: "deepseek",
    displayName: "DeepSeek",
    cliLabel: "DeepSeek",
    protocol: "openai",
    defaultBaseUrl: "https://api.deepseek.com",
    apiKeyEnvVar: "DEEPSEEK_API_KEY",
    authMethods: ["api_key"],
    models: "https://api.deepseek.com/models",
    hasUsageApi: false,
  },

  // ── Ollama (local) ──────────────────────────────────────────────────────
  {
    id: "ollama",
    displayName: "Ollama (local)",
    cliLabel: "Ollama",
    protocol: "openai",
    defaultBaseUrl: "http://localhost:11434/v1",
    apiKeyEnvVar: "OLLAMA_API_KEY",
    authMethods: ["api_key"],
    models: "http://localhost:11434/v1/models",
    hasUsageApi: false,
  },

  // ── OpenAI-compatible (custom) ──────────────────────────────────────────
  {
    id: "openai_compatible",
    displayName: "OpenAI-Compatible",
    cliLabel: "OpenAI-Compatible",
    protocol: "openai",
    defaultBaseUrl: "",
    apiKeyEnvVar: "OPENAI_COMPATIBLE_API_KEY",
    authMethods: ["api_key"],
    models: [],
    hasUsageApi: false,
  },

  // ── Anthropic-compatible (custom) ───────────────────────────────────────
  {
    id: "anthropic_compatible",
    displayName: "Anthropic-Compatible",
    cliLabel: "Anthropic-Compatible",
    protocol: "anthropic",
    defaultBaseUrl: "",
    apiKeyEnvVar: "ANTHROPIC_COMPATIBLE_API_KEY",
    authMethods: ["api_key"],
    models: [],
    hasUsageApi: false,
  },
];

// ── Lookup helpers ──────────────────────────────────────────────────────────
const _registryMap = new Map(PROVIDER_REGISTRY.map((p) => [p.id, p]));

export function getProviderDef(id: string): ProviderDefinition | undefined {
  return _registryMap.get(id);
}

export function getAllProviders(): ProviderDefinition[] {
  return PROVIDER_REGISTRY;
}

export function isKnownProvider(id: string): boolean {
  return _registryMap.has(id);
}

export function getProviderIds(): string[] {
  return PROVIDER_REGISTRY.map((p) => p.id);
}

export function getProviderDisplayName(id: string): string {
  return _registryMap.get(id)?.displayName ?? id;
}

export function getProviderCliLabel(id: string): string {
  return _registryMap.get(id)?.cliLabel ?? id;
}

export function getDefaultBaseUrl(id: string): string {
  return _registryMap.get(id)?.defaultBaseUrl ?? "";
}

export function getProviderProtocol(id: string): WireProtocol {
  return _registryMap.get(id)?.protocol ?? "openai";
}

export function getProviderModels(id: string): string | ModelDefinition[] {
  return _registryMap.get(id)?.models ?? [];
}

export function getProviderCustomHeaders(id: string): Record<string, string> {
  return _registryMap.get(id)?.customHeaders ?? {};
}

export function getProviderAuthMethods(id: string): AuthMethod[] {
  return _registryMap.get(id)?.authMethods ?? ["api_key"];
}

export function getProviderApiKeyEnvVar(id: string): string {
  return _registryMap.get(id)?.apiKeyEnvVar ?? `${id.toUpperCase()}_API_KEY`;
}

export function getProviderRequiresGroupId(id: string): boolean {
  return _registryMap.get(id)?.requiresGroupId ?? false;
}

export function getProviderHasUsageApi(id: string): boolean {
  return _registryMap.get(id)?.hasUsageApi ?? false;
}

export function getProviderSupportsOAuth(id: string): boolean {
  return _registryMap.get(id)?.supportsOAuth ?? false;
}

export function getProviderOAuthConfig(id: string): ProviderDefinition["oauthConfig"] {
  return _registryMap.get(id)?.oauthConfig;
}
