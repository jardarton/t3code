{
  config,
  lib,
  pkgs,
  ...
}:
let
  cfg = config.programs.t3code-desktop;
in
{
  options.programs.t3code-desktop = {
    enable = lib.mkEnableOption "T3 Code desktop with secure credential storage";
    package = lib.mkOption {
      type = lib.types.package;
      default = pkgs.callPackage ./package.nix { };
      description = "T3 Code desktop package to install.";
    };
  };

  config = lib.mkIf cfg.enable {
    environment.systemPackages = [ cfg.package ];
    # Electron's libsecret backend requires a session Secret Service. NixOS
    # also wires keyring unlocking into supported login managers via PAM.
    services.gnome.gnome-keyring.enable = lib.mkDefault true;
  };
}
