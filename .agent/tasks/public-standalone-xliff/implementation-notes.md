# Implementation Notes

- Copied only the portable core from `kikuai.dev/kikuai-site-nuxt/lib/articulate-xliff/`.
- Excluded the site presentation module because it imports KikuTools local event helpers.
- Added a zero-dependency Node CLI around the existing `analyze()` and `repair()` functions.
- Copied public demo files and the existing proof corpus so failures can be reproduced without the website.
- Kept positioning narrow: Articulate XLIFF import diagnosis and deterministic safe repair, not generic XLIFF repair.
