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
    Array.isArray(result.workspaces)
  );
}

function readHerdrList(
  output: string,
  key: "workspaces" | "panes",
): Array<Record<string, unknown>> {
  const response: unknown = JSON.parse(output);
  if (typeof response !== "object" || response === null || !("result" in response)) {
    throw new Error(`Herdr did not return ${key}`);
  }
  const result = response.result;
  if (typeof result !== "object" || result === null || !(key in result)) {
    throw new Error(`Herdr did not return ${key}`);
  }
  const entries = (result as Record<string, unknown>)[key];
  if (!Array.isArray(entries)) throw new Error(`Herdr did not return ${key}`);
  return entries.filter(
    (entry): entry is Record<string, unknown> => typeof entry === "object" && entry !== null,
  );
}

async function workspaceForCwd(run: HerdrCommand, cwd: string): Promise<string | undefined> {
  const workspaces = readHerdrList(await run(["workspace", "list"]), "workspaces");
  const target = NodePath.resolve(cwd);
  for (const workspace of workspaces) {
    const worktree = workspace.worktree;
    if (
      typeof workspace.workspace_id === "string" &&
      typeof worktree === "object" &&
      worktree !== null &&
      "checkout_path" in worktree &&
      typeof worktree.checkout_path === "string" &&
      NodePath.resolve(worktree.checkout_path) === target
    ) {
      return workspace.workspace_id;
    }
  }
  if (workspaces.length === 0) return undefined;
  const panes = readHerdrList(await run(["pane", "list"]), "panes");
  const workspaceIds = new Set(workspaces.map((workspace) => workspace.workspace_id));
  const match = panes.find(
    (pane) =>
      typeof pane.workspace_id === "string" &&
      workspaceIds.has(pane.workspace_id) &&
      typeof pane.cwd === "string" &&
      NodePath.resolve(pane.cwd) === target,
  );
  return typeof match?.workspace_id === "string" ? match.workspace_id : undefined;
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
  const label = `T3 Codex ${input.threadId.slice(-8)}`;
  const workspaceId = input.workspaceId ?? (await workspaceForCwd(run, input.cwd));
  if (!workspaceId) {
    const args = ["workspace", "create", "--cwd", input.cwd, "--no-focus"];
    if (input.codexHome) args.push("--env", `CODEX_HOME=${expandHomePath(input.codexHome)}`);
    const created = readCreatedTab(await run(args));
    await run(["tab", "rename", created.tabId, label]);
    return created;
  }
  const args = [
    "tab",
    "create",
    "--workspace",
    workspaceId,
    "--cwd",
    input.cwd,
    "--label",
    label,
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
