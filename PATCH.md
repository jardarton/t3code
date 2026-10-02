# Fork changes

Upstream: [pingdotgg/t3code](https://github.com/pingdotgg/t3code).

This is the fork's delta from upstream and a reference for rebases. It describes
the resulting behavior and why the changes exist; it is not an implementation
plan. File links name the current integration points and may move upstream.

## Nix flake

- Adds a pinned Nix flake building this fork's desktop app and server CLI.
- Exposes `packages.<system>.t3` for the CLI/server and bundled web UI without
  Electron, and `t3code-desktop` (also `t3code` and `default`) for the desktop
  with its required server and CLI. Use `nix run` for desktop or `nix run .#t3`
  for the CLI.
- Supports x86_64 and aarch64 Linux and macOS through the nixpkgs packaging recipe.

To install from NixOS or Home Manager, add the input:

```nix
inputs.t3code.url = "github:jardarton/t3code";
inputs.t3code.inputs.nixpkgs.follows = "nixpkgs";
```

Then add `inputs.t3code.packages.${pkgs.stdenv.hostPlatform.system}.default`
to `environment.systemPackages` or `home.packages`. Replace `default` with `t3`
for CLI-only installation; the default desktop package already includes both
commands, so there is no need to install both packages. Provider CLIs can be
configured with the package's `override` options or installed separately.

The packaging lives in [flake.nix](flake.nix), [nix/package.nix](nix/package.nix),
and [flake.lock](flake.lock). It is independent of the Codex/Herdr change below.

## Codex threads in Herdr

A Codex thread started in T3 Code also gets a Herdr tab on the same environment
machine. Both T3 and the Codex CLI in that tab connect to the **same running
Codex app-server and provider thread**. Messages sent from either surface appear
in the T3 thread.

With Herdr running, no T3 configuration is needed. On each Codex session start,
the server asks `herdr workspace list` whether Herdr is available. The probe
does not start Herdr. A thread opens in the workspace whose worktree checkout
or pane cwd matches its folder; if none matches, T3 creates a workspace and uses
its first tab. Neither operation steals focus. With no overrides, if Herdr
is unavailable, Codex keeps T3's normal stdio transport and no tab is created.

`T3CODE_HERDR_WORKSPACE_ID` pins tabs to one workspace instead of matching the
folder and opts into socket mode without the availability probe. `HERDR_SESSION`
selects a named Herdr session when needed.
`T3CODE_CODEX_SOCKET_DIR` overrides the socket directory. These variables can
be set in the Codex provider instance's environment or inherited by the T3
server. The default socket directory is `codex-sockets` under T3's environment
state directory. The server creates it privately. The `herdr` executable must
be on the server's `PATH`. This also works when a web, desktop, or mobile client
connects remotely: the tab and socket live on the server's machine.
Setting only the socket directory enables socket transport without requiring
Herdr, which is useful for direct Codex CLI attachment.

The transport and tab lifecycle live in
[CodexAdapterV2](apps/server/src/orchestration-v2/Adapters/CodexAdapterV2.ts).
In socket mode, its client factory starts `codex app-server --listen unix://…`;
[CodexSocketStdio](apps/server/src/provider/Layers/CodexSocketStdio.ts) adapts
WebSocket frames to the JSONL client through
[`layerStdio`](packages/effect-codex-app-server/src/client.ts). The CLI attaches
with `codex resume <provider-thread-id> --remote unix://…`, sharing the same
app-server and provider thread. Opening the saved thread in a second app-server
would not provide the live shared session.

Upstream shares an app-server across an instance's provider threads. The adapter
therefore owns a separate Herdr tab per thread, using its working directory and
configured Codex home and binary. The CLI launches after the first native turn
starts, when Codex has created its rollout. Tabs close when their thread unloads
or the provider session shuts down. Discovery and Herdr command failures do not
fail the T3 session. Tab IDs stay in memory; a crash can leave an orphaned tab.

Turns started from the Codex CLI enter T3 through
[ProviderContinuationService](apps/server/src/orchestration-v2/ProviderContinuationService.ts).
The adapter buffers their notifications while the orchestrator records the user
message and allocates a run, then adopts the native turn without sending the
prompt again. Native steering messages are imported once, while echoes of T3
prompts are ignored. The client and WebSocket contracts are unchanged.
