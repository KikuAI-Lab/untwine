# Comparison And Error-Page Backlog

Date: 2026-06-12

These are owned-page candidates. They should be built only after the copy can stay inside the current product boundary: diagnosis plus safe repair for deterministic file-level issues.

## P0 Error Pages

### Fix Rise 360 XLIFF import error

Target queries:

- `rise 360 xliff import error`
- `fix rise xliff import failed`
- `articulate rise xliff import error`

Page promise:

- Upload original and translated XLIFF.
- See whether the file has structural blockers.
- Repair only safe metadata issues.

Do not claim:

- Articulate-side bug fixes.
- Guaranteed import.

### XLIFF translation file doesn't match the course

Target queries:

- `xliff translation file doesn't match the course`
- `translation file doesn't match this course`
- `articulate xliff file doesn't match course`

Page promise:

- Explain course-specific XLIFF.
- Detect changed/missing IDs and trans-unit drift.
- Separate repairable file metadata from unsupported course-state mismatch.

### Import failed: Check formatting or re-export translation

Target queries:

- `import failed check formatting or re-export translation`
- `rise xliff check formatting re-export translation`

Page promise:

- Detect malformed XML, missing target, inline tag drift, wrong version/wrapper.
- Give translator-friendly diagnostic report.

### Storyline XLIFF import successful but nothing changed

Target queries:

- `storyline xliff import successful but nothing changed`
- `storyline imported xliff still english`

Current blocker:

- Needs target/source equality and untranslated-target detector before strong page.

### Articulate XLIFF missing target checker

Target queries:

- `xliff missing target articulate`
- `articulate xliff source target import error`

Page promise:

- Detect missing target and explain why automatic repair may not be safe.

## P1 Comparison Pages

### Articulate XLIFF Doctor vs generic XLIFF validator

Position:

- Generic validators answer "is this XML/XLIFF valid?"
- This tool answers "does this translated file still match the original Articulate export?"

### Articulate XLIFF Doctor vs CAT tool QA

Position:

- CAT tools may validate translation segments.
- This tool focuses on Articulate import blockers after translation.

### Articulate XLIFF Doctor vs Articulate support case

Position:

- Support is still needed for platform bugs or proprietary course-state issues.
- The doctor gives a privacy-friendly first diagnosis before sending files anywhere.

## P2 Educational Pages

Avoid generic "what is XLIFF" unless it is tied to a problem. Acceptable educational pages:

- Why Articulate XLIFF files are course-specific.
- Why editing a Rise course after export can break imports.
- Why missing target segments cause import or no-change failures.
- Why protected inline tags matter in Storyline/Rise translations.

