{
  description = "T3 Code desktop and server, built from this fork";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs =
    { self, nixpkgs }:
    let
      systems = [
        "x86_64-linux"
        "aarch64-linux"
        "x86_64-darwin"
        "aarch64-darwin"
      ];
      forEachSystem = nixpkgs.lib.genAttrs systems;
      pkgsFor = forEachSystem (system: import nixpkgs { inherit system; });
    in
    {
      packages = forEachSystem (system: rec {
        t3 = pkgsFor.${system}.callPackage ./nix/package.nix { desktop = false; };
        t3code-desktop = pkgsFor.${system}.callPackage ./nix/package.nix { };
        t3code = t3code-desktop;
        default = t3code-desktop;
      });
      apps = forEachSystem (system: {
        default = {
          type = "app";
          program = "${self.packages.${system}.t3code}/bin/t3code-desktop";
        };
        t3 = {
          type = "app";
          program = "${self.packages.${system}.t3}/bin/t3";
        };
      });
      formatter = forEachSystem (system: pkgsFor.${system}.nixfmt);
    };
}
