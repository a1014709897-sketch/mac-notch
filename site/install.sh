#!/bin/bash
# Mac Notch installer. MIT. Source: https://github.com/a1014709897-sketch/mac-notch
# Fixed release and SHA-256: changes are reviewed alongside each release.
# Does not use sudo, overwrite existing applications, or change Gatekeeper.
set -euo pipefail

main() {
  local version="0.2.0"
  local checksum="41ffe28d1c021395d03f850dfb61cbe055ee762f62d040a9f3fc27f663918c37"
  local bundle_id="io.github.a1014709897-sketch.macnotch"
  local url="https://github.com/a1014709897-sketch/mac-notch/releases/download/v${version}/Mac-Notch-${version}-arm64.zip"
  local verify_only=0
  case "${1:-}" in
    --verify-only) verify_only=1 ;;
    --help|-h)
      printf '%s\n' 'Mac Notch installer — macOS 13+, Apple Silicon' \
        'Usage: bash install.sh [--verify-only]' \
        'Installs v0.2.0 into ~/Applications; existing apps are never overwritten.' \
        '--verify-only: download and verify the release without installing or launching.'
      return 0 ;;
    '') ;;
    *) printf '%s\n' "Unknown argument: $1" >&2; return 1 ;;
  esac
  if [ "$#" -gt 1 ]; then printf '%s\n' 'Too many arguments.' >&2; return 1; fi
  if [ "$(uname -s)" != "Darwin" ]; then
    printf '%s\n' 'Mac Notch currently supports macOS only.' >&2; return 1
  fi
  local major
  major="$(sw_vers -productVersion)"; major="${major%%.*}"
  case "$major" in ''|*[!0-9]*) printf '%s\n' 'Cannot determine macOS version.' >&2; return 1 ;; esac
  if [ "$major" -lt 13 ]; then printf '%s\n' 'macOS 13 or newer is required.' >&2; return 1; fi
  # hw.optional.arm64 remains 1 when a shell is running under Rosetta.
  if [ "$(sysctl -n hw.optional.arm64 2>/dev/null || true)" != "1" ]; then
    printf '%s\n' 'This release supports Apple Silicon only. Intel binaries are not published yet.' >&2; return 1
  fi
  if [ "$(id -u)" = "0" ]; then
    printf '%s\n' 'Run as your normal macOS user. Do not use sudo.' >&2; return 1
  fi
  local dest="${HOME:?HOME is required}/Applications/Mac Notch.app"
  if [ "$verify_only" = "0" ] && { [ -e "$dest" ] || [ -L "$dest" ]; }; then
    printf '%s\n' "An application already exists at: $dest" \
      'Nothing was replaced. Quit and move the existing app before reinstalling.' \
      'Release notes: https://github.com/a1014709897-sketch/mac-notch/releases/latest'
    return 0
  fi
  local workspace
  workspace="$(mktemp -d "${TMPDIR:-/tmp}/mac-notch-install.XXXXXX")"
  # Only these private temporary directories are removed on exit.
  MAC_NOTCH_INSTALL_TEMP="$workspace"
  MAC_NOTCH_INSTALL_STAGE=""
  trap 'rm -rf -- "$MAC_NOTCH_INSTALL_TEMP"; if [ -n "$MAC_NOTCH_INSTALL_STAGE" ]; then rm -rf -- "$MAC_NOTCH_INSTALL_STAGE"; fi' EXIT
  printf '%s\n' "Downloading Mac Notch v${version} from GitHub Releases…"
  curl --fail --location --show-error --silent --proto '=https' --tlsv1.2 \
    --retry 3 --connect-timeout 15 --max-time 600 --output "$workspace/app.zip" "$url"
  local actual
  actual="$(shasum -a 256 "$workspace/app.zip")"; actual="${actual%% *}"
  if [ "$actual" != "$checksum" ]; then
    printf '%s\n' 'SHA-256 mismatch. Installation stopped; no application was installed.' >&2; return 1
  fi
  printf '%s\n' 'SHA-256 verified. Checking application…'
  ditto -x -k "$workspace/app.zip" "$workspace/payload"
  local app="$workspace/payload/Mac Notch.app"
  if [ ! -d "$app" ] || [ -L "$app" ] || [ ! -f "$app/Contents/Info.plist" ]; then
    printf '%s\n' 'The release archive does not contain the expected application.' >&2; return 1
  fi
  local actual_id actual_version
  actual_id="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$app/Contents/Info.plist")"
  actual_version="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$app/Contents/Info.plist")"
  if [ "$actual_id" != "$bundle_id" ] || [ "$actual_version" != "$version" ]; then
    printf '%s\n' 'Unexpected application identity or version. Installation stopped.' >&2; return 1
  fi
  codesign --verify --deep --strict "$app"
  if [ "$verify_only" = "1" ]; then
    printf '%s\n' "Verified Mac Notch v${version}: archive, SHA-256, bundle identity, and ad-hoc signature integrity." \
      'Verify-only: no application installed or launched.'
    return 0
  fi
  mkdir -p "$HOME/Applications"
  MAC_NOTCH_INSTALL_STAGE="$(mktemp -d "$HOME/Applications/.mac-notch-stage.XXXXXX")"
  ditto "$app" "$MAC_NOTCH_INSTALL_STAGE/Mac Notch.app"
  # mv -n avoids overwriting an app installed concurrently. Check for a skipped move.
  mv -n "$MAC_NOTCH_INSTALL_STAGE/Mac Notch.app" "$HOME/Applications/"
  if [ -d "$MAC_NOTCH_INSTALL_STAGE/Mac Notch.app" ]; then
    printf '%s\n' 'An app appeared at the destination; it was not overwritten.' >&2; return 1
  fi
  printf '\n%s\n' "Installed Mac Notch v${version} at: $dest" \
    'Open Mac Notch from your user Applications folder when ready.' \
    'This build is ad-hoc signed, not Apple notarized. Gatekeeper may block opening.' \
    'System security settings were not changed.'
}

# Keep execution at the end: a partial download of this script cannot run main.
main "$@"
