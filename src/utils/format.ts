/**
 * Format number with K/M/B suffixes, no units.
 */
export function formatNumber(num: number): string {
  if (num === 0) return "0";
  if (num >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(1)}B`;
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
}

/**
 * Format reset time as relative time (e.g., "2h 30m left").
 */
export function formatResetsAt(isoTime: string | undefined): string {
  if (!isoTime) return "N/A";
  try {
    const resetDate = new Date(isoTime);
    const now = new Date();
    const diffMs = resetDate.getTime() - now.getTime();

    if (diffMs <= 0) return "Now";

    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 0) {
      return `${hours}h ${minutes}m left`;
    }
    return `${minutes}m left`;
  } catch {
    return "N/A";
  }
}

/**
 * Format reset time as absolute HH:MM datetime (e.g., "22:30 on 10 May").
 */
export function formatResetAtAbsolute(isoTime: string | undefined): string {
  if (!isoTime) return "N/A";
  try {
    const resetDate = new Date(isoTime);
    const day = resetDate.getDate();
    const month = resetDate.toLocaleString("en-US", { month: "short" });
    const hours = resetDate.getHours().toString().padStart(2, "0");
    const minutes = resetDate.getMinutes().toString().padStart(2, "0");
    return `${hours}:${minutes} on ${day} ${month}`;
  } catch {
    return "N/A";
  }
}