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
in the T3 thread. Claude Code uses the terminal bridge described below.

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

The transport change is local to the Codex provider. In socket mode,
[CodexSessionRuntime](apps/server/src/provider/Layers/CodexSessionRuntime.ts)
starts `codex app-server --listen unix://…` and T3 connects over its Unix
WebSocket. [CodexSocketStdio](apps/server/src/provider/Layers/CodexSocketStdio.ts)
adapts WebSocket frames to the existing JSONL client through the small
[`layerStdio` export](packages/effect-codex-app-server/src/client.ts). Without
socket mode, the original child-process stdio path remains in use. The Codex
CLI attaches with `codex resume <provider-thread-id> --remote unix://…` rather
than starting another app-server.

The behavior to preserve across an upstream rebase is one app-server process
and one provider thread shared by T3 and the CLI. Opening the same saved Codex
thread in a second app-server would not provide the live shared session.

[CodexAdapter](apps/server/src/provider/Layers/CodexAdapter.ts) owns the tab for
the life of its provider session; [HerdrTab](apps/server/src/provider/Layers/HerdrTab.ts)
contains the workspace and tab commands shared with Claude. The tab uses the
thread's working directory, the configured Codex home and binary, and a short
thread-ID label. A fresh
thread's CLI starts on the first `turn/started`: Codex saves the rollout when
the first turn starts and answers an earlier `thread/resume` with "no rollout
found". Waiting for `turn/completed` instead left the tab empty for the whole
first turn, which made a second busy thread look broken. A session resumed from an existing Codex
thread starts the CLI immediately. A failed availability probe quietly keeps
the stdio path; tab creation, launch, and close failures are logged without
failing T3 thread creation or stopping.

Stopping the provider session closes its owned tab. T3 already stops sessions
when a thread is archived or deleted, so both actions close the tab; normal
session shutdown and inactivity reaping close it too. Tab IDs are held in
memory, not stored in the T3 database. An abrupt T3 crash can therefore leave
an orphaned Herdr tab; this patch does not reconcile tabs after a crash.

When a user sends a message from the attached Codex CLI,
[ProviderRuntimeIngestion](apps/server/src/orchestration/Layers/ProviderRuntimeIngestion.ts)
imports that user message once into T3's thread history. T3-originated prompts
are already persisted and are not duplicated. The UI and WebSocket contracts
are unchanged.

Focused tests cover socket transport, Herdr discovery and tab lifecycle,
fresh and resumed Codex sessions, and CLI-originated message ingestion. An
isolated manual test with the real Codex CLI showed a T3 turn in `codex resume`
and a CLI message arriving back in T3. A live Herdr tab has not yet been tested
from this workspace; the Herdr command boundary is exercised with a stubbed
command runner.

## Claude Code threads in Herdr

Claude's Agent SDK runs its own CLI subprocess and has no equivalent of Codex's
live app-server attachment. Starting `claude --resume` in Herdr would create a
second process with an independently loaded conversation. Instead, T3 opens a
Herdr tab running its hidden `__claude-herdr` terminal client. A private Unix
socket under the environment state directory connects that client to the live
Claude adapter. Prompts sent in the tab enter the same SDK prompt queue as T3
prompts, and assistant text streams back to the tab. Terminal prompts are
imported into T3's thread history once; T3 prompts are already persisted.

The shared [HerdrTab](apps/server/src/provider/Layers/HerdrTab.ts) helper routes
Claude tabs by folder using the same workspace policy as Codex. The adapter owns
the socket and tab for the provider session and closes both when it stops.
Approvals and questions still use T3's existing UI. The terminal client offers
`/interrupt` (which stops the session and closes its tab) and `/exit`, but it is
not the full Claude CLI and does not support
Claude's slash commands or replay earlier messages when attaching to an
already-running session. Herdr command failures are logged without failing the
Claude session. The browser, desktop, and mobile clients all use the same server
bridge when connected to that environment.
