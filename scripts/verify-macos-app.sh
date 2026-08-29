#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd -- "$script_dir/.." && pwd)"
app_input="${1:-$repo_root/dist/Untwine.app}"

if [[ ! -d "$app_input" ]]; then
  echo "App bundle not found: $app_input" >&2
  exit 2
fi
app_path="$(cd -- "$(dirname -- "$app_input")" && pwd)/$(basename -- "$app_input")"
contents="$app_path/Contents"
binary="$contents/MacOS/UntwineMac"
web_root="$contents/Resources/Web"

required_files=(
  "$binary"
  "$contents/Info.plist"
  "$web_root/index.html"
  "$web_root/styles.css"
  "$web_root/app.js"
  "$web_root/engine-runtime.js"
  "$web_root/demo-data.js"
  "$web_root/engine/index.js"
  "$web_root/engine/xml.js"
  "$web_root/demo/demo-articulate-original.xlf"
  "$web_root/demo/demo-articulate-translated-safe-repair.xlf"
)
for required_file in "${required_files[@]}"; do
  if [[ ! -f "$required_file" ]]; then
    echo "Missing app resource: $required_file" >&2
    exit 1
  fi
done

plutil -lint "$contents/Info.plist" >/dev/null
[[ "$(plutil -extract CFBundleIdentifier raw "$contents/Info.plist")" == "dev.kikuai.untwine" ]]
[[ "$(plutil -extract LSMinimumSystemVersion raw "$contents/Info.plist")" == "13.0" ]]

cmp "$repo_root/src/index.js" "$web_root/engine/index.js"
cmp "$repo_root/src/xml.js" "$web_root/engine/xml.js"
node --check "$web_root/app.js"
node --check "$web_root/engine-runtime.js"
node --check "$web_root/demo-data.js"
grep -Fq -- '<script src="./engine-runtime.js"></script>' "$web_root/index.html"
grep -Fq -- '<script src="./demo-data.js"></script>' "$web_root/index.html"
grep -Fq -- '<script src="./app.js"></script>' "$web_root/index.html"
grep -Fq -- 'window.untwineAppReady = true;' "$web_root/app.js"
grep -Fq -- 'messageHandlers?.untwineReady?.postMessage' "$web_root/app.js"
node "$repo_root/scripts/verify-macos-engine-runtime.mjs" "$web_root/engine-runtime.js"

verification_root="$(mktemp -d)"
trap 'rm -rf -- "$verification_root"' EXIT
verification_app="$verification_root/Untwine.app"
ditto --noextattr --noqtn "$app_path" "$verification_app"
xattr -cr "$verification_app"

# File-provider folders may attach Finder metadata to an otherwise valid app.
# Verify a byte-identical clean copy in a disposable local directory instead.
codesign --verify --deep --strict "$verification_app"
entitlements_output="$(codesign -d --entitlements :- "$verification_app" 2>&1)"
[[ "$entitlements_output" == *'<key>com.apple.security.app-sandbox</key><true/>'* ]]
[[ "$entitlements_output" == *'<key>com.apple.security.files.user-selected.read-write</key><true/>'* ]]
[[ "$entitlements_output" == *'<key>com.apple.security.network.client</key><true/>'* ]]

# WKWebView requires the network-client sandbox capability even for bundled
# content. Keep the shipped interface free of remote URLs and upload calls.
if grep -ERn -- 'https?://' "$web_root" >/dev/null; then
  echo "Unexpected remote URL in the bundled web interface." >&2
  exit 1
fi

architectures="$(lipo -archs "$binary")"
if [[ -z "$architectures" ]]; then
  echo "No executable architectures found." >&2
  exit 1
fi
if otool -L "$binary" | grep -Eiq -- 'electron|node|tauri'; then
  echo "Unexpected desktop runtime dependency found." >&2
  exit 1
fi

printf 'Verified %s (%s, sandboxed, canonical JS engine)\n' "$app_path" "$architectures"
