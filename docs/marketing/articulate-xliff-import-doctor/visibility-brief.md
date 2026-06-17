# Visibility Brief: Articulate XLIFF Import Doctor

Date: 2026-06-12

## Lane

Active validation for a narrow repair/report product. Do not market as a generic localization platform.

## Entity

- Product: Articulate XLIFF Import Doctor.
- Brand: KikuAI.
- Category: local-first Articulate XLIFF import-error diagnosis and safe repair.
- Hosted tool: https://kikuai.dev/fix-articulate-xliff-import-error/
- Repo: https://github.com/KikuAI-Lab/articulate-xliff-import-doctor

## ICP

Primary:

- Instructional designers and eLearning developers working in Articulate Rise 360 or Storyline 360.

Secondary:

- Localization PMs and translators who receive Articulate XLIFF files and need to hand back an importable translated file.
- L&D/training operations owners blocked near a course publishing deadline.

## Job To Be Done

When an Articulate XLIFF import fails after translation, the operator needs to know whether the file can be safely repaired, must go back to the translator, or is likely blocked by course-state/platform issues.

## Core Differentiator

- Not a translator.
- Not a CAT tool.
- Not a generic XLIFF validator.
- It compares the original and translated Articulate XLIFF pair and separates:
  - clean;
  - safely repairable file-level issues;
  - manual review;
  - unrepairable;
  - unsupported/platform-bound cases.

## Proof Assets

Current:

- Public proof corpus with 19 cases.
- CLI test suite passes.
- Safe-repair demo preserves translated text while restoring structural metadata.
- Hosted browser-local version exists.

Missing:

- Real user files.
- Articulate trial-generated import/re-import proof.
- Re-import success after repair on at least one actual Articulate-generated broken case.

## Privacy Claim

Safe wording:

> The file analysis runs locally in your browser. KikuAI should only collect privacy-safe usage events, not file contents.

Avoid:

- "Your data never leaves your device."
- "Guaranteed privacy."
- "Fix any XLIFF."
- "Guaranteed Articulate import."

## First Positioning

Use blocked-import language:

> Check why your Articulate XLIFF will not import, and safely repair the small file-level issues that can be fixed without changing translated text.

Do not lead with:

- "XLIFF validator."
- "Localization automation."
- "AI translation."
- "Course translation app."

## Buyer-Intent Angles

Highest priority:

- Fix Rise 360 XLIFF import error.
- XLIFF translation file doesn't match the course.
- Import failed: Check formatting or re-export translation.
- Storyline XLIFF import successful but nothing changed.
- Articulate XLIFF malformed / missing target / changed trans-unit ID.

## Channel Priority

1. Exact-intent owned pages.
2. Searchable troubleshooting pages that quote the error state, not broad SEO.
3. Tutorial video: reproduce a synthetic failure, run doctor, download repaired file.
4. GitHub README and proof corpus as credibility surface.
5. Community replies only after Nick explicitly approves and only as helpful disclosure, not spam.

## Hard Non-Goals

- Mobile app.
- Generic localization platform.
- Support-desk service.
- Scraping community threads.
- Cold outbound to people with broken files.
- Claiming Articulate endorsement.
- Handling real customer files in public docs.

