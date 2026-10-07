import * as NodeSocket from "@effect/platform-node/NodeSocket";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as PlatformError from "effect/PlatformError";
import * as Schedule from "effect/Schedule";
import * as Sink from "effect/Sink";
import * as Stdio from "effect/Stdio";
import * as Stream from "effect/Stream";
import * as Socket from "effect/socket/Socket";
import * as CodexErrors from "effect-codex-app-server/errors";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** Adapt Codex's one-JSON-message-per-WebSocket-frame transport to the JSONL client. */
export const makeCodexSocketStdio = (socketPath: string) =>
  Effect.gen(function* () {
    const webSocketConstructor = Layer.succeed(
      Socket.WebSocketConstructor,
      (url, protocols) =>
        new NodeSocket.NodeWS.WebSocket(
          url,
          protocols as string | string[] | undefined,
        ) as unknown as globalThis.WebSocket,
    );
    const socket = yield* Socket.makeWebSocket(`ws+unix://${socketPath}:/`, {
      openTimeout: "1 second",
    }).pipe(Effect.provide(webSocketConstructor));
    const reader = yield* socket.reader.pipe(
      Effect.retry({ schedule: Schedule.spaced("100 millis"), times: 50 }),
      Effect.mapError(
        (cause) =>
          new CodexErrors.CodexAppServerTransportError({
            operation: "read-input-stream",
            cause,
          }),
      ),
    );
    const writer = yield* socket.writer;
    const socketError = (method: string, cause: unknown) =>
      PlatformError.systemError({ _tag: "Unknown", module: "CodexSocketStdio", method, cause });

    return Stdio.make({
      args: Effect.succeed([]),
      stdin: Stream.fromIterableEffectRepeat(reader.pull).pipe(
        Stream.map((frame) =>
          encoder.encode(`${typeof frame === "string" ? frame : decoder.decode(frame)}\n`),
        ),
        Stream.mapError((cause) => socketError("read", cause)),
      ),
      stdout: () =>
        Sink.forEach((chunk: string | Uint8Array) =>
          writer
            .write((typeof chunk === "string" ? chunk : decoder.decode(chunk)).trimEnd())
            .pipe(Effect.mapError((cause) => socketError("write", cause))),
        ),
      stderr: () => Sink.drain,
    });
  });
