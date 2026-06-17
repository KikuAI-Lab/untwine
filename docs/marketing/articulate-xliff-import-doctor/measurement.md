# Measurement Plan

Date: 2026-06-12

The goal is to prove repairable-file and diagnostic value, not pageview vanity.

## Primary Events

Use bucketed, privacy-safe events only:

- `qualified_visit`
- `file_pair_selected`
- `preview_completed`
- `result_classified`
- `export_clicked`
- `paid_intent_clicked`
- `waitlist_submit`
- `repair_blocked`

Allowed buckets:

- `clean`
- `repairable`
- `manual_review`
- `unrepairable`
- `unsupported`
- issue category counts

Forbidden telemetry:

- raw XLIFF content
- file names
- course names
- customer names
- local paths
- source/target text
- uploaded file payloads
- free-form support text containing course data

## Seven-Day Proof Threshold

Minimum continuation signal:

- `30` qualified visits.
- `5` completed previews.
- `2` paid-intent or waitlist clicks.
- `1` real or trial-generated safely repairable file that re-imports after repair.

Kill or reshape:

- Fewer than `5` previews after `30` qualified visits.
- `0` paid/waitlist intent after `10` previews.
- Most previews are unsupported/manual-review cases.
- Users ask for manual consulting more often than self-serve repair/export.

## Trial-Generated Proof

Once an Articulate account is available:

1. Create a small Rise course.
2. Export XLIFF.
3. Create controlled broken translated files:
   - changed ID;
   - missing target;
   - protected inline tag change;
   - version drift;
   - target same as source.
4. Attempt Articulate import.
5. Run the doctor.
6. Compare Articulate import outcome with doctor verdict.
7. Record only sanitized result buckets.

## Weekly Readout Template

```text
Week:
Traffic source:
Qualified visits:
File-pair selections:
Previews:
Clean:
Repairable:
Manual review:
Unrepairable:
Unsupported:
Exports:
Paid-intent clicks:
Waitlist submits:
Real/trial re-import successes:
Manual-consulting asks:
Decision:
```

