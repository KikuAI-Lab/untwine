#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd -- "$script_dir/.." && pwd)"
output_input="${1:-$repo_root/dist}"

mkdir -p "$output_input"
output_root="$(cd -- "$output_input" && pwd)"
if [[ "$output_root" == "/" || "$output_root" == "${HOME:-/nonexistent}" ]]; then
  echo "Refusing unsafe output directory: $output_root" >&2
  exit 2
fi

architectures=(arm64 x86_64)
if [[ -n "${UNTWINE_MAC_ARCHS:-}" ]]; then
  read -r -a architectures <<< "$UNTWINE_MAC_ARCHS"
fi
if [[ "${#architectures[@]}" -eq 0 ]]; then
  echo "At least one macOS architecture is required." >&2
  exit 2
fi

build_root="$(mktemp -d)"
stage_root="$(mktemp -d)"
cleanup() {
  rm -rf -- "$build_root" "$stage_root"
}
trap cleanup EXIT

binaries=()
for architecture in "${architectures[@]}"; do
  case "$architecture" in
    arm64|x86_64) ;;
    *)
      echo "Unsupported architecture: $architecture" >&2
      exit 2
      ;;
  esac

  architecture_root="$build_root/$architecture"
  swift build \
    --package-path "$repo_root/macos" \
    --scratch-path "$architecture_root" \
    --configuration release \
    --arch "$architecture"
  binary_root="$(swift build \
    --package-path "$repo_root/macos" \
    --scratch-path "$architecture_root" \
    --configuration release \
    --arch "$architecture" \
    --show-bin-path)"
  binaries+=("$binary_root/UntwineMac")
done

stage_app="$stage_root/Untwine.app"
contents="$stage_app/Contents"
web_root="$contents/Resources/Web"
mkdir -p "$contents/MacOS" "$web_root/engine" "$web_root/demo"

if [[ "${#binaries[@]}" -eq 1 ]]; then
  install -m 755 "${binaries[0]}" "$contents/MacOS/UntwineMac"
else
  lipo -create "${binaries[@]}" -output "$contents/MacOS/UntwineMac"
  chmod 755 "$contents/MacOS/UntwineMac"
fi

install -m 644 "$repo_root/macos/Info.plist" "$contents/Info.plist"
ditto "$repo_root/macos/Web" "$web_root"
install -m 644 "$repo_root/src/index.js" "$web_root/engine/index.js"
install -m 644 "$repo_root/src/xml.js" "$web_root/engine/xml.js"
install -m 644 "$repo_root/demo-files/demo-articulate-original.xlf" "$web_root/demo/demo-articulate-original.xlf"
install -m 644 "$repo_root/demo-files/demo-articulate-translated-safe-repair.xlf" "$web_root/demo/demo-articulate-translated-safe-repair.xlf"

# WKWebView does not reliably execute local ES modules from file URLs. Generate
# a classic runtime from the canonical engine while keeping UI code separate.
{
  printf '%s\n' '/* Generated from src/ by scripts/build-macos-app.sh. Do not edit. */'
  sed -E 's/^export //' "$repo_root/src/xml.js"
  sed -E '/^import \{$/,/^\} from "\.\/xml\.js";$/d; s/^export //' "$repo_root/src/index.js"
  printf '%s\n' 'globalThis.UntwineEngine = Object.freeze({ analyze, repair, createAnalyticsPayload });'
} > "$web_root/engine-runtime.js"

node -e 'const fs = require("fs"); const [original, translated] = process.argv.slice(1); process.stdout.write("globalThis.untwineDemo = " + JSON.stringify({ original: fs.readFileSync(original, "utf8"), translated: fs.readFileSync(translated, "utf8") }) + ";\n");' \
  "$repo_root/demo-files/demo-articulate-original.xlf" \
  "$repo_root/demo-files/demo-articulate-translated-safe-repair.xlf" \
  > "$web_root/demo-data.js"

xattr -cr "$stage_app"
codesign \
  --force \
  --deep \
  --sign - \
  --entitlements "$repo_root/macos/Untwine.entitlements" \
  "$stage_app"

plutil -lint "$contents/Info.plist" >/dev/null
codesign --verify --deep --strict "$stage_app"

app_path="$output_root/Untwine.app"
if [[ -e "$app_path" ]]; then
  existing_plist="$app_path/Contents/Info.plist"
  existing_binary="$app_path/Contents/MacOS/UntwineMac"
  if [[ ! -d "$app_path" || ! -f "$existing_plist" || ! -f "$existing_binary" ]]; then
    echo "Refusing to replace unexpected output: $app_path" >&2
    exit 2
  fi
  if [[ "$(plutil -extract CFBundleIdentifier raw "$existing_plist" 2>/dev/null || true)" != "dev.kikuai.untwine" ]]; then
    echo "Refusing to replace an app with a different bundle identifier: $app_path" >&2
    exit 2
  fi
  rm -rf -- "$app_path"
fi
ditto "$stage_app" "$app_path"

printf 'Built %s (%s)\n' "$app_path" "$(lipo -archs "$app_path/Contents/MacOS/UntwineMac")"
