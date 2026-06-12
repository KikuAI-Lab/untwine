# Evidence: Public Standalone XLIFF Repository

## AC1: Portable core without site coupling

PASS.

Evidence:
- `src/index.js` and `src/xml.js` contain the standalone analyzer/repair core.
- No Nuxt pages, Vue components, KikuTools event helpers, payment code, or site build config were copied.

## AC2: Node CLI

PASS.

Evidence:
- `bin/articulate-xliff-doctor.js` exposes:
  - `analyze <original.xlf> <translated.xlf> [--json]`
  - `repair <original.xlf> <translated.xlf> --out <repaired.xlf>`
- Manual command:
  - `node bin/articulate-xliff-doctor.js analyze demo-files/demo-articulate-original.xlf demo-files/demo-articulate-translated-safe-repair.xlf`
  - Exit code: `2`, expected because issues were detected.
  - Output included `Verdict: repairable`.
- Manual command:
  - `node bin/articulate-xliff-doctor.js repair demo-files/demo-articulate-original.xlf demo-files/demo-articulate-translated-safe-repair.xlf --out /tmp/demo-articulate-translated-safe-repair.repaired.xlf`
  - Exit code: `0`.
  - Output included `Critical issues after repair: 0`.

## AC3: Demo files, proof corpus, automated tests

PASS.

Evidence:
- Demo files exist under `demo-files/`.
- Proof corpus exists under `test/articulate-xliff-corpus/`.
- Fresh command: `npm test`
- Result: `3` tests, `3` pass, `0` fail.

## AC4: README

PASS.

Evidence:
- `README.md` includes value proposition, quick start, CLI usage, library usage, privacy model, safe repairs, limitations, hosted tool link, test corpus, and AGPL license.

## AC5: Public GitHub repository

PASS.

Evidence:
- Repository URL: `https://github.com/KikuAI-Lab/articulate-xliff-import-doctor`
- Fresh command: `gh repo view KikuAI-Lab/articulate-xliff-import-doctor --json name,visibility,url,isPrivate`
- Result: `visibility=PUBLIC`, `isPrivate=false`.
- Branch `main` tracks `origin/main`.

## AC6: Project-map sync

BLOCKED.

Evidence:
- Project-map update was attempted after the public repository URL existed.
- `/Users/nick/dev/kikuai-project-map` already had unrelated dirty files and index refresh noise across multiple files.
- No project-map commit or push was made to avoid absorbing unrelated work-in-progress into this task.
