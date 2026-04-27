export interface ShellPromise {
  cwd(cwd: string): ShellPromise;
  then<TResult1 = { exitCode: number; stdout: string; stderr: string }, TResult2 = never>(
    onfulfilled?:
      | ((value: {
          exitCode: number;
          stdout: string;
          stderr: string;
        }) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2>;
  catch<TResult2 = never>(
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<{ exitCode: number; stdout: string; stderr: string } | TResult2>;
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface PluginContext {
  project?: {
    name: string;
    path: string;
  };
  directory: string;
  worktree?: string;
  client?: {
    app: {
      log: (opts: {
        body: { service: string; level: string; message: string; [key: string]: unknown };
      }) => Promise<boolean>;
      agents: () => Promise<{ name: string }[]>;
    };
    session: {
      prompt: (opts: {
        path: { id: string };
        body: {
          parts: { type: "text"; text: string }[];
          noReply?: boolean;
        };
      }) => Promise<unknown>;
    };
  };
  $: {
    (template: TemplateStringsArray, ...args: string[]): ShellPromise;
    (cmd: string): Promise<{ exitCode: number; stdout: string; stderr: string }>;
  };
}

export type Plugin = (ctx: PluginContext) => Promise<PluginHooks>;

export interface PluginHooks {
  event?: (opts: { event: Event }) => Promise<void>;
  tool?: Record<string, unknown>;
  "tool.execute.before"?: (input: { tool: string }, output: { args: ToolArgs }) => Promise<void>;
  "tool.execute.after"?: (input: { tool: string }, output: { args: ToolArgs }) => Promise<void>;
  "session.idle"?: () => Promise<void>;
  "shell.env"?: (input: { cwd: string }, output: { env: Record<string, string> }) => Promise<void>;
  [key: string]: unknown;
}

export interface ToolArgs {
  filePath?: string;
  file_path?: string;
  path?: string;
  destination?: string;
  command?: string;
  [key: string]: unknown;
}

export interface Event {
  type: string;
  input?: { tool?: string };
  output?: { args?: ToolArgs };
  [key: string]: unknown;
}
