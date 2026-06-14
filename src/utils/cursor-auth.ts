/**
 * Cursor authentication utilities.
 *
 * Reads auth tokens from multiple sources:
 *
 * 1. **Cursor agent CLI** (~/.config/cursor/auth.json on Linux)
 *    The cursor-agent stores a fresh JWT access token after browser-based login.
 *    This is the most reliable source for a valid session token.
 *
 * 2. **Cursor IDE** (SQLite state.vscdb)
 *    The IDE stores auth tokens in its global storage database.
 *    These tokens may be expired if the IDE hasn't been used recently.
 *
 * The access token can be used directly as the WorkosCursorSessionToken cookie
 * value to authenticate with cursor.com/api/usage-summary.
 */

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomBytes, createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { trace } from "./logger";

/** Cursor agent CLI auth file paths by platform */
const AGENT_AUTH_PATHS: Record<string, string> = {
  linux: join(
    process.env.XDG_CONFIG_HOME || join(homedir(), ".config"),
    "cursor",
    "auth.json",
  ),
  darwin: join(homedir(), ".cursor", "auth.json"),
  win32: join(
    process.env.APPDATA || "",
    "Cursor",
    "auth.json",
  ),
};

/** Cursor IDE state database paths by platform */
const STATE_DB_PATHS: Record<string, string> = {
  linux: join(
    homedir(),
    ".config/Cursor/User/globalStorage/state.vscdb",
  ),
  darwin: join(
    homedir(),
    "Library/Application Support/Cursor/User/globalStorage/state.vscdb",
  ),
  win32: join(
    process.env.APPDATA || "",
    "Cursor/User/globalStorage/state.vscdb",
  ),
};

/** Cursor CLI config paths by platform */
const CLI_CONFIG_PATHS: Record<string, string> = {
  linux: join(homedir(), ".cursor/cli-config.json"),
  darwin: join(homedir(), ".cursor/cli-config.json"),
  win32: join(process.env.APPDATA || "", ".cursor/cli-config.json"),
};

export interface CursorAuthTokens {
  accessToken: string;
  refreshToken: string;
  email: string;
  /** Whether the access token is still valid (not expired) */
  isExpired: boolean;
  /** Token expiry date */
  expiresAt: Date | null;
}

export function getAgentAuthPath(): string {
  const platform = process.platform as string;
  return AGENT_AUTH_PATHS[platform] || AGENT_AUTH_PATHS.linux;
}

/**
 * Get the platform-specific path to the Cursor IDE state database.
 */
export function getStateDbPath(): string {
  const platform = process.platform as string;
  return STATE_DB_PATHS[platform] || STATE_DB_PATHS.linux;
}

/**
 * Get the platform-specific path to the Cursor CLI config.
 */
function getCliConfigPath(): string {
  const platform = process.platform as string;
  return CLI_CONFIG_PATHS[platform] || CLI_CONFIG_PATHS.linux;
}

/**
 * Check if the Cursor agent CLI is installed and authenticated.
 */
export function isCursorAgentInstalled(): boolean {
  return existsSync(getAgentAuthPath());
}

/**
 * Check if the Cursor IDE is installed on this machine.
 */
export function isCursorIdeInstalled(): boolean {
  return existsSync(getStateDbPath());
}

/**
 * Check if the Cursor CLI is installed.
 */
export function isCursorCliInstalled(): boolean {
  return existsSync(getCliConfigPath());
}

/**
 * Decode a JWT payload without verification.
 * Returns the parsed JSON payload or null if invalid.
 */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    let payload = parts[1];
    // Add base64url padding
    payload += "=".repeat((4 - (payload.length % 4)) % 4);

    const decoded = Buffer.from(payload, "base64url").toString("utf-8");
    return JSON.parse(decoded) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Read auth tokens from the Cursor agent CLI's auth.json file.
 *
 * The cursor-agent stores tokens at:
 *   Linux:   ~/.config/cursor/auth.json
 *   macOS:   ~/.cursor/auth.json
 *   Windows: %APPDATA%\Cursor\auth.json
 *
 * This is the most reliable source for a valid session token because
 * the cursor-agent refreshes tokens via its browser-based login flow.
 */
export function readCursorAgentTokens(): CursorAuthTokens | null {
  const authPath = getAgentAuthPath();

  if (!existsSync(authPath)) {
    trace("Cursor agent auth file not found");
    return null;
  }

  try {
    const content = readFileSync(authPath, "utf-8");
    const data = JSON.parse(content) as {
      accessToken?: string;
      refreshToken?: string;
    };

    if (!data.accessToken) {
      trace("Cursor agent auth file has no accessToken");
      return null;
    }

    const payload = decodeJwtPayload(data.accessToken);
    const exp = payload?.exp as number | undefined;
    const expiresAt = exp ? new Date(exp * 1000) : null;
    const isExpired = exp ? Date.now() > exp * 1000 : true;

    // Extract email from the JWT subject (sub: "google-oauth2|...")
    const email =
      (readCursorCliConfig()?.email) ||
      (payload?.sub as string)?.split("|")[1] ||
      "";

    return {
      accessToken: data.accessToken,
      refreshToken: data.refreshToken || "",
      email,
      isExpired,
      expiresAt,
    };
  } catch (err) {
    trace(`Failed to read Cursor agent tokens: ${err}`);
    return null;
  }
}

/**
 * Read auth tokens from the Cursor IDE's local storage.
 *
 * This uses a lightweight approach that reads the SQLite database file
 * directly without requiring a SQLite library dependency. It searches
 * for key patterns in the binary data.
 *
 * For more reliable reading, we use the CLI config for email and
 * the state DB for tokens.
 */
export function readCursorIdeTokens(): CursorAuthTokens | null {
  const dbPath = getStateDbPath();

  if (!existsSync(dbPath)) {
    trace("Cursor IDE state database not found");
    return null;
  }

  try {
    // Use a simple approach: read the entire file and extract values
    // using string search (works for the small values we need)
    const content = readFileSync(dbPath, "utf-8");

    // Extract accessToken
    const accessTokenMatch = content.match(
      /cursorAuth\/accessToken(.{0,50}?)(eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)/,
    );
    const accessToken = accessTokenMatch?.[2] || null;

    // Extract refreshToken
    const refreshTokenMatch = content.match(
      /cursorAuth\/refreshToken(.{0,50}?)(eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)/,
    );
    const refreshToken = refreshTokenMatch?.[2] || null;

    // Extract email
    const emailMatch = content.match(
      /cursorAuth\/cachedEmail.{0,50}?([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/,
    );
    const email = emailMatch?.[1] || null;

    if (!accessToken) {
      trace("Could not find Cursor access token in state DB");
      return null;
    }

    // Decode the JWT to check expiry
    const payload = decodeJwtPayload(accessToken);
    const exp = payload?.exp as number | undefined;
    const expiresAt = exp ? new Date(exp * 1000) : null;
    const isExpired = exp ? Date.now() > exp * 1000 : true;

    return {
      accessToken,
      refreshToken: refreshToken || "",
      email: email || "",
      isExpired,
      expiresAt,
    };
  } catch (err) {
    trace(`Failed to read Cursor IDE tokens: ${err}`);
    return null;
  }
}

/**
 * Read the Cursor CLI config for user info.
 */
export function readCursorCliConfig(): {
  email: string;
  displayName: string;
  userId: number;
} | null {
  const configPath = getCliConfigPath();

  if (!existsSync(configPath)) {
    return null;
  }

  try {
    const content = readFileSync(configPath, "utf-8");
    const config = JSON.parse(content);
    const authInfo = config.authInfo;

    if (!authInfo) return null;

    return {
      email: authInfo.email || "",
      displayName: authInfo.displayName || "",
      userId: authInfo.userId || 0,
    };
  } catch {
    return null;
  }
}

/**
 * Get the best available Cursor session token.
 *
 * This function tries multiple sources in order of reliability:
 * 1. Cursor agent CLI auth.json (most likely to be fresh)
 * 2. Cursor IDE state.vscdb (may be expired)
 *
 * Returns the token, email, and expiry status.
 */
export function getCursorSessionToken(): {
  token: string;
  email: string;
  isExpired: boolean;
  source: string;
} | null {
  // Try cursor-agent auth.json first (most reliable)
  const agentTokens = readCursorAgentTokens();
  if (agentTokens) {
    return {
      token: agentTokens.accessToken,
      email: agentTokens.email,
      isExpired: agentTokens.isExpired,
      source: "cursor-agent",
    };
  }

  // Fall back to Cursor IDE state DB
  const ideTokens = readCursorIdeTokens();
  if (ideTokens) {
    return {
      token: ideTokens.accessToken,
      email: ideTokens.email,
      isExpired: ideTokens.isExpired,
      source: "cursor-ide",
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// PKCE browser-based login (mirrors cursor-agent's flow)
// ---------------------------------------------------------------------------

const CURSOR_LOGIN_BASE = "https://cursor.com";
const CURSOR_POLL_BASE = "https://api2.cursor.sh";

/** Generate a random hex string of the given byte length */
function randomHex(bytes: number): string {
  return randomBytes(bytes).toString("hex");
}

/** SHA-256 hash, returned as base64url (no padding) */
function sha256Base64Url(input: string): string {
  const hash = createHash("sha256").update(input).digest();
  return hash.toString("base64url");
}

/** Open a URL in the user's default browser */
function openBrowser(url: string): void {
  const platform = process.platform;
  try {
    if (platform === "darwin") {
      execSync(`open "${url}"`);
    } else if (platform === "win32") {
      execSync(`start "" "${url}"`);
    } else {
      execSync(`xdg-open "${url}" 2>/dev/null || sensible-browser "${url}" 2>/dev/null`);
    }
  } catch {
    // Fallback: just print the URL
  }
}

export interface PkceLoginResult {
  accessToken: string;
  refreshToken: string;
  email: string;
}

/**
 * Perform a PKCE-based browser login for Cursor.
 *
 * This mirrors the cursor-agent's login flow:
 * 1. Generate a random verifier and SHA-256 challenge
 * 2. Open the browser to cursor.com/loginDeepControl
 * 3. Poll api2.cursor.sh/auth/poll until the user completes login
 * 4. Return the accessToken and refreshToken
 *
 * @param onUrl - Callback with the login URL (for display)
 * @param signal - Optional AbortSignal to cancel polling
 */
export async function pkceBrowserLogin(
  onUrl: (url: string) => void,
  signal?: AbortSignal,
): Promise<PkceLoginResult> {
  const verifier = randomHex(32);
  const challenge = sha256Base64Url(verifier);
  const uuid = randomHex(16);

  const loginUrl = `${CURSOR_LOGIN_BASE}/loginDeepControl?challenge=${challenge}&uuid=${uuid}&mode=login&redirectTarget=dashboard`;

  // Show URL and open browser
  onUrl(loginUrl);
  openBrowser(loginUrl);

  // Poll until login completes (404 = pending, 200 = done)
  const pollUrl = `${CURSOR_POLL_BASE}/auth/poll?uuid=${uuid}&verifier=${verifier}`;
  const pollInterval = 2000; // 2 seconds
  const maxAttempts = 120; // 4 minutes max

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (signal?.aborted) {
      throw new Error("Login cancelled");
    }

    await new Promise((resolve) => setTimeout(resolve, pollInterval));

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const response = await fetch(pollUrl, {
        method: "GET",
        headers: {
          Accept: "application/json",
          "User-Agent": "relay-cli/1.0",
        },
        signal: signal ?? controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.status === 404) {
        // Login not yet completed, keep polling
        trace(`Cursor PKCE poll attempt ${attempt + 1}: pending`);
        continue;
      }

      if (response.ok) {
        const data = (await response.json()) as {
          accessToken?: string;
          refreshToken?: string;
        };

        if (!data.accessToken) {
          throw new Error("Login response missing accessToken");
        }

        // Extract email from the JWT
        const payload = decodeJwtPayload(data.accessToken);
        const sub = (payload?.sub as string) || "";
        const email = readCursorCliConfig()?.email || sub.split("|").pop() || "";

        return {
          accessToken: data.accessToken,
          refreshToken: data.refreshToken || "",
          email,
        };
      }

      // Other status codes — unexpected, but keep trying
      trace(`Cursor PKCE poll attempt ${attempt + 1}: HTTP ${response.status}`);
    } catch (err) {
      // Network errors — keep trying
      trace(`Cursor PKCE poll attempt ${attempt + 1}: ${err}`);
    }
  }

  throw new Error("Login timed out. Please try again.");
}
