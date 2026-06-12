# Proof Corpus

This corpus is a product proof set for the Articulate XLIFF import-error MVP.

It is intentionally separate from unit-test fixtures. Unit fixtures prove small parser behavior. The proof corpus asks the product question: given original + translated XLF/XLIFF files, does the preview classify a realistic import-failure shape as clean, repairable, manual-review, unrepairable, or unsupported?

## Case Families

- valid Articulate-like XLIFF 1.2 pair;
- missing or changed `trans-unit` IDs;
- encoding declaration mismatch and UTF-8 BOM;
- missing `target`;
- protected inline tag count drift;
- CAT-tool `<mrk>` segmentation drift inside translated targets;
- protected inline tag rewrite with matching tag count;
- namespace/version drift;
- missing or extra `trans-unit` records;
- malformed XML;
- invalid XML entity;
- wrong XML wrapper;
- unsupported XLIFF 2.0 and 1.0;
- wrong file extension;
- combined safe-repair case.

## Known Gaps Not Yet Covered As Passing Product Claims

These are likely high-value cases from the SERP research, but they should not be promised until real files confirm the shape:

- Rise duplicate-course/template remap;
- Articulate course identifier mismatch;
- Storyline XLIFF 2.0 structural validation beyond clear unsupported messaging;
- split/merged translation segments.

The corpus now includes a synthetic `<mrk>`-wrapped target that the current analyzer can classify honestly as manual-review-only structure drift. What remains uncovered is any claim that `<mrk>` cleanup is safely repairable.

Add these as proof cases only when the analyzer can classify them honestly without pretending to repair translated text semantics.
