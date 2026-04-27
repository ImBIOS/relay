import * as fs from "node:fs";
import * as path from "node:path";

export interface McpServerConfig {
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
  enabled: boolean;
  description?: string;
  provider?: "zai" | "minimax" | "all";
}

export interface McpConfig {
  version: "2.0.0";
  servers: Record<string, McpServerConfig>;
  globalEnv?: Record<string, string>;
}

export interface McpProfileConfig {
  enabled: boolean;
  servers: string[];
}

const DEFAULT_CONFIG: McpConfig = {
  version: "2.0.0",
  servers: {},
  globalEnv: {},
};

export function getMcpPath(): string {
  return `${process.env.HOME || process.env.USERPROFILE}/.claude/relay-mcp.json`;
}

export function loadMcpConfig(): McpConfig {
  try {
    const configPath = getMcpPath();

    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, "utf-8");
      return JSON.parse(content) as McpConfig;
    }
  } catch {
    // Ignore errors
  }
  return { ...DEFAULT_CONFIG };
}

export function saveMcpConfig(config: McpConfig): void {
  const configPath = getMcpPath();
  const configDir = path.dirname(configPath);

  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

export function addMcpServer(
  name: string,
  command: string,
  args: string[],
  options?: {
    env?: Record<string, string>;
    description?: string;
    provider?: "zai" | "minimax" | "all";
  },
): McpServerConfig {
  const config = loadMcpConfig();

  const server: McpServerConfig = {
    name,
    command,
    args,
    enabled: true,
    description: options?.description || "",
    provider: options?.provider || "all",
    env: options?.env,
  };

  config.servers[name] = server;
  saveMcpConfig(config);

  return server;
}

export function updateMcpServer(
  name: string,
  updates: Partial<McpServerConfig>,
): McpServerConfig | null {
  const config = loadMcpConfig();
  const server = config.servers[name];

  if (!server) {
    return null;
  }

  config.servers[name] = { ...server, ...updates };
  saveMcpConfig(config);

  return config.servers[name];
}

export function deleteMcpServer(name: string): boolean {
  const config = loadMcpConfig();

  if (!config.servers[name]) {
    return false;
  }

  delete config.servers[name];
  saveMcpConfig(config);

  return true;
}

export function getMcpServer(name: string): McpServerConfig | null {
  const config = loadMcpConfig();
  return config.servers[name] || null;
}

export function listMcpServers(): McpServerConfig[] {
  const config = loadMcpConfig();
  return Object.values(config.servers);
}

export function listEnabledMcpServers(): McpServerConfig[] {
  const config = loadMcpConfig();
  return Object.values(config.servers).filter((s) => s.enabled);
}

export function toggleMcpServer(name: string, enabled: boolean): boolean {
  const config = loadMcpConfig();

  if (!config.servers[name]) {
    return false;
  }

  config.servers[name].enabled = enabled;
  saveMcpConfig(config);

  return true;
}

export function getMcpEnvForServer(name: string): Record<string, string> {
  const config = loadMcpConfig();
  const server = config.servers[name];

  if (!server) {
    return {};
  }

  return {
    ...config.globalEnv,
    ...server.env,
  };
}

export function generateMcpEnvExport(): string {
  const config = loadMcpConfig();
  const enabledServers = listEnabledMcpServers();

  let envScript = "# RELAY MCP Configuration\n";

  if (config.globalEnv && Object.keys(config.globalEnv).length > 0) {
    envScript += "# Global MCP Environment Variables\n";
    for (const [key, value] of Object.entries(config.globalEnv)) {
      envScript += `export ${key}="${value}"\n`;
    }
    envScript += "\n";
  }

  envScript += "# MCP Servers\n";
  envScript += `export RELAY_MCP_SERVERS="${enabledServers.map((s) => s.name).join(",")}"\n\n`;

  for (const server of enabledServers) {
    envScript += `# Server: ${server.name}\n`;
    envScript += `export RELAY_MCP_${server.name.toUpperCase().replace(/-/g, "_")}_COMMAND="${server.command}"\n`;
    envScript += `export RELAY_MCP_${server.name.toUpperCase().replace(/-/g, "_")}_ARGS="${server.args.join(" ")}"\n`;
    if (server.env) {
      for (const [key, value] of Object.entries(server.env)) {
        envScript += `export RELAY_MCP_${server.name.toUpperCase().replace(/-/g, "_")}_ENV_${key}="${value}"\n`;
      }
    }
    envScript += "\n";
  }

  return envScript;
}

export function generateClaudeDesktopConfig(): string {
  const _config = loadMcpConfig();
  const enabledServers = listEnabledMcpServers();

  const mcpServers: Record<
    string,
    { command: string; args: string[]; env?: Record<string, string> }
  > = {};

  for (const server of enabledServers) {
    mcpServers[server.name] = {
      command: server.command,
      args: server.args,
      env: server.env,
    };
  }

  return JSON.stringify(
    {
      mcpServers,
    },
    null,
    2,
  );
}

// Predefined Z.AI MCP servers
export const ZAI_MCP_SERVERS = {
  "zai-vision": {
    name: "zai-vision",
    command: "npx",
    args: ["-y", "@z-ai/mcp-server-vision"],
    description: "Vision/image analysis for Z.AI",
    provider: "zai" as const,
  },
  "zai-search": {
    name: "zai-search",
    command: "npx",
    args: ["-y", "@z-ai/mcp-server-search"],
    description: "Web search for Z.AI",
    provider: "zai" as const,
  },
  "zai-reader": {
    name: "zai-reader",
    command: "npx",
    args: ["-y", "@z-ai/mcp-server-reader"],
    description: "Content reading for Z.AI",
    provider: "zai" as const,
  },
  "zai-zread": {
    name: "zai-zread",
    command: "npx",
    args: ["-y", "@z-ai/mcp-server-zread"],
    description: "Advanced reading for Z.AI",
    provider: "zai" as const,
  },
};

/**
 * Predefined MiniMax MCP servers
 * Package: minimax-coding-plan-mcp
 * Tools: web_search, understand_image
 */
export const MINIMAX_MCP_SERVERS = {
  "minimax-coding": {
    name: "minimax-coding",
    command: "npx",
    args: ["-y", "minimax-coding-plan-mcp"],
    description: "MiniMax coding plan MCP - web_search and understand_image tools",
    provider: "minimax" as const,
  },
};

export function addPredefinedServers(provider: "zai" | "minimax"): void {
  const servers = provider === "zai" ? ZAI_MCP_SERVERS : MINIMAX_MCP_SERVERS;
  const config = loadMcpConfig();

  for (const server of Object.values(servers)) {
    if (!config.servers[server.name]) {
      config.servers[server.name] = {
        ...server,
        enabled: false,
      };
    }
  }

  saveMcpConfig(config);
}
