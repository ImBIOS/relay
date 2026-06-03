export interface ProviderConfig {
  apiKey: string;
  baseUrl: string;
}

export interface UsageOptions {
  apiKey?: string;
  groupId?: string; // For MiniMax usage tracking
  oauthToken?: string; // For GitHub Copilot: gho_ token for usage queries
}

export interface WeeklyUsageStats {
  used: number;
  limit: number;
  remaining: number;
  percentUsed: number;
  resetsAt?: string; // ISO timestamp
  // For MiniMax: weekly limit may be unlimited (e.g. 100% remaining with no concrete count)
  unlimited?: boolean;
}

export interface UsageStats {
  used: number;
  limit: number;
  remaining: number;
  percentUsed: number;
  // For MiniMax: percentRemaining shows what's left (for display)
  percentRemaining?: number;
  // For MiniMax: when the API no longer exposes absolute counts (only a remaining
  // percentage for the 5-hour window), used/limit/remaining cannot be derived
  // honestly. The display should hide absolute values and emphasise the percentage.
  intervalPercentageOnly?: boolean;
  // For ZAI provider: separate model and MCP usage
  modelUsage?: UsageStats;
  mcpUsage?: UsageStats;
  // Reset time information
  resetsAt?: string; // ISO 8601 timestamp of when the quota resets
  // Weekly limits (if available)
  weeklyUsage?: WeeklyUsageStats;
  // For GitHub Copilot: plan and per-category quota info
  copilotPlan?: string;
  copilotChat?: { percentRemaining: number; unlimited: boolean };
  copilotCompletions?: { percentRemaining: number; unlimited: boolean };
}

export interface Provider {
  name: string;
  displayName: string;
  getConfig(): ProviderConfig;
  testConnection(): Promise<boolean>;
  getUsage(options?: UsageOptions): Promise<UsageStats>;
}
