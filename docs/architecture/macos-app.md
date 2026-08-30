# Untwine for Mac Architecture

- **Class:** Live contract
- **Owner:** `macos/`, `scripts/build-macos-app.sh`, and `scripts/verify-macos-app.sh`
- **Update when:** the Mac shell, packaging, sandbox capabilities, bundled data flow, or release boundary changes

## Product Boundary

Untwine for Mac is a thin AppKit/WebKit shell around the repository's existing deterministic JavaScript repair engine. It accepts an original and translated Articulate-style XLIFF 1.2 pair, diagnoses structural drift, and writes a new file only when the repair is metadata-only and deterministic.

It is not a translator, CAT tool, TMS, generic XLIFF editor, cloud service, or second implementation of the parser.

## Data Flow

1. The user chooses or drops two `.xlf`/`.xliff` files into the local WebKit interface.
2. The bundled copy of `src/index.js` and `src/xml.js` analyzes both files in memory.
3. A repair action remains unavailable unless the engine returns `repairable`.
4. AppKit presents `NSSavePanel`; only the newly generated repair or diagnosis is written to the user-selected location.
5. The diagnosis report excludes file names and course text.

The application has no backend, account, telemetry, update service, translation API, or remote content.

## Shell And Packaging

- `macos/Sources/UntwineMac/main.swift` owns app lifecycle, the `WKWebView`, navigation blocking, and native save panels.
- `macos/Web/` owns the desktop UI only; repair behavior stays in `src/`.
- `scripts/build-macos-app.sh` builds `arm64` and `x86_64` Swift binaries by default (or the space-separated `UNTWINE_MAC_ARCHS` override used by CI) and combines them into `dist/Untwine.app` when both are present.
- WebKit does not reliably execute local ES modules from `file://`. The build therefore generates a classic `engine-runtime.js` from the exact canonical engine without adding a bundler dependency or maintaining duplicate parser code. UI and embedded public-demo data remain separate classic scripts.
- Canonical engine files are also copied into the app bundle. Verification compares them byte-for-byte with `src/`, syntax-checks every runtime script, and runs the generated engine against the canonical module across the complete public proof corpus. The app readiness check fails visibly if the runtime scripts do not finish starting.

The development build is ad-hoc signed with `codesign --options runtime --timestamp=none`; the hardened-runtime flag is verified with `codesign -dvv`. The build also writes a versioned `Untwine-<CFBundleShortVersionString>-macOS.zip` and matching SHA-256 receipt beside the app. A public build still requires an owner-controlled Developer ID or App Store signing identity and its corresponding release receipt.

## Sandbox And Privacy

The app enables:

- App Sandbox;
- user-selected read/write access for open and save panels;
- the network-client capability required for WebKit's isolated processes.

The network capability is not used for product traffic. Main-frame navigation is allowed only for `about:` and file URLs inside the bundled `Web/` directory; every other URL is cancelled. The verifier also fails if the bundled web interface contains an `http://` or `https://` URL. Any future remote request, telemetry, updater, or external content requires an explicit architecture and privacy review.

## Verification Contract

Run:

```bash
npm test
npm run build:macos
npm run verify:macos
```

The verifier checks package/Info.plist version consistency, bundle identity and minimum OS, required resources, canonical engine copies, generated-engine behavioral equivalence across all 22 proof cases, JavaScript syntax, signature integrity and hardened-runtime flags, sandbox entitlements, absence of remote URLs, executable architectures, ZIP integrity, extracted app-payload parity and SHA-256 receipt, and absence of Electron/Node/Tauri runtime linkage.

The release-candidate boundary explicitly defers icon/ICNS generation, Developer ID identity, trusted timestamp/notarization, store/Gumroad/payment, updater, analytics, a new framework/runtime, and real Articulate proof. Successfully re-importing an Untwine-repaired real or trial-generated file into the exact Articulate course that produced the original export remains an external gate; a local `clean` verdict is not that proof.
