/**
 * Minimal ANSI styled logger — no React, no ink, no runtime overhead.
 * Provides colored console output for relay commands.
 */

export const dim = (text: string) => `\x1b[2m${text}\x1b[0m`;
export const bold = (text: string) => `\x1b[1m${text}\x1b[0m`;
export const faint = (text: string) => `\x1b[2m${text}\x1b[0m`;

export const red = (text: string) => `\x1b[31m${text}\x1b[0m`;
export const green = (text: string) => `\x1b[32m${text}\x1b[0m`;
export const yellow = (text: string) => `\x1b[33m${text}\x1b[0m`;
export const blue = (text: string) => `\x1b[34m${text}\x1b[0m`;
export const cyan = (text: string) => `\x1b[36m${text}\x1b[0m`;
export const magenta = (text: string) => `\x1b[35m${text}\x1b[0m`;
export const white = (text: string) => `\x1b[37m${text}\x1b[0m`;

export const bgRed = (text: string) => `\x1b[41m${text}\x1b[0m`;
export const bgGreen = (text: string) => `\x1b[42m${text}\x1b[0m`;
export const bgYellow = (text: string) => `\x1b[43m${text}\x1b[0m`;

export const success = (text: string) => `${green("✓")} ${text}`;
export const ok = (text: string) => `${green("✓")} ${text}`;
export const error = (text: string) => `${red("✗")} ${text}`;
export const warn = (text: string) => `${yellow("⚠")} ${text}`;
export const warning = (text: string) => `${yellow("⚠")} ${text}`;
export const info = (text: string) => `${cyan("→")} ${text}`;
export const bullet = (text: string) => `  ${dim("•")} ${text}`;
export const bulletActive = (text: string) => `${green("●")} ${text}`;
export const bulletInactive = (text: string) => `${dim("○")} ${text}`;
export const item = (text: string) => `${dim(text)}`;

export const heading = (text: string) => bold(text);
export const label = (text: string) => `${dim(text)}`;
export const subheading = (text: string) => bold(text);

export const divider = (char = "─", length = 52) =>
  dim(char.repeat(length));

export const header = (text: string, width = 52) => {
  const padded = ` ${text} `;
  const total = Math.max(padded.length, width);
  const line = "─";
  const side = line.repeat(Math.floor((total - padded.length) / 2));
  return dim(`${side}${padded}${side}`);
};

export const section = (title: string) => {
  console.log("");
  console.log(cyan(bold(`  ${title}`)));
  console.log(divider());
};

export const json = (data: unknown) =>
  console.log(JSON.stringify(data, null, 2));
