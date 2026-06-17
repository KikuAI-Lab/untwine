# YouTube And Tutorial Seeding Briefs

Date: 2026-06-12

Do not contact creators or publish tutorials without Nick's approval. The first tutorial should be owned, short, and based on synthetic demo files.

## Tutorial 1: Fix A Safe Articulate XLIFF Import Blocker

Audience:

- Instructional designer or localization PM with a translated XLF that will not import.

Scenario:

- Original XLIFF plus translated XLIFF.
- CAT tool changed a `trans-unit` ID and XML declaration.

Flow:

1. Show import-error symptom text.
2. Open the tool page.
3. Drop original and translated files.
4. Preview says `repairable`.
5. Download repaired XLF.
6. Explain that translated text was not changed.

CTA:

- Try the browser-local checker with a copy of your file pair.

## Tutorial 2: When Not To Auto-Repair Articulate XLIFF

Audience:

- Translator/eLearning developer who sees missing target or inline tag drift.

Scenario:

- Demo file with protected inline tag count drift and missing target.

Flow:

1. Upload file pair.
2. Preview says `manual_review`.
3. Explain why automatic rewrite could corrupt translated content.
4. Download/report diagnostic for translator/vendor.

CTA:

- Use the report to decide whether to fix in the translation tool or recreate the export.

## Tutorial 3: Why "Translation File Doesn't Match The Course" Happens

Audience:

- Rise 360 user translating duplicated or edited courses.

Scenario:

- Explain course-specific XLIFF and why changed IDs matter.

Flow:

1. Show the error phrase.
2. Explain course-state mismatch.
3. Run synthetic changed-ID file.
4. Separate safe metadata repair from unsupported course-state mismatch.

CTA:

- Check the file before sending it to support or back to translation.

## Tutorial 4: Articulate XLIFF Import Troubleshooting Checklist

Audience:

- L&D operator with a deadline.

Checklist:

- Same course version?
- Original and translated XLIFF pair?
- XLIFF 1.2?
- Well-formed XML?
- Targets present?
- Protected inline tags preserved?
- Trans-unit IDs preserved?

CTA:

- Use the doctor for file-level checks, then contact Articulate support for platform or course-state issues.

