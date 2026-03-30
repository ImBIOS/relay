export interface ProviderConfig {
  apiKey: string;
  baseUrl: string;
}

export interface UsageOptions {
  apiKey?: string;
  groupId?: string; // For MiniMax usage tracking
}

export interface UsageStats {
  used: number;
  limit: number;
  remaining: number;
  percentUsed: number;
  // For MiniMax: percentRemaining shows what's left (for display)
  percentRemaining?: number;
  // For ZAI provider: separate model and MCP usage
  modelUsage?: UsageStats;
  mcpUsage?: UsageStats;
}

export interface Provider {
  name: string;
  displayName: string;
  getConfig(): ProviderConfig;
  testConnection(): Promise<boolean>;
  getUsage(options?: UsageOptions): Promise<UsageStats>;
}
