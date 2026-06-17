# Articulate XLIFF Operator-Zero Brief

Date: 2026-06-12

This brief turns the Articulate XLIFF idea into a computer-checkable validation lane. It is not a launch claim. It separates what the current CLI proves from what still needs real Articulate user files or an Articulate trial account.

## Buyer And Workflow

Primary buyer/operator:

- Instructional designer or eLearning developer who builds courses in Rise 360 or Storyline 360.
- Localization project manager who receives translated Articulate XLIFF files from a translator, CAT tool, or vendor.
- L&D / training operations owner who must publish a translated course by a deadline.

Pain moment:

1. The course is already built.
2. The original XLIFF/XLF was exported from Articulate.
3. Translation work already happened.
4. The translated file fails to import, imports without changing the course, or gets stuck.
5. The operator cannot tell whether the file is malformed, mismatched to the course, missing target segments, damaged by a CAT tool, or blocked by an Articulate-side bug.

The buyer does not want a generic XLIFF validator. They want to know:

- "Can this translated file safely import back into my Articulate course?"
- "If not, is there a safe file-level repair?"
- "If not repairable, what do I tell the translator or client?"

## Why A Website Is Enough For The First Proof

The workflow is desktop/file-based:

- Articulate authoring is a desktop/web authoring workflow.
- XLIFF files live in the user's local file system, translation tool, email, or project folder.
- The useful action is upload original + translated file, see a preview, download a repaired file or diagnostic report.

Mobile app is not needed for the first proof:

- Import/export and re-import testing happen on desktop.
- File pair selection is awkward on phones.
- The credibility problem is repairability and trust, not mobile convenience.

Possible later surfaces:

- Desktop-first web app: current best surface.
- CLI/local batch tool: plausible for localization vendors and agencies.
- Desktop wrapper: possible only after repeated batch usage.
- Browser extension: weak fit unless a future Articulate page integration becomes clearly useful.
- Smartphone app: not justified until there is evidence of mobile-first file triage, which is unlikely in this workflow.

## Current Repo Proof

Commands run:

```bash
npm test
node bin/articulate-xliff-doctor.js analyze demo-files/demo-articulate-original.xlf demo-files/demo-articulate-translated-safe-repair.xlf --json
node bin/articulate-xliff-doctor.js analyze demo-files/demo-articulate-original.xlf demo-files/demo-articulate-translated-manual-review.xlf --json
```

Result:

- `npm test` passed: 3 tests, 0 failures.
- Public proof corpus contains 19 cases:
  - 1 clean.
  - 5 repairable.
  - 4 manual review.
  - 3 unrepairable.
  - 6 unsupported.
- Safe-repair demo returns `repairability: repairable` for changed `trans-unit` ID plus non-UTF-8 XML declaration.
- Manual-review demo returns `repairability: manual_review` for protected inline tag drift and missing target.

This is enough to show the current engine has a real file-level artifact path. It is not enough to prove the real-world repairable rate.

## Public Error Evidence

Observed public pain patterns:

- "XLIFF translation file doesn't match the course."
- "Import failed: Translation file doesn't match this course."
- "Import failed: Check formatting or re-export translation."
- Import succeeds but text does not change.
- Rise import gets stuck in processing.
- XLIFF import fails after third-party translation tool output.
- XLIFF files are content-specific and can fail when course copy/edit state changes.
- Some Articulate-side issues are product bugs, not file-repair opportunities.

Representative public sources:

- https://www.articulatesupport.com/article/Rise-360-Manually-Translate-Your-Content
- https://www.articulatesupport.com/article/Storyline-360-Translating-Courses
- https://community.articulate.com/discussions/discuss/import-translated-xliff-in-duplicated-course-does-not-work/859120
- https://community.articulate.com/discussions/discuss/error-translating-a-rise-course/1246701
- https://community.articulate.com/discussions/discuss/getting-import-failed-check-formatting-or-re-export-translation-when-trying-to-i/963876
- https://community.articulate.com/discussions/discuss/xlif-translation-did-not-import-in-articulate-rise/1022973

## Mapping Public Pain To Current Tool Classes

| Public pain | Current tool fit | Current verdict |
| --- | --- | --- |
| Course/file mismatch after copying or editing a course | Compare original and translated XLIFF structure; detect changed/missing IDs, missing/extra units, namespace/version drift | Good diagnostic fit; safe repair only for narrow metadata cases |
| CAT tool changed trans-unit IDs | Detect and restore IDs when unit order still matches | Strong repair fit |
| Missing target segments | Detect missing target | Manual review, not safe repair |
| Protected inline tags changed or removed | Detect source/target tag count drift and protected inline rewrites | Manual review |
| File has wrong XLIFF version | Detect unsupported XLIFF version | Unsupported, not repair |
| Malformed XML or invalid entities | Detect parse/entity failures | Unsupported/manual external cleanup |
| Import succeeds but course text does not change | Possible missing target or source/target misuse | Partially covered; add detector backlog |
| Rise import stuck or 500 error from custom blocks / high content volume | May be Articulate-side product bug | Tool can rule out some file problems, not fix platform bugs |

## Detector Backlog From Public Threads

Highest-value additions before broader marketing:

1. Detect translated file where `target` is missing, empty, or identical to `source` across many units.
2. Detect target language/state metadata patterns that commonly come from CAT tools, without treating them as errors by default.
3. Detect course-copy mismatch symptoms more explicitly in wording, even if the file-level repair is not safe.
4. Add an "Articulate-side bug likely" diagnostic bucket when the file looks structurally clean but the public symptom matches known Rise bugs.
5. Add a human-readable diagnostic report template for translators/vendors.

## Trial Account Status

Articulate offers a 30-day trial without a credit card according to its pricing/trial pages:

- https://www.articulate.com/360/trial/
- https://www.articulate.com/360/pricing/

This pass did not create or use an Articulate account because that requires user-controlled signup details. The next computer proof with an account should:

1. Create a tiny Rise course.
2. Export XLIFF.
3. Make a duplicate/course-copy variant.
4. Run controlled broken translated files through Articulate import.
5. Record which CLI findings predict actual Articulate import failure.

## Validation Gate

Pass condition:

- At least 5 real or trial-generated import-failure files are tested.
- At least 1 real file reaches safe repaired export and re-import success.
- Unsupported/manual cases are clearly separated from repairable cases.
- No raw course content is stored in telemetry or public docs.

Kill or reshape condition:

- Most real files are Articulate-side bugs or course-state mismatches that the tool can only explain, not repair.
- Users still need human consulting after every preview.
- Paid export interest appears only for cases that are not safe to repair automatically.

## Marketing Thesis

Lead with the blocked import moment, not with XLIFF as a format.

Best first message:

> Check why your Articulate XLIFF will not import, and safely repair the small file-level issues that can be fixed without touching translated text.

Avoid:

- "Fix any XLIFF."
- "Guaranteed import recovery."
- "Articulate Localization replacement."
- "Mobile app for XLIFF."

