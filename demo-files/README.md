# Articulate XLIFF Demo Files

Synthetic demo files for the public Articulate XLIFF Import Doctor page.

These are not customer files and do not contain proprietary course text.

## Happy demo

Use:

- `demo-articulate-original.xlf`
- `demo-articulate-translated-safe-repair.xlf`

Expected result:

- safe repair available;
- changed `trans-unit` ID detected;
- non-UTF-8 XML declaration detected;
- repaired XLF download should normalize both issues.

## Manual-review demo

Use:

- `demo-articulate-original.xlf`
- `demo-articulate-translated-manual-review.xlf`

Expected result:

- manual review;
- protected inline tag drift detected;
- missing target detected;
- no repaired XLF claim.
