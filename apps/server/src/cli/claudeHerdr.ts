// @effect-diagnostics nodeBuiltinImport:off
import * as NodeNet from "node:net";
import * as NodeReadline from "node:readline";

export async function runClaudeHerdrClient(socketPath: string): Promise<void> {
  const socket = NodeNet.createConnection(socketPath);
  await new Promise<void>((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("error", reject);
  });
  socket.on("error", (error) => process.stderr.write(`T3 connection error: ${error.message}\n`));
  const prompt = NodeReadline.createInterface({ input: process.stdin, output: process.stdout });
  const closed = new Promise<void>((resolve) => {
    socket.once("close", resolve);
    prompt.once("close", resolve);
  });
  let responseOpen = false;
  let buffer = "";
  prompt.on("line", (line) => {
    const text = line.trim();
    if (text === "/exit") {
      prompt.close();
      process.stdin.pause();
      socket.destroy();
      return;
    }
    if (text === "/interrupt") {
      socket.write(`${JSON.stringify({ type: "interrupt" })}\n`);
    } else if (text) {
      socket.write(`${JSON.stringify({ type: "prompt", text })}\n`);
    }
    prompt.prompt();
  });
  socket.setEncoding("utf8");
  socket.on("data", (chunk: string) => {
    buffer += chunk;
    for (let newline = buffer.indexOf("\n"); newline !== -1; newline = buffer.indexOf("\n")) {
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      let event: { type?: string; text?: string; message?: string };
      try {
        event = JSON.parse(line) as typeof event;
      } catch {
        continue;
      }
      if (event.type === "text" && typeof event.text === "string") {
        process.stdout.write(event.text);
        responseOpen = true;
      } else if (event.type === "prompt" && typeof event.text === "string") {
        if (responseOpen) process.stdout.write("\n");
        process.stdout.write(`You: ${event.text}\n`);
        responseOpen = false;
      } else if (event.type === "finished") {
        if (responseOpen) process.stdout.write("\n");
        responseOpen = false;
        prompt.prompt();
      } else if (event.type === "error") {
        if (responseOpen) process.stdout.write("\n");
        process.stdout.write(`${event.message ?? "Claude session error."}\n`);
        responseOpen = false;
        prompt.prompt();
      }
    }
  });
  process.stdout.write(
    "T3 Claude Code · /exit leaves this client · /interrupt stops the session\n",
  );
  prompt.setPrompt("> ");
  prompt.prompt();
  await closed;
  prompt.close();
  process.stdin.pause();
  socket.destroy();
}
