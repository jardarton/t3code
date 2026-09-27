// @effect-diagnostics nodeBuiltinImport:off
import * as NodeChildProcess from "node:child_process";
import * as NodePath from "node:path";
import * as NodeUtil from "node:util";

import { expandHomePath } from "../../pathExpansion.ts";

const execFileAsync = NodeUtil.promisify(NodeChildProcess.execFile);

export type HerdrCommand = (args: ReadonlyArray<string>) => Promise<string>;

export interface CodexHerdrTab {
  readonly tabId: string;
  readonly paneId: string;
}

export function makeHerdrCommand(environment: NodeJS.ProcessEnv, timeoutMs = 5_000): HerdrCommand {
  return async (args) => {
    const { stdout } = await execFileAsync("herdr", [...args], {
      env: environment,
      timeout: timeoutMs,
      maxBuffer: 64 * 1024,
    });
    return stdout;
  };
}

export async function hasHerdrWorkspace(run: HerdrCommand): Promise<boolean> {
  const response: unknown = JSON.parse(await run(["workspace", "list"]));
  if (typeof response !== "object" || response === null || !("result" in response)) return false;
  const result = response.result;
  return (
    typeof result === "object" &&
    result !== null &&
    "workspaces" in result &&
    Array.isArray(result.workspaces) &&
    result.workspaces.length > 0
  );
}

function readCreatedTab(output: string): CodexHerdrTab {
  const response: unknown = JSON.parse(output);
  if (typeof response !== "object" || response === null || !("result" in response)) {
    throw new Error("Herdr did not return a tab result");
  }
  const result = response.result;
  if (typeof result !== "object" || result === null) {
    throw new Error("Herdr did not return a tab result");
  }
  const tab = "tab" in result ? result.tab : undefined;
  const pane = "root_pane" in result ? result.root_pane : undefined;
  if (
    typeof tab !== "object" ||
    tab === null ||
    !("tab_id" in tab) ||
    typeof tab.tab_id !== "string" ||
    typeof pane !== "object" ||
    pane === null ||
    !("pane_id" in pane) ||
    typeof pane.pane_id !== "string"
  ) {
    throw new Error("Herdr tab result is missing tab or pane ID");
  }
  return { tabId: tab.tab_id, paneId: pane.pane_id };
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

export async function createCodexHerdrTab(
  run: HerdrCommand,
  input: {
    readonly workspaceId?: string;
    readonly cwd: string;
    readonly threadId: string;
    readonly codexHome?: string;
  },
): Promise<CodexHerdrTab> {
  const args = [
    "tab",
    "create",
    ...(input.workspaceId ? ["--workspace", input.workspaceId] : []),
    "--cwd",
    input.cwd,
    "--label",
    `T3 Codex ${input.threadId.slice(-8)}`,
    "--no-focus",
  ];
  if (input.codexHome) args.push("--env", `CODEX_HOME=${expandHomePath(input.codexHome)}`);
  return readCreatedTab(await run(args));
}

export async function startCodexInHerdrTab(
  run: HerdrCommand,
  input: {
    readonly paneId: string;
    readonly binaryPath: string;
    readonly providerThreadId: string;
    readonly socketPath: string;
  },
): Promise<void> {
  const command = [
    shellQuote(input.binaryPath),
    "resume",
    shellQuote(input.providerThreadId),
    "--remote",
    shellQuote(`unix://${NodePath.resolve(input.socketPath)}`),
  ].join(" ");
  await run(["pane", "run", input.paneId, command]);
}

export async function closeCodexHerdrTab(run: HerdrCommand, tabId: string): Promise<void> {
  await run(["tab", "close", tabId]);
}
