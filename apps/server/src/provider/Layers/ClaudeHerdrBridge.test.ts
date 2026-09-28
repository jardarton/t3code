// @effect-diagnostics nodeBuiltinImport:off
import * as NodeAssert from "node:assert/strict";
import * as NodeFS from "node:fs";
import * as NodeNet from "node:net";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { EventId, ProviderDriverKind, ThreadId, TurnId } from "@t3tools/contracts";
import { it } from "vite-plus/test";

import { createClaudeHerdrBridge } from "./ClaudeHerdrBridge.ts";

it("streams Claude's live assistant text to a connected terminal", async () => {
  const directory = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3-claude-bridge-"));
  const bridge = await createClaudeHerdrBridge({
    socketPath: NodePath.join(directory, "claude.sock"),
    onPrompt: async () => {},
    onInterrupt: async () => {},
  });
  try {
    const socket = await new Promise<NodeNet.Socket>((resolve, reject) => {
      const client = NodeNet.createConnection(bridge.socketPath);
      client.once("connect", () => resolve(client));
      client.once("error", reject);
    });
    const received = new Promise<string>((resolve) => {
      socket.once("data", (chunk: Buffer) => resolve(chunk.toString()));
    });
    bridge.publish({
      type: "content.delta",
      eventId: EventId.make("event-1"),
      provider: ProviderDriverKind.make("claudeAgent"),
      createdAt: "2026-01-01T00:00:00.000Z",
      threadId: ThreadId.make("thread-1"),
      turnId: TurnId.make("turn-1"),
      payload: { streamKind: "assistant_text", delta: "Hello from Claude." },
      providerRefs: {},
    });
    NodeAssert.equal(await received, '{"type":"text","text":"Hello from Claude."}\n');
    socket.destroy();
  } finally {
    await bridge.close();
    NodeFS.rmSync(directory, { recursive: true, force: true });
  }
});
