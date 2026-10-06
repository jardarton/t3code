{
  lib,
  t3code,
  fetchPnpmDeps,
  pnpm_11,
  fetchFromGitHub,
  nodejs,
  electron_44,
  desktop ? true,
}:
let
  spdx = fetchFromGitHub {
    owner = "spdx";
    repo = "license-list-data";
    rev = "c4a7237ec8f4654e867546f9f409749300f1bf4c";
    hash = "sha256-FbeeEBAg9ih6DkAsXdU6ruZwkC7A2u2zYBvblpl54q0=";
  };
  # Keep the fetched closure stable when consumers override nixpkgs.
  pnpmWorkspaces = [
    "@t3tools/monorepo"
    "t3..."
    "@t3tools/scripts..."
  ]
  ++ lib.optional desktop "@t3tools/desktop...";
  unwrapped = t3code.unwrapped.overrideAttrs (
    old:
    {
      version = (lib.importJSON ../apps/server/package.json).version;
      src = lib.cleanSource ../.;
      inherit pnpmWorkspaces;
      # The license plugin otherwise downloads these during the sandboxed build.
      postPatch = old.postPatch + ''
        mkdir -p .generated/third-party-licenses/spdx/v3.28.0
        # Newer nixpkgs already copies these from the store as read-only files.
        cp --remove-destination ${spdx}/json/details/*.json .generated/third-party-licenses/spdx/v3.28.0/
      '';
      pnpmDeps = fetchPnpmDeps {
        pnpm = pnpm_11;
        pname = "t3code-deps";
        src = lib.cleanSource ../.;
        inherit pnpmWorkspaces;
        fetcherVersion = 4;
        hash =
          if desktop then
            "sha256-WZSV8+ugCLfls7jW7hPFoL4wYAffpER71zt2VhaTVzQ="
          else
            "sha256-NAbIEfisLQ6y54yZHVxHRR7JbYOZHJAGMJ4oFPUXpYQ=";
      };
      meta = old.meta // {
        mainProgram = if desktop then "t3code-desktop" else "t3";
        changelog = "https://github.com/jardarton/t3code/blob/main/PATCH.md";
      };
    }
    // lib.optionalAttrs (!desktop) {
      pname = "t3-unwrapped";
      buildPhase = ''
        runHook preBuild
        pnpm exec vp run --filter t3 build
        runHook postBuild
      '';
      desktopItems = [ ];
      installPhase = ''
        runHook preInstall
        mkdir -p "$out/libexec/t3code/apps/server"
        cp -r --no-preserve=mode node_modules "$out/libexec/t3code/"
        cp -r --no-preserve=mode apps/server/{node_modules,dist} "$out/libexec/t3code/apps/server/"
        find "$out/libexec/t3code" -xtype l -delete
        # node-pty cannot chmod its helper in the immutable store at runtime.
        find "$out/libexec/t3code" -path '*/node-pty/prebuilds/darwin-*/spawn-helper' -exec chmod 755 {} +
        makeWrapper ${lib.getExe nodejs} "$out/bin/t3" \
          --add-flags "$out/libexec/t3code/apps/server/dist/bin.mjs"
        runHook postInstall
      '';
    }
  );
in
t3code.override {
  t3code-unwrapped = unwrapped;
  t3code-resource-monitor = t3code.resourceMonitor.overrideAttrs {
    inherit (unwrapped) src version;
    sourceRoot = "source/native/resource-monitor";
  };
}
