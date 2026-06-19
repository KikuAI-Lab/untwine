# License Decision Memo - 2026-06-18

## Context

Untwine is the current money-focus product for browser-local Articulate XLIFF import repair. The repository is currently `AGPL-3.0-only`.

The architecture is strongest when the deterministic repair core can be reused in CLI, browser, worker, or local wrapper contexts without adding a server dependency. The commercial question is whether paid repair/report packaging should rely on the AGPL public core, a dual license, or a service wrapper.

## Options

| Option | Effect | Risk |
| --- | --- | --- |
| Keep AGPL-only | Maximizes public source reciprocity and keeps the current repo simple. | Commercial embedding by third parties is harder; paid packaging may need careful boundary wording. |
| Dual-license the core | Keeps AGPL public proof while allowing approved commercial embedding or paid artifact packaging. | Requires Nick/KikuAI approval and clear license text before any commercial offer. |
| Keep AGPL core and sell service/report wrapper | Fastest to explain for assisted repair/report work without relicensing immediately. | Less clean if the product later becomes a reusable SDK or embedded workflow. |
| Re-license permissively | Increases adoption frictionlessly. | Weakens commercial control before demand proof. |

## Recommendation

Use AGPL-only for the current validation window, but prepare a dual-license path before any embedded paid SDK/API/local-runner offer.

The immediate paid boundary, if validated, should be a repair/report artifact or assisted diagnostic workflow. Do not promise a commercial SDK, hosted API, or partner embedding until the license path is explicitly approved.

## Approval Gate

Nick should choose one of these before P1 paid packaging work:

1. Keep AGPL-only for public tool validation.
2. Approve dual-license preparation.
3. Keep AGPL-only and restrict paid work to service/report artifacts.

Until that decision, do not change `package.json` license, public copy, or commercial terms.
