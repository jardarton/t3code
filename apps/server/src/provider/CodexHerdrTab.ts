// @effect-diagnostics nodeBuiltinImport:off
import * as NodePath from "node:path";

import {
  closeHerdrTab,
  createHerdrTab,
  runHerdrPaneCommand,
  shellQuote,
  type HerdrCommand,
  type HerdrTab,
} from "./HerdrTab.ts";

export { hasHerdrWorkspace, makeHerdrCommand, type HerdrCommand } from "./HerdrTab.ts";
export type CodexHerdrTab = HerdrTab;

export function createCodexHerdrTab(
  run: HerdrCommand,
  input: {
    readonly workspaceId?: string;
    readonly cwd: string;
    readonly threadId: string;
    readonly codexHome?: string;
  },
): Promise<CodexHerdrTab> {
  return createHerdrTab(run, {
    ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
    cwd: input.cwd,
    label: `T3 Codex ${input.threadId.slice(-8)}`,
    ...(input.codexHome ? { environment: { CODEX_HOME: input.codexHome } } : {}),
  });
}

export function startCodexInHerdrTab(
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
  return runHerdrPaneCommand(run, input.paneId, command);
}

export const closeCodexHerdrTab = closeHerdrTab;
