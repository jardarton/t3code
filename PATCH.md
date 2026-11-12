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

On Linux, the desktop requires an unlocked Secret Service keyring to save server
credentials. The package includes the runtime libraries for `node-pty` and
Electron's libsecret backend; it does not fall back to plaintext storage.
NixOS users can install the desktop and enable GNOME Keyring together:

```nix
imports = [ inputs.t3code.nixosModules.desktop ];
programs.t3code-desktop.enable = true;
```

If installing only via Home Manager, enable `services.gnome.gnome-keyring.enable`
in your NixOS configuration (or provide another compatible Secret Service).
Log out and back in after enabling it. Custom login managers such as greetd may
also require `security.pam.services.greetd.enableGnomeKeyring = true`; automatic
unlocking needs a password login and a matching keyring password. For autologin,
unlock the keyring manually using Seahorse before adding a server.

The packaging lives in [flake.nix](flake.nix), [nix/package.nix](nix/package.nix),
[nix/nixos-module.nix](nix/nixos-module.nix), and [flake.lock](flake.lock).
