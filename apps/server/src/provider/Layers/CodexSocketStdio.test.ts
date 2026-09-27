// @effect-diagnostics nodeBuiltinImport:off
import * as NodeFS from "node:fs";
import * as NodeHttp from "node:http";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import * as NodeSocket from "@effect/platform-node/NodeSocket";
import { it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as CodexClient from "effect-codex-app-server/client";
import { assert } from "vite-plus/test";

import { makeCodexSocketStdio } from "./CodexSocketStdio.ts";

it.effect("connects the Codex client through a Unix WebSocket", () =>
  Effect.gen(function* () {
    const directory = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3-codex-socket-"));
    const socketPath = NodePath.join(directory, "codex.sock");
    const httpServer = NodeHttp.createServer();
    const webSocketServer = new NodeSocket.NodeWS.WebSocketServer({ server: httpServer });
    yield* Effect.addFinalizer(() =>
      Effect.promise(
        () =>
          new Promise<void>((resolve) => {
            for (const client of webSocketServer.clients) client.terminate();
            webSocketServer.close(() =>
              httpServer.close(() => {
                NodeFS.rmSync(directory, { recursive: true, force: true });
                resolve();
              }),
            );
          }),
      ),
    );
    yield* Effect.promise(
      () =>
        new Promise<void>((resolve, reject) => {
          httpServer.once("error", reject);
          httpServer.listen(socketPath, resolve);
        }),
    );
    webSocketServer.on("connection", (peer) =>
      peer.on("message", (data) => {
        const request = JSON.parse(data.toString()) as { id: number; method: string };
        assert.equal(request.method, "initialize");
        peer.send(
          JSON.stringify({
            id: request.id,
            result: {
              userAgent: "socket-mock",
              codexHome: directory,
              platformFamily: "unix",
              platformOs: "linux",
            },
          }),
        );
      }),
    );

    const stdio = yield* makeCodexSocketStdio(socketPath);
    const context = yield* Layer.build(CodexClient.layerStdio(stdio));
    const client = yield* Effect.service(CodexClient.CodexAppServerClient).pipe(
      Effect.provide(context),
    );
    const initialized = yield* client.request("initialize", {
      clientInfo: { name: "t3-codex-socket-test", title: "T3 Codex Socket Test", version: "0.0.0" },
      capabilities: { experimentalApi: true, optOutNotificationMethods: null },
    });
    assert.equal(initialized.userAgent, "socket-mock");
  }).pipe(Effect.scoped),
);
