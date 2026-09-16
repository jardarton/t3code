# Fork changes

Upstream: [pingdotgg/t3code](https://github.com/pingdotgg/t3code).

This file lists all changes in this fork that are not in upstream.

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
