import * as NodeAssert from "node:assert/strict";
import { describe, it } from "vite-plus/test";

import {
  closeCodexHerdrTab,
  createCodexHerdrTab,
  hasHerdrWorkspace,
  startCodexInHerdrTab,
  type HerdrCommand,
} from "./CodexHerdrTab.ts";

describe("Codex Herdr tab commands", () => {
  it("creates a tab in the configured workspace and connects its pane to the Codex socket", async () => {
    const calls: Array<ReadonlyArray<string>> = [];
    const run: HerdrCommand = async (args) => {
      calls.push(args);
      return args[1] === "create"
        ? JSON.stringify({ result: { tab: { tab_id: "tab-7" }, root_pane: { pane_id: "pane-9" } } })
        : "{}";
    };

    const tab = await createCodexHerdrTab(run, {
      workspaceId: "workspace-3",
      cwd: "/tmp/a project",
      threadId: "thread-12345678",
      codexHome: "/tmp/codex home",
    });
    await startCodexInHerdrTab(run, {
      paneId: tab.paneId,
      binaryPath: "/tmp/codex cli",
      providerThreadId: "provider'1",
      socketPath: "/tmp/t3 socket.sock",
    });
    await closeCodexHerdrTab(run, tab.tabId);

    NodeAssert.deepStrictEqual(calls, [
      [
        "tab",
        "create",
        "--workspace",
        "workspace-3",
        "--cwd",
        "/tmp/a project",
        "--label",
        "T3 Codex 12345678",
        "--no-focus",
        "--env",
        "CODEX_HOME=/tmp/codex home",
      ],
      [
        "pane",
        "run",
        "pane-9",
        "'/tmp/codex cli' resume 'provider'\\''1' --remote 'unix:///tmp/t3 socket.sock'",
      ],
      ["tab", "close", "tab-7"],
    ]);
  });

  it("rejects a creation response without tab ownership IDs", async () => {
    await NodeAssert.rejects(
      createCodexHerdrTab(async () => JSON.stringify({ result: { tab: {} } }), {
        workspaceId: "workspace-3",
        cwd: "/tmp/project",
        threadId: "thread-1",
      }),
      /missing tab or pane ID/,
    );
  });

  it("detects a running workspace and lets Herdr choose the active workspace", async () => {
    const calls: Array<ReadonlyArray<string>> = [];
    const run: HerdrCommand = async (args) => {
      calls.push(args);
      return args[0] === "workspace"
        ? JSON.stringify({ result: { workspaces: [{ workspace_id: "workspace-3" }] } })
        : JSON.stringify({
            result: { tab: { tab_id: "tab-7" }, root_pane: { pane_id: "pane-9" } },
          });
    };
    NodeAssert.equal(await hasHerdrWorkspace(run), true);
    await createCodexHerdrTab(run, { cwd: "/tmp/project", threadId: "thread-1" });
    NodeAssert.deepStrictEqual(calls, [
      ["workspace", "list"],
      ["tab", "create", "--cwd", "/tmp/project", "--label", "T3 Codex thread-1", "--no-focus"],
    ]);
    NodeAssert.equal(
      await hasHerdrWorkspace(async () => JSON.stringify({ result: { workspaces: [] } })),
      false,
    );
  });
});
