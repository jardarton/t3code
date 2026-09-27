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

  it("places a thread in the workspace already using its folder", async () => {
    const calls: Array<ReadonlyArray<string>> = [];
    const run: HerdrCommand = async (args) => {
      calls.push(args);
      if (args[0] === "workspace") {
        return JSON.stringify({ result: { workspaces: [{ workspace_id: "workspace-3" }] } });
      }
      if (args[0] === "pane") {
        return JSON.stringify({
          result: { panes: [{ workspace_id: "workspace-3", cwd: "/tmp/project" }] },
        });
      }
      return JSON.stringify({
        result: { tab: { tab_id: "tab-7" }, root_pane: { pane_id: "pane-9" } },
      });
    };
    NodeAssert.equal(await hasHerdrWorkspace(run), true);
    await createCodexHerdrTab(run, { cwd: "/tmp/project", threadId: "thread-1" });
    NodeAssert.deepStrictEqual(calls, [
      ["workspace", "list"],
      ["workspace", "list"],
      ["pane", "list"],
      [
        "tab",
        "create",
        "--workspace",
        "workspace-3",
        "--cwd",
        "/tmp/project",
        "--label",
        "T3 Codex thread-1",
        "--no-focus",
      ],
    ]);
    NodeAssert.equal(
      await hasHerdrWorkspace(async () => JSON.stringify({ result: { workspaces: [] } })),
      true,
    );
  });

  it("creates a workspace for an unmatched folder and uses its first tab", async () => {
    const calls: Array<ReadonlyArray<string>> = [];
    const run: HerdrCommand = async (args) => {
      calls.push(args);
      if (args[0] === "workspace" && args[1] === "list") {
        return JSON.stringify({ result: { workspaces: [{ workspace_id: "workspace-3" }] } });
      }
      if (args[0] === "pane") {
        return JSON.stringify({
          result: { panes: [{ workspace_id: "workspace-3", cwd: "/other" }] },
        });
      }
      return JSON.stringify({
        result: { tab: { tab_id: "tab-7" }, root_pane: { pane_id: "pane-9" } },
      });
    };
    const tab = await createCodexHerdrTab(run, { cwd: "/tmp/project", threadId: "thread-1" });
    NodeAssert.deepStrictEqual(tab, { tabId: "tab-7", paneId: "pane-9" });
    NodeAssert.deepStrictEqual(calls, [
      ["workspace", "list"],
      ["pane", "list"],
      ["workspace", "create", "--cwd", "/tmp/project", "--no-focus"],
      ["tab", "rename", "tab-7", "T3 Codex thread-1"],
    ]);
  });

  it("matches a managed worktree even when its panes have changed directory", async () => {
    const calls: Array<ReadonlyArray<string>> = [];
    const run: HerdrCommand = async (args) => {
      calls.push(args);
      return args[0] === "workspace"
        ? JSON.stringify({
            result: {
              workspaces: [
                { workspace_id: "workspace-3", worktree: { checkout_path: "/tmp/project" } },
              ],
            },
          })
        : JSON.stringify({
            result: { tab: { tab_id: "tab-7" }, root_pane: { pane_id: "pane-9" } },
          });
    };
    await createCodexHerdrTab(run, { cwd: "/tmp/project", threadId: "thread-1" });
    NodeAssert.deepStrictEqual(
      calls.map((args) => args.slice(0, 2)),
      [
        ["workspace", "list"],
        ["tab", "create"],
      ],
    );
    NodeAssert.deepStrictEqual(calls[1]?.slice(2, 4), ["--workspace", "workspace-3"]);
  });
});
