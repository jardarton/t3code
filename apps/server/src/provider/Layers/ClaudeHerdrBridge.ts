// @effect-diagnostics nodeBuiltinImport:off
import * as NodeFSP from "node:fs/promises";
import * as NodeNet from "node:net";
import * as NodePath from "node:path";

import { PROVIDER_SEND_TURN_MAX_INPUT_CHARS, type ProviderRuntimeEvent } from "@t3tools/contracts";

const MAX_INPUT_BYTES = 256 * 1024;

export interface ClaudeHerdrBridge {
  readonly socketPath: string;
  readonly publish: (event: ProviderRuntimeEvent) => void;
  readonly publishPrompt: (text: string) => void;
  readonly close: () => Promise<void>;
}

function terminalEvent(event: ProviderRuntimeEvent): object | undefined {
  if (event.type === "content.delta" && event.payload.streamKind === "assistant_text") {
    return { type: "text", text: event.payload.delta };
  }
  if (event.type === "turn.started") return { type: "started" };
  if (event.type === "turn.completed" || event.type === "turn.aborted") {
    return { type: "finished" };
  }
  if (event.type === "runtime.error") {
    return { type: "error", message: event.payload.message };
  }
  return undefined;
}

export async function createClaudeHerdrBridge(input: {
  readonly socketPath: string;
  readonly onPrompt: (text: string) => Promise<void>;
  readonly onInterrupt: () => Promise<void>;
}): Promise<ClaudeHerdrBridge> {
  const socketPath = NodePath.resolve(input.socketPath);
  await NodeFSP.mkdir(NodePath.dirname(socketPath), { recursive: true, mode: 0o700 });
  await NodeFSP.rm(socketPath, { force: true });
  const clients = new Set<NodeNet.Socket>();
  const broadcast = (message: object) => {
    if (clients.size === 0) return;
    const line = `${JSON.stringify(message)}\n`;
    for (const client of clients) {
      if (!client.destroyed) client.write(line);
    }
  };
  const server = NodeNet.createServer((socket) => {
    clients.add(socket);
    let buffer = "";
    let pending = Promise.resolve();
    socket.setEncoding("utf8");
    socket.on("error", () => socket.destroy());
    socket.on("close", () => clients.delete(socket));
    socket.on("data", (chunk: string) => {
      buffer += chunk;
      if (Buffer.byteLength(buffer) > MAX_INPUT_BYTES) {
        socket.destroy();
        return;
      }
      for (let newline = buffer.indexOf("\n"); newline !== -1; newline = buffer.indexOf("\n")) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        let request: unknown;
        try {
          request = JSON.parse(line);
        } catch {
          socket.write(
            `${JSON.stringify({ type: "error", message: "Invalid terminal request." })}\n`,
          );
          continue;
        }
        const requestRecord: Record<string, unknown> =
          typeof request === "object" && request !== null
            ? (request as Record<string, unknown>)
            : {};
        const action = requestRecord.type;
        const text = typeof requestRecord.text === "string" ? requestRecord.text.trim() : "";
        const operation =
          action === "prompt" &&
          text.length > 0 &&
          text.length <= PROVIDER_SEND_TURN_MAX_INPUT_CHARS
            ? () => input.onPrompt(text)
            : action === "interrupt"
              ? input.onInterrupt
              : () => Promise.reject(new Error("Invalid terminal request."));
        pending = pending.then(operation).catch((error: unknown) => {
          if (!socket.destroyed) {
            socket.write(
              `${JSON.stringify({ type: "error", message: error instanceof Error ? error.message : String(error) })}\n`,
            );
          }
        });
      }
    });
  });
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(socketPath, () => {
        server.off("error", reject);
        resolve();
      });
    });
    await NodeFSP.chmod(socketPath, 0o600);
  } catch (error) {
    server.close();
    await NodeFSP.rm(socketPath, { force: true });
    throw error;
  }
  return {
    socketPath,
    publish: (event) => {
      const message = terminalEvent(event);
      if (message) broadcast(message);
    },
    publishPrompt: (text) => broadcast({ type: "prompt", text }),
    close: async () => {
      for (const client of clients) client.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await NodeFSP.rm(socketPath, { force: true });
    },
  };
}
