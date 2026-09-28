// @effect-diagnostics nodeBuiltinImport:off
import * as NodePath from "node:path";

import { runHerdrPaneCommand, shellQuote, type HerdrCommand } from "./HerdrTab.ts";

export function startClaudeInHerdrTab(
  run: HerdrCommand,
  input: {
    readonly paneId: string;
    readonly socketPath: string;
    readonly executablePath: string;
    readonly entryPath?: string;
  },
): Promise<void> {
  const command = [
    shellQuote(input.executablePath),
    ...(input.entryPath ? [shellQuote(input.entryPath)] : []),
    "__claude-herdr",
    shellQuote(NodePath.resolve(input.socketPath)),
  ].join(" ");
  return runHerdrPaneCommand(run, input.paneId, command);
}
