export const PLUGIN_DESCRIPTIONS: Record<string, string> = {
  "relay-commit":
    "AI-powered auto stage, commit, and push on session idle with security & performance analysis",
  "relay-format": "Format files after Write/Edit tool calls",
  "relay-security-analysis":
    "Analyze staged changes for security vulnerabilities before commit",
  "relay-performance-analysis":
    "Analyze staged changes for performance anti-patterns before commit",
};

export const PLUGIN_FILES = [
  "relay-commit.js",
  "relay-format.js",
  "relay-security-analysis.js",
  "relay-performance-analysis.js",
];
