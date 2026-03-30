import * as fs from "node:fs";

/**
 * Detect if the current process is running inside a container or sandbox environment.
 *
 * This checks various common indicators:
 * - /.dockerenv file (Docker)
 * - /proc/1/cgroup contents (Docker, Kubernetes, containerd)
 * - Container-related environment variables
 * - Podman, LXC, WSL, and other container technologies
 *
 * @returns true if running in a detected container/sandbox environment
 */
export function isContainerEnvironment(): boolean {
  // Check for .dockerenv file (Docker indicator)
  try {
    if (fs.existsSync("/.dockerenv")) {
      return true;
    }
  } catch {
    // Ignore errors
  }

  // Check /proc/1/cgroup for container indicators
  try {
    const cgroup = fs.readFileSync("/proc/1/cgroup", "utf-8");
    // Look for container/sandbox patterns in cgroup
    const containerPatterns = [
      "/docker/",
      "/lxc/",
      "/kubepods/",
      "/containerd/",
      "/system.slice/docker",
      "/system.slice/kubepods",
    ];
    if (containerPatterns.some((pattern) => cgroup.includes(pattern))) {
      return true;
    }
  } catch {
    // /proc/1/cgroup may not be readable or may not exist
  }

  // Check environment variables for container indicators
  const containerEnvVars = [
    "container", // Set by some container runtimes
    "DOCKER_CONTAINER",
    "KUBERNETES_SERVICE_HOST", // Kubernetes
    "KUBERNETES_PORT", // Kubernetes
  ];
  if (
    containerEnvVars.some(
      (envVar) =>
        process.env[envVar] !== undefined && process.env[envVar] !== ""
    )
  ) {
    return true;
  }

  // Check for podman/crun in /proc/1/cgroup or /proc/self/cgroup
  try {
    const selfCgroup = fs.readFileSync("/proc/self/cgroup", "utf-8");
    if (selfCgroup.includes("podman") || selfCgroup.includes("crun")) {
      return true;
    }
  } catch {
    // Ignore errors
  }

  // Check if we're in WSL (Windows Subsystem for Linux)
  try {
    const version = fs.readFileSync("/proc/version", "utf-8");
    if (version.toLowerCase().includes("microsoft")) {
      return true;
    }
  } catch {
    // Ignore errors
  }

  return false;
}

/**
 * Get container-specific environment variables that should be set when running
 * in a container or sandbox environment.
 *
 * These variables optimize Claude Code's behavior for non-interactive environments:
 * - CLAUDE_CODE_CONTAINER_MODE: Signals we're in a container
 * - BYPASS_ALL_CONFIRMATIONS: Skip confirmation prompts
 *
 * @returns Environment variables to set, or empty object if not in a container
 */
export function getContainerEnvVars(): Record<string, string> {
  if (!isContainerEnvironment()) {
    return {};
  }

  return {
    CLAUDE_CODE_CONTAINER_MODE: "1",
    BYPASS_ALL_CONFIRMATIONS: "1",
  };
}
