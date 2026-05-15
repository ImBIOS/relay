/**
 * GitHub OAuth Device Flow for Copilot authentication.
 *
 * Implements the device authorization grant flow to obtain a Copilot session token.
 * This is used by `relay account login copilot` for interactive authentication.
 *
 * Flow:
 *   1. POST https://github.com/login/device/code → device_code + user_code
 *   2. User visits https://github.com/login/device and enters user_code
 *   3. Poll POST https://github.com/login/oauth/access_token → gho_ OAuth token
 *   4. GET https://api.github.com/copilot_internal/v2/token → Copilot session token (~30 min TTL)
 *
 * For simpler setup, users can also use fine-grained PATs directly.
 */

import { trace } from "../utils/logger";

const GITHUB_CLIENT_ID = "Iv1.b507a08c87ecfe98"; // Copilot CLI client ID (public)

const DEVICE_CODE_URL = "https://github.com/login/device/code";
const ACCESS_TOKEN_URL = "https://github.com/login/oauth/access_token";
const COPILOT_TOKEN_URL = "https://api.github.com/copilot_internal/v2/token";

export interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
  error?: string;
  error_description?: string;
}

export interface CopilotToken {
  token: string;
  expires_at: number; // Unix timestamp in seconds
}

/**
 * Step 1: Request a device code for the user to authorize.
 */
export async function requestDeviceCode(): Promise<DeviceCodeResponse> {
  const response = await fetch(DEVICE_CODE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: `client_id=${GITHUB_CLIENT_ID}&scope=copilot`,
  });

  if (!response.ok) {
    throw new Error(`Failed to request device code: ${response.status} ${await response.text()}`);
  }

  return response.json() as Promise<DeviceCodeResponse>;
}

/**
 * Step 2: Poll for the access token after user authorizes.
 * Returns null if authorization is still pending.
 */
export async function pollForAccessToken(
  deviceCode: string,
): Promise<TokenResponse | null> {
  const response = await fetch(ACCESS_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: `client_id=${GITHUB_CLIENT_ID}&device_code=${deviceCode}&grant_type=urn:ietf:params:oauth:grant-type:device_code`,
  });

  if (!response.ok) {
    throw new Error(`Token poll failed: ${response.status}`);
  }

  const data = (await response.json()) as TokenResponse;

  if (data.error) {
    if (data.error === "authorization_pending") return null;
    if (data.error === "slow_down") return null;
    throw new Error(`Token error: ${data.error} — ${data.error_description}`);
  }

  return data;
}

/**
 * Step 3: Exchange the OAuth token for a Copilot session token.
 * The session token has a ~30 minute TTL and must be refreshed.
 */
export async function exchangeCopilotToken(ghoToken: string): Promise<CopilotToken> {
  const response = await fetch(COPILOT_TOKEN_URL, {
    method: "GET",
    headers: {
      Authorization: `token ${ghoToken}`,
      Accept: "application/json",
      "editor-version": "relay-cli/1.0",
      "Copilot-Integration-Id": "vscode-chat",
    },
  });

  if (!response.ok) {
    throw new Error(`Copilot token exchange failed: ${response.status} ${await response.text()}`);
  }

  const data = (await response.json()) as { token: string; expires_at: number };
  return {
    token: data.token,
    expires_at: data.expires_at,
  };
}

/**
 * Full device flow: request code → wait for user → exchange for Copilot token.
 * Calls onUserCode() with the code info for the UI to display.
 */
export async function completeDeviceFlow(
  onUserCode: (info: DeviceCodeResponse) => void,
  onPolling?: () => void,
): Promise<{ copilotToken: string; ghoToken: string; expiresAt: number }> {
  // Step 1: Get device code
  const deviceInfo = await requestDeviceCode();
  onUserCode(deviceInfo);

  // Step 2: Poll until user authorizes
  const interval = deviceInfo.interval * 1000;
  const deadline = Date.now() + deviceInfo.expires_in * 1000;
  let ghoToken: string | null = null;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, interval));
    onPolling?.();

    const result = await pollForAccessToken(deviceInfo.device_code);
    if (result?.access_token) {
      ghoToken = result.access_token;
      break;
    }
  }

  if (!ghoToken) {
    throw new Error("Device authorization timed out. Please try again.");
  }

  // Step 3: Exchange for Copilot session token
  trace("Exchanging OAuth token for Copilot session token...");
  const copilot = await exchangeCopilotToken(ghoToken);

  return {
    copilotToken: copilot.token,
    ghoToken,
    expiresAt: copilot.expires_at,
  };
}
