# Task Spec: Public Standalone XLIFF Repository

## Goal

Create and publish a standalone public GitHub repository for the Articulate XLIFF import doctor product, without coupling it to the kikuai.dev Nuxt site.

## Acceptance Criteria

- AC1: Repository contains the portable XLIFF analyzer/repair core without Nuxt pages, Vue components, site analytics, or site build dependencies.
- AC2: Repository exposes a usable Node CLI for analyzing and safely repairing an original/translated XLIFF pair.
- AC3: Repository includes demo files, a public proof corpus, and automated tests for core and CLI behavior.
- AC4: README explains value, quick start, supported safe repairs, limitations, privacy model, hosted tool link, and AGPL license.
- AC5: The local repository is committed, pushed, and visible as a public GitHub repository.
- AC6: KikuAI project-map is updated if the public repository changes the durable product source of truth.

## Constraints

- Keep the product standalone and local-first.
- Do not copy site-specific UI, Nuxt, local analytics, or payment code.
- Do not claim the tool can fix every XLIFF.
- Preserve AGPL-3.0-only licensing inherited from the source repository.

## Verification Plan

- Run `npm test` in the standalone repository.
- Run CLI analyze on a demo repairable file.
- Run CLI repair and inspect the output file.
- Confirm GitHub repository visibility and URL via `gh repo view`.
- Check git status after commit/push.
